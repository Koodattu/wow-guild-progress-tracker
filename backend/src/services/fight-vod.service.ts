import mongoose from "mongoose";
import FightVodLink from "../models/FightVodLink";
import type { IFight } from "../models/Fight";
import type { IBossProgress, IGuild, IRaidProgress } from "../models/Guild";
import type { IStreamer } from "../models/Streamer";
import twitchService, { TwitchVideoData } from "./twitch.service";
import logger from "../utils/logger";

const VOD_RETENTION_DAYS = 13;
const RESOLUTION_RETRY_MS = 30 * 60 * 1000;
const STREAM_END_TOLERANCE_MS = 30 * 60 * 1000;

interface StreamSnapshot {
  channelName: string;
  twitchUserId: string;
  streamId: string;
  streamStartedAt: Date;
  streamEndedAt?: Date;
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

  private findMatchingVideo(videos: TwitchVideoData[], streamId: string): TwitchVideoData | undefined {
    return videos.find((video) => video.stream_id === streamId);
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
        link.vodUrl = `${video.url}?t=${this.formatTwitchOffset(offsetSeconds)}`;
        link.status = "resolved";
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
