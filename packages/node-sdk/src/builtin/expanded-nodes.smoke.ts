import type { NodeContext, NodeDefinition } from "../types.js";
import {
  base64Node,
  builtinNodes,
  catalogNodes,
  textConstantNode,
  textInputNode,
  csvNode,
  dateTimeNode,
  jsonDisplayNode,
  httpBatchNode,
  leadIntakeNode,
  leadScoreNode,
  listTransformNode,
  mathNode,
  objectMergeNode,
  crmArchiveNode,
  caseIntakeNode,
  caseTriageNode,
  humanReviewNode,
  jsonFormatNode,
  xmlConvertNode,
  yamlConvertNode,
  ownerNotifyNode,
  policyCheckNode,
  recordArchiveNode,
  regexExtractNode,
  requestIntakeNode,
  supportReplyDraftNode,
  switchNode,
  textTransformNode,
  teamNotifyNode,
  urlBuilderNode,
  validateNode,
} from "./index.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function run(
  node: NodeDefinition,
  config: Record<string, unknown>,
  inputs: Record<string, unknown>,
) {
  const context: NodeContext = {
    nodeId: node.id,
    config,
    inputs,
    signal: new AbortController().signal,
    log: () => undefined,
    invoke: async () => undefined,
  };
  return node.execute(context);
}

const newIds = [
  "flux.text.transform",
  "flux.text.regex",
  "flux.transform.base64",
  "flux.data.merge",
  "flux.data.list",
  "flux.transform.csv",
  "flux.logic.math",
  "flux.logic.switch",
  "flux.logic.validate",
  "flux.time.format",
  "flux.network.url",
  "flux.action.httpBatch",
  "flux.input.text",
  "flux.source.textConstant",
  "flux.flow.catchError",
  "flux.transform.jsonFormat",
  "flux.transform.xml",
  "flux.transform.yaml",
  "flux.output.jsonView",
  "flux.business.leadIntake",
  "flux.business.leadScore",
  "flux.business.humanReview",
  "flux.business.crmArchive",
  "flux.business.notifyOwner",
  "flux.support.caseIntake",
  "flux.support.caseTriage",
  "flux.support.replyDraft",
  "flux.operations.requestIntake",
  "flux.operations.policyCheck",
  "flux.business.recordArchive",
  "flux.business.teamNotify",
];
for (const id of newIds) {
  const definition = builtinNodes.find((node) => node.id === id);
  assert(definition, `${id} 未注册`);
  assert(definition.description, `${id} 缺少能力说明`);
}

const catalogIds = catalogNodes.map((node) => node.id);
assert(catalogIds.length >= 10, "能力目录应开放精简后的通用节点");
assert(catalogIds[0] === "flux.input.text", "能力目录应把最常用的文本节点放在首位");
assert(catalogIds[1] === "flux.source.textConstant", "文本常量应紧随文本节点");
assert(catalogIds[2] === "flux.transform.jsonFormat", "JSON 转换应排在常用节点前列");
assert(catalogIds[3] === "flux.transform.xml", "XML 转换应排在常用节点前列");
assert(catalogIds[4] === "flux.transform.yaml", "YAML 转换应排在常用节点前列");
assert(!catalogIds.some((id) => id.startsWith("flux.business.")), "业务场景节点不应占用通用能力目录");
assert(!catalogIds.some((id) => id.startsWith("flux.support.")), "客服场景节点不应占用通用能力目录");
assert(!catalogIds.some((id) => id.startsWith("flux.operations.")), "运营场景节点不应占用通用能力目录");
assert(catalogIds.includes("flux.flow.catchError"), "能力目录应包含通用异常捕获");
assert(catalogIds.includes("flux.output.jsonView"), "能力目录仍应保留 JSON 展示");

const parsedXml = await run(
  xmlConvertNode,
  { direction: "xml-to-json", sourcePath: "text", indent: 2, preserveAttributes: true },
  { text: '<order id="A-7"><total>12.50</total></order>' },
);
const parsedXmlOutput = parsedXml.outputs.out as { text: string; data: { order: Record<string, unknown> } };
assert(parsedXmlOutput.data.order["@_id"] === "A-7", "XML 转 JSON 应保留属性");
assert(parsedXmlOutput.data.order.total === "12.50", "XML 转 JSON 不应擅自改变文本数值精度");

