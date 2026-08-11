import { defineNode } from "../registry.js";
import {
  getByPath,
  getInputValue,
  parseJson,
  parseLiteral,
  toFiniteNumber,
  type PlainRecord,
} from "./value-utils.js";

export const mathNode = defineNode({
  id: "flux.logic.math",
  name: "数学运算",
  description: "对输入数字执行四则运算、取模、极值或舍入",
  category: "计算",
  icon: "calculator",
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
        enum: ["add", "subtract", "multiply", "divide", "modulo", "min", "max", "round"],
        default: "add",
      },
      leftPath: { type: "string", title: "左值路径", default: "" },
      leftValue: { type: "number", title: "左值（路径为空时）", default: 0 },
      rightPath: { type: "string", title: "右值路径", default: "" },
      rightValue: { type: "number", title: "右值（路径为空时）", default: 0 },
      precision: { type: "number", title: "舍入小数位", default: 2 },
    },
  },
  async execute(ctx) {
    const config = ctx.config as {
      operation?: string;
      leftPath?: string;
      leftValue?: number;
      rightPath?: string;
      rightValue?: number;
      precision?: number;
    };
    const left = toFiniteNumber(
      config.leftPath ? getByPath(ctx.inputs, config.leftPath) : config.leftValue ?? 0,
      "左值",
    );
    const right = toFiniteNumber(
      config.rightPath ? getByPath(ctx.inputs, config.rightPath) : config.rightValue ?? 0,
      "右值",
    );
    let value: number;
    switch (config.operation ?? "add") {
      case "subtract": value = left - right; break;
      case "multiply": value = left * right; break;
      case "divide":
        if (right === 0) throw new Error("除数不能为 0");
        value = left / right;
        break;
      case "modulo":
        if (right === 0) throw new Error("取模除数不能为 0");
        value = left % right;
        break;
      case "min": value = Math.min(left, right); break;
      case "max": value = Math.max(left, right); break;
      case "round": {
        const precision = Math.min(12, Math.max(0, Math.trunc(config.precision ?? 2)));
        const factor = 10 ** precision;
        value = Math.round((left + Number.EPSILON) * factor) / factor;
        break;
      }
      case "add":
      default: value = left + right;
    }
    return { outputs: { out: { value, left, right, operation: config.operation ?? "add" } } };
  },
});

export const switchNode = defineNode({
  id: "flux.logic.switch",
  name: "规则分流",
  description: "按字段值将流程分发到两个命中出口或默认出口",
  category: "流程",
  icon: "route",
  version: "0.1.0",
  carrier: "basic",
  ports: {
    inputs: [{ id: "in", name: "输入" }],
    outputs: [
      { id: "case1", name: "规则一" },
      { id: "case2", name: "规则二" },
      { id: "default", name: "默认" },
    ],
  },
  configSchema: {
    type: "object",
    properties: {
      sourcePath: { type: "string", title: "判断字段路径", default: "status" },
      case1Value: { type: "string", title: "规则一的值", default: "success" },
      case2Value: { type: "string", title: "规则二的值", default: "failed" },
    },
  },
  async execute(ctx) {
    const { sourcePath = "", case1Value = "", case2Value = "" } = ctx.config as Record<string, string>;
    const value = getInputValue(ctx.inputs, sourcePath);
    const output = Object.is(value, parseLiteral(case1Value))
      ? "case1"
      : Object.is(value, parseLiteral(case2Value))
        ? "case2"
        : "default";
    ctx.log("info", `规则分流：${output}`);
    return { outputs: { [output]: ctx.inputs } };
  },
});

function matchesType(value: unknown, expected: string): boolean {
  if (expected === "array") return Array.isArray(value);
  if (expected === "object") return typeof value === "object" && value !== null && !Array.isArray(value);
  if (expected === "number") return typeof value === "number" && Number.isFinite(value);
  return typeof value === expected;
}

export const validateNode = defineNode({
  id: "flux.logic.validate",
  name: "数据校验",
  description: "检查必填字段和字段类型，并输出可定位的问题列表",
  category: "质量",
  icon: "shield-check",
  version: "0.1.0",
  carrier: "data",
  ports: {
    inputs: [{ id: "in", name: "数据" }],
    outputs: [
      { id: "valid", name: "通过" },
      { id: "invalid", name: "未通过" },
    ],
  },
  configSchema: {
    type: "object",
    properties: {
      requiredPaths: {
        type: "string",
        title: "必填字段",
        description: "多个字段用英文逗号分隔，例如 user.id,user.name",
        default: "",
      },
      typeRules: {
        type: "string",
        title: "类型规则 (JSON)",
        description: "支持 string、number、boolean、array、object",
        format: "code",
        default: "{}",
      },
    },
  },
  async execute(ctx) {
    const { requiredPaths = "", typeRules = "{}" } = ctx.config as Record<string, string>;
    const issues: Array<{ path: string; message: string }> = [];
    const required = requiredPaths.split(",").map((item) => item.trim()).filter(Boolean);
    for (const path of required) {
      const value = getByPath(ctx.inputs, path);
      if (value === undefined || value === null || value === "") {
        issues.push({ path, message: "必填字段缺失" });
      }
    }
    const rules = parseJson(typeRules, "类型规则", {}) as PlainRecord;
    for (const [path, expectedValue] of Object.entries(rules)) {
      const expected = String(expectedValue);
      if (!["string", "number", "boolean", "array", "object"].includes(expected)) {
        issues.push({ path, message: `不支持的类型规则：${expected}` });
        continue;
      }
      const value = getByPath(ctx.inputs, path);
      if (value !== undefined && !matchesType(value, expected)) {
        issues.push({ path, message: `期望 ${expected}，实际为 ${Array.isArray(value) ? "array" : typeof value}` });
      }
    }
    const result = { data: ctx.inputs, valid: issues.length === 0, issues };
    return { outputs: issues.length === 0 ? { valid: result } : { invalid: result } };
  },
});

export const logicUtilityNodes = [mathNode, switchNode, validateNode];
