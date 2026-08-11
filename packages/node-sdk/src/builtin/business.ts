import { defineNode } from "../registry.js";

interface LeadRecord {
  name: string;
  company?: string;
  channel?: string;
  need?: string;
  budget?: number;
  urgency?: "low" | "medium" | "high";
  owner?: string;
  score?: number;
  grade?: string;
  reason?: string;
}

function parseLeads(raw: string): LeadRecord[] {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch (error) {
    throw new Error(`线索数据不是有效 JSON：${(error as Error).message}`);
  }
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error("线索数据必须是非空数组");
  }
  return value.map((item, index) => {
    if (typeof item !== "object" || item === null) {
      throw new Error(`第 ${index + 1} 条线索不是对象`);
    }
    const record = item as Record<string, unknown>;
    const name = String(record.name ?? "").trim();
    if (!name) throw new Error(`第 ${index + 1} 条线索缺少客户名称`);
    return {
      name,
      company: typeof record.company === "string" ? record.company : undefined,
      channel: typeof record.channel === "string" ? record.channel : undefined,
      need: typeof record.need === "string" ? record.need : undefined,
      budget:
        typeof record.budget === "number" && Number.isFinite(record.budget)
          ? record.budget
          : undefined,
      urgency:
        record.urgency === "high" ||
        record.urgency === "medium" ||
        record.urgency === "low"
          ? record.urgency
          : undefined,
      owner: typeof record.owner === "string" ? record.owner : undefined,
    };
  });
}

function getInputLeads(input: Record<string, unknown>): LeadRecord[] {
  const direct = input.leads;
  if (Array.isArray(direct)) return direct as LeadRecord[];
  const nested = input.data;
  if (
    typeof nested === "object" &&
    nested !== null &&
    Array.isArray((nested as Record<string, unknown>).leads)
  ) {
    return (nested as Record<string, unknown>).leads as LeadRecord[];
  }
  return [];
}

function scoreLead(lead: LeadRecord): number {
  const budgetScore = Math.min(40, Math.round((lead.budget ?? 0) / 2500));
  const urgencyScore =
    lead.urgency === "high" ? 30 : lead.urgency === "medium" ? 18 : 8;
  const intentScore = lead.need && lead.need.length >= 8 ? 20 : 10;
  const channelScore = lead.channel?.includes("官网") ? 10 : 6;
  return Math.max(1, Math.min(100, budgetScore + urgencyScore + intentScore + channelScore));
}

export const leadIntakeNode = defineNode({
  id: "flux.business.leadIntake",
  name: "接收客户线索",
  description: "从表单、活动名单或手动导入生成待处理线索",
  category: "客户线索",
  icon: "inbox",
  version: "0.1.0",
  carrier: "data",
  ports: {
    inputs: [],
    outputs: [{ id: "out", name: "线索" }],
  },
  configSchema: {
    type: "object",
    required: ["sourceName", "leads"],
    properties: {
      sourceName: {
        type: "string",
        title: "线索来源",
        default: "官网表单",
      },
      leads: {
        type: "string",
        title: "线索数据",
        description: "每条线索包含 name、company、need、budget、urgency",
        format: "code",
        default: JSON.stringify(
          [
            {
              name: "林青",
              company: "星河制造",
              channel: "官网表单",
              need: "希望两周内完成销售线索自动分配",
              budget: 120000,
              urgency: "high",
            },
            {
              name: "周远",
              company: "云岚教育",
              channel: "活动名单",
              need: "咨询内容运营自动化",
              budget: 36000,
              urgency: "medium",
            },
          ],
          null,
          2,
        ),
      },
    },
  },
  async execute(ctx) {
    const config = ctx.config as { sourceName?: string; leads?: string };
    const leads = parseLeads(String(config.leads ?? "[]"));
    const sourceName = String(config.sourceName ?? "线索来源").trim() || "线索来源";
    ctx.log("info", `已接收 ${leads.length} 条客户线索，来源：${sourceName}`);
    return {
      outputs: {
        out: {
          sourceName,
          receivedAt: new Date().toISOString(),
          leads,
          count: leads.length,
        },
      },
    };
  },
});

export const leadScoreNode = defineNode({
  id: "flux.business.leadScore",
  name: "AI 线索评分",
  description: "按预算、意向和紧急程度评估成交优先级",
  category: "客户线索",
  icon: "brain",
  version: "0.1.0",
  carrier: "ai",
  ports: {
    inputs: [{ id: "in", name: "线索" }],
    outputs: [{ id: "out", name: "评分结果" }],
  },
  configSchema: {
    type: "object",
    properties: {
      rule: {
        type: "string",
        title: "评分规则",
        format: "textarea",
        default: "综合预算、需求明确度、紧急程度和来源可信度，筛出需要销售当天跟进的线索。",
      },
      hotThreshold: {
        type: "number",
        title: "高价值阈值",
        default: 70,
      },
      fallbackOwner: {
        type: "string",
        title: "默认负责人",
        default: "销售运营",
      },
    },
  },
  async execute(ctx) {
    const config = ctx.config as { hotThreshold?: number; fallbackOwner?: string };
    const threshold = Math.max(1, Math.min(100, Number(config.hotThreshold ?? 70)));
    const fallbackOwner = String(config.fallbackOwner ?? "销售运营");
    const leads = getInputLeads(ctx.inputs);
    if (leads.length === 0) throw new Error("没有可评分的客户线索");
    const scored = leads
      .map((lead) => {
        const score = scoreLead(lead);
        const grade = score >= threshold ? "高价值" : score >= 50 ? "可培育" : "低优先级";
        return {
          ...lead,
          owner: lead.owner ?? fallbackOwner,
          score,
          grade,
          reason:
            score >= threshold
              ? "预算和时效满足当天跟进条件"
              : "需要继续培育或补充需求信息",
        };
      })
      .sort((left, right) => right.score - left.score);
    const hotCount = scored.filter((lead) => lead.score >= threshold).length;
    ctx.log("info", `AI 线索评分完成：${hotCount}/${scored.length} 条高价值线索`);
    return {
      outputs: {
        out: {
          ...ctx.inputs,
          leads: scored,
          hotCount,
          threshold,
        },
      },
    };
  },
});

