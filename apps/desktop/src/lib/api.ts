import type {
  AuthResult,
  ExecutionDetail,
  ExecutionLogEntry,
  ExecutionNodeInputs,
  ExecutionStatus,
  ExecutionSummary,
  SharedWorkflow,
  User,
  WorkflowRecord,
  WorkflowShareInfo,
  WorkflowSummary,
} from "@flux/shared";

const BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ??
  "http://localhost:3000";
const API = `${BASE_URL}/api`;

export interface NodeRunResult {
  nodeId: string;
  type: string;
  status: "pending" | "running" | "success" | "failed" | "skipped";
  outputs?: Record<string, unknown>;
  error?: string;
}

export type { ExecutionLogEntry, ExecutionStatus, ExecutionDetail };

export interface ExecutionResponse {
  executionId: string;
  status: ExecutionStatus;
  order: string[];
  runs: NodeRunResult[];
  logs: ExecutionLogEntry[];
  error?: string;
}

const TERMINAL: ExecutionStatus[] = [
  "success",
  "failed",
  "cancelled",
  "paused",
];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const API_REQUEST_TIMEOUT_MS = 15_000;
const EXECUTION_POLL_DEADLINE_MS = 15 * 60_000;

function requestSignal(external?: AbortSignal): {
  signal: AbortSignal;
  dispose: () => void;
  timedOut: () => boolean;
} {
  const controller = new AbortController();
  let timeoutReached = false;
  const abortFromExternal = () => controller.abort(external?.reason);
  if (external?.aborted) abortFromExternal();
  else external?.addEventListener("abort", abortFromExternal, { once: true });
  const timer = window.setTimeout(() => {
    timeoutReached = true;
    controller.abort(new DOMException("API request timed out", "TimeoutError"));
  }, API_REQUEST_TIMEOUT_MS);
  return {
    signal: controller.signal,
    timedOut: () => timeoutReached,
    dispose: () => {
      window.clearTimeout(timer);
      external?.removeEventListener("abort", abortFromExternal);
    },
  };
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// --- token 注入 + 自动刷新 ---------------------------------------------------

let accessToken: string | null = null;
let refreshHandler: (() => Promise<boolean>) | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function setRefreshHandler(fn: (() => Promise<boolean>) | null): void {
  refreshHandler = fn;
}

async function request<T>(
  path: string,
  init: RequestInit = {},
  retry = true,
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init.headers as Record<string, string> | undefined),
  };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  const requestAbort = requestSignal(init.signal ?? undefined);
  try {
    const res = await fetch(`${API}${path}`, {
      ...init,
      headers,
      signal: requestAbort.signal,
    });

    if (res.status === 401 && retry && refreshHandler) {
      const refreshed = await refreshHandler();
      if (refreshed) return request<T>(path, init, false);
    }

    if (!res.ok) {
      let message = `HTTP ${res.status}`;
      let details: Record<string, unknown> = {};
      try {
        const body = (await res.json()) as unknown;
        if (typeof body === "object" && body !== null) {
          details = body as Record<string, unknown>;
          const responseMessage = details.message;
          if (typeof responseMessage === "string") message = responseMessage;
          if (Array.isArray(responseMessage)) {
            message = responseMessage.map(String).join("；");
          }
        }
      } catch {
        /* ignore parse error */
      }
      throw new ApiError(res.status, message, details);
    }

    if (res.status === 204) return undefined as T;
    const body = await res.text();
    if (!body) return null as T;
    return JSON.parse(body) as T;
  } catch (error) {
    if (requestAbort.timedOut()) {
      throw new ApiError(408, "服务请求超时，请稍后重试", {
        code: "API_REQUEST_TIMEOUT",
      });
    }
    throw error;
  } finally {
    requestAbort.dispose();
  }
}

// --- Auth -------------------------------------------------------------------

