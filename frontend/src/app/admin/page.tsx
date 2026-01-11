"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import { AdminUser, AdminGuild, AdminUserStats, AdminGuildStats, AdminOverview } from "@/types";

type TabType = "overview" | "users" | "guilds";

export default function AdminPage() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const t = useTranslations("admin");

  const [activeTab, setActiveTab] = useState<TabType>("overview");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Overview data
  const [overview, setOverview] = useState<AdminOverview | null>(null);

  // Users data
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [userStats, setUserStats] = useState<AdminUserStats | null>(null);
  const [usersPage, setUsersPage] = useState(1);
  const [usersTotalPages, setUsersTotalPages] = useState(1);

  // Guilds data
  const [guilds, setGuilds] = useState<AdminGuild[]>([]);
  const [guildStats, setGuildStats] = useState<AdminGuildStats | null>(null);
  const [guildsPage, setGuildsPage] = useState(1);
  const [guildsTotalPages, setGuildsTotalPages] = useState(1);

  // Redirect non-admin users
  useEffect(() => {
    if (!authLoading && (!user || !user.isAdmin)) {
      router.push("/");
    }
  }, [user, authLoading, router]);

  // Fetch data based on active tab
  useEffect(() => {
    if (!user?.isAdmin) return;

    const fetchData = async () => {
      setLoading(true);
      setError(null);

      try {
        switch (activeTab) {
          case "overview":
            const overviewData = await api.getAdminOverview();
            setOverview(overviewData);
            break;

          case "users":
            const [usersData, userStatsData] = await Promise.all([api.getAdminUsers(usersPage), api.getAdminUserStats()]);
            setUsers(usersData.users);
            setUsersTotalPages(usersData.pagination.totalPages);
            setUserStats(userStatsData);
            break;

          case "guilds":
            const [guildsData, guildStatsData] = await Promise.all([api.getAdminGuilds(guildsPage), api.getAdminGuildStats()]);
            setGuilds(guildsData.guilds);
            setGuildsTotalPages(guildsData.pagination.totalPages);
            setGuildStats(guildStatsData);
            break;
        }
      } catch (err) {
        console.error("Error fetching admin data:", err);
        setError("Failed to load data");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [activeTab, user?.isAdmin, usersPage, guildsPage]);

  // Show loading state while checking auth
  if (authLoading) {
    return (
      <div className="min-h-screen bg-linear-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center">
        <div className="text-amber-400 text-xl">{t("loading")}</div>
      </div>
    );
  }

  // Don't render if not admin
  if (!user?.isAdmin) {
    return null;
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString();
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  return (
    <div className="min-h-screen bg-linear-to-br from-slate-950 via-slate-900 to-slate-950">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white flex items-center gap-3">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-amber-400" viewBox="0 0 20 20" fill="currentColor">
              <path
                fillRule="evenodd"
                d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z"
                clipRule="evenodd"
              />
            </svg>
            {t("title")}
          </h1>
          <p className="text-gray-400 mt-2">{t("description")}</p>
        </div>

        {/* Tabs */}
        <div className="flex flex-wrap gap-2 mb-6 border-b border-gray-700 pb-4">
          {(["overview", "users", "guilds"] as TabType[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${activeTab === tab ? "bg-amber-600 text-white" : "bg-gray-800 text-gray-300 hover:bg-gray-700"}`}
            >
              {t(`tabs.${tab}`)}
            </button>
          ))}
          <a href="/admin/analytics" className="px-4 py-2 rounded-lg font-medium transition-colors bg-gray-800 text-gray-300 hover:bg-gray-700 flex items-center gap-2">
            📊 {t("tabs.analytics")}
          </a>
        </div>

        {/* Error state */}
        {error && (
          <div className="bg-red-900/50 border border-red-500 rounded-lg p-4 mb-6">
            <p className="text-red-300">{error}</p>
          </div>
        )}

        {/* Loading state */}
        {loading && (
          <div className="flex items-center justify-center py-12">
            <div className="text-amber-400">{t("loading")}</div>
          </div>
        )}

        {/* Overview Tab */}
        {!loading && activeTab === "overview" && overview && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-gray-800 rounded-lg p-6">
              <h3 className="text-gray-400 text-sm font-medium">{t("overview.totalUsers")}</h3>
              <p className="text-3xl font-bold text-white mt-2">{overview.users.total}</p>
              <p className="text-sm text-gray-500 mt-1">
                {overview.users.activeToday} {t("overview.activeToday")}
              </p>
            </div>
            <div className="bg-gray-800 rounded-lg p-6">
              <h3 className="text-gray-400 text-sm font-medium">{t("overview.totalGuilds")}</h3>
              <p className="text-3xl font-bold text-white mt-2">{overview.guilds.total}</p>
              <p className="text-sm text-gray-500 mt-1">
                {overview.guilds.updatedToday} {t("overview.updatedToday")}
              </p>
            </div>
          </div>
        )}

        {/* Users Tab */}
        {!loading && activeTab === "users" && (
          <div>
            {/* User Stats */}
            {userStats && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <div className="bg-gray-800 rounded-lg p-4">
                  <h4 className="text-gray-400 text-sm">{t("users.total")}</h4>
                  <p className="text-2xl font-bold text-white">{userStats.total}</p>
                </div>
                <div className="bg-gray-800 rounded-lg p-4">
                  <h4 className="text-gray-400 text-sm">{t("users.activeWeek")}</h4>
                  <p className="text-2xl font-bold text-green-400">{userStats.active.last7Days}</p>
                </div>
                <div className="bg-gray-800 rounded-lg p-4">
                  <h4 className="text-gray-400 text-sm">{t("users.withTwitch")}</h4>
                  <p className="text-2xl font-bold text-purple-400">{userStats.connections.twitch}</p>
                </div>
                <div className="bg-gray-800 rounded-lg p-4">
                  <h4 className="text-gray-400 text-sm">{t("users.withBattlenet")}</h4>
                  <p className="text-2xl font-bold text-blue-400">{userStats.connections.battlenet}</p>
                </div>
              </div>
            )}

            {/* Users Table */}
            <div className="bg-gray-800 rounded-lg overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-900">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">{t("users.discord")}</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">{t("users.twitch")}</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">{t("users.battlenet")}</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">{t("users.lastLogin")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700">
                  {users.map((user) => (
                    <tr key={user.id} className="hover:bg-gray-750">
                      <td className="px-4 py-3 text-white">{user.discord.username}</td>
                      <td className="px-4 py-3 text-gray-300">{user.twitch?.displayName || "-"}</td>
                      <td className="px-4 py-3 text-gray-300">{user.battlenet?.battletag || "-"}</td>
                      <td className="px-4 py-3 text-gray-400 text-sm">{formatDate(user.lastLoginAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Pagination */}
              <div className="px-4 py-3 bg-gray-900 flex items-center justify-between">
                <button onClick={() => setUsersPage((p) => Math.max(1, p - 1))} disabled={usersPage === 1} className="px-3 py-1 bg-gray-700 text-white rounded disabled:opacity-50">
                  {t("pagination.previous")}
                </button>
                <span className="text-gray-400">
                  {t("pagination.page")} {usersPage} {t("pagination.of")} {usersTotalPages}
                </span>
                <button
                  onClick={() => setUsersPage((p) => Math.min(usersTotalPages, p + 1))}
                  disabled={usersPage === usersTotalPages}
                  className="px-3 py-1 bg-gray-700 text-white rounded disabled:opacity-50"
                >
                  {t("pagination.next")}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Guilds Tab */}
        {!loading && activeTab === "guilds" && (
          <div>
            {/* Guild Stats */}
            {guildStats && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <div className="bg-gray-800 rounded-lg p-4">
                  <h4 className="text-gray-400 text-sm">{t("guilds.total")}</h4>
                  <p className="text-2xl font-bold text-white">{guildStats.total}</p>
                </div>
                <div className="bg-gray-800 rounded-lg p-4">
                  <h4 className="text-gray-400 text-sm">{t("guilds.currentlyRaiding")}</h4>
                  <p className="text-2xl font-bold text-green-400">{guildStats.currentlyRaiding}</p>
                </div>
                <div className="bg-gray-800 rounded-lg p-4">
                  <h4 className="text-gray-400 text-sm">{t("guilds.horde")}</h4>
                  <p className="text-2xl font-bold text-red-400">{guildStats.factions["Horde"] || 0}</p>
                </div>
                <div className="bg-gray-800 rounded-lg p-4">
                  <h4 className="text-gray-400 text-sm">{t("guilds.alliance")}</h4>
                  <p className="text-2xl font-bold text-blue-400">{guildStats.factions["Alliance"] || 0}</p>
                </div>
              </div>
            )}

            {/* Guilds Table */}
            <div className="bg-gray-800 rounded-lg overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-900">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">{t("guilds.name")}</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">{t("guilds.realm")}</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">{t("guilds.faction")}</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">{t("guilds.status")}</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">{t("guilds.lastFetched")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700">
                  {guilds.map((guild) => (
                    <tr key={guild.id} className="hover:bg-gray-750">
                      <td className="px-4 py-3 text-white">
                        {guild.name}
                        {guild.parentGuild && <span className="text-gray-500 text-sm ml-2">({guild.parentGuild})</span>}
                      </td>
                      <td className="px-4 py-3 text-gray-300">{guild.realm}</td>
                      <td className="px-4 py-3">
                        <span className={`${guild.faction === "Horde" ? "text-red-400" : "text-blue-400"}`}>{guild.faction || "-"}</span>
                      </td>
                      <td className="px-4 py-3">
                        {guild.isCurrentlyRaiding ? (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-green-900/50 text-green-400">{t("guilds.raiding")}</span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-gray-700 text-gray-400">{t("guilds.idle")}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-400 text-sm">{guild.lastFetched ? formatDate(guild.lastFetched) : "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Pagination */}
              <div className="px-4 py-3 bg-gray-900 flex items-center justify-between">
                <button
                  onClick={() => setGuildsPage((p) => Math.max(1, p - 1))}
                  disabled={guildsPage === 1}
                  className="px-3 py-1 bg-gray-700 text-white rounded disabled:opacity-50"
                >
                  {t("pagination.previous")}
                </button>
                <span className="text-gray-400">
                  {t("pagination.page")} {guildsPage} {t("pagination.of")} {guildsTotalPages}
                </span>
                <button
                  onClick={() => setGuildsPage((p) => Math.min(guildsTotalPages, p + 1))}
                  disabled={guildsPage === guildsTotalPages}
                  className="px-3 py-1 bg-gray-700 text-white rounded disabled:opacity-50"
                >
                  {t("pagination.next")}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
