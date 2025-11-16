"use client";

import { useEffect, useState } from "react";
import { LiveStreamer } from "@/types";
import { api } from "@/lib/api";

export default function LivestreamsPage() {
  const [liveStreamers, setLiveStreamers] = useState<LiveStreamer[]>([]);
  const [selectedStreamers, setSelectedStreamers] = useState<LiveStreamer[]>([]);
  const [activeChat, setActiveChat] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [streamKeys, setStreamKeys] = useState<Record<string, number>>({});

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

  const toggleStreamer = (streamer: LiveStreamer) => {
    const isSelected = selectedStreamers.some((s) => s.channelName === streamer.channelName);

    if (isSelected) {
      const newSelected = selectedStreamers.filter((s) => s.channelName !== streamer.channelName);
      setSelectedStreamers(newSelected);

      // Update active chat if removed streamer was active
      if (activeChat === streamer.channelName) {
        setActiveChat(newSelected.length > 0 ? newSelected[0].channelName : null);
      }
    } else {
      // Max 6 streams
      if (selectedStreamers.length < 6) {
        const newSelected = [...selectedStreamers, streamer];
        setSelectedStreamers(newSelected);

        // Force iframe reload by updating key
        setStreamKeys((prev) => ({
          ...prev,
          [streamer.channelName]: Date.now(),
        }));

        // Set as active chat if first selection
        if (!activeChat) {
          setActiveChat(streamer.channelName);
        }
      }
    }
  };

  const getStreamGridClass = () => {
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
  };

  const getStreamItemClass = (index: number) => {
    const count = selectedStreamers.length;

    if (count === 3 && index === 2) {
      return "col-span-2"; // Third stream takes bottom two columns
    }

    return "";
  };

  const getChatGridClass = () => {
    const count = selectedStreamers.length;

    if (count <= 2) {
      return "grid-cols-1 grid-rows-1";
    } else {
      return "grid-cols-3 grid-rows-2";
    }
  };

  const getStreamContainerHeight = () => {
    // Fixed height to fit nicely on screen
    // Using viewport height minus selection boxes and minimal padding
    return "calc(100vh - 200px)";
  };

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
      <div className="w-full px-4 py-2">
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
                    {streamer.guild.parent_guild
                      ? `${streamer.guild.name} (${streamer.guild.parent_guild} - ${streamer.guild.realm})`
                      : `${streamer.guild.name} - ${streamer.guild.realm}`}
                  </span>
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
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4" style={{ height: getStreamContainerHeight() }}>
            {/* Streams Grid */}
            <div className="lg:col-span-2 h-full">
              <div className={`grid ${getStreamGridClass()} gap-2 h-full`}>
                {selectedStreamers.map((streamer, index) => (
                  <div
                    key={`${streamer.channelName}-${streamKeys[streamer.channelName] || 0}`}
                    className={`relative bg-gray-900 rounded-lg overflow-hidden ${getStreamItemClass(index)}`}
                  >
                    <iframe
                      key={`iframe-${streamer.channelName}-${streamKeys[streamer.channelName] || 0}`}
                      src={`https://player.twitch.tv/?channel=${streamer.channelName}&parent=${typeof window !== "undefined" ? window.location.hostname : "localhost"}&muted=${
                        index > 0
                      }&autoplay=true`}
                      className="w-full h-full"
                      allowFullScreen
                      allow="autoplay"
                      title={`${streamer.channelName} Twitch stream`}
                    ></iframe>
                    {/* Stream Label */}
                    <div className="absolute top-2 left-2 bg-black/70 px-2 py-1 rounded text-sm font-bold text-white z-10">{streamer.channelName}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Chat Area */}
            <div className="lg:col-span-1">
              <div className="bg-gray-900 rounded-lg overflow-hidden h-full flex flex-col">
                {/* Chat Tabs */}
                {selectedStreamers.length <= 2 ? (
                  // Simple tabs for 1-2 streams
                  <div className="flex border-b border-gray-700 bg-gray-800">
                    {selectedStreamers.map((streamer) => (
                      <button
                        key={streamer.channelName}
                        onClick={() => setActiveChat(streamer.channelName)}
                        className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
                          activeChat === streamer.channelName ? "bg-purple-600 text-white" : "text-gray-400 hover:text-white hover:bg-gray-700"
                        }`}
                      >
                        {streamer.channelName}
                      </button>
                    ))}
                  </div>
                ) : (
                  // Grid tabs for 3-6 streams
                  <div className={`grid ${getChatGridClass()} border-b border-gray-700 bg-gray-800`}>
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

                {/* Active Chat */}
                <div className="flex-1 relative">
                  {activeChat && (
                    <iframe
                      src={`https://www.twitch.tv/embed/${activeChat}/chat?parent=${typeof window !== "undefined" ? window.location.hostname : "localhost"}&darkpopout`}
                      className="absolute top-0 left-0 w-full h-full"
                      title={`${activeChat} Twitch chat`}
                    ></iframe>
                  )}
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
