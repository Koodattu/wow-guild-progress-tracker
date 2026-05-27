"use client";

import { useEffect, useMemo, useState } from "react";
import GuildCrest from "@/components/GuildCrest";
import { formatPercent, formatPhaseDisplay } from "@/lib/utils";
import { useHorseRaceMode, HorseRaceMode } from "@/lib/horse-race-preferences";
import { GuildCrest as GuildCrestType, GuildListItem, RaidProgressSummary } from "@/types";

interface HorseRaceProps {
  guilds: GuildListItem[];
  selectedRaidId: number | null;
  currentRaidId: number | null;
}

interface RaceEntry {
  id: string;
  name: string;
  realm: string;
  faction?: string;
  crest?: GuildCrestType;
  progress: RaidProgressSummary;
  bossHealth: number;
  trackProgress: number;
  displayProgress: number;
  labelPosition: "above" | "below";
  isFinished: boolean;
}

type BaseRaceEntry = Omit<RaceEntry, "displayProgress" | "labelPosition">;

const TRACK_MIN = 3;
const TRACK_MAX = 97;
const CLUSTER_THRESHOLD = 1.25;
const LABEL_COLLISION_THRESHOLD = 8;
const FINISHED_SLOT_WIDTH = 58;
const START_WIDTH = 34;
const MIN_TRACK_WIDTH = 680;
const HORIZONTAL_STACK_SPACING = 2.0;
const HORSE_RACER_SRC = "/horse/racer.png";
const UMA_IMAGES = [
  "daiwa scarlet.png",
  "el condor pasa.png",
  "gold ship.png",
  "grass wonder.png",
  "haru urara.png",
  "manhattan cafe.png",
  "mejiro mcqueen.png",
  "mihono bourbon.png",
  "oguri cap.png",
  "rice shower.png",
  "seiun sky.png",
  "silence suzuka.png",
  "smart falcon.png",
  "special week.png",
  "super creek.png",
  "tokai teio.png",
  "winning ticket.png",
] as const;
const tintedRacerCache = new Map<string, string>();
let racerImagePromise: Promise<HTMLImageElement> | null = null;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function getMythicProgress(guild: GuildListItem, selectedRaidId: number): RaidProgressSummary | undefined {
  return guild.progress.find((progress) => progress.raidId === selectedRaidId && progress.difficulty === "mythic");
}

function getBossHealth(progress: RaidProgressSummary, isFinished: boolean) {
  if (isFinished) return 0;
  if (progress.currentBossPulls <= 0) return 100;
  return clamp(progress.bestPullPercent, 0, 100);
}

function compareRaceOrder(a: BaseRaceEntry, b: BaseRaceEntry) {
  if (a.isFinished && b.isFinished) {
    const aTime = a.progress.lastKillTime ? new Date(a.progress.lastKillTime).getTime() : Number.MAX_SAFE_INTEGER;
    const bTime = b.progress.lastKillTime ? new Date(b.progress.lastKillTime).getTime() : Number.MAX_SAFE_INTEGER;
    if (aTime !== bTime) return aTime - bTime;
  }

  if (a.trackProgress !== b.trackProgress) return b.trackProgress - a.trackProgress;
  return (a.progress.guildRank ?? 99999) - (b.progress.guildRank ?? 99999);
}

function compareFightPosition(a: BaseRaceEntry, b: BaseRaceEntry) {
  if (a.bossHealth !== b.bossHealth) return a.bossHealth - b.bossHealth;
  if (a.trackProgress !== b.trackProgress) return b.trackProgress - a.trackProgress;
  return (a.progress.guildRank ?? 99999) - (b.progress.guildRank ?? 99999);
}