const rebuiltXml = await run(
  xmlConvertNode,
  { direction: "json-to-xml", sourcePath: "data", indent: 2, preserveAttributes: true, declaration: false },
  parsedXml.outputs.out as Record<string, unknown>,
);
assert((rebuiltXml.outputs.out as { text: string }).text.includes('<order id="A-7">'), "JSON 转 XML 应还原根元素和属性");

const wrappedBusinessXml = await run(
  xmlConvertNode,
  { direction: "json-to-xml", sourcePath: "text", rootName: "message", declaration: false },
  { text: '{"head":{"source":"MES"},"body":[{"id":1},{"id":2}]}' },
);
const wrappedBusinessXmlText = (wrappedBusinessXml.outputs.out as { text: string }).text;
assert(wrappedBusinessXmlText.includes("<message>"), "多顶层 JSON 转 XML 应自动补充可配置根元素");
assert(wrappedBusinessXmlText.includes("<head>") && wrappedBusinessXmlText.includes("<body>"), "自动补根不得丢失业务字段");

const parsedYaml = await run(
  yamlConvertNode,
  { direction: "yaml-to-json", sourcePath: "text", indent: 2 },
  { text: "name: Flux\nitems:\n  - text\n  - xml\n" },
);
const parsedYamlOutput = parsedYaml.outputs.out as { text: string; data: { name: string; items: string[] } };
assert(parsedYamlOutput.data.name === "Flux" && parsedYamlOutput.data.items[1] === "xml", "YAML/YML 转 JSON 失败");

const rebuiltYaml = await run(
  yamlConvertNode,
  { direction: "json-to-yaml", sourcePath: "data", indent: 2 },
  parsedYaml.outputs.out as Record<string, unknown>,
);
assert((rebuiltYaml.outputs.out as { text: string }).text.includes("name: Flux"), "JSON 转 YAML/YML 失败");

let invalidXmlRejected = false;
try {
  await run(xmlConvertNode, { direction: "xml-to-json", sourcePath: "text" }, { text: "<order><id>1</order>" });
} catch (error) {
  invalidXmlRejected = (error as Error).message.includes("XML 格式错误");
}
assert(invalidXmlRejected, "无效 XML 必须提供可被异常捕获节点处理的明确错误");

let duplicateYamlKeyRejected = false;
try {
  await run(yamlConvertNode, { direction: "yaml-to-json", sourcePath: "text" }, { text: "name: Flux\nname: Other\n" });
} catch (error) {
  duplicateYamlKeyRejected = (error as Error).message.includes("YAML/YML 格式错误");
}
assert(duplicateYamlKeyRejected, "重复 YAML 键必须提供可被异常捕获节点处理的明确错误");

const text = await run(textTransformNode, { operation: "replace", find: "旧", replacement: "新" }, { value: " 旧流程 " });
assert((text.outputs.out as { value: string }).value === " 新流程 ", "文本替换失败");

const regex = await run(regexExtractNode, { pattern: "[\\w.-]+@[\\w.-]+", flags: "g", all: true }, { value: "a@b.com 与 c@d.cn" });
assert((regex.outputs.out as { count: number }).count === 2, "正则提取失败");

const encoded = await run(base64Node, { operation: "encode" }, { value: "你好 Flux" });
const decoded = await run(base64Node, { operation: "decode" }, encoded.outputs.out as Record<string, unknown>);
assert((decoded.outputs.out as { value: string }).value === "你好 Flux", "Base64 往返失败");

const merged = await run(objectMergeNode, { overlay: '{"status":"ready"}' }, { id: 7 });
assert((merged.outputs.out as { status: string }).status === "ready", "对象合并失败");

const listed = await run(listTransformNode, { operation: "unique" }, { value: [3, 1, 3, 2] });
assert((listed.outputs.out as { count: number }).count === 3, "列表去重失败");

const csv = await run(csvNode, { operation: "parse", header: true, delimiter: "," }, { value: 'name,note\nFlux,"A,B"' });
assert(((csv.outputs.out as { items: Array<{ note: string }> }).items[0]?.note) === "A,B", "CSV 引号解析失败");

