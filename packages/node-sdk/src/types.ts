/**
 * 万能节点 SDK 核心类型。
 *
 * 设计核心：节点 = 载体(Carrier) + 统一 IO 契约。
 * 无论载体是应用、代码、AI 模型还是数据，对画布与执行引擎而言行为一致；
 * 平台底座负责「接入 / 鉴权 / 调用 / 回传」。
 */

/** 载体类型，开放可扩展（见 PRD 4.4.2） */
export type CarrierKind =
  | "basic" // 内置基础能力
  | "app" // 用户授权的应用
  | "code" // 用户自定义代码
  | "ai" // AI 大模型
  | "data" // 数据 / 文件
  | "subflow" // 子工作流
  | "trigger" // 触发器 / 事件
  | (string & {}); // 允许未来扩展

/** 轻量 JSON Schema 描述（用于 configSchema 自动生成表单） */
export interface JSONSchema {
  type?: "object" | "string" | "number" | "boolean" | "array";
  title?: string;
  description?: string;
  properties?: Record<string, JSONSchema>;
  items?: JSONSchema;
  enum?: Array<string | number>;
  default?: unknown;
  required?: string[];
  /** 自定义渲染提示，如 "code" | "secret" | "textarea" */
  format?: string;
}

export interface PortSpec {
  id: string;
  name: string;
  dataType?: string;
  capacity?: "one" | "many";
}

export interface PortSchema {
  inputs: PortSpec[];
  outputs: PortSpec[];
}

/** 系统内部异常通道；画布使用通用连接点，由异常捕获节点的角色自动映射。 */
export const ERROR_OUTPUT_PORT_ID = "__error__";
export const ERROR_INPUT_PORT_ID = "error";

/** 载体绑定引用：指向用户授权的应用凭证 / 模型端点 / 数据源等 */
export interface CarrierBindingRef {
  bindingId: string;
  carrier: CarrierKind;
  label?: string;
}

/** Stable metadata supplied by the runtime for every external capability call. */
export interface CapabilityInvocationMetadata {
  executionId: string;
  nodeId: string;
  attempt: number;
  invocationIndex: number;
  idempotencyKey: string;
}

/** 节点执行上下文 */
export interface NodeContext {
  nodeId: string;
  /** 节点私有配置（经 configSchema 校验后的值） */
  config: Record<string, unknown>;
  /** 上游节点聚合输入 */
  inputs: Record<string, unknown>;
  /** 写执行日志 */
  log: (level: "info" | "warn" | "error", message: string) => void;
  /** 取消信号 */
  signal: AbortSignal;
  /**
   * 统一载体调用协议。底座据 binding 完成接入/鉴权/调用/回传，
   * 载体差异对节点逻辑透明。
   */
  invoke: (
    bindingId: string,
    action: string,
    payload?: unknown,
    metadata?: CapabilityInvocationMetadata,
  ) => Promise<unknown>;
}

export interface NodeOutput {
  /** 按输出端口聚合的结果 */
  outputs: Record<string, unknown>;
}

export interface NodeDefinition {
  id: string; // 全局唯一 type
  name: string;
  /** 面向用户的一句话能力说明，用于能力搜索与选择 */
  description?: string;
  category: string;
  icon: string;
  version: string;
  carrier: CarrierKind;
  ports: PortSchema;
  /** 每次执行时由用户或触发器提供的临时参数，不属于持久化节点配置。 */
  runtimeInputSchema?: JSONSchema;
  /** required=始终要求运行时输入；fallback=存在上游连线时运行时输入仅作备用。 */
  runtimeInputPolicy?: "required" | "fallback";
  /** 参与执行引擎控制流的特殊角色。 */
  executionRole?: "error-handler";
  configSchema: JSONSchema;
  execute: (ctx: NodeContext) => Promise<NodeOutput>;
  /** 引用用户授权的载体（应用/模型/数据源…） */
  bindings?: CarrierBindingRef[];
}
