import { create } from "zustand";
import {
  aiApi,
  type AiConnection,
  type CreateAiConnectionInput,
} from "../lib/api.js";
import { formatProductErrorMessage } from "../lib/productError.js";

type LoadStatus = "idle" | "loading" | "ready" | "error";

interface AiConnectionsState {
  connections: AiConnection[];
  loadStatus: LoadStatus;
  pendingAction: string | null;
  error: string | null;
  notice: string | null;
  load: (force?: boolean) => Promise<void>;
  createAndTest: (input: CreateAiConnectionInput) => Promise<AiConnection>;
  test: (id: string) => Promise<AiConnection>;
  remove: (id: string) => Promise<void>;
  clearFeedback: () => void;
  reset: () => void;
}

function replaceConnection(
  connections: AiConnection[],
  connection: AiConnection,
): AiConnection[] {
  const found = connections.some((item) => item.id === connection.id);
  if (!found) return [...connections, connection];
  return connections.map((item) =>
    item.id === connection.id ? connection : item,
  );
}

export const useAiConnectionsStore = create<AiConnectionsState>((set, get) => ({
  connections: [],
  loadStatus: "idle",
  pendingAction: null,
  error: null,
  notice: null,

  async load(force = false) {
    const current = get().loadStatus;
    if (!force && (current === "loading" || current === "ready")) return;
    set({ loadStatus: "loading", error: null });
    try {
      const connections = await aiApi.listConnections();
      set({ connections, loadStatus: "ready", error: null });
    } catch (error) {
      set({
        loadStatus: "error",
        error: formatProductErrorMessage(error, "无法读取 AI 接入信息。"),
      });
    }
  },

  async createAndTest(input) {
    set({ pendingAction: "create", error: null, notice: null });
    let created: AiConnection;
    try {
      created = await aiApi.createConnection(input);
      set((state) => ({
        connections: replaceConnection(state.connections, created),
      }));
    } catch (error) {
      set({
        pendingAction: null,
        error: formatProductErrorMessage(error, "无法保存模型服务。"),
      });
      throw error;
    }

    try {
      const tested = await aiApi.testConnection(created.id);
      set((state) => ({
        connections: replaceConnection(state.connections, tested),
        pendingAction: null,
        notice:
          tested.status === "connected"
            ? "模型服务已连接，可以用于 AI 工作流。"
            : "模型服务已保存，但校验未通过。请检查地址、密钥和模型名称。",
      }));
      return tested;
    } catch (error) {
      set({
        pendingAction: null,
        error: formatProductErrorMessage(
          error,
          "模型服务已保存，但暂时无法完成连接校验。",
        ),
      });
      return created;
    }
  },

  async test(id) {
    set({ pendingAction: `test:${id}`, error: null, notice: null });
    try {
      const tested = await aiApi.testConnection(id);
      set((state) => ({
        connections: replaceConnection(state.connections, tested),
        pendingAction: null,
        notice:
          tested.status === "connected"
            ? "连接校验通过。"
            : "连接校验未通过，请检查接入信息后重试。",
      }));
      return tested;
    } catch (error) {
      set({
        pendingAction: null,
        error: formatProductErrorMessage(error, "无法校验模型服务。"),
      });
      throw error;
    }
  },

  async remove(id) {
    set({ pendingAction: `remove:${id}`, error: null, notice: null });
    try {
      await aiApi.removeConnection(id);
      set((state) => ({
        connections: state.connections.filter((item) => item.id !== id),
        pendingAction: null,
        notice: "模型服务已断开。",
      }));
    } catch (error) {
      set({
        pendingAction: null,
        error: formatProductErrorMessage(error, "无法断开模型服务。"),
      });
      throw error;
    }
  },

  clearFeedback() {
    set({ error: null, notice: null });
  },

  reset() {
    set({
      connections: [],
      loadStatus: "idle",
      pendingAction: null,
      error: null,
      notice: null,
    });
  },
}));
