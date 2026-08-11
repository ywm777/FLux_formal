import { z } from "zod";

/** 当前持久化工作流文档格式版本；与工作流修订号 version 相互独立。 */
export const CURRENT_WORKFLOW_SCHEMA_VERSION = 2 as const;

const PortCapacitySchema = z.enum(["one", "many"]);

/** 端口定义 */
export const PortSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** 数据类型提示，用于连线兼容性校验（any 表示不限） */
  dataType: z.string().default("any"),
  /** 通用端口的兼容默认值；画布节点使用下面的方向专属 Schema。 */
  capacity: PortCapacitySchema.default("one"),
});
export type Port = z.infer<typeof PortSchema>;

export const InputPortSchema = PortSchema.extend({
  capacity: PortCapacitySchema.default("one"),
});

export const OutputPortSchema = PortSchema.extend({
  capacity: PortCapacitySchema.default("many"),
});

/** 画布节点 */
export const CanvasNodeSchema = z.object({
  id: z.string(),
  /** 节点类型 ID，对应 node-sdk 注册 */
  type: z.string(),
  position: z.object({ x: z.number(), y: z.number() }),
  /** 用户调整后的节点窗口尺寸；未设置时由节点内容自适应 */
  size: z.object({
    width: z.number().positive(),
    height: z.number().positive(),
  }).optional(),
  /** 节点私有配置 */
  data: z.record(z.unknown()).default({}),
  ports: z.object({
    inputs: z.array(InputPortSchema).default([]),
    outputs: z.array(OutputPortSchema).default([]),
  }),
});
export type CanvasNode = z.infer<typeof CanvasNodeSchema>;

export const CanvasAnchorSchema = z.enum(["top", "right", "bottom", "left"]);
export const CanvasEdgeRouteSchema = z.enum(["normal", "error"]);

/** 画布连线，condition 为可选条件表达式 */
export const CanvasEdgeSchema = z.object({
  id: z.string(),
  source: z.string(),
  target: z.string(),
  sourcePort: z.string().optional(),
  targetPort: z.string().optional(),
  /** 视觉锚点与执行语义分离，允许同一逻辑端口从节点不同方向连接。 */
  sourceAnchor: CanvasAnchorSchema.optional(),
  targetAnchor: CanvasAnchorSchema.optional(),
  /** 异常路由由目标节点自动识别；字段用于持久化视觉状态与向后兼容。 */
  route: CanvasEdgeRouteSchema.optional(),
  condition: z.string().optional(),
});
export type CanvasEdge = z.infer<typeof CanvasEdgeSchema>;

/** 仅用于画布组织的节点分组，不参与工作流执行。 */
export const CanvasGroupSchema = z.object({
  id: z.string(),
  label: z.string().default("节点组"),
  nodeIds: z.array(z.string()).min(2),
});
export type CanvasGroup = z.infer<typeof CanvasGroupSchema>;

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
  /** 画布视觉分组；执行引擎只读取 nodes 和 edges。 */
  groups: z.array(CanvasGroupSchema).optional(),
  meta: z.object({
    title: z.string().default("未命名工作流"),
    tags: z.array(z.string()).default([]),
  }),
});
export type WorkflowGraph = z.infer<typeof WorkflowGraphSchema>;
