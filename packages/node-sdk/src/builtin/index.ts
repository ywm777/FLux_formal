import { defineNode } from "../registry.js";
import type { NodeDefinition } from "../types.js";
import { evaluateCondition } from "./expression.js";

/** 1. 手动触发：工作流入口 */
export const manualTriggerNode = defineNode({
  id: "flux.trigger.manual",
  name: "手动触发",
  category: "触发器",
  icon: "zap",
  version: "0.1.0",
  carrier: "trigger",
  ports: { inputs: [], outputs: [{ id: "out", name: "开始" }] },
  configSchema: { type: "object", properties: {} },
  async execute() {
    return { outputs: { out: { startedAt: new Date().toISOString() } } };
  },
});

/** 1b. 定时触发（Cron）：由桌面端本地调度器按计划唤醒已保存的工作流；
 * 节点被执行时发出包含实际触发时间的“开始”信号。 */
export const cronTriggerNode = defineNode({
  id: "flux.trigger.cron",
  name: "定时触发",
  category: "触发器",
  icon: "clock",
  version: "0.1.0",
  carrier: "trigger",
  ports: { inputs: [], outputs: [{ id: "out", name: "开始" }] },
  configSchema: {
    type: "object",
    required: ["cron"],
    properties: {
      enabled: {
        type: "boolean",
        title: "启用定时执行",
        description: "关闭后保留计划设置，但不会自动触发工作流",
        default: true,
      },
      cron: {
        type: "string",
        title: "Cron 表达式（高级）",
        description: "画布中可直接选择执行频率和时间；仅复杂计划需要填写标准 5 段 Cron",
        default: "0 9 * * *",
      },
      timezone: {
        type: "string",
        title: "时区",
        description: "例如 Asia/Shanghai 表示北京时间",
        default: "Asia/Shanghai",
      },
    },
  },
  async execute(ctx) {
    const { enabled = true, cron = "0 9 * * *", timezone = "Asia/Shanghai" } = ctx.config as {
      enabled?: boolean;
      cron?: string;
      timezone?: string;
    };
    ctx.log("info", `定时触发 (cron: ${cron}, tz: ${timezone}, enabled: ${enabled})`);
    return {
      outputs: {
        out: { triggeredAt: new Date().toISOString(), cron, timezone, enabled },
      },
    };
  },
});

/** 2. HTTP 请求 */
export const httpRequestNode = defineNode({
  id: "flux.action.http",
  name: "HTTP 请求",
  category: "网络",
  icon: "globe",
  version: "0.1.0",
  carrier: "basic",
  ports: {
    inputs: [{ id: "in", name: "输入" }],
    outputs: [{ id: "out", name: "响应" }],
  },
  configSchema: {
    type: "object",
    required: ["url"],
    properties: {
      method: {
        type: "string",
        title: "方法",
        enum: ["GET", "POST", "PUT", "PATCH", "DELETE"],
        default: "GET",
      },
      url: { type: "string", title: "URL" },
      headers: { type: "object", title: "请求头" },
      body: { type: "string", title: "请求体", format: "textarea" },
    },
  },
  async execute(ctx) {
    const { method = "GET", url, headers, body } = ctx.config as {
      method?: string;
      url: string;
      headers?: Record<string, string>;
      body?: string;
    };
    ctx.log("info", `HTTP ${method} ${url}`);
    const res = await fetch(url, {
      method,
      headers: headers as Record<string, string> | undefined,
      body: method === "GET" || method === "DELETE" ? undefined : body,
      signal: ctx.signal,
    });
    const text = await res.text();
    return { outputs: { out: { status: res.status, body: text } } };
  },
});

/** 3. 延时 */
export const delayNode = defineNode({
  id: "flux.action.delay",
  name: "延时",
  category: "流程",
  icon: "clock",
  version: "0.1.0",
  carrier: "basic",
  ports: {
    inputs: [{ id: "in", name: "输入" }],
    outputs: [{ id: "out", name: "输出" }],
  },
  configSchema: {
    type: "object",
    properties: {
      ms: { type: "number", title: "延时(毫秒)", default: 1000 },
    },
  },
  async execute(ctx) {
    const ms = Number((ctx.config as { ms?: number }).ms ?? 1000);
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, ms);
      ctx.signal.addEventListener("abort", () => {
        clearTimeout(timer);
        reject(new Error("已取消"));
      });
    });
    return { outputs: { out: ctx.inputs } };
  },
});

/** 4. 条件分支：表达式为真走 true 出口，否则 false */
export const conditionNode = defineNode({
  id: "flux.logic.condition",
  name: "条件分支",
  category: "流程",
  icon: "git-branch",
  version: "0.1.0",
  carrier: "basic",
  ports: {
    inputs: [{ id: "in", name: "输入" }],
    outputs: [
      { id: "true", name: "真" },
      { id: "false", name: "假" },
    ],
  },
  configSchema: {
    type: "object",
    required: ["expression"],
    properties: {
      expression: {
        type: "string",
        title: "条件表达式",
        description: "可引用 input，例如 input.status === 200",
        format: "code",
      },
    },
  },
  async execute(ctx) {
    const expr = String((ctx.config as { expression?: string }).expression ?? "false");
    try {
      const result = evaluateCondition(expr, ctx.inputs);
      return result
        ? { outputs: { true: ctx.inputs } }
        : { outputs: { false: ctx.inputs } };
    } catch (err) {
      const message = `条件表达式求值失败: ${(err as Error).message}`;
      ctx.log("error", message);
      throw new Error(message);
    }
  },
});

