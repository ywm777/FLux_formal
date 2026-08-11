import { create } from "zustand";
import { formatProductErrorMessage } from "../../../lib/productError.js";
import {
  createHttpConnectionDraft,
  normalizeHttpConnectionDraft,
  type HttpConnection,
  type HttpConnectionDraft,
} from "../../../lib/capabilities/httpConnection.js";
import { localHttpConnectionRepository } from "../../../lib/capabilities/localHttpConnectionRepository.js";
import { sessionHttpSecretVault } from "../../../lib/capabilities/sessionHttpSecretVault.js";

type LoadStatus = "idle" | "loading" | "ready" | "error";

interface HttpConnectionState {
  connections: HttpConnection[];
  loadStatus: LoadStatus;
  error: string | null;
  load(): Promise<void>;
  save(draft: HttpConnectionDraft, secret: string): Promise<HttpConnection>;
  remove(id: string): Promise<void>;
  hasSessionSecret(id: string): boolean;
  clearError(): void;
}

function snapshot(connections: HttpConnection[]) {
  return { schemaVersion: 1 as const, connections };
}

export { createHttpConnectionDraft };

export const useHttpConnectionStore = create<HttpConnectionState>((set, get) => ({
  connections: [],
  loadStatus: "idle",
  error: null,

  async load() {
    if (get().loadStatus === "loading" || get().loadStatus === "ready") return;
    set({ loadStatus: "loading", error: null });
    try {
      const stored = await localHttpConnectionRepository.read();
      set({ connections: stored.connections, loadStatus: "ready" });
    } catch (error) {
      set({
        loadStatus: "error",
        error: formatProductErrorMessage(error, "无法读取接口连接。"),
      });
    }
  },

  async save(draft, secret) {
    const normalized = normalizeHttpConnectionDraft(draft);
    const stored = await localHttpConnectionRepository.read();
    const now = new Date().toISOString();
    const existing = draft.id
      ? stored.connections.find((connection) => connection.id === draft.id)
      : undefined;
    const connection: HttpConnection = {
      schemaVersion: 1,
      id: existing?.id ?? `http_${crypto.randomUUID()}`,
      ...normalized,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    const connections = existing
      ? stored.connections.map((item) => item.id === connection.id ? connection : item)
      : [connection, ...stored.connections];
    await localHttpConnectionRepository.write(snapshot(connections));
    if (connection.auth && secret.trim()) sessionHttpSecretVault.set(connection.id, secret);
    if (!connection.auth) sessionHttpSecretVault.remove(connection.id);
    set({ connections, loadStatus: "ready", error: null });
    return connection;
  },

  async remove(id) {
    const stored = await localHttpConnectionRepository.read();
    const connections = stored.connections.filter((connection) => connection.id !== id);
    await localHttpConnectionRepository.write(snapshot(connections));
    sessionHttpSecretVault.remove(id);
    set({ connections, loadStatus: "ready", error: null });
  },

  hasSessionSecret(id) {
    return sessionHttpSecretVault.has(id);
  },

  clearError() {
    set({ error: null });
  },
}));