export const humanReviewNode = defineNode({
  id: "flux.business.humanReview",
  name: "人工确认",
  description: "把关键业务事项交给指定负责人确认，并按通过或退回继续分支",
  category: "人工协作",
  icon: "user-check",
  version: "0.1.0",
  carrier: "app",
  ports: {
    inputs: [{ id: "in", name: "待确认事项" }],
    outputs: [
      { id: "approved", name: "已确认" },
      { id: "rejected", name: "已退回" },
    ],
  },
  configSchema: {
    type: "object",
    properties: {
      reviewer: {
        type: "string",
        title: "确认人",
        default: "业务负责人",
      },
      decision: {
        type: "string",
        title: "确认方式",
        enum: ["manual", "approved", "rejected"],
        default: "manual",
      },
      note: {
        type: "string",
        title: "确认说明",
        format: "textarea",
        default: "请核对关键信息和风险，确认后继续执行后续步骤。",
      },
    },
  },
  async execute(ctx) {
    const { reviewer = "业务负责人", decision = "approved", note = "" } =
      ctx.config as Record<string, string>;
    const normalizedDecision = decision === "rejected" ? "rejected" : "approved";
    const approval = {
      reviewer,
      status: normalizedDecision,
      note,
      reviewedAt: new Date().toISOString(),
    };
    ctx.log("info", `人工确认：${reviewer} ${approval.status === "approved" ? "已通过" : "已退回"}`);
    return {
      outputs: {
        [approval.status === "approved" ? "approved" : "rejected"]: {
          ...ctx.inputs,
          approval,
        },
      },
    };
  },
});

export const crmArchiveNode = defineNode({
  id: "flux.business.crmArchive",
  name: "写入客户池",
  description: "按去重键把确认后的线索归档到客户表或 CRM",
  category: "客户管理",
  icon: "table",
  version: "0.1.0",
  carrier: "app",
  ports: {
    inputs: [{ id: "in", name: "确认结果" }],
    outputs: [{ id: "out", name: "归档结果" }],
  },
  configSchema: {
    type: "object",
    properties: {
      target: {
        type: "string",
        title: "目标客户池",
        default: "CRM / 高价值线索池",
      },
      dedupeKey: {
        type: "string",
        title: "去重字段",
        default: "company + name",
      },
    },
  },
  async execute(ctx) {
    const { target = "CRM / 高价值线索池", dedupeKey = "company + name" } =
      ctx.config as Record<string, string>;
    const leads = getInputLeads(ctx.inputs);
    ctx.log("info", `写入客户池：${target}，${leads.length} 条线索`);
    return {
      outputs: {
        out: {
          ...ctx.inputs,
          archive: {
            target,
            dedupeKey,
            archivedCount: leads.length,
            archivedAt: new Date().toISOString(),
          },
        },
      },
    };
  },
});

export const ownerNotifyNode = defineNode({
  id: "flux.business.notifyOwner",
  name: "通知负责人",
  description: "把归档结果和跟进要求发送给销售负责人",
  category: "团队通知",
  icon: "send",
  version: "0.1.0",
  carrier: "app",
  ports: {
    inputs: [{ id: "in", name: "归档结果" }],
    outputs: [{ id: "out", name: "通知结果" }],
  },
  configSchema: {
    type: "object",
    properties: {
      channel: {
        type: "string",
        title: "通知渠道",
        enum: ["企业微信", "飞书", "Slack", "邮件"],
        default: "企业微信",
      },
      message: {
        type: "string",
        title: "通知内容",
        format: "textarea",
        default: "请在今天 18:00 前跟进高价值线索，并在客户池更新处理结果。",
      },
      retryTimes: {
        type: "number",
        title: "失败重试次数",
        default: 2,
      },
      fallbackOwner: {
        type: "string",
        title: "异常负责人",
        default: "销售运营",
      },
    },
  },
  async execute(ctx) {
    const config = ctx.config as {
      channel?: string;
      message?: string;
      retryTimes?: number;
      fallbackOwner?: string;
    };
    const channel = config.channel ?? "企业微信";
    const retryTimes = Math.max(0, Math.trunc(Number(config.retryTimes ?? 2)));
    ctx.log(
      "info",
      `已通过${channel}通知负责人；失败将重试 ${retryTimes} 次后升级给 ${config.fallbackOwner ?? "销售运营"}`,
    );
    return {
      outputs: {
        out: {
          ...ctx.inputs,
          notification: {
            channel,
            message: config.message ?? "",
            retryTimes,
            fallbackOwner: config.fallbackOwner ?? "销售运营",
            sentAt: new Date().toISOString(),
          },
        },
      },
    };
  },
});

export const businessNodes = [
  leadIntakeNode,
  leadScoreNode,
  humanReviewNode,
  crmArchiveNode,
  ownerNotifyNode,
];
