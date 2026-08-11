import { defineNode } from "../registry.js";

/** AI 分析节点 — 走云端 AI Proxy（开源模型优先） */
export const aiAnalyzeNode = defineNode({
  id: "flux.ai.analyze",
  name: "AI 分析",
  category: "AI",
  icon: "brain",
  version: "0.1.0",
  carrier: "ai",
  ports: {
    inputs: [{ id: "in", name: "输入" }],
    outputs: [{ id: "out", name: "分析结果" }],
  },
  configSchema: {
    type: "object",
    properties: {
      prompt: { type: "string", title: "分析指令", format: "textarea" },
      model: { type: "string", title: "模型", default: "llama3" },
    },
  },
  async execute(ctx) {
    const prompt = String((ctx.config as { prompt?: string }).prompt ?? "分析输入");
    ctx.log("info", `AI 分析: ${prompt.slice(0, 80)}`);
    return { outputs: { out: { analysis: `[ai-analyze] ${JSON.stringify(ctx.inputs)}` } } };
  },
});

export const aiGenerateNode = defineNode({
  id: "flux.ai.generate",
  name: "AI 生成",
  category: "AI",
  icon: "sparkles",
  version: "0.1.0",
  carrier: "ai",
  ports: {
    inputs: [{ id: "in", name: "上下文" }],
    outputs: [{ id: "out", name: "生成内容" }],
  },
  configSchema: {
    type: "object",
    properties: {
      prompt: { type: "string", title: "生成指令", format: "textarea" },
      model: { type: "string", title: "模型", default: "llama3" },
    },
  },
  async execute(ctx) {
    const prompt = String((ctx.config as { prompt?: string }).prompt ?? "");
    ctx.log("info", `AI 生成: ${prompt.slice(0, 80)}`);
    return { outputs: { out: { text: `[ai-generate] ${prompt}` } } };
  },
});

export const aiDecideNode = defineNode({
  id: "flux.ai.decide",
  name: "AI 决策",
  category: "AI",
  icon: "git-branch",
  version: "0.1.0",
  carrier: "ai",
  ports: {
    inputs: [{ id: "in", name: "输入" }],
    outputs: [
      { id: "yes", name: "是" },
      { id: "no", name: "否" },
    ],
  },
  configSchema: {
    type: "object",
    properties: {
      question: { type: "string", title: "决策问题", format: "textarea" },
    },
  },
  async execute(ctx) {
    ctx.log("info", "AI 决策分支");
    return { outputs: { yes: ctx.inputs } };
  },
});

export const aiNodes = [aiAnalyzeNode, aiGenerateNode, aiDecideNode];