export const authApi = {
  register: (email: string, password: string, displayName?: string) =>
    request<AuthResult>("/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password, displayName }),
    }),
  login: (email: string, password: string) =>
    request<AuthResult>("/auth/email", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  refresh: (refreshToken: string) =>
    request<AuthResult>("/auth/refresh", {
      method: "POST",
      body: JSON.stringify({ refreshToken }),
    }, false),
  me: () => request<User>("/auth/me"),
  updateProfile: (displayName: string) =>
    request<User>("/auth/me", {
      method: "PATCH",
      body: JSON.stringify({ displayName }),
    }),
  changePassword: (currentPassword: string, newPassword: string) =>
    request<AuthResult>("/auth/password", {
      method: "POST",
      body: JSON.stringify({ currentPassword, newPassword }),
    }),
  revokeOtherSessions: () =>
    request<AuthResult>("/auth/sessions/revoke-other", { method: "POST" }),
};

// --- AI connections ---------------------------------------------------------

export type AiProvider = "openai-compatible" | "ollama";
export type AiConnectionStatus = "untested" | "connected" | "unavailable";

export interface AiConnection {
  id: string;
  label: string;
  provider: AiProvider;
  baseUrl: string;
  defaultModel: string;
  hasApiKey: boolean;
  status: AiConnectionStatus;
  lastTestedAt?: string | null;
  errorMessage?: string | null;
  createdAt: string;
}

export interface CreateAiConnectionInput {
  label: string;
  provider: AiProvider;
  baseUrl: string;
  defaultModel: string;
  apiKey?: string;
}

export interface AiCompletionResult {
  model: string;
  text: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
  };
}

