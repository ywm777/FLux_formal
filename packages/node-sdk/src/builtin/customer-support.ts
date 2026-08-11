import { defineNode } from "../registry.js";

interface SupportCase {
  id: string;
  customer: string;
  subject: string;
  message: string;
  channel?: string;
  customerTier?: "standard" | "premium" | "enterprise";
}

function parseCase(raw: string): SupportCase {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch (error) {
    throw new Error(`工单数据不是有效 JSON：${(error as Error).message}`);
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("工单数据必须是对象");
  }
  const record = value as Record<string, unknown>;
  const subject = String(record.subject ?? "").trim();
  const message = String(record.message ?? "").trim();
  if (!subject || !message) throw new Error("工单缺少主题或问题描述");
  return {
    id: String(record.id ?? `CASE-${Date.now()}`),
    customer: String(record.customer ?? "匿名客户"),
    subject,
    message,
    channel: typeof record.channel === "string" ? record.channel : undefined,
    customerTier:
      record.customerTier === "premium" || record.customerTier === "enterprise"
        ? record.customerTier
        : "standard",
  };
}

function getSupportCase(input: Record<string, unknown>): SupportCase {
  const candidate = input.ticket ?? input.case ?? input;
  if (typeof candidate !== "object" || candidate === null || Array.isArray(candidate)) {
    throw new Error("没有可处理的客户工单");
  }
  return candidate as SupportCase;
}

export const caseIntakeNode = defineNode({
  id: "flux.support.caseIntake",
  name: "接收客户工单",
  description: "从邮件、客服表单或在线聊天接收并标准化客户问题",
  category: "客户支持",
  icon: "inbox",
  version: "0.1.0",
  carrier: "data",
  ports: { inputs: [], outputs: [{ id: "out", name: "客户工单" }] },
  configSchema: {
    type: "object",
    required: ["source", "ticket"],
    properties: {
      source: { type: "string", title: "工单来源", default: "客服表单" },
      ticket: {
        type: "string",
        title: "工单数据",
        format: "code",
        default: JSON.stringify(
          {
            id: "CASE-2026-0714",
            customer: "远海科技",
            subject: "生产环境无法登录",
            message: "管理员账号持续报错，已经影响全部一线人员使用。",
            channel: "企业微信",
            customerTier: "enterprise",
          },
          null,
          2,
        ),
      },
    },
  },
  async execute(ctx) {
    const config = ctx.config as { source?: string; ticket?: string };
    const ticket = parseCase(String(config.ticket ?? "{}"));
    const source = String(config.source ?? "客服表单");
    ctx.log("info", `已接收工单 ${ticket.id}，来源：${source}`);
    return {
      outputs: {
        out: { ticket: { ...ticket, source }, receivedAt: new Date().toISOString() },
      },
    };
  },
});

export const caseTriageNode = defineNode({
  id: "flux.support.caseTriage",
  name: "AI 工单分诊",
  description: "识别问题类型、客户等级和紧急程度，并按 SLA 进入对应路径",
  category: "客户支持",
  icon: "brain",
  version: "0.1.0",
  carrier: "ai",
  ports: {
    inputs: [{ id: "in", name: "客户工单" }],
    outputs: [
      { id: "urgent", name: "紧急处理" },
      { id: "standard", name: "常规处理" },
    ],
  },
  configSchema: {
    type: "object",
    properties: {
      urgentKeywords: {
        type: "string",
        title: "紧急关键词",
        default: "无法登录,宕机,数据泄露,支付失败,全部用户,生产环境",
      },
      urgentSlaMinutes: { type: "number", title: "紧急响应时限（分钟）", default: 30 },
      standardSlaMinutes: { type: "number", title: "常规响应时限（分钟）", default: 240 },
      fallbackOwner: { type: "string", title: "默认处理组", default: "一线支持" },
    },
  },
  async execute(ctx) {
    const config = ctx.config as {
      urgentKeywords?: string;
      urgentSlaMinutes?: number;
      standardSlaMinutes?: number;
      fallbackOwner?: string;
    };
    const ticket = getSupportCase(ctx.inputs);
    const keywords = String(config.urgentKeywords ?? "无法登录,宕机,数据泄露,支付失败")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    const content = `${ticket.subject} ${ticket.message}`;
    const matchedKeywords = keywords.filter((keyword) => content.includes(keyword));
    const urgent = matchedKeywords.length > 0 || ticket.customerTier === "enterprise";
    const severity = urgent
      ? matchedKeywords.some((keyword) => ["宕机", "数据泄露", "全部用户"].includes(keyword))
        ? "critical"
        : "high"
      : "normal";
    const slaMinutes = urgent
      ? Math.max(1, Number(config.urgentSlaMinutes ?? 30))
      : Math.max(1, Number(config.standardSlaMinutes ?? 240));
    const triage = {
      severity,
      category: content.includes("登录") ? "账号与访问" : content.includes("支付") ? "交易问题" : "产品咨询",
      owner: urgent ? "高级支持" : config.fallbackOwner ?? "一线支持",
      slaMinutes,
      dueAt: new Date(Date.now() + slaMinutes * 60_000).toISOString(),
      matchedKeywords,
    };
    ctx.log("info", `工单分诊完成：${severity}，${slaMinutes} 分钟内响应`);
    const payload = { ...ctx.inputs, ticket, triage };
    return { outputs: urgent ? { urgent: payload } : { standard: payload } };
  },
});

export const supportReplyDraftNode = defineNode({
  id: "flux.support.replyDraft",
  name: "生成回复草稿",
  description: "结合工单上下文和处理级别生成可发送的客户回复草稿",
  category: "客户支持",
  icon: "message-square",
  version: "0.1.0",
  carrier: "ai",
  ports: {
    inputs: [{ id: "in", name: "已分诊工单" }],
    outputs: [{ id: "out", name: "回复草稿" }],
  },
  configSchema: {
    type: "object",
    properties: {
      tone: { type: "string", title: "回复语气", default: "专业、明确、有同理心" },
      includeSla: { type: "boolean", title: "告知响应时限", default: true },
    },
  },
  async execute(ctx) {
    const ticket = getSupportCase(ctx.inputs);
    const triage = (ctx.inputs.triage ?? {}) as Record<string, unknown>;
    const includeSla = (ctx.config as { includeSla?: boolean }).includeSla !== false;
    const slaText = includeSla && triage.slaMinutes
      ? `我们已按高优先级处理，预计 ${triage.slaMinutes} 分钟内同步进展。`
      : "我们已经开始处理并会及时同步进展。";
    const draft = `${ticket.customer}，您好。我们已收到“${ticket.subject}”的问题。${slaText}`;
    ctx.log("info", `已为工单 ${ticket.id} 生成回复草稿`);
    return {
      outputs: {
        out: { ...ctx.inputs, responseDraft: draft, draftedAt: new Date().toISOString() },
      },
    };
  },
});

export const customerSupportNodes = [caseIntakeNode, caseTriageNode, supportReplyDraftNode];
