import {
  ERROR_INPUT_PORT_ID,
  NodeRegistry,
  builtinNodes,
  defineNode,
  type NodeDefinition,
} from "@flux/node-sdk";
import { parseGraph, type WorkflowGraph } from "@flux/workflow-schema";
import { runWorkflow, type ExecutionResult } from "./engine";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const registry = new NodeRegistry();
registry.registerAll(builtinNodes);
registry.register(
  defineNode({
    id: "scenario.seed",
    name: "场景数据",
    description: "为集成场景提供确定的业务输入",
    category: "测试",
    icon: "database",
    version: "0.1.0",
    carrier: "data",
    ports: { inputs: [], outputs: [{ id: "out", name: "数据" }] },
    configSchema: { type: "object", properties: {} },
    async execute(ctx) {
      return { outputs: { out: ctx.config.value } };
    },
  }),
);
registry.register(
  defineNode({
    id: "scenario.alwaysFail",
    name: "模拟失败步骤",
    description: "验证通用异常分支",
    category: "测试",
    icon: "triangle-alert",
    version: "0.1.0",
    carrier: "basic",
    ports: { inputs: [], outputs: [{ id: "out", name: "结果" }] },
    configSchema: { type: "object", properties: {} },
    async execute(ctx) {
      throw new Error(String(ctx.config.message ?? "模拟业务处理失败"));
    },
  }),
);
let flakyAttempts = 0;
registry.register(
  defineNode({
    id: "scenario.flakyNotify",
    name: "不稳定通知",
    description: "模拟通知渠道短暂失败后的自动重试",
    category: "测试",
    icon: "send",
    version: "0.1.0",
    carrier: "app",
    ports: {
      inputs: [{ id: "in", name: "输入" }],
      outputs: [{ id: "out", name: "通知结果" }],
    },
    configSchema: { type: "object", properties: {} },
    async execute(ctx) {
      flakyAttempts += 1;
      const failBeforeSuccess = Number(ctx.config.failBeforeSuccess ?? 0);
      if (flakyAttempts <= failBeforeSuccess) {
        throw new Error("通知渠道临时不可用");
      }
      return { outputs: { out: { ...ctx.inputs, notified: true, attempts: flakyAttempts } } };
    },
  }),
);

function node(id: string, type: string, data: Record<string, unknown> = {}) {
  const definition: NodeDefinition | undefined = registry.resolve(type);
  if (!definition) throw new Error(`场景引用了未注册节点：${type}`);
  return {
    id,
    type,
    position: { x: 0, y: 0 },
    data,
    ports: definition.ports,
  };
}

function graph(
  id: string,
  title: string,
  nodes: ReturnType<typeof node>[],
  edges: Array<{ source: string; target: string; sourcePort?: string; targetPort?: string }>,
): WorkflowGraph {
  return parseGraph({
    id,
    version: 1,
    meta: { title, tags: ["scenario", "smoke"] },
    nodes,
    edges: edges.map((edge, index) => ({ id: `${id}-e${index + 1}`, ...edge })),
  });
}

function runById(result: ExecutionResult, id: string) {
  const run = result.runs.find((item) => item.nodeId === id);
  if (!run) throw new Error(`缺少节点执行结果：${id}`);
  return run;
}

function printResult(title: string, result: ExecutionResult, detail: string) {
  const states = result.runs.map((run) => `${run.nodeId}=${run.status}`).join(" → ");
  console.log(`\n[PASS] ${title}`);
  console.log(`  状态链：${states}`);
  console.log(`  业务结果：${detail}`);
}