export const aiApi = {
  listConnections: () => request<AiConnection[]>("/ai/connections"),
  createConnection: (input: CreateAiConnectionInput) =>
    request<AiConnection>("/ai/connections", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  testConnection: (id: string) =>
    request<AiConnection>(`/ai/connections/${id}/test`, { method: "POST" }),
  removeConnection: (id: string) =>
    request<{ ok: boolean }>(`/ai/connections/${id}`, { method: "DELETE" }),
  complete: (input: {
    connectionId?: string;
    model?: string;
    prompt: string;
    maxTokens?: number;
  }) =>
    request<AiCompletionResult>("/ai/completions", {
      method: "POST",
      body: JSON.stringify(input),
    }),
};

// --- Workflows --------------------------------------------------------------

export interface SaveWorkflowInput {
  title?: string;
  tags?: string[];
  graph?: unknown;
  expectedVersion?: number;
}

export const cloudWorkflowApi = {
  list: () => request<WorkflowSummary[]>("/workflows"),
  listPublished: () => request<WorkflowSummary[]>("/workflows/published"),
  get: (id: string) => request<WorkflowRecord>(`/workflows/${id}`),
  create: (title: string, graph: unknown, tags?: string[]) =>
    request<WorkflowRecord>("/workflows", {
      method: "POST",
      body: JSON.stringify({ title, graph, tags }),
    }),
  update: (id: string, patch: SaveWorkflowInput) =>
    request<WorkflowRecord>(`/workflows/${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),
  publish: (id: string) =>
    request<WorkflowRecord>(`/workflows/${id}/publish`, { method: "POST" }),
  getShare: (id: string) =>
    request<WorkflowShareInfo | null>(`/workflows/${id}/share`),
  enableShare: (id: string) =>
    request<WorkflowShareInfo>(`/workflows/${id}/share`, { method: "POST" }),
  disableShare: (id: string) =>
    request<{ ok: boolean }>(`/workflows/${id}/share`, { method: "DELETE" }),
  getShared: (shareId: string) =>
    request<SharedWorkflow>(`/workflow-shares/${encodeURIComponent(shareId)}`),
  copyShared: (shareId: string) =>
    request<WorkflowRecord>(
      `/workflow-shares/${encodeURIComponent(shareId)}/copy`,
      { method: "POST" },
    ),
  favorite: (id: string, isFavorite: boolean) =>
    request<WorkflowRecord>(`/workflows/${id}/favorite`, {
      method: "POST",
      body: JSON.stringify({ isFavorite }),
    }),
  remove: (id: string) =>
    request<{ ok: boolean }>(`/workflows/${id}`, { method: "DELETE" }),
};

/** @deprecated 编辑器请使用 workspaceRepository；此别名仅保留在线分享兼容。 */
export const workflowApi = cloudWorkflowApi;

function toExecutionResponse(detail: ExecutionDetail): ExecutionResponse {
  return {
    executionId: detail.id,
    status: detail.status,
    order: detail.order,
    runs: detail.runs,
    logs: detail.logs,
    error: detail.error,
  };
}

export const executionApi = {
  start: (workflowId: string, inputs: ExecutionNodeInputs = {}) =>
    request<{ executionId: string; status: string }>("/executions", {
      method: "POST",
      body: JSON.stringify({ workflowId, inputs }),
    }),
  test: (workflowId: string, inputs: ExecutionNodeInputs = {}) =>
    request<{ executionId: string; status: string }>("/executions/test", {
      method: "POST",
      body: JSON.stringify({ workflowId, inputs }),
    }),
  get: (id: string) => request<ExecutionDetail>(`/executions/${id}`),
  logs: (id: string) =>
    request<{ executionId: string; logs: ExecutionLogEntry[] }>(
      `/executions/${id}/logs`,
    ),
  cancel: (id: string, mode: "terminate" | "pause" = "terminate") =>
    request<{ executionId: string; cancelled: boolean }>(
      `/executions/${id}/cancel?mode=${mode}`,
      { method: "POST" },
    ),
  resume: (id: string) =>
    request<{ executionId: string; status: string }>(
      `/executions/${id}/resume`,
      { method: "POST" },
    ),
  approve: (
    id: string,
    input: {
      nodeId: string;
      decision: "approved" | "rejected";
      reviewer?: string;
      note?: string;
    },
  ) =>
    request<{ executionId: string; status: string }>(
      `/executions/${id}/approval`,
      {
        method: "POST",
        body: JSON.stringify(input),
      },
    ),
  list: () => request<ExecutionSummary[]>("/executions"),
};

/** 启动已发布工作流执行并轮询直至终态 */
export async function runExecution(
  workflowId: string,
  inputs: ExecutionNodeInputs = {},
  onProgress?: (detail: ExecutionDetail) => void,
): Promise<ExecutionResponse> {
  const { executionId } = await executionApi.start(workflowId, inputs);
  return waitForExecution(executionId, onProgress);
}

async function waitForExecution(
  executionId: string,
  onProgress?: (detail: ExecutionDetail) => void,
): Promise<ExecutionResponse> {
  const deadline = Date.now() + EXECUTION_POLL_DEADLINE_MS;
  let delay = 500;
  for (;;) {
    const detail = await executionApi.get(executionId);
    onProgress?.(detail);
    if (TERMINAL.includes(detail.status)) {
      return toExecutionResponse(detail);
    }
    if (Date.now() >= deadline) {
      throw new ApiError(408, "执行状态等待超时，可稍后在任务记录中查看结果", {
        code: "EXECUTION_POLL_TIMEOUT",
        executionId,
      });
    }
    await sleep(delay);
    delay = Math.min(2_000, Math.round(delay * 1.35));
  }
}

/** 启动画布运行预览并轮询直至终态 */
export async function runDraftExecution(
  workflowId: string,
  inputs: ExecutionNodeInputs = {},
  onProgress?: (detail: ExecutionDetail) => void,
): Promise<ExecutionResponse> {
  const { executionId } = await executionApi.test(workflowId, inputs);
  return waitForExecution(executionId, onProgress);
}

export async function approveExecutionAndContinue(
  executionId: string,
  input: {
    nodeId: string;
    decision: "approved" | "rejected";
    reviewer?: string;
    note?: string;
  },
  onProgress?: (detail: ExecutionDetail) => void,
): Promise<ExecutionResponse> {
  await executionApi.approve(executionId, input);
  return waitForExecution(executionId, onProgress);
}
