import mongoose from "mongoose";
import FightVodLink from "../models/FightVodLink";
import Fight from "../models/Fight";
import Guild from "../models/Guild";
import type { IFight } from "../models/Fight";
import type { IBossProgress, IGuild, IRaidProgress } from "../models/Guild";
import type { IStreamer } from "../models/Streamer";
import twitchService, { TwitchVideoData } from "./twitch.service";
import logger from "../utils/logger";

const VOD_RETENTION_DAYS = 13;
const RESOLUTION_RETRY_MS = 30 * 60 * 1000;
const STREAM_END_TOLERANCE_MS = 30 * 60 * 1000;
const VOD_LINK_PREROLL_SECONDS = 10;
const HISTORICAL_MATCH_START_TOLERANCE_MS = 2 * 60 * 1000;
const HISTORICAL_MATCH_END_TOLERANCE_MS = 2 * 60 * 1000;
const HISTORICAL_VIDEO_LOOKUP_LIMIT = 100;

interface StreamSnapshot {
  channelName: string;
  twitchUserId: string;
  streamId: string;
  streamStartedAt: Date;
  streamEndedAt?: Date;
}

interface BackfillCandidate {
  guild: IGuild;
  raidProgress: IRaidProgress;
  boss: IBossProgress;
  fight: any;
}

interface HistoricalVodMatch {
  video: TwitchVideoData;
  streamStartedAt: Date;
  offsetSeconds: number;
  durationSeconds: number;
  confidence: number;
}

export interface FightVodBackfillResult {
  guildsChecked: number;
  streamersChecked: number;
  userIdsResolved: number;
  fightsConsidered: number;
  skippedExisting: number;
  matched: number;
  ambiguous: number;
  noVodMatch: number;
  expired: number;
  errors: number;
}

