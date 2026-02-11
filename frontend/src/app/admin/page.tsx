"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import {
  triggerCalculateAllStatistics,
  triggerCalculateTierLists,
  triggerCheckTwitchStreams,
  triggerUpdateWorldRanks,
  triggerCalculateRaidAnalytics,
  triggerUpdateActiveGuilds,
  triggerUpdateInactiveGuilds,
  triggerUpdateAllGuilds,
  triggerRefetchRecentReports,
  triggerUpdateGuildCrests,
  triggerRescanDeathEvents,
  triggerRescanCharacters,
  getAdminGuildDetail,
  recalculateGuildStats,
  updateGuildWorldRanks,
  queueGuildRescan,
  queueGuildRescanDeaths,
  queueGuildRescanCharacters,
  verifyGuildReports,
} from "@/lib/api";
import {
  AdminUser,
  AdminGuild,
  AdminUserStats,
  AdminGuildStats,
  AdminOverview,
  AdminPickem,
  AdminPickemStats,
  ScoringConfig,
  StreakConfig,
  RaidInfo,
  PickemType,
  RateLimitStatus,
  RateLimitConfig,
  ProcessorStatus,
  QueueStatistics,
  QueueItem,
  ProcessingStatus,
  ErrorType,
  ProcessingQueueErrorItem,
  TriggerResponse,
  AdminGuildDetail,
  VerifyReportsResponse,
  CreateGuildInput,
  DeleteGuildPreviewResponse,
  DeleteGuildResponse,
} from "@/types";