async function customerListScenario() {
  const workflow = graph(
    "customer-cleanup",
    "客户名单清洗",
    [
      node("source", "scenario.seed", {
        value: "name,email,city\n张三,zhang@example.com,上海\n李四,li@example.com,北京\n张三副本,zhang@example.com,上海",
      }),
      node("parse", "flux.transform.csv", { operation: "parse", header: true, delimiter: "," }),
      node("unique", "flux.data.list", { operation: "unique", fieldPath: "email" }),
      node("validate", "flux.logic.validate", {
        requiredPaths: "items",
        typeRules: '{"items":"array","count":"number"}',
      }),
    ],
    [
      { source: "source", target: "parse" },
      { source: "parse", target: "unique" },
      { source: "unique", target: "validate" },
    ],
  );
  const result = await runWorkflow(workflow, registry);
  const unique = runById(result, "unique").outputs?.out as { count: number };
  assert(result.status === "success", "客户名单清洗执行失败");
  assert(unique.count === 2, "客户邮箱去重结果不正确");
  assert("valid" in (runById(result, "validate").outputs ?? {}), "清洗结果未通过数据校验");
  printResult("客户名单清洗", result, "3 行 CSV 解析后按邮箱去重为 2 位客户，结构校验通过");
}

async function orderRoutingScenario() {
  const workflow = graph(
    "order-routing",
    "大额订单折后分流",
    [
      node("order", "scenario.seed", { value: { amount: 1280, orderId: "SO-20260713-01" } }),
      node("discount", "flux.logic.math", {
        operation: "multiply",
        leftPath: "amount",
        rightValue: 0.85,
      }),
      node("route", "flux.logic.switch", {
        sourcePath: "value",
        case1Value: "1088",
        case2Value: "0",
      }),
      node("manualReview", "flux.action.log", { message: "折后金额 1088 元，进入人工复核" }),
      node("normal", "flux.action.log", { message: "订单自动通过" }),
    ],
    [
      { source: "order", target: "discount" },
      { source: "discount", target: "route" },
      { source: "route", sourcePort: "case1", target: "manualReview" },
      { source: "route", sourcePort: "default", target: "normal" },
    ],
  );
  const processStates: string[] = [];
  const result = await runWorkflow(workflow, registry, {
    onNodeRun: (run) => processStates.push(`${run.nodeId}:${run.status}`),
  });
  assert(runById(result, "manualReview").status === "success", "大额订单没有进入人工复核分支");
  assert(runById(result, "normal").status === "skipped", "未命中分支没有被跳过");
  assert(processStates.includes("route:running"), "规则分流缺少运行中状态");
  printResult("大额订单折后分流", result, "1280 × 0.85 = 1088，人工复核执行，普通分支跳过");
}

async function apiInspectionScenario() {
  const workflow = graph(
    "api-inspection",
    "多接口健康巡检",
    [
      node("source", "scenario.seed", {
        value: { urls: ["https://service.example/health", "https://backup.example/health"] },
      }),
      node("inspect", "flux.action.httpBatch", {
        sourcePath: "urls",
        concurrency: 2,
        timeout: 1000,
      }),
      node("validate", "flux.logic.validate", {
        requiredPaths: "results,successCount,failureCount",
        typeRules: '{"results":"array","successCount":"number","failureCount":"number"}',
      }),
    ],
    [
      { source: "source", target: "inspect" },
      { source: "inspect", target: "validate" },
    ],
  );
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = String(input);
    return url.includes("backup")
      ? new Response("maintenance", { status: 503 })
      : new Response("healthy", { status: 200 });
  };
  try {
    const result = await runWorkflow(workflow, registry);
    const output = runById(result, "inspect").outputs?.out as {
      count: number;
      successCount: number;
      failureCount: number;
    };
    assert(output.count === 2 && output.successCount === 1 && output.failureCount === 1, "接口巡检汇总不正确");
    assert("valid" in (runById(result, "validate").outputs ?? {}), "巡检结果结构校验失败");
    printResult("多接口健康巡检", result, "并发请求 2 个接口：1 个健康、1 个 503，汇总与结构校验正确");
  } finally {
    globalThis.fetch = originalFetch;
  }
}

