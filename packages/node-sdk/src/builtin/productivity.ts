import { defineNode } from "../registry.js";
import { ERROR_INPUT_PORT_ID, type JSONSchema } from "../types.js";
import { getInputValue, toText } from "./value-utils.js";

type JsonKeyCase = "preserve" | "camel" | "pascal" | "snake" | "kebab" | "lower" | "upper";
type JsonStringCase = "preserve" | "lower" | "upper";

interface JsonTransformOptions {
  keyCase: JsonKeyCase;
  stringCase: JsonStringCase;
  sortKeys: boolean;
  trimStrings: boolean;
  omitNull: boolean;
}

interface JsonTransformReport {
  fieldsRead: number;
  fieldsWritten: number;
  renamedKeys: number;
  modifiedStrings: number;
  removedNullFields: number;
  reorderedObjects: number;
}

function splitKeyWords(key: string): string[] {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .split(/[^A-Za-z0-9\u3400-\u9fff]+/)
    .filter(Boolean);
}

function convertJsonKey(key: string, targetCase: JsonKeyCase): string {
  if (targetCase === "preserve") return key;
  if (targetCase === "lower") return key.toLowerCase();
  if (targetCase === "upper") return key.toUpperCase();

  const words = splitKeyWords(key);
  if (words.length === 0) return key;
  const normalized = words.map((word) => word.toLowerCase());
  if (targetCase === "snake") return normalized.join("_");
  if (targetCase === "kebab") return normalized.join("-");

  const capitalized = normalized.map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`);
  if (targetCase === "pascal") return capitalized.join("");
  return `${normalized[0]}${capitalized.slice(1).join("")}`;
}

function transformJsonValue(
  value: unknown,
  options: JsonTransformOptions,
  report: JsonTransformReport,
  path = "$",
): unknown {
  if (typeof value === "string") {
    const normalized = options.trimStrings ? value.trim() : value;
    const transformed = options.stringCase === "lower"
      ? normalized.toLowerCase()
      : options.stringCase === "upper"
        ? normalized.toUpperCase()
        : normalized;
    if (transformed !== value) report.modifiedStrings += 1;
    return transformed;
  }
  if (Array.isArray(value)) {
    return value.map((item, index) => transformJsonValue(item, options, report, `${path}[${index}]`));
  }
  if (typeof value !== "object" || value === null) return value;

  const outputKeys = new Map<string, string>();
  const entries: Array<[string, unknown]> = [];
  for (const [sourceKey, child] of Object.entries(value as Record<string, unknown>)) {
    report.fieldsRead += 1;
    if (options.omitNull && child === null) {
      report.removedNullFields += 1;
      continue;
    }
    const targetKey = convertJsonKey(sourceKey, options.keyCase);
    const previousSourceKey = outputKeys.get(targetKey);
    if (previousSourceKey !== undefined) {
      throw new Error(
        `字段名转换冲突：${path}.${previousSourceKey} 与 ${path}.${sourceKey} 都会变成 ${targetKey}`,
      );
    }
    outputKeys.set(targetKey, sourceKey);
    if (targetKey !== sourceKey) report.renamedKeys += 1;
    report.fieldsWritten += 1;
    entries.push([
      targetKey,
      transformJsonValue(child, options, report, `${path}.${targetKey}`),
    ]);
  }
  if (options.sortKeys) {
    const orderBeforeSort = entries.map(([key]) => key).join("\u0000");
    entries.sort(([left], [right]) => left.localeCompare(right));
    if (entries.map(([key]) => key).join("\u0000") !== orderBeforeSort) {
      report.reorderedObjects += 1;
    }
  }
  return Object.fromEntries(entries);
}

const textRuntimeInputSchema = {
  type: "object",
  required: ["text"],
  properties: {
    text: {
      type: "string",
      title: "文本内容",
      description: "手工输入文本，或接收上游节点产出的文本",
      format: "code",
      default: "",
    },
  },
} satisfies JSONSchema;

export const textConstantNode = defineNode({
  id: "flux.source.textConstant",
  name: "文本常量",
  description: "保存一段固定文本，并在每次运行时原样输出给后续节点",
  category: "文本",
  icon: "text-quote",
  version: "0.1.0",
  carrier: "data",
  ports: {
    inputs: [],
    outputs: [{ id: "out", name: "固定文本", dataType: "text" }],
  },
  configSchema: {
    type: "object",
    properties: {
      text: {
        type: "string",
        title: "常量内容",
        description: "内容随工作流保存，执行时不会要求重新填写",
        format: "code",
        default: "",
      },
    },
  },
  async execute(ctx) {
    const text = String(ctx.config.text ?? "");
    ctx.log("info", `文本常量已输出（${text.length} 个字符）`);
    return { outputs: { out: { text, value: text } } };
  },
});

function resolveUpstreamText(inputs: Record<string, unknown>): string {
  const preferredKeys = ["text", "value", "content", "result", "message"];
  for (const key of preferredKeys) {
    if (Object.prototype.hasOwnProperty.call(inputs, key)) {
      return toText(inputs[key]);
    }
  }
  const entries = Object.entries(inputs);
  if (entries.length === 0) return "";
  if (entries.length === 1) return toText(entries[0]?.[1]);
  return toText(inputs);
}

export const textInputNode = defineNode({
  id: "flux.input.text",
  name: "文本",
  description: "输入、接收和展示文本，并把完整内容继续输出给后续节点",
  category: "文本",
  icon: "text-cursor-input",
  version: "0.3.0",
  carrier: "data",
  ports: {
    inputs: [{ id: "in", name: "上游文本", dataType: "text" }],
    outputs: [{ id: "out", name: "文本" }],
  },
  runtimeInputSchema: textRuntimeInputSchema,
  runtimeInputPolicy: "fallback",
  configSchema: { type: "object", properties: {} },
  async execute(ctx) {
    const upstreamText = resolveUpstreamText(ctx.inputs);
    const manualText = String((ctx.config as { text?: string }).text ?? "");
    const source = upstreamText.trim() ? "upstream" : "manual";
    const text = source === "upstream" ? upstreamText : manualText;
    if (!text.trim()) throw new Error("文本内容为空，请连接上游文本或填写手工文本");
    ctx.log(
      "info",
      source === "upstream"
        ? `已接收上游文本（${text.length} 个字符）`
        : `手工文本输入完成（${text.length} 个字符）`,
    );
    return { outputs: { out: { text, source } } };
  },
});

interface CapturedError {
  message: string;
  nodeId: string;
  nodeType: string;
  nodeName: string;
  at: string;
  attempt: number;
}

function normalizeCapturedError(candidate: unknown): CapturedError {
  if (typeof candidate !== "object" || candidate === null || Array.isArray(candidate)) {
    throw new Error("异常捕获节点没有收到有效的错误信息");
  }
  const error = candidate as Record<string, unknown>;
  const message = String(error.message ?? "未知错误").trim();
  if (!message) throw new Error("异常捕获节点收到的错误信息为空");
  return {
    message,
    nodeId: String(error.nodeId ?? ""),
    nodeType: String(error.nodeType ?? ""),
    nodeName: String(error.nodeName ?? error.nodeType ?? error.nodeId ?? "未知节点"),
    at: String(error.at ?? new Date().toISOString()),
    attempt: Math.max(1, Math.trunc(Number(error.attempt ?? 1))),
  };
}

function resolveCapturedErrors(inputs: Record<string, unknown>): CapturedError[] {
  const candidate = inputs[ERROR_INPUT_PORT_ID] ?? inputs;
  const candidates = Array.isArray(candidate) ? candidate : [candidate];
  if (candidates.length === 0) throw new Error("异常捕获节点没有收到有效的错误信息");
  return candidates.map(normalizeCapturedError);
}

export const errorCaptureNode = defineNode({
  id: "flux.flow.catchError",
  name: "异常捕获",
  description: "仅在连接节点执行失败时启动，并把错误整理成可继续处理的文本",
  category: "流程控制",
  icon: "shield-alert",
  version: "0.1.0",
  carrier: "basic",
  executionRole: "error-handler",
  ports: {
    inputs: [{ id: ERROR_INPUT_PORT_ID, name: "捕获异常", dataType: "error", capacity: "many" }],
    outputs: [{ id: "out", name: "错误文本", dataType: "text" }],
  },
  configSchema: {
    type: "object",
    properties: {
      format: {
        type: "string",
        title: "输出格式",
        enum: ["detailed", "message", "json"],
        default: "detailed",
      },
      prefix: {
        type: "string",
        title: "提示前缀",
        default: "流程异常",
      },
    },
  },
  async execute(ctx) {
    const capturedErrors = resolveCapturedErrors(ctx.inputs);
    const captured = capturedErrors[0]!;
    const format = String(ctx.config.format ?? "detailed");
    const prefix = String(ctx.config.prefix ?? "流程异常").trim();
    const text = format === "json"
      ? JSON.stringify(capturedErrors.length === 1 ? captured : capturedErrors, null, 2)
      : format === "message"
        ? capturedErrors.map((error) => error.message).join("\n")
        : capturedErrors
            .map((error) => `${prefix ? `【${prefix}】` : ""}${error.nodeName}：${error.message}`)
            .join("\n");
    ctx.log(
      "warn",
      capturedErrors.length === 1
        ? `已捕获 ${captured.nodeName} 的异常并转为文本`
        : `已捕获 ${capturedErrors.length} 个节点的异常并汇总为文本`,
    );
    return {
      outputs: {
        out: {
          ...captured,
          captured: true,
          count: capturedErrors.length,
          errors: capturedErrors,
          text,
        },
      },
    };
  },
});

export const jsonFormatNode = defineNode({
  id: "flux.transform.jsonFormat",
  name: "JSON 格式优化",
  description: "默认只校验并格式化 JSON；启用转换规则后才会改写键名、字符串或空值",
  category: "转换",
  icon: "braces",
  version: "0.3.0",
  carrier: "data",
  ports: {
    inputs: [{ id: "in", name: "JSON 文本" }],
    outputs: [{ id: "out", name: "格式化结果" }],
  },
  configSchema: {
    type: "object",
    properties: {
      sourcePath: {
        type: "string",
        title: "文本来源路径",
        description: "文本输入节点默认使用 text",
        default: "text",
      },
      indent: {
        type: "number",
        title: "缩进空格数（0-8）",
        default: 2,
      },
      sortKeys: {
        type: "boolean",
        title: "按字段名排序",
        default: false,
      },
      keyCase: {
        type: "string",
        title: "键名格式",
        enum: ["preserve", "camel", "pascal", "snake", "kebab", "lower", "upper"],
        default: "preserve",
      },
      stringCase: {
        type: "string",
        title: "字符串大小写",
        enum: ["preserve", "lower", "upper"],
        default: "preserve",
      },
      trimStrings: {
        type: "boolean",
        title: "清理首尾空格",
        default: false,
      },
      omitNull: {
        type: "boolean",
        title: "删除 null 字段",
        description: "有损操作：删除值为 null 的对象字段，但不改变数组索引",
        default: false,
      },
    },
  },
  async execute(ctx) {
    const {
      sourcePath = "text",
      indent = 2,
      sortKeys = false,
      keyCase = "preserve",
      stringCase = "preserve",
      trimStrings = false,
      omitNull = false,
    } = ctx.config as {
      sourcePath?: string;
      indent?: number;
      sortKeys?: boolean;
      keyCase?: JsonKeyCase;
      stringCase?: JsonStringCase;
      trimStrings?: boolean;
      omitNull?: boolean;
    };
    const source = getInputValue(ctx.inputs, sourcePath);
    let parsed: unknown;
    try {
      parsed = typeof source === "string" ? JSON.parse(source) as unknown : source;
    } catch (error) {
      throw new Error(`JSON 格式错误：${(error as Error).message}`);
    }
    if (parsed === undefined) throw new Error(`没有在路径 ${sourcePath || "（根）"} 找到 JSON 内容`);
    const report: JsonTransformReport = {
      fieldsRead: 0,
      fieldsWritten: 0,
      renamedKeys: 0,
      modifiedStrings: 0,
      removedNullFields: 0,
      reorderedObjects: 0,
    };
    const data = transformJsonValue(parsed, {
      keyCase,
      stringCase,
      sortKeys,
      trimStrings,
      omitNull,
    }, report);
    const spacing = Math.min(8, Math.max(0, Math.trunc(Number(indent))));
    const value = JSON.stringify(data, null, spacing);
    if (value === undefined) throw new Error("输入内容无法序列化为 JSON");
    ctx.log(
      report.removedNullFields > 0 ? "warn" : "info",
      `JSON 优化完成（${value.length} 个字符，改名 ${report.renamedKeys}，改值 ${report.modifiedStrings}，删除字段 ${report.removedNullFields}）`,
    );
    return { outputs: { out: { value, data, report } } };
  },
});

export const jsonDisplayNode = defineNode({
  id: "flux.output.jsonView",
  name: "JSON 展示",
  description: "以缩进和语法高亮样式展示格式优化后的 JSON",
  category: "输出",
  icon: "panel-right",
  version: "0.1.0",
  carrier: "basic",
  ports: {
    inputs: [{ id: "in", name: "格式化 JSON" }],
    outputs: [{ id: "out", name: "JSON 展示结果" }],
  },
  configSchema: {
    type: "object",
    properties: {
      sourcePath: {
        type: "string",
        title: "JSON 文本路径",
        description: "JSON 格式优化节点默认使用 value",
        default: "value",
      },
    },
  },
  async execute(ctx) {
    const { sourcePath = "value" } = ctx.config as { sourcePath?: string };
    const value = getInputValue(ctx.inputs, sourcePath);
    if (typeof value !== "string") throw new Error(`没有在路径 ${sourcePath || "（根）"} 找到格式化后的 JSON 文本`);
    let json: unknown;
    try {
      json = JSON.parse(value) as unknown;
    } catch (error) {
      throw new Error(`待展示内容不是有效 JSON：${(error as Error).message}`);
    }
    ctx.log("info", `JSON 展示已生成（${value.length} 个字符）`);
    return { outputs: { out: { text: value, json } } };
  },
});

export const productivityNodes = [
  textConstantNode,
  textInputNode,
  errorCaptureNode,
  jsonFormatNode,
  jsonDisplayNode,
];
