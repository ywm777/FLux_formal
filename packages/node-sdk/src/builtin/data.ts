import { defineNode } from "../registry.js";

/** 按 "a.b.0.c" 风格路径从对象/数组中取值 */
function getByPath(source: unknown, path: string): unknown {
  if (!path) return source;
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc == null) return undefined;
    if (Array.isArray(acc)) return acc[Number(key)];
    if (typeof acc === "object") return (acc as Record<string, unknown>)[key];
    return undefined;
  }, source);
}

/**
 * 1. 设置数据 —— 注入常量/参数（JSON）。
 * 既是通用的"参数源"，也可当作静态的"任务/需求"配置（如新闻关键词、数量）。
 */
export const setValueNode = defineNode({
  id: "flux.data.setValue",
  name: "设置数据",
  category: "数据",
  icon: "database",
  version: "0.1.0",
  carrier: "data",
  ports: {
    inputs: [{ id: "in", name: "输入" }],
    outputs: [{ id: "out", name: "数据" }],
  },
  configSchema: {
    type: "object",
    required: ["value"],
    properties: {
      value: {
        type: "string",
        title: "值 (JSON 或文本)",
        description: '可填 JSON，例如 {"keywords":["AI"],"count":5}；非 JSON 按文本输出',
        format: "textarea",
        default: "{}",
      },
    },
  },
  async execute(ctx) {
    const raw = String((ctx.config as { value?: string }).value ?? "");
    let value: unknown = raw;
    try {
      value = JSON.parse(raw);
    } catch {
      // 非 JSON，按原始文本输出
    }
    return { outputs: { out: value } };
  },
});

/**
 * 2. 模板渲染 —— 用 {{path}} 占位符引用输入，生成文本。
 * 常用于把上游数据拼成一段消息/标题。
 */
export const templateNode = defineNode({
  id: "flux.transform.template",
  name: "模板渲染",
  category: "转换",
  icon: "type",
  version: "0.1.0",
  carrier: "basic",
  ports: {
    inputs: [{ id: "in", name: "输入" }],
    outputs: [{ id: "out", name: "文本" }],
  },
  configSchema: {
    type: "object",
    required: ["template"],
    properties: {
      template: {
        type: "string",
        title: "模板",
        description: "用 {{a.b}} 引用输入字段，例如：共 {{count}} 条：{{items.0.title}}",
        format: "textarea",
        default: "{{}}",
      },
    },
  },
  async execute(ctx) {
    const tpl = String((ctx.config as { template?: string }).template ?? "");
    const text = tpl.replace(/\{\{\s*([^}]*?)\s*\}\}/g, (_m, path: string) => {
      const v = path ? getByPath(ctx.inputs, path) : ctx.inputs;
      if (v == null) return "";
      return typeof v === "string" ? v : JSON.stringify(v);
    });
    return { outputs: { out: { text } } };
  },
});

/**
 * 3. 字段提取 —— 按路径从输入中取值，输出到指定键。
 */
export const extractNode = defineNode({
  id: "flux.transform.extract",
  name: "字段提取",
  category: "转换",
  icon: "filter",
  version: "0.1.0",
  carrier: "data",
  ports: {
    inputs: [{ id: "in", name: "输入" }],
    outputs: [{ id: "out", name: "输出" }],
  },
  configSchema: {
    type: "object",
    required: ["path"],
    properties: {
      path: {
        type: "string",
        title: "路径",
        description: "例如 body.items.0.title；留空取整个输入",
        default: "",
      },
      as: {
        type: "string",
        title: "输出键名",
        default: "value",
      },
    },
  },
  async execute(ctx) {
    const { path = "", as = "value" } = ctx.config as {
      path?: string;
      as?: string;
    };
    const value = getByPath(ctx.inputs, path);
    return { outputs: { out: { [as || "value"]: value } } };
  },
});

/**
 * 4. JSON 解析/序列化 —— 字符串 ⇄ 对象互转。
 * 常配合 HTTP 节点：把响应 body 字符串 parse 成对象供下游使用。
 */
export const jsonNode = defineNode({
  id: "flux.transform.json",
  name: "JSON 解析",
  category: "转换",
  icon: "braces",
  version: "0.1.0",
  carrier: "data",
  ports: {
    inputs: [{ id: "in", name: "输入" }],
    outputs: [{ id: "out", name: "输出" }],
  },
  configSchema: {
    type: "object",
    properties: {
      mode: {
        type: "string",
        title: "模式",
        enum: ["parse", "stringify"],
        default: "parse",
      },
      path: {
        type: "string",
        title: "来源路径",
        description: "留空取整个输入，例如 body",
        default: "",
      },
    },
  },
  async execute(ctx) {
    const { mode = "parse", path = "" } = ctx.config as {
      mode?: "parse" | "stringify";
      path?: string;
    };
    const source = getByPath(ctx.inputs, path);
    if (mode === "stringify") {
      return { outputs: { out: { value: JSON.stringify(source) } } };
    }
    try {
      const value =
        typeof source === "string" ? JSON.parse(source) : source;
      return { outputs: { out: value } };
    } catch (err) {
      ctx.log("error", `JSON 解析失败: ${(err as Error).message}`);
      throw new Error(`JSON 解析失败: ${(err as Error).message}`);
    }
  },
});

export const dataNodes = [setValueNode, templateNode, extractNode, jsonNode];