async function dailyTimestampScenario() {
  const workflow = graph(
    "daily-timestamp",
    "次日日报时间编码",
    [
      node("source", "scenario.seed", { value: { createdAt: "2026-07-13T01:30:00.000Z" } }),
      node("tomorrow", "flux.time.format", {
        sourcePath: "createdAt",
        amount: 1,
        unit: "day",
        timezone: "Asia/Shanghai",
        locale: "zh-CN",
      }),
      node("encode", "flux.transform.base64", { operation: "encode", sourcePath: "iso" }),
      node("decode", "flux.transform.base64", { operation: "decode", sourcePath: "value" }),
    ],
    [
      { source: "source", target: "tomorrow" },
      { source: "tomorrow", target: "encode" },
      { source: "encode", target: "decode" },
    ],
  );
  const result = await runWorkflow(workflow, registry);
  const decoded = runById(result, "decode").outputs?.out as { value: string };
  assert(decoded.value === "2026-07-14T01:30:00.000Z", "次日时间编码往返不正确");
  printResult("次日日报时间编码", result, "生成次日 ISO 时间，经 Base64 编码和解码后保持一致");
}

async function textJsonScenario() {
  const workflow = graph(
    "text-json",
    "文本 JSON 格式优化与展示",
    [
      node("input", "flux.input.text", { text: '{"user":{"name":"Flux","id":7},"active":true}' }),
      node("format", "flux.transform.jsonFormat", { sourcePath: "text", indent: 2, sortKeys: true }),
      node("display", "flux.output.jsonView", { sourcePath: "value" }),
    ],
    [
      { source: "input", target: "format" },
      { source: "format", target: "display" },
    ],
  );
  const result = await runWorkflow(workflow, registry);
  const output = runById(result, "display").outputs?.out as { text: string };
  assert(result.status === "success", "文本 JSON 格式优化执行失败");
  assert(output.text.includes("\n  \"active\": true") && output.text.includes("\n  \"user\": {"), "格式化结果不正确");
  printResult("文本 JSON 格式优化与展示", result, "界面输入 JSON 文本，经独立优化节点美化，最终以 JSON 样式展示");
}

async function upstreamTextRelayScenario() {
  const workflow = graph(
    "upstream-text-relay",
    "上游文本接收与继续处理",
    [
      node("source", "scenario.seed", { value: { text: "upstream text" } }),
      node("relay", "flux.input.text", { text: "备用文本" }),
      node("uppercase", "flux.text.transform", { operation: "uppercase", sourcePath: "text" }),
    ],
    [
      { source: "source", target: "relay" },
      { source: "relay", target: "uppercase" },
    ],
  );
  const result = await runWorkflow(workflow, registry);
  const relay = runById(result, "relay").outputs?.out as { text: string; source: string };
  const output = runById(result, "uppercase").outputs?.out as { value: string };
  assert(result.status === "success", "上游文本接收流程执行失败");
  assert(relay.source === "upstream", "文本节点没有优先采用上游文本");
  assert(relay.text === "upstream text", "文本节点改变了上游文本内容");
  assert(output.value === "UPSTREAM TEXT", "文本节点未把上游文本传给后续步骤");
  printResult("上游文本接收与继续处理", result, "前序节点产出文本，文本节点接收后交给后续文本处理节点");
}

