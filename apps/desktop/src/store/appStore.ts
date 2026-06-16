import { create } from "zustand";
import type { ExecutionResponse } from "../lib/api.js";

/** 顶栏模式：画布（创作层）/ 任务（执行层），严格隔离 */
export type AppMode = "canvas" | "tasks";

interface AppState {
  mode: AppMode;
  setMode: (mode: AppMode) => void;
  /** 最近一次执行结果（用于任务页展示） */
  lastExecution: ExecutionResponse | null;
  running: boolean;
  setRunning: (running: boolean) => void;
  setLastExecution: (result: ExecutionResponse) => void;
}

export const useAppStore = create<AppState>((set) => ({
  mode: "canvas",
  setMode: (mode) => set({ mode }),
  lastExecution: null,
  running: false,
  setRunning: (running) => set({ running }),
  setLastExecution: (lastExecution) =>
    set({ lastExecution, mode: "tasks", running: false }),
}));
