import { isTauriRuntime } from "../desktopStorage.js";
import type { McpConnection, McpToolLike } from "./mcpConnection.js";
import type { CapabilityInvocationMetadata } from "@flux/node-sdk";

interface McpStdioOutput {
  protocolVersion: string;
  serverName?: string;
  serverVersion?: string;
  tools: McpToolLike[];
  result?: unknown;
}

async function execute(
  connection: McpConnection,
  action: "discover" | "call",
  toolName?: string,
  argumentsValue?: Record<string, unknown>,
  metadata?: CapabilityInvocationMetadata,
): Promise<McpStdioOutput> {
  if (!isTauriRuntime()) {
    throw new Error("STDIO MCP 只能在 Flux 桌面客户端中运行，浏览器预览不会启动本地进程");
  }
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<McpStdioOutput>("mcp_stdio_execute", {
    request: {
      command: connection.command,
      args: connection.args,
      cwd: connection.cwd,
      environment: connection.environment,
      action,
      toolName,
      arguments: argumentsValue,
      idempotencyKey: metadata?.idempotencyKey,
    },
  });
}

export function discoverStdioMcp(connection: McpConnection): Promise<McpStdioOutput> {
  return execute(connection, "discover");
}

export async function callStdioMcp(
  connection: McpConnection,
  toolName: string,
  argumentsValue: Record<string, unknown>,
  metadata?: CapabilityInvocationMetadata,
): Promise<unknown> {
  const output = await execute(
    connection,
    "call",
    toolName,
    argumentsValue,
    metadata,
  );
  return output.result;
}
