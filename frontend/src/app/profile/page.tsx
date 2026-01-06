"use client";

import { useAuth } from "@/context/AuthContext";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function ProfilePage() {
  const { user, isLoading, logout } = useAuth();
  const t = useTranslations("profilePage");
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !user) {
      router.push("/");
    }
  }, [user, isLoading, router]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-white text-lg">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <main className="min-h-screen px-4 md:px-6 py-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold text-white mb-8">{t("title")}</h1>

        {/* Profile Card */}
        <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
          {/* Discord Profile Section */}
          <div className="flex items-center gap-6 mb-6">
            <img src={user.discord.avatarUrl} alt={user.discord.username} className="w-24 h-24 rounded-full border-4 border-indigo-500" />
            <div>
              <h2 className="text-2xl font-bold text-white">{user.discord.username}</h2>
              <p className="text-gray-400">{t("discordAccount")}</p>
            </div>
          </div>

          {/* Account Info */}
          <div className="border-t border-gray-700 pt-6 space-y-4">
            <div>
              <label className="text-sm text-gray-400">{t("discordId")}</label>
              <p className="text-white font-mono">{user.discord.id}</p>
            </div>
            <div>
              <label className="text-sm text-gray-400">{t("memberSince")}</label>
              <p className="text-white">
                {new Date(user.createdAt).toLocaleDateString(undefined, {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </p>
            </div>
            <div>
              <label className="text-sm text-gray-400">{t("lastLogin")}</label>
              <p className="text-white">
                {new Date(user.lastLoginAt).toLocaleDateString(undefined, {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="border-t border-gray-700 pt-6 mt-6">
            <button onClick={logout} className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-md transition-colors font-medium">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path
                  fillRule="evenodd"
                  d="M3 3a1 1 0 00-1 1v12a1 1 0 001 1h12a1 1 0 001-1V4a1 1 0 00-1-1H3zm10.293 9.293a1 1 0 001.414 1.414l3-3a1 1 0 000-1.414l-3-3a1 1 0 10-1.414 1.414L14.586 9H7a1 1 0 100 2h7.586l-1.293 1.293z"
                  clipRule="evenodd"
                />
              </svg>
              {t("logout")}
            </button>
          </div>
        </div>

        {/* Future Features Placeholder */}
        <div className="mt-8 bg-gray-800/50 rounded-lg border border-gray-700 border-dashed p-6">
          <h3 className="text-lg font-medium text-gray-400 mb-2">{t("comingSoon")}</h3>
          <ul className="text-gray-500 space-y-1 text-sm">
            <li>• {t("linkBattleNet")}</li>
            <li>• {t("linkTwitch")}</li>
            <li>• {t("manageCharacters")}</li>
          </ul>
        </div>
      </div>
    </main>
  );
}
