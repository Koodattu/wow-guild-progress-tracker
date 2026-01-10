"use client";

import { useAuth } from "@/context/AuthContext";
import { useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";

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
  const [isSavingCharacters, setIsSavingCharacters] = useState(false);
  const [selectedCharacterIds, setSelectedCharacterIds] = useState<Set<number>>(new Set());
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Initialize selected characters from user data
  useEffect(() => {
    if (user?.battlenet?.characters) {
      const selected = new Set(user.battlenet.characters.filter((c) => c.selected).map((c) => c.id));
      setSelectedCharacterIds(selected);
    }
  }, [user?.battlenet?.characters]);

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

  const handleRefreshCharacters = async () => {
    try {
      setIsRefreshingCharacters(true);
      await api.refreshWoWCharacters();
      await refreshUser();
      setMessage({ type: "success", text: t("charactersRefreshed") });
    } catch (error) {
      console.error("Failed to refresh characters:", error);
      setMessage({ type: "error", text: t("refreshError") });
    } finally {
      setIsRefreshingCharacters(false);
    }
  };

  const handleToggleCharacter = (characterId: number) => {
    setSelectedCharacterIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(characterId)) {
        newSet.delete(characterId);
      } else {
        newSet.add(characterId);
      }
      return newSet;
    });
  };

  const handleSaveCharacters = async () => {
    try {
      setIsSavingCharacters(true);
      await api.updateCharacterSelection(Array.from(selectedCharacterIds));
      await refreshUser();
      setMessage({ type: "success", text: t("charactersSaved") });
    } catch (error) {
      console.error("Failed to save character selection:", error);
      setMessage({ type: "error", text: t("saveError") });
    } finally {
      setIsSavingCharacters(false);
    }
  };

  // Check if character selection has changed
  const hasCharacterSelectionChanged = useCallback(() => {
    if (!user?.battlenet?.characters) return false;
    const currentSelected = new Set(user.battlenet.characters.filter((c) => c.selected).map((c) => c.id));
    if (currentSelected.size !== selectedCharacterIds.size) return true;
    for (const id of selectedCharacterIds) {
      if (!currentSelected.has(id)) return true;
    }
    return false;
  }, [user?.battlenet?.characters, selectedCharacterIds]);

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

  const getFactionColor = (faction: "ALLIANCE" | "HORDE") => {
    return faction === "ALLIANCE" ? "text-blue-400" : "text-red-400";
  };

  const getFactionBg = (faction: "ALLIANCE" | "HORDE") => {
    return faction === "ALLIANCE" ? "bg-blue-900/20" : "bg-red-900/20";
  };

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
                <svg className="w-8 h-8 text-purple-500" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714z" />
                </svg>
                <div>
                  <h4 className="text-white font-medium">{t("twitchAccount")}</h4>
                  {user.twitch ? <p className="text-purple-400 text-sm">{user.twitch.displayName}</p> : <p className="text-gray-500 text-sm">{t("notConnected")}</p>}
                </div>
              </div>
              {user.twitch ? (
                <button
                  onClick={handleDisconnectTwitch}
                  disabled={isDisconnectingTwitch}
                  className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-md transition-colors text-sm disabled:opacity-50"
                >
                  {isDisconnectingTwitch ? t("disconnecting") : t("disconnect")}
                </button>
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
                <svg className="w-8 h-8 text-blue-400" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M10.457 0c.618 1.558 1.054 2.786 1.34 3.852.063.196.138.478.203.696a8.084 8.084 0 0 1 2.126-.281c5.425 0 9.874 5.263 9.874 10.104 0 2.775-1.06 5.074-2.904 6.704l-.136.108.481.728c.371.478.619.873.805 1.235l.02.04-.01.008C19.86 23.677 16.68 24 13.5 24 6.585 24 0 21.32 0 15.62c0-1.981.71-4.252 2.103-6.528.07.016.168.032.28.048 1.348.198 2.95-.062 3.882-.632.148-.09.284-.205.402-.348-1.16 1.313-1.703 3.162-1.703 5.46 0 4.18 3.063 8.015 6.672 8.015 3.03 0 5.696-1.744 6.516-4.625.084-.294.143-.546.184-.762l.015-.087c.157-.96.068-1.935-.218-2.943a7.12 7.12 0 0 0-.393-1.014c-.37-.793-1.127-1.868-1.735-2.472a6.463 6.463 0 0 0-1.283-.973c-.314-.18-.55-.285-.872-.39a5.88 5.88 0 0 0-.793-.193c-.095-.016-.207-.03-.32-.038a4.25 4.25 0 0 0-.506-.006c-.143.01-.21.022-.303.038-.094.017-.197.04-.306.067-.218.054-.428.123-.643.209-.087.035-.185.077-.3.127-.115.051-.231.107-.35.167a5.43 5.43 0 0 0-.626.369c-.29.2-.58.437-.862.71-.283.273-.53.549-.74.822-.21.273-.39.536-.54.783-.148.247-.27.478-.365.687a4.73 4.73 0 0 0-.26.652 4.22 4.22 0 0 0-.129.499 2.54 2.54 0 0 0-.037.284c-.003.062.001.096.009.103.007.008.04-.015.096-.076.112-.123.29-.358.5-.677.42-.639.964-1.55 1.462-2.454.249-.452.482-.895.682-1.303.2-.408.367-.784.487-1.098l.042-.113c-.012.237-.018.487-.018.746 0 .622.048 1.275.146 1.946.196 1.342.585 2.665 1.129 3.817l.074.154c.12.244.237.465.35.659.057.097.118.193.183.288.065.095.13.184.195.268a3.29 3.29 0 0 0 .407.44c.144.127.29.236.435.326.29.18.568.302.815.375.123.037.24.063.349.08l.026.003c.08.01.147.017.207.02.06.004.117.005.17.004a1.63 1.63 0 0 0 .282-.033c.043-.01.084-.02.123-.033.078-.025.147-.054.215-.087.136-.066.263-.147.389-.24.251-.184.51-.42.78-.7a6.62 6.62 0 0 0 .385-.443c.085-.104.168-.212.248-.32.08-.11.157-.218.23-.325.147-.214.278-.42.388-.606l.032-.054c-.218.662-.577 1.303-1.075 1.863-.249.28-.528.537-.83.759-.151.111-.308.213-.469.302-.16.09-.325.167-.491.232a3.37 3.37 0 0 1-.504.146 2.51 2.51 0 0 1-.488.048c-.142-.003-.271-.015-.385-.035a2.2 2.2 0 0 1-.325-.076 2.54 2.54 0 0 1-.27-.101 3.08 3.08 0 0 1-.487-.26c-.15-.098-.293-.207-.429-.325a4.5 4.5 0 0 1-.385-.374 5.42 5.42 0 0 1-.651-.857 7.86 7.86 0 0 1-.503-.88c-.148-.293-.28-.59-.395-.885a12.24 12.24 0 0 1-.288-.866 12.06 12.06 0 0 1-.387-1.882 11.94 11.94 0 0 1-.08-1.502c.009-.336.034-.665.077-.984z" />
                </svg>
                <div>
                  <h4 className="text-white font-medium">{t("battlenetAccount")}</h4>
                  {user.battlenet ? <p className="text-blue-400 text-sm">{user.battlenet.battletag}</p> : <p className="text-gray-500 text-sm">{t("notConnected")}</p>}
                </div>
              </div>
              {user.battlenet ? (
                <button
                  onClick={handleDisconnectBattleNet}
                  disabled={isDisconnectingBattleNet}
                  className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-md transition-colors text-sm disabled:opacity-50"
                >
                  {isDisconnectingBattleNet ? t("disconnecting") : t("disconnect")}
                </button>
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
        {user.battlenet && user.battlenet.characters.length > 0 && (
          <div className="mt-8 bg-gray-800 rounded-lg border border-gray-700 p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-white">{t("wowCharacters")}</h3>
              <button
                onClick={handleRefreshCharacters}
                disabled={isRefreshingCharacters}
                className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white rounded-md transition-colors text-sm disabled:opacity-50 flex items-center gap-2"
              >
                <svg className={`w-4 h-4 ${isRefreshingCharacters ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
                {isRefreshingCharacters ? t("refreshing") : t("refresh")}
              </button>
            </div>

            <p className="text-gray-400 text-sm mb-4">{t("selectCharactersDescription")}</p>

            {/* Character List */}
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {user.battlenet.characters.map((character) => (
                <label
                  key={character.id}
                  className={`flex items-center gap-4 p-3 rounded-lg cursor-pointer transition-colors ${
                    selectedCharacterIds.has(character.id)
                      ? getFactionBg(character.faction) + " border border-gray-600"
                      : "bg-gray-700/50 hover:bg-gray-700 border border-transparent"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedCharacterIds.has(character.id)}
                    onChange={() => handleToggleCharacter(character.id)}
                    className="w-5 h-5 rounded border-gray-600 bg-gray-700 text-blue-500 focus:ring-blue-500 focus:ring-offset-gray-800"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`font-medium ${getFactionColor(character.faction)}`}>{character.name}</span>
                      <span className="text-gray-400 text-sm">-</span>
                      <span className="text-gray-400 text-sm truncate">{character.realm}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-gray-500">
                      <span>Level {character.level}</span>
                      <span>•</span>
                      <span>{character.class}</span>
                    </div>
                  </div>
                </label>
              ))}
            </div>

            {/* Save Button */}
            {hasCharacterSelectionChanged() && (
              <div className="mt-4 pt-4 border-t border-gray-700">
                <button
                  onClick={handleSaveCharacters}
                  disabled={isSavingCharacters}
                  className="w-full px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md transition-colors font-medium disabled:opacity-50"
                >
                  {isSavingCharacters ? t("saving") : t("saveCharacters")}
                </button>
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
      </div>
    </main>
  );
}
