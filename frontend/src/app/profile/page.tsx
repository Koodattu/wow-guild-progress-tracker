"use client";

import { useAuth } from "@/context/AuthContext";
import { useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
import CharacterSelectorDialog from "@/components/CharacterSelectorDialog";

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

  // Check if we should open the dialog after Battle.net connection
  useEffect(() => {
    const connected = searchParams.get("connected");
    if (connected === "battlenet" && user?.battlenet?.characters && user.battlenet.characters.length > 0) {
      setShowCharacterDialog(true);
    }
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
                <svg className="w-8 h-8 text-purple-500" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714z" />
                </svg>
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
                <svg className="w-8 h-8 text-blue-400" viewBox="0 0 30 30" fill="currentColor">
                  <path d="M 14.5625 0.0625 C 13.40625 1.089844 12.59375 2.632813 12.28125 4.34375 C 12.265625 4.441406 12.269531 4.558594 12.25 4.65625 C 14.191406 4.855469 16.019531 5.925781 17.21875 7.53125 C 17.289063 7.628906 17.339844 7.726563 17.40625 7.8125 C 17.730469 7.351563 17.980469 6.816406 18.125 6.25 C 18.527344 4.742188 18.230469 3.113281 17.34375 1.84375 C 17.328125 1.820313 17.296875 1.804688 17.28125 1.78125 C 17.101563 1.539063 16.886719 1.3125 16.65625 1.09375 C 15.976563 0.460938 15.207031 0.148438 14.5625 0.0625 Z M 8.78125 1.15625 C 6.929688 4.335938 6.894531 8.1875 8.65625 11.09375 C 9.257813 11.992188 10.023438 12.765625 10.875 13.40625 C 11.027344 12.988281 11.246094 12.617188 11.46875 12.28125 C 12.347656 10.972656 13.539063 9.8125 14.90625 8.90625 C 14.90625 8.90625 14.925781 8.90625 14.9375 8.90625 C 14.207031 7.375 12.65625 6.371094 10.9375 6.1875 C 10.917969 6.1875 10.894531 6.1875 10.875 6.1875 C 9.925781 6.101563 8.964844 6.265625 8.09375 6.625 C 8.132813 5.6875 8.386719 4.730469 8.8125 3.875 C 8.839844 3.820313 8.839844 3.742188 8.875 3.6875 C 9.511719 2.464844 10.457031 1.527344 11.53125 0.84375 C 10.59375 0.800781 9.640625 0.875 8.78125 1.15625 Z M 4.21875 7.5 C 4.1875 7.554688 4.15625 7.632813 4.125 7.6875 C 3.015625 9.488281 2.820313 11.746094 3.46875 13.75 C 3.734375 14.589844 4.152344 15.367188 4.65625 16.0625 C 5.484375 15.75 6.386719 15.53125 7.3125 15.46875 C 9.023438 15.359375 10.792969 15.769531 12.3125 16.625 C 12.328125 16.636719 12.359375 16.613281 12.375 16.625 C 11.484375 15.3125 10.773438 13.839844 10.3125 12.28125 C 9.636719 11.757813 9.039063 11.117188 8.5625 10.40625 C 8.558594 10.394531 8.535156 10.386719 8.53125 10.375 C 6.953125 8.066406 6.839844 5.144531 8.15625 2.78125 C 7.816406 2.910156 7.484375 3.054688 7.15625 3.21875 C 5.53125 4.078125 4.464844 5.660156 4.21875 7.5 Z M 20.78125 10.5625 C 18.898438 10.695313 17.125 11.648438 15.9375 13.1875 C 15.351563 13.953125 14.917969 14.832031 14.6875 15.75 C 15.523438 16.246094 16.34375 16.851563 17.03125 17.625 C 18.277344 19.042969 19.046875 20.835938 19.21875 22.71875 C 19.226563 22.800781 19.210938 22.886719 19.21875 22.96875 C 19.308594 22.925781 19.386719 22.855469 19.46875 22.8125 C 19.601563 22.742188 19.730469 22.667969 19.84375 22.5625 C 21.957031 20.863281 22.820313 17.929688 22.03125 15.34375 C 21.507813 13.632813 20.21875 12.117188 18.625 11.34375 C 18.214844 11.148438 17.789063 10.988281 17.34375 10.875 C 17.335938 10.875 17.320313 10.875 17.3125 10.875 C 16.871094 10.765625 16.402344 10.707031 15.9375 10.6875 C 15.90625 10.6875 15.875 10.6875 15.84375 10.6875 C 15.496094 10.679688 15.136719 10.6875 14.78125 10.6875 C 15.386719 10.40625 16.058594 10.21875 16.75 10.125 C 16.914063 10.101563 17.085938 10.082031 17.25 10.0625 C 18.460938 9.929688 19.699219 10.183594 20.78125 10.5625 Z M 22.6875 11.3125 C 21.703125 11.917969 20.851563 12.683594 20.125 13.5625 C 21.0625 14.609375 21.707031 15.886719 22 17.28125 C 22.035156 17.441406 22.050781 17.617188 22.0625 17.78125 C 23.085938 16.886719 23.9375 15.796875 24.5625 14.59375 C 25.875 12.183594 25.769531 9.300781 24.28125 7 C 23.9375 8.863281 23.269531 10.207031 22.6875 11.3125 Z M 1.65625 12.90625 C 1.597656 13.113281 1.578125 13.324219 1.53125 13.53125 C 1.15625 15.628906 1.785156 17.878906 3.15625 19.5 C 3.390625 19.769531 3.648438 20.011719 3.90625 20.25 C 3.945313 19.019531 4.175781 17.78125 4.65625 16.625 C 5.066406 15.652344 5.644531 14.757813 6.34375 13.96875 C 4.878906 13.730469 3.363281 13.9375 2 14.53125 C 1.871094 14.015625 1.757813 13.457031 1.65625 12.90625 Z M 12.71875 17.6875 C 11.414063 17.386719 10.042969 17.386719 8.75 17.6875 C 7.671875 17.9375 6.640625 18.371094 5.71875 18.9375 C 5.722656 18.949219 5.746094 18.957031 5.75 18.96875 C 5.910156 19.085938 6.0625 19.195313 6.21875 19.3125 C 6.21875 19.3125 6.25 19.3125 6.25 19.3125 C 8.191406 20.675781 10.660156 20.988281 12.90625 20.1875 C 13.078125 20.125 13.25 20.042969 13.40625 19.96875 C 13.707031 19.828125 13.988281 19.679688 14.28125 19.5 C 14.28125 19.5 14.28125 19.5 14.28125 19.5 C 13.730469 18.9375 13.222656 18.3125 12.71875 17.6875 Z M 17.0625 19.125 C 16.8125 19.367188 16.546875 19.625 16.3125 19.90625 C 16.160156 20.078125 16.023438 20.261719 15.875 20.4375 C 15.84375 20.46875 15.8125 20.5 15.78125 20.53125 C 15.75 20.5625 15.71875 20.574219 15.6875 20.59375 C 15.683594 20.597656 15.65625 20.621094 15.65625 20.625 C 15.652344 20.628906 15.65625 20.652344 15.65625 20.65625 C 15.570313 20.753906 15.496094 20.871094 15.40625 20.96875 C 14.578125 21.96875 13.882813 23.070313 13.375 24.28125 C 13.242188 24.589844 13.113281 24.914063 13 25.25 C 13 25.253906 13 25.277344 13 25.28125 C 12.855469 25.738281 12.742188 26.199219 12.65625 26.6875 C 13.585938 26.132813 14.292969 25.121094 14.59375 24 C 14.789063 23.257813 14.8125 22.484375 14.6875 21.75 C 14.621094 21.394531 14.546875 21.050781 14.4375 20.71875 C 14.429688 20.691406 14.445313 20.652344 14.4375 20.625 C 14.429688 20.601563 14.445313 20.570313 14.4375 20.5625 C 14.421875 20.515625 14.390625 20.484375 14.375 20.4375 C 14.367188 20.414063 14.382813 20.398438 14.375 20.375 C 14.371094 20.363281 14.347656 20.355469 14.34375 20.34375 C 14.339844 20.339844 14.347656 20.316406 14.34375 20.3125 C 14.207031 19.988281 14.050781 19.667969 13.875 19.375 C 14.917969 20.011719 16.113281 20.410156 17.34375 20.5 C 17.269531 20.03125 17.183594 19.578125 17.0625 19.125 Z M 19.53125 21.96875 C 19.457031 23.785156 18.863281 25.492188 17.875 26.9375 C 17.78125 27.0625 17.71875 27.21875 17.625 27.34375 C 17.621094 27.347656 17.628906 27.371094 17.625 27.375 C 16.824219 28.40625 15.855469 29.304688 14.75 30.03125 C 14.769531 30.03125 14.761719 30.03125 14.78125 30.03125 C 15.632813 29.980469 16.492188 29.722656 17.25 29.25 C 18.742188 28.316406 19.886719 26.859375 20.5 25.25 C 21.253906 23.28125 21.207031 21.042969 20.375 19.09375 C 20.101563 20.035156 19.824219 21.003906 19.53125 21.96875 Z M 8 22 C 8.191406 22.484375 8.429688 22.960938 8.6875 23.40625 C 9.664063 25.097656 11.128906 26.410156 12.8125 27.15625 C 12.675781 26.476563 12.617188 25.769531 12.625 25.0625 C 12.644531 23.667969 13.03125 22.277344 13.75 21.03125 C 12.046875 21.386719 10.242188 21.242188 8.59375 20.59375 C 8.34375 21.042969 8.148438 21.511719 8 22 Z M 24.9375 19.1875 C 24.730469 20.273438 24.335938 21.328125 23.75 22.28125 C 22.601563 24.167969 20.800781 25.519531 18.78125 26.15625 C 19.707031 27.234375 20.214844 28.632813 20.21875 30.0625 C 21.359375 29.207031 22.3125 28.109375 23 26.875 C 24.777344 23.804688 24.765625 19.972656 22.96875 16.90625 C 23.507813 17.535156 24.011719 18.207031 24.46875 18.9375 C 24.578125 19.113281 24.769531 19.320313 24.875 19.5 C 24.898438 19.535156 24.914063 19.589844 24.9375 19.625 C 24.9375 19.628906 24.9375 19.644531 24.9375 19.65625 C 24.9375 19.679688 24.9375 19.695313 24.9375 19.71875 C 24.9375 19.75 24.914063 19.78125 24.9375 19.8125 C 24.914063 19.917969 24.988281 20.039063 24.9375 20.125 C 24.914063 20.175781 24.894531 20.230469 24.875 20.28125 C 24.828125 20.382813 24.800781 20.476563 24.71875 20.5625 C 24.714844 20.566406 24.722656 20.589844 24.71875 20.59375 C 24.707031 20.609375 24.699219 20.640625 24.6875 20.65625 C 24.636719 20.738281 24.585938 20.828125 24.53125 20.90625 C 24.519531 20.925781 24.511719 20.949219 24.5 20.96875 C 24.464844 21.019531 24.441406 21.074219 24.40625 21.125 C 24.398438 21.140625 24.382813 21.171875 24.375 21.1875 C 24.371094 21.195313 24.347656 21.210938 24.34375 21.21875 C 24.027344 21.710938 23.691406 22.183594 23.3125 22.625 C 24.203125 21.800781 24.921875 20.78125 25.4375 19.65625 C 25.28125 19.457031 25.113281 19.3125 24.9375 19.1875 Z M 6.09375 22.875 C 5.519531 23.828125 5.113281 24.882813 4.9375 25.96875 C 3.320313 24.074219 2.75 21.457031 3.46875 19.09375 C 3.058594 19.738281 2.6875 20.398438 2.375 21.09375 C 1.039063 23.820313 1.128906 27.042969 2.59375 29.6875 C 3.28125 27.648438 4.480469 25.117188 6.09375 22.875 Z M 9.40625 24.625 C 9.695313 25.394531 10.101563 26.117188 10.59375 26.78125 C 12.011719 28.835938 14.257813 30.105469 16.65625 30.28125 C 15.359375 29.515625 14.300781 28.390625 13.59375 27.09375 C 13.230469 26.429688 12.976563 25.714844 12.84375 24.96875 C 11.617188 25.144531 10.386719 25.027344 9.21875 24.65625 C 9.28125 24.648438 9.34375 24.632813 9.40625 24.625 Z M 18.28125 27.1875 C 18.070313 28.171875 17.632813 29.105469 17.03125 29.9375 C 16.640625 30.488281 16.167969 30.96875 15.625 31.375 C 17.5625 31.183594 19.410156 30.128906 20.625 28.5 C 21.03125 27.960938 21.359375 27.371094 21.625 26.75 C 20.519531 26.894531 19.382813 27.15625 18.28125 27.1875 Z" />
                </svg>
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
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {selectedCharacters.map((character) => (
                  <div key={character.id} className="bg-gray-700/50 rounded-lg p-4 border border-gray-600 hover:border-gray-500 transition-colors">
                    {/* Character Name */}
                    <div className="font-bold text-lg mb-1" style={{ color: getClassColor(character.class) }}>
                      {character.name}
                    </div>

                    {/* Realm */}
                    <div className="text-gray-400 text-sm mb-2">{character.realm}</div>

                    {/* Character Details */}
                    <div className="space-y-1 text-sm">
                      <div className="flex items-center gap-1.5">
                        <span className="text-gray-500">Race:</span>
                        <span style={{ color: getFactionColor(character.faction) }}>{character.race}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-gray-500">Class:</span>
                        <span style={{ color: getClassColor(character.class) }}>{character.class}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-gray-500">Level:</span>
                        <span className="text-white">{character.level}</span>
                      </div>
                      {character.guild && (
                        <div className="flex items-center gap-1.5">
                          <span className="text-gray-500">Guild:</span>
                          <span className="text-yellow-400 truncate">{character.guild}</span>
                        </div>
                      )}
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
