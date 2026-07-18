import { create } from "zustand";
import type {
  ExecutionStatus,
  WorkflowRecord,
  WorkflowStatus,
} from "@flux/shared";
import type { WorkflowTemplateId } from "../lib/workflowTemplates.js";

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
  /** 发布请求信号：顶栏点击发布时自增，由画布监听并执行 */
  publishNonce: number;
  /** 分享请求信号：顶栏点击分享时自增，由画布监听并打开分享弹窗 */
  shareNonce: number;
  /** 执行请求信号：顶栏点击执行时自增，由画布监听并执行 */
  testRunNonce: number;
  /** 添加节点请求信号：命令面板触发后由画布打开本地节点选择器 */
  addNodeNonce: number;
  /** 指定节点类型插入请求：命令面板直接选择节点类型时使用 */
  insertNodeNonce: number;
  insertNodeType: string | null;
  /** 重命名请求信号：命令面板触发后由画布打开临时重命名浮层 */
  renameWorkflowNonce: number;
  /** 工作台请求打开到画布的指定工作流 */
  openWorkflowId: string | null;
  /** 指定工作流打开请求信号 */
  openWorkflowNonce: number;
  /** 新建工作流请求信号 */
  newWorkflowNonce: number;
  /** 新建请求是否尚未保存，组件重挂载期间继续保持空白画布 */
  newWorkflowPending: boolean;
  /** 从工作台快速开始时使用的起步方案 */
  templateId: WorkflowTemplateId | null;
  setTitle: (title: string) => void;
  setVersion: (version: number) => void;
  setStatus: (status: SyncStatus, error?: string | null) => void;
  setPublishing: (publishing: boolean) => void;
  setSharing: (sharing: boolean) => void;
  setTesting: (testing: boolean) => void;
  setRunProgress: (runProgress: CanvasRunProgress | null) => void;
  /** 顶栏触发发布 */
  requestPublish: () => void;
  /** 顶栏触发分享 */
  requestShare: () => void;
  /** 顶栏触发工作流执行 */
  requestTestRun: () => void;
  /** 命令面板触发添加节点 */
  requestAddNode: () => void;
  /** 命令面板触发指定节点类型插入 */
  requestInsertNodeType: (nodeType: string) => void;
  /** 命令面板触发重命名工作流 */
  requestRenameWorkflow: () => void;
  /** 工作台触发打开指定工作流到画布 */
  requestOpenWorkflow: (workflowId: string) => void;
  /** 工作台触发新建空白工作流 */
  requestNewWorkflow: () => void;
  /** 工作台触发从起步方案创建工作流 */
  requestTemplateWorkflow: (
    templateId: WorkflowTemplateId,
    title: string,
  ) => void;
  /** 保存/加载成功后同步服务端返回的 id 与 version */
  applyRecord: (record: Pick<WorkflowRecord, "id" | "version" | "title" | "status">) => void;
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
  publishNonce: 0,
  shareNonce: 0,
  testRunNonce: 0,
  addNodeNonce: 0,
  insertNodeNonce: 0,
  insertNodeType: null,
  renameWorkflowNonce: 0,
  openWorkflowId: null,
  openWorkflowNonce: 0,
  newWorkflowNonce: 0,
  newWorkflowPending: false,
  templateId: null,
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
  requestPublish: () => set((s) => ({ publishNonce: s.publishNonce + 1 })),
  requestShare: () => set((s) => ({ shareNonce: s.shareNonce + 1 })),
  requestTestRun: () => set((s) => ({ testRunNonce: s.testRunNonce + 1 })),
  requestAddNode: () => set((s) => ({ addNodeNonce: s.addNodeNonce + 1 })),
  requestInsertNodeType: (nodeType) =>
    set((s) => ({
      insertNodeNonce: s.insertNodeNonce + 1,
      insertNodeType: nodeType,
    })),
  requestRenameWorkflow: () =>
    set((s) => ({ renameWorkflowNonce: s.renameWorkflowNonce + 1 })),
  requestOpenWorkflow: (workflowId) =>
    set((s) => ({
      openWorkflowId: workflowId,
      openWorkflowNonce: s.openWorkflowNonce + 1,
      templateId: null,
      newWorkflowPending: false,
      runProgress: null,
    })),
  requestNewWorkflow: () =>
    set((s) => ({
      workflowId: null,
      version: 0,
      workflowStatus: null,
      title: "未命名工作流",
      titleDirty: false,
      status: "idle",
      error: null,
      lastSavedAt: null,
      publishing: false,
      sharing: false,
      testing: false,
      runProgress: null,
      addNodeNonce: 0,
      insertNodeNonce: 0,
      insertNodeType: null,
      renameWorkflowNonce: 0,
      openWorkflowId: null,
      templateId: null,
      newWorkflowNonce: s.newWorkflowNonce + 1,
      newWorkflowPending: true,
    })),
  requestTemplateWorkflow: (templateId, title) =>
    set((s) => ({
      workflowId: null,
      version: 0,
      workflowStatus: null,
      title,
      titleDirty: false,
      status: "idle",
      error: null,
      lastSavedAt: null,
      publishing: false,
      sharing: false,
      testing: false,
      runProgress: null,
      addNodeNonce: 0,
      insertNodeNonce: 0,
      insertNodeType: null,
      renameWorkflowNonce: 0,
      openWorkflowId: null,
      templateId,
      newWorkflowNonce: s.newWorkflowNonce + 1,
      newWorkflowPending: true,
    })),
  applyRecord: (record) =>
    set({
      workflowId: record.id,
      version: record.version,
      workflowStatus: record.status,
      title: record.title,
      titleDirty: false,
      status: "saved",
      error: null,
      templateId: null,
      newWorkflowPending: false,
      lastSavedAt: new Date().toISOString(),
    }),
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
      addNodeNonce: 0,
      insertNodeNonce: 0,
      insertNodeType: null,
      renameWorkflowNonce: 0,
      openWorkflowId: null,
      openWorkflowNonce: 0,
      newWorkflowNonce: 0,
      newWorkflowPending: false,
      templateId: null,
    }),
}));

type FluxDevelopmentGlobal = typeof globalThis & {
  __fluxCanvasStore?: ReturnType<typeof createCanvasStore>;
};

const fluxDevelopmentGlobal = globalThis as FluxDevelopmentGlobal;

export const useCanvasStore = import.meta.env.DEV
  ? (fluxDevelopmentGlobal.__fluxCanvasStore ??= createCanvasStore())
  : createCanvasStore();
