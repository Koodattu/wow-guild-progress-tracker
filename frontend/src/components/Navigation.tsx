"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

export default function Navigation() {
  const pathname = usePathname();
  const [isInfoDialogOpen, setIsInfoDialogOpen] = useState(false);

  const isActive = (path: string) => {
    if (path === "/") {
      return pathname === "/";
    }
    return pathname.startsWith(path);
  };

  return (
    <>
      <nav className="bg-gray-900 border-b border-gray-700 mb-8">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-8">
              <Link href="/" className="text-xl font-bold text-white hover:text-gray-300 transition-colors">
                WoW Guild Progress
              </Link>
              <div className="flex gap-6">
                <Link
                  href="/"
                  className={`text-sm font-medium transition-colors ${
                    isActive("/") && !pathname.startsWith("/guilds") && !pathname.startsWith("/events") && !pathname.startsWith("/timetable")
                      ? "text-blue-400 border-b-2 border-blue-400"
                      : "text-gray-400 hover:text-white"
                  } py-5`}
                >
                  Progress Leaderboard
                </Link>
                <Link
                  href="/guilds"
                  className={`text-sm font-medium transition-colors ${isActive("/guilds") ? "text-blue-400 border-b-2 border-blue-400" : "text-gray-400 hover:text-white"} py-5`}
                >
                  All Guilds
                </Link>
                <Link
                  href="/timetable"
                  className={`text-sm font-medium transition-colors ${isActive("/timetable") ? "text-blue-400 border-b-2 border-blue-400" : "text-gray-400 hover:text-white"} py-5`}
                >
                  Raid Timetable
                </Link>
                <Link
                  href="/events"
                  className={`text-sm font-medium transition-colors ${isActive("/events") ? "text-blue-400 border-b-2 border-blue-400" : "text-gray-400 hover:text-white"} py-5`}
                >
                  Latest Events
                </Link>
              </div>
            </div>

            {/* Right side buttons */}
            <div className="flex items-center gap-3">
              {/* Info Dialog Button */}
              <button
                onClick={() => setIsInfoDialogOpen(true)}
                className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors font-medium text-sm"
                aria-label="Information"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path
                    fillRule="evenodd"
                    d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                    clipRule="evenodd"
                  />
                </svg>
                Info
              </button>

              {/* GitHub Badge */}
              <a
                href="https://github.com/Koodattu/wow-guild-progress-tracker"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-white rounded-md transition-colors font-medium text-sm border border-gray-600"
                aria-label="GitHub Repository"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                </svg>
                GitHub
              </a>

              {/* Twitch Badge */}
              <a
                href="https://www.twitch.tv/vaarattu"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-md transition-colors font-medium text-sm"
                aria-label="Twitch Stream"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714Z" />
                </svg>
                Twitch
              </a>
            </div>
          </div>
        </div>
      </nav>

      {/* Info Dialog */}
      {isInfoDialogOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => setIsInfoDialogOpen(false)}>
          <div className="bg-gray-800 rounded-lg p-6 max-w-md mx-4 border border-blue-500 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start gap-4">
              <div className="shrink-0">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-blue-400" viewBox="0 0 20 20" fill="currentColor">
                  <path
                    fillRule="evenodd"
                    d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
              <div className="flex-1">
                <h3 className="text-xl font-bold text-white mb-3">Work in Progress</h3>
                <p className="text-gray-300 mb-4">This application is currently under active development. Please note that:</p>
                <ul className="list-disc list-inside text-gray-300 space-y-2 mb-4">
                  <li>Some guilds may be missing from the database</li>
                  <li>Information displayed may be incomplete or inaccurate</li>
                  <li>Features and data are continuously being updated</li>
                </ul>
                <p className="text-gray-400 text-sm">Thank you for your patience as we continue to improve!</p>
              </div>
            </div>
            <div className="mt-6 flex justify-end">
              <button onClick={() => setIsInfoDialogOpen(false)} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors font-medium">
                Got it
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
