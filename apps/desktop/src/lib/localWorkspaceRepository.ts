import {
  WORKFLOW_STATUS,
  type WorkflowRecord,
  type WorkflowStatus,
  type WorkflowSummary,
} from "@flux/shared";
import { parseGraph } from "@flux/workflow-schema";
import { desktopStorage } from "./desktopStorage.js";
import {
  WorkflowVersionConflictError,
  type SaveWorkflowPatch,
} from "../features/workspace/application/workspaceRepositoryPort.js";

const STORAGE_KEY = "local-workspace";
const LOCAL_OWNER_ID = "local-user";
const LOCAL_WORKSPACE_ID = "local";

interface LocalWorkspaceSnapshot {
  schemaVersion: 1;
  workflows: WorkflowRecord[];
  updatedAt: string;
}

let operationQueue = Promise.resolve();

function emptySnapshot(): LocalWorkspaceSnapshot {
  return {
    schemaVersion: 1,
    workflows: [],
    updatedAt: new Date().toISOString(),
  };
}

async function readSnapshot(): Promise<LocalWorkspaceSnapshot> {
  const raw = await desktopStorage.read(STORAGE_KEY);
  if (!raw) return emptySnapshot();
  try {
    const parsed = JSON.parse(raw) as Partial<LocalWorkspaceSnapshot>;
    if (parsed.schemaVersion !== 1 || !Array.isArray(parsed.workflows)) {
      throw new Error("本地工作空间版本不受支持");
    }
    return {
      schemaVersion: 1,
      workflows: parsed.workflows,
      updatedAt: parsed.updatedAt ?? new Date().toISOString(),
    };
  } catch (error) {
    throw new Error(
      error instanceof Error
        ? `本地工作空间无法读取：${error.message}`
        : "本地工作空间无法读取",
    );
  }
}

async function writeSnapshot(snapshot: LocalWorkspaceSnapshot): Promise<void> {
  snapshot.updatedAt = new Date().toISOString();
  await desktopStorage.write(STORAGE_KEY, JSON.stringify(snapshot));
}

function withWriteLock<T>(operation: () => Promise<T>): Promise<T> {
  const result = operationQueue.then(operation, operation);
  operationQueue = result.then(() => undefined, () => undefined);
  return result;
}

function toSummary(record: WorkflowRecord): WorkflowSummary {
  const { graph: _graph, ...summary } = record;
  return structuredClone(summary);
}

function localRecord(
  title: string,
  graph: unknown,
  tags: string[] = [],
): WorkflowRecord {
  const now = new Date().toISOString();
  return {
    id: `local_${crypto.randomUUID()}`,
    ownerId: LOCAL_OWNER_ID,
    workspaceId: LOCAL_WORKSPACE_ID,
    title: title.trim() || "未命名工作流",
    tags: [...tags],
    version: 1,
    status: WORKFLOW_STATUS.DRAFT,
    isFavorite: false,
    createdAt: now,
    updatedAt: now,
    graph: parseGraph(graph),
  };
}

function requireRecord(
  snapshot: LocalWorkspaceSnapshot,
  id: string,
): WorkflowRecord {
  const record = snapshot.workflows.find((workflow) => workflow.id === id);
  if (!record) throw new Error("本地工作流不存在");
  record.graph = parseGraph(record.graph);
  return record;
}

export const localWorkspaceRepository = {
  async list(): Promise<WorkflowSummary[]> {
    const snapshot = await readSnapshot();
    return snapshot.workflows.map(toSummary);
  },

  /** 调度/索引等批处理只读取并解析一次快照，避免 list + N 次 get。 */
  async listRecords(): Promise<WorkflowRecord[]> {
    const snapshot = await readSnapshot();
    return snapshot.workflows.map((record) => ({
      ...structuredClone(record),
      graph: parseGraph(record.graph),
    }));
  },

  async get(id: string): Promise<WorkflowRecord> {
    const snapshot = await readSnapshot();
    return structuredClone(requireRecord(snapshot, id));
  },

  async create(
    title: string,
    graph: unknown,
    tags?: string[],
  ): Promise<WorkflowRecord> {
    return withWriteLock(async () => {
      const snapshot = await readSnapshot();
      const record = localRecord(title, graph, tags);
      snapshot.workflows.push(record);
      await writeSnapshot(snapshot);
      return structuredClone(record);
    });
  },

  async update(id: string, patch: SaveWorkflowPatch): Promise<WorkflowRecord> {
    return withWriteLock(async () => {
      const snapshot = await readSnapshot();
      const record = requireRecord(snapshot, id);
      if (
        patch.expectedVersion !== undefined &&
        patch.expectedVersion !== record.version
      ) {
        throw new WorkflowVersionConflictError(
          record.version,
          patch.expectedVersion,
        );
      }
      if (patch.title !== undefined) {
        record.title = patch.title.trim() || "未命名工作流";
      }
      if (patch.tags !== undefined) record.tags = [...patch.tags];
      if (patch.graph !== undefined) record.graph = parseGraph(patch.graph);
      record.version += 1;
      record.updatedAt = new Date().toISOString();
      await writeSnapshot(snapshot);
      return structuredClone(record);
    });
  },

  async setStatus(id: string, status: WorkflowStatus): Promise<WorkflowRecord> {
    return withWriteLock(async () => {
      const snapshot = await readSnapshot();
      const record = requireRecord(snapshot, id);
      record.status = status;
      record.version += 1;
      record.updatedAt = new Date().toISOString();
      await writeSnapshot(snapshot);
      return structuredClone(record);
    });
  },

  async favorite(id: string, isFavorite: boolean): Promise<WorkflowRecord> {
    return withWriteLock(async () => {
      const snapshot = await readSnapshot();
      const record = requireRecord(snapshot, id);
      record.isFavorite = isFavorite;
      record.updatedAt = new Date().toISOString();
      await writeSnapshot(snapshot);
      return structuredClone(record);
    });
  },

  async remove(id: string): Promise<{ ok: boolean }> {
    return withWriteLock(async () => {
      const snapshot = await readSnapshot();
      const before = snapshot.workflows.length;
      snapshot.workflows = snapshot.workflows.filter((record) => record.id !== id);
      await writeSnapshot(snapshot);
      return { ok: snapshot.workflows.length < before };
    });
  },

  async importRecord(input: {
    title: string;
    graph: unknown;
    tags?: string[];
  }): Promise<WorkflowRecord> {
    return localWorkspaceRepository.create(
      `${input.title.trim() || "导入的工作流"} 副本`,
      input.graph,
      input.tags,
    );
  },
};