const math = await run(mathNode, { operation: "divide", leftValue: 12, rightValue: 3 }, {});
assert((math.outputs.out as { value: number }).value === 4, "数学运算失败");

const switched = await run(switchNode, { sourcePath: "status", case1Value: "200", case2Value: "500" }, { status: 200 });
assert("case1" in switched.outputs, "规则分流失败");

const validated = await run(validateNode, { requiredPaths: "user.id", typeRules: '{"user.id":"number"}' }, { user: { id: "7" } });
assert("invalid" in validated.outputs, "数据校验失败");

const dated = await run(dateTimeNode, { sourcePath: "value", amount: 1, unit: "day", timezone: "UTC", locale: "zh-CN" }, { value: "2026-01-01T00:00:00.000Z" });
assert((dated.outputs.out as { iso: string }).iso === "2026-01-02T00:00:00.000Z", "日期计算失败");

const builtUrl = await run(urlBuilderNode, { baseUrl: "https://example.com/items", query: '{"q":"中文","page":2}' }, {});
const url = new URL((builtUrl.outputs.out as { url: string }).url);
assert(url.searchParams.get("q") === "中文" && url.searchParams.get("page") === "2", "URL 构建失败");

const textInput = await run(textInputNode, { text: '{"b":2,"a":{"d":4,"c":3}}' }, {});
const textConstant = await run(textConstantNode, { text: "固定业务口径" }, {});
assert(
  (textConstant.outputs.out as { text: string; value: string }).text === "固定业务口径" &&
    (textConstant.outputs.out as { text: string; value: string }).value === "固定业务口径",
  "文本常量应原样输出可被通用文本节点识别的内容",
);
const formatted = await run(jsonFormatNode, { sourcePath: "text", indent: 2, sortKeys: true }, textInput.outputs.out as Record<string, unknown>);
const displayed = await run(jsonDisplayNode, { sourcePath: "value" }, formatted.outputs.out as Record<string, unknown>);
const displayedText = (displayed.outputs.out as { text: string }).text;
assert(displayedText.includes('\n  "a"') && displayedText.indexOf('"a"') < displayedText.indexOf('"b"'), "文本 JSON 格式优化展示链路失败");

const normalizedJson = await run(
  jsonFormatNode,
  {
    sourcePath: "text",
    indent: 2,
    keyCase: "camel",
    stringCase: "lower",
    sortKeys: true,
    trimStrings: true,
    omitNull: true,
  },
  {
    text: JSON.stringify({
      user_name: " Alice ",
      "profile-data": { display_name: " ADA ", last_login: null },
      tags: [" One ", null],
    }),
  },
);
const normalizedData = (normalizedJson.outputs.out as { data: Record<string, unknown> }).data;
const normalizedReport = (normalizedJson.outputs.out as {
  report: { renamedKeys: number; modifiedStrings: number; removedNullFields: number };
}).report;
const normalizedProfile = normalizedData.profileData as Record<string, unknown>;
assert(normalizedData.userName === "alice", "JSON 驼峰键名和字符串小写转换失败");
assert(normalizedProfile.displayName === "ada", "JSON 嵌套字段递归转换失败");
assert(!("lastLogin" in normalizedProfile), "JSON null 字段移除失败");
assert((normalizedData.tags as unknown[])[1] === null, "JSON null 清理不应改变数组索引");
assert(normalizedReport.renamedKeys === 3, "JSON 转换报告应统计最终输出中的递归改名字段");
assert(normalizedReport.modifiedStrings === 3, "JSON 转换报告应统计被改写的字符串");
assert(normalizedReport.removedNullFields === 1, "JSON 转换报告应明确统计被删除的字段");

const losslessJson = await run(
  jsonFormatNode,
  { sourcePath: "text", indent: 2, keyCase: "camel" },
  { text: '{"user_name":" Alice ","last_login":null}' },
);
const losslessOutput = losslessJson.outputs.out as {
  data: Record<string, unknown>;
  report: { removedNullFields: number; modifiedStrings: number };
};
assert(losslessOutput.data.lastLogin === null, "默认转换不得删除 null 字段");
assert(losslessOutput.data.userName === " Alice ", "默认转换不得改写字符串内容");
assert(losslessOutput.report.removedNullFields === 0 && losslessOutput.report.modifiedStrings === 0, "保真转换报告不应产生有损变更");

