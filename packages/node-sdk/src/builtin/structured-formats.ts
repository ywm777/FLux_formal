import { XMLBuilder, XMLParser, XMLValidator } from "fast-xml-parser";
import { parseDocument, stringify as stringifyYaml } from "yaml";
import { defineNode } from "../registry.js";
import { getInputValue } from "./value-utils.js";

type XmlDirection = "xml-to-json" | "json-to-xml";
type YamlDirection = "yaml-to-json" | "json-to-yaml";

const MAX_SOURCE_LENGTH = 2_000_000;

function clampIndent(value: unknown): number {
  return Math.min(8, Math.max(0, Math.trunc(Number(value ?? 2))));
}

function resolveSource(
  inputs: Record<string, unknown>,
  sourcePath: string,
): unknown {
  const direct = getInputValue(inputs, sourcePath);
  if (direct !== undefined) return direct;
  if (sourcePath === "text") {
    return inputs.value ?? inputs.data;
  }
  return undefined;
}

function requireText(value: unknown, label: string): string {
  const text = typeof value === "string" ? value : "";
  if (!text.trim()) throw new Error(`${label}为空`);
  if (text.length > MAX_SOURCE_LENGTH) {
    throw new Error(`${label}超过 2 MB，请拆分后再转换`);
  }
  return text;
}

function parseJsonSource(value: unknown): unknown {
  if (typeof value !== "string") {
    if (value === undefined) throw new Error("没有找到待转换的 JSON 内容");
    return value;
  }
  const source = requireText(value, "JSON 内容");
  try {
    return JSON.parse(source) as unknown;
  } catch (error) {
    throw new Error(`JSON 格式错误：${(error as Error).message}`);
  }
}

function toJsonText(value: unknown, indent: number): string {
  const text = JSON.stringify(value, null, indent);
  if (text === undefined) throw new Error("转换结果无法序列化为 JSON");
  return text;
}

function normalizeXmlRoot(value: unknown, rootName: string): Record<string, unknown> {
  const normalizedRootName = rootName.trim() || "root";
  if (!/^[A-Za-z_][A-Za-z0-9_.:-]*$/.test(normalizedRootName)) {
    throw new Error("XML 根元素名称无效：应以字母或下划线开头，只能包含字母、数字、点、短横线、下划线或冒号");
  }
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    if (Object.keys(record).length === 1) return record;
  }
  return { [normalizedRootName]: value };
}

export const xmlConvertNode = defineNode({
  id: "flux.transform.xml",
  name: "XML 转换",
  description: "在 XML 与 JSON 之间双向转换，可保留 XML 属性并输出可继续连接的文本和数据",
  category: "转换",
  icon: "code-xml",
  version: "0.1.0",
  carrier: "data",
  ports: {
    inputs: [{ id: "in", name: "XML / JSON", dataType: "text" }],
    outputs: [{ id: "out", name: "转换结果", dataType: "text" }],
  },
  configSchema: {
    type: "object",
    properties: {
      direction: {
        type: "string",
        title: "转换方向",
        enum: ["xml-to-json", "json-to-xml"],
        default: "xml-to-json",
      },
      sourcePath: {
        type: "string",
        title: "内容来源路径",
        description: "文本节点默认使用 text，JSON 节点也可使用 value 或 data",
        default: "text",
      },
      indent: {
        type: "number",
        title: "缩进空格数（0-8）",
        default: 2,
      },
      preserveAttributes: {
        type: "boolean",
        title: "保留 XML 属性",
        default: true,
      },
      declaration: {
        type: "boolean",
        title: "生成 XML 声明",
        description: "仅用于 JSON 转 XML",
        default: true,
      },
      rootName: {
        type: "string",
        title: "XML 根元素",
        description: "JSON 有多个顶层字段或根内容不是对象时自动使用",
        default: "root",
      },
    },
  },
  async execute(ctx) {
    const {
      direction = "xml-to-json",
      sourcePath = "text",
      indent = 2,
      preserveAttributes = true,
      declaration = true,
      rootName = "root",
    } = ctx.config as {
      direction?: XmlDirection;
      sourcePath?: string;
      indent?: number;
      preserveAttributes?: boolean;
      declaration?: boolean;
      rootName?: string;
    };
    const source = resolveSource(ctx.inputs, sourcePath);
    const spacing = clampIndent(indent);

    if (direction === "json-to-xml") {
      const data = normalizeXmlRoot(parseJsonSource(source), rootName);
      const body = new XMLBuilder({
        ignoreAttributes: !preserveAttributes,
        attributeNamePrefix: "@_",
        textNodeName: "#text",
        format: spacing > 0,
        indentBy: " ".repeat(Math.max(1, spacing)),
        suppressEmptyNode: false,
      }).build(data);
      const text = `${declaration ? '<?xml version="1.0" encoding="UTF-8"?>\n' : ""}${body}`;
      const validation = XMLValidator.validate(text);
      if (validation !== true) {
        throw new Error(`生成的 XML 无效：${validation.err.msg}`);
      }
      ctx.log("info", `JSON 已转换为 XML（${text.length} 个字符）`);
      return { outputs: { out: { text, value: text, data: text, format: "xml", sourceFormat: "json" } } };
    }

    const xml = requireText(source, "XML 内容");
    const validation = XMLValidator.validate(xml);
    if (validation !== true) throw new Error(`XML 格式错误：${validation.err.msg}`);
    const data = new XMLParser({
      ignoreAttributes: !preserveAttributes,
      attributeNamePrefix: "@_",
      textNodeName: "#text",
      trimValues: false,
      parseTagValue: false,
      parseAttributeValue: false,
      allowBooleanAttributes: true,
      processEntities: false,
    }).parse(xml) as unknown;
    const text = toJsonText(data, spacing);
    ctx.log("info", `XML 已转换为 JSON（${text.length} 个字符）`);
    return { outputs: { out: { text, value: text, data, format: "json", sourceFormat: "xml" } } };
  },
});

