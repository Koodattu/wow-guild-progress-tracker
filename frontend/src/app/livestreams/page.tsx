"use client";

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { LiveStreamer } from "@/types";
import { api } from "@/lib/api";
import { formatPhaseDisplay, formatPercent } from "@/lib/utils";

// Extend Window interface to include Twitch
declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Twitch: any;
  }
}

export default function LivestreamsPage() {
  const [liveStreamers, setLiveStreamers] = useState<LiveStreamer[]>([]);
  const [selectedStreamers, setSelectedStreamers] = useState<LiveStreamer[]>([]);
  const [activeChat, setActiveChat] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [chatVisible, setChatVisible] = useState(true);
  const [spotlightStream, setSpotlightStream] = useState<string | null>(null);
  const [twitchScriptLoaded, setTwitchScriptLoaded] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const playerRefs = useRef<Record<string, any>>({});

  // Load Twitch Player script
  useEffect(() => {
    if (typeof window !== "undefined" && !window.Twitch) {
      const script = document.createElement("script");
      script.src = "https://player.twitch.tv/js/embed/v1.js";
      script.async = true;
      script.onload = () => {
        setTwitchScriptLoaded(true);
      };
      document.head.appendChild(script);
    } else if (window.Twitch) {
      setTwitchScriptLoaded(true);
    }
  }, []);

  useEffect(() => {
    const fetchLiveStreamers = async () => {
      try {
        setError(null);
        const streamers = await api.getLiveStreamers();
        setLiveStreamers(streamers);
      } catch (err) {
        console.error("Error fetching live streamers:", err);
        setError("Failed to load live streamers. Make sure the backend server is running.");
      } finally {
        setLoading(false);
      }
    };

    fetchLiveStreamers();

    // Auto-refresh every minute
    const interval = setInterval(fetchLiveStreamers, 60000);
    return () => clearInterval(interval);
  }, []);

  // Control player volume and quality based on spotlight state
  useEffect(() => {
    if (!twitchScriptLoaded) return;

    const inSpotlightMode = spotlightStream && selectedStreamers.length >= 2;

    selectedStreamers.forEach((streamer) => {
      const player = playerRefs.current[streamer.channelName];
      if (!player) return;

      try {
        const isSpotlit = streamer.channelName === spotlightStream;

        if (inSpotlightMode) {
          if (isSpotlit) {
            // Spotlight stream: unmute, set best quality
            player.play();
            player.setMuted(false);
            player.setVolume(1.0);
            const qualities = player.getQualities();
            if (qualities && qualities.length > 0) {
              player.setQuality(qualities[0]); // Best quality is first
            }
          } else {
            // Small streams: mute, set 480p
            player.play();
            player.setMuted(true);
            player.setVolume(0);
            const qualities = player.getQualities();
            if (qualities && qualities.length > 0) {
              player.setQuality(qualities[qualities.length - 1]);
            }
          }
        } else {
          // Normal grid: unmute first stream, mute others, best quality for all
          const isFirst = selectedStreamers.indexOf(streamer) === 0;
          player.play();
          player.setMuted(!isFirst);
          player.setVolume(isFirst ? 1.0 : 0);
          const qualities = player.getQualities();
          if (qualities && qualities.length > 0) {
            player.setQuality(qualities[0]);
          }
        }
      } catch (err) {
        console.error(`Error controlling player for ${streamer.channelName}:`, err);
      }
    });
  }, [spotlightStream, selectedStreamers, twitchScriptLoaded]);

  // Cleanup players when streamers are removed
  useEffect(() => {
    const currentChannels = new Set(selectedStreamers.map((s) => s.channelName));
    const playerChannels = Object.keys(playerRefs.current);

    playerChannels.forEach((channel) => {
      if (!currentChannels.has(channel)) {
        // Clean up removed player
        delete playerRefs.current[channel];
      }
    });
  }, [selectedStreamers]);

  const toggleStreamer = useCallback(
    (streamer: LiveStreamer) => {
      const isSelected = selectedStreamers.some((s) => s.channelName === streamer.channelName);

      if (isSelected) {
        const newSelected = selectedStreamers.filter((s) => s.channelName !== streamer.channelName);
        setSelectedStreamers(newSelected);

        // Clear spotlight if removed streamer was the spotlight
        if (spotlightStream === streamer.channelName) {
          setSpotlightStream(null);
        }

        // Update active chat if removed streamer was active
        if (activeChat === streamer.channelName) {
          setActiveChat(newSelected.length > 0 ? newSelected[0].channelName : null);
        }
      } else {
        // Max 6 streams
        if (selectedStreamers.length < 6) {
          const newSelected = [...selectedStreamers, streamer];
          setSelectedStreamers(newSelected);

          // Set as active chat if first selection
          if (!activeChat) {
            setActiveChat(streamer.channelName);
          }
        }
      }
    },
    [selectedStreamers, activeChat, spotlightStream]
  );

  const streamGridClass = useMemo(() => {
    // If spotlight is active, use custom layout
    if (spotlightStream && selectedStreamers.length >= 2) {
      return ""; // We'll use flex layout instead
    }

    const count = selectedStreamers.length;

    switch (count) {
      case 1:
        return "grid-cols-1 grid-rows-1";
      case 2:
        return "grid-cols-1 grid-rows-2";
      case 3:
        return "grid-cols-2 grid-rows-2";
      case 4:
        return "grid-cols-2 grid-rows-2";
      case 5:
      case 6:
        return "grid-cols-3 grid-rows-2";
      default:
        return "grid-cols-1 grid-rows-1";
    }
  }, [selectedStreamers.length, spotlightStream]);

  const getStreamItemClass = (index: number) => {
    const count = selectedStreamers.length;

    if (count === 3 && index === 2) {
      return "col-span-2"; // Third stream takes bottom two columns
    }

    return "";
  };

  const chatGridClass = useMemo(() => {
    const count = selectedStreamers.length;

    if (count <= 2) {
      return "grid-cols-1 grid-rows-1";
    } else {
      return "grid-cols-3 grid-rows-2";
    }
  }, [selectedStreamers.length]);

  const getStreamContainerHeight = () => {
    // Fixed height to fit nicely on screen
    // Using viewport height minus selection boxes and minimal padding
    return "calc(100vh - 20px)";
  };

  const toggleSpotlight = (channelName: string) => {
    if (spotlightStream === channelName) {
      // Turn off spotlight
      setSpotlightStream(null);
    } else {
      // Turn on spotlight for this stream
      setSpotlightStream(channelName);
    }
  };

  const isSpotlightEnabled = selectedStreamers.length >= 2;

  // Calculate stream positions and sizes for smooth transitions
  const getStreamStyle = useCallback(
    (streamer: LiveStreamer) => {
      const isSpotlit = spotlightStream === streamer.channelName;
      const inSpotlightMode = spotlightStream && isSpotlightEnabled;

      if (inSpotlightMode) {
        if (isSpotlit) {
          // Big spotlight stream - takes most of the height
          return {
            position: "absolute" as const,
            top: "0",
            left: "0",
            right: "0",
            height: "calc(100% - 144px)", // Leave room for small streams (128px + 16px gap)
            zIndex: 1,
          };
        } else {
          // Small stream below spotlight - maintain 16:9 aspect ratio
          const smallStreamIndex = selectedStreamers.filter((s) => s.channelName !== spotlightStream).findIndex((s) => s.channelName === streamer.channelName);
          const totalSmallStreams = selectedStreamers.length - 1;
          const streamHeight = 128; // Fixed height in pixels
          const streamWidth = streamHeight * (16 / 9); // Calculate width based on 16:9 aspect ratio (227.56px)
          const gapSize = 12; // Gap between streams
          const totalWidth = totalSmallStreams * streamWidth + (totalSmallStreams - 1) * gapSize;
          const startOffset = `calc(50% - ${totalWidth / 2}px)`; // Center the group of streams

          return {
            position: "absolute" as const,
            bottom: "0",
            left: `calc(${startOffset} + ${smallStreamIndex * (streamWidth + gapSize)}px)`,
            width: `${streamWidth}px`,
            height: `${streamHeight}px`,
            zIndex: 1,
          };
        }
      } else {
        // Normal grid layout - let CSS grid handle it naturally
        return {
          position: "relative" as const,
          zIndex: 1,
        };
      }
    },
    [spotlightStream, isSpotlightEnabled, selectedStreamers]
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-4">📺</div>
          <div className="text-white text-xl">Loading live streams...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-center">
          <div className="text-red-400 text-xl mb-4">{error}</div>
        </div>
      </div>
    );
  }

  if (liveStreamers.length === 0) {
    return (
      <main className="min-h-screen bg-gray-950 text-white">
        <div className="w-full px-4 py-8">
          <div className="text-center py-12">
            <div className="text-6xl mb-4">💤</div>
            <div className="text-2xl text-gray-400 mb-2">No live streams at the moment</div>
            <div className="text-gray-500">Check back later when raiders are streaming!</div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <div className="w-full px-2 py-2">
        {/* Stream Selection Boxes */}
        <div className="mb-4 flex flex-wrap gap-2">
          {liveStreamers.map((streamer) => {
            const isSelected = selectedStreamers.some((s) => s.channelName === streamer.channelName);

            return (
              <button
                key={`${streamer.guild.name}-${streamer.guild.realm}-${streamer.channelName}`}
                onClick={() => toggleStreamer(streamer)}
                className={`px-3 py-2 rounded-lg border-2 transition-all hover:scale-105 ${
                  isSelected ? "bg-purple-600/20 border-purple-500" : "bg-gray-800 border-gray-700 hover:border-gray-600"
                }`}
                disabled={!isSelected && selectedStreamers.length >= 6}
              >
                <div className="flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-purple-500 shrink-0" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714Z" />
                  </svg>
                  <span className="font-bold text-white text-sm whitespace-nowrap">{streamer.channelName}</span>
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse shrink-0"></span>
                  <span className="text-xs text-gray-400 whitespace-nowrap">
                    {streamer.guild.parent_guild ? (
                      <>
                        <span className="font-bold">{streamer.guild.name}</span>
                        {` (${streamer.guild.parent_guild}-${streamer.guild.realm})`}
                      </>
                    ) : (
                      <>
                        <span className="font-bold">{streamer.guild.name}</span>
                        {`-${streamer.guild.realm}`}
                      </>
                    )}
                  </span>
                  {streamer.bestPull && (
                    <span className="text-xs text-orange-400 whitespace-nowrap">
                      {streamer.bestPull.bossName}: {streamer.bestPull.pullCount} pulls,{" "}
                      {streamer.bestPull.bestPullPhase?.displayString
                        ? formatPhaseDisplay(streamer.bestPull.bestPullPhase.displayString)
                        : formatPercent(streamer.bestPull.bestPercent)}
                    </span>
                  )}
                  <div
                    className={`shrink-0 w-6 h-6 rounded flex items-center justify-center text-lg font-bold ml-2 ${
                      isSelected ? "bg-purple-600 text-white" : "bg-gray-700 text-gray-400"
                    }`}
                  >
                    {isSelected ? "−" : "+"}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Viewer Area */}
        {selectedStreamers.length > 0 ? (
          <div className="flex flex-col lg:flex-row gap-0" style={{ height: getStreamContainerHeight() }}>
            {/* Streams Container - Single render with dynamic positioning */}
            <div className="flex-1 h-full relative">
              <div className={`${spotlightStream && isSpotlightEnabled ? "relative h-full" : `grid ${streamGridClass} gap-2 h-full`}`}>
                {selectedStreamers.map((streamer, index) => {
                  const isSpotlit = spotlightStream === streamer.channelName;
                  const inSpotlightMode = spotlightStream && isSpotlightEnabled;
                  const streamStyle = getStreamStyle(streamer);

                  return (
                    <div
                      key={`stream-container-${streamer.channelName}`}
                      style={streamStyle}
                      className={`bg-gray-900 rounded-lg overflow-hidden group transition-all duration-300 ${!inSpotlightMode ? getStreamItemClass(index) : ""} ${
                        inSpotlightMode && !isSpotlit ? "cursor-pointer" : ""
                      }`}
                      onClick={inSpotlightMode && !isSpotlit ? () => toggleSpotlight(streamer.channelName) : undefined}
                    >
                      {/* Twitch Player div - Twitch.Player will be instantiated here */}
                      <div
                        id={`twitch-player-${streamer.channelName}`}
                        className={`w-full h-full ${inSpotlightMode && !isSpotlit ? "pointer-events-none" : ""}`}
                        ref={(el) => {
                          if (el && twitchScriptLoaded && typeof window !== "undefined" && window.Twitch && !playerRefs.current[streamer.channelName]) {
                            try {
                              const player = new window.Twitch.Player(`twitch-player-${streamer.channelName}`, {
                                channel: streamer.channelName,
                                parent: [window.location.hostname],
                                autoplay: true,
                                muted: false,
                                width: "100%",
                                height: "100%",
                              });

                              // Store player reference
                              playerRefs.current[streamer.channelName] = player;

                              // Set initial state when player is ready
                              player.addEventListener(window.Twitch.Player.READY, () => {
                                player.setVolume(0);
                                player.setMuted(true);
                              });
                            } catch (err) {
                              console.error(`Error creating player for ${streamer.channelName}:`, err);
                            }
                          }
                        }}
                      ></div>

                      {/* Spotlight button - shown in normal grid mode */}
                      {!inSpotlightMode && isSpotlightEnabled && (
                        <div className="absolute top-0 right-0 w-40 h-16 pointer-events-none z-10">
                          <button
                            onClick={() => toggleSpotlight(streamer.channelName)}
                            className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 bg-purple-600/90 hover:bg-purple-600 px-2 py-1 rounded text-white font-bold text-xs transition-all shadow-lg pointer-events-auto"
                            title="Spotlight this stream"
                          >
                            ⭐ Spotlight
                          </button>
                        </div>
                      )}

                      {/* Exit spotlight button - shown on spotlit stream */}
                      {inSpotlightMode && isSpotlit && (
                        <div className="absolute top-0 right-0 w-48 h-20 pointer-events-none z-10">
                          <button
                            onClick={() => toggleSpotlight(spotlightStream)}
                            className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 bg-purple-600 hover:bg-purple-700 px-2 py-1 rounded text-white font-bold text-xs transition-all shadow-lg flex items-center gap-1 pointer-events-auto"
                            title="Exit spotlight mode"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                            Exit
                          </button>
                        </div>
                      )}

                      {/* Small stream overlay - shown on non-spotlit streams in spotlight mode */}
                      {inSpotlightMode && !isSpotlit && (
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors z-10 flex items-center justify-center">
                          <div className="absolute top-2 left-2 bg-black/70 px-2 py-1 rounded text-xs font-bold text-white">{streamer.channelName}</div>
                          <div className="opacity-0 group-hover:opacity-100 transition-opacity text-white font-bold text-sm bg-purple-600 px-3 py-1.5 rounded-lg">Spotlight</div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Toggle Button */}
            <button
              onClick={() => setChatVisible(!chatVisible)}
              className="hidden lg:flex items-center justify-center w-3 bg-gray-800 hover:bg-gray-700 transition-colors group"
              aria-label={chatVisible ? "Hide chat" : "Show chat"}
            >
              <div className="text-gray-400 group-hover:text-white text-2xl font-bold">{chatVisible ? "›" : "‹"}</div>
            </button>

            {/* Chat Area */}
            <div className={`transition-all duration-300 overflow-hidden ${chatVisible ? "w-full lg:w-80" : "w-0"}`}>
              <div className="bg-gray-900 rounded-lg overflow-hidden h-full flex flex-col" style={{ width: "20rem" }}>
                {/* Chat Tabs */}
                {selectedStreamers.length <= 2 ? (
                  // Simple tabs for 1-2 streams
                  <div className="flex border-b border-gray-700 bg-gray-800">
                    {selectedStreamers.map((streamer) => (
                      <button
                        key={streamer.channelName}
                        onClick={() => setActiveChat(streamer.channelName)}
                        className={`flex-1 px-2 py-2 text-sm font-medium transition-colors ${
                          activeChat === streamer.channelName ? "bg-purple-600 text-white" : "text-gray-400 hover:text-white hover:bg-gray-700"
                        }`}
                      >
                        {streamer.channelName}
                      </button>
                    ))}
                  </div>
                ) : (
                  // Grid tabs for 3-6 streams
                  <div className={`grid ${chatGridClass} border-b border-gray-700 bg-gray-800`}>
                    {selectedStreamers.map((streamer) => (
                      <button
                        key={streamer.channelName}
                        onClick={() => setActiveChat(streamer.channelName)}
                        className={`px-2 py-2 text-xs font-medium transition-colors border-r border-b border-gray-700 truncate ${
                          activeChat === streamer.channelName ? "bg-purple-600 text-white" : "text-gray-400 hover:text-white hover:bg-gray-700"
                        }`}
                      >
                        {streamer.channelName}
                      </button>
                    ))}
                  </div>
                )}

                {/* All Chats - Load once and keep mounted, toggle visibility */}
                <div className="flex-1 relative">
                  {selectedStreamers.map((streamer) => (
                    <iframe
                      key={`chat-${streamer.channelName}`}
                      src={`https://www.twitch.tv/embed/${streamer.channelName}/chat?parent=${typeof window !== "undefined" ? window.location.hostname : "localhost"}&darkpopout`}
                      className={`absolute top-0 left-0 w-full h-full transition-opacity ${
                        activeChat === streamer.channelName ? "opacity-100 z-10" : "opacity-0 z-0 pointer-events-none"
                      }`}
                      loading="lazy"
                      title={`${streamer.channelName} Twitch chat`}
                    ></iframe>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 bg-gray-900 rounded-lg">
            <div className="text-4xl mb-4">👆</div>
            <div className="text-xl text-gray-400">Select streams to watch</div>
            <div className="text-gray-500 mt-2">Click the + button on stream boxes above</div>
          </div>
        )}
      </div>
    </main>
  );
}
