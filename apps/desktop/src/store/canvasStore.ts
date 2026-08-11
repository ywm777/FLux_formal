import { create } from "zustand";
import type {
  ExecutionStatus,
  WorkflowRecord,
  WorkflowStatus,
} from "@flux/shared";

export type SyncStatus = "idle" | "saving" | "saved" | "error";

export interface CanvasRunProgress {
  status: ExecutionStatus;
  completed: number;
  total: number;
  activeLabel: string;
}

interface CanvasState {
  workflowId: string | null;
  version: number;
  workflowStatus: WorkflowStatus | null;
  title: string;
  titleDirty: boolean;
  status: SyncStatus;
  error: string | null;
  lastSavedAt: string | null;
  /** 发布进行中（供顶栏发布按钮显示状态） */
  publishing: boolean;
  /** 分享准备中（保存当前画布并读取分享状态） */
  sharing: boolean;
  /** 工作流执行中（供顶栏按钮显示状态） */
  testing: boolean;
  /** 供顶部栏显示的精简运行进度；画布本身不渲染悬浮状态条 */
  runProgress: CanvasRunProgress | null;
  setTitle: (title: string) => void;
  setVersion: (version: number) => void;
  setStatus: (status: SyncStatus, error?: string | null) => void;
  setPublishing: (publishing: boolean) => void;
  setSharing: (sharing: boolean) => void;
  setTesting: (testing: boolean) => void;
  setRunProgress: (runProgress: CanvasRunProgress | null) => void;
  /** 开始一个新的未保存草稿；这是状态转换，不是跨组件命令。 */
  startDraft: (title: string) => void;
  /** 保存/加载成功后同步服务端返回的 id 与 version。保存期间仍有编辑时保留本地草稿状态。 */
  applyRecord: (
    record: Pick<WorkflowRecord, "id" | "version" | "title" | "status">,
    preserveLocalDraft?: boolean,
  ) => void;
  reset: () => void;
}

const createCanvasStore = () => create<CanvasState>((set) => ({
  workflowId: null,
  version: 0,
  workflowStatus: null,
  title: "画布工作流",
  titleDirty: false,
  status: "idle",
  error: null,
  lastSavedAt: null,
  publishing: false,
  sharing: false,
  testing: false,
  runProgress: null,
  setTitle: (title) =>
    set((state) => ({
      title,
      titleDirty: state.title === title ? state.titleDirty : true,
      status: state.title === title ? state.status : "idle",
    })),
  setVersion: (version) => set({ version }),
  setStatus: (status, error = null) => set({ status, error }),
  setPublishing: (publishing) => set({ publishing }),
  setSharing: (sharing) => set({ sharing }),
  setTesting: (testing) => set({ testing }),
  setRunProgress: (runProgress) => set({ runProgress }),
  startDraft: (title) =>
    set({
      workflowId: null,
      version: 0,
      workflowStatus: null,
      title: title.trim() || "未命名工作流",
      titleDirty: false,
      status: "idle",
      error: null,
      lastSavedAt: null,
      publishing: false,
      sharing: false,
      testing: false,
      runProgress: null,
    }),
  applyRecord: (record, preserveLocalDraft = false) =>
    set((state) => ({
      workflowId: record.id,
      version: record.version,
      workflowStatus: record.status,
      title: preserveLocalDraft ? state.title : record.title,
      titleDirty: preserveLocalDraft ? state.titleDirty : false,
      status: preserveLocalDraft ? "idle" : "saved",
      error: null,
      lastSavedAt: new Date().toISOString(),
    })),
  reset: () =>
    set({
      workflowId: null,
      version: 0,
      workflowStatus: null,
      title: "画布工作流",
      titleDirty: false,
      status: "idle",
      error: null,
      lastSavedAt: null,
      publishing: false,
      sharing: false,
      testing: false,
      runProgress: null,
    }),
}));

type FluxDevelopmentGlobal = typeof globalThis & {
  __fluxCanvasStore?: ReturnType<typeof createCanvasStore>;
};

const fluxDevelopmentGlobal = globalThis as FluxDevelopmentGlobal;

export const useCanvasStore = import.meta.env.DEV
  ? (fluxDevelopmentGlobal.__fluxCanvasStore ??= createCanvasStore())
  : createCanvasStore();
