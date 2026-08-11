import { defineNode } from "../registry.js";

interface OperationRequest {
  id: string;
  requester: string;
  department: string;
  type: string;
  amount: number;
  reason: string;
  riskLevel?: "low" | "medium" | "high";
}

function parseRequest(raw: string): OperationRequest {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch (error) {
    throw new Error(`申请数据不是有效 JSON：${(error as Error).message}`);
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("申请数据必须是对象");
  }
  const record = value as Record<string, unknown>;
  const requester = String(record.requester ?? "").trim();
  const reason = String(record.reason ?? "").trim();
  const amount = Number(record.amount ?? 0);
  if (!requester || !reason || !Number.isFinite(amount) || amount < 0) {
    throw new Error("申请缺少申请人、事由或有效金额");
  }
  return {
    id: String(record.id ?? `REQ-${Date.now()}`),
    requester,
    department: String(record.department ?? "未指定部门"),
    type: String(record.type ?? "通用申请"),
    amount,
    reason,
    riskLevel:
      record.riskLevel === "high" || record.riskLevel === "medium"
        ? record.riskLevel
        : "low",
  };
}

function getRequest(input: Record<string, unknown>): OperationRequest {
  const candidate = input.request ?? input;
  if (typeof candidate !== "object" || candidate === null || Array.isArray(candidate)) {
    throw new Error("没有可处理的业务申请");
  }
  return candidate as OperationRequest;
}

export const requestIntakeNode = defineNode({
  id: "flux.operations.requestIntake",
  name: "接收业务申请",
  description: "接收采购、费用、折扣或资源申请并统一字段",
  category: "运营审批",
  icon: "file-plus",
  version: "0.1.0",
  carrier: "data",
  ports: { inputs: [], outputs: [{ id: "out", name: "业务申请" }] },
  configSchema: {
    type: "object",
    required: ["request"],
    properties: {
      source: { type: "string", title: "申请入口", default: "采购申请表" },
      request: {
        type: "string",
        title: "申请数据",
        format: "code",
        default: JSON.stringify(
          {
            id: "PO-2026-0714",
            requester: "陈序",
            department: "市场部",
            type: "软件采购",
            amount: 86000,
            reason: "购买年度客户数据分析服务",
            riskLevel: "medium",
          },
          null,
          2,
        ),
      },
    },
  },
  async execute(ctx) {
    const config = ctx.config as { source?: string; request?: string };
    const request = parseRequest(String(config.request ?? "{}"));
    const source = String(config.source ?? "业务申请表");
    ctx.log("info", `已接收 ${request.type}：${request.id}`);
    return { outputs: { out: { request, source, submittedAt: new Date().toISOString() } } };
  },
});

export const policyCheckNode = defineNode({
  id: "flux.operations.policyCheck",
  name: "检查审批策略",
  description: "根据金额、风险和申请类型决定自动通过或进入人工审批",
  category: "运营审批",
  icon: "shield-check",
  version: "0.1.0",
  carrier: "basic",
  ports: {
    inputs: [{ id: "in", name: "业务申请" }],
    outputs: [
      { id: "automatic", name: "自动通过" },
      { id: "manual", name: "人工审批" },
    ],
  },
  configSchema: {
    type: "object",
    properties: {
      amountThreshold: { type: "number", title: "人工审批金额阈值", default: 50000 },
      reviewRiskLevel: {
        type: "string",
        title: "需审批风险等级",
        enum: ["medium", "high"],
        default: "medium",
      },
      policyName: { type: "string", title: "审批制度", default: "采购与费用管理制度 V2" },
    },
  },
  async execute(ctx) {
    const config = ctx.config as {
      amountThreshold?: number;
      reviewRiskLevel?: string;
      policyName?: string;
    };
    const request = getRequest(ctx.inputs);
    const threshold = Math.max(0, Number(config.amountThreshold ?? 50000));
    const riskWeight = { low: 0, medium: 1, high: 2 } as const;
    const requiredRisk = config.reviewRiskLevel === "high" ? 2 : 1;
    const requestRisk = riskWeight[request.riskLevel ?? "low"];
    const requiresReview = request.amount >= threshold || requestRisk >= requiredRisk;
    const policy = {
      name: config.policyName ?? "采购与费用管理制度 V2",
      amountThreshold: threshold,
      outcome: requiresReview ? "manual" : "automatic",
      reason: requiresReview
        ? request.amount >= threshold
          ? `金额达到 ${threshold} 元审批阈值`
          : `风险等级为 ${request.riskLevel}`
        : "金额和风险均在自动通过范围内",
      checkedAt: new Date().toISOString(),
    };
    ctx.log("info", `审批策略检查：${requiresReview ? "进入人工审批" : "自动通过"}`);
    const payload = { ...ctx.inputs, request, policy };
    return { outputs: requiresReview ? { manual: payload } : { automatic: payload } };
  },
});

export const operationsNodes = [requestIntakeNode, policyCheckNode];
