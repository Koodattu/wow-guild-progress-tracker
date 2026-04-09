"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { LiveStreamer } from "@/types";
import { useLiveStreamers } from "@/lib/queries";
import { getTwitchThumbnailUrl, formatPhaseDisplay, formatPercent } from "@/lib/utils";

const MAX_FEATURED = 5;

export default function FeaturedStreamers() {
  const { data: liveStreamers } = useLiveStreamers();
  const router = useRouter();

  // Pick up to 5 random WoW-playing streamers
  const featured = useMemo(() => {
    if (!liveStreamers) return [];
    const wowStreamers = liveStreamers.filter((s) => s.isPlayingWoW);
    if (wowStreamers.length <= MAX_FEATURED) return wowStreamers;

    // Fisher-Yates shuffle, pick first MAX_FEATURED
    const shuffled = [...wowStreamers];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled.slice(0, MAX_FEATURED);
  }, [liveStreamers]);

  if (featured.length === 0) return null;

  const handleClick = (streamer: LiveStreamer) => {
    router.push(`/livestreams?streams=${streamer.channelName}`);
  };

  return (
    <div className="px-3 md:px-4 mb-3">
      <div className="flex justify-center gap-2 md:gap-3 overflow-x-auto pb-1 scrollbar-hide">
        {featured.map((streamer) => (
          <button
            key={`${streamer.guild.name}-${streamer.guild.realm}-${streamer.channelName}`}
            onClick={() => handleClick(streamer)}
            className="relative shrink-0 w-[200px] md:w-60 aspect-video rounded-lg overflow-hidden group cursor-pointer border border-gray-700/50 hover:border-purple-500/60 transition-all hover:scale-[1.02]"
          >
            {/* Thumbnail */}
            <img
              src={getTwitchThumbnailUrl(streamer.channelName, 440, 248)}
              alt={`${streamer.channelName} stream`}
              className="absolute inset-0 w-full h-full object-cover"
              loading="lazy"
            />

            {/* Gradient overlays for text readability */}
            <div className="absolute inset-0 bg-linear-to-t from-black/80 via-transparent to-black/40" />

            {/* Top-left: LIVE badge */}
            <div className="absolute top-1.5 left-1.5 flex items-center gap-1 bg-red-600/90 px-1.5 py-0.5 rounded text-[10px] font-bold text-white uppercase tracking-wide">
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
              Live
            </div>

            {/* Top-right: Boss progress (percentage/phase only) */}
            {streamer.bestPull && (
              <div className="absolute top-1.5 right-1.5 bg-black/70 px-1.5 py-0.5 rounded text-[10px] font-bold text-orange-400 max-w-[60%] truncate">
                {streamer.bestPull.bestPullPhase?.displayString ? formatPhaseDisplay(streamer.bestPull.bestPullPhase.displayString) : formatPercent(streamer.bestPull.bestPercent)}
              </div>
            )}

            {/* Bottom-left: Twitch channel name */}
            <div className="absolute bottom-1.5 left-1.5 flex items-center gap-1">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 text-purple-400 shrink-0" viewBox="0 0 24 24" fill="currentColor">
                <path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714Z" />
              </svg>
              <span className="text-xs font-bold text-white truncate">{streamer.channelName}</span>
            </div>

            {/* Bottom-right: Guild name only */}
            <div className="absolute bottom-1.5 right-1.5 text-[10px] font-bold text-gray-300 truncate max-w-[45%]">{streamer.guild.name}</div>

            {/* Hover overlay */}
            <div className="absolute inset-0 bg-purple-600/0 group-hover:bg-purple-600/10 transition-colors" />
          </button>
        ))}
      </div>
    </div>
  );
}