async function capturedErrorTextScenario() {
  const unhandled = graph(
    "unhandled-error",
    "未捕获异常",
    [node("failure", "scenario.alwaysFail", { message: "库存接口不可用" })],
    [],
  );
  const unhandledResult = await runWorkflow(unhandled, registry);
  assert(unhandledResult.status === "failed", "未连接异常捕获时仍应终止流程");

  const workflow = graph(
    "captured-error-text",
    "异常捕获并展示文本",
    [
      node("failure", "scenario.alwaysFail", {
        message: "库存接口不可用",
        _label: "读取库存",
      }),
      node("normal", "flux.text.transform", { operation: "trim" }),
      node("catch", "flux.flow.catchError", { format: "detailed", prefix: "流程异常" }),
      node("text", "flux.input.text", { text: "" }),
    ],
    [
      { source: "failure", target: "normal" },
      {
        source: "failure",
        sourcePort: "out",
        target: "catch",
        targetPort: ERROR_INPUT_PORT_ID,
      },
      { source: "catch", target: "text" },
    ],
  );
  const processStates: string[] = [];
  const result = await runWorkflow(workflow, registry, {
    onNodeRun: (run) => processStates.push(`${run.nodeId}:${run.status}`),
  });
  const captured = runById(result, "catch").outputs?.out as {
    captured: boolean;
    nodeName: string;
    message: string;
    text: string;
  };
  const displayed = runById(result, "text").outputs?.out as {
    source: string;
    text: string;
  };

  assert(result.status === "success", "已捕获异常的流程应继续执行");
  assert(runById(result, "failure").status === "failed", "原始失败节点状态应保留");
  assert(runById(result, "normal").status === "skipped", "失败节点的正常分支不应继续执行");
  assert(captured.captured && captured.nodeName === "读取库存", "异常捕获节点没有保留来源节点");
  assert(captured.message === "库存接口不可用", "异常捕获节点改变了原始错误信息");
  assert(displayed.source === "upstream" && displayed.text === captured.text, "文本节点没有展示捕获结果");
  assert(processStates.includes("catch:running") && processStates.includes("text:running"), "捕获后没有继续执行异常分支");

  const multipleFailures = graph(
    "captured-multiple-errors",
    "汇总多个并行异常",
    [
      node("inventory-failure", "scenario.alwaysFail", {
        message: "库存接口不可用",
        _label: "读取库存",
      }),
      node("payment-failure", "scenario.alwaysFail", {
        message: "支付接口超时",
        _label: "提交支付",
      }),
      node("catch-all", "flux.flow.catchError", { format: "detailed", prefix: "流程异常" }),
    ],
    [
      {
        source: "inventory-failure",
        sourcePort: "out",
        target: "catch-all",
        targetPort: ERROR_INPUT_PORT_ID,
      },
      {
        source: "payment-failure",
        sourcePort: "out",
        target: "catch-all",
        targetPort: ERROR_INPUT_PORT_ID,
      },
    ],
  );
  const multipleResult = await runWorkflow(multipleFailures, registry);
  const multipleCaptured = runById(multipleResult, "catch-all").outputs?.out as {
    count: number;
    errors: Array<{ nodeName: string; message: string }>;
    text: string;
  };
  assert(multipleResult.status === "success", "多个已捕获异常不应终止整个流程");
  assert(runById(multipleResult, "inventory-failure").status === "failed", "第一个失败节点状态应保留");
  assert(runById(multipleResult, "payment-failure").status === "failed", "第二个失败节点状态应保留");
  assert(multipleCaptured.count === 2 && multipleCaptured.errors.length === 2, "异常捕获节点没有保留全部上游异常");
  assert(
    multipleCaptured.errors[0]?.message === "库存接口不可用" &&
      multipleCaptured.errors[1]?.message === "支付接口超时",
    "多个上游异常的内容或顺序不正确",
  );
  assert(
    multipleCaptured.text.includes("读取库存：库存接口不可用") &&
      multipleCaptured.text.includes("提交支付：支付接口超时"),
    "异常汇总文本没有包含全部失败节点",
  );
  printResult("异常捕获并展示文本", result, "任意节点失败后进入通用异常分支，错误由文本节点直接展示");
  printResult("汇总多个并行异常", multipleResult, "同一个异常捕获节点接收多个上游，保留并汇总全部错误");
}

