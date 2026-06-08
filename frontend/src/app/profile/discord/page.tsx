"use client";

import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import {
  DiscordBotStatus,
  DiscordEventDifficulty,
  DiscordEventType,
  DiscordIntegration,
  DiscordIntegrationSettings,
  DiscordManageableGuild,
  UpdateDiscordIntegrationInput,
} from "@/types";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { FaDiscord } from "react-icons/fa";

const EVENT_TYPE_LABELS: Record<DiscordEventType, string> = {
  boss_kill: "Boss kills",
  best_pull: "Best pulls",
  milestone: "Milestones",
  hiatus: "Hiatus",
  regress: "Regress",
  reproge: "Reprog",
};

const DEFAULT_EVENT_TYPES: DiscordEventType[] = ["boss_kill", "best_pull"];
const DEFAULT_DIFFICULTIES: DiscordEventDifficulty[] = ["mythic"];

type FormState = {
  searchEnabled: boolean;
  eventsEnabled: boolean;
  channelId: string;
  guildIds: string[];
  eventTypes: DiscordEventType[];
  difficulties: DiscordEventDifficulty[];
  raidIds: number[];
};

const emptyForm: FormState = {
  searchEnabled: true,
  eventsEnabled: false,
  channelId: "",
  guildIds: [],
  eventTypes: DEFAULT_EVENT_TYPES,
  difficulties: DEFAULT_DIFFICULTIES,
  raidIds: [],
};

function integrationToForm(integration: DiscordIntegration | null): FormState {
  if (!integration) {
    return emptyForm;
  }

  return {
    searchEnabled: integration.features.search,
    eventsEnabled: integration.eventConfig.enabled,
    channelId: integration.eventConfig.channelId ?? "",
    guildIds: integration.eventConfig.guildIds,
    eventTypes: integration.eventConfig.eventTypes.length > 0 ? integration.eventConfig.eventTypes : DEFAULT_EVENT_TYPES,
    difficulties: integration.eventConfig.difficulties.length > 0 ? integration.eventConfig.difficulties : DEFAULT_DIFFICULTIES,
    raidIds: integration.eventConfig.raidIds,
  };
}

