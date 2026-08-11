export const isTauriEnv =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

type TauriWindow = {
  minimize: () => Promise<void>;
  toggleMaximize: () => Promise<void>;
  close: () => Promise<void>;
  isMaximized: () => Promise<boolean>;
  onResized: (cb: () => void) => Promise<() => void>;
};

let cached: TauriWindow | null = null;

async function getWin(): Promise<TauriWindow> {
  if (!cached) {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    cached = getCurrentWindow() as unknown as TauriWindow;
  }
  return cached;
}

export async function minimizeWindow(): Promise<void> {
  if (!isTauriEnv) return;
  await (await getWin()).minimize();
}

export async function toggleMaximizeWindow(): Promise<void> {
  if (!isTauriEnv) return;
  await (await getWin()).toggleMaximize();
}

export async function closeWindow(): Promise<void> {
  if (!isTauriEnv) return;
  await (await getWin()).close();
}

export async function isWindowMaximized(): Promise<boolean> {
  if (!isTauriEnv) return false;
  return (await getWin()).isMaximized();
}

export async function onWindowResized(cb: () => void): Promise<() => void> {
  if (!isTauriEnv) return () => {};
  return (await getWin()).onResized(cb);
}
