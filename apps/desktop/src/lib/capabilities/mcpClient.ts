import { performHttpRequest, type NativeHttpResponse } from "./httpCapabilityGateway.js";
import {
  MCP_PROTOCOL_VERSION,
  McpCapabilityError,
  operationFromMcpTool,
  type McpConnection,
  type McpToolLike,
} from "./mcpConnection.js";
import { sessionHttpSecretVault } from "./sessionHttpSecretVault.js";
import { callStdioMcp, discoverStdioMcp } from "./mcpStdioGateway.js";
import type { CapabilityInvocationMetadata } from "@flux/node-sdk";

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id?: string | number | null;
  result?: unknown;
  error?: { code?: number; message?: string; data?: unknown };
}

interface McpSession {
  protocolVersion: string;
  sessionId?: string;
  serverName?: string;
  serverVersion?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function responseMessages(response: NativeHttpResponse): JsonRpcResponse[] {
  const body = response.body.trim();
  if (!body) return [];
  const contentType = response.headers["content-type"] ?? "";
  const candidates = contentType.includes("text/event-stream")
    ? body
        .split(/\r?\n\r?\n/)
        .flatMap((event) => {
          const data = event
            .split(/\r?\n/)
            .filter((line) => line.startsWith("data:"))
            .map((line) => line.slice(5).trimStart())
            .join("\n");
          return data ? [data] : [];
        })
    : [body];
  return candidates.flatMap((candidate) => {
    try {
      const parsed: unknown = JSON.parse(candidate);
      return isRecord(parsed) ? [parsed as unknown as JsonRpcResponse] : [];
    } catch {
      return [];
    }
  });
}

function authHeaders(connection: McpConnection): Record<string, string> {
  if (connection.authentication !== "bearer") return {};
  return { Authorization: `Bearer ${sessionHttpSecretVault.require(connection.id)}` };
}

async function post(
  connection: McpConnection,
  message: Record<string, unknown>,
  session?: McpSession,
  metadata?: CapabilityInvocationMetadata,
): Promise<NativeHttpResponse> {
  const response = await performHttpRequest({
    url: connection.serverUrl,
    method: "POST",
    headers: {
      Accept: "application/json, text/event-stream",
      "Content-Type": "application/json",
      ...(session?.protocolVersion ? { "MCP-Protocol-Version": session.protocolVersion } : {}),
      ...(session?.sessionId ? { "Mcp-Session-Id": session.sessionId } : {}),
      ...(metadata ? { "Idempotency-Key": metadata.idempotencyKey } : {}),
      ...authHeaders(connection),
    },
    body: JSON.stringify(message),
  });
  if (response.status === 401 || response.status === 403) {
    throw new McpCapabilityError(
      "MCP_AUTH_REQUIRED",
      "MCP 服务拒绝了访问，请重新填写本次会话的访问令牌",
    );
  }
  if (response.status < 200 || response.status >= 300) {
    throw new McpCapabilityError(
      `MCP_HTTP_${response.status}`,
      `MCP 服务返回 HTTP ${response.status}`,
    );
  }
  return response;
}

async function request(
  connection: McpConnection,
  method: string,
  params: Record<string, unknown> | undefined,
  session?: McpSession,
  metadata?: CapabilityInvocationMetadata,
): Promise<{ result: unknown; response: NativeHttpResponse }> {
  const id = crypto.randomUUID();
  const response = await post(connection, {
    jsonrpc: "2.0",
    id,
    method,
    ...(params ? { params } : {}),
  }, session, metadata);
  const message = responseMessages(response).find((item) => item.id === id);
  if (!message) {
    throw new McpCapabilityError("MCP_RESPONSE_INVALID", "MCP 服务没有返回可识别的 JSON-RPC 响应");
  }
  if (message.error) {
    throw new McpCapabilityError(
      `MCP_RPC_${message.error.code ?? "ERROR"}`,
      message.error.message?.trim() || "MCP 工具调用失败",
    );
  }
  return { result: message.result, response };
}

async function openSession(connection: McpConnection): Promise<McpSession> {
  const initialized = await request(connection, "initialize", {
    protocolVersion: MCP_PROTOCOL_VERSION,
    capabilities: {},
    clientInfo: { name: "Flux", version: "0.1.0" },
  });
  if (!isRecord(initialized.result)) {
    throw new McpCapabilityError("MCP_INITIALIZE_INVALID", "MCP 服务初始化响应无效");
  }
  const result = initialized.result;
  const serverInfo = isRecord(result.serverInfo) ? result.serverInfo : {};
  const session: McpSession = {
    protocolVersion: typeof result.protocolVersion === "string"
      ? result.protocolVersion
      : MCP_PROTOCOL_VERSION,
    sessionId: initialized.response.headers["mcp-session-id"],
    serverName: typeof serverInfo.name === "string" ? serverInfo.name : undefined,
    serverVersion: typeof serverInfo.version === "string" ? serverInfo.version : undefined,
  };
  await post(connection, {
    jsonrpc: "2.0",
    method: "notifications/initialized",
  }, session);
  return session;
}

async function closeSession(connection: McpConnection, session: McpSession): Promise<void> {
  if (!session.sessionId) return;
  try {
    await performHttpRequest({
      url: connection.serverUrl,
      method: "DELETE",
      headers: {
        "MCP-Protocol-Version": session.protocolVersion,
        "Mcp-Session-Id": session.sessionId,
        ...authHeaders(connection),
      },
    });
  } catch {
    // Session cleanup is best-effort and must not hide a successful tool result.
  }
}

export async function discoverMcpCapabilities(connection: McpConnection): Promise<{
  protocolVersion: string;
  serverName?: string;
  serverVersion?: string;
  operations: McpConnection["operations"];
}> {
  if (connection.transport === "stdio") {
    const discovered = await discoverStdioMcp(connection);
    return {
      protocolVersion: discovered.protocolVersion,
      serverName: discovered.serverName,
      serverVersion: discovered.serverVersion,
      operations: discovered.tools
        .filter((tool): tool is McpToolLike =>
          isRecord(tool) && typeof tool.name === "string" && Boolean(tool.name.trim()),
        )
        .slice(0, 200)
        .map((tool) => operationFromMcpTool(connection.id, tool)),
    };
  }
  const session = await openSession(connection);
  try {
    const tools: McpToolLike[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < 10; page += 1) {
      const { result } = await request(
        connection,
        "tools/list",
        cursor ? { cursor } : undefined,
        session,
      );
      if (!isRecord(result) || !Array.isArray(result.tools)) {
        throw new McpCapabilityError("MCP_TOOLS_INVALID", "MCP 服务返回了无效的工具目录");
      }
      tools.push(...result.tools.filter((tool): tool is McpToolLike =>
        isRecord(tool) && typeof tool.name === "string" && Boolean(tool.name.trim()),
      ));
      cursor = typeof result.nextCursor === "string" && result.nextCursor
        ? result.nextCursor
        : undefined;
      if (!cursor) break;
    }
    return {
      protocolVersion: session.protocolVersion,
      serverName: session.serverName,
      serverVersion: session.serverVersion,
      operations: tools.slice(0, 200).map((tool) => operationFromMcpTool(connection.id, tool)),
    };
  } finally {
    await closeSession(connection, session);
  }
}

function toolResultValue(result: unknown): unknown {
  if (!isRecord(result)) return result;
  if (result.isError === true) {
    const message = Array.isArray(result.content)
      ? result.content
          .filter(isRecord)
          .map((item) => typeof item.text === "string" ? item.text : "")
          .filter(Boolean)
          .join("\n")
      : "";
    throw new McpCapabilityError("MCP_TOOL_ERROR", message || "外部能力执行失败");
  }
  if (result.structuredContent !== undefined) return result.structuredContent;
  if (Array.isArray(result.content) && result.content.length === 1) {
    const item = result.content[0];
    if (isRecord(item) && item.type === "text" && typeof item.text === "string") {
      try {
        return JSON.parse(item.text);
      } catch {
        return item.text;
      }
    }
  }
  return { content: result.content ?? [] };
}

export async function callMcpTool(
  connection: McpConnection,
  toolName: string,
  argumentsValue: Record<string, unknown>,
  metadata?: CapabilityInvocationMetadata,
): Promise<unknown> {
  if (connection.transport === "stdio") {
    return toolResultValue(
      await callStdioMcp(connection, toolName, argumentsValue, metadata),
    );
  }
  const session = await openSession(connection);
  try {
    const { result } = await request(connection, "tools/call", {
      name: toolName,
      arguments: argumentsValue,
      ...(metadata ? {
        _meta: { "flux/idempotencyKey": metadata.idempotencyKey },
      } : {}),
    }, session, metadata);
    return toolResultValue(result);
  } finally {
    await closeSession(connection, session);
  }
}
