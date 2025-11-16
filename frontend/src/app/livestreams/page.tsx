"use client";

import { useEffect, useState } from "react";
import { LiveStreamer } from "@/types";
import { api } from "@/lib/api";

export default function LivestreamsPage() {
  const [liveStreamers, setLiveStreamers] = useState<LiveStreamer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
        <div className="container mx-auto px-4 max-w-6xl py-8">
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
      <div className="container mx-auto px-4 max-w-7xl py-4">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-white mb-2">Live Streams</h1>
          <p className="text-gray-400">
            {liveStreamers.length} {liveStreamers.length === 1 ? "streamer" : "streamers"} currently live
          </p>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {liveStreamers.map((streamer) => (
            <div key={`${streamer.guild.name}-${streamer.guild.realm}-${streamer.channelName}`} className="bg-gray-900 rounded-lg overflow-hidden border border-gray-700">
              {/* Streamer Info Header */}
              <div className="p-4 bg-gray-800/50 border-b border-gray-700">
                <div className="flex items-center justify-between">
                  <div>
                    <a
                      href={`https://www.twitch.tv/${streamer.channelName}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xl font-bold text-white hover:text-purple-400 transition-colors flex items-center gap-2"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-purple-500" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714Z" />
                      </svg>
                      {streamer.channelName}
                      <span className="flex items-center gap-1 text-sm px-2 py-0.5 rounded bg-purple-600 text-white">
                        <span className="w-2 h-2 rounded-full bg-white animate-pulse"></span>
                        LIVE
                      </span>
                    </a>
                    <div className="text-sm text-gray-400 mt-1">
                      {streamer.guild.parent_guild ? (
                        <>
                          {streamer.guild.name} ({streamer.guild.parent_guild}) - {streamer.guild.realm}
                        </>
                      ) : (
                        <>
                          {streamer.guild.name} - {streamer.guild.realm}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Twitch Embed */}
              <div className="relative" style={{ paddingBottom: "56.25%" }}>
                <iframe
                  src={`https://player.twitch.tv/?channel=${streamer.channelName}&parent=${
                    typeof window !== "undefined" ? window.location.hostname : "localhost"
                  }&muted=false`}
                  className="absolute top-0 left-0 w-full h-full"
                  allowFullScreen
                  title={`${streamer.channelName} Twitch stream`}
                ></iframe>
              </div>

              {/* Chat Embed (optional, can be toggled) */}
              <div className="relative" style={{ height: "400px" }}>
                <iframe
                  src={`https://www.twitch.tv/embed/${streamer.channelName}/chat?parent=${
                    typeof window !== "undefined" ? window.location.hostname : "localhost"
                  }&darkpopout`}
                  className="absolute top-0 left-0 w-full h-full"
                  title={`${streamer.channelName} Twitch chat`}
                ></iframe>
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
