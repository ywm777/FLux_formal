import { invokeLocalHttpCapability } from "./httpCapabilityGateway.js";
import { localMcpConnectionRepository } from "./localMcpConnectionRepository.js";
import { callMcpTool } from "./mcpClient.js";
import { McpCapabilityError } from "./mcpConnection.js";
import type { CapabilityInvocationMetadata } from "@flux/node-sdk";

/** 本地工作流唯一的外部能力入口；具体协议由 binding 决定。 */
export async function invokeLocalCapability(
  bindingId: string,
  action: string,
  payload?: unknown,
  metadata?: CapabilityInvocationMetadata,
): Promise<unknown> {
  if (bindingId.startsWith("mcp_")) {
    const connection = await localMcpConnectionRepository.find(bindingId);
    if (!connection) {
      throw new McpCapabilityError("MCP_CONNECTION_NOT_FOUND", "找不到此节点绑定的外部能力连接");
    }
    if (!connection.enabled) {
      throw new McpCapabilityError("MCP_CONNECTION_DISABLED", "此 MCP 服务已停用，请先在设置中启用");
    }
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new McpCapabilityError("MCP_ARGUMENTS_INVALID", "外部能力参数必须是对象");
    }
    const operation = connection.operations.find((item) => item.externalName === action);
    if (!operation) {
      throw new McpCapabilityError("MCP_TOOL_NOT_ALLOWED", "此连接没有授权当前能力");
    }
    return callMcpTool(
      connection,
      action,
      payload as Record<string, unknown>,
      metadata,
    );
  }
  return invokeLocalHttpCapability(bindingId, action, payload, metadata);
}
