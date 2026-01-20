"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import { AdminUser, AdminGuild, AdminUserStats, AdminGuildStats, AdminOverview, AdminPickem, AdminPickemStats, ScoringConfig, StreakConfig, RaidInfo, PickemType } from "@/types";

type TabType = "overview" | "users" | "guilds" | "pickems";

// Sortable item for finalization ranking
function SortableRankingItem({ id, rank }: { id: string; rank: number }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="flex items-center gap-3 p-3 bg-gray-700 rounded-lg cursor-grab active:cursor-grabbing border border-gray-600 hover:border-gray-500"
    >
      <span className="w-8 h-8 flex items-center justify-center bg-blue-600 rounded-full text-white font-bold">{rank}</span>
      <span className="text-white font-medium">{id}</span>
    </div>
  );
}

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

  // Pickems data
  const [pickems, setPickems] = useState<AdminPickem[]>([]);
  const [pickemStats, setPickemStats] = useState<AdminPickemStats | null>(null);
  const [showPickemForm, setShowPickemForm] = useState(false);
  const [editingPickem, setEditingPickem] = useState<AdminPickem | null>(null);
  const [raids, setRaids] = useState<RaidInfo[]>([]);

  // Pickem form state
  const [pickemForm, setPickemForm] = useState({
    pickemId: "",
    name: "",
    type: "regular" as PickemType,
    raidIds: [] as number[],
    guildCount: 10,
    votingStart: "",
    votingEnd: "",
    active: true,
    scoringConfig: {
      exactMatch: 10,
      offByOne: 8,
      offByTwo: 6,
      offByThree: 4,
      offByFour: 2,
      offByFiveOrMore: 0,
    } as ScoringConfig,
    streakConfig: {
      enabled: true,
      minLength: 2,
      bonusPerGuild: 3,
    } as StreakConfig,
  });

  // RWF Finalization state
  const [showFinalizeModal, setShowFinalizeModal] = useState(false);
  const [finalizingPickem, setFinalizingPickem] = useState<AdminPickem | null>(null);
  const [finalizationRankings, setFinalizationRankings] = useState<string[]>([]);
  const [isFinalizingLoading, setIsFinalizingLoading] = useState(false);

  // DnD sensors for finalization modal
  const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

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

          case "pickems":
            const [pickemsData, raidsData] = await Promise.all([api.getAdminPickems(), api.getRaids()]);
            setPickems(pickemsData.pickems);
            setPickemStats(pickemsData.stats);
            setRaids(raidsData);
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
          {(["overview", "users", "guilds", "pickems"] as TabType[]).map((tab) => (
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

        {/* Pickems Tab */}
        {!loading && activeTab === "pickems" && (
          <div>
            {/* Pickem Stats */}
            {pickemStats && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <div className="bg-gray-800 rounded-lg p-4">
                  <h4 className="text-gray-400 text-sm">{t("pickems.total")}</h4>
                  <p className="text-2xl font-bold text-white">{pickemStats.total}</p>
                </div>
                <div className="bg-gray-800 rounded-lg p-4">
                  <h4 className="text-gray-400 text-sm">{t("pickems.active")}</h4>
                  <p className="text-2xl font-bold text-green-400">{pickemStats.active}</p>
                </div>
                <div className="bg-gray-800 rounded-lg p-4">
                  <h4 className="text-gray-400 text-sm">{t("pickems.votingOpen")}</h4>
                  <p className="text-2xl font-bold text-amber-400">{pickemStats.votingOpen}</p>
                </div>
                <div className="bg-gray-800 rounded-lg p-4">
                  <h4 className="text-gray-400 text-sm">{t("pickems.participants")}</h4>
                  <p className="text-2xl font-bold text-blue-400">{pickemStats.totalParticipants}</p>
                </div>
              </div>
            )}

            {/* Create/Edit Button */}
            <div className="mb-4">
              <button
                onClick={() => {
                  setEditingPickem(null);
                  setPickemForm({
                    pickemId: "",
                    name: "",
                    type: "regular",
                    raidIds: [],
                    guildCount: 10,
                    votingStart: "",
                    votingEnd: "",
                    active: true,
                    scoringConfig: {
                      exactMatch: 10,
                      offByOne: 8,
                      offByTwo: 6,
                      offByThree: 4,
                      offByFour: 2,
                      offByFiveOrMore: 0,
                    },
                    streakConfig: {
                      enabled: true,
                      minLength: 2,
                      bonusPerGuild: 3,
                    },
                  });
                  setShowPickemForm(true);
                }}
                className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors"
              >
                + {t("pickems.create")}
              </button>
            </div>

            {/* Pickem Form Modal */}
            {showPickemForm && (
              <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
                <div className="bg-gray-800 rounded-lg p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
                  <h3 className="text-xl font-bold text-white mb-4">{editingPickem ? t("pickems.edit") : t("pickems.create")}</h3>

                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      try {
                        if (editingPickem) {
                          await api.updateAdminPickem(editingPickem.pickemId, {
                            name: pickemForm.name,
                            type: pickemForm.type,
                            raidIds: pickemForm.type === "regular" ? pickemForm.raidIds : [],
                            guildCount: pickemForm.guildCount,
                            votingStart: pickemForm.votingStart,
                            votingEnd: pickemForm.votingEnd,
                            active: pickemForm.active,
                            scoringConfig: pickemForm.scoringConfig,
                            streakConfig: pickemForm.streakConfig,
                          });
                        } else {
                          await api.createAdminPickem({
                            ...pickemForm,
                            raidIds: pickemForm.type === "regular" ? pickemForm.raidIds : [],
                          });
                        }
                        setShowPickemForm(false);
                        // Refresh pickems
                        const pickemsData = await api.getAdminPickems();
                        setPickems(pickemsData.pickems);
                        setPickemStats(pickemsData.stats);
                      } catch (err: unknown) {
                        setError(err instanceof Error ? err.message : "Failed to save pickem");
                      }
                    }}
                    className="space-y-4"
                  >
                    {/* Pickem ID (only for create) */}
                    {!editingPickem && (
                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1">{t("pickems.form.id")}</label>
                        <input
                          type="text"
                          value={pickemForm.pickemId}
                          onChange={(e) => setPickemForm({ ...pickemForm, pickemId: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") })}
                          className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
                          placeholder="tww-s3"
                          required
                        />
                        <p className="text-xs text-gray-500 mt-1">{t("pickems.form.idHelp")}</p>
                      </div>
                    )}

                    {/* Name */}
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-1">{t("pickems.form.name")}</label>
                      <input
                        type="text"
                        value={pickemForm.name}
                        onChange={(e) => setPickemForm({ ...pickemForm, name: e.target.value })}
                        className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
                        placeholder="TWW Season 3: Manaforge Omega"
                        required
                      />
                    </div>

                    {/* Pickem Type */}
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-1">{t("pickems.form.type")}</label>
                      <select
                        value={pickemForm.type}
                        onChange={(e) => {
                          const newType = e.target.value as PickemType;
                          setPickemForm({
                            ...pickemForm,
                            type: newType,
                            guildCount: newType === "rwf" ? 5 : 10,
                            raidIds: newType === "rwf" ? [] : pickemForm.raidIds,
                          });
                        }}
                        className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
                      >
                        <option value="regular">{t("pickems.form.typeRegular")}</option>
                        <option value="rwf">{t("pickems.form.typeRwf")}</option>
                      </select>
                      <p className="text-xs text-gray-500 mt-1">{pickemForm.type === "regular" ? t("pickems.form.typeRegularHelp") : t("pickems.form.typeRwfHelp")}</p>
                    </div>

                    {/* Guild Count */}
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-1">{t("pickems.form.guildCount")}</label>
                      <input
                        type="number"
                        value={pickemForm.guildCount}
                        onChange={(e) => setPickemForm({ ...pickemForm, guildCount: parseInt(e.target.value) || (pickemForm.type === "rwf" ? 5 : 10) })}
                        className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
                        min="1"
                        max={pickemForm.type === "rwf" ? 5 : 10}
                      />
                      <p className="text-xs text-gray-500 mt-1">{t("pickems.form.guildCountHelp")}</p>
                    </div>

                    {/* Raid Selection - only for regular type */}
                    {pickemForm.type === "regular" && (
                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1">{t("pickems.form.raids")}</label>
                        <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto bg-gray-700 p-3 rounded-lg">
                          {raids.map((raid) => (
                            <label key={raid.id} className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={pickemForm.raidIds.includes(raid.id)}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setPickemForm({ ...pickemForm, raidIds: [...pickemForm.raidIds, raid.id] });
                                  } else {
                                    setPickemForm({ ...pickemForm, raidIds: pickemForm.raidIds.filter((id) => id !== raid.id) });
                                  }
                                }}
                                className="rounded border-gray-500"
                              />
                              {raid.name}
                            </label>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Voting Dates */}
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1">{t("pickems.form.votingStart")}</label>
                        <input
                          type="datetime-local"
                          value={pickemForm.votingStart}
                          onChange={(e) => setPickemForm({ ...pickemForm, votingStart: e.target.value })}
                          className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1">{t("pickems.form.votingEnd")}</label>
                        <input
                          type="datetime-local"
                          value={pickemForm.votingEnd}
                          onChange={(e) => setPickemForm({ ...pickemForm, votingEnd: e.target.value })}
                          className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
                          required
                        />
                      </div>
                    </div>

                    {/* Active Toggle */}
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="active"
                        checked={pickemForm.active}
                        onChange={(e) => setPickemForm({ ...pickemForm, active: e.target.checked })}
                        className="rounded border-gray-500"
                      />
                      <label htmlFor="active" className="text-sm text-gray-300">
                        {t("pickems.form.active")}
                      </label>
                    </div>

                    {/* Scoring Config */}
                    <div>
                      <h4 className="text-sm font-medium text-gray-300 mb-2">{t("pickems.form.scoring")}</h4>
                      <div className="grid grid-cols-3 gap-2">
                        {Object.entries(pickemForm.scoringConfig).map(([key, value]) => (
                          <div key={key}>
                            <label className="block text-xs text-gray-400 mb-1">{t(`pickems.form.scoring${key.charAt(0).toUpperCase() + key.slice(1)}`)}</label>
                            <input
                              type="number"
                              value={value}
                              onChange={(e) =>
                                setPickemForm({
                                  ...pickemForm,
                                  scoringConfig: { ...pickemForm.scoringConfig, [key]: parseInt(e.target.value) || 0 },
                                })
                              }
                              className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded text-white text-sm"
                            />
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Streak Config */}
                    <div>
                      <h4 className="text-sm font-medium text-gray-300 mb-2">{t("pickems.form.streak")}</h4>
                      <div className="grid grid-cols-3 gap-2">
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            id="streakEnabled"
                            checked={pickemForm.streakConfig.enabled}
                            onChange={(e) =>
                              setPickemForm({
                                ...pickemForm,
                                streakConfig: { ...pickemForm.streakConfig, enabled: e.target.checked },
                              })
                            }
                            className="rounded border-gray-500"
                          />
                          <label htmlFor="streakEnabled" className="text-xs text-gray-400">
                            {t("pickems.form.streakEnabled")}
                          </label>
                        </div>
                        <div>
                          <label className="block text-xs text-gray-400 mb-1">{t("pickems.form.streakMinLength")}</label>
                          <input
                            type="number"
                            value={pickemForm.streakConfig.minLength}
                            onChange={(e) =>
                              setPickemForm({
                                ...pickemForm,
                                streakConfig: { ...pickemForm.streakConfig, minLength: parseInt(e.target.value) || 2 },
                              })
                            }
                            className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded text-white text-sm"
                            min="2"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-400 mb-1">{t("pickems.form.streakBonusPerGuild")}</label>
                          <input
                            type="number"
                            value={pickemForm.streakConfig.bonusPerGuild}
                            onChange={(e) =>
                              setPickemForm({
                                ...pickemForm,
                                streakConfig: { ...pickemForm.streakConfig, bonusPerGuild: parseInt(e.target.value) || 3 },
                              })
                            }
                            className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded text-white text-sm"
                            min="1"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Form Actions */}
                    <div className="flex gap-3 pt-4">
                      <button type="submit" className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors">
                        {editingPickem ? t("pickems.form.update") : t("pickems.form.create")}
                      </button>
                      <button type="button" onClick={() => setShowPickemForm(false)} className="px-4 py-2 bg-gray-700 text-gray-300 rounded-lg hover:bg-gray-600 transition-colors">
                        {t("pickems.form.cancel")}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {/* RWF Finalization Modal */}
            {showFinalizeModal && finalizingPickem && (
              <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
                <div className="bg-gray-800 rounded-lg p-6 max-w-md w-full">
                  <h3 className="text-xl font-bold text-white mb-4">{t("pickems.finalize.title", { name: finalizingPickem.name })}</h3>
                  <p className="text-gray-400 mb-4">{t("pickems.finalize.description")}</p>

                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={(event: DragEndEvent) => {
                      const { active, over } = event;
                      if (over && active.id !== over.id) {
                        setFinalizationRankings((items) => {
                          const oldIndex = items.indexOf(active.id as string);
                          const newIndex = items.indexOf(over.id as string);
                          return arrayMove(items, oldIndex, newIndex);
                        });
                      }
                    }}
                  >
                    <SortableContext items={finalizationRankings} strategy={verticalListSortingStrategy}>
                      <div className="space-y-2 mb-6">
                        {finalizationRankings.map((guild, index) => (
                          <SortableRankingItem key={guild} id={guild} rank={index + 1} />
                        ))}
                      </div>
                    </SortableContext>
                  </DndContext>

                  <div className="flex gap-3">
                    <button
                      onClick={async () => {
                        setIsFinalizingLoading(true);
                        try {
                          await api.finalizeRwfPickem(finalizingPickem.pickemId, finalizationRankings);
                          const pickemsData = await api.getAdminPickems();
                          setPickems(pickemsData.pickems);
                          setPickemStats(pickemsData.stats);
                          setShowFinalizeModal(false);
                          setFinalizingPickem(null);
                        } catch (err) {
                          console.error("Failed to finalize pickem:", err);
                          alert(err instanceof Error ? err.message : "Failed to finalize pickem");
                        } finally {
                          setIsFinalizingLoading(false);
                        }
                      }}
                      disabled={isFinalizingLoading}
                      className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50"
                    >
                      {isFinalizingLoading ? t("pickems.finalize.loading") : t("pickems.finalize.confirm")}
                    </button>
                    <button
                      onClick={() => {
                        setShowFinalizeModal(false);
                        setFinalizingPickem(null);
                      }}
                      className="px-4 py-2 bg-gray-700 text-gray-300 rounded-lg hover:bg-gray-600 transition-colors"
                    >
                      {t("pickems.finalize.cancel")}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Pickems Table */}
            <div className="bg-gray-800 rounded-lg overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-900">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">{t("pickems.table.id")}</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">{t("pickems.table.name")}</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">{t("pickems.table.type")}</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">{t("pickems.table.raids")}</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">{t("pickems.table.voting")}</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">{t("pickems.table.status")}</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">{t("pickems.table.actions")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700">
                  {pickems.map((pickem) => {
                    const now = new Date();
                    const start = new Date(pickem.votingStart);
                    const end = new Date(pickem.votingEnd);
                    const isVotingOpen = now >= start && now <= end;
                    const hasEnded = now > end;

                    return (
                      <tr key={pickem.pickemId} className="hover:bg-gray-750">
                        <td className="px-4 py-3 text-white font-mono text-sm">{pickem.pickemId}</td>
                        <td className="px-4 py-3 text-white">{pickem.name}</td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs ${pickem.type === "rwf" ? "bg-purple-900/50 text-purple-400" : "bg-blue-900/50 text-blue-400"}`}
                          >
                            {pickem.type === "rwf" ? t("pickems.table.typeRwf") : t("pickems.table.typeRegular")}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-300 text-sm">
                          {pickem.type === "rwf"
                            ? t("pickems.table.rwfGuilds", { count: pickem.guildCount })
                            : pickem.raidIds.map((id) => raids.find((r) => r.id === id)?.name || id).join(", ")}
                        </td>
                        <td className="px-4 py-3 text-gray-400 text-sm">
                          <div>{new Date(pickem.votingStart).toLocaleDateString()}</div>
                          <div className="text-gray-500">→ {new Date(pickem.votingEnd).toLocaleDateString()}</div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col gap-1">
                            {pickem.active ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-green-900/50 text-green-400">{t("pickems.table.activeStatus")}</span>
                            ) : (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-gray-700 text-gray-400">{t("pickems.table.inactiveStatus")}</span>
                            )}
                            {isVotingOpen && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-amber-900/50 text-amber-400">
                                {t("pickems.table.votingOpenStatus")}
                              </span>
                            )}
                            {hasEnded && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-gray-600 text-gray-300">{t("pickems.table.endedStatus")}</span>
                            )}
                            {pickem.type === "rwf" && pickem.finalized && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-emerald-900/50 text-emerald-400">
                                {t("pickems.table.finalizedStatus")}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-2">
                            <button
                              onClick={() => {
                                setEditingPickem(pickem);
                                setPickemForm({
                                  pickemId: pickem.pickemId,
                                  name: pickem.name,
                                  type: pickem.type || "regular",
                                  raidIds: pickem.raidIds,
                                  guildCount: pickem.guildCount || (pickem.type === "rwf" ? 5 : 10),
                                  votingStart: new Date(pickem.votingStart).toISOString().slice(0, 16),
                                  votingEnd: new Date(pickem.votingEnd).toISOString().slice(0, 16),
                                  active: pickem.active,
                                  scoringConfig: pickem.scoringConfig,
                                  streakConfig: pickem.streakConfig,
                                });
                                setShowPickemForm(true);
                              }}
                              className="px-2 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700"
                            >
                              {t("pickems.table.edit")}
                            </button>
                            <button
                              onClick={async () => {
                                try {
                                  await api.toggleAdminPickem(pickem.pickemId);
                                  const pickemsData = await api.getAdminPickems();
                                  setPickems(pickemsData.pickems);
                                  setPickemStats(pickemsData.stats);
                                } catch (err) {
                                  console.error("Failed to toggle pickem:", err);
                                }
                              }}
                              className={`px-2 py-1 text-white text-xs rounded ${pickem.active ? "bg-orange-600 hover:bg-orange-700" : "bg-green-600 hover:bg-green-700"}`}
                            >
                              {pickem.active ? t("pickems.table.deactivate") : t("pickems.table.activate")}
                            </button>
                            <button
                              onClick={async () => {
                                if (confirm(t("pickems.table.deleteConfirm"))) {
                                  try {
                                    await api.deleteAdminPickem(pickem.pickemId);
                                    const pickemsData = await api.getAdminPickems();
                                    setPickems(pickemsData.pickems);
                                    setPickemStats(pickemsData.stats);
                                  } catch (err) {
                                    console.error("Failed to delete pickem:", err);
                                  }
                                }
                              }}
                              className="px-2 py-1 bg-red-600 text-white text-xs rounded hover:bg-red-700"
                            >
                              {t("pickems.table.delete")}
                            </button>
                            {/* RWF Finalization buttons */}
                            {pickem.type === "rwf" && !pickem.finalized && (
                              <button
                                onClick={async () => {
                                  // Fetch RWF guilds to populate the ranking order
                                  try {
                                    const rwfGuilds = await api.getPickemsRwfGuilds();
                                    setFinalizingPickem(pickem);
                                    setFinalizationRankings(rwfGuilds.map((g) => g.name));
                                    setShowFinalizeModal(true);
                                  } catch (err) {
                                    console.error("Failed to get RWF guilds:", err);
                                  }
                                }}
                                className="px-2 py-1 bg-emerald-600 text-white text-xs rounded hover:bg-emerald-700"
                              >
                                {t("pickems.table.finalize")}
                              </button>
                            )}
                            {pickem.type === "rwf" && pickem.finalized && (
                              <button
                                onClick={async () => {
                                  if (confirm(t("pickems.table.unfinalizeConfirm"))) {
                                    try {
                                      await api.unfinalizeRwfPickem(pickem.pickemId);
                                      const pickemsData = await api.getAdminPickems();
                                      setPickems(pickemsData.pickems);
                                      setPickemStats(pickemsData.stats);
                                    } catch (err) {
                                      console.error("Failed to unfinalize pickem:", err);
                                    }
                                  }
                                }}
                                className="px-2 py-1 bg-gray-600 text-white text-xs rounded hover:bg-gray-700"
                              >
                                {t("pickems.table.unfinalize")}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
