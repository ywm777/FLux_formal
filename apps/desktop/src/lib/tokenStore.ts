import type { AuthTokens } from "@flux/shared";

const STORAGE_KEY = "flux.auth.tokens";

async function isTauri(): Promise<boolean> {
  try {
    return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
  } catch {
    return false;
  }
}

async function tauriInvoke<T>(
  cmd: string,
  args: Record<string, string>,
): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(cmd, args);
}

/**
 * Token 存储：Tauri 桌面写入工作区 data/desktop/；浏览器调试回退 localStorage。
 */
export const tokenStore = {
  async load(): Promise<AuthTokens | null> {
    try {
      if (await isTauri()) {
        const raw = await tauriInvoke<string | null>("storage_read", {
          key: STORAGE_KEY,
        });
        return raw ? (JSON.parse(raw) as AuthTokens) : null;
      }
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as AuthTokens) : null;
    } catch {
      return null;
    }
  },

  async save(tokens: AuthTokens): Promise<void> {
    const payload = JSON.stringify(tokens);
    if (await isTauri()) {
      await tauriInvoke("storage_write", { key: STORAGE_KEY, value: payload });
      return;
    }
    localStorage.setItem(STORAGE_KEY, payload);
  },

  async clear(): Promise<void> {
    if (await isTauri()) {
      await tauriInvoke("storage_remove", { key: STORAGE_KEY });
      return;
    }
    localStorage.removeItem(STORAGE_KEY);
  },
};
