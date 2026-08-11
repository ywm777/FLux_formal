import type { CustomNodeDraft } from "@flux/node-sdk";

/**
 * AI 自定义节点草案模板。
 * id、ownerId、version、status、bindingId 和凭证由平台管理，不能写入此对象。
 */
const draft: CustomNodeDraft = {
  schemaVersion: 1,
  slug: "hello-message",
  name: "生成问候消息",
  description: "接收任意输入并附加用户配置的问候文本。",
  category: "transform",
  icon: "text",
  ports: {
    inputs: [{ id: "in", name: "输入", dataType: "any" }],
    outputs: [{ id: "out", name: "问候结果", dataType: "object" }],
  },
  configSchema: {
    type: "object",
    properties: {
      message: { type: "string", title: "问候文本", default: "Hello Flux" },
    },
  },
  implementation: {
    language: "javascript",
    source:
      "const message = String(config.message ?? 'Hello');\nreturn { outputs: { out: { message, input } } };",
  },
  capabilities: [],
  tests: [
    {
      name: "普通输入",
      kind: "happy",
      input: { name: "Flux" },
      config: { message: "你好" },
      expected: {
        outputs: { out: { message: "你好", input: { name: "Flux" } } },
      },
    },
    {
      name: "空输入",
      kind: "boundary",
      input: {},
      config: {},
      expected: { outputs: { out: { message: "Hello", input: {} } } },
    },
  ],
};

export default draft;
