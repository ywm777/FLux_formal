import { create } from "zustand";
import type { WorkflowSummary } from "@flux/shared";
import { createWorkspaceRepository } from "../lib/workspaceRepository.js";
import type { WorkspaceKind } from "../features/workspace/application/workspaceRepositoryPort.js";
import { formatProductErrorMessage } from "../lib/productError.js";

interface TasksState {
  scope: "local" | "cloud" | null;
  workflows: WorkflowSummary[];
  loading: boolean;
  error: string | null;
  load: (scope: "local" | "cloud") => Promise<void>;
  toggleFavorite: (id: string, current: boolean) => Promise<void>;
  removeWorkflow: (id: string) => Promise<void>;
}

let latestLoadRequest = 0;

function repositoryFor(scope: WorkspaceKind) {
  return createWorkspaceRepository(scope);
}

export const useTasksStore = create<TasksState>((set, get) => ({
  scope: null,
  workflows: [],
  loading: false,
  error: null,

  async load(scope) {
    const request = ++latestLoadRequest;
    const scopeChanged = get().scope !== scope;
    set({
      scope,
      workflows: scopeChanged ? [] : get().workflows,
      loading: true,
      error: null,
    });
    try {
      const workflows = await repositoryFor(scope).list();
      workflows.sort(
        (a, b) =>
          Number(b.isFavorite) - Number(a.isFavorite) ||
          b.updatedAt.localeCompare(a.updatedAt),
      );
      if (request !== latestLoadRequest || get().scope !== scope) return;
      set({ workflows, loading: false });
    } catch (err) {
      if (request !== latestLoadRequest || get().scope !== scope) return;
      set({
        loading: false,
        error: formatProductErrorMessage(err, "加载失败"),
      });
    }
  },

  async toggleFavorite(id, current) {
    try {
      const scope = get().scope ?? "local";
      const updated = await repositoryFor(scope).favorite(id, !current);
      set({
        workflows: get().workflows.map((w) =>
          w.id === id ? { ...w, isFavorite: updated.isFavorite } : w,
        ),
        error: null,
      });
    } catch (err) {
      set({ error: formatProductErrorMessage(err, "更新收藏失败") });
    }
  },

  async removeWorkflow(id) {
    try {
      const scope = get().scope ?? "local";
      await repositoryFor(scope).remove(id);
      set({
        workflows: get().workflows.filter((workflow) => workflow.id !== id),
        error: null,
      });
    } catch (err) {
      const message = formatProductErrorMessage(err, "删除工作流失败");
      set({ error: message });
      throw new Error(message);
    }
  },
}));