type TabType = "overview" | "users" | "guilds" | "pickems" | "system";

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
  const [guildSearch, setGuildSearch] = useState("");
  const [guildSearchDebounced, setGuildSearchDebounced] = useState("");

  // Pickems data
  const [pickems, setPickems] = useState<AdminPickem[]>([]);
  const [pickemStats, setPickemStats] = useState<AdminPickemStats | null>(null);
  const [showPickemForm, setShowPickemForm] = useState(false);
  const [editingPickem, setEditingPickem] = useState<AdminPickem | null>(null);
  const [raids, setRaids] = useState<RaidInfo[]>([]);

  // System tab data (Rate Limits & Processing Queue)
  const [rateLimitStatus, setRateLimitStatus] = useState<RateLimitStatus | null>(null);
  const [rateLimitConfig, setRateLimitConfig] = useState<RateLimitConfig | null>(null);
  const [processorStatus, setProcessorStatus] = useState<ProcessorStatus | null>(null);
  const [queueStats, setQueueStats] = useState<QueueStatistics | null>(null);
  const [queueItems, setQueueItems] = useState<QueueItem[]>([]);
  const [queuePage, setQueuePage] = useState(1);
  const [queueTotalPages, setQueueTotalPages] = useState(1);
  const [queueFilter, setQueueFilter] = useState<ProcessingStatus | "">("");
  const [systemRefreshInterval, setSystemRefreshInterval] = useState<NodeJS.Timeout | null>(null);
  // Error tracking state
  const [errorItems, setErrorItems] = useState<ProcessingQueueErrorItem[]>([]);
  const [errorFilter, setErrorFilter] = useState<ErrorType | "all">("all");
  const [showErrorDetails, setShowErrorDetails] = useState(false);

  // Scheduler trigger status
  const [triggerLoading, setTriggerLoading] = useState<string | null>(null);
  const [triggerMessage, setTriggerMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [triggerCooldowns, setTriggerCooldowns] = useState<Record<string, boolean>>({});

  // Guild detail modal
  const [selectedGuild, setSelectedGuild] = useState<AdminGuildDetail | null>(null);
  const [showGuildDetail, setShowGuildDetail] = useState(false);
  const [guildDetailLoading, setGuildDetailLoading] = useState(false);
  const [verifyResult, setVerifyResult] = useState<VerifyReportsResponse | null>(null);

  // Add Guild modal
  const [showAddGuildModal, setShowAddGuildModal] = useState(false);
  const [addGuildForm, setAddGuildForm] = useState({
    name: "",
    realm: "",
    region: "eu",
    parent_guild: "",
    streamers: "",
  });
  const [addGuildLoading, setAddGuildLoading] = useState(false);

  // Delete Guild modal
  const [showDeleteGuildModal, setShowDeleteGuildModal] = useState(false);
  const [deleteGuildPreview, setDeleteGuildPreview] = useState<DeleteGuildPreviewResponse | null>(null);
  const [deleteGuildLoading, setDeleteGuildLoading] = useState(false);
  const [guildToDelete, setGuildToDelete] = useState<{ id: string; name: string } | null>(null);

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
          case "overview": {
            const [overviewData, rateLimitData, queueStatsData] = await Promise.all([api.getAdminOverview(), api.getAdminRateLimitStatus(), api.getAdminProcessingQueueStats()]);
            setOverview(overviewData);
            setRateLimitStatus(rateLimitData.status);
            setRateLimitConfig(rateLimitData.config);
            setProcessorStatus(queueStatsData.processor);
            setQueueStats(queueStatsData.queue);
            break;
          }

          case "users": {
            const [usersData, userStatsData] = await Promise.all([api.getAdminUsers(usersPage), api.getAdminUserStats()]);
            setUsers(usersData.users);
            setUsersTotalPages(usersData.pagination.totalPages);
            setUserStats(userStatsData);
            break;
          }

          case "guilds": {
            const [guildsData, guildStatsData] = await Promise.all([api.getAdminGuilds(guildsPage, 20, guildSearchDebounced || undefined), api.getAdminGuildStats()]);
            setGuilds(guildsData.guilds);
            setGuildsTotalPages(guildsData.pagination.totalPages);
            setGuildStats(guildStatsData);
            break;
          }

          case "pickems": {
            const [pickemsData, raidsData] = await Promise.all([api.getAdminPickems(), api.getRaids()]);
            setPickems(pickemsData.pickems);
            setPickemStats(pickemsData.stats);
            setRaids(raidsData);
            break;
          }

          case "system": {
            const [rateLimitData, queueStatsData, queueData, errorsData] = await Promise.all([
              api.getAdminRateLimitStatus(),
              api.getAdminProcessingQueueStats(),
              api.getAdminProcessingQueue(queuePage, 20, queueFilter || undefined),
              api.getAdminProcessingQueueErrors(1, 50),
            ]);
            setRateLimitStatus(rateLimitData.status);
            setRateLimitConfig(rateLimitData.config);
            setProcessorStatus(queueStatsData.processor);
            setQueueStats(queueStatsData.queue);
            setQueueItems(queueData.items);
            setQueueTotalPages(queueData.pagination.totalPages);
            setErrorItems(errorsData.items);
            break;
          }
        }
      } catch (err) {
        console.error("Error fetching admin data:", err);
        setError("Failed to load data");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [activeTab, user?.isAdmin, usersPage, guildsPage, queuePage, queueFilter, guildSearchDebounced]);

  // Debounce guild search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setGuildSearchDebounced(guildSearch);
      if (guildSearch !== guildSearchDebounced) {
        setGuildsPage(1); // Reset to first page when search changes
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [guildSearch]);

  // Auto-refresh system tab every 10 seconds
  useEffect(() => {
    if (activeTab === "system" && user?.isAdmin) {
      const interval = setInterval(async () => {
        try {
          const [rateLimitData, queueStatsData, queueData, errorsData] = await Promise.all([
            api.getAdminRateLimitStatus(),
            api.getAdminProcessingQueueStats(),
            api.getAdminProcessingQueue(queuePage, 20, queueFilter || undefined),
            api.getAdminProcessingQueueErrors(1, 50),
          ]);
          setRateLimitStatus(rateLimitData.status);
          setRateLimitConfig(rateLimitData.config);
          setProcessorStatus(queueStatsData.processor);
          setQueueStats(queueStatsData.queue);
          setQueueItems(queueData.items);
          setQueueTotalPages(queueData.pagination.totalPages);
          setErrorItems(errorsData.items);
        } catch (err) {
          console.error("Error refreshing system data:", err);
        }
      }, 10000);

      setSystemRefreshInterval(interval);
      return () => clearInterval(interval);
    } else if (systemRefreshInterval) {
      clearInterval(systemRefreshInterval);
      setSystemRefreshInterval(null);
    }
  }, [activeTab, user?.isAdmin, queuePage, queueFilter]);

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

  // Handler for scheduler triggers with 10-second cooldown per button
  const handleTrigger = async (triggerName: string, triggerFn: () => Promise<TriggerResponse>) => {
    setTriggerLoading(triggerName);
    setTriggerMessage(null);
    try {
      const result = await triggerFn();
      setTriggerMessage({ type: "success", text: result.message });

      // Set cooldown for this specific button
      setTriggerCooldowns((prev) => ({ ...prev, [triggerName]: true }));
      setTimeout(() => {
        setTriggerCooldowns((prev) => ({ ...prev, [triggerName]: false }));
      }, 10000);

      setTimeout(() => setTriggerMessage(null), 5000);
    } catch (error) {
      setTriggerMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Failed to trigger action",
      });
    } finally {
      setTriggerLoading(null);
    }
  };

  // Handler for updating guild world ranks
  const handleUpdateGuildWorldRanks = async (guildId: string, guildName: string) => {
    try {
      await updateGuildWorldRanks(guildId);
      setTriggerMessage({ type: "success", text: `World rankings update started for ${guildName}` });
      setTimeout(() => setTriggerMessage(null), 5000);
    } catch (error) {
      setTriggerMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Failed to update world ranks",
      });
    }
  };

  // Handler for opening guild detail modal
  const handleGuildClick = async (guildId: string) => {
    setGuildDetailLoading(true);
    setShowGuildDetail(true);
    setVerifyResult(null);
    try {
      const detail = await getAdminGuildDetail(guildId);
      setSelectedGuild(detail);
    } catch (error) {
      console.error("Failed to fetch guild details:", error);
      setSelectedGuild(null);
    } finally {
      setGuildDetailLoading(false);
    }
  };

  // Handler for verifying guild reports
  const handleVerifyReports = async (guildId: string) => {
    try {
      const result = await verifyGuildReports(guildId);
      setVerifyResult(result);
    } catch (error) {
      console.error("Failed to verify reports:", error);
    }
  };

  // Handler for queueing guild rescan
  const handleQueueRescan = async (guildId: string, guildName: string) => {
    try {
      await queueGuildRescan(guildId);
      setTriggerMessage({ type: "success", text: `${guildName} queued for rescan` });
      // Refresh guild detail
      const detail = await getAdminGuildDetail(guildId);
      setSelectedGuild(detail);
      setTimeout(() => setTriggerMessage(null), 5000);
    } catch (error) {
      setTriggerMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Failed to queue rescan",
      });
    }
  };

  // Handler for queueing guild death events rescan
  const handleQueueRescanDeaths = async (guildId: string, guildName: string) => {
    try {
      await queueGuildRescanDeaths(guildId);
      setTriggerMessage({ type: "success", text: `${guildName} queued for death events rescan` });
      if (selectedGuild) {
        const detail = await getAdminGuildDetail(guildId);
        setSelectedGuild(detail);
      }
      setTimeout(() => setTriggerMessage(null), 5000);
    } catch (error) {
      setTriggerMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Failed to queue death rescan",
      });
    }
  };

  // Handler for queueing guild character rescan
  const handleQueueRescanCharacters = async (guildId: string, guildName: string) => {
    try {
      await queueGuildRescanCharacters(guildId);
      setTriggerMessage({ type: "success", text: `${guildName} queued for character rescan` });
      if (selectedGuild) {
        const detail = await getAdminGuildDetail(guildId);
        setSelectedGuild(detail);
      }
      setTimeout(() => setTriggerMessage(null), 5000);
    } catch (error) {
      setTriggerMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Failed to queue character rescan",
      });
    }
  };

  // Handler for recalculating guild stats
  const handleRecalculateStats = async (guildId: string, guildName: string) => {
    try {
      await recalculateGuildStats(guildId);
      setTriggerMessage({ type: "success", text: `Statistics recalculation started for ${guildName}` });
      setTimeout(() => setTriggerMessage(null), 5000);
    } catch (error) {
      setTriggerMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Failed to recalculate stats",
      });
    }
  };

  // Handler for adding a new guild
  const handleAddGuild = async () => {
    if (!addGuildForm.name.trim() || !addGuildForm.realm.trim()) {
      setTriggerMessage({ type: "error", text: "Guild name and realm are required" });
      return;
    }

    setAddGuildLoading(true);
    try {
      const input: CreateGuildInput = {
        name: addGuildForm.name.trim(),
        realm: addGuildForm.realm.trim(),
        region: addGuildForm.region,
        parent_guild: addGuildForm.parent_guild.trim() || undefined,
        streamers: addGuildForm.streamers.trim()
          ? addGuildForm.streamers
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean)
          : undefined,
      };

      const result = await api.createAdminGuild(input);
      setTriggerMessage({ type: "success", text: result.message });
      setTimeout(() => setTriggerMessage(null), 5000);

      // Refresh guilds list
      const guildsData = await api.getAdminGuilds(guildsPage, 20, guildSearchDebounced || undefined);
      setGuilds(guildsData.guilds);
      setGuildsTotalPages(guildsData.pagination.totalPages);
      const guildStatsData = await api.getAdminGuildStats();
      setGuildStats(guildStatsData);

      // Close modal and reset form
      setShowAddGuildModal(false);
      setAddGuildForm({ name: "", realm: "", region: "eu", parent_guild: "", streamers: "" });
    } catch (error) {
      setTriggerMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Failed to create guild",
      });
    } finally {
      setAddGuildLoading(false);
    }
  };

  // Handler for clicking delete on a guild - fetches preview
  const handleDeleteGuildClick = async (guildId: string, guildName: string) => {
    setDeleteGuildLoading(true);
    setGuildToDelete({ id: guildId, name: guildName });
    try {
      const preview = await api.getAdminGuildDeletePreview(guildId);
      setDeleteGuildPreview(preview);
      setShowDeleteGuildModal(true);
    } catch (error) {
      setTriggerMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Failed to get delete preview",
      });
      setGuildToDelete(null);
    } finally {
      setDeleteGuildLoading(false);
    }
  };

  // Handler for confirming guild deletion
  const handleConfirmDeleteGuild = async () => {
    if (!guildToDelete) return;

    setDeleteGuildLoading(true);
    try {
      const result = await api.deleteAdminGuild(guildToDelete.id);
      setTriggerMessage({ type: "success", text: result.message });
      setTimeout(() => setTriggerMessage(null), 5000);

      // Refresh guilds list
      const guildsData = await api.getAdminGuilds(guildsPage, 20, guildSearchDebounced || undefined);
      setGuilds(guildsData.guilds);
      setGuildsTotalPages(guildsData.pagination.totalPages);
      const guildStatsData = await api.getAdminGuildStats();
      setGuildStats(guildStatsData);

      // Close modals
      setShowDeleteGuildModal(false);
      setDeleteGuildPreview(null);
      setGuildToDelete(null);
      setShowGuildDetail(false);
      setSelectedGuild(null);
    } catch (error) {
      setTriggerMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Failed to delete guild",
      });
    } finally {
      setDeleteGuildLoading(false);
    }
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
          {(["overview", "users", "guilds", "pickems", "system"] as TabType[]).map((tab) => (
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
        {!loading && activeTab === "overview" && (
          <div className="space-y-6">
            {/* Stats Summary */}
            {overview && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-gray-800 rounded-lg p-4">
                  <h3 className="text-gray-400 text-sm font-medium">{t("overview.totalUsers")}</h3>
                  <p className="text-3xl font-bold text-white mt-1">{overview.users.total}</p>
                  <p className="text-sm text-gray-500">
                    {overview.users.activeToday} {t("overview.activeToday")}
                  </p>
                </div>
                <div className="bg-gray-800 rounded-lg p-4">
                  <h3 className="text-gray-400 text-sm font-medium">{t("overview.totalGuilds")}</h3>
                  <p className="text-3xl font-bold text-white mt-1">{overview.guilds.total}</p>
                  <p className="text-sm text-gray-500">
                    {overview.guilds.updatedToday} {t("overview.updatedToday")}
                  </p>
                </div>

                {/* Rate Limit Widget */}
                {rateLimitStatus && (
                  <div className="bg-gray-800 rounded-lg p-4">
                    <h3 className="text-gray-400 text-sm font-medium flex items-center gap-1">
                      <span>⚡</span> WCL Rate Limit
                    </h3>
                    <p
                      className={`text-3xl font-bold mt-1 ${
                        rateLimitStatus.percentUsed >= 80 ? "text-red-400" : rateLimitStatus.percentUsed >= 60 ? "text-amber-400" : "text-green-400"
                      }`}
                    >
                      {rateLimitStatus.percentUsed.toFixed(0)}%
                    </p>
                    <div className="w-full bg-gray-600 rounded-full h-1.5 mt-2">
                      <div
                        className={`h-1.5 rounded-full ${rateLimitStatus.percentUsed >= 80 ? "bg-red-500" : rateLimitStatus.percentUsed >= 60 ? "bg-amber-500" : "bg-green-500"}`}
                        style={{ width: `${Math.min(100, rateLimitStatus.percentUsed)}%` }}
                      />
                    </div>
                    <p className="text-sm text-gray-500 mt-1">
                      {rateLimitStatus.pointsRemaining} pts left • Resets in {Math.floor(rateLimitStatus.resetInSeconds / 60)}m
                    </p>
                  </div>
                )}

                {/* Queue Status Widget */}
                {queueStats && (
                  <div className="bg-gray-800 rounded-lg p-4">
                    <h3 className="text-gray-400 text-sm font-medium flex items-center gap-1">
                      <span>📦</span> Processing Queue
                    </h3>
                    <div className="flex items-baseline gap-2 mt-1">
                      <span className="text-3xl font-bold text-white">{queueStats.pending + queueStats.inProgress}</span>
                      <span className="text-gray-500">active</span>
                    </div>
                    <p className="text-sm text-gray-500 mt-1">
                      {queueStats.inProgress > 0 && <span className="text-blue-400">{queueStats.inProgress} processing</span>}
                      {queueStats.inProgress > 0 && queueStats.failed > 0 && " • "}
                      {queueStats.failed > 0 && <span className="text-red-400">{queueStats.failed} failed</span>}
                      {queueStats.inProgress === 0 && queueStats.failed === 0 && "No active jobs"}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Trigger Message */}
            {triggerMessage && (
              <div className={`rounded-lg p-4 ${triggerMessage.type === "success" ? "bg-green-900/50 border border-green-500" : "bg-red-900/50 border border-red-500"}`}>
                <p className={triggerMessage.type === "success" ? "text-green-300" : "text-red-300"}>{triggerMessage.text}</p>
              </div>
            )}

            {/* Scheduler Triggers */}
            <div>
              <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                <span>⚙️</span> Manual Actions
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {/* Guild Updates */}
                <div className="bg-gray-800 rounded-lg p-4">
                  <h3 className="text-white font-medium mb-3 flex items-center gap-2">
                    <span>🏰</span> Guild Updates
                  </h3>
                  <div className="space-y-2">
                    <button
                      onClick={() => handleTrigger("active-guilds", triggerUpdateActiveGuilds)}
                      disabled={triggerLoading === "active-guilds" || triggerCooldowns["active-guilds"]}
                      className="w-full px-3 py-2 bg-gray-700 text-white text-sm rounded hover:bg-gray-600 disabled:opacity-50 flex items-center justify-between"
                    >
                      <span>Check Active Guilds</span>
                      {triggerLoading === "active-guilds" && <span className="animate-spin">⏳</span>}
                      {triggerCooldowns["active-guilds"] && <span className="text-xs text-gray-400">⏱️</span>}
                    </button>
                    <button
                      onClick={() => handleTrigger("inactive-guilds", triggerUpdateInactiveGuilds)}
                      disabled={triggerLoading === "inactive-guilds" || triggerCooldowns["inactive-guilds"]}
                      className="w-full px-3 py-2 bg-gray-700 text-white text-sm rounded hover:bg-gray-600 disabled:opacity-50 flex items-center justify-between"
                    >
                      <span>Check Inactive Guilds</span>
                      {triggerLoading === "inactive-guilds" && <span className="animate-spin">⏳</span>}
                      {triggerCooldowns["inactive-guilds"] && <span className="text-xs text-gray-400">⏱️</span>}
                    </button>
                    <button
                      onClick={() => handleTrigger("all-guilds", triggerUpdateAllGuilds)}
                      disabled={triggerLoading === "all-guilds" || triggerCooldowns["all-guilds"]}
                      className="w-full px-3 py-2 bg-gray-700 text-white text-sm rounded hover:bg-gray-600 disabled:opacity-50 flex items-center justify-between"
                    >
                      <span>Check All Guilds</span>
                      {triggerLoading === "all-guilds" && <span className="animate-spin">⏳</span>}
                      {triggerCooldowns["all-guilds"] && <span className="text-xs text-gray-400">⏱️</span>}
                    </button>
                    <button
                      onClick={() => handleTrigger("refetch-reports", triggerRefetchRecentReports)}
                      disabled={triggerLoading === "refetch-reports" || triggerCooldowns["refetch-reports"]}
                      className="w-full px-3 py-2 bg-gray-700 text-white text-sm rounded hover:bg-gray-600 disabled:opacity-50 flex items-center justify-between"
                    >
                      <span>Refetch Recent Reports</span>
                      {triggerLoading === "refetch-reports" && <span className="animate-spin">⏳</span>}
                      {triggerCooldowns["refetch-reports"] && <span className="text-xs text-gray-400">⏱️</span>}
                    </button>
                  </div>
                </div>

                {/* Statistics & Analytics */}
                <div className="bg-gray-800 rounded-lg p-4">
                  <h3 className="text-white font-medium mb-3 flex items-center gap-2">
                    <span>📊</span> Statistics & Analytics
                  </h3>
                  <div className="space-y-2">
                    <button
                      onClick={() => handleTrigger("all-statistics", () => triggerCalculateAllStatistics(true))}
                      disabled={triggerLoading === "all-statistics" || triggerCooldowns["all-statistics"]}
                      className="w-full px-3 py-2 bg-gray-700 text-white text-sm rounded hover:bg-gray-600 disabled:opacity-50 flex items-center justify-between"
                    >
                      <span>Calculate All Statistics</span>
                      {triggerLoading === "all-statistics" && <span className="animate-spin">⏳</span>}
                      {triggerCooldowns["all-statistics"] && <span className="text-xs text-gray-400">⏱️</span>}
                    </button>
                    <button
                      onClick={() => handleTrigger("tier-lists", triggerCalculateTierLists)}
                      disabled={triggerLoading === "tier-lists" || triggerCooldowns["tier-lists"]}
                      className="w-full px-3 py-2 bg-gray-700 text-white text-sm rounded hover:bg-gray-600 disabled:opacity-50 flex items-center justify-between"
                    >
                      <span>Calculate Tier Lists</span>
                      {triggerLoading === "tier-lists" && <span className="animate-spin">⏳</span>}
                      {triggerCooldowns["tier-lists"] && <span className="text-xs text-gray-400">⏱️</span>}
                    </button>
                    <button
                      onClick={() => handleTrigger("raid-analytics", triggerCalculateRaidAnalytics)}
                      disabled={triggerLoading === "raid-analytics" || triggerCooldowns["raid-analytics"]}
                      className="w-full px-3 py-2 bg-gray-700 text-white text-sm rounded hover:bg-gray-600 disabled:opacity-50 flex items-center justify-between"
                    >
                      <span>Calculate Raid Analytics</span>
                      {triggerLoading === "raid-analytics" && <span className="animate-spin">⏳</span>}
                      {triggerCooldowns["raid-analytics"] && <span className="text-xs text-gray-400">⏱️</span>}
                    </button>
                    <button
                      onClick={() => handleTrigger("world-ranks", triggerUpdateWorldRanks)}
                      disabled={triggerLoading === "world-ranks" || triggerCooldowns["world-ranks"]}
                      className="w-full px-3 py-2 bg-gray-700 text-white text-sm rounded hover:bg-gray-600 disabled:opacity-50 flex items-center justify-between"
                    >
                      <span>Update World Ranks</span>
                      {triggerLoading === "world-ranks" && <span className="animate-spin">⏳</span>}
                      {triggerCooldowns["world-ranks"] && <span className="text-xs text-gray-400">⏱️</span>}
                    </button>
                  </div>
                </div>

                {/* Other Actions */}
                <div className="bg-gray-800 rounded-lg p-4">
                  <h3 className="text-white font-medium mb-3 flex items-center gap-2">
                    <span>🔧</span> Other Actions
                  </h3>
                  <div className="space-y-2">
                    <button
                      onClick={() => handleTrigger("twitch-streams", triggerCheckTwitchStreams)}
                      disabled={triggerLoading === "twitch-streams" || triggerCooldowns["twitch-streams"]}
                      className="w-full px-3 py-2 bg-gray-700 text-white text-sm rounded hover:bg-gray-600 disabled:opacity-50 flex items-center justify-between"
                    >
                      <span>Check Twitch Streams</span>
                      {triggerLoading === "twitch-streams" && <span className="animate-spin">⏳</span>}
                      {triggerCooldowns["twitch-streams"] && <span className="text-xs text-gray-400">⏱️</span>}
                    </button>
                    <button
                      onClick={() => handleTrigger("guild-crests", triggerUpdateGuildCrests)}
                      disabled={triggerLoading === "guild-crests" || triggerCooldowns["guild-crests"]}
                      className="w-full px-3 py-2 bg-gray-700 text-white text-sm rounded hover:bg-gray-600 disabled:opacity-50 flex items-center justify-between"
                    >
                      <span>Update Guild Crests</span>
                      {triggerLoading === "guild-crests" && <span className="animate-spin">⏳</span>}
                      {triggerCooldowns["guild-crests"] && <span className="text-xs text-gray-400">⏱️</span>}
                    </button>
                    <button
                      onClick={() => handleTrigger("rescan-deaths", triggerRescanDeathEvents)}
                      disabled={triggerLoading === "rescan-deaths" || triggerCooldowns["rescan-deaths"]}
                      className="w-full px-3 py-2 bg-gray-700 text-white text-sm rounded hover:bg-gray-600 disabled:opacity-50 flex items-center justify-between"
                    >
                      <span>Rescan Death Events</span>
                      {triggerLoading === "rescan-deaths" && <span className="animate-spin">⏳</span>}
                      {triggerCooldowns["rescan-deaths"] && <span className="text-xs text-gray-400">⏱️</span>}
                    </button>
                    <button
                      onClick={() => handleTrigger("rescan-characters", triggerRescanCharacters)}
                      disabled={triggerLoading === "rescan-characters" || triggerCooldowns["rescan-characters"]}
                      className="w-full px-3 py-2 bg-gray-700 text-white text-sm rounded hover:bg-gray-600 disabled:opacity-50 flex items-center justify-between"
                    >
                      <span>Rescan Characters</span>
                      {triggerLoading === "rescan-characters" && <span className="animate-spin">⏳</span>}
                      {triggerCooldowns["rescan-characters"] && <span className="text-xs text-gray-400">⏱️</span>}
                    </button>
                  </div>
                </div>
              </div>
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
            {/* Trigger Message (reuse from overview) */}
            {triggerMessage && (
              <div className={`rounded-lg p-4 mb-4 ${triggerMessage.type === "success" ? "bg-green-900/50 border border-green-500" : "bg-red-900/50 border border-red-500"}`}>
                <p className={triggerMessage.type === "success" ? "text-green-300" : "text-red-300"}>{triggerMessage.text}</p>
              </div>
            )}

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

            {/* Add Guild Button and Search */}
            <div className="mb-4 flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
              <button onClick={() => setShowAddGuildModal(true)} className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors">
                + Add Guild
              </button>

              {/* Guild Search */}
              <div className="relative w-full sm:w-80">
                <input
                  type="text"
                  value={guildSearch}
                  onChange={(e) => setGuildSearch(e.target.value)}
                  placeholder="Search by guild name or realm..."
                  className="w-full px-4 py-2 pl-10 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                />
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                {guildSearch && (
                  <button onClick={() => setGuildSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white">
                    ×
                  </button>
                )}
              </div>
            </div>

            {/* Guilds Table */}
            <div className="bg-gray-800 rounded-lg overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-900">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">{t("guilds.name")}</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">{t("guilds.realm")}</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">{t("guilds.faction")}</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">WCL Status</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">{t("guilds.status")}</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">{t("guilds.lastFetched")}</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700">
                  {guilds.map((guild) => (
                    <tr key={guild.id} className="hover:bg-gray-750 cursor-pointer" onClick={() => handleGuildClick(guild.id)}>
                      <td className="px-4 py-3 text-white">
                        {guild.name}
                        {guild.parentGuild && <span className="text-gray-500 text-sm ml-2">({guild.parentGuild})</span>}
                      </td>
                      <td className="px-4 py-3 text-gray-300">{guild.realm}</td>
                      <td className="px-4 py-3">
                        <span className={`${guild.faction === "Horde" ? "text-red-400" : "text-blue-400"}`}>{guild.faction || "-"}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`px-2 py-1 rounded text-xs font-medium ${
                            guild.wclStatus === "active"
                              ? "bg-green-900 text-green-300"
                              : guild.wclStatus === "not_found"
                                ? "bg-red-900 text-red-300"
                                : guild.wclStatus === "unclaimed"
                                  ? "bg-amber-900 text-amber-300"
                                  : "bg-gray-700 text-gray-300"
                          }`}
                        >
                          {(guild.wclStatus || "unknown").replace("_", " ")}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {guild.isCurrentlyRaiding ? (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-green-900/50 text-green-400">{t("guilds.raiding")}</span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-gray-700 text-gray-400">{t("guilds.idle")}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-400 text-sm">{guild.lastFetched ? formatDate(guild.lastFetched) : "-"}</td>
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <div className="flex gap-1">
                          <button
                            onClick={() => handleQueueRescan(guild.id, guild.name)}
                            className="px-2 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700"
                            title="Queue for full rescan"
                          >
                            Rescan
                          </button>
                          <button
                            onClick={() => handleQueueRescanDeaths(guild.id, guild.name)}
                            className="px-2 py-1 bg-teal-600 text-white text-xs rounded hover:bg-teal-700"
                            title="Rescan death events"
                          >
                            Deaths
                          </button>
                          <button
                            onClick={() => handleQueueRescanCharacters(guild.id, guild.name)}
                            className="px-2 py-1 bg-cyan-600 text-white text-xs rounded hover:bg-cyan-700"
                            title="Rescan characters"
                          >
                            Chars
                          </button>
                          <button
                            onClick={() => handleRecalculateStats(guild.id, guild.name)}
                            className="px-2 py-1 bg-purple-600 text-white text-xs rounded hover:bg-purple-700"
                            title="Recalculate statistics"
                          >
                            Stats
                          </button>
                          <button
                            onClick={() => handleUpdateGuildWorldRanks(guild.id, guild.name)}
                            className="px-2 py-1 bg-amber-600 text-white text-xs rounded hover:bg-amber-700"
                            title="Update world rankings for all raids"
                          >
                            Ranks
                          </button>
                          <button
                            onClick={() => handleDeleteGuildClick(guild.id, guild.name)}
                            className="px-2 py-1 bg-red-600 text-white text-xs rounded hover:bg-red-700"
                            title="Delete guild"
                            disabled={deleteGuildLoading && guildToDelete?.id === guild.id}
                          >
                            {deleteGuildLoading && guildToDelete?.id === guild.id ? "..." : "Delete"}
                          </button>
                        </div>
                      </td>
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

        {/* System Tab - Rate Limits & Processing Queue */}
        {!loading && activeTab === "system" && (
          <div className="space-y-6">
            {/* Rate Limit Status */}
            <div>
              <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                <span>⚡</span> WarcraftLogs Rate Limit
              </h2>
              {rateLimitStatus && rateLimitConfig && (
                <div className="bg-gray-800 rounded-lg p-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                    <div className="bg-gray-700 rounded-lg p-4">
                      <h4 className="text-gray-400 text-sm">Points Used</h4>
                      <p className="text-2xl font-bold text-white">
                        {rateLimitStatus.pointsUsed} / {rateLimitStatus.pointsMax}
                      </p>
                      <p className="text-sm text-gray-500">{rateLimitStatus.pointsRemaining} remaining</p>
                    </div>
                    <div className="bg-gray-700 rounded-lg p-4">
                      <h4 className="text-gray-400 text-sm">Usage</h4>
                      <p
                        className={`text-2xl font-bold ${
                          rateLimitStatus.percentUsed >= 80 ? "text-red-400" : rateLimitStatus.percentUsed >= 60 ? "text-amber-400" : "text-green-400"
                        }`}
                      >
                        {rateLimitStatus.percentUsed.toFixed(1)}%
                      </p>
                      <div className="w-full bg-gray-600 rounded-full h-2 mt-2">
                        <div
                          className={`h-2 rounded-full transition-all ${
                            rateLimitStatus.percentUsed >= 80 ? "bg-red-500" : rateLimitStatus.percentUsed >= 60 ? "bg-amber-500" : "bg-green-500"
                          }`}
                          style={{ width: `${Math.min(100, rateLimitStatus.percentUsed)}%` }}
                        />
                      </div>
                    </div>
                    <div className="bg-gray-700 rounded-lg p-4">
                      <h4 className="text-gray-400 text-sm">Resets In</h4>
                      <p className="text-2xl font-bold text-white">
                        {Math.floor(rateLimitStatus.resetInSeconds / 60)}m {rateLimitStatus.resetInSeconds % 60}s
                      </p>
                      <p className="text-sm text-gray-500">{new Date(rateLimitStatus.resetAt).toLocaleTimeString()}</p>
                    </div>
                    <div className="bg-gray-700 rounded-lg p-4">
                      <h4 className="text-gray-400 text-sm">Status</h4>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={`inline-block w-3 h-3 rounded-full ${rateLimitStatus.isPaused ? "bg-red-500" : "bg-green-500"}`} />
                        <span className={`text-lg font-bold ${rateLimitStatus.isPaused ? "text-red-400" : "text-green-400"}`}>
                          {rateLimitStatus.isPaused ? "Paused" : "Active"}
                        </span>
                      </div>
                      <button
                        onClick={async () => {
                          try {
                            await api.setAdminRateLimitPause(!rateLimitStatus.isPaused);
                            const data = await api.getAdminRateLimitStatus();
                            setRateLimitStatus(data.status);
                          } catch (err) {
                            console.error("Failed to toggle pause:", err);
                          }
                        }}
                        className={`mt-2 px-3 py-1 text-sm rounded ${
                          rateLimitStatus.isPaused ? "bg-green-600 hover:bg-green-700 text-white" : "bg-red-600 hover:bg-red-700 text-white"
                        }`}
                      >
                        {rateLimitStatus.isPaused ? "Resume" : "Pause"}
                      </button>
                    </div>
                  </div>
                  <div className="text-sm text-gray-500">
                    <span className="mr-4">Reserve: {rateLimitConfig.liveOperationsReserve}%</span>
                    <span className="mr-4">Warning: {rateLimitConfig.warningThreshold}%</span>
                    <span>Pause at: {rateLimitConfig.pauseThreshold}%</span>
                  </div>
                </div>
              )}
            </div>

            {/* Processing Queue */}
            <div>
              <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                <span>📦</span> Guild Processing Queue
              </h2>

              {/* Processor Status & Queue Stats */}
              {processorStatus && queueStats && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4 mb-6">
                  <div className="bg-gray-800 rounded-lg p-4">
                    <h4 className="text-gray-400 text-sm">Processor</h4>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`inline-block w-3 h-3 rounded-full ${processorStatus.isRunning && !processorStatus.isPaused ? "bg-green-500" : "bg-red-500"}`} />
                      <span className="text-lg font-bold text-white">{processorStatus.isPaused ? "Paused" : processorStatus.isRunning ? "Running" : "Stopped"}</span>
                    </div>
                    {processorStatus.currentGuild && <p className="text-sm text-gray-400 mt-1 truncate">{processorStatus.currentGuild}</p>}
                    <button
                      onClick={async () => {
                        try {
                          await api.setAdminProcessingQueuePauseAll(!processorStatus.isPaused);
                          const data = await api.getAdminProcessingQueueStats();
                          setProcessorStatus(data.processor);
                        } catch (err) {
                          console.error("Failed to toggle processor:", err);
                        }
                      }}
                      className={`mt-2 px-3 py-1 text-sm rounded ${
                        processorStatus.isPaused ? "bg-green-600 hover:bg-green-700 text-white" : "bg-red-600 hover:bg-red-700 text-white"
                      }`}
                    >
                      {processorStatus.isPaused ? "Resume All" : "Pause All"}
                    </button>
                  </div>
                  <div className="bg-gray-800 rounded-lg p-4">
                    <h4 className="text-gray-400 text-sm">Pending</h4>
                    <p className="text-2xl font-bold text-amber-400">{queueStats.pending}</p>
                  </div>
                  <div className="bg-gray-800 rounded-lg p-4">
                    <h4 className="text-gray-400 text-sm">In Progress</h4>
                    <p className="text-2xl font-bold text-blue-400">{queueStats.inProgress}</p>
                  </div>
                  <div className="bg-gray-800 rounded-lg p-4">
                    <h4 className="text-gray-400 text-sm">Completed</h4>
                    <p className="text-2xl font-bold text-green-400">{queueStats.completed}</p>
                    {queueStats.completed > 0 && (
                      <button
                        onClick={async () => {
                          if (confirm(`Clear all ${queueStats.completed} completed guilds from the queue?`)) {
                            try {
                              const result = await api.clearAdminProcessingQueueCompleted();
                              setTriggerMessage({ type: "success", text: result.message });
                              setTimeout(() => setTriggerMessage(null), 5000);
                              // Refresh queue stats
                              const statsData = await api.getAdminProcessingQueueStats();
                              setQueueStats(statsData.queue);
                              setProcessorStatus(statsData.processor);
                              // Refresh queue items if viewing completed
                              if (queueFilter === "completed" || queueFilter === "") {
                                const queueData = await api.getAdminProcessingQueue(queuePage, 20, queueFilter || undefined);
                                setQueueItems(queueData.items);
                                setQueueTotalPages(queueData.pagination.totalPages);
                              }
                            } catch (err) {
                              console.error("Failed to clear completed:", err);
                              setTriggerMessage({ type: "error", text: err instanceof Error ? err.message : "Failed to clear completed guilds" });
                            }
                          }
                        }}
                        className="mt-2 px-2 py-1 text-xs bg-gray-600 text-gray-200 rounded hover:bg-gray-500 transition-colors"
                      >
                        Clear All
                      </button>
                    )}
                  </div>
                  <div className="bg-gray-800 rounded-lg p-4">
                    <h4 className="text-gray-400 text-sm">Failed</h4>
                    <p className="text-2xl font-bold text-red-400">{queueStats.failed}</p>
                  </div>
                  <div className="bg-gray-800 rounded-lg p-4">
                    <h4 className="text-gray-400 text-sm">Paused</h4>
                    <p className="text-2xl font-bold text-gray-400">{queueStats.paused}</p>
                  </div>
                </div>
              )}

              {/* Queue Filter */}
              <div className="flex gap-2 mb-4">
                <select
                  value={queueFilter}
                  onChange={(e) => {
                    setQueueFilter(e.target.value as ProcessingStatus | "");
                    setQueuePage(1);
                  }}
                  className="bg-gray-700 text-white rounded-lg px-3 py-2"
                >
                  <option value="">All Statuses</option>
                  <option value="pending">Pending</option>
                  <option value="in_progress">In Progress</option>
                  <option value="completed">Completed</option>
                  <option value="failed">Failed</option>
                  <option value="paused">Paused</option>
                </select>
              </div>

              {/* Error Breakdown */}
              {queueStats?.errorBreakdown && (
                <div className="mb-6">
                  <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                    <span>⚠️</span> Error Breakdown
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                    <div className="bg-gray-800 rounded-lg p-3 border-l-4 border-red-500">
                      <h4 className="text-gray-400 text-xs uppercase">Guild Not Found</h4>
                      <p className="text-xl font-bold text-red-400">{queueStats.errorBreakdown.guild_not_found}</p>
                      <span className="text-xs text-red-300">Permanent</span>
                    </div>
                    <div className="bg-gray-800 rounded-lg p-3 border-l-4 border-yellow-500">
                      <h4 className="text-gray-400 text-xs uppercase">Rate Limited</h4>
                      <p className="text-xl font-bold text-yellow-400">{queueStats.errorBreakdown.rate_limited}</p>
                      <span className="text-xs text-yellow-300">Retryable</span>
                    </div>
                    <div className="bg-gray-800 rounded-lg p-3 border-l-4 border-orange-500">
                      <h4 className="text-gray-400 text-xs uppercase">Network Error</h4>
                      <p className="text-xl font-bold text-orange-400">{queueStats.errorBreakdown.network_error}</p>
                      <span className="text-xs text-orange-300">Retryable</span>
                    </div>
                    <div className="bg-gray-800 rounded-lg p-3 border-l-4 border-purple-500">
                      <h4 className="text-gray-400 text-xs uppercase">API Error</h4>
                      <p className="text-xl font-bold text-purple-400">{queueStats.errorBreakdown.api_error}</p>
                      <span className="text-xs text-purple-300">Retryable</span>
                    </div>
                    <div className="bg-gray-800 rounded-lg p-3 border-l-4 border-blue-500">
                      <h4 className="text-gray-400 text-xs uppercase">Database Error</h4>
                      <p className="text-xl font-bold text-blue-400">{queueStats.errorBreakdown.database_error}</p>
                      <span className="text-xs text-blue-300">Retryable</span>
                    </div>
                    <div className="bg-gray-800 rounded-lg p-3 border-l-4 border-gray-500">
                      <h4 className="text-gray-400 text-xs uppercase">Unknown</h4>
                      <p className="text-xl font-bold text-gray-400">{queueStats.errorBreakdown.unknown}</p>
                      <span className="text-xs text-gray-300">Needs Review</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Recent Errors Section */}
              <div className="mb-6">
                <div className="flex items-center justify-between mb-3">
                  <button
                    onClick={() => setShowErrorDetails(!showErrorDetails)}
                    className="flex items-center gap-2 text-lg font-semibold text-white hover:text-amber-400 transition-colors"
                  >
                    <span>{showErrorDetails ? "▼" : "▶"}</span>
                    <span>🔴</span> Recent Errors ({errorItems.length})
                  </button>

                  {/* Clear Errors Buttons */}
                  {queueStats && queueStats.failed > 0 && (
                    <div className="flex gap-2">
                      <button
                        onClick={async () => {
                          if (confirm(`Reset ${queueStats.failed} failed guilds for retry? This will clear their error state and move them back to pending.`)) {
                            try {
                              const result = await api.clearAdminProcessingQueueErrors("reset");
                              setTriggerMessage({ type: "success", text: result.message });
                              setTimeout(() => setTriggerMessage(null), 5000);
                              // Refresh stats and errors
                              const [statsData, errorsData] = await Promise.all([api.getAdminProcessingQueueStats(), api.getAdminProcessingQueueErrors(1, 50)]);
                              setQueueStats(statsData.queue);
                              setProcessorStatus(statsData.processor);
                              setErrorItems(errorsData.items);
                              // Refresh queue items
                              const queueData = await api.getAdminProcessingQueue(queuePage, 20, queueFilter || undefined);
                              setQueueItems(queueData.items);
                              setQueueTotalPages(queueData.pagination.totalPages);
                            } catch (err) {
                              console.error("Failed to reset errors:", err);
                              setTriggerMessage({ type: "error", text: err instanceof Error ? err.message : "Failed to reset errors" });
                            }
                          }
                        }}
                        className="px-3 py-1.5 text-sm bg-amber-600 text-white rounded hover:bg-amber-700 transition-colors"
                      >
                        Reset for Retry
                      </button>
                      <button
                        onClick={async () => {
                          if (confirm(`Remove ${queueStats.failed} failed guilds from the queue? This action cannot be undone.`)) {
                            try {
                              const result = await api.clearAdminProcessingQueueErrors("remove");
                              setTriggerMessage({ type: "success", text: result.message });
                              setTimeout(() => setTriggerMessage(null), 5000);
                              // Refresh stats and errors
                              const [statsData, errorsData] = await Promise.all([api.getAdminProcessingQueueStats(), api.getAdminProcessingQueueErrors(1, 50)]);
                              setQueueStats(statsData.queue);
                              setProcessorStatus(statsData.processor);
                              setErrorItems(errorsData.items);
                              // Refresh queue items
                              const queueData = await api.getAdminProcessingQueue(queuePage, 20, queueFilter || undefined);
                              setQueueItems(queueData.items);
                              setQueueTotalPages(queueData.pagination.totalPages);
                            } catch (err) {
                              console.error("Failed to remove errors:", err);
                              setTriggerMessage({ type: "error", text: err instanceof Error ? err.message : "Failed to remove failed guilds" });
                            }
                          }
                        }}
                        className="px-3 py-1.5 text-sm bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
                      >
                        Remove All Failed
                      </button>
                    </div>
                  )}
                </div>

                {showErrorDetails && (
                  <div className="space-y-4">
                    {/* Error Type Filter */}
                    <div className="flex gap-2">
                      <select value={errorFilter} onChange={(e) => setErrorFilter(e.target.value as ErrorType | "all")} className="bg-gray-700 text-white rounded-lg px-3 py-2">
                        <option value="all">All Error Types</option>
                        <option value="guild_not_found">Guild Not Found</option>
                        <option value="rate_limited">Rate Limited</option>
                        <option value="network_error">Network Error</option>
                        <option value="api_error">API Error</option>
                        <option value="database_error">Database Error</option>
                        <option value="unknown">Unknown</option>
                      </select>
                    </div>

                    {/* Errors Table */}
                    <div className="bg-gray-800 rounded-lg overflow-hidden">
                      <table className="w-full">
                        <thead className="bg-gray-900">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Guild</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Status</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Error Type</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Reason</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Time</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-700">
                          {errorItems
                            .filter((item) => errorFilter === "all" || item.errorType === errorFilter)
                            .map((item) => {
                              const getErrorTypeBadge = (errorType?: ErrorType) => {
                                switch (errorType) {
                                  case "guild_not_found":
                                    return "bg-red-900 text-red-300 border border-red-500";
                                  case "rate_limited":
                                    return "bg-yellow-900 text-yellow-300";
                                  case "network_error":
                                    return "bg-orange-900 text-orange-300";
                                  case "api_error":
                                    return "bg-purple-900 text-purple-300";
                                  case "database_error":
                                    return "bg-blue-900 text-blue-300";
                                  default:
                                    return "bg-gray-700 text-gray-300";
                                }
                              };

                              const formatErrorType = (errorType?: ErrorType) => {
                                if (!errorType) return "Unknown";
                                return errorType.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
                              };

                              return (
                                <tr key={item.id} className={`hover:bg-gray-750 ${item.isPermanentError ? "bg-red-950/30" : ""}`}>
                                  <td className="px-4 py-3">
                                    <div className="text-white font-medium">{item.guildName}</div>
                                    <div className="text-gray-400 text-sm">
                                      {item.guildRealm}-{item.guildRegion.toUpperCase()}
                                    </div>
                                    {item.jobType && item.jobType !== "full_rescan" && (
                                      <span
                                        className={`mt-1 inline-block px-2 py-0.5 rounded text-xs font-medium ${
                                          item.jobType === "rescan_deaths" ? "bg-teal-900 text-teal-300" : "bg-cyan-900 text-cyan-300"
                                        }`}
                                      >
                                        {item.jobType === "rescan_deaths" ? "Deaths" : "Characters"}
                                      </span>
                                    )}
                                  </td>
                                  <td className="px-4 py-3">
                                    <span
                                      className={`px-2 py-1 rounded text-xs font-medium ${
                                        item.status === "failed"
                                          ? "bg-red-900 text-red-300"
                                          : item.status === "paused"
                                            ? "bg-gray-700 text-gray-300"
                                            : "bg-amber-900 text-amber-300"
                                      }`}
                                    >
                                      {item.status.replace("_", " ")}
                                    </span>
                                    {item.errorCount > 1 && <span className="ml-2 text-xs text-gray-400">({item.errorCount}x)</span>}
                                  </td>
                                  <td className="px-4 py-3">
                                    <span className={`px-2 py-1 rounded text-xs font-medium ${getErrorTypeBadge(item.errorType)}`}>{formatErrorType(item.errorType)}</span>
                                    {item.isPermanentError && (
                                      <span className="ml-2 text-xs text-red-400 font-semibold" title="This error is permanent and will not be retried">
                                        PERMANENT
                                      </span>
                                    )}
                                  </td>
                                  <td className="px-4 py-3">
                                    <span className="text-gray-300 text-sm" title={item.lastError}>
                                      {item.failureReason || item.lastError || "No details available"}
                                    </span>
                                  </td>
                                  <td className="px-4 py-3 text-gray-400 text-sm">{item.lastErrorAt ? formatDate(item.lastErrorAt) : "-"}</td>
                                </tr>
                              );
                            })}
                          {errorItems.filter((item) => errorFilter === "all" || item.errorType === errorFilter).length === 0 && (
                            <tr>
                              <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                                No errors
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>

              {/* Queue Table */}
              <div className="bg-gray-800 rounded-lg overflow-hidden">
                <table className="w-full">
                  <thead className="bg-gray-900">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Guild</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Progress</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Reports</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Fights</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Last Activity</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-700">
                    {queueItems.map((item) => (
                      <tr key={item.id} className="hover:bg-gray-750">
                        <td className="px-4 py-3">
                          <div className="text-white font-medium">{item.guildName}</div>
                          <div className="text-gray-400 text-sm">
                            {item.guildRealm}-{item.guildRegion.toUpperCase()}
                          </div>
                          {item.jobType && item.jobType !== "full_rescan" && (
                            <span
                              className={`mt-1 inline-block px-2 py-0.5 rounded text-xs font-medium ${
                                item.jobType === "rescan_deaths" ? "bg-teal-900 text-teal-300" : "bg-cyan-900 text-cyan-300"
                              }`}
                            >
                              {item.jobType === "rescan_deaths" ? "Deaths" : "Characters"}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`px-2 py-1 rounded text-xs font-medium ${
                              item.status === "completed"
                                ? "bg-green-900 text-green-300"
                                : item.status === "in_progress"
                                  ? "bg-blue-900 text-blue-300"
                                  : item.status === "pending"
                                    ? "bg-amber-900 text-amber-300"
                                    : item.status === "failed"
                                      ? "bg-red-900 text-red-300"
                                      : "bg-gray-700 text-gray-300"
                            }`}
                          >
                            {item.status.replace("_", " ")}
                          </span>
                          {item.errorCount > 0 && (
                            <span className="ml-2 text-xs text-red-400" title={item.lastError}>
                              ({item.errorCount} errors)
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-300">{item.progress.percentComplete}%</td>
                        <td className="px-4 py-3 text-gray-300">
                          {item.progress.reportsFetched}
                          {item.progress.totalReportsEstimate > 0 && <span className="text-gray-500"> / ~{item.progress.totalReportsEstimate}</span>}
                        </td>
                        <td className="px-4 py-3 text-gray-300">{item.progress.fightsSaved}</td>
                        <td className="px-4 py-3 text-gray-400 text-sm">{formatDate(item.lastActivityAt)}</td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1">
                            {(item.status === "pending" || item.status === "in_progress") && (
                              <button
                                onClick={async () => {
                                  try {
                                    await api.pauseAdminProcessingQueueGuild(item.guildId);
                                    const data = await api.getAdminProcessingQueue(queuePage, 20, queueFilter || undefined);
                                    setQueueItems(data.items);
                                  } catch (err) {
                                    console.error("Failed to pause:", err);
                                  }
                                }}
                                className="px-2 py-1 bg-amber-600 text-white text-xs rounded hover:bg-amber-700"
                              >
                                Pause
                              </button>
                            )}
                            {(item.status === "paused" || item.status === "failed") && (
                              <button
                                onClick={async () => {
                                  try {
                                    await api.resumeAdminProcessingQueueGuild(item.guildId);
                                    const data = await api.getAdminProcessingQueue(queuePage, 20, queueFilter || undefined);
                                    setQueueItems(data.items);
                                  } catch (err) {
                                    console.error("Failed to resume:", err);
                                  }
                                }}
                                className="px-2 py-1 bg-green-600 text-white text-xs rounded hover:bg-green-700"
                              >
                                Resume
                              </button>
                            )}
                            {item.status === "failed" && (
                              <button
                                onClick={async () => {
                                  try {
                                    await api.retryAdminProcessingQueueGuild(item.guildId);
                                    const data = await api.getAdminProcessingQueue(queuePage, 20, queueFilter || undefined);
                                    setQueueItems(data.items);
                                  } catch (err) {
                                    console.error("Failed to retry:", err);
                                  }
                                }}
                                className="px-2 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700"
                              >
                                Retry
                              </button>
                            )}
                            <button
                              onClick={async () => {
                                if (confirm(`Remove ${item.guildName} from queue?`)) {
                                  try {
                                    await api.removeAdminProcessingQueueGuild(item.guildId);
                                    const data = await api.getAdminProcessingQueue(queuePage, 20, queueFilter || undefined);
                                    setQueueItems(data.items);
                                    const statsData = await api.getAdminProcessingQueueStats();
                                    setQueueStats(statsData.queue);
                                  } catch (err) {
                                    console.error("Failed to remove:", err);
                                  }
                                }
                              }}
                              className="px-2 py-1 bg-red-600 text-white text-xs rounded hover:bg-red-700"
                            >
                              Remove
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {queueItems.length === 0 && (
                      <tr>
                        <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                          No items in queue
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>

                {/* Pagination */}
                {queueTotalPages > 1 && (
                  <div className="px-4 py-3 bg-gray-900 flex items-center justify-between">
                    <button
                      onClick={() => setQueuePage((p) => Math.max(1, p - 1))}
                      disabled={queuePage === 1}
                      className="px-3 py-1 bg-gray-700 text-gray-300 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Previous
                    </button>
                    <span className="text-gray-400">
                      Page {queuePage} of {queueTotalPages}
                    </span>
                    <button
                      onClick={() => setQueuePage((p) => Math.min(queueTotalPages, p + 1))}
                      disabled={queuePage === queueTotalPages}
                      className="px-3 py-1 bg-gray-700 text-gray-300 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Next
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Guild Detail Modal */}
        {showGuildDetail && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
            <div className="bg-gray-800 rounded-lg max-w-3xl w-full max-h-[90vh] overflow-y-auto">
              {/* Modal Header */}
              <div className="flex items-center justify-between p-4 border-b border-gray-700">
                <h2 className="text-xl font-bold text-white">{guildDetailLoading ? "Loading..." : selectedGuild?.name || "Guild Details"}</h2>
                <button
                  onClick={() => {
                    setShowGuildDetail(false);
                    setSelectedGuild(null);
                    setVerifyResult(null);
                  }}
                  className="text-gray-400 hover:text-white text-2xl"
                >
                  ×
                </button>
              </div>

              {/* Modal Content */}
              <div className="p-4">
                {guildDetailLoading ? (
                  <div className="text-center py-8 text-gray-400">Loading guild details...</div>
                ) : selectedGuild ? (
                  <div className="space-y-6">
                    {/* Basic Info */}
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      <div>
                        <h4 className="text-gray-400 text-sm">Realm</h4>
                        <p className="text-white">{selectedGuild.realm}</p>
                      </div>
                      <div>
                        <h4 className="text-gray-400 text-sm">Region</h4>
                        <p className="text-white uppercase">{selectedGuild.region}</p>
                      </div>
                      <div>
                        <h4 className="text-gray-400 text-sm">Faction</h4>
                        <p className={selectedGuild.faction === "Horde" ? "text-red-400" : "text-blue-400"}>{selectedGuild.faction || "Unknown"}</p>
                      </div>
                      <div>
                        <h4 className="text-gray-400 text-sm">WCL Status</h4>
                        <span
                          className={`px-2 py-1 rounded text-xs font-medium ${
                            selectedGuild.wclStatus === "active"
                              ? "bg-green-900 text-green-300"
                              : selectedGuild.wclStatus === "not_found"
                                ? "bg-red-900 text-red-300"
                                : selectedGuild.wclStatus === "unclaimed"
                                  ? "bg-amber-900 text-amber-300"
                                  : "bg-gray-700 text-gray-300"
                          }`}
                        >
                          {selectedGuild.wclStatus.replace("_", " ")}
                        </span>
                        {selectedGuild.wclNotFoundCount > 0 && <span className="ml-2 text-xs text-red-400">({selectedGuild.wclNotFoundCount} failures)</span>}
                      </div>
                      <div>
                        <h4 className="text-gray-400 text-sm">Activity</h4>
                        <span
                          className={`px-2 py-1 rounded text-xs font-medium ${
                            selectedGuild.activityStatus === "active" ? "bg-green-900 text-green-300" : "bg-gray-700 text-gray-300"
                          }`}
                        >
                          {selectedGuild.activityStatus || "unknown"}
                        </span>
                      </div>
                      <div>
                        <h4 className="text-gray-400 text-sm">Raiding</h4>
                        <span className={`px-2 py-1 rounded text-xs font-medium ${selectedGuild.isCurrentlyRaiding ? "bg-green-900 text-green-300" : "bg-gray-700 text-gray-300"}`}>
                          {selectedGuild.isCurrentlyRaiding ? "Yes" : "No"}
                        </span>
                      </div>
                    </div>

                    {/* Data Stats */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="bg-gray-700 rounded-lg p-3">
                        <h4 className="text-gray-400 text-sm">Reports</h4>
                        <p className="text-2xl font-bold text-white">{selectedGuild.reportCount}</p>
                      </div>
                      <div className="bg-gray-700 rounded-lg p-3">
                        <h4 className="text-gray-400 text-sm">Fights</h4>
                        <p className="text-2xl font-bold text-white">{selectedGuild.fightCount}</p>
                      </div>
                      <div className="bg-gray-700 rounded-lg p-3">
                        <h4 className="text-gray-400 text-sm">WCL ID</h4>
                        <p className="text-lg font-medium text-white">{selectedGuild.warcraftlogsId || "N/A"}</p>
                      </div>
                      <div className="bg-gray-700 rounded-lg p-3">
                        <h4 className="text-gray-400 text-sm">Last Fetched</h4>
                        <p className="text-sm text-white">{selectedGuild.lastFetched ? formatDate(selectedGuild.lastFetched) : "Never"}</p>
                      </div>
                    </div>

                    {/* Queue Status */}
                    {selectedGuild.queueStatus && (
                      <div className="bg-gray-700 rounded-lg p-4">
                        <h4 className="text-white font-medium mb-2">Queue Status</h4>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          <div>
                            <span className="text-gray-400 text-sm">Status:</span>
                            <span
                              className={`ml-2 px-2 py-1 rounded text-xs font-medium ${
                                selectedGuild.queueStatus.status === "completed"
                                  ? "bg-green-900 text-green-300"
                                  : selectedGuild.queueStatus.status === "in_progress"
                                    ? "bg-blue-900 text-blue-300"
                                    : selectedGuild.queueStatus.status === "failed"
                                      ? "bg-red-900 text-red-300"
                                      : "bg-gray-600 text-gray-300"
                              }`}
                            >
                              {selectedGuild.queueStatus.status.replace("_", " ")}
                            </span>
                          </div>
                          <div>
                            <span className="text-gray-400 text-sm">Progress:</span>
                            <span className="ml-2 text-white">{selectedGuild.queueStatus.progress.percentComplete}%</span>
                          </div>
                          <div>
                            <span className="text-gray-400 text-sm">Reports:</span>
                            <span className="ml-2 text-white">{selectedGuild.queueStatus.progress.reportsFetched}</span>
                          </div>
                          <div>
                            <span className="text-gray-400 text-sm">Errors:</span>
                            <span className={`ml-2 ${selectedGuild.queueStatus.errorCount > 0 ? "text-red-400" : "text-white"}`}>{selectedGuild.queueStatus.errorCount}</span>
                          </div>
                        </div>
                        {selectedGuild.queueStatus.lastError && (
                          <div className="mt-3 p-2 bg-red-900/50 rounded">
                            <span className="text-red-300 text-sm">{selectedGuild.queueStatus.lastError}</span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Progress */}
                    {selectedGuild.progress && selectedGuild.progress.length > 0 && (
                      <div>
                        <h4 className="text-white font-medium mb-2">Raid Progress</h4>
                        <div className="space-y-2">
                          {selectedGuild.progress.map((p, i) => (
                            <div key={i} className="flex items-center justify-between bg-gray-700 rounded p-2">
                              <span className="text-white">
                                {p.raidName} ({p.difficulty})
                              </span>
                              <span className="text-gray-300">
                                {p.bossesDefeated}/{p.totalBosses}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Verify Reports Section */}
                    <div className="border-t border-gray-700 pt-4">
                      <div className="flex items-center gap-4 mb-4 flex-wrap">
                        <button onClick={() => handleVerifyReports(selectedGuild.id)} className="px-4 py-2 bg-amber-600 text-white rounded hover:bg-amber-700">
                          Verify Reports
                        </button>
                        <button onClick={() => handleQueueRescan(selectedGuild.id, selectedGuild.name)} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
                          Queue Full Rescan
                        </button>
                        <button
                          onClick={() => handleQueueRescanDeaths(selectedGuild.id, selectedGuild.name)}
                          className="px-4 py-2 bg-teal-600 text-white rounded hover:bg-teal-700"
                        >
                          Rescan Deaths
                        </button>
                        <button
                          onClick={() => handleQueueRescanCharacters(selectedGuild.id, selectedGuild.name)}
                          className="px-4 py-2 bg-cyan-600 text-white rounded hover:bg-cyan-700"
                        >
                          Rescan Characters
                        </button>
                        <button
                          onClick={() => handleRecalculateStats(selectedGuild.id, selectedGuild.name)}
                          className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700"
                        >
                          Recalculate Stats
                        </button>
                        <button
                          onClick={() => handleDeleteGuildClick(selectedGuild.id, selectedGuild.name)}
                          className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
                          disabled={deleteGuildLoading}
                        >
                          {deleteGuildLoading ? "Loading..." : "Delete Guild"}
                        </button>
                      </div>

                      {verifyResult && (
                        <div className={`rounded-lg p-4 ${verifyResult.isComplete ? "bg-green-900/50" : verifyResult.error ? "bg-red-900/50" : "bg-amber-900/50"}`}>
                          <h5 className="font-medium text-white mb-2">Verification Result</h5>
                          <div className="grid grid-cols-2 gap-2 text-sm">
                            <div>
                              <span className="text-gray-400">Stored Reports:</span>
                              <span className="ml-2 text-white">{verifyResult.storedReportCount}</span>
                            </div>
                            <div>
                              <span className="text-gray-400">WCL Reports:</span>
                              <span className="ml-2 text-white">{verifyResult.wclReportCount ?? "Error"}</span>
                            </div>
                            {verifyResult.missingFromSample !== undefined && (
                              <div>
                                <span className="text-gray-400">Missing (sample):</span>
                                <span className={`ml-2 ${verifyResult.missingFromSample > 0 ? "text-red-400" : "text-green-400"}`}>{verifyResult.missingFromSample}</span>
                              </div>
                            )}
                            {verifyResult.hasMorePages !== undefined && (
                              <div>
                                <span className="text-gray-400">More pages:</span>
                                <span className="ml-2 text-white">{verifyResult.hasMorePages ? "Yes" : "No"}</span>
                              </div>
                            )}
                          </div>
                          <p className={`mt-2 ${verifyResult.isComplete ? "text-green-300" : verifyResult.error ? "text-red-300" : "text-amber-300"}`}>{verifyResult.message}</p>
                          {verifyResult.missingReportCodes && verifyResult.missingReportCodes.length > 0 && (
                            <div className="mt-2">
                              <span className="text-gray-400 text-sm">Missing codes: </span>
                              <span className="text-red-300 text-sm">{verifyResult.missingReportCodes.join(", ")}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8 text-red-400">Failed to load guild details</div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Add Guild Modal */}
        {showAddGuildModal && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
            <div className="bg-gray-800 rounded-lg p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto">
              <h3 className="text-xl font-bold text-white mb-4">Add New Guild</h3>

              <div className="space-y-4">
                {/* Name */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Guild Name *</label>
                  <input
                    type="text"
                    value={addGuildForm.name}
                    onChange={(e) => setAddGuildForm({ ...addGuildForm, name: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                    placeholder="Method"
                    required
                  />
                </div>

                {/* Realm */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Realm *</label>
                  <input
                    type="text"
                    value={addGuildForm.realm}
                    onChange={(e) => setAddGuildForm({ ...addGuildForm, realm: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                    placeholder="Tarren Mill"
                    required
                  />
                </div>

                {/* Region */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Region</label>
                  <select
                    value={addGuildForm.region}
                    onChange={(e) => setAddGuildForm({ ...addGuildForm, region: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                  >
                    <option value="eu">EU</option>
                    <option value="us">US</option>
                    <option value="kr">KR</option>
                    <option value="tw">TW</option>
                    <option value="cn">CN</option>
                  </select>
                </div>

                {/* Parent Guild */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Parent Guild (optional)</label>
                  <input
                    type="text"
                    value={addGuildForm.parent_guild}
                    onChange={(e) => setAddGuildForm({ ...addGuildForm, parent_guild: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                    placeholder="Main guild name if this is a sub-team"
                  />
                  <p className="text-xs text-gray-500 mt-1">For sub-teams/splits, enter the main guild name</p>
                </div>

                {/* Streamers */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Streamers (optional)</label>
                  <input
                    type="text"
                    value={addGuildForm.streamers}
                    onChange={(e) => setAddGuildForm({ ...addGuildForm, streamers: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                    placeholder="streamer1, streamer2, streamer3"
                  />
                  <p className="text-xs text-gray-500 mt-1">Comma-separated Twitch channel names</p>
                </div>

                {/* Form Actions */}
                <div className="flex gap-3 pt-4">
                  <button
                    type="button"
                    onClick={handleAddGuild}
                    disabled={addGuildLoading || !addGuildForm.name.trim() || !addGuildForm.realm.trim()}
                    className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {addGuildLoading ? "Creating..." : "Create Guild"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddGuildModal(false);
                      setAddGuildForm({ name: "", realm: "", region: "eu", parent_guild: "", streamers: "" });
                    }}
                    className="px-4 py-2 bg-gray-700 text-gray-300 rounded-lg hover:bg-gray-600 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Delete Guild Confirmation Modal */}
        {showDeleteGuildModal && deleteGuildPreview && guildToDelete && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
            <div className="bg-gray-800 rounded-lg p-6 max-w-lg w-full">
              <h3 className="text-xl font-bold text-red-400 mb-4">⚠️ Delete Guild</h3>

              <div className="space-y-4">
                {/* Guild Info */}
                <div className="bg-gray-700 rounded-lg p-4">
                  <h4 className="text-white font-medium mb-2">{deleteGuildPreview.guild.name}</h4>
                  <p className="text-gray-400 text-sm">
                    {deleteGuildPreview.guild.realm} - {deleteGuildPreview.guild.region.toUpperCase()}
                  </p>
                </div>

                {/* What will be deleted */}
                <div className="bg-red-900/30 border border-red-700 rounded-lg p-4">
                  <h4 className="text-red-400 font-medium mb-3">The following data will be permanently deleted:</h4>
                  <ul className="space-y-2 text-gray-300 text-sm">
                    <li className="flex justify-between">
                      <span>Reports:</span>
                      <span className="font-medium text-white">{deleteGuildPreview.willBeDeleted.reports}</span>
                    </li>
                    <li className="flex justify-between">
                      <span>Fights:</span>
                      <span className="font-medium text-white">{deleteGuildPreview.willBeDeleted.fights}</span>
                    </li>
                    <li className="flex justify-between">
                      <span>Events:</span>
                      <span className="font-medium text-white">{deleteGuildPreview.willBeDeleted.events}</span>
                    </li>
                    <li className="flex justify-between">
                      <span>Queue Items:</span>
                      <span className="font-medium text-white">{deleteGuildPreview.willBeDeleted.queueItem}</span>
                    </li>
                    <li className="flex justify-between">
                      <span>Tier List Entries:</span>
                      <span className="font-medium text-white">{deleteGuildPreview.willBeDeleted.tierListEntries}</span>
                    </li>
                  </ul>
                </div>

                {/* Warning */}
                <div className="bg-amber-900/30 border border-amber-700 rounded-lg p-4">
                  <p className="text-amber-300 text-sm">{deleteGuildPreview.warning}</p>
                </div>

                {/* Form Actions */}
                <div className="flex gap-3 pt-4">
                  <button
                    type="button"
                    onClick={handleConfirmDeleteGuild}
                    disabled={deleteGuildLoading}
                    className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {deleteGuildLoading ? "Deleting..." : "Confirm Delete"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowDeleteGuildModal(false);
                      setDeleteGuildPreview(null);
                      setGuildToDelete(null);
                    }}
                    disabled={deleteGuildLoading}
                    className="px-4 py-2 bg-gray-700 text-gray-300 rounded-lg hover:bg-gray-600 transition-colors disabled:opacity-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
