import type { ExecutionDetail } from "@flux/shared";
import type {
  ExecutionCheckpoint,
  ExecutionEffectRecord,
} from "@flux/workflow-runtime";
import type { IdentityRow, UserRow } from "../repositories/users.repository";
import type { WorkflowRecord } from "@flux/shared";
import type { AiConnectionRow } from "../repositories/ai-connections.repository";
import type { ExecutionControlMode } from "../repositories/executions.repository";
import { dataPath, readJsonFile, writeJsonFile } from "./paths";

export interface FileDbSnapshot {
  users: UserRow[];
  identities: IdentityRow[];
  workflows: WorkflowRecord[];
  executions: StoredFileExecution[];
  aiConnections: AiConnectionRow[];
}

export interface StoredFileExecution extends ExecutionDetail {
  /** Missing only on records created before resumable executions existed. */
  graphSnapshot?: unknown;
  checkpoint?: ExecutionCheckpoint;
  controlMode?: ExecutionControlMode;
  controlRequestedAt?: string;
  workerToken?: string;
  leaseUntil?: string;
  /** Missing only on records written before the durable effect journal. */
  effects?: ExecutionEffectRecord[];
}

const DB_FILE = () => dataPath("api", "db.json");

/** 工作区 JSON 文件库（数据落在 FLUX_DATA_DIR，默认仓库 data/） */
export class FileDb {
  private snapshot: FileDbSnapshot;

  constructor() {
    const saved = readJsonFile<Partial<FileDbSnapshot>>(DB_FILE(), {});
    // 兼容加入新集合前已经存在的 db.json。
    this.snapshot = {
      users: (saved.users ?? []).map((user) => ({
        ...user,
        authVersion: user.authVersion ?? 1,
      })),
      identities: saved.identities ?? [],
      workflows: saved.workflows ?? [],
      executions: saved.executions ?? [],
      aiConnections: saved.aiConnections ?? [],
    };
  }

  get(): FileDbSnapshot {
    return this.snapshot;
  }

  mutate(fn: (db: FileDbSnapshot) => void): void {
    // 先在副本上完成变更并持久化；写盘失败时内存仍保持最后一个已提交快照。
    const next = structuredClone(this.snapshot);
    fn(next);
    writeJsonFile(DB_FILE(), next);
    this.snapshot = next;
  }
}