function assignLabelPositions(entries: RaceEntry[]): RaceEntry[] {
  const sortedEntries = [...entries].sort((a, b) => a.displayProgress - b.displayProgress);
  const positionedEntries: RaceEntry[] = [];

  for (let index = 0; index < sortedEntries.length; ) {
    const group = [sortedEntries[index]];
    let nextIndex = index + 1;

    while (nextIndex < sortedEntries.length && sortedEntries[nextIndex].displayProgress - group[group.length - 1].displayProgress <= LABEL_COLLISION_THRESHOLD) {
      group.push(sortedEntries[nextIndex]);
      nextIndex += 1;
    }

    group.forEach((entry, groupIndex) => {
      positionedEntries.push({
        ...entry,
        labelPosition: group.length > 1 && groupIndex % 2 === 1 ? "above" : "below",
      });
    });

    index = nextIndex;
  }

  return positionedEntries.sort((a, b) => a.displayProgress - b.displayProgress);
}

function buildEntries(guilds: GuildListItem[], selectedRaidId: number) {
  const entries = guilds.reduce<BaseRaceEntry[]>((result, guild) => {
    const progress = getMythicProgress(guild, selectedRaidId);
    if (!progress || progress.totalBosses <= 0 || progress.bossesDefeated < progress.totalBosses - 1) return result;

    const isFinished = progress.bossesDefeated >= progress.totalBosses;
    const bossHealth = getBossHealth(progress, isFinished);

    result.push({
      id: guild._id,
      name: guild.name,
      realm: guild.realm,
      faction: guild.faction,
      crest: guild.crest,
      progress,
      bossHealth,
      trackProgress: 100 - bossHealth,
      isFinished,
    });

    return result;
  }, []);

  const sortedEntries = entries.sort(compareRaceOrder);
  const notStarted = sortedEntries.filter((entry) => !entry.isFinished && entry.progress.currentBossPulls <= 0);
  const unfinished = sortedEntries.filter((entry) => !entry.isFinished && entry.progress.currentBossPulls > 0);
  const finished = sortedEntries.filter((entry) => entry.isFinished);

  const positionedUnfinished: RaceEntry[] = [];
  let maxStackDepth = 1;
  for (let index = 0; index < unfinished.length; ) {
    const cluster = [unfinished[index]];
    let nextIndex = index + 1;

    while (nextIndex < unfinished.length && Math.abs(unfinished[nextIndex].trackProgress - cluster[cluster.length - 1].trackProgress) <= CLUSTER_THRESHOLD) {
      cluster.push(unfinished[nextIndex]);
      nextIndex += 1;
    }

    maxStackDepth = Math.max(maxStackDepth, cluster.length);

    const orderedCluster = cluster.sort(compareFightPosition);

    orderedCluster.forEach((entry, clusterIndex) => {
      const spread = orderedCluster.length > 1 ? ((orderedCluster.length - 1) / 2 - clusterIndex) * HORIZONTAL_STACK_SPACING : 0;
      positionedUnfinished.push({
        ...entry,
        displayProgress: clamp(entry.trackProgress + spread, TRACK_MIN, TRACK_MAX),
        labelPosition: "below",
      });
    });

    index = nextIndex;
  }

  const positionedFinished = finished.map((entry, index) => ({
    ...entry,
    displayProgress: 100,
    labelPosition: "below" as const,
    finishOrder: index,
  }));

  return {
    notStarted: notStarted.map((entry) => ({
      ...entry,
      displayProgress: 0,
      labelPosition: "below" as const,
    })),
    unfinished: assignLabelPositions(positionedUnfinished),
    finished: positionedFinished,
    maxStackDepth,
  };
}

function colorFromCrest(crest?: GuildCrestType, fallback = "84 168 247") {
  const color = crest?.background?.color ?? crest?.emblem?.color;
  if (!color) return fallback;
  return `${Math.round(color.r)} ${Math.round(color.g)} ${Math.round(color.b)}`;
}

function colorObjectFromCrest(crest?: GuildCrestType) {
  return crest?.background?.color ?? crest?.emblem?.color ?? { r: 84, g: 168, b: 247 };
}

function getRacerImage() {
  if (racerImagePromise) return racerImagePromise;

  racerImagePromise = new Promise((resolve, reject) => {
    const image = new Image();
    image.src = HORSE_RACER_SRC;
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Failed to load horse racer image"));
  });

  return racerImagePromise;
}

