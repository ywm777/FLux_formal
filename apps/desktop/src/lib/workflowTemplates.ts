export type WorkflowTemplateId =
  | "customer-lead-processing"
  | "support-ticket-triage"
  | "purchase-approval"
  | "ai-content-draft"
  | "daily-brief"
  | "priority-router"
  | "json-formatter"
  | "public-json-formats";

export interface WorkflowTemplateNode {
  key: string;
  type: string;
  position: { x: number; y: number };
  label?: string;
  config?: Record<string, unknown>;
}

export interface WorkflowTemplateEdge {
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
}

export interface WorkflowTemplate {
  id: WorkflowTemplateId;
  title: string;
  category: string;
  summary: string;
  outcome: string;
  accent: string;
  icon: "sparkles" | "calendar" | "branch" | "users" | "headset" | "clipboard-check";
  nodes: WorkflowTemplateNode[];
  edges: WorkflowTemplateEdge[];
}

export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  {
    id: "customer-lead-processing",
    title: "客户线索处理",
    category: "销售运营",
    summary: "接收线索、AI 评分、人工确认、写入客户池，并通知负责人跟进。",
    outcome: "5 个节点 · 人工确认 · 异常重试",
    accent: "var(--carrier-ai)",
    icon: "users",
    nodes: [
      {
        key: "intake",
        type: "flux.business.leadIntake",
        position: { x: 40, y: 240 },
        label: "接收官网线索",
        config: {
          sourceName: "官网表单 / 活动名单",
          leads: JSON.stringify(
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
      {
        key: "score",
        type: "flux.business.leadScore",
        position: { x: 390, y: 240 },
        label: "AI 判断优先级",
        config: {
          rule: "综合预算、需求明确度、紧急程度和来源可信度，筛出销售当天必须跟进的线索。",
          hotThreshold: 70,
          fallbackOwner: "销售运营",
        },
      },
      {
        key: "review",
        type: "flux.business.humanReview",
        position: { x: 740, y: 240 },
        label: "主管人工确认",
        config: {
          reviewer: "销售主管",
          decision: "manual",
          note: "高价值线索进入客户池，并通知负责人当天跟进。",
        },
      },
      {
        key: "archive",
        type: "flux.business.crmArchive",
        position: { x: 1100, y: 130 },
        label: "写入高价值客户池",
        config: {
          target: "CRM / 高价值线索池",
          dedupeKey: "company + name",
        },
      },
      {
        key: "notify",
        type: "flux.business.notifyOwner",
        position: { x: 1100, y: 380 },
        label: "通知负责人跟进",
        config: {
          channel: "企业微信",
          message: "请在今天 18:00 前跟进高价值线索，并在客户池更新处理结果。",
          retryTimes: 2,
          fallbackOwner: "销售运营",
        },
      },
    ],
    edges: [
      { source: "intake", target: "score" },
      { source: "score", target: "review" },
      { source: "review", target: "archive", sourceHandle: "approved" },
      { source: "archive", target: "notify" },
    ],
  },
  {
    id: "support-ticket-triage",
    title: "客户工单分诊",
    category: "客户支持",
    summary: "接收客户问题、AI 判断紧急程度、主管确认、生成回复并归档通知。",
    outcome: "6 个节点 · SLA 分流 · 人工接管",
    accent: "var(--carrier-app)",
    icon: "headset",
    nodes: [
      {
        key: "intake",
        type: "flux.support.caseIntake",
        position: { x: 60, y: 240 },
        label: "接收客户问题",
        config: {
          source: "客服表单 / 企业微信",
          ticket: JSON.stringify(
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
      {
        key: "triage",
        type: "flux.support.caseTriage",
        position: { x: 410, y: 240 },
        label: "AI 判断优先级与 SLA",
        config: {
          urgentKeywords: "无法登录,宕机,数据泄露,支付失败,全部用户,生产环境",
          urgentSlaMinutes: 30,
          standardSlaMinutes: 240,
          fallbackOwner: "一线支持",
        },
      },
      {
        key: "review",
        type: "flux.business.humanReview",
        position: { x: 780, y: 70 },
        label: "高级支持确认接管",
        config: {
          reviewer: "支持主管",
          decision: "manual",
          note: "确认影响范围、负责人和首次响应口径。",
        },
      },
      {
        key: "reply",
        type: "flux.support.replyDraft",
        position: { x: 780, y: 430 },
        label: "生成客户回复",
        config: { tone: "专业、明确、有同理心", includeSla: true },
      },
      {
        key: "archive",
        type: "flux.business.recordArchive",
        position: { x: 1140, y: 430 },
        label: "归档客服工单",
        config: {
          system: "客户支持中心",
          collection: "工单处理记录",
          recordKey: "ticket.id",
          retryTimes: 2,
          fallbackOwner: "支持运营",
        },
      },
      {
        key: "notify",
        type: "flux.business.teamNotify",
        position: { x: 1500, y: 430 },
        label: "通知支持团队",
        config: {
          channel: "飞书",
          recipients: "客户支持群",
          message: "工单已完成分诊并生成首次回复，请按 SLA 跟进。",
          retryTimes: 2,
          fallbackOwner: "支持运营",
        },
      },
    ],
    edges: [
      { source: "intake", target: "triage" },
      { source: "triage", target: "review", sourceHandle: "urgent" },
      { source: "triage", target: "reply", sourceHandle: "standard" },
      { source: "review", target: "reply", sourceHandle: "approved" },
      { source: "reply", target: "archive" },
      { source: "archive", target: "notify" },
    ],
  },
  {
    id: "purchase-approval",
    title: "采购申请审批",
    category: "运营审批",
    summary: "接收采购申请、检查金额与风险策略、人工审批、归档并通知申请人。",
    outcome: "5 个节点 · 策略分流 · 审批留痕",
    accent: "var(--carrier-code)",
    icon: "clipboard-check",
    nodes: [
      {
        key: "intake",
        type: "flux.operations.requestIntake",
        position: { x: 80, y: 240 },
        label: "接收采购申请",
        config: {
          source: "采购申请表",
          request: JSON.stringify(
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
      {
        key: "policy",
        type: "flux.operations.policyCheck",
        position: { x: 430, y: 240 },
        label: "检查采购审批策略",
        config: {
          amountThreshold: 50000,
          reviewRiskLevel: "medium",
          policyName: "采购与费用管理制度 V2",
        },
      },
      {
        key: "review",
        type: "flux.business.humanReview",
        position: { x: 800, y: 70 },
        label: "财务负责人审批",
        config: {
          reviewer: "财务负责人",
          decision: "manual",
          note: "核对预算科目、供应商和采购必要性。",
        },
      },
      {
        key: "archive",
        type: "flux.business.recordArchive",
        position: { x: 800, y: 430 },
        label: "归档审批记录",
        config: {
          system: "采购管理系统",
          collection: "采购审批单",
          recordKey: "request.id",
          retryTimes: 2,
          fallbackOwner: "财务运营",
        },
      },
      {
        key: "notify",
        type: "flux.business.teamNotify",
        position: { x: 1160, y: 430 },
        label: "通知申请人",
        config: {
          channel: "企业微信",
          recipients: "申请人及部门负责人",
          message: "采购申请已完成审批并归档，请查看处理结果。",
          retryTimes: 2,
          fallbackOwner: "财务运营",
        },
      },
    ],
    edges: [
      { source: "intake", target: "policy" },
      { source: "policy", target: "review", sourceHandle: "manual" },
      { source: "policy", target: "archive", sourceHandle: "automatic" },
      { source: "review", target: "archive", sourceHandle: "approved" },
      { source: "archive", target: "notify" },
    ],
  },
  {
    id: "json-formatter",
    title: "JSON 文本格式优化",
    category: "开发工具",
    summary: "粘贴 JSON 文本，经过独立格式优化节点后以 JSON 样式展示。",
    outcome: "3 个节点 · 输入 / 优化 / 展示",
    accent: "var(--carrier-data)",
    icon: "sparkles",
    nodes: [
      {
        key: "input",
        type: "flux.input.text",
        position: { x: 120, y: 220 },
        label: "输入 JSON 文本",
      },
      {
        key: "format",
        type: "flux.transform.jsonFormat",
        position: { x: 540, y: 220 },
        label: "JSON 格式优化",
        config: {
          sourcePath: "text",
          indent: 2,
          sortKeys: false,
          keyCase: "preserve",
          stringCase: "preserve",
          trimStrings: false,
          omitNull: false,
        },
      },
      {
        key: "result",
        type: "flux.output.jsonView",
        position: { x: 880, y: 220 },
        label: "JSON 展示",
        config: { sourcePath: "value" },
      },
    ],
    edges: [
      { source: "input", target: "format" },
      { source: "format", target: "result" },
    ],
  },
  {
    id: "public-json-formats",
    title: "定时 + 公共 JSON 转 XML / YAML",
    category: "开发工具",
    summary: "按计划从 JSONPlaceholder 获取公开 JSON，并行转换为 XML 与 YAML 后分别输出。",
    outcome: "7 个节点 · 定时触发 / HTTP / XML / YAML / 双输出",
    accent: "var(--carrier-data)",
    icon: "branch",
    nodes: [
      {
        key: "schedule",
        type: "flux.trigger.cron",
        position: { x: 40, y: 320 },
        label: "定时获取",
        config: { enabled: true, cron: "*/15 * * * *", timezone: "Asia/Shanghai" },
      },
      {
        key: "fetch",
        type: "flux.action.http",
        position: { x: 390, y: 320 },
        label: "获取公开 JSON",
        config: {
          method: "GET",
          url: "https://jsonplaceholder.typicode.com/posts/1",
          headers: {},
          body: "",
        },
      },
      {
        key: "parse",
        type: "flux.transform.json",
        position: { x: 740, y: 320 },
        label: "解析 JSON 对象",
        config: { mode: "parse", path: "body" },
      },
      {
        key: "xml",
        type: "flux.transform.xml",
        position: { x: 1090, y: 100 },
        label: "转换为 XML",
        config: {
          direction: "json-to-xml",
          sourcePath: "",
          indent: 2,
          preserveAttributes: true,
          declaration: true,
          rootName: "post",
        },
      },
      {
        key: "yaml",
        type: "flux.transform.yaml",
        position: { x: 1090, y: 540 },
        label: "转换为 YAML",
        config: {
          direction: "json-to-yaml",
          sourcePath: "",
          indent: 2,
        },
      },
      {
        key: "xml-output",
        type: "flux.input.text",
        position: { x: 1470, y: 100 },
        label: "XML 输出",
      },
      {
        key: "yaml-output",
        type: "flux.input.text",
        position: { x: 1470, y: 540 },
        label: "YAML 输出",
      },
    ],
    edges: [
      { source: "schedule", target: "fetch" },
      { source: "fetch", target: "parse" },
      { source: "parse", target: "xml" },
      { source: "parse", target: "yaml" },
      { source: "xml", target: "xml-output" },
      { source: "yaml", target: "yaml-output" },
    ],
  },
  {
    id: "ai-content-draft",
    title: "AI 内容起草",
    category: "内容效率",
    summary: "输入内容目标，让 AI 生成一版可继续编辑的初稿。",
    outcome: "4 个节点 · 可立即预览",
    accent: "var(--carrier-ai)",
    icon: "sparkles",
    nodes: [
      {
        key: "trigger",
        type: "flux.trigger.manual",
        position: { x: 60, y: 180 },
      },
      {
        key: "brief",
        type: "flux.data.setValue",
        position: { x: 360, y: 180 },
        label: "填写内容目标",
        config: {
          value: JSON.stringify(
            {
              topic: "介绍一个能节省重复工作的自动化方案",
              audience: "业务与运营团队",
              tone: "清晰、可信、简洁",
            },
            null,
            2,
          ),
        },
      },
      {
        key: "generate",
        type: "flux.ai.generate",
        position: { x: 660, y: 180 },
        label: "生成内容初稿",
        config: {
          prompt: "根据输入的主题、受众与语气，生成一版结构清晰的内容初稿。",
          model: "llama3",
        },
      },
      {
        key: "result",
        type: "flux.action.log",
        position: { x: 960, y: 180 },
        label: "查看初稿",
      },
    ],
    edges: [
      { source: "trigger", target: "brief" },
      { source: "brief", target: "generate" },
      { source: "generate", target: "result" },
    ],
  },
  {
    id: "daily-brief",
    title: "每日信息简报",
    category: "信息处理",
    summary: "按日拉取公开信息，解析后交给 AI 提炼重点。",
    outcome: "5 个节点 · 每天 09:00",
    accent: "var(--carrier-data)",
    icon: "calendar",
    nodes: [
      {
        key: "schedule",
        type: "flux.trigger.cron",
        position: { x: 40, y: 180 },
        label: "每天 09:00",
        config: { enabled: true, cron: "0 9 * * *", timezone: "Asia/Shanghai" },
      },
      {
        key: "fetch",
        type: "flux.action.http",
        position: { x: 340, y: 180 },
        label: "获取信息源",
        config: {
          method: "GET",
          url: "https://jsonplaceholder.typicode.com/posts?_limit=5",
          headers: {},
          body: "",
        },
      },
      {
        key: "parse",
        type: "flux.transform.json",
        position: { x: 640, y: 180 },
        label: "解析响应内容",
        config: { mode: "parse", path: "body" },
      },
      {
        key: "analyze",
        type: "flux.ai.analyze",
        position: { x: 940, y: 180 },
        label: "提炼今日重点",
        config: {
          prompt: "提炼 3 条最值得关注的信息，并给出一句话结论。",
          model: "llama3",
        },
      },
      {
        key: "result",
        type: "flux.action.log",
        position: { x: 1240, y: 180 },
        label: "保存简报",
      },
    ],
    edges: [
      { source: "schedule", target: "fetch" },
      { source: "fetch", target: "parse" },
      { source: "parse", target: "analyze" },
      { source: "analyze", target: "result" },
    ],
  },
  {
    id: "priority-router",
    title: "优先级自动分流",
    category: "业务规则",
    summary: "根据输入优先级自动进入紧急或常规处理路径。",
    outcome: "5 个节点 · 双分支",
    accent: "var(--carrier-code)",
    icon: "branch",
    nodes: [
      {
        key: "trigger",
        type: "flux.trigger.manual",
        position: { x: 60, y: 220 },
      },
      {
        key: "input",
        type: "flux.data.setValue",
        position: { x: 360, y: 220 },
        label: "输入待处理事项",
        config: {
          value: JSON.stringify(
            { title: "客户反馈需要处理", priority: "high" },
            null,
            2,
          ),
        },
      },
      {
        key: "branch",
        type: "flux.logic.condition",
        position: { x: 680, y: 220 },
        label: "判断是否紧急",
        config: { expression: 'input.priority === "high"' },
      },
      {
        key: "urgent",
        type: "flux.action.log",
        position: { x: 1040, y: 110 },
        label: "进入紧急处理",
      },
      {
        key: "normal",
        type: "flux.action.log",
        position: { x: 1040, y: 350 },
        label: "进入常规队列",
      },
    ],
    edges: [
      { source: "trigger", target: "input" },
      { source: "input", target: "branch" },
      { source: "branch", target: "urgent", sourceHandle: "true" },
      { source: "branch", target: "normal", sourceHandle: "false" },
    ],
  },
];

/**
 * 只向用户展示已经形成真实执行闭环的模板。
 * 其余定义保留用于兼容已有引用和后续重做，但不得在占位节点仍存在时公开。
 */
export const PUBLIC_WORKFLOW_TEMPLATES: WorkflowTemplate[] =
  WORKFLOW_TEMPLATES.filter(
    (template) =>
      template.id === "customer-lead-processing" ||
      template.id === "support-ticket-triage" ||
      template.id === "purchase-approval" ||
      template.id === "public-json-formats",
  );

export function getWorkflowTemplate(
  id: string,
): WorkflowTemplate | undefined {
  return WORKFLOW_TEMPLATES.find((template) => template.id === id);
}
