import React, { createContext, useContext, useState, useEffect, useMemo, ReactNode } from "react";
import * as WebBrowser from "expo-web-browser";
import * as Google from "expo-auth-session/providers/google";
import { makeRedirectUri } from "expo-auth-session";
import { apiRequest, getApiUrl } from "./query-client";
import { fetch } from "expo/fetch";

WebBrowser.maybeCompleteAuthSession();

export interface AuthUser {
  id: string;
  googleId: string;
  email: string;
  name: string;
  avatarUrl?: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    clientId: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID ?? "",
    redirectUri: makeRedirectUri({ scheme: "slumber" }),
  });

  useEffect(() => {
    checkSession();
  }, []);

  useEffect(() => {
    if (response?.type === "success") {
      const idToken = response.params.id_token;
      handleGoogleToken(idToken);
    }
  }, [response]);

  async function checkSession() {
    try {
      const baseUrl = getApiUrl();
      const res = await fetch(`${baseUrl}api/auth/me`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setUser(data);
      }
    } catch {
    } finally {
      setIsLoading(false);
    }
  }

  async function handleGoogleToken(idToken: string) {
    try {
      const res = await apiRequest("POST", "/api/auth/google", { idToken });
      const userData = await res.json();
      setUser(userData);
    } catch (err) {
      console.error("Google sign-in failed:", err);
    }
  }

  async function signInWithGoogle() {
    await promptAsync();
  }

  async function signOut() {
    try {
      await apiRequest("POST", "/api/auth/logout", {});
      setUser(null);
    } catch {
      setUser(null);
    }
  }

  const value = useMemo(() => ({ user, isLoading, signInWithGoogle, signOut }), [user, isLoading, request]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
