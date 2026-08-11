import type { ID, ISODateString } from "./common.js";
import type { WorkflowStatus, ExecutionStatus, NodeRunStatus } from "../constants.js";

/** 工作流摘要（列表展示，不含完整 graph） */
export interface WorkflowSummary {
  id: ID;
  ownerId: ID;
  workspaceId: ID;
  title: string;
  tags: string[];
  version: number;
  status: WorkflowStatus;
  isFavorite: boolean;
  /** 可撤销的非公开索引分享标识；仅所有者接口返回。 */
  shareId?: string;
  sharedAt?: ISODateString;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

/** 工作流完整记录（含序列化 graph） */
export interface WorkflowRecord extends WorkflowSummary {
  graph: unknown; // 对应 @flux/workflow-schema WorkflowGraph
}

export interface WorkflowShareInfo {
  workflowId: ID;
  shareId: string;
  sharedAt: ISODateString;
}

/** 公开分享视图，不暴露所有者、空间和收藏等账户内部字段。 */
export interface SharedWorkflow {
  shareId: string;
  title: string;
  tags: string[];
  version: number;
  updatedAt: ISODateString;
  graph: unknown;
}

/** 执行摘要 */
export interface ExecutionSummary {
  id: ID;
  workflowId: ID;
  status: ExecutionStatus;
  startedAt: ISODateString;
  finishedAt?: ISODateString;
}

export interface ExecutionLogEntry {
  nodeId: string;
  level: "info" | "warn" | "error";
  message: string;
  at: ISODateString;
}

/** 按节点 ID 传入、仅对本次执行生效的临时参数。 */
export type ExecutionNodeInputs = Record<string, Record<string, unknown>>;

export interface NodeRunRecord {
  nodeId: string;
  type: string;
  status: NodeRunStatus;
  outputs?: Record<string, unknown>;
  error?: string;
}

/** 执行详情（含节点运行与日志，供任务页轮询展示） */
export interface ExecutionDetail extends ExecutionSummary {
  ownerId: ID;
  order: string[];
  runs: NodeRunRecord[];
  logs: ExecutionLogEntry[];
  error?: string;
}
