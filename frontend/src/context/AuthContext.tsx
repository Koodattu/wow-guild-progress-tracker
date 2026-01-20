"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { User } from "@/types";
import { api } from "@/lib/api";

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    try {
      const currentUser = await api.getCurrentUser();
      setUser(currentUser);
    } catch (error) {
      console.error("Failed to fetch user:", error);
      setUser(null);
    }
  }, []);

  useEffect(() => {
    const initAuth = async () => {
      setIsLoading(true);
      await refreshUser();
      setIsLoading(false);
    };
    initAuth();
  }, [refreshUser]);

  const login = async () => {
    try {
      const { url } = await api.getDiscordLoginUrl();
      window.location.href = url;
    } catch (error) {
      console.error("Failed to get login URL:", error);
    }
  };

  const logout = async () => {
    try {
      await api.logout();
      setUser(null);
    } catch (error) {
      console.error("Failed to logout:", error);
    }
  };

  return <AuthContext.Provider value={{ user, isLoading, login, logout, refreshUser }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
