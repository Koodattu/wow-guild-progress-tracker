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
  const [activeChat, setActiveChat] = useState<string | "all" | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [chatVisible, setChatVisible] = useState(true);
  const [spotlightStream, setSpotlightStream] = useState<string | null>(null);
  const [twitchScriptLoaded, setTwitchScriptLoaded] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const playerRefs = useRef<Record<string, any>>({});
  const previousSpotlightRef = useRef<string | null>(null);
  const qualityInitializedRef = useRef<Record<string, boolean>>({});

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
    const currentSpotlightPlayer = spotlightStream ? playerRefs.current[spotlightStream] : null;
    const previousSpotlightChannel = previousSpotlightRef.current;
    const previousSpotlightPlayer = previousSpotlightChannel ? playerRefs.current[previousSpotlightChannel] : null;

    // Handle spotlight switching (when spotlight changes from one stream to another)
    if (spotlightStream && previousSpotlightChannel && spotlightStream !== previousSpotlightChannel) {
      console.log(`Switching spotlight from ${previousSpotlightChannel} to ${spotlightStream}`);

      // Transfer volume from old spotlight to new spotlight
      if (previousSpotlightPlayer && currentSpotlightPlayer) {
        try {
          const previousVolume = previousSpotlightPlayer.getVolume();
          console.log(`Transferring volume ${previousVolume} from ${previousSpotlightChannel} to ${spotlightStream}`);
          currentSpotlightPlayer.setVolume(previousVolume);

          // Set the old spotlight stream to volume 0 and lowest quality
          previousSpotlightPlayer.setVolume(0);
          const prevQualities = previousSpotlightPlayer.getQualities();
          if (prevQualities && prevQualities.length > 0) {
            console.log(`Demoting ${previousSpotlightChannel} to lowest quality`);
            previousSpotlightPlayer.setQuality(prevQualities[prevQualities.length - 1].group);
          }
        } catch (err) {
          console.error("Error transferring volume between spotlight streams:", err);
        }
      }

      // Set new spotlight to best quality
      if (currentSpotlightPlayer) {
        try {
          const qualities = currentSpotlightPlayer.getQualities();
          if (qualities && qualities.length > 1) {
            console.log(`Promoting ${spotlightStream} to best quality`);
            currentSpotlightPlayer.setQuality(qualities[1].group);
          }
        } catch (err) {
          console.error("Error setting quality for new spotlight:", err);
        }
      }

      // Update ref AFTER handling the switch
      previousSpotlightRef.current = spotlightStream;
      return; // Exit early to avoid running other blocks
    }

    // Handle entering spotlight mode for the first time (previousSpotlightChannel is null)
    if (inSpotlightMode && !previousSpotlightChannel && spotlightStream) {
      console.log(`Entering spotlight mode with ${spotlightStream}`);

      selectedStreamers.forEach((streamer) => {
        const player = playerRefs.current[streamer.channelName];
        if (!player) return;

        try {
          const isSpotlit = streamer.channelName === spotlightStream;
          const qualities = player.getQualities();

          if (isSpotlit) {
            // Set spotlight to best quality (volume already set)
            if (qualities && qualities.length > 1) {
              console.log(`Setting initial spotlight ${streamer.channelName} to best quality`);
              player.setQuality(qualities[1].group);
            }
          } else {
            // Set non-spotlight streams to volume 0 and lowest quality
            player.setVolume(0);
            if (qualities && qualities.length > 0) {
              console.log(`Setting ${streamer.channelName} to lowest quality for spotlight mode`);
              player.setQuality(qualities[qualities.length - 1].group);
            }
          }
        } catch (err) {
          console.error(`Error in initial spotlight setup for ${streamer.channelName}:`, err);
        }
      });

      // Update ref AFTER setting up
      previousSpotlightRef.current = spotlightStream;
      return; // Exit early
    }

    // Handle exiting spotlight mode (spotlightStream becomes null)
    if (!spotlightStream && previousSpotlightChannel) {
      console.log(`Exiting spotlight mode from ${previousSpotlightChannel}`);

      // Don't touch volumes, just set all to best quality
      selectedStreamers.forEach((streamer) => {
        const player = playerRefs.current[streamer.channelName];
        if (!player) return;

        try {
          const qualities = player.getQualities();
          if (qualities && qualities.length > 1) {
            console.log(`Restoring ${streamer.channelName} to best quality (exiting spotlight)`);
            player.setQuality(qualities[1].group);
          }
        } catch (err) {
          console.error(`Error restoring quality for ${streamer.channelName}:`, err);
        }
      });

      // Update ref to null
      previousSpotlightRef.current = null;
    }
  }, [spotlightStream, twitchScriptLoaded, selectedStreamers]);

  // Cleanup players when streamers are removed
  useEffect(() => {
    const currentChannels = new Set(selectedStreamers.map((s) => s.channelName));
    const playerChannels = Object.keys(playerRefs.current);

    playerChannels.forEach((channel) => {
      if (!currentChannels.has(channel) && !channel.endsWith("_interval")) {
        // Clean up play check interval
        const intervalKey = `${channel}_interval`;
        if (playerRefs.current[intervalKey]) {
          clearInterval(playerRefs.current[intervalKey]);
          delete playerRefs.current[intervalKey];
        }

        // Clean up removed player
        delete playerRefs.current[channel];
        delete qualityInitializedRef.current[channel];
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
          } else if (selectedStreamers.length === 1) {
            // When adding second stream, switch to 'all' view
            setActiveChat("all");
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
    } else if (count === 3) {
      // All tab on row 1 (full width), 3 streams on row 2
      return "grid-cols-3";
    } else {
      // All tab on row 1 (full width), remaining streams on subsequent rows
      return "grid-cols-3";
    }
  }, [selectedStreamers.length]);

  const getStreamContainerHeight = () => {
    // Fixed height to fit nicely on screen
    // Using viewport height minus selection boxes and minimal padding
    return "calc(100vh - 20px)";
  };

  const toggleSpotlight = (channelName: string) => {
    if (spotlightStream === channelName) {
      // Turn off spotlight - switch to 'all' if we have multiple streams
      setSpotlightStream(null);
      if (selectedStreamers.length > 1) {
        setActiveChat("all");
      }
    } else {
      // Turn on spotlight for this stream
      setSpotlightStream(channelName);
      // Auto-select the spotlight stream's chat
      setActiveChat(channelName);
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
                onMouseDown={(e) => {
                  // Middle click to open in new tab
                  if (e.button === 1) {
                    e.preventDefault();
                    window.open(`https://www.twitch.tv/${streamer.channelName}`, "_blank");
                  }
                }}
                className={`px-3 py-2 rounded-lg border-2 transition-all hover:scale-105 cursor-pointer ${
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
                                muted: true, // Required for autoplay to work
                                width: "100%",
                                height: "100%",
                              });

                              // Store player reference immediately
                              playerRefs.current[streamer.channelName] = player;

                              // Wait for player to be ready before calling any methods
                              player.addEventListener(window.Twitch.Player.READY, () => {
                                console.log(`Player ready: ${streamer.channelName}`);

                                // Set initial volume to 0 for all new streams
                                player.setVolume(0);

                                // Start playing
                                player.play();

                                // Poll to ensure player stays playing
                                const playCheckInterval = setInterval(() => {
                                  try {
                                    if (player.isPaused && player.isPaused()) {
                                      console.log(`Player ${streamer.channelName} is paused, calling play()`);
                                      player.play();
                                    }
                                  } catch {
                                    // Player might be destroyed, clear interval
                                    clearInterval(playCheckInterval);
                                  }
                                }, 2000); // Check every 2 seconds

                                // Store interval ID for cleanup
                                if (!playerRefs.current[`${streamer.channelName}_interval`]) {
                                  playerRefs.current[`${streamer.channelName}_interval`] = playCheckInterval;
                                }
                              });

                              // Listen for when playback actually starts to set quality
                              player.addEventListener(window.Twitch.Player.PLAYING, () => {
                                // Only set quality once on initial load
                                if (qualityInitializedRef.current[streamer.channelName]) {
                                  return; // Quality already set, don't set it again
                                }

                                console.log(`Player playing (first time): ${streamer.channelName}`);

                                // Determine initial quality based on current mode
                                try {
                                  const qualities = player.getQualities();
                                  if (qualities && qualities.length > 1) {
                                    console.log(`Available qualities for ${streamer.channelName}:`, qualities);

                                    // Check if we're in spotlight mode and this isn't the spotlight stream
                                    const inSpotlightMode = spotlightStream && selectedStreamers.length >= 2;
                                    const isSpotlit = streamer.channelName === spotlightStream;

                                    if (inSpotlightMode && !isSpotlit) {
                                      // New stream in spotlight mode but not spotlight: set to lowest quality
                                      player.setQuality(qualities[qualities.length - 1].group);
                                      console.log(`Setting new small stream ${streamer.channelName} to lowest quality`);
                                    } else {
                                      // Default: set to best quality (skip auto at [0], use [1])
                                      player.setQuality(qualities[1].group);
                                      console.log(`Setting new stream ${streamer.channelName} to best quality`);
                                    }

                                    // Mark as initialized
                                    qualityInitializedRef.current[streamer.channelName] = true;
                                  }
                                } catch (err) {
                                  console.error(`Error setting quality for ${streamer.channelName}:`, err);
                                }
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
                            className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 bg-purple-600/90 hover:bg-purple-600 px-2 py-1 rounded text-white font-bold text-xs transition-all shadow-lg pointer-events-auto cursor-pointer"
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
                            className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 bg-purple-600 hover:bg-purple-700 px-2 py-1 rounded text-white font-bold text-xs transition-all shadow-lg flex items-center gap-1 pointer-events-auto cursor-pointer"
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
              className="hidden lg:flex items-center justify-center w-3 bg-purple-600 hover:bg-purple-500 transition-colors group cursor-pointer"
              aria-label={chatVisible ? "Hide chat" : "Show chat"}
            >
              <div className="text-white text-2xl font-bold">{chatVisible ? "›" : "‹"}</div>
            </button>

            {/* Chat Area */}
            <div className={`transition-all duration-300 overflow-hidden ${chatVisible ? "w-full lg:w-80" : "w-0"}`}>
              <div className="bg-gray-900 rounded-lg overflow-hidden h-full flex flex-col" style={{ width: "20rem" }}>
                {/* Chat Tabs */}
                {selectedStreamers.length <= 2 ? (
                  // Simple tabs for 1-2 streams
                  <div className="flex border-b border-gray-700 bg-gray-800">
                    {selectedStreamers.length > 1 && (
                      <button
                        onClick={() => setActiveChat("all")}
                        className={`flex-1 px-2 py-2 text-sm font-medium transition-colors cursor-pointer ${
                          activeChat === "all" ? "bg-purple-600 text-white" : "text-gray-400 hover:text-white hover:bg-gray-700"
                        }`}
                      >
                        All
                      </button>
                    )}
                    {selectedStreamers.map((streamer) => (
                      <button
                        key={streamer.channelName}
                        onClick={() => setActiveChat(streamer.channelName)}
                        className={`flex-1 px-2 py-2 text-sm font-medium transition-colors cursor-pointer ${
                          activeChat === streamer.channelName ? "bg-purple-600 text-white" : "text-gray-400 hover:text-white hover:bg-gray-700"
                        }`}
                      >
                        {streamer.channelName}
                      </button>
                    ))}
                  </div>
                ) : (
                  // Grid tabs for 3-6 streams - All tab on first row (full width)
                  <div className={`grid ${chatGridClass} border-b border-gray-700 bg-gray-800`}>
                    <button
                      onClick={() => setActiveChat("all")}
                      className={`col-span-3 px-2 py-2 text-xs font-medium transition-colors border-b border-gray-700 cursor-pointer ${
                        activeChat === "all" ? "bg-purple-600 text-white" : "text-gray-400 hover:text-white hover:bg-gray-700"
                      }`}
                    >
                      All
                    </button>
                    {selectedStreamers.map((streamer) => (
                      <button
                        key={streamer.channelName}
                        onClick={() => setActiveChat(streamer.channelName)}
                        className={`px-2 py-2 text-xs font-medium transition-colors border-r border-gray-700 truncate cursor-pointer ${
                          activeChat === streamer.channelName ? "bg-purple-600 text-white" : "text-gray-400 hover:text-white hover:bg-gray-700"
                        }`}
                      >
                        {streamer.channelName}
                      </button>
                    ))}
                  </div>
                )}

                {/* All Chats - Render once, control visibility and layout with CSS */}
                <div className={`flex-1 relative ${activeChat === "all" ? "flex flex-col" : ""}`}>
                  {selectedStreamers.map((streamer) => {
                    const isActive = activeChat === streamer.channelName;
                    const isAllMode = activeChat === "all";

                    return (
                      <div
                        key={`chat-container-${streamer.channelName}`}
                        className={`
                          ${isAllMode ? "relative flex-1 border-b border-gray-700 last:border-b-0" : "absolute top-0 left-0 w-full h-full"}
                          ${!isAllMode && !isActive ? "opacity-0 pointer-events-none" : "opacity-100"}
                          ${!isAllMode && isActive ? "z-10" : "z-0"}
                          transition-opacity
                        `}
                      >
                        <iframe
                          src={`https://www.twitch.tv/embed/${streamer.channelName}/chat?parent=${
                            typeof window !== "undefined" ? window.location.hostname : "localhost"
                          }&darkpopout`}
                          className="w-full h-full"
                          loading="lazy"
                          title={`${streamer.channelName} Twitch chat`}
                        ></iframe>
                      </div>
                    );
                  })}
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
