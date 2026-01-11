"use client";

import { useAuth } from "@/context/AuthContext";
import { useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useCallback, useRef } from "react";
import { api } from "@/lib/api";
import CharacterSelectorDialog from "@/components/CharacterSelectorDialog";
import { FaBattleNet } from "react-icons/fa";
import { FaTwitch } from "react-icons/fa";

// WoW Class colors
const CLASS_COLORS: { [key: string]: string } = {
  "Death Knight": "#C41E3A",
  "Demon Hunter": "#A330C9",
  Druid: "#FF7C0A",
  Evoker: "#33937F",
  Hunter: "#AAD372",
  Mage: "#3FC7EB",
  Monk: "#00FF98",
  Paladin: "#F48CBA",
  Priest: "#FFFFFF",
  Rogue: "#FFF468",
  Shaman: "#0070DD",
  Warlock: "#8788EE",
  Warrior: "#C69B6D",
};

export default function ProfilePage() {
  const { user, isLoading, logout, refreshUser } = useAuth();
  const t = useTranslations("profilePage");
  const router = useRouter();
  const searchParams = useSearchParams();

  const [isConnectingTwitch, setIsConnectingTwitch] = useState(false);
  const [isConnectingBattleNet, setIsConnectingBattleNet] = useState(false);
  const [isDisconnectingTwitch, setIsDisconnectingTwitch] = useState(false);
  const [isDisconnectingBattleNet, setIsDisconnectingBattleNet] = useState(false);
  const [isRefreshingCharacters, setIsRefreshingCharacters] = useState(false);
  const [isRefreshingTwitch, setIsRefreshingTwitch] = useState(false);
  const [isRefreshingBattleNet, setIsRefreshingBattleNet] = useState(false);
  const [isSavingCharacters, setIsSavingCharacters] = useState(false);
  const [showCharacterDialog, setShowCharacterDialog] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const hasTriggeredRefresh = useRef(false);

  // Check if we should open the dialog after Battle.net connection
  useEffect(() => {
    const connected = searchParams.get("connected");
    if (connected === "battlenet" && user?.battlenet?.characters && user.battlenet.characters.length > 0 && !hasTriggeredRefresh.current) {
      hasTriggeredRefresh.current = true;
      setShowCharacterDialog(true);
      // Trigger character refresh with guild enrichment
      handleRefreshCharacters();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, user?.battlenet?.characters]);

  // Handle OAuth callback messages
  useEffect(() => {
    const connected = searchParams.get("connected");
    const error = searchParams.get("error");

    if (connected === "twitch") {
      setMessage({ type: "success", text: t("twitchConnected") });
      refreshUser();
      router.replace("/profile");
    } else if (connected === "battlenet") {
      setMessage({ type: "success", text: t("battlenetConnected") });
      refreshUser();
      router.replace("/profile");
    } else if (error) {
      let errorText = t("connectionError");
      if (error === "twitch_already_linked") {
        errorText = t("twitchAlreadyLinked");
      } else if (error === "battlenet_already_linked") {
        errorText = t("battlenetAlreadyLinked");
      } else if (error === "twitch_failed") {
        errorText = t("twitchConnectionFailed");
      } else if (error === "battlenet_failed") {
        errorText = t("battlenetConnectionFailed");
      }
      setMessage({ type: "error", text: errorText });
      router.replace("/profile");
    }
  }, [searchParams, t, refreshUser, router]);

  // Clear message after 5 seconds
  useEffect(() => {
    if (message) {
      const timeout = setTimeout(() => setMessage(null), 5000);
      return () => clearTimeout(timeout);
    }
  }, [message]);

  useEffect(() => {
    if (!isLoading && !user) {
      router.push("/");
    }
  }, [user, isLoading, router]);

  const handleConnectTwitch = async () => {
    try {
      setIsConnectingTwitch(true);
      const { url } = await api.getTwitchConnectUrl();
      window.location.href = url;
    } catch (error) {
      console.error("Failed to get Twitch connect URL:", error);
      setMessage({ type: "error", text: t("connectionError") });
      setIsConnectingTwitch(false);
    }
  };

  const handleDisconnectTwitch = async () => {
    try {
      setIsDisconnectingTwitch(true);
      await api.disconnectTwitch();
      await refreshUser();
      setMessage({ type: "success", text: t("twitchDisconnected") });
    } catch (error) {
      console.error("Failed to disconnect Twitch:", error);
      setMessage({ type: "error", text: t("disconnectionError") });
    } finally {
      setIsDisconnectingTwitch(false);
    }
  };

  const handleConnectBattleNet = async () => {
    try {
      setIsConnectingBattleNet(true);
      const { url } = await api.getBattleNetConnectUrl();
      window.location.href = url;
    } catch (error) {
      console.error("Failed to get Battle.net connect URL:", error);
      setMessage({ type: "error", text: t("connectionError") });
      setIsConnectingBattleNet(false);
    }
  };

  const handleDisconnectBattleNet = async () => {
    try {
      setIsDisconnectingBattleNet(true);
      await api.disconnectBattleNet();
      await refreshUser();
      setMessage({ type: "success", text: t("battlenetDisconnected") });
    } catch (error) {
      console.error("Failed to disconnect Battle.net:", error);
      setMessage({ type: "error", text: t("disconnectionError") });
    } finally {
      setIsDisconnectingBattleNet(false);
    }
  };

  const handleRefreshCharacters = useCallback(async () => {
    // Prevent duplicate calls
    if (isRefreshingCharacters) {
      return;
    }

    try {
      setIsRefreshingCharacters(true);
      await api.refreshWoWCharacters();
      await refreshUser();
      setMessage({ type: "success", text: t("charactersRefreshed") });
    } catch (error: any) {
      console.error("Failed to refresh characters:", error);
      // Check if it's a rate limit error
      const errorMessage = error?.response?.data?.error || error?.message || t("refreshError");
      setMessage({ type: "error", text: errorMessage });
    } finally {
      setIsRefreshingCharacters(false);
    }
  }, [isRefreshingCharacters, refreshUser, t]);

  const handleRefreshTwitch = async () => {
    try {
      setIsRefreshingTwitch(true);
      await refreshUser();
      setMessage({ type: "success", text: "Twitch data refreshed!" });
    } catch (error) {
      console.error("Failed to refresh Twitch:", error);
      setMessage({ type: "error", text: "Failed to refresh Twitch data." });
    } finally {
      setIsRefreshingTwitch(false);
    }
  };

  const handleRefreshBattleNet = async () => {
    try {
      setIsRefreshingBattleNet(true);
      await refreshUser();
      setMessage({ type: "success", text: "Battle.net data refreshed!" });
    } catch (error) {
      console.error("Failed to refresh Battle.net:", error);
      setMessage({ type: "error", text: "Failed to refresh Battle.net data." });
    } finally {
      setIsRefreshingBattleNet(false);
    }
  };

  const handleSaveCharacters = async (selectedIds: number[]) => {
    try {
      setIsSavingCharacters(true);
      await api.updateCharacterSelection(selectedIds);
      await refreshUser();
      setMessage({ type: "success", text: t("charactersSaved") });
      setShowCharacterDialog(false);
    } catch (error) {
      console.error("Failed to save character selection:", error);
      setMessage({ type: "error", text: t("saveError") });
    } finally {
      setIsSavingCharacters(false);
    }
  };

  const getClassColor = (className: string): string => {
    return CLASS_COLORS[className] || "#FFFFFF";
  };

  const getFactionColor = (faction: "ALLIANCE" | "HORDE"): string => {
    return faction === "ALLIANCE" ? "#3B82F6" : "#EF4444";
  };

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

  const selectedCharacters = user.battlenet?.characters.filter((c) => c.selected) || [];

  return (
    <main className="min-h-screen px-4 md:px-6 py-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold text-white mb-8">{t("title")}</h1>

        {/* Status Message */}
        {message && (
          <div
            className={`mb-6 p-4 rounded-lg ${
              message.type === "success" ? "bg-green-900/50 border border-green-500 text-green-200" : "bg-red-900/50 border border-red-500 text-red-200"
            }`}
          >
            {message.text}
          </div>
        )}

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

        {/* Connected Accounts Section */}
        <div className="mt-8 bg-gray-800 rounded-lg border border-gray-700 p-6">
          <h3 className="text-xl font-bold text-white mb-6">{t("connectedAccounts")}</h3>

          {/* Twitch Connection */}
          <div className="mb-6 pb-6 border-b border-gray-700">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <FaTwitch className="w-8 h-8 text-purple-500" />
                <div>
                  <h4 className="text-white font-medium">{t("twitchAccount")}</h4>
                  {user.twitch ? <p className="text-purple-400 text-sm">{user.twitch.displayName}</p> : <p className="text-gray-500 text-sm">{t("notConnected")}</p>}
                </div>
              </div>
              <div className="flex gap-2">
                {user.twitch ? (
                  <>
                    <button
                      onClick={handleRefreshTwitch}
                      disabled={isRefreshingTwitch}
                      className="px-3 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-md transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                    >
                      <svg className={`w-4 h-4 ${isRefreshingTwitch ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                        />
                      </svg>
                      {t("refresh")}
                    </button>
                    <button
                      onClick={handleDisconnectTwitch}
                      disabled={isDisconnectingTwitch}
                      className="px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded-md transition-colors text-sm disabled:opacity-50"
                    >
                      {isDisconnectingTwitch ? t("disconnecting") : t("disconnect")}
                    </button>
                  </>
                ) : (
                  <button
                    onClick={handleConnectTwitch}
                    disabled={isConnectingTwitch}
                    className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-md transition-colors text-sm disabled:opacity-50"
                  >
                    {isConnectingTwitch ? t("connecting") : t("connect")}
                  </button>
                )}
              </div>
            </div>
            {user.twitch && (
              <p className="text-gray-500 text-xs mt-2">
                {t("connectedOn")}{" "}
                {new Date(user.twitch.connectedAt).toLocaleDateString(undefined, {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </p>
            )}
          </div>

          {/* Battle.net Connection */}
          <div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <FaBattleNet className="w-8 h-8 text-blue-400" />
                <div>
                  <h4 className="text-white font-medium">{t("battlenetAccount")}</h4>
                  {user.battlenet ? <p className="text-blue-400 text-sm">{user.battlenet.battletag}</p> : <p className="text-gray-500 text-sm">{t("notConnected")}</p>}
                </div>
              </div>
              <div className="flex gap-2">
                {user.battlenet ? (
                  <>
                    <button
                      onClick={handleRefreshBattleNet}
                      disabled={isRefreshingBattleNet}
                      className="px-3 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-md transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                    >
                      <svg className={`w-4 h-4 ${isRefreshingBattleNet ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                        />
                      </svg>
                      {t("refresh")}
                    </button>
                    <button
                      onClick={handleDisconnectBattleNet}
                      disabled={isDisconnectingBattleNet}
                      className="px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded-md transition-colors text-sm disabled:opacity-50"
                    >
                      {isDisconnectingBattleNet ? t("disconnecting") : t("disconnect")}
                    </button>
                  </>
                ) : (
                  <button
                    onClick={handleConnectBattleNet}
                    disabled={isConnectingBattleNet}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors text-sm disabled:opacity-50"
                  >
                    {isConnectingBattleNet ? t("connecting") : t("connect")}
                  </button>
                )}
              </div>
            </div>
            {user.battlenet && (
              <p className="text-gray-500 text-xs mt-2">
                {t("connectedOn")}{" "}
                {new Date(user.battlenet.connectedAt).toLocaleDateString(undefined, {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </p>
            )}
          </div>
        </div>

        {/* WoW Characters Section */}
        {user.battlenet && (
          <div className="mt-8 bg-gray-800 rounded-lg border border-gray-700 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-white">{t("wowCharacters")}</h3>
              {user.battlenet.characters.length > 0 && (
                <button
                  onClick={() => setShowCharacterDialog(true)}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors text-sm font-medium"
                >
                  {t("editCharacters")}
                </button>
              )}
            </div>

            {selectedCharacters.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-gray-400 mb-4">{t("noCharactersSelected")}</p>
                {user.battlenet.characters.length > 0 && (
                  <button
                    onClick={() => setShowCharacterDialog(true)}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors text-sm font-medium"
                  >
                    {t("selectCharactersDescription")}
                  </button>
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {selectedCharacters.map((character) => (
                  <div
                    key={character.id}
                    className="bg-gray-700/50 rounded-lg p-4 border border-gray-600 hover:border-gray-500 transition-all hover:bg-gray-700 flex items-center justify-between"
                  >
                    <div className="flex items-center min-w-0">
                      <span className="font-bold text-lg truncate" style={{ color: getClassColor(character.class) }}>
                        {character.name}
                      </span>
                      <span className="text-white font-normal text-sm truncate">-{character.realm}</span>
                      {character.inactive ? (
                        <span className="text-red-500 text-sm ml-2 truncate">&lt;inactive&gt;</span>
                      ) : (
                        character.guild && <span className="text-yellow-400 text-sm ml-2 truncate">&lt;{character.guild}&gt;</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-sm flex-nowrap">
                      <span className="text-white">Level {character.level}</span>
                      <span style={{ color: getFactionColor(character.faction) }}>{character.race}</span>
                      <span style={{ color: getClassColor(character.class) }}>{character.class}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {user.battlenet.lastCharacterSync && (
              <p className="text-gray-500 text-xs mt-4">
                {t("lastSynced")}{" "}
                {new Date(user.battlenet.lastCharacterSync).toLocaleString(undefined, {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            )}
          </div>
        )}

        {/* Character Selector Dialog */}
        {showCharacterDialog && user.battlenet && (
          <CharacterSelectorDialog
            characters={user.battlenet.characters}
            onSave={handleSaveCharacters}
            onCancel={() => setShowCharacterDialog(false)}
            onRefresh={handleRefreshCharacters}
            isRefreshing={isRefreshingCharacters || isSavingCharacters}
          />
        )}
      </div>
    </main>
  );
}
