const BROWSER_PREFIX = "flux.desktop.";

export function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export const desktopStorage = {
  async read(key: string): Promise<string | null> {
    if (isTauriRuntime()) {
      const { invoke } = await import("@tauri-apps/api/core");
      return invoke<string | null>("storage_read", { key });
    }
    return window.localStorage.getItem(`${BROWSER_PREFIX}${key}`);
  },

  async write(key: string, value: string): Promise<void> {
    if (isTauriRuntime()) {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("storage_write", { key, value });
      return;
    }
    window.localStorage.setItem(`${BROWSER_PREFIX}${key}`, value);
  },

  async remove(key: string): Promise<void> {
    if (isTauriRuntime()) {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("storage_remove", { key });
      return;
    }
    window.localStorage.removeItem(`${BROWSER_PREFIX}${key}`);
  },
};
