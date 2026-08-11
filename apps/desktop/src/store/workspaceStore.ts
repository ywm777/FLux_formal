import { create } from "zustand";
import { desktopStorage } from "../lib/desktopStorage.js";
import type { WorkspaceKind } from "../features/workspace/application/workspaceRepositoryPort.js";

export type { WorkspaceKind } from "../features/workspace/application/workspaceRepositoryPort.js";

const WORKSPACE_PREFERENCE_KEY = "workspace-preference";

export type CloudAccessIntent = "switch" | "share";

interface WorkspaceState {
  kind: WorkspaceKind;
  ready: boolean;
  cloudAccessIntent: CloudAccessIntent | null;
  bootstrap: () => Promise<void>;
  setKind: (kind: WorkspaceKind) => Promise<void>;
  requestCloudAccess: (intent?: CloudAccessIntent) => void;
  closeCloudAccess: () => void;
}

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  kind: "local",
  ready: false,
  cloudAccessIntent: null,

  async bootstrap() {
    try {
      const stored = await desktopStorage.read(WORKSPACE_PREFERENCE_KEY);
      set({ kind: stored === "cloud" ? "cloud" : "local", ready: true });
    } catch {
      set({ kind: "local", ready: true });
    }
  },

  async setKind(kind) {
    await desktopStorage.write(WORKSPACE_PREFERENCE_KEY, kind);
    set({ kind, cloudAccessIntent: null });
  },

  requestCloudAccess(intent = "switch") {
    set({ cloudAccessIntent: intent });
  },

  closeCloudAccess() {
    set({ cloudAccessIntent: null });
  },
}));
