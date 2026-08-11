import {
  buildCustomNodeTypeId,
  deriveCustomNodeCarrier,
  validateCustomNodeDraft,
  type CustomNodeDraft,
} from "./custom-node-rules.js";

function equal(actual: unknown, expected: unknown, message: string): void {
  if (!Object.is(actual, expected)) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

function ok(value: unknown, message: string): void {
  if (!value) throw new Error(message);
}

function throws(run: () => unknown, message: string): void {
  try {
    run();
  } catch {
    return;
  }
  throw new Error(message);
}

const validDraft: CustomNodeDraft = {
  schemaVersion: 1,
  slug: "normalize-name",
  name: "规范客户名称",
  description: "清理客户名称中的多余空格并返回结构化结果。",
  category: "transform",
  icon: "text",
  ports: {
    inputs: [{ id: "in", name: "客户数据", dataType: "object" }],
    outputs: [{ id: "out", name: "规范结果", dataType: "object" }],
  },
  configSchema: {
    type: "object",
    properties: {
      trim_spaces: { type: "boolean", title: "清理空格", default: true },
    },
  },
  implementation: {
    language: "javascript",
    source:
      "const name = String(input.name ?? '').trim();\nreturn { outputs: { out: { ...input, name } } };",
  },
  capabilities: [],
  tests: [
    {
      name: "普通名称",
      kind: "happy",
      input: { name: "  Flux  " },
      config: { trim_spaces: true },
      expected: { outputs: { out: { name: "Flux" } } },
    },
    {
      name: "空名称",
      kind: "boundary",
      input: { name: "" },
      expected: { outputs: { out: { name: "" } } },
    },
  ],
};

const validResult = validateCustomNodeDraft(validDraft);
equal(validResult.success, true, "valid draft should pass");
equal(deriveCustomNodeCarrier(validDraft), "code", "pure draft carrier");
equal(
  buildCustomNodeTypeId("a1b2c3d4", validDraft.slug),
  "custom.a1b2c3d4.normalize-name",
  "platform-generated custom node id",
);

const aiDraft: CustomNodeDraft = {
  ...validDraft,
  slug: "summarize-text",
  name: "总结文本内容",
  description: "通过用户绑定的模型总结输入文本并返回摘要。",
  icon: "sparkles",
  capabilities: [
    {
      key: "summary_model",
      carrier: "ai",
      actions: ["complete"],
      reason: "生成输入文本的摘要",
    },
  ],
  implementation: {
    language: "javascript",
    source:
      "const result = await invoke('summary_model', 'complete', { prompt: String(input.text ?? '') });\nreturn { outputs: { out: result } };",
  },
  tests: validDraft.tests.map((test) => ({
    ...test,
    mocks: [
      {
        key: "summary_model",
        action: "complete",
        response: test.expected.outputs?.out,
      },
    ],
  })),
};
equal(validateCustomNodeDraft(aiDraft).success, true, "AI capability draft should pass");
equal(deriveCustomNodeCarrier(aiDraft), "ai", "AI draft carrier");

const undeclaredInvokeResult = validateCustomNodeDraft({
  ...aiDraft,
  implementation: {
    language: "javascript",
    source:
      "const result = await invoke('summary_model', 'delete', input);\nreturn { outputs: { out: result } };",
  },
});
equal(undeclaredInvokeResult.success, false, "undeclared capability action should fail");
if (!undeclaredInvokeResult.success) {
  ok(
    undeclaredInvokeResult.issues.some((issue) => issue.code === "undeclared_capability"),
    "invoke action must match the declared capability",
  );
}

const dynamicInvokeResult = validateCustomNodeDraft({
  ...aiDraft,
  implementation: {
    language: "javascript",
    source:
      "const action = 'complete'; const result = await invoke('summary_model', action, input);\nreturn { outputs: { out: result } };",
  },
});
equal(dynamicInvokeResult.success, false, "dynamic capability action should fail");

const unsafeDraft = {
  ...validDraft,
  id: "custom.model.must-not-choose",
  configSchema: {
    type: "object",
    properties: {
      api_key: { type: "string", format: "secret" },
    },
  },
  implementation: {
    language: "javascript",
    source: "const response = await fetch('https://example.com'); return { outputs: { out: response } };",
  },
  capabilities: [
    {
      key: "model",
      carrier: "ai",
      actions: ["complete"],
      reason: "调用模型",
      bindingId: "secret-binding",
    },
  ],
  tests: [],
};
const unsafeResult = validateCustomNodeDraft(unsafeDraft);
equal(unsafeResult.success, false, "unsafe draft should fail");
if (!unsafeResult.success) {
  ok(unsafeResult.issues.some((issue) => issue.code === "unknown_field" && issue.path === "$.id"), "AI-owned id must be rejected");
  ok(unsafeResult.issues.some((issue) => issue.code === "unsafe_source"), "direct network source must be rejected");
  ok(unsafeResult.issues.some((issue) => issue.path.endsWith("bindingId")), "bindingId must be rejected");
  ok(unsafeResult.issues.some((issue) => issue.path === "configSchema.properties.api_key.format"), "secret config must be rejected");
  ok(unsafeResult.issues.some((issue) => issue.path === "tests"), "missing tests must be rejected");
}

throws(() => buildCustomNodeTypeId("Owner", "valid-slug"), "invalid owner namespace must throw");
throws(() => buildCustomNodeTypeId("a1b2c3d4", "Invalid Slug"), "invalid slug must throw");

console.log("custom node creation rules smoke passed");
