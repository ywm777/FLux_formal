import { defineNode } from "../registry.js";

/**
 * 自定义代码节点 —— "万能节点"右轨的核心体现。
 *
 * 用户写一段 JS，节点即可变成任意形态：内部承载什么逻辑完全由用户决定，
 * 对画布与执行引擎仍是统一的「输入 → 处理 → 输出」契约。
 *
 * 安全说明：当前节点失败关闭，且不会注册到内置节点列表。
 * 只有接入云端隔离沙箱后才能重新启用，详见 PRD 4.4 / FR-NODE-09。
 */
export const customCodeNode = defineNode({
  id: "flux.code.custom",
  name: "自定义代码",
  category: "自定义",
  icon: "code",
  version: "0.1.0",
  carrier: "code",
  ports: {
    inputs: [{ id: "in", name: "输入" }],
    outputs: [{ id: "out", name: "输出" }],
  },
  configSchema: {
    type: "object",
    required: ["code"],
    properties: {
      code: {
        type: "string",
        title: "代码 (JavaScript)",
        description:
          "可用变量：input（上游输入）、log(msg)。函数返回值即为本节点输出。\n例如：return { count: (input.items || []).length };",
        format: "code",
        default: "return input;",
      },
    },
  },
  async execute(ctx) {
    const message = "自定义代码节点已禁用：需要隔离沙箱";
    ctx.log("error", message);
    throw new Error(message);
  },
});