function toggleStringValue<T extends string>(values: T[], value: T): T[] {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

function toggleNumberValue(values: number[], value: number): number[] {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

export default function DiscordProfilePage() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [status, setStatus] = useState<DiscordBotStatus | null>(null);
  const [guilds, setGuilds] = useState<DiscordManageableGuild[]>([]);
  const [needsReconnect, setNeedsReconnect] = useState(false);
  const [integrations, setIntegrations] = useState<DiscordIntegration[]>([]);
  const [selectedGuildId, setSelectedGuildId] = useState<string>("");
  const [settings, setSettings] = useState<DiscordIntegrationSettings | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingSettings, setIsLoadingSettings] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isReauthorizing, setIsReauthorizing] = useState(false);
  const [isUninstalling, setIsUninstalling] = useState(false);
  const [installingGuildId, setInstallingGuildId] = useState<string | null>(null);
  const [guildFilter, setGuildFilter] = useState("");
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const integrationByGuildId = useMemo(() => new Map(integrations.map((integration) => [integration.discordGuildId, integration])), [integrations]);
  const selectedGuild = guilds.find((guild) => guild.id === selectedGuildId);
  const selectedIntegration = integrationByGuildId.get(selectedGuildId) ?? settings?.integration ?? null;
  const botInstalledForSelected = Boolean(selectedGuild?.botInstalled || selectedIntegration?.isInstalled);

  const loadOverview = useCallback(async () => {
    setIsLoading(true);
    try {
      const [statusData, guildData, integrationData] = await Promise.all([api.getDiscordBotStatus(), api.getDiscordManageableGuilds(), api.getDiscordIntegrations()]);
      setStatus(statusData);
      setGuilds(guildData.guilds);
      setNeedsReconnect(guildData.needsReconnect || integrationData.needsReconnect);
      setIntegrations(integrationData.integrations);

      const requestedGuildId = searchParams.get("guildId");
      const firstInstalledIntegrationId = integrationData.integrations.find((integration) => integration.isInstalled)?.discordGuildId;
      const preferredGuildId =
        requestedGuildId && guildData.guilds.some((guild) => guild.id === requestedGuildId)
          ? requestedGuildId
          : firstInstalledIntegrationId || guildData.guilds[0]?.id || "";
      setSelectedGuildId((current) => current || preferredGuildId);
    } catch (error) {
      console.error("Failed to load Discord bot overview:", error);
      setMessage({ type: "error", text: error instanceof Error ? error.message : "Failed to load Discord bot settings." });
    } finally {
      setIsLoading(false);
    }
  }, [searchParams]);

  const loadSettings = useCallback(async (guildId: string) => {
    setIsLoadingSettings(true);
    try {
      const data = await api.getDiscordIntegrationSettings(guildId);
      setSettings(data);
      setForm(integrationToForm(data.integration));
      if (data.integration) {
        setIntegrations((current) => {
          const next = current.filter((integration) => integration.discordGuildId !== data.integration?.discordGuildId);
          return [...next, data.integration!].sort((a, b) => a.discordGuildName.localeCompare(b.discordGuildName));
        });
        if (!data.integration.isInstalled) {
          setGuilds((current) => current.map((guild) => (guild.id === data.integration?.discordGuildId ? { ...guild, botInstalled: false } : guild)));
        }
      }
    } catch (error) {
      console.error("Failed to load Discord integration settings:", error);
      setSettings(null);
      setForm(emptyForm);
      setMessage({ type: "error", text: error instanceof Error ? error.message : "Failed to load Discord server settings." });
    } finally {
      setIsLoadingSettings(false);
    }
  }, []);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/");
    }
  }, [authLoading, user, router]);

  useEffect(() => {
    if (!authLoading && user) {
      void loadOverview();
    }
  }, [authLoading, user, loadOverview]);

  useEffect(() => {
    if (selectedGuildId && status?.enabled && !needsReconnect && botInstalledForSelected) {
      void loadSettings(selectedGuildId);
    } else {
      setSettings(null);
      setForm(emptyForm);
    }
  }, [selectedGuildId, status?.enabled, needsReconnect, botInstalledForSelected, loadSettings]);

  useEffect(() => {
    const installed = searchParams.get("installed");
    const error = searchParams.get("error");
    if (installed) {
      setMessage({ type: "success", text: "Discord bot installed. Choose a channel and save event settings to start announcements." });
      router.replace("/profile/discord");
    } else if (searchParams.get("connected") === "guilds") {
      setMessage({ type: "success", text: "Discord server access connected." });
      router.replace("/profile/discord");
    } else if (error) {
      setMessage({ type: "error", text: `Discord install failed: ${error.replaceAll("_", " ")}` });
      router.replace("/profile/discord");
    }
  }, [searchParams, router]);

  const filteredGuildOptions = useMemo(() => {
    const query = guildFilter.trim().toLowerCase();
    const options = settings?.guildOptions ?? [];
    if (!query) return options.slice(0, 80);
    return options.filter((guild) => `${guild.name} ${guild.realm} ${guild.parent_guild ?? ""}`.toLowerCase().includes(query)).slice(0, 80);
  }, [guildFilter, settings?.guildOptions]);

  const allGuildScope = form.guildIds.length === 0;
  const allRaidScope = form.raidIds.length === 0;

  const handleInstall = async (guildId?: string) => {
    try {
      setInstallingGuildId(guildId ?? "any");
      const { url } = await api.getDiscordInstallUrl(guildId);
      window.location.href = url;
    } catch (error) {
      console.error("Failed to create Discord install URL:", error);
      setMessage({ type: "error", text: error instanceof Error ? error.message : "Failed to start Discord install." });
      setInstallingGuildId(null);
    }
  };

  const handleReconnectDiscord = async () => {
    setIsReauthorizing(true);
    try {
      const { url } = await api.getDiscordGuildsLoginUrl();
      window.location.href = url;
    } catch (error) {
      console.error("Failed to create Discord server authorization URL:", error);
      setMessage({ type: "error", text: error instanceof Error ? error.message : "Failed to connect Discord server access." });
      setIsReauthorizing(false);
    }
  };

  const handleUninstall = async () => {
    if (!selectedGuildId || !selectedGuild) return;
    const confirmed = window.confirm(`Uninstall the bot from ${selectedGuild.name}? Event announcements and slash commands will stop working there.`);
    if (!confirmed) return;

    setIsUninstalling(true);
    try {
      const { integration } = await api.uninstallDiscordIntegration(selectedGuildId);
      if (integration) {
        setIntegrations((current) => {
          const next = current.filter((item) => item.discordGuildId !== integration.discordGuildId);
          return [...next, integration].sort((a, b) => a.discordGuildName.localeCompare(b.discordGuildName));
        });
      }
      setGuilds((current) => current.map((guild) => (guild.id === selectedGuildId ? { ...guild, botInstalled: false } : guild)));
      setSettings(null);
      setForm(emptyForm);
      setMessage({ type: "success", text: "Discord bot uninstalled from this server." });
    } catch (error) {
      console.error("Failed to uninstall Discord bot:", error);
      setMessage({ type: "error", text: error instanceof Error ? error.message : "Failed to uninstall Discord bot." });
    } finally {
      setIsUninstalling(false);
    }
  };

  const handleSave = async () => {
    if (!selectedGuildId) return;
    if (form.eventsEnabled && !form.channelId) {
      setMessage({ type: "error", text: "Select a Discord channel before enabling event announcements." });
      return;
    }

    setIsSaving(true);
    try {
      const input: UpdateDiscordIntegrationInput = {
        searchEnabled: form.searchEnabled,
        eventsEnabled: form.eventsEnabled,
        channelId: form.channelId || null,
        guildIds: form.guildIds,
        eventTypes: form.eventTypes,
        difficulties: form.difficulties,
        raidIds: form.raidIds,
      };
      const integration = await api.updateDiscordIntegrationSettings(selectedGuildId, input);
      if (integration) {
        setIntegrations((current) => {
          const next = current.filter((item) => item.discordGuildId !== integration.discordGuildId);
          return [...next, integration].sort((a, b) => a.discordGuildName.localeCompare(b.discordGuildName));
        });
        setSettings((current) => (current ? { ...current, integration } : current));
        setForm(integrationToForm(integration));
      }
      setMessage({ type: "success", text: "Discord bot settings saved." });
    } catch (error) {
      console.error("Failed to save Discord integration settings:", error);
      setMessage({ type: "error", text: error instanceof Error ? error.message : "Failed to save Discord bot settings." });
    } finally {
      setIsSaving(false);
    }
  };

  const handleTest = async () => {
    if (!selectedGuildId) return;
    setIsTesting(true);
    try {
      await api.sendDiscordTestMessage(selectedGuildId);
      setMessage({ type: "success", text: "Test message sent." });
    } catch (error) {
      console.error("Failed to send Discord test message:", error);
      setMessage({ type: "error", text: error instanceof Error ? error.message : "Failed to send test message." });
    } finally {
      setIsTesting(false);
    }
  };

  if (authLoading || isLoading) {
    return (
      <main className="min-h-screen px-4 py-8">
        <div className="mx-auto flex min-h-[420px] max-w-6xl items-center justify-center text-gray-300">Loading Discord settings...</div>
      </main>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <main className="min-h-screen px-4 py-8 md:px-6">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Link href="/profile" className="text-sm text-indigo-300 transition-colors hover:text-indigo-200">
              Back to profile
            </Link>
            <h1 className="mt-2 text-3xl font-bold text-white [text-wrap:balance]">Discord bot</h1>
          </div>
          <button
            onClick={() => void loadOverview()}
            className="min-h-10 rounded-md bg-gray-800 px-4 py-2 text-sm font-medium text-gray-100 shadow-[0_1px_0_rgba(255,255,255,0.06)_inset,0_1px_8px_rgba(0,0,0,0.2)] transition-colors hover:bg-gray-700 active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-50"
            disabled={isLoading}
          >
            Refresh
          </button>
        </div>

        {message && (
          <div className={`mb-5 rounded-md px-4 py-3 text-sm ${message.type === "success" ? "bg-green-950/50 text-green-200 ring-1 ring-green-700/70" : "bg-red-950/50 text-red-200 ring-1 ring-red-800/80"}`}>
            {message.text}
          </div>
        )}

        {status && !status.enabled ? (
          <div className="rounded-lg bg-gray-800 p-6 shadow-[0_1px_0_rgba(255,255,255,0.06)_inset,0_16px_40px_rgba(0,0,0,0.24)]">
            <h2 className="text-lg font-semibold text-white">Bot integration disabled</h2>
            <p className="mt-2 text-sm leading-6 text-gray-400">
              Add the Discord bot environment variables to the backend to enable install and settings controls. The rest of the site keeps working while these are missing.
            </p>
            <div className="mt-4 grid gap-2 text-sm text-gray-300 sm:grid-cols-2">
              {Object.entries(status.missing).map(([key, missing]) => (
                <div key={key} className="rounded-md bg-gray-900/70 px-3 py-2">
                  <span className="text-gray-500">{key}</span>
                  <span className={missing ? "float-right text-red-300" : "float-right text-green-300"}>{missing ? "Missing" : "Set"}</span>
                </div>
              ))}
            </div>
          </div>
        ) : needsReconnect ? (
          <div className="rounded-lg bg-gray-800 p-6 shadow-[0_1px_0_rgba(255,255,255,0.06)_inset,0_16px_40px_rgba(0,0,0,0.24)]">
            <h2 className="text-lg font-semibold text-white">Reconnect Discord</h2>
            <p className="mt-2 text-sm leading-6 text-gray-400">Server management needs the Discord guilds permission. Reconnect Discord, then return here.</p>
            <button
              onClick={() => void handleReconnectDiscord()}
              disabled={isReauthorizing}
              className="mt-5 min-h-10 rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-500 active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isReauthorizing ? "Opening Discord..." : "Connect server access"}
            </button>
          </div>
        ) : (
          <div className="grid gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
            <aside className="rounded-lg bg-gray-800 p-4 shadow-[0_1px_0_rgba(255,255,255,0.06)_inset,0_16px_40px_rgba(0,0,0,0.24)]">
              <div className="mb-3">
                <h2 className="font-semibold text-white">Servers</h2>
              </div>
              <div className="space-y-2">
                {guilds.length === 0 ? (
                  <div className="rounded-md bg-gray-900/70 px-3 py-4 text-sm text-gray-400">No manageable Discord servers found.</div>
                ) : (
                  guilds.map((guild) => {
                    const installed = Boolean(guild.botInstalled || integrationByGuildId.get(guild.id)?.isInstalled);
                    const selected = guild.id === selectedGuildId;
                    return (
                      <button
                        key={guild.id}
                        onClick={() => setSelectedGuildId(guild.id)}
                        className={`flex min-h-12 w-full items-center gap-3 rounded-md px-3 py-2 text-left transition-colors active:scale-[0.99] ${
                          selected ? "bg-indigo-600/25 text-white ring-1 ring-indigo-500/70" : "bg-gray-900/60 text-gray-200 hover:bg-gray-900"
                        }`}
                      >
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[#5865F2]/20 text-[#AAB4FF]">
                          <FaDiscord className="h-5 w-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium">{guild.name}</div>
                          <div className={installed ? "text-xs text-green-300" : "text-xs text-gray-500"}>{installed ? "Installed" : "Not installed"}</div>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </aside>

            <section className="rounded-lg bg-gray-800 p-5 shadow-[0_1px_0_rgba(255,255,255,0.06)_inset,0_16px_40px_rgba(0,0,0,0.24)]">
              {!selectedGuild ? (
                <div className="py-16 text-center text-gray-400">Select a Discord server.</div>
              ) : !botInstalledForSelected ? (
                <div className="flex min-h-[420px] flex-col items-center justify-center text-center">
                  <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-lg bg-[#5865F2]/20 text-[#AAB4FF]">
                    <FaDiscord className="h-8 w-8" />
                  </div>
                  <h2 className="text-xl font-semibold text-white">{selectedGuild.name}</h2>
                  <p className="mt-2 max-w-md text-sm leading-6 text-gray-400">Install the bot to this server before configuring commands and event announcements.</p>
                  <button
                    onClick={() => void handleInstall(selectedGuild.id)}
                    disabled={installingGuildId === selectedGuild.id}
                    className="mt-5 min-h-10 rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-500 active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {installingGuildId === selectedGuild.id ? "Opening Discord..." : "Install to server"}
                  </button>
                </div>
              ) : isLoadingSettings || !settings ? (
                <div className="flex min-h-[420px] items-center justify-center text-gray-300">Loading server settings...</div>
              ) : (
                <div className="space-y-6">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <h2 className="text-xl font-semibold text-white [text-wrap:balance]">{selectedIntegration?.discordGuildName || selectedGuild.name}</h2>
                      {selectedIntegration?.lastError && <p className="mt-2 max-w-2xl text-sm text-red-300">{selectedIntegration.lastError}</p>}
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => void handleUninstall()}
                        disabled={isUninstalling}
                        className="min-h-10 rounded-md bg-red-950/60 px-4 py-2 text-sm font-medium text-red-100 ring-1 ring-red-800/80 transition-colors hover:bg-red-900/70 active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {isUninstalling ? "Uninstalling..." : "Uninstall"}
                      </button>
                      <button
                        onClick={() => void handleTest()}
                        disabled={isTesting || !form.channelId}
                        className="min-h-10 rounded-md bg-gray-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-600 active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {isTesting ? "Sending..." : "Send test"}
                      </button>
                      <button
                        onClick={() => void handleSave()}
                        disabled={isSaving}
                        className="min-h-10 rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-500 active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {isSaving ? "Saving..." : "Save"}
                      </button>
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="flex min-h-14 items-center justify-between gap-4 rounded-md bg-gray-900/70 px-4 py-3">
                      <span>
                        <span className="block text-sm font-medium text-white">Slash command search</span>
                        <span className="block text-xs text-gray-500">Allow `/suomiwow search` in this server.</span>
                      </span>
                      <input
                        type="checkbox"
                        checked={form.searchEnabled}
                        onChange={(event) => setForm((current) => ({ ...current, searchEnabled: event.target.checked }))}
                        className="h-5 w-5 accent-indigo-500"
                      />
                    </label>
                    <label className="flex min-h-14 items-center justify-between gap-4 rounded-md bg-gray-900/70 px-4 py-3">
                      <span>
                        <span className="block text-sm font-medium text-white">Event announcements</span>
                        <span className="block text-xs text-gray-500">Post matching tracker events to a channel.</span>
                      </span>
                      <input
                        type="checkbox"
                        checked={form.eventsEnabled}
                        onChange={(event) => setForm((current) => ({ ...current, eventsEnabled: event.target.checked }))}
                        className="h-5 w-5 accent-indigo-500"
                      />
                    </label>
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-300">Announcement channel</label>
                    <select
                      value={form.channelId}
                      onChange={(event) => setForm((current) => ({ ...current, channelId: event.target.value }))}
                      className="min-h-10 w-full rounded-md bg-gray-950 px-3 py-2 text-sm text-white ring-1 ring-gray-700 transition-colors focus:outline-none focus:ring-indigo-500"
                    >
                      <option value="">Select channel</option>
                      {settings.channels.map((channel) => (
                        <option key={channel.id} value={channel.id}>
                          #{channel.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid gap-5 xl:grid-cols-2">
                    <div className="rounded-md bg-gray-900/60 p-4">
                      <h3 className="font-semibold text-white">Event types</h3>
                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        {settings.validEventTypes.map((eventType) => (
                          <label key={eventType} className="flex min-h-10 items-center gap-2 rounded-md px-2 text-sm text-gray-200 hover:bg-gray-800/70">
                            <input
                              type="checkbox"
                              checked={form.eventTypes.includes(eventType)}
                              onChange={() => setForm((current) => ({ ...current, eventTypes: toggleStringValue(current.eventTypes, eventType) }))}
                              className="h-4 w-4 accent-indigo-500"
                            />
                            {EVENT_TYPE_LABELS[eventType]}
                          </label>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-md bg-gray-900/60 p-4">
                      <h3 className="font-semibold text-white">Difficulties</h3>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {settings.validDifficulties.map((difficulty) => (
                          <label key={difficulty} className="flex min-h-10 items-center gap-2 rounded-md px-3 text-sm capitalize text-gray-200 hover:bg-gray-800/70">
                            <input
                              type="checkbox"
                              checked={form.difficulties.includes(difficulty)}
                              onChange={() => setForm((current) => ({ ...current, difficulties: toggleStringValue(current.difficulties, difficulty) }))}
                              className="h-4 w-4 accent-indigo-500"
                            />
                            {difficulty}
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="rounded-md bg-gray-900/60 p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <h3 className="font-semibold text-white">Tracked guilds</h3>
                        <p className="text-xs text-gray-500">{allGuildScope ? "All tracked guilds are included." : `${form.guildIds.length} guilds selected.`}</p>
                      </div>
                      <button
                        onClick={() =>
                          setForm((current) => ({
                            ...current,
                            guildIds: allGuildScope ? settings.guildOptions.map((guild) => guild.id) : [],
                          }))
                        }
                        className="min-h-10 rounded-md bg-gray-800 px-3 py-2 text-sm text-white transition-colors hover:bg-gray-700 active:scale-[0.96]"
                      >
                        {allGuildScope ? "Customize" : "Use all guilds"}
                      </button>
                    </div>

                    {!allGuildScope && (
                      <>
                        <input
                          value={guildFilter}
                          onChange={(event) => setGuildFilter(event.target.value)}
                          placeholder="Filter guilds"
                          className="mt-3 min-h-10 w-full rounded-md bg-gray-950 px-3 py-2 text-sm text-white ring-1 ring-gray-700 transition-colors placeholder:text-gray-600 focus:outline-none focus:ring-indigo-500"
                        />
                        <div className="mt-3 grid max-h-72 gap-1 overflow-y-auto pr-1 sm:grid-cols-2">
                          {filteredGuildOptions.map((guild) => (
                            <label key={guild.id} className="flex min-h-10 items-center gap-2 rounded-md px-2 text-sm text-gray-200 hover:bg-gray-800/70">
                              <input
                                type="checkbox"
                                checked={form.guildIds.includes(guild.id)}
                                onChange={() => setForm((current) => ({ ...current, guildIds: toggleStringValue(current.guildIds, guild.id) }))}
                                className="h-4 w-4 accent-indigo-500"
                              />
                              <span className="min-w-0 truncate">
                                {guild.name}-{guild.realm}
                              </span>
                            </label>
                          ))}
                        </div>
                      </>
                    )}
                  </div>

                  <div className="rounded-md bg-gray-900/60 p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <h3 className="font-semibold text-white">Raid tiers</h3>
                        <p className="text-xs text-gray-500">{allRaidScope ? "All raid tiers are included." : `${form.raidIds.length} raid tiers selected.`}</p>
                      </div>
                      <button
                        onClick={() =>
                          setForm((current) => ({
                            ...current,
                            raidIds: allRaidScope ? settings.raidOptions.map((raid) => raid.id) : [],
                          }))
                        }
                        className="min-h-10 rounded-md bg-gray-800 px-3 py-2 text-sm text-white transition-colors hover:bg-gray-700 active:scale-[0.96]"
                      >
                        {allRaidScope ? "Customize" : "Use all raids"}
                      </button>
                    </div>
                    {!allRaidScope && (
                      <div className="mt-3 grid gap-1 sm:grid-cols-2">
                        {settings.raidOptions.map((raid) => (
                          <label key={raid.id} className="flex min-h-10 items-center gap-2 rounded-md px-2 text-sm text-gray-200 hover:bg-gray-800/70">
                            <input
                              type="checkbox"
                              checked={form.raidIds.includes(raid.id)}
                              onChange={() => setForm((current) => ({ ...current, raidIds: toggleNumberValue(current.raidIds, raid.id) }))}
                              className="h-4 w-4 accent-indigo-500"
                            />
                            <span className="min-w-0 truncate">{raid.name}</span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </main>
  );
}