function parseYamlSource(value: unknown): unknown {
  const source = requireText(value, "YAML/YML 内容");
  const document = parseDocument(source, { uniqueKeys: true });
  if (document.errors.length > 0) {
    throw new Error(`YAML/YML 格式错误：${document.errors[0]?.message ?? "无法解析"}`);
  }
  return document.toJS({ maxAliasCount: 50 }) as unknown;
}

export const yamlConvertNode = defineNode({
  id: "flux.transform.yaml",
  name: "YAML 转换",
  description: "在 YAML/YML 与 JSON 之间双向转换，适合配置文件、接口数据和结构化文本",
  category: "转换",
  icon: "file-code-2",
  version: "0.1.0",
  carrier: "data",
  ports: {
    inputs: [{ id: "in", name: "YAML / JSON", dataType: "text" }],
    outputs: [{ id: "out", name: "转换结果", dataType: "text" }],
  },
  configSchema: {
    type: "object",
    properties: {
      direction: {
        type: "string",
        title: "转换方向",
        enum: ["yaml-to-json", "json-to-yaml"],
        default: "yaml-to-json",
      },
      sourcePath: {
        type: "string",
        title: "内容来源路径",
        description: "文本节点默认使用 text，JSON 节点也可使用 value 或 data",
        default: "text",
      },
      indent: {
        type: "number",
        title: "缩进空格数（1-8）",
        default: 2,
      },
    },
  },
  async execute(ctx) {
    const {
      direction = "yaml-to-json",
      sourcePath = "text",
      indent = 2,
    } = ctx.config as {
      direction?: YamlDirection;
      sourcePath?: string;
      indent?: number;
    };
    const source = resolveSource(ctx.inputs, sourcePath);
    const spacing = Math.max(1, clampIndent(indent));

    if (direction === "json-to-yaml") {
      const data = parseJsonSource(source);
      const text = stringifyYaml(data, { indent: spacing, lineWidth: 0 });
      ctx.log("info", `JSON 已转换为 YAML（${text.length} 个字符）`);
      return { outputs: { out: { text, value: text, data: text, format: "yaml", sourceFormat: "json" } } };
    }

    const data = parseYamlSource(source);
    const text = toJsonText(data, spacing);
    ctx.log("info", `YAML/YML 已转换为 JSON（${text.length} 个字符）`);
    return { outputs: { out: { text, value: text, data, format: "json", sourceFormat: "yaml" } } };
  },
});

export const structuredFormatNodes = [xmlConvertNode, yamlConvertNode];