async function leadApprovalScenario() {
  const pendingWorkflow = graph(
    "lead-approval-pending",
    "客户线索人工确认",
    [
      node("intake", "flux.business.leadIntake", {
        sourceName: "官网表单",
        leads: JSON.stringify([
          {
            name: "林青",
            company: "星河制造",
            channel: "官网表单",
            need: "希望两周内完成销售线索自动分配",
            budget: 120000,
            urgency: "high",
          },
        ]),
      }),
      node("score", "flux.business.leadScore", { hotThreshold: 70 }),
      node("review", "flux.business.humanReview", {
        reviewer: "销售主管",
        decision: "manual",
      }),
      node("archive", "flux.business.crmArchive", { target: "CRM / 高价值线索池" }),
      node("notify", "flux.business.notifyOwner", { channel: "企业微信", retryTimes: 2 }),
    ],
    [
      { source: "intake", target: "score" },
      { source: "score", target: "review" },
      { source: "review", sourcePort: "approved", target: "archive" },
      { source: "archive", target: "notify" },
    ],
  );
  const processStates: string[] = [];
  const paused = await runWorkflow(pendingWorkflow, registry, {
    onNodeRun: (run) => processStates.push(`${run.nodeId}:${run.status}`),
  });
  assert(paused.status === "paused", "人工确认节点应暂停执行");
  assert(paused.pausedNodeId === "review", "暂停节点应指向人工确认节点");
  assert(processStates.includes("review:running"), "人工确认节点应保持运行中状态等待用户");

  const approvedWorkflow = graph(
    "lead-approval-approved",
    "客户线索人工确认通过",
    pendingWorkflow.nodes.map((item) =>
      item.id === "review"
        ? { ...item, data: { ...item.data, decision: "approved" } }
        : item,
    ),
    pendingWorkflow.edges,
  );
  const approved = await runWorkflow(approvedWorkflow, registry);
  assert(approved.status === "success", "确认通过后应继续归档和通知");
  assert(runById(approved, "archive").status === "success", "确认通过后客户池归档未执行");
  assert(runById(approved, "notify").status === "success", "确认通过后负责人通知未执行");
  printResult("客户线索人工确认", approved, "运行暂停等待销售主管确认，通过后继续写入客户池并通知负责人");
}

async function supportTriageScenario() {
  const pendingWorkflow = graph(
    "support-triage-pending",
    "客户工单紧急分诊",
    [
      node("intake", "flux.support.caseIntake", {
        source: "客服表单",
        ticket: JSON.stringify({
          id: "CASE-1",
          customer: "远海科技",
          subject: "生产环境无法登录",
          message: "全部用户无法登录，业务已中断。",
          customerTier: "enterprise",
        }),
      }),
      node("triage", "flux.support.caseTriage", {
        urgentKeywords: "无法登录,全部用户,业务已中断",
        urgentSlaMinutes: 30,
      }),
      node("review", "flux.business.humanReview", {
        reviewer: "支持主管",
        decision: "manual",
      }),
      node("reply", "flux.support.replyDraft", { includeSla: true }),
      node("archive", "flux.business.recordArchive", {
        system: "客户支持中心",
        collection: "工单处理记录",
      }),
      node("notify", "flux.business.teamNotify", {
        channel: "飞书",
        recipients: "客户支持群",
        retryTimes: 2,
      }),
    ],
    [
      { source: "intake", target: "triage" },
      { source: "triage", sourcePort: "urgent", target: "review" },
      { source: "triage", sourcePort: "standard", target: "reply" },
      { source: "review", sourcePort: "approved", target: "reply" },
      { source: "reply", target: "archive" },
      { source: "archive", target: "notify" },
    ],
  );
  const paused = await runWorkflow(pendingWorkflow, registry);
  assert(paused.status === "paused" && paused.pausedNodeId === "review", "紧急工单应暂停等待支持主管确认");

  const approvedWorkflow = graph(
    "support-triage-approved",
    "客户工单紧急分诊通过",
    pendingWorkflow.nodes.map((item) =>
      item.id === "review"
        ? { ...item, data: { ...item.data, decision: "approved" } }
        : item,
    ),
    pendingWorkflow.edges,
  );
  const approved = await runWorkflow(approvedWorkflow, registry);
  const reply = runById(approved, "reply").outputs?.out as { responseDraft?: string };
  assert(approved.status === "success", "支持主管确认后工单流程应继续完成");
  assert(reply.responseDraft?.includes("30 分钟"), "紧急工单回复应带响应 SLA");
  assert(runById(approved, "notify").status === "success", "工单处理结果未通知支持团队");
  printResult("客户工单紧急分诊", approved, "AI 识别紧急工单，主管接管后生成带 SLA 的回复并完成归档通知");
}

