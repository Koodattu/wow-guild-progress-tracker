"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function Navigation() {
  const pathname = usePathname();

  const isActive = (path: string) => {
    if (path === "/") {
      return pathname === "/";
    }
    return pathname.startsWith(path);
  };

  return (
    <nav className="bg-gray-900 border-b border-gray-700 mb-8">
      <div className="container mx-auto px-4">
        <div className="flex items-center gap-8 h-16">
          <Link href="/" className="text-xl font-bold text-white hover:text-gray-300 transition-colors">
            WoW Guild Progress
          </Link>
          <div className="flex gap-6">
            <Link
              href="/"
              className={`text-sm font-medium transition-colors ${
                isActive("/") && !pathname.startsWith("/guilds") ? "text-blue-400 border-b-2 border-blue-400" : "text-gray-400 hover:text-white"
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
          </div>
        </div>
      </div>
    </nav>
  );
}
