import { create } from "zustand";
import type { AuthResult, AuthTokens, User } from "@flux/shared";
import {
  authApi,
  setAccessToken,
  setRefreshHandler,
} from "../lib/api.js";
import { formatProductErrorMessage } from "../lib/productError.js";
import { tokenStore } from "../lib/tokenStore.js";
import { useAiConnectionsStore } from "./aiConnectionsStore.js";
import { useAppStore } from "./appStore.js";

export type AuthStatus = "loading" | "authenticated" | "unauthenticated";

interface AuthState {
  status: AuthStatus;
  user: User | null;
  tokens: AuthTokens | null;
  error: string | null;
  bootstrap: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  register: (
    email: string,
    password: string,
    displayName?: string,
  ) => Promise<void>;
  updateProfile: (displayName: string) => Promise<void>;
  changePassword: (
    currentPassword: string,
    newPassword: string,
  ) => Promise<void>;
  revokeOtherSessions: () => Promise<void>;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => {
  function applyResult(result: AuthResult) {
    setAccessToken(result.tokens.accessToken);
    void tokenStore.save(result.tokens);
    set({
      status: "authenticated",
      user: result.user,
      tokens: result.tokens,
      error: null,
    });
  }

  async function clearSession() {
    setAccessToken(null);
    await tokenStore.clear();
    useAiConnectionsStore.getState().reset();
    useAppStore.getState().closeAiAccess();
    set({ status: "unauthenticated", user: null, tokens: null });
  }

  // 401 自动刷新：使用持久化的 refresh token 换新 access token
  setRefreshHandler(async () => {
    const tokens = get().tokens;
    if (!tokens?.refreshToken) return false;
    try {
      const result = await authApi.refresh(tokens.refreshToken);
      applyResult(result);
      return true;
    } catch {
      await clearSession();
      return false;
    }
  });

  return {
    status: "loading",
    user: null,
    tokens: null,
    error: null,

    async bootstrap() {
      const tokens = await tokenStore.load();
      if (!tokens) {
        set({ status: "unauthenticated" });
        return;
      }
      set({ tokens });
      setAccessToken(tokens.accessToken);
      try {
        const user = await authApi.me();
        set({ status: "authenticated", user });
      } catch {
        try {
          const result = await authApi.refresh(tokens.refreshToken);
          applyResult(result);
        } catch {
          await clearSession();
        }
      }
    },

    async login(email, password) {
      set({ error: null });
      try {
        applyResult(await authApi.login(email, password));
      } catch (err) {
        set({ error: formatProductErrorMessage(err, "登录失败") });
        throw err;
      }
    },

    async register(email, password, displayName) {
      set({ error: null });
      try {
        applyResult(await authApi.register(email, password, displayName));
      } catch (err) {
        set({ error: formatProductErrorMessage(err, "注册失败") });
        throw err;
      }
    },

    async updateProfile(displayName) {
      const user = await authApi.updateProfile(displayName);
      set({ user });
    },

    async changePassword(currentPassword, newPassword) {
      applyResult(await authApi.changePassword(currentPassword, newPassword));
    },

    async revokeOtherSessions() {
      applyResult(await authApi.revokeOtherSessions());
    },

    async logout() {
      await clearSession();
    },
  };
});
