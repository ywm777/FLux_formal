import type { JSONSchema, NodeDefinition } from "@flux/node-sdk";

export type NodeBusinessKind =
  | "runtime-input"
  | "source"
  | "trigger"
  | "decision"
  | "approval"
  | "error-handler"
  | "output"
  | "action"
  | "process";

export interface NodeBusinessControl {
  key: string;
  label: string;
  type: "text" | "number" | "boolean" | "enum";
  options?: { value: string; label: string }[];
  defaultValue?: unknown;
  description?: string;
  destructive?: boolean;
}

export interface NodeBusinessPayload {
  key: string;
  label: string;
  defaultValue?: unknown;
}

export interface NodeBusinessPresentation {
  kind: NodeBusinessKind;
  roleLabel: string;
  description?: string;
  controls: NodeBusinessControl[];
  payload?: NodeBusinessPayload;
}

const ACTION_TYPES = [
  "capability.mcp.",
  "flux.action.",
  "flux.business.crmArchive",
  "flux.business.notifyOwner",
  "flux.business.recordArchive",
  "flux.business.teamNotify",
];

const CONTROL_PRIORITY: Record<NodeBusinessKind, string[]> = {
  "runtime-input": [],
  source: ["source", "sourceName"],
  trigger: ["cron", "timezone", "ms"],
  decision: [
    "amountThreshold",
    "reviewRiskLevel",
    "hotThreshold",
    "urgentSlaMinutes",
    "standardSlaMinutes",
    "expression",
    "sourcePath",
    "case1Value",
    "case2Value",
  ],
  approval: ["reviewer", "decision", "note"],
  "error-handler": ["format", "prefix"],
  output: ["target", "system", "collection", "channel", "recipients", "message"],
  action: ["channel", "recipients", "target", "system", "collection", "fallbackOwner"],
  process: [
    "direction",
    "rootName",
    "keyCase",
    "stringCase",
    "indent",
    "sortKeys",
    "trimStrings",
    "omitNull",
    "tone",
    "hotThreshold",
    "rule",
    "includeSla",
  ],
};

const PAYLOAD_KEYS = ["text", "request", "ticket", "leads", "data", "payload"];

const ENUM_LABELS: Record<string, string> = {
  manual: "运行时确认",
  approved: "默认通过",
  rejected: "默认退回",
  low: "低",
  medium: "中",
  high: "高",
  true: "是",
  false: "否",
  preserve: "保持原样",
  camel: "驼峰 camelCase",
  pascal: "帕斯卡 PascalCase",
  snake: "下划线 snake_case",
  kebab: "短横线 kebab-case",
  lower: "全小写",
  upper: "全大写",
  "xml-to-json": "XML → JSON",
  "json-to-xml": "JSON → XML",
  "yaml-to-json": "YAML → JSON",
  "json-to-yaml": "JSON → YAML",
};

export function resolveNodeBusinessKind(
  definition: NodeDefinition,
): NodeBusinessKind {
  if (definition.runtimeInputSchema) return "runtime-input";
  if (definition.executionRole === "error-handler") return "error-handler";
  if (definition.id === "flux.business.humanReview") return "approval";
  if (definition.ports.outputs.length > 1) return "decision";
  if (definition.id.startsWith("flux.output.")) return "output";
  if (ACTION_TYPES.some((prefix) => definition.id.startsWith(prefix))) return "action";
  if (definition.ports.inputs.length === 0) {
    return definition.carrier === "trigger" ? "trigger" : "source";
  }
  return "process";
}

export function buildNodeBusinessPresentation(
  definition: NodeDefinition,
): NodeBusinessPresentation {
  const kind = resolveNodeBusinessKind(definition);
  const properties = definition.configSchema.properties ?? {};
  const maxControls = definition.id === "flux.transform.jsonFormat"
    ? 6
    : definition.id === "flux.transform.xml" || definition.id === "flux.transform.yaml"
      ? 3
    : kind === "decision" || kind === "approval"
      ? 2
      : 1;
  const controls = CONTROL_PRIORITY[kind]
    .flatMap((key) => {
      const schema = properties[key];
      const control = schema ? toControl(key, schema) : null;
      return control ? [control] : [];
    })
    .slice(0, maxControls);

  const payloadKey = kind === "source"
    ? PAYLOAD_KEYS.find((key) => isPayloadSchema(properties[key]))
    : undefined;
  const payloadSchema = payloadKey ? properties[payloadKey] : undefined;

  return {
    kind,
    roleLabel: definition.id === "flux.input.text"
      ? "文本输入 / 输出"
      : definition.id === "flux.source.textConstant"
        ? "固定内容"
        : ROLE_LABEL[kind],
    description: definition.description,
    controls,
    payload: payloadKey && payloadSchema
      ? {
          key: payloadKey,
          label: payloadSchema.title ?? "业务数据",
          defaultValue: payloadSchema.default,
        }
      : undefined,
  };
}

const ROLE_LABEL: Record<NodeBusinessKind, string> = {
  "runtime-input": "运行输入",
  source: "业务输入",
  trigger: "触发入口",
  decision: "规则判断",
  approval: "人工节点",
  "error-handler": "异常分支",
  output: "交付结果",
  action: "业务动作",
  process: "处理步骤",
};

function isPayloadSchema(schema: JSONSchema | undefined): boolean {
  return Boolean(schema && schema.type === "string" && schema.format === "code");
}

function toControl(
  key: string,
  schema: JSONSchema,
): NodeBusinessControl | null {
  const common = {
    key,
    label: schema.title ?? key,
    defaultValue: schema.default,
    description: schema.description,
    destructive: key === "omitNull",
  };
  if (schema.enum) {
    return {
      ...common,
      type: "enum",
      options: schema.enum.map((value) => ({
        value: String(value),
        label: ENUM_LABELS[String(value)] ?? String(value),
      })),
    };
  }
  if (schema.type === "number") {
    return { ...common, type: "number" };
  }
  if (schema.type === "boolean") {
    return { ...common, type: "boolean" };
  }
  if (schema.type === "string" && schema.format !== "code") {
    return { ...common, type: "text" };
  }
  return null;
}