async function purchasePolicyScenario() {
  const workflow = graph(
    "purchase-policy",
    "采购申请策略分流",
    [
      node("intake", "flux.operations.requestIntake", {
        source: "采购申请表",
        request: JSON.stringify({
          id: "PO-LOW-1",
          requester: "陈序",
          department: "市场部",
          type: "办公用品",
          amount: 1200,
          reason: "补充季度会议耗材",
          riskLevel: "low",
        }),
      }),
      node("policy", "flux.operations.policyCheck", {
        amountThreshold: 50000,
        reviewRiskLevel: "medium",
      }),
      node("review", "flux.business.humanReview", {
        reviewer: "财务负责人",
        decision: "manual",
      }),
      node("archive", "flux.business.recordArchive", {
        system: "采购管理系统",
        collection: "采购审批单",
      }),
      node("notify", "flux.business.teamNotify", {
        channel: "企业微信",
        recipients: "申请人",
      }),
    ],
    [
      { source: "intake", target: "policy" },
      { source: "policy", sourcePort: "manual", target: "review" },
      { source: "policy", sourcePort: "automatic", target: "archive" },
      { source: "review", sourcePort: "approved", target: "archive" },
      { source: "archive", target: "notify" },
    ],
  );
  const result = await runWorkflow(workflow, registry);
  assert(result.status === "success", "低风险采购申请应自动完成");
  assert(runById(result, "review").status === "skipped", "低风险采购不应进入人工审批");
  assert(runById(result, "archive").status === "success", "自动通过的采购申请未归档");
  assert(runById(result, "notify").status === "success", "采购申请结果未通知申请人");
  printResult("采购申请策略分流", result, "低金额低风险申请自动通过策略检查，跳过人工审批并完成归档通知");
}

async function retryEscalationScenario() {
  flakyAttempts = 0;
  const workflow = graph(
    "retry-notification",
    "通知失败自动重试",
    [
      node("source", "scenario.seed", { value: { owner: "销售运营", message: "请跟进高价值线索" } }),
      node("notify", "scenario.flakyNotify", {
        failBeforeSuccess: 1,
        retryTimes: 2,
        fallbackOwner: "销售运营",
      }),
    ],
    [{ source: "source", target: "notify" }],
  );
  const result = await runWorkflow(workflow, registry);
  const output = runById(result, "notify").outputs?.out as { notified: boolean; attempts: number };
  assert(result.status === "success", "通知临时失败后应自动重试成功");
  assert(output.notified === true && output.attempts === 2, "通知重试次数不正确");
  assert(
    result.logs.some((log) => log.level === "warn" && log.message.includes("正在重试 1/2")),
    "缺少重试日志",
  );
  printResult("通知失败自动重试", result, "通知渠道首次失败后自动重试，第 2 次成功并保留重试日志");
}

async function main() {
  await customerListScenario();
  await orderRoutingScenario();
  await apiInspectionScenario();
  await dailyTimestampScenario();
  await textJsonScenario();
  await upstreamTextRelayScenario();
  await capturedErrorTextScenario();
  await leadApprovalScenario();
  await supportTriageScenario();
  await purchasePolicyScenario();
  await retryEscalationScenario();
  console.log("\n12/12 个真实节点场景全部跑通。\n");
}

void main();
