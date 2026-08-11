import {
  CUSTOM_NODE_RULES,
  validateCustomNodeDraft,
  type CustomNodeDraft,
  type CustomNodeRuleIssue,
} from "@flux/node-sdk";
import { aiApi } from "../../../lib/api.js";

function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const candidate = fenced ?? text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  if (!candidate.trim()) throw new Error("AI 没有返回节点草案 JSON");
  try {
    return JSON.parse(candidate);
  } catch {
    throw new Error("AI 返回的节点草案不是有效 JSON，请重新生成");
  }
}

function issuesText(issues: CustomNodeRuleIssue[]): string {
  return issues
    .slice(0, 8)
    .map((issue) => `${issue.path}: ${issue.message}`)
    .join("\n");
}

function systemPrompt(request: string): string {
  return `你是 Flux 节点设计器。请把用户需求转换成一个 CustomNodeDraft JSON 对象。

用户需求：
${request}

只返回 JSON，不要 Markdown，不要解释。必须遵守这些规则：
- schemaVersion 固定为 1。
- 不得生成 id、ownerId、version、status、bindingId 或凭证。
- slug 使用小写 kebab-case；name 2-${CUSTOM_NODE_RULES.maxNameLength} 字；description 8-${CUSTOM_NODE_RULES.maxDescriptionLength} 字。
- category 只能是 source、transform、control、integration、output。
- icon 只能是 braces、database、file-json、globe、sparkles、text、wand、workflow。
- ports 包含 inputs 与 outputs；端口字段只有 id、name、dataType、capacity；dataType 只能是 any/string/number/boolean/object/array。输入 capacity 固定 one；输出默认 many，只有确实互斥的输出才使用 one。
- configSchema 根节点必须是 object，只允许 title、description、type、properties、items、enum、default、required、format；凭证绝不能进入 config。
- implementation 固定为 {"language":"javascript","source":"..."}。
- source 是异步函数体，可使用 input、config、invoke、log、signal；必须返回 { outputs: { 端口ID: 值 } }。
- 禁止 fetch、import、require、eval、Function、window、document、globalThis、self、process；外部能力只能通过 invoke("能力key", "动作", payload) 调用。
- capabilities 是能力申请数组；每项只有 key、carrier、actions、reason。carrier 只能是 ai、app、data。没有外部能力时返回 []。
- 要调用用户配置的 HTTP 接口时，声明 carrier 为 app、actions 为 ["request"]；代码调用 await invoke("能力key", "request", { method: "GET", path: "customers/" + input.id, query: {} })。回执形如 { status, headers, data }；绝不能生成完整 URL、认证请求头或密钥。
- tests 必须有 2-8 项，至少一个 happy，至少一个 boundary 或 error。
- 成功测试 expected 为 {"outputs":{...}}；错误测试 expected 为 {"errorCode":"..."}。
- 调用 invoke 的测试必须用 mocks 提供相同 key/action 的模拟回执；mock 只能包含 key、action，以及 response 或 errorCode 二选一。
- 生成简单、可读、确定性的实现，不要生成平台未要求的功能。`;
}

async function completeDraft(prompt: string): Promise<unknown> {
  const completion = await aiApi.complete({ prompt, maxTokens: 6_000 });
  return extractJson(completion.text);
}

export async function generateCustomNodeDraft(
  request: string,
): Promise<CustomNodeDraft> {
  const trimmed = request.trim();
  if (trimmed.length < 8) throw new Error("请更具体地描述节点要完成的事情");

  const first = await completeDraft(systemPrompt(trimmed));
  const validation = validateCustomNodeDraft(first);
  if (validation.success) return validation.value;

  const repaired = await completeDraft(`${systemPrompt(trimmed)}

上一次草案没有通过规则校验。请修复以下问题，并重新返回完整 JSON：
${issuesText(validation.issues)}

上一次草案：
${JSON.stringify(first)}`);
  const repairedValidation = validateCustomNodeDraft(repaired);
  if (repairedValidation.success) return repairedValidation.value;
  throw new Error(`AI 草案仍未通过节点规则：${issuesText(repairedValidation.issues)}`);
}
