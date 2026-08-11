import { create } from "zustand";
import type { NodeDefinition } from "@flux/node-sdk";
import { registry } from "../../../lib/registry.js";
import { formatProductErrorMessage } from "../../../lib/productError.js";
import { createMcpNodeDefinitions } from "../../../lib/capabilities/mcpNodeDefinitions.js";
import { discoverMcpCapabilities } from "../../../lib/capabilities/mcpClient.js";
import {
  MCP_PROTOCOL_VERSION,
  createMcpConnectionDraft,
  normalizeMcpConnectionDraft,
  type McpConnection,
  type McpConnectionDraft,
} from "../../../lib/capabilities/mcpConnection.js";
import { localMcpConnectionRepository } from "../../../lib/capabilities/localMcpConnectionRepository.js";
import { sessionHttpSecretVault } from "../../../lib/capabilities/sessionHttpSecretVault.js";

type LoadStatus = "idle" | "loading" | "ready" | "error";

interface McpConnectionState {
  connections: McpConnection[];
  definitions: NodeDefinition[];
  loadStatus: LoadStatus;
  error: string | null;
  notice: string | null;
  load(): Promise<void>;
  connect(draft: McpConnectionDraft, token: string): Promise<McpConnection>;
  setEnabled(id: string, enabled: boolean): Promise<void>;
  remove(id: string): Promise<void>;
  hasSessionToken(id: string): boolean;
  clearFeedback(): void;
}

const registeredNodeTypes = new Set<string>();

function registerDefinitions(connections: McpConnection[]): NodeDefinition[] {
  for (const type of registeredNodeTypes) registry.unregister(type);
  registeredNodeTypes.clear();
  const definitions = createMcpNodeDefinitions(connections.filter((connection) => connection.enabled));
  for (const definition of definitions) {
    registry.upsert(definition);
    registeredNodeTypes.add(definition.id);
  }
  return definitions;
}

function snapshot(connections: McpConnection[]) {
  return { schemaVersion: 2 as const, connections };
}

export { createMcpConnectionDraft };

export const useMcpConnectionStore = create<McpConnectionState>((set, get) => ({
  connections: [],
  definitions: [],
  loadStatus: "idle",
  error: null,
  notice: null,

  async load() {
    if (get().loadStatus === "loading" || get().loadStatus === "ready") return;
    set({ loadStatus: "loading", error: null });
    try {
      const stored = await localMcpConnectionRepository.read();
      set({
        connections: stored.connections,
        definitions: registerDefinitions(stored.connections),
        loadStatus: "ready",
      });
    } catch (error) {
      set({
        loadStatus: "error",
        error: formatProductErrorMessage(error, "无法读取外部能力连接。"),
      });
    }
  },

  async connect(draft, token) {
    const normalized = normalizeMcpConnectionDraft(draft);
    const stored = await localMcpConnectionRepository.read();
    const existing = draft.id
      ? stored.connections.find((connection) => connection.id === draft.id)
      : undefined;
    const now = new Date().toISOString();
    const connection: McpConnection = {
      schemaVersion: 2,
      id: existing?.id ?? `mcp_${crypto.randomUUID()}`,
      ...normalized,
      protocolVersion: existing?.protocolVersion ?? MCP_PROTOCOL_VERSION,
      operations: existing?.operations ?? [],
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    if (connection.transport === "streamable-http" && connection.authentication === "bearer") {
      if (token.trim()) sessionHttpSecretVault.set(connection.id, token);
      else if (!sessionHttpSecretVault.has(connection.id)) {
        throw new Error("请填写本次会话使用的访问令牌");
      }
    } else {
      sessionHttpSecretVault.remove(connection.id);
    }
    set({ error: null, notice: "正在连接并发现可用能力…" });
    try {
      const discovered = await discoverMcpCapabilities(connection);
      const connected: McpConnection = {
        ...connection,
        ...discovered,
        updatedAt: new Date().toISOString(),
      };
      const connections = existing
        ? stored.connections.map((item) => item.id === connected.id ? connected : item)
        : [connected, ...stored.connections];
      await localMcpConnectionRepository.write(snapshot(connections));
      set({
        connections,
        definitions: registerDefinitions(connections),
        loadStatus: "ready",
        error: null,
        notice: `已发现 ${connected.operations.length} 项能力。`,
      });
      return connected;
    } catch (error) {
      if (!existing) sessionHttpSecretVault.remove(connection.id);
      const message = formatProductErrorMessage(error, "无法连接 MCP 服务。");
      set({ error: message, notice: null });
      throw error;
    }
  },

  async setEnabled(id, enabled) {
    const stored = await localMcpConnectionRepository.read();
    const connections = stored.connections.map((connection) =>
      connection.id === id
        ? { ...connection, enabled, updatedAt: new Date().toISOString() }
        : connection,
    );
    await localMcpConnectionRepository.write(snapshot(connections));
    set({
      connections,
      definitions: registerDefinitions(connections),
      error: null,
      notice: enabled ? "MCP 服务已启用。" : "MCP 服务已停用，画布中将不再提供其能力。",
    });
  },

  async remove(id) {
    const stored = await localMcpConnectionRepository.read();
    const connections = stored.connections.filter((connection) => connection.id !== id);
    await localMcpConnectionRepository.write(snapshot(connections));
    sessionHttpSecretVault.remove(id);
    set({
      connections,
      definitions: registerDefinitions(connections),
      error: null,
      notice: "外部能力连接已移除。",
    });
  },

  hasSessionToken(id) {
    return sessionHttpSecretVault.has(id);
  },

  clearFeedback() {
    set({ error: null, notice: null });
  },
}));