/** 5. 记录结果 */
export const logNode = defineNode({
  id: "flux.action.log",
  name: "记录结果",
  category: "输出",
  icon: "file-text",
  version: "0.1.0",
  carrier: "basic",
  ports: {
    inputs: [{ id: "in", name: "输入" }],
    outputs: [{ id: "out", name: "输出" }],
  },
  configSchema: {
    type: "object",
    properties: {
      message: { type: "string", title: "消息模板", format: "textarea" },
    },
  },
  async execute(ctx) {
    const message =
      (ctx.config as { message?: string }).message ??
      JSON.stringify(ctx.inputs);
    ctx.log("info", message);
    return { outputs: { out: ctx.inputs } };
  },
});

import { aiAnalyzeNode, aiGenerateNode, aiNodes } from "./ai.js";
import { collectionNodes } from "./collections.js";
import { dataNodes } from "./data.js";
import { integrationNodes } from "./integrations.js";
import { logicUtilityNodes } from "./logic-utilities.js";
import {
  errorCaptureNode,
  jsonDisplayNode,
  jsonFormatNode,
  productivityNodes,
  textConstantNode,
  textInputNode,
} from "./productivity.js";
import {
  structuredFormatNodes,
  xmlConvertNode,
  yamlConvertNode,
} from "./structured-formats.js";
import { textNodes } from "./text.js";
import { businessNodes } from "./business.js";
import { customerSupportNodes } from "./customer-support.js";
import { operationsNodes } from "./operations.js";
import { sharedBusinessNodes } from "./shared-business.js";

const scenarioNodes: NodeDefinition[] = [
  ...businessNodes,
  ...customerSupportNodes,
  ...operationsNodes,
  ...sharedBusinessNodes,
];

/**
 * 当前对用户开放的内置能力目录。
 *
 * `builtinNodes` 是执行时注册表，必须继续包含历史节点，确保已有工作流可读取、
 * 可执行；`catalogNodes` 只控制新建节点入口。两者分离后，整理能力目录不会破坏
 * 已保存的工作流。
 */
export const catalogNodes: NodeDefinition[] = [
  textInputNode,
  textConstantNode,
  jsonFormatNode,
  xmlConvertNode,
  yamlConvertNode,
  httpRequestNode,
  aiAnalyzeNode,
  aiGenerateNode,
  conditionNode,
  delayNode,
  errorCaptureNode,
  jsonDisplayNode,
  manualTriggerNode,
  cronTriggerNode,
  logNode,
];

export const builtinNodes: NodeDefinition[] = [
  manualTriggerNode,
  cronTriggerNode,
  httpRequestNode,
  delayNode,
  conditionNode,
  logNode,
  ...dataNodes,
  ...aiNodes,
  ...textNodes,
  ...collectionNodes,
  ...logicUtilityNodes,
  ...integrationNodes,
  ...structuredFormatNodes,
  ...productivityNodes,
  ...scenarioNodes,
];

export { customCodeNode } from "./custom-code.js";
export {
  setValueNode,
  templateNode,
  extractNode,
  jsonNode,
  dataNodes,
} from "./data.js";
export {
  textTransformNode,
  regexExtractNode,
  base64Node,
  textNodes,
} from "./text.js";
export {
  objectMergeNode,
  listTransformNode,
  csvNode,
  collectionNodes,
} from "./collections.js";
export {
  mathNode,
  switchNode,
  validateNode,
  logicUtilityNodes,
} from "./logic-utilities.js";
export {
  dateTimeNode,
  urlBuilderNode,
  httpBatchNode,
  integrationNodes,
} from "./integrations.js";
export {
  textConstantNode,
  textInputNode,
  errorCaptureNode,
  jsonFormatNode,
  jsonDisplayNode,
  productivityNodes,
} from "./productivity.js";
export {
  xmlConvertNode,
  yamlConvertNode,
  structuredFormatNodes,
} from "./structured-formats.js";
export {
  leadIntakeNode,
  leadScoreNode,
  humanReviewNode,
  crmArchiveNode,
  ownerNotifyNode,
  businessNodes,
} from "./business.js";
export {
  caseIntakeNode,
  caseTriageNode,
  supportReplyDraftNode,
  customerSupportNodes,
} from "./customer-support.js";
export {
  requestIntakeNode,
  policyCheckNode,
  operationsNodes,
} from "./operations.js";
export {
  recordArchiveNode,
  teamNotifyNode,
  sharedBusinessNodes,
} from "./shared-business.js";
