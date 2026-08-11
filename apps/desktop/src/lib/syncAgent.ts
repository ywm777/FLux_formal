import { parseGraph, type WorkflowGraph } from "@flux/workflow-schema";

const QUEUE_KEY = "flux.sync.pending";
const SYNC_STORAGE_KEY = "flux.sync.queue";

async function isTauri(): Promise<boolean> {
  try {
    return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
  } catch {
    return false;
  }
}

async function readQueueRaw(): Promise<string | null> {
  if (await isTauri()) {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<string | null>("storage_read", { key: SYNC_STORAGE_KEY });
  }
  return localStorage.getItem(QUEUE_KEY);
}

async function writeQueueRaw(value: string): Promise<void> {
  if (await isTauri()) {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("storage_write", { key: SYNC_STORAGE_KEY, value });
    return;
  }
  localStorage.setItem(QUEUE_KEY, value);
}

async function clearQueueRaw(): Promise<void> {
  if (await isTauri()) {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("storage_remove", { key: SYNC_STORAGE_KEY });
    return;
  }
  localStorage.removeItem(QUEUE_KEY);
}

export interface PendingSyncOp {
  id: string;
  workflowId: string;
  patch: unknown;
  localVersion: number;
  createdAt: string;
}

/** 离线编辑队列（Tauri → data/desktop/；浏览器 → localStorage） */
export const syncAgent = {
  async enqueue(op: Omit<PendingSyncOp, "id" | "createdAt">): Promise<void> {
    const queue = await syncAgent.listPending();
    queue.push({
      ...op,
      id: `sync_${Date.now()}`,
      createdAt: new Date().toISOString(),
    });
    await writeQueueRaw(JSON.stringify(queue));
  },

  async listPending(): Promise<PendingSyncOp[]> {
    try {
      const raw = await readQueueRaw();
      return raw ? (JSON.parse(raw) as PendingSyncOp[]) : [];
    } catch {
      return [];
    }
  },

  async flush(
    push: (op: PendingSyncOp) => Promise<void>,
  ): Promise<{ synced: number; failed: number }> {
    const queue = await syncAgent.listPending();
    let synced = 0;
    let failed = 0;
    const remaining: PendingSyncOp[] = [];
    for (const op of queue) {
      try {
        await push(op);
        synced++;
      } catch {
        failed++;
        remaining.push(op);
      }
    }
    await writeQueueRaw(JSON.stringify(remaining));
    return { synced, failed };
  },

  async clear(): Promise<void> {
    await clearQueueRaw();
  },
};

export interface FluxPack {
  version: 1;
  exportedAt: string;
  workflow: WorkflowGraph;
}

export function exportFluxPack(workflow: WorkflowGraph): FluxPack {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    workflow: parseGraph(workflow),
  };
}

export function importFluxPack(data: unknown): WorkflowGraph {
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    throw new Error("无效的 .flux 包");
  }
  const workflow = (data as Record<string, unknown>).workflow;
  if (!workflow) throw new Error("无效的 .flux 包");
  return parseGraph(workflow);
}
