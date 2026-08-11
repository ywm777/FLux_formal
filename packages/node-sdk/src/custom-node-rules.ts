import type {
  CarrierKind,
  JSONSchema,
  PortSchema,
} from "./types.js";

export const CUSTOM_NODE_DRAFT_SCHEMA_VERSION = 1 as const;

export const CUSTOM_NODE_RULES = {
  maxNameLength: 40,
  maxDescriptionLength: 160,
  maxPortsPerDirection: 8,
  maxConfigFields: 20,
  maxSchemaDepth: 4,
  maxSourceCharacters: 20_000,
  minTestCases: 2,
  maxTestCases: 8,
  maxCapabilityActions: 8,
  runtimeTimeoutMs: 5_000,
  runtimeMemoryMb: 64,
  maxOutputBytes: 1_048_576,
} as const;

export const CUSTOM_NODE_LIFECYCLE = [
  "draft",
  "validated",
  "tested",
  "active",
  "disabled",
] as const;

export type CustomNodeLifecycleState = typeof CUSTOM_NODE_LIFECYCLE[number];
export type CustomNodeCategory =
  | "source"
  | "transform"
  | "control"
  | "integration"
  | "output";
export type CustomNodePortDataType =
  | "any"
  | "string"
  | "number"
  | "boolean"
  | "object"
  | "array";
export type CustomNodeCapabilityCarrier = "ai" | "app" | "data";

export interface CustomNodeCapabilityRequest {
  /** 草案内的稳定引用；启用前由用户绑定为真实 connection/binding。 */
  key: string;
  carrier: CustomNodeCapabilityCarrier;
  actions: string[];
  reason: string;
}

export interface CustomNodeRuntimeInput {
  policy: "required" | "fallback";
  schema: JSONSchema;
}

export interface CustomNodeImplementation {
  language: "javascript";
  /** 受限函数体；运行时只注入 input、config、invoke、log、signal。 */
  source: string;
}

export interface CustomNodeCapabilityMock {
  key: string;
  action: string;
  response?: unknown;
  errorCode?: string;
}

export interface CustomNodeTestCase {
  name: string;
  kind: "happy" | "boundary" | "error";
  input: unknown;
  config?: Record<string, unknown>;
  /** 测试阶段的能力回执，不会触发真实外部调用。 */
  mocks?: CustomNodeCapabilityMock[];
  expected: {
    outputs?: Record<string, unknown>;
    errorCode?: string;
  };
}

/**
 * AI 只能生成此草案。id、ownerId、version、status、bindingId 和凭证由平台管理，
 * 不属于模型输出，也不能出现在草案中。
 */
export interface CustomNodeDraft {
  schemaVersion: typeof CUSTOM_NODE_DRAFT_SCHEMA_VERSION;
  slug: string;
  name: string;
  description: string;
  category: CustomNodeCategory;
  icon: string;
  ports: PortSchema;
  configSchema: JSONSchema;
  runtimeInput?: CustomNodeRuntimeInput;
  implementation: CustomNodeImplementation;
  capabilities: CustomNodeCapabilityRequest[];
  tests: CustomNodeTestCase[];
}

export type CustomNodeRuleIssueCode =
  | "invalid_shape"
  | "unknown_field"
  | "invalid_value"
  | "limit_exceeded"
  | "duplicate_value"
  | "unsafe_source"
  | "undeclared_capability"
  | "invalid_test";

export interface CustomNodeRuleIssue {
  code: CustomNodeRuleIssueCode;
  path: string;
  message: string;
}

export type CustomNodeDraftValidation =
  | { success: true; value: CustomNodeDraft; issues: [] }
  | { success: false; issues: CustomNodeRuleIssue[] };

