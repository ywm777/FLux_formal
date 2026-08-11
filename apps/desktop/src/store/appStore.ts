import { create } from "zustand";

/** 顶栏模式：工作台（流程库）/ 画布（流程创作）/ 节点库（能力创作） */
export type AppMode = "workbench" | "canvas" | "nodes";

interface AppState {
  mode: AppMode;
  aiAccessOpen: boolean;
  setMode: (mode: AppMode) => void;
  openAiAccess: () => void;
  closeAiAccess: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  mode: "workbench",
  aiAccessOpen: false,
  setMode: (mode) => set({ mode }),
  openAiAccess: () => set({ aiAccessOpen: true }),
  closeAiAccess: () => set({ aiAccessOpen: false }),
}));
