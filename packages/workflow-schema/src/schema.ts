import { z } from "zod";

/** 当前持久化工作流文档格式版本；与工作流修订号 version 相互独立。 */
export const CURRENT_WORKFLOW_SCHEMA_VERSION = 1 as const;

/** 端口定义 */
export const PortSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** 数据类型提示，用于连线兼容性校验（any 表示不限） */
  dataType: z.string().default("any"),
});
export type Port = z.infer<typeof PortSchema>;

/** 画布节点 */
export const CanvasNodeSchema = z.object({
  id: z.string(),
  /** 节点类型 ID，对应 node-sdk 注册 */
  type: z.string(),
  position: z.object({ x: z.number(), y: z.number() }),
  /** 节点私有配置 */
  data: z.record(z.unknown()).default({}),
  ports: z.object({
    inputs: z.array(PortSchema).default([]),
    outputs: z.array(PortSchema).default([]),
  }),
});
export type CanvasNode = z.infer<typeof CanvasNodeSchema>;

/** 画布连线，condition 为可选条件表达式 */
export const CanvasEdgeSchema = z.object({
  id: z.string(),
  source: z.string(),
  target: z.string(),
  sourcePort: z.string().optional(),
  targetPort: z.string().optional(),
  condition: z.string().optional(),
});
export type CanvasEdge = z.infer<typeof CanvasEdgeSchema>;

export const ViewportSchema = z.object({
  x: z.number().default(0),
  y: z.number().default(0),
  zoom: z.number().min(0.1).max(4).default(1),
});
export type Viewport = z.infer<typeof ViewportSchema>;

/** 工作流图（序列化 JSON 根结构） */
export const WorkflowGraphSchema = z.object({
  schemaVersion: z.literal(CURRENT_WORKFLOW_SCHEMA_VERSION),
  id: z.string(),
  version: z.number().int().nonnegative().default(0),
  viewport: ViewportSchema.default({ x: 0, y: 0, zoom: 1 }),
  nodes: z.array(CanvasNodeSchema).default([]),
  edges: z.array(CanvasEdgeSchema).default([]),
  meta: z.object({
    title: z.string().default("未命名工作流"),
    tags: z.array(z.string()).default([]),
  }),
});
export type WorkflowGraph = z.infer<typeof WorkflowGraphSchema>;