class FightVodService {
  private toDate(value: Date | string | undefined): Date | null {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  private getExpiresAt(streamStartedAt: Date): Date {
    return new Date(streamStartedAt.getTime() + VOD_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  }

  private getKnownStreamSnapshot(streamer: IStreamer, fightStartedAt: Date): StreamSnapshot | null {
    const channelName = streamer.channelName.toLowerCase();

    const currentStartedAt = this.toDate(streamer.streamStartedAt);
    if (streamer.isLive && streamer.currentStreamId && streamer.twitchUserId && currentStartedAt) {
      if (fightStartedAt.getTime() >= currentStartedAt.getTime() - STREAM_END_TOLERANCE_MS) {
        return {
          channelName,
          twitchUserId: streamer.twitchUserId,
          streamId: streamer.currentStreamId,
          streamStartedAt: currentStartedAt,
        };
      }
    }

    const lastStartedAt = this.toDate(streamer.lastStreamStartedAt);
    const lastEndedAt = this.toDate(streamer.lastStreamEndedAt);
    if (streamer.lastStreamId && streamer.twitchUserId && lastStartedAt && lastEndedAt) {
      const fightTime = fightStartedAt.getTime();
      if (fightTime >= lastStartedAt.getTime() - STREAM_END_TOLERANCE_MS && fightTime <= lastEndedAt.getTime() + STREAM_END_TOLERANCE_MS) {
        return {
          channelName,
          twitchUserId: streamer.twitchUserId,
          streamId: streamer.lastStreamId,
          streamStartedAt: lastStartedAt,
          streamEndedAt: lastEndedAt,
        };
      }
    }

    return null;
  }

  private getStreamSnapshots(guild: IGuild, fightStartedAt: Date): StreamSnapshot[] {
    if (!guild.streamers || guild.streamers.length === 0) return [];

    const now = Date.now();
    return guild.streamers
      .map((streamer) => this.getKnownStreamSnapshot(streamer, fightStartedAt))
      .filter((snapshot): snapshot is StreamSnapshot => Boolean(snapshot))
      .filter((snapshot) => this.getExpiresAt(snapshot.streamStartedAt).getTime() > now);
  }

  async enqueueForFights(guild: IGuild, raidProgress: IRaidProgress, boss: IBossProgress, fights: IFight[]): Promise<void> {
    if (!guild.streamers || guild.streamers.length === 0 || fights.length === 0) return;

    for (const fight of fights) {
      const snapshots = this.getStreamSnapshots(guild, fight.timestamp);
      if (snapshots.length === 0) continue;

      for (const snapshot of snapshots) {
        await FightVodLink.updateOne(
          {
            reportCode: fight.reportCode,
            fightId: fight.fightId,
            channelName: snapshot.channelName,
          },
          {
            $setOnInsert: {
              guildId: guild._id as mongoose.Types.ObjectId,
              raidId: raidProgress.raidId,
              bossId: boss.bossId,
              bossName: boss.bossName,
              difficulty: raidProgress.difficulty,
              reportCode: fight.reportCode,
              fightId: fight.fightId,
              fightStartedAt: fight.timestamp,
              channelName: snapshot.channelName,
              twitchUserId: snapshot.twitchUserId,
              streamId: snapshot.streamId,
              streamStartedAt: snapshot.streamStartedAt,
              status: "pending",
              attempts: 0,
              expiresAt: this.getExpiresAt(snapshot.streamStartedAt),
            },
          },
          { upsert: true },
        );
      }
    }
  }

  parseTwitchDuration(duration: string): number {
    const match = duration.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
    if (!match) return 0;

    const hours = parseInt(match[1] || "0", 10);
    const minutes = parseInt(match[2] || "0", 10);
    const seconds = parseInt(match[3] || "0", 10);
    return hours * 3600 + minutes * 60 + seconds;
  }

  private formatTwitchOffset(totalSeconds: number): string {
    const seconds = Math.max(0, Math.floor(totalSeconds));
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainder = seconds % 60;

    if (hours > 0) return `${hours}h${minutes}m${remainder}s`;
    if (minutes > 0) return `${minutes}m${remainder}s`;
    return `${remainder}s`;
  }

  buildTwitchVodUrl(videoId: string, offsetSeconds: number): string {
    const linkOffsetSeconds = Math.max(0, offsetSeconds - VOD_LINK_PREROLL_SECONDS);
    return `https://www.twitch.tv/videos/${videoId}?t=${this.formatTwitchOffset(linkOffsetSeconds)}`;
  }

  private findMatchingVideo(videos: TwitchVideoData[], streamId: string): TwitchVideoData | undefined {
    return videos.find((video) => video.stream_id === streamId);
  }

  private getDifficultyId(difficulty: "mythic" | "heroic"): number {
    return difficulty === "mythic" ? 5 : 4;
  }

  private getFightDate(fight: any): Date {
    return fight.timestamp instanceof Date ? fight.timestamp : new Date(fight.timestamp);
  }

  private getDuplicateKey(fight: any): string {
    const timestamp = this.getFightDate(fight).getTime();
    const roundedTimestamp = Math.round(timestamp / 1000);
    const roundedDuration = Math.round((fight.duration || 0) / 100);
    const bossPercentage = Number(fight.bossPercentage || 0).toFixed(1);
    const fightPercentage = Number(fight.isKill ? 0 : fight.fightPercentage || 0).toFixed(1);
    return `${roundedTimestamp}:${roundedDuration}:${bossPercentage}:${fightPercentage}:${fight.isKill ? 1 : 0}`;
  }

  private async getFirstKillTime(guildId: mongoose.Types.ObjectId, raidProgress: IRaidProgress, boss: IBossProgress): Promise<Date | null> {
    const cachedFirstKillTime = this.toDate(boss.firstKillTime);
    if (cachedFirstKillTime) return cachedFirstKillTime;
    if (!boss.kills || boss.kills <= 0) return null;

    const firstKill = await Fight.findOne({
      guildId,
      zoneId: raidProgress.raidId,
      encounterID: boss.bossId,
      difficulty: this.getDifficultyId(raidProgress.difficulty),
      isKill: true,
    })
      .select("timestamp")
      .sort({ timestamp: 1 })
      .lean();

    return firstKill?.timestamp ? this.toDate(firstKill.timestamp) : null;
  }

  private async getRecentBestPullFights(guildId: mongoose.Types.ObjectId, raidProgress: IRaidProgress, boss: IBossProgress, cutoff: Date): Promise<any[]> {
    const firstKillTime = await this.getFirstKillTime(guildId, raidProgress, boss);
    if (firstKillTime && firstKillTime.getTime() < cutoff.getTime()) {
      return [];
    }

    const timestampQuery: Record<string, Date> = { $gte: cutoff };
    if (firstKillTime) {
      timestampQuery.$lte = firstKillTime;
    }

    const candidateLimit = Math.max(25, Math.min((boss.pullCount || 25) * 2, 250));
    const candidates = await Fight.find({
      guildId,
      zoneId: raidProgress.raidId,
      encounterID: boss.bossId,
      difficulty: this.getDifficultyId(raidProgress.difficulty),
      timestamp: timestampQuery,
    })
      .select("reportCode fightId timestamp duration bossPercentage fightPercentage isKill")
      .sort({ fightPercentage: 1, timestamp: -1 })
      .limit(candidateLimit)
      .lean();

    const seen = new Set<string>();
    const bestFights: any[] = [];

    for (const fight of candidates) {
      const duplicateKey = this.getDuplicateKey(fight);
      if (seen.has(duplicateKey)) continue;
      seen.add(duplicateKey);
      bestFights.push(fight);
      if (bestFights.length === 5) break;
    }

    return bestFights;
  }

  private findHistoricalVideoMatch(videos: TwitchVideoData[], fight: any): HistoricalVodMatch | "ambiguous" | null {
    const fightStartedAt = this.getFightDate(fight);
    if (Number.isNaN(fightStartedAt.getTime())) return null;

    const fightStartMs = fightStartedAt.getTime();
    const fightDurationMs = Math.max(0, fight.duration || 0);
    const fightEndMs = fightStartMs + fightDurationMs;
    const matches: HistoricalVodMatch[] = [];

    for (const video of videos) {
      if (video.type !== "archive") continue;

      const streamStartedAt = this.toDate(video.created_at);
      const durationSeconds = this.parseTwitchDuration(video.duration);
      if (!streamStartedAt || durationSeconds <= 0) continue;

      const streamStartMs = streamStartedAt.getTime();
      const streamEndMs = streamStartMs + durationSeconds * 1000;

      if (fightStartMs < streamStartMs - HISTORICAL_MATCH_START_TOLERANCE_MS) continue;
      if (fightEndMs > streamEndMs + HISTORICAL_MATCH_END_TOLERANCE_MS) continue;

      const rawOffsetSeconds = Math.floor((fightStartMs - streamStartMs) / 1000);
      const isInsideVodWindow = fightStartMs >= streamStartMs && fightEndMs <= streamEndMs;

      matches.push({
        video,
        streamStartedAt,
        offsetSeconds: Math.max(0, rawOffsetSeconds),
        durationSeconds,
        confidence: isInsideVodWindow ? 0.85 : 0.65,
      });
    }

    if (matches.length === 0) return null;
    if (matches.length > 1) return "ambiguous";
    return matches[0];
  }

  private async getBackfillCandidates(guild: IGuild, cutoff: Date): Promise<BackfillCandidate[]> {
    const candidates: BackfillCandidate[] = [];

    for (const raidProgress of guild.progress || []) {
      if (raidProgress.difficulty !== "mythic" && raidProgress.difficulty !== "heroic") continue;

      for (const boss of raidProgress.bosses || []) {
        const fights = await this.getRecentBestPullFights(guild._id as mongoose.Types.ObjectId, raidProgress, boss, cutoff);
        fights.forEach((fight) => {
          candidates.push({ guild, raidProgress, boss, fight });
        });
      }
    }

    return candidates;
  }

  async backfillRecentBestPullLinks(): Promise<FightVodBackfillResult> {
    const result: FightVodBackfillResult = {
      guildsChecked: 0,
      streamersChecked: 0,
      userIdsResolved: 0,
      fightsConsidered: 0,
      skippedExisting: 0,
      matched: 0,
      ambiguous: 0,
      noVodMatch: 0,
      expired: 0,
      errors: 0,
    };

    if (!twitchService.isEnabled()) {
      return result;
    }

    const now = new Date();
    const cutoff = new Date(now.getTime() - VOD_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const guilds = await Guild.find({
      streamers: { $exists: true, $ne: [] },
      progress: { $exists: true, $ne: [] },
    }).select("name realm streamers progress");

    result.guildsChecked = guilds.length;

    const allLogins = new Set<string>();
    guilds.forEach((guild) => {
      guild.streamers?.forEach((streamer) => {
        const login = streamer.channelName.trim().toLowerCase();
        if (login) allLogins.add(login);
      });
    });

    const usersByLogin = await twitchService.getUsersByLogins(Array.from(allLogins));
    result.userIdsResolved = usersByLogin.size;

    const videosByUser = new Map<string, TwitchVideoData[]>();
    const userIdsChecked = new Set<string>();

    const getVideosForUser = async (twitchUserId: string): Promise<TwitchVideoData[]> => {
      if (!videosByUser.has(twitchUserId)) {
        try {
          const videos = await twitchService.getRecentArchiveVideos(twitchUserId, HISTORICAL_VIDEO_LOOKUP_LIMIT);
          videosByUser.set(
            twitchUserId,
            videos.filter((video) => {
              const createdAt = this.toDate(video.created_at);
              return Boolean(createdAt && this.getExpiresAt(createdAt).getTime() > now.getTime());
            }),
          );
        } catch (error) {
          result.errors += 1;
          logger.warn(`[Fight VOD Backfill] Failed to fetch videos for Twitch user ${twitchUserId}: ${error instanceof Error ? error.message : String(error)}`);
          videosByUser.set(twitchUserId, []);
        }
      }

      return videosByUser.get(twitchUserId) || [];
    };

    for (const guild of guilds) {
      const streamers = (guild.streamers || [])
        .map((streamer) => {
          const channelName = streamer.channelName.trim().toLowerCase();
          const twitchUserId = streamer.twitchUserId || usersByLogin.get(channelName)?.id;
          return twitchUserId ? { channelName, twitchUserId } : null;
        })
        .filter((streamer): streamer is { channelName: string; twitchUserId: string } => Boolean(streamer));

      if (streamers.length === 0) continue;
      streamers.forEach((streamer) => userIdsChecked.add(streamer.twitchUserId));

      const candidates = await this.getBackfillCandidates(guild, cutoff);

      for (const candidate of candidates) {
        const fightStartedAt = this.getFightDate(candidate.fight);
        if (Number.isNaN(fightStartedAt.getTime())) continue;

        const existingLinks = await FightVodLink.find({
          reportCode: candidate.fight.reportCode,
          fightId: candidate.fight.fightId,
          channelName: { $in: streamers.map((streamer) => streamer.channelName) },
        })
          .select("channelName -_id")
          .lean();
        const existingChannels = new Set(existingLinks.map((link) => link.channelName));

        for (const streamer of streamers) {
          result.fightsConsidered += 1;

          if (existingChannels.has(streamer.channelName)) {
            result.skippedExisting += 1;
            continue;
          }

          const videos = await getVideosForUser(streamer.twitchUserId);
          const match = this.findHistoricalVideoMatch(videos, candidate.fight);

          if (match === "ambiguous") {
            result.ambiguous += 1;
            continue;
          }

          if (!match) {
            result.noVodMatch += 1;
            continue;
          }

          const expiresAt = this.getExpiresAt(match.streamStartedAt);
          if (expiresAt.getTime() <= now.getTime()) {
            result.expired += 1;
            continue;
          }

          const writeResult = await FightVodLink.updateOne(
            {
              reportCode: candidate.fight.reportCode,
              fightId: candidate.fight.fightId,
              channelName: streamer.channelName,
            },
            {
              $setOnInsert: {
                guildId: candidate.guild._id as mongoose.Types.ObjectId,
                raidId: candidate.raidProgress.raidId,
                bossId: candidate.boss.bossId,
                bossName: candidate.boss.bossName,
                difficulty: candidate.raidProgress.difficulty,
                reportCode: candidate.fight.reportCode,
                fightId: candidate.fight.fightId,
                fightStartedAt,
                channelName: streamer.channelName,
                twitchUserId: streamer.twitchUserId,
                streamId: match.video.stream_id || `video:${match.video.id}`,
                streamStartedAt: match.streamStartedAt,
                videoId: match.video.id,
                vodUrl: this.buildTwitchVodUrl(match.video.id, match.offsetSeconds),
                offsetSeconds: match.offsetSeconds,
                status: "resolved",
                matchMethod: "vod-window",
                matchConfidence: match.confidence,
                videoCreatedAt: match.streamStartedAt,
                videoDurationSeconds: match.durationSeconds,
                backfilledAt: now,
                attempts: 1,
                lastCheckedAt: now,
                expiresAt,
              },
            },
            { upsert: true },
          );

          if (writeResult.upsertedCount && writeResult.upsertedCount > 0) {
            result.matched += 1;
          } else {
            result.skippedExisting += 1;
          }
        }
      }
    }

    result.streamersChecked = userIdsChecked.size;
    return result;
  }

  async resolvePendingLinks(limit: number = 100): Promise<{ checked: number; resolved: number; unavailable: number }> {
    if (!twitchService.isEnabled()) {
      return { checked: 0, resolved: 0, unavailable: 0 };
    }

    const now = new Date();
    const retryBefore = new Date(now.getTime() - RESOLUTION_RETRY_MS);
    const pendingLinks = await FightVodLink.find({
      status: "pending",
      expiresAt: { $gt: now },
      $or: [{ lastCheckedAt: { $exists: false } }, { lastCheckedAt: { $lte: retryBefore } }],
    })
      .sort({ createdAt: 1 })
      .limit(limit);

    if (pendingLinks.length === 0) {
      return { checked: 0, resolved: 0, unavailable: 0 };
    }

    const videosByUser = new Map<string, TwitchVideoData[]>();
    let resolved = 0;
    let unavailable = 0;

    for (const link of pendingLinks) {
      try {
        if (!videosByUser.has(link.twitchUserId)) {
          videosByUser.set(link.twitchUserId, await twitchService.getRecentArchiveVideos(link.twitchUserId, 10));
        }

        const videos = videosByUser.get(link.twitchUserId) || [];
        const video = this.findMatchingVideo(videos, link.streamId);

        link.attempts += 1;
        link.lastCheckedAt = now;

        if (!video) {
          await link.save();
          continue;
        }

        const offsetSeconds = Math.max(0, Math.floor((link.fightStartedAt.getTime() - link.streamStartedAt.getTime()) / 1000));
        const durationSeconds = this.parseTwitchDuration(video.duration);

        if (durationSeconds > 0 && offsetSeconds > durationSeconds + 60) {
          link.status = link.attempts >= 4 ? "unavailable" : "pending";
          if (link.status === "unavailable") unavailable += 1;
          await link.save();
          continue;
        }

        link.videoId = video.id;
        link.offsetSeconds = offsetSeconds;
        link.vodUrl = this.buildTwitchVodUrl(video.id, offsetSeconds);
        link.status = "resolved";
        link.matchMethod = "stream-id";
        link.matchConfidence = 1;
        link.videoCreatedAt = this.toDate(video.created_at) || undefined;
        link.videoDurationSeconds = durationSeconds || undefined;
        await link.save();
        resolved += 1;
      } catch (error) {
        logger.warn(`[Fight VOD] Failed to resolve ${link.channelName} VOD for ${link.reportCode}#${link.fightId}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    return { checked: pendingLinks.length, resolved, unavailable };
  }

  async cleanupExpiredLinks(): Promise<number> {
    const result = await FightVodLink.deleteMany({ expiresAt: { $lte: new Date() } });
    return result.deletedCount || 0;
  }
}

export default new FightVodService();