function isImageBackground(r: number, g: number, b: number) {
  return r > 238 && g > 238 && b > 238;
}

function isPurplePixel(r: number, g: number, b: number) {
  return b > 70 && r > 45 && b >= g * 1.25 && r >= g * 1.15 && Math.abs(r - b) < 95;
}

function mixChannel(source: number, target: number) {
  const shade = clamp(source / 180, 0.25, 1.3);
  return clamp(Math.round(target * shade), 0, 255);
}

function TintedHorseRacer({ crest }: { crest?: GuildCrestType }) {
  const color = colorObjectFromCrest(crest);
  const cacheKey = `shirt-${Math.round(color.r)}-${Math.round(color.g)}-${Math.round(color.b)}`;
  const [src, setSrc] = useState(() => tintedRacerCache.get(cacheKey) ?? HORSE_RACER_SRC);

  useEffect(() => {
    const cached = tintedRacerCache.get(cacheKey);
    if (cached) {
      setSrc(cached);
      return;
    }

    let isMounted = true;

    getRacerImage()
      .then((image) => {
        const canvas = document.createElement("canvas");
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;

        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) return;

        ctx.drawImage(image, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;

        for (let index = 0; index < data.length; index += 4) {
          const r = data[index];
          const g = data[index + 1];
          const b = data[index + 2];
          const alpha = data[index + 3];

          if (alpha === 0) continue;

          if (isImageBackground(r, g, b)) {
            data[index + 3] = 0;
            continue;
          }

          if (isPurplePixel(r, g, b)) {
            data[index] = mixChannel(r, color.r);
            data[index + 1] = mixChannel(r, color.g);
            data[index + 2] = mixChannel(r, color.b);
          }
        }

        ctx.putImageData(imageData, 0, 0);
        const tintedSrc = canvas.toDataURL("image/png");
        tintedRacerCache.set(cacheKey, tintedSrc);

        if (isMounted) {
          setSrc(tintedSrc);
        }
      })
      .catch(() => {
        if (isMounted) setSrc(HORSE_RACER_SRC);
      });

    return () => {
      isMounted = false;
    };
  }, [cacheKey, color.b, color.g, color.r]);

  return <img src={src} alt="" className="h-10 w-10 object-contain" aria-hidden="true" />;
}

function RacerSprite({ entry, mode, umaImage }: { entry: RaceEntry; mode: HorseRaceMode; umaImage: string }) {
  if (mode === "crest") {
    return (
      <div className="h-8 w-8 shrink-0">
        <GuildCrest crest={entry.crest} faction={entry.faction} size={128} className="scale-[0.25] origin-top-left" drawFactionCircle={false} />
      </div>
    );
  }

  if (mode === "japanese") {
    return (
      <div className="h-10 w-10 shrink-0">
        <TintedHorseRacer crest={entry.crest} />
      </div>
    );
  }

  if (mode === "uma") {
    return (
      <div className="h-12 w-12 shrink-0" aria-hidden="true">
        <img src={`/uma/${umaImage}`} alt="" className="h-12 w-12 object-contain" />
      </div>
    );
  }

  return null;
}

function getProgressLabel(entry: RaceEntry) {
  if (entry.isFinished) return "0%";
  return entry.progress.bestPullPhase?.displayString ? formatPhaseDisplay(entry.progress.bestPullPhase.displayString) : formatPercent(entry.bossHealth);
}

function RaceLabel({ entry, className = "w-24" }: { entry: RaceEntry; className?: string }) {
  return (
    <div className={`${className} px-1 text-center text-[10px] font-semibold leading-[11px] text-gray-100 drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)]`}>
      <div
        className="wrap-break-word"
        style={{
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
        }}
      >
        {entry.name}
      </div>
      <div className="text-[9px] font-medium text-amber-100">{getProgressLabel(entry)}</div>
    </div>
  );
}