const CATEGORY_VALUES = new Set<CustomNodeCategory>([
  "source",
  "transform",
  "control",
  "integration",
  "output",
]);
const DATA_TYPE_VALUES = new Set<CustomNodePortDataType>([
  "any",
  "string",
  "number",
  "boolean",
  "object",
  "array",
]);
const CAPABILITY_CARRIERS = new Set<CustomNodeCapabilityCarrier>([
  "ai",
  "app",
  "data",
]);
const ICON_VALUES = new Set([
  "braces",
  "database",
  "file-json",
  "globe",
  "sparkles",
  "text",
  "wand",
  "workflow",
]);
const TOP_LEVEL_FIELDS = new Set([
  "schemaVersion",
  "slug",
  "name",
  "description",
  "category",
  "icon",
  "ports",
  "configSchema",
  "runtimeInput",
  "implementation",
  "capabilities",
  "tests",
]);
const IDENTIFIER_PATTERN = /^[a-z][a-z0-9_]{0,31}$/;
const SLUG_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const ACTION_PATTERN = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/;
const OWNER_NAMESPACE_PATTERN = /^[a-z0-9]{6,32}$/;
const ALLOWED_SCHEMA_TYPES = new Set([
  "object",
  "string",
  "number",
  "boolean",
  "array",
]);
const ALLOWED_SCHEMA_FORMATS = new Set(["textarea", "code"]);
const SCHEMA_FIELDS = new Set([
  "type",
  "title",
  "description",
  "properties",
  "items",
  "enum",
  "default",
  "required",
  "format",
]);
const FORBIDDEN_SOURCE_PATTERNS: Array<[RegExp, string]> = [
  [/\b(?:eval|Function)\s*\(/, "禁止动态执行代码"],
  [/\b(?:require|import)\s*(?:\(|[\"'])/, "禁止加载外部模块"],
  [/\b(?:fetch|XMLHttpRequest|WebSocket)\b/, "禁止绕过平台能力直接访问网络"],
  [
    /\b(?:process|globalThis|window|document|self|navigator|location|indexedDB|caches|postMessage|importScripts)\b/,
    "禁止访问宿主环境",
  ],
  [/\b(?:child_process|worker_threads|node:fs|node:net|node:tls)\b/, "禁止访问系统资源"],
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function addIssue(
  issues: CustomNodeRuleIssue[],
  code: CustomNodeRuleIssueCode,
  path: string,
  message: string,
): void {
  issues.push({ code, path, message });
}

function rejectUnknownFields(
  value: Record<string, unknown>,
  allowed: Set<string>,
  path: string,
  issues: CustomNodeRuleIssue[],
): void {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      addIssue(issues, "unknown_field", `${path}.${key}`, "字段不属于自定义节点草案协议");
    }
  }
}

function readBoundedString(
  value: unknown,
  path: string,
  issues: CustomNodeRuleIssue[],
  options: { min?: number; max: number; pattern?: RegExp },
): string | null {
  if (typeof value !== "string") {
    addIssue(issues, "invalid_value", path, "必须是字符串");
    return null;
  }
  const text = value.trim();
  if (text.length < (options.min ?? 1) || text.length > options.max) {
    addIssue(
      issues,
      "limit_exceeded",
      path,
      `长度必须在 ${options.min ?? 1}-${options.max} 之间`,
    );
  }
  if (options.pattern && !options.pattern.test(text)) {
    addIssue(issues, "invalid_value", path, "格式不符合规则");
  }
  return text;
}

function isJsonSerializable(value: unknown, seen = new Set<object>()): boolean {
  if (value === null) return true;
  if (["string", "number", "boolean"].includes(typeof value)) {
    return typeof value !== "number" || Number.isFinite(value);
  }
  if (typeof value !== "object") return false;
  if (seen.has(value as object)) return false;
  seen.add(value as object);
  let serializable: boolean;
  if (Array.isArray(value)) {
    serializable = value.every((item) => isJsonSerializable(item, seen));
    seen.delete(value);
    return serializable;
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    seen.delete(value);
    return false;
  }
  serializable = Object.values(value as Record<string, unknown>).every((item) =>
    isJsonSerializable(item, seen),
  );
  seen.delete(value);
  return serializable;
}

function validateSchema(
  value: unknown,
  path: string,
  issues: CustomNodeRuleIssue[],
  depth = 0,
  requireObjectRoot = false,
): void {
  if (!isRecord(value)) {
    addIssue(issues, "invalid_shape", path, "必须是 JSON Schema 对象");
    return;
  }
  rejectUnknownFields(value, SCHEMA_FIELDS, path, issues);
  if (depth > CUSTOM_NODE_RULES.maxSchemaDepth) {
    addIssue(issues, "limit_exceeded", path, "配置结构层级过深");
    return;
  }
  if (typeof value.type !== "string" || !ALLOWED_SCHEMA_TYPES.has(value.type)) {
    addIssue(issues, "invalid_value", `${path}.type`, "只允许 object/string/number/boolean/array");
  }
  if (requireObjectRoot && value.type !== "object") {
    addIssue(issues, "invalid_value", `${path}.type`, "根配置必须是 object");
  }
  if (value.format !== undefined) {
    if (value.format === "secret") {
      addIssue(issues, "invalid_value", `${path}.format`, "凭证不能写入节点配置，必须使用能力绑定");
    } else if (typeof value.format !== "string" || !ALLOWED_SCHEMA_FORMATS.has(value.format)) {
      addIssue(issues, "invalid_value", `${path}.format`, "只允许 textarea 或 code");
    }
  }
  if (value.default !== undefined && !isJsonSerializable(value.default)) {
    addIssue(issues, "invalid_value", `${path}.default`, "默认值必须可序列化为 JSON");
  }
  if (value.enum !== undefined) {
    if (!Array.isArray(value.enum) || value.enum.length === 0 || value.enum.length > 50) {
      addIssue(issues, "limit_exceeded", `${path}.enum`, "枚举数量必须在 1-50 之间");
    } else if (!value.enum.every((item) => typeof item === "string" || typeof item === "number")) {
      addIssue(issues, "invalid_value", `${path}.enum`, "枚举值只能是字符串或数字");
    }
  }

  const properties = value.properties;
  if (properties !== undefined) {
    if (!isRecord(properties)) {
      addIssue(issues, "invalid_shape", `${path}.properties`, "必须是字段对象");
    } else {
      const entries = Object.entries(properties);
      if (entries.length > CUSTOM_NODE_RULES.maxConfigFields) {
        addIssue(issues, "limit_exceeded", `${path}.properties`, "配置字段数量超过限制");
      }
      for (const [key, property] of entries) {
        if (!IDENTIFIER_PATTERN.test(key)) {
          addIssue(issues, "invalid_value", `${path}.properties.${key}`, "字段 ID 必须为小写稳定标识");
        }
        validateSchema(property, `${path}.properties.${key}`, issues, depth + 1);
      }
      if (value.required !== undefined) {
        if (!Array.isArray(value.required) || !value.required.every((item) => typeof item === "string")) {
          addIssue(issues, "invalid_shape", `${path}.required`, "必须是字段 ID 数组");
        } else {
          for (const key of value.required) {
            if (!(key in properties)) {
              addIssue(issues, "invalid_value", `${path}.required`, `必填字段不存在: ${key}`);
            }
          }
        }
      }
    }
  }
  if (value.type === "array") {
    if (value.items === undefined) {
      addIssue(issues, "invalid_value", `${path}.items`, "数组配置必须声明 items");
    } else {
      validateSchema(value.items, `${path}.items`, issues, depth + 1);
    }
  }
}

function validatePorts(
  value: unknown,
  issues: CustomNodeRuleIssue[],
): void {
  if (!isRecord(value)) {
    addIssue(issues, "invalid_shape", "ports", "必须包含 inputs 和 outputs");
    return;
  }
  rejectUnknownFields(value, new Set(["inputs", "outputs"]), "ports", issues);
  for (const direction of ["inputs", "outputs"] as const) {
    const ports = value[direction];
    if (!Array.isArray(ports)) {
      addIssue(issues, "invalid_shape", `ports.${direction}`, "必须是端口数组");
      continue;
    }
    if (ports.length > CUSTOM_NODE_RULES.maxPortsPerDirection) {
      addIssue(issues, "limit_exceeded", `ports.${direction}`, "端口数量超过限制");
    }
    if (direction === "outputs" && ports.length === 0) {
      addIssue(issues, "invalid_value", "ports.outputs", "自定义节点至少需要一个输出端口");
    }
    const ids = new Set<string>();
    ports.forEach((port, index) => {
      const path = `ports.${direction}.${index}`;
      if (!isRecord(port)) {
        addIssue(issues, "invalid_shape", path, "端口必须是对象");
        return;
      }
      rejectUnknownFields(port, new Set(["id", "name", "dataType", "capacity"]), path, issues);
      const id = readBoundedString(port.id, `${path}.id`, issues, {
        max: 32,
        pattern: IDENTIFIER_PATTERN,
      });
      readBoundedString(port.name, `${path}.name`, issues, { max: 24 });
      if (id) {
        if (ids.has(id)) addIssue(issues, "duplicate_value", `${path}.id`, "同方向端口 ID 重复");
        ids.add(id);
      }
      if (port.dataType !== undefined && !DATA_TYPE_VALUES.has(port.dataType as CustomNodePortDataType)) {
        addIssue(issues, "invalid_value", `${path}.dataType`, "端口数据类型不受支持");
      }
      if (port.capacity !== undefined && port.capacity !== "one" && port.capacity !== "many") {
        addIssue(issues, "invalid_value", `${path}.capacity`, "端口容量只允许 one 或 many");
      }
      if (direction === "inputs" && port.capacity === "many") {
        addIssue(issues, "invalid_value", `${path}.capacity`, "当前版本输入端口只支持单上游连接");
      }
    });
  }
}

function validateCapabilities(
  value: unknown,
  issues: CustomNodeRuleIssue[],
): Map<string, Set<string>> {
  const declaredCapabilities = new Map<string, Set<string>>();
  if (!Array.isArray(value)) {
    addIssue(issues, "invalid_shape", "capabilities", "必须是能力申请数组");
    return declaredCapabilities;
  }
  const keys = new Set<string>();
  value.forEach((capability, index) => {
    const path = `capabilities.${index}`;
    if (!isRecord(capability)) {
      addIssue(issues, "invalid_shape", path, "能力申请必须是对象");
      return;
    }
    rejectUnknownFields(capability, new Set(["key", "carrier", "actions", "reason"]), path, issues);
    const key = readBoundedString(capability.key, `${path}.key`, issues, {
      max: 32,
      pattern: IDENTIFIER_PATTERN,
    });
    if (key) {
      if (keys.has(key)) addIssue(issues, "duplicate_value", `${path}.key`, "能力 key 重复");
      keys.add(key);
    }
    if (!CAPABILITY_CARRIERS.has(capability.carrier as CustomNodeCapabilityCarrier)) {
      addIssue(issues, "invalid_value", `${path}.carrier`, "只允许 ai/app/data 能力");
    }
    if (
      !Array.isArray(capability.actions) ||
      capability.actions.length === 0 ||
      capability.actions.length > CUSTOM_NODE_RULES.maxCapabilityActions
    ) {
      addIssue(issues, "limit_exceeded", `${path}.actions`, "能力动作数量必须在限制内");
    } else {
      const actions = new Set<string>();
      for (const [actionIndex, action] of capability.actions.entries()) {
        if (typeof action !== "string" || !ACTION_PATTERN.test(action)) {
          addIssue(issues, "invalid_value", `${path}.actions.${actionIndex}`, "动作名格式无效");
        } else if (actions.has(action)) {
          addIssue(issues, "duplicate_value", `${path}.actions.${actionIndex}`, "能力动作重复");
        } else {
          actions.add(action);
        }
      }
      if (key) declaredCapabilities.set(key, actions);
    }
    readBoundedString(capability.reason, `${path}.reason`, issues, { max: 120 });
  });
  return declaredCapabilities;
}

function validateInvokeCalls(
  source: string,
  declaredCapabilities: Map<string, Set<string>>,
  issues: CustomNodeRuleIssue[],
): void {
  const invokePattern = /\binvoke\s*\(\s*(["'])([^"']+)\1\s*,\s*(["'])([^"']+)\3\s*(?:,|\))/g;
  const staticCalls = [...source.matchAll(invokePattern)];
  const allInvokeCalls = source.match(/\binvoke\s*\(/g) ?? [];

  if (staticCalls.length !== allInvokeCalls.length) {
    addIssue(
      issues,
      "undeclared_capability",
      "implementation.source",
      "invoke 的能力 key 和动作必须使用静态字符串",
    );
  }

  for (const call of staticCalls) {
    const capabilityKey = call[2];
    const action = call[4];
    const actions = declaredCapabilities.get(capabilityKey);
    if (!actions) {
      addIssue(
        issues,
        "undeclared_capability",
        "implementation.source",
        `调用了未声明的能力: ${capabilityKey}`,
      );
    } else if (!actions.has(action)) {
      addIssue(
        issues,
        "undeclared_capability",
        "implementation.source",
        `能力 ${capabilityKey} 未声明动作: ${action}`,
      );
    }
  }
}

function validateTests(
  value: unknown,
  outputPortIds: Set<string>,
  declaredCapabilities: Map<string, Set<string>>,
  requiresCapabilityMocks: boolean,
  issues: CustomNodeRuleIssue[],
): void {
  if (!Array.isArray(value)) {
    addIssue(issues, "invalid_shape", "tests", "必须是测试样例数组");
    return;
  }
  if (value.length < CUSTOM_NODE_RULES.minTestCases || value.length > CUSTOM_NODE_RULES.maxTestCases) {
    addIssue(issues, "limit_exceeded", "tests", "测试样例数量必须在 2-8 之间");
  }
  let hasHappy = false;
  let hasBoundaryOrError = false;
  value.forEach((test, index) => {
    const path = `tests.${index}`;
    if (!isRecord(test)) {
      addIssue(issues, "invalid_shape", path, "测试样例必须是对象");
      return;
    }
    rejectUnknownFields(
      test,
      new Set(["name", "kind", "input", "config", "mocks", "expected"]),
      path,
      issues,
    );
    readBoundedString(test.name, `${path}.name`, issues, { max: 60 });
    if (!new Set(["happy", "boundary", "error"]).has(test.kind as string)) {
      addIssue(issues, "invalid_value", `${path}.kind`, "测试类型必须是 happy/boundary/error");
    }
    hasHappy ||= test.kind === "happy";
    hasBoundaryOrError ||= test.kind === "boundary" || test.kind === "error";
    if (!isJsonSerializable(test.input)) {
      addIssue(issues, "invalid_test", `${path}.input`, "测试输入必须可序列化为 JSON");
    }
    if (test.config !== undefined && (!isRecord(test.config) || !isJsonSerializable(test.config))) {
      addIssue(issues, "invalid_test", `${path}.config`, "测试配置必须是 JSON 对象");
    }
    if (test.mocks !== undefined) {
      if (!Array.isArray(test.mocks) || test.mocks.length > CUSTOM_NODE_RULES.maxCapabilityActions) {
        addIssue(issues, "invalid_test", `${path}.mocks`, "能力模拟必须是受限数组");
      } else {
        test.mocks.forEach((mock, mockIndex) => {
          const mockPath = `${path}.mocks.${mockIndex}`;
          if (!isRecord(mock)) {
            addIssue(issues, "invalid_test", mockPath, "能力模拟必须是对象");
            return;
          }
          rejectUnknownFields(
            mock,
            new Set(["key", "action", "response", "errorCode"]),
            mockPath,
            issues,
          );
          const actions = typeof mock.key === "string"
            ? declaredCapabilities.get(mock.key)
            : undefined;
          if (!actions || typeof mock.action !== "string" || !actions.has(mock.action)) {
            addIssue(issues, "invalid_test", mockPath, "能力模拟必须匹配已声明的 key 和 action");
          }
          const hasResponse = Object.prototype.hasOwnProperty.call(mock, "response");
          const hasError = typeof mock.errorCode === "string";
          if (hasResponse === hasError) {
            addIssue(issues, "invalid_test", mockPath, "能力模拟必须且只能声明 response 或 errorCode");
          }
          if (hasResponse && !isJsonSerializable(mock.response)) {
            addIssue(issues, "invalid_test", `${mockPath}.response`, "模拟回执必须可序列化为 JSON");
          }
          if (hasError && !ACTION_PATTERN.test(mock.errorCode as string)) {
            addIssue(issues, "invalid_test", `${mockPath}.errorCode`, "模拟错误码格式无效");
          }
        });
      }
    }
    if (requiresCapabilityMocks && (!Array.isArray(test.mocks) || test.mocks.length === 0)) {
      addIssue(issues, "invalid_test", `${path}.mocks`, "调用外部能力的节点必须为每个测试提供模拟回执");
    }
    if (!isRecord(test.expected)) {
      addIssue(issues, "invalid_shape", `${path}.expected`, "必须声明预期输出或错误码");
      return;
    }
    rejectUnknownFields(test.expected, new Set(["outputs", "errorCode"]), `${path}.expected`, issues);
    if (test.kind === "error") {
      if (typeof test.expected.errorCode !== "string" || !ACTION_PATTERN.test(test.expected.errorCode)) {
        addIssue(issues, "invalid_test", `${path}.expected.errorCode`, "错误测试必须声明稳定错误码");
      }
      return;
    }
    if (!isRecord(test.expected.outputs) || !isJsonSerializable(test.expected.outputs)) {
      addIssue(issues, "invalid_test", `${path}.expected.outputs`, "成功测试必须声明 JSON 输出对象");
      return;
    }
    for (const outputId of Object.keys(test.expected.outputs)) {
      if (!outputPortIds.has(outputId)) {
        addIssue(issues, "invalid_test", `${path}.expected.outputs.${outputId}`, "输出端口未声明");
      }
    }
  });
  if (!hasHappy) addIssue(issues, "invalid_test", "tests", "至少需要一个 happy 测试");
  if (!hasBoundaryOrError) addIssue(issues, "invalid_test", "tests", "至少需要一个 boundary 或 error 测试");
}

export function validateCustomNodeDraft(input: unknown): CustomNodeDraftValidation {
  const issues: CustomNodeRuleIssue[] = [];
  if (!isRecord(input)) {
    return {
      success: false,
      issues: [{ code: "invalid_shape", path: "$", message: "节点草案必须是对象" }],
    };
  }
  rejectUnknownFields(input, TOP_LEVEL_FIELDS, "$", issues);
  if (input.schemaVersion !== CUSTOM_NODE_DRAFT_SCHEMA_VERSION) {
    addIssue(issues, "invalid_value", "schemaVersion", "不支持的草案协议版本");
  }
  readBoundedString(input.slug, "slug", issues, { min: 2, max: 48, pattern: SLUG_PATTERN });
  readBoundedString(input.name, "name", issues, { min: 2, max: CUSTOM_NODE_RULES.maxNameLength });
  readBoundedString(input.description, "description", issues, {
    min: 8,
    max: CUSTOM_NODE_RULES.maxDescriptionLength,
  });
  if (!CATEGORY_VALUES.has(input.category as CustomNodeCategory)) {
    addIssue(issues, "invalid_value", "category", "必须使用五类稳定节点分类之一");
  }
  if (typeof input.icon !== "string" || !ICON_VALUES.has(input.icon)) {
    addIssue(issues, "invalid_value", "icon", "图标不在允许列表中");
  }
  validatePorts(input.ports, issues);
  validateSchema(input.configSchema, "configSchema", issues, 0, true);

  if (input.runtimeInput !== undefined) {
    if (!isRecord(input.runtimeInput)) {
      addIssue(issues, "invalid_shape", "runtimeInput", "运行输入必须是对象");
    } else {
      rejectUnknownFields(input.runtimeInput, new Set(["policy", "schema"]), "runtimeInput", issues);
      if (!new Set(["required", "fallback"]).has(input.runtimeInput.policy as string)) {
        addIssue(issues, "invalid_value", "runtimeInput.policy", "只允许 required 或 fallback");
      }
      validateSchema(input.runtimeInput.schema, "runtimeInput.schema", issues, 0, true);
    }
  }

  let source = "";
  if (!isRecord(input.implementation)) {
    addIssue(issues, "invalid_shape", "implementation", "必须声明受限实现");
  } else {
    rejectUnknownFields(input.implementation, new Set(["language", "source"]), "implementation", issues);
    if (input.implementation.language !== "javascript") {
      addIssue(issues, "invalid_value", "implementation.language", "首版只支持受限 JavaScript");
    }
    if (typeof input.implementation.source !== "string" || !input.implementation.source.trim()) {
      addIssue(issues, "invalid_value", "implementation.source", "实现源码不能为空");
    } else {
      source = input.implementation.source;
      if (source.length > CUSTOM_NODE_RULES.maxSourceCharacters) {
        addIssue(issues, "limit_exceeded", "implementation.source", "实现源码超过长度限制");
      }
      for (const [pattern, message] of FORBIDDEN_SOURCE_PATTERNS) {
        if (pattern.test(source)) addIssue(issues, "unsafe_source", "implementation.source", message);
      }
    }
  }

  const declaredCapabilities = validateCapabilities(input.capabilities, issues);
  if (input.category === "integration" && Array.isArray(input.capabilities) && input.capabilities.length === 0) {
    addIssue(issues, "undeclared_capability", "capabilities", "连接类节点必须声明外部能力");
  }
  validateInvokeCalls(source, declaredCapabilities, issues);

  const outputPortIds = new Set<string>();
  if (isRecord(input.ports) && Array.isArray(input.ports.outputs)) {
    for (const port of input.ports.outputs) {
      if (isRecord(port) && typeof port.id === "string") outputPortIds.add(port.id);
    }
  }
  validateTests(
    input.tests,
    outputPortIds,
    declaredCapabilities,
    /\binvoke\s*\(/.test(source),
    issues,
  );

  return issues.length === 0
    ? { success: true, value: input as unknown as CustomNodeDraft, issues: [] }
    : { success: false, issues };
}

/** 节点类型 ID 由平台生成，AI 草案不得自行指定。 */
export function buildCustomNodeTypeId(ownerNamespace: string, slug: string): string {
  if (!OWNER_NAMESPACE_PATTERN.test(ownerNamespace)) {
    throw new Error("自定义节点 owner namespace 格式无效");
  }
  if (slug.length < 2 || slug.length > 48 || !SLUG_PATTERN.test(slug)) {
    throw new Error("自定义节点 slug 格式无效");
  }
  return `custom.${ownerNamespace}.${slug}`;
}

export function deriveCustomNodeCarrier(draft: CustomNodeDraft): CarrierKind {
  if (draft.capabilities.some((capability) => capability.carrier === "ai")) return "ai";
  if (draft.capabilities.some((capability) => capability.carrier === "app")) return "app";
  if (draft.capabilities.some((capability) => capability.carrier === "data")) return "data";
  return "code";
}
