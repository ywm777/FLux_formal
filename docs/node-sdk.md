# Flux 万能节点 SDK 指南

## 概述

万能节点 = **载体 (Carrier) + 统一 IO 契约**。平台底座负责接入/鉴权/调用/回传；节点逻辑通过 `@flux/node-sdk` 注册。

## 快速开始

```typescript
import { defineNode, NodeRegistry } from "@flux/node-sdk";

const myNode = defineNode({
  id: "my.app.action",
  name: "我的动作",
  category: "应用",
  icon: "zap",
  version: "1.0.0",
  carrier: "app",
  ports: {
    inputs: [{ id: "in", name: "输入" }],
    outputs: [{ id: "out", name: "输出" }],
  },
  configSchema: {
    type: "object",
    properties: {
      action: { type: "string", title: "动作名" },
    },
  },
  async execute(ctx) {
    const result = await ctx.invoke("binding-id", "run", ctx.inputs);
    return { outputs: { out: result } };
  },
});

const registry = new NodeRegistry();
registry.register(myNode);
```

## 载体类型

| carrier | 用途 |
|---------|------|
| `trigger` | 工作流入口 |
| `basic` | 内置基础能力 |
| `app` | 用户授权的应用 |
| `code` | 用户自定义代码 |
| `ai` | AI 大模型 |
| `data` | 数据/文件 |
| `subflow` | 子工作流 |

## configSchema → SchemaForm

画布右抽屉会根据 `configSchema` 自动生成配置表单（string/number/boolean/enum/code）。

## runtimeInputSchema → 本次运行输入

需要用户在每次执行前提供数据的节点使用 `runtimeInputSchema`。这类值由画布在运行前收集，通过 `inputs[nodeId]` 发送到执行 API，只合并到本次任务图，不写回工作流定义。

```typescript
runtimeInputSchema: {
  type: "object",
  required: ["text"],
  properties: {
    text: { type: "string", title: "文本内容", format: "code" },
  },
},
configSchema: { type: "object", properties: {} },
```

## 上传自定义节点

面向最终用户的 AI 自定义节点不得直接上传 `NodeDefinition` 或任意源码。完整规则见
[`custom-node-creation-rules.md`](./custom-node-creation-rules.md)。

AI 只能生成 `CustomNodeDraft`；平台生成 ID 和版本，在用户确认能力绑定且沙箱测试通过后再启用。
模板位于 `packages/node-sdk/templates/custom-node.template.ts`。

```json
{
  "schemaVersion": 1,
  "slug": "my-node",
  "name": "我的节点",
  "description": "接收输入并返回规范化结果。",
  "category": "transform",
  "icon": "braces"
}
```

`defineNode` 仍用于仓库内受信任、经过代码评审的内置节点或插件开发；它不是最终用户 AI 生成节点的安全边界。

## API

- `GET /api/nodes/registry` — 内置 + 自定义节点列表（公开元数据，无 execute）
- `POST /api/nodes/custom` — 早期元数据骨架，尚未作为产品入口开放

## 安全

- 用户 JS **仅在云端隔离沙箱**执行；静态校验不能替代沙箱
- 桌面端仅存储节点元数据与配置，不执行任意代码