function ChuteGuildName({ entry, className }: { entry: RaceEntry; className: string }) {
  return (
    <div
      className={`wrap-break-word text-[10px] font-semibold leading-[11px] ${className}`}
      style={{
        display: "-webkit-box",
        WebkitLineClamp: 2,
        WebkitBoxOrient: "vertical",
        overflow: "hidden",
      }}
    >
      {entry.name}
    </div>
  );
}

function shuffleUmaImages() {
  const images = [...UMA_IMAGES];
  for (let index = images.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [images[index], images[swapIndex]] = [images[swapIndex], images[index]];
  }
  return images;
}

export default function HorseRace({ guilds, selectedRaidId, currentRaidId }: HorseRaceProps) {
  const { mode } = useHorseRaceMode();
  const [umaDeck, setUmaDeck] = useState(() => shuffleUmaImages());

  useEffect(() => {
    if (mode === "uma") {
      setUmaDeck(shuffleUmaImages());
    }
  }, [mode]);

  const race = useMemo(() => {
    if (!selectedRaidId || selectedRaidId !== currentRaidId) return { notStarted: [], unfinished: [], finished: [], maxStackDepth: 1 };
    return buildEntries(guilds, selectedRaidId);
  }, [currentRaidId, guilds, selectedRaidId]);

  const entryCount = race.notStarted.length + race.unfinished.length + race.finished.length;

  if (mode === "off" || entryCount === 0) return null;

  const startWidth = Math.max(START_WIDTH, 28 + race.notStarted.length * FINISHED_SLOT_WIDTH);
  const finishWidth = Math.max(92, 28 + race.finished.length * FINISHED_SLOT_WIDTH);
  const minWidth = startWidth + MIN_TRACK_WIDTH + finishWidth;
  const raceHeight = 112;
  const trackTop = Math.floor(raceHeight / 2) - 10;
  const markerTop = trackTop - 16;
  const labelAboveTop = trackTop - 44;
  const labelBelowTop = trackTop + 25;
  const getUmaImage = (index: number) => umaDeck[index % umaDeck.length];

  return (
    <section className="relative px-3 md:px-4 mb-2" aria-label="Final boss race">
      <div className="pointer-events-none absolute left-2 top-[-10%] z-0 flex -translate-y-1/2 items-center gap-1" aria-hidden="true">
        <img src="/yolobolt.png" alt="" className="h-[118px] w-auto object-contain opacity-95" />
        <div className="-ml-6 mt-2 text-[11px] font-semibold leading-3 text-purple-200 drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)]">Yolobolt&apos;s Horses</div>
      </div>
      <div className="pointer-events-none absolute right-2 top-[-10%] z-0 flex -translate-y-1/2 items-center gap-1" aria-hidden="true">
        <div className="-mr-7 mt-2 text-[11px] font-semibold leading-3 z-20 text-cyan-200 drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)]">LakuClap Lovewatching</div>
        <img src="/lakuclap.png" alt="" className="h-40 w-auto object-contain opacity-95 z-10" />
      </div>
      <div className="relative z-10 w-full overflow-x-auto">
        <div
          className="grid overflow-hidden rounded-md border border-emerald-800/60 bg-[#20301f]/75"
          style={{ gridTemplateColumns: `${startWidth}px minmax(${MIN_TRACK_WIDTH}px, 1fr) ${finishWidth}px`, minWidth: `${minWidth}px`, height: `${raceHeight}px` }}
        >
          <div className="relative bg-emerald-950/15">
            {race.notStarted.length > 0 && (
              <div
                className="absolute left-2 right-0 h-5 rounded-l-full border-y border-l border-amber-700/70 bg-[#6f4526] shadow-inner shadow-black/50"
                style={{ top: `${trackTop}px` }}
              >
                <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-amber-200/35" />
              </div>
            )}
            <div
              className="absolute right-0 z-30 flex w-5 items-center justify-center rounded-sm border border-emerald-300/50 bg-black/70 text-[8px] font-bold uppercase tracking-wide text-emerald-100 shadow shadow-black/40"
              style={{ top: `${trackTop - 25}px`, height: "70px", writingMode: "vertical-rl", textOrientation: "mixed" }}
              aria-hidden="true"
            >
              Start
            </div>

            {race.notStarted.map((entry, index) => (
              <div
                key={entry.id}
                className="absolute flex w-[63px] flex-col items-center"
                style={{ right: `${26 + index * FINISHED_SLOT_WIDTH}px`, top: `${markerTop}px`, zIndex: 30 + index }}
                title={`${entry.name}-${entry.realm}: 0 pulls`}
              >
                <div className="drop-shadow-[0_2px_5px_rgba(0,0,0,0.7)]">
                  <RacerSprite entry={entry} mode={mode} umaImage={getUmaImage(index)} />
                </div>
                <div className="mt-0.5 max-w-[63px] px-1 text-center text-gray-100 drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)]">
                  <ChuteGuildName entry={entry} className="text-gray-100" />
                </div>
              </div>
            ))}
          </div>

          <div className="relative">
            <div className="absolute inset-x-0 h-5 rounded-l-full border-y border-l border-amber-700/70 bg-[#6f4526] shadow-inner shadow-black/50" style={{ top: `${trackTop}px` }}>
              <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-amber-200/35" />
            </div>

            {race.unfinished.map((entry, index) => (
              <div key={entry.id}>
                <div
                  className="absolute flex w-[72px] -translate-x-1/2 justify-center"
                  style={{ left: `${entry.displayProgress}%`, top: `${markerTop}px`, zIndex: 20 + index }}
                  title={`${entry.name}-${entry.realm}: ${getProgressLabel(entry)}`}
                >
                  <div className="drop-shadow-[0_2px_5px_rgba(0,0,0,0.7)]">
                    <RacerSprite entry={entry} mode={mode} umaImage={getUmaImage(race.notStarted.length + index)} />
                  </div>
                </div>
                <div
                  className="absolute flex w-24 -translate-x-1/2 justify-center"
                  style={{ left: `${entry.displayProgress}%`, top: `${entry.labelPosition === "above" ? labelAboveTop : labelBelowTop}px`, zIndex: 40 + index }}
                >
                  <RaceLabel entry={entry} />
                </div>
              </div>
            ))}
          </div>

          <div className="relative bg-yellow-950/15">
            <div
              className="absolute left-[-7] z-50 flex w-5 items-center justify-center rounded-sm border border-yellow-100/60 bg-black/80 text-[8px] font-bold uppercase tracking-wide text-yellow-100 shadow shadow-black/50"
              style={{ top: `${trackTop - 27}px`, height: "74px", writingMode: "vertical-rl", textOrientation: "mixed" }}
              aria-hidden="true"
            >
              Finish
            </div>
            <div
              className="absolute left-0 right-2 h-5 rounded-r-full border-y border-r border-amber-700/70 bg-[#6f4526] shadow-inner shadow-black/50"
              style={{ top: `${trackTop}px` }}
            >
              <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-amber-200/35" />
            </div>

            {race.finished.map((entry, index) => (
              <div
                key={entry.id}
                className="absolute flex w-[66px] flex-col items-center"
                style={{ right: `${10 + index * FINISHED_SLOT_WIDTH}px`, top: `${markerTop}px`, zIndex: 30 + index }}
                title={`${index + 1}. ${entry.name}-${entry.realm}: finished`}
              >
                <div className="drop-shadow-[0_2px_5px_rgba(0,0,0,0.7)]">
                  <RacerSprite entry={entry} mode={mode} umaImage={getUmaImage(race.notStarted.length + race.unfinished.length + index)} />
                </div>
                <div className="mt-0.5 max-w-[66px] px-1 text-center text-[10px] font-semibold leading-1.5 text-gray-100 drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)]">
                  <div>#{index + 1}</div>
                  <ChuteGuildName entry={entry} className="text-amber-100" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
