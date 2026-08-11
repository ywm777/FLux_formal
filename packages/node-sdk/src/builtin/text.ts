import { defineNode } from "../registry.js";
import { getInputValue, toText } from "./value-utils.js";

function encodeBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (let index = 0; index < bytes.length; index += 8192) {
    binary += String.fromCharCode(...bytes.slice(index, index + 8192));
  }
  return btoa(binary);
}

function decodeBase64(text: string): string {
  try {
    const binary = atob(text);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    throw new Error("输入不是有效的 Base64 文本");
  }
}

export const textTransformNode = defineNode({
  id: "flux.text.transform",
  name: "文本处理",
  description: "清理、替换、拆分、合并或转换文本大小写",
  category: "文本",
  icon: "text-cursor-input",
  version: "0.1.0",
  carrier: "basic",
  ports: {
    inputs: [{ id: "in", name: "输入" }],
    outputs: [{ id: "out", name: "结果" }],
  },
  configSchema: {
    type: "object",
    properties: {
      operation: {
        type: "string",
        title: "操作",
        enum: ["trim", "uppercase", "lowercase", "replace", "split", "join"],
        default: "trim",
      },
      sourcePath: {
        type: "string",
        title: "来源路径",
        description: "留空使用整个输入；例如 content.text",
        default: "",
      },
      find: { type: "string", title: "查找文本", default: "" },
      replacement: { type: "string", title: "替换为", default: "" },
      delimiter: { type: "string", title: "分隔符", default: "," },
    },
  },
  async execute(ctx) {
    const {
      operation = "trim",
      sourcePath = "",
      find = "",
      replacement = "",
      delimiter = ",",
    } = ctx.config as Record<string, string>;
    const source = getInputValue(ctx.inputs, sourcePath);
    let value: unknown;

    switch (operation) {
      case "uppercase":
        value = toText(source).toLocaleUpperCase();
        break;
      case "lowercase":
        value = toText(source).toLocaleLowerCase();
        break;
      case "replace":
        value = find ? toText(source).split(find).join(replacement) : toText(source);
        break;
      case "split":
        value = toText(source).split(delimiter);
        break;
      case "join":
        if (!Array.isArray(source)) throw new Error("合并文本需要数组输入");
        value = source.map(toText).join(delimiter);
        break;
      case "trim":
      default:
        value = toText(source).trim();
        break;
    }

    ctx.log("info", `文本处理完成：${operation}`);
    return {
      outputs: {
        out: Array.isArray(value)
          ? { value, count: value.length }
          : { value },
      },
    };
  },
});

export const regexExtractNode = defineNode({
  id: "flux.text.regex",
  name: "正则提取",
  description: "按正则表达式提取文本中的匹配项与分组",
  category: "文本",
  icon: "scan-search",
  version: "0.1.0",
  carrier: "basic",
  ports: {
    inputs: [{ id: "in", name: "文本" }],
    outputs: [{ id: "out", name: "匹配" }],
  },
  configSchema: {
    type: "object",
    required: ["pattern"],
    properties: {
      sourcePath: { type: "string", title: "来源路径", default: "" },
      pattern: {
        type: "string",
        title: "正则表达式",
        description: "无需填写两侧斜杠",
        default: "\\b[\\w.%+-]+@[\\w.-]+\\.[A-Za-z]{2,}\\b",
      },
      flags: { type: "string", title: "标志", default: "gi" },
      group: { type: "number", title: "返回分组", default: 0 },
      all: { type: "boolean", title: "返回全部匹配", default: true },
    },
  },
  async execute(ctx) {
    const {
      sourcePath = "",
      pattern = "",
      flags = "g",
      group = 0,
      all = true,
    } = ctx.config as {
      sourcePath?: string;
      pattern?: string;
      flags?: string;
      group?: number;
      all?: boolean;
    };
    if (!pattern) throw new Error("请配置正则表达式");
    const text = toText(getInputValue(ctx.inputs, sourcePath));
    let expression: RegExp;
    try {
      const normalizedFlags = all && !flags.includes("g") ? `${flags}g` : flags;
      expression = new RegExp(pattern, normalizedFlags);
    } catch (error) {
      throw new Error(`正则表达式无效：${(error as Error).message}`);
    }

    const matches: string[] = [];
    if (all) {
      for (const match of text.matchAll(expression)) {
        matches.push(match[group] ?? "");
        if (matches.length >= 100) break;
      }
    } else {
      const match = expression.exec(text);
      if (match) matches.push(match[group] ?? "");
    }
    ctx.log("info", `正则提取完成：${matches.length} 项`);
    return { outputs: { out: { matches, count: matches.length } } };
  },
});

export const base64Node = defineNode({
  id: "flux.transform.base64",
  name: "Base64 编解码",
  description: "对 Unicode 文本进行 Base64 编码或解码",
  category: "编码",
  icon: "binary",
  version: "0.1.0",
  carrier: "basic",
  ports: {
    inputs: [{ id: "in", name: "输入" }],
    outputs: [{ id: "out", name: "结果" }],
  },
  configSchema: {
    type: "object",
    properties: {
      operation: {
        type: "string",
        title: "操作",
        enum: ["encode", "decode"],
        default: "encode",
      },
      sourcePath: { type: "string", title: "来源路径", default: "" },
    },
  },
  async execute(ctx) {
    const { operation = "encode", sourcePath = "" } = ctx.config as {
      operation?: "encode" | "decode";
      sourcePath?: string;
    };
    const source = toText(getInputValue(ctx.inputs, sourcePath));
    const value = operation === "decode" ? decodeBase64(source) : encodeBase64(source);
    return { outputs: { out: { value, operation } } };
  },
});

export const textNodes = [textTransformNode, regexExtractNode, base64Node];