let collisionRejected = false;
try {
  await run(
    jsonFormatNode,
    { sourcePath: "text", keyCase: "camel" },
    { text: '{"user-name":1,"user_name":2}' },
  );
} catch (error) {
  collisionRejected = (error as Error).message.includes("字段名转换冲突");
}
assert(collisionRejected, "JSON 键名转换冲突必须明确拒绝");

const leadInput = await run(
  leadIntakeNode,
  {
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
  },
  {},
);
const scoredLeads = await run(
  leadScoreNode,
  { hotThreshold: 70, fallbackOwner: "销售运营" },
  leadInput.outputs.out as Record<string, unknown>,
);
const reviewedLeads = await run(
  humanReviewNode,
  { reviewer: "销售主管", decision: "approved" },
  scoredLeads.outputs.out as Record<string, unknown>,
);
assert("approved" in reviewedLeads.outputs, "人工确认应输出已确认分支");
const archivedLeads = await run(
  crmArchiveNode,
  { target: "CRM / 高价值线索池", dedupeKey: "company + name" },
  reviewedLeads.outputs.approved as Record<string, unknown>,
);
const notifiedOwner = await run(
  ownerNotifyNode,
  { channel: "企业微信", retryTimes: 2, fallbackOwner: "销售运营" },
  archivedLeads.outputs.out as Record<string, unknown>,
);
assert(
  (notifiedOwner.outputs.out as { notification?: { retryTimes?: number } }).notification?.retryTimes === 2,
  "客户线索处理链路应包含通知重试策略",
);

const supportCase = await run(
  caseIntakeNode,
  {
    source: "客服表单",
    ticket: JSON.stringify({
      id: "CASE-1",
      customer: "远海科技",
      subject: "生产环境无法登录",
      message: "全部用户无法登录",
      customerTier: "enterprise",
    }),
  },
  {},
);
const triagedCase = await run(
  caseTriageNode,
  { urgentKeywords: "无法登录,全部用户", urgentSlaMinutes: 30 },
  supportCase.outputs.out as Record<string, unknown>,
);
assert("urgent" in triagedCase.outputs, "企业客户故障工单应进入紧急处理");
const draftedReply = await run(
  supportReplyDraftNode,
  { includeSla: true },
  triagedCase.outputs.urgent as Record<string, unknown>,
);
assert(
  String((draftedReply.outputs.out as { responseDraft?: string }).responseDraft).includes("30 分钟"),
  "紧急工单回复应包含 SLA",
);

const operationRequest = await run(
  requestIntakeNode,
  {
    source: "采购申请表",
    request: JSON.stringify({
      id: "PO-1",
      requester: "陈序",
      department: "市场部",
      type: "软件采购",
      amount: 86000,
      reason: "购买年度数据服务",
      riskLevel: "medium",
    }),
  },
  {},
);
const checkedPolicy = await run(
  policyCheckNode,
  { amountThreshold: 50000, reviewRiskLevel: "medium" },
  operationRequest.outputs.out as Record<string, unknown>,
);
assert("manual" in checkedPolicy.outputs, "大额采购申请应进入人工审批");
const archivedRequest = await run(
  recordArchiveNode,
  { system: "采购管理系统", collection: "采购审批单", recordKey: "request.id" },
  checkedPolicy.outputs.manual as Record<string, unknown>,
);
const notifiedTeam = await run(
  teamNotifyNode,
  { channel: "企业微信", recipients: "申请人", retryTimes: 2 },
  archivedRequest.outputs.out as Record<string, unknown>,
);
assert(
  (notifiedTeam.outputs.out as { notification?: { recipients?: string } }).notification?.recipients === "申请人",
  "采购审批结果应通知申请人",
);

const originalFetch = globalThis.fetch;
globalThis.fetch = async (input) => new Response(`ok:${String(input)}`, { status: 200 });
try {
  const batch = await run(httpBatchNode, { urls: '["https://a.example","https://b.example"]', concurrency: 2 }, {});
  const result = batch.outputs.out as { count: number; successCount: number };
  assert(result.count === 2 && result.successCount === 2, "批量 HTTP 失败");
} finally {
  globalThis.fetch = originalFetch;
}

console.log("expanded node capabilities smoke passed");
