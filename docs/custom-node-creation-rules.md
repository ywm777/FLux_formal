# AI 自定义节点创建规则（V1）

本文是 Flux 面向最终用户的 AI 自定义节点功能的唯一规则来源。机器协议与校验器位于
`packages/node-sdk/src/custom-node-rules.ts`。

## 1. 产品决策

1. 用户至少有一个状态为 `connected` 的 AI 连接，才能进入“用 AI 创建节点”。
2. AI 只负责生成和修改 `CustomNodeDraft`，不能直接注册、启用或发布节点。
3. 每次生成都必须经过：结构校验、权限确认、沙箱测试、用户确认，之后才能启用。
4. AI 连接是“创建与修改”的前提，不等于所有自定义节点运行时都依赖 AI。
5. 无外部能力的纯处理节点在 AI 断开后仍可运行；声明 `ai` 能力的节点运行时必须有有效绑定。
6. 自定义节点属于用户个人空间，默认私密；分享、市场发布和 Fork 不属于 V1。

## 2. 生命周期

```text
需求描述
  -> AI 生成 draft
  -> validated（规则校验通过）
  -> 用户绑定能力并确认权限
  -> tested（沙箱测试全部通过）
  -> active（用户显式启用）
  -> disabled（用户停用或平台安全阻断）
```

- AI 重新生成源码、端口、配置或能力申请后，状态必须退回 `draft`。
- 未达到 `tested` 的节点不能加入公开节点目录，也不能参与工作流执行。
- `disabled` 节点保留定义和历史工作流引用，但禁止新执行，并给出可恢复原因。

## 3. 字段所有权

### AI 可以生成

- `slug`、名称、描述、主分类和受控图标。
- 输入输出端口。
- 配置 Schema 和可选的本次运行输入 Schema。
- 受限 JavaScript 函数体。
- 能力申请和测试样例。

### 平台负责

- 全局节点类型 ID：`custom.<ownerNamespace>.<slug>`。
- `ownerId`、版本、生命周期状态、创建时间和审计信息。
- 真实 AI 连接、应用授权、数据源的 `bindingId`。
- 执行超时、内存和输出大小限制。

### AI 永远不能生成

- `id`、`ownerId`、`version`、`status`、`bindingId`。
- API Key、Token、Cookie、密码或任何明文凭证。
- 绕过平台能力层的网络地址、系统路径或宿主权限。

出现未知字段时必须拒绝整个草案，不做静默忽略。

## 4. 草案协议

```json
{
  "schemaVersion": 1,
  "slug": "normalize-customer-name",
  "name": "规范客户名称",
  "description": "清理客户名称中的多余空格并统一大小写。",
  "category": "transform",
  "icon": "text",
  "ports": {
    "inputs": [{ "id": "in", "name": "客户数据", "dataType": "object", "capacity": "one" }],
    "outputs": [{ "id": "out", "name": "规范结果", "dataType": "object", "capacity": "many" }]
  },
  "configSchema": {
    "type": "object",
    "properties": {
      "case_mode": {
        "type": "string",
        "title": "大小写",
        "enum": ["keep", "upper", "lower"],
        "default": "keep"
      }
    }
  },
  "implementation": {
    "language": "javascript",
    "source": "const name = String(input.name ?? '').trim();\nreturn { outputs: { out: { ...input, name } } };"
  },
  "capabilities": [],
  "tests": [
    {
      "name": "清理普通名称",
      "kind": "happy",
      "input": { "name": "  Flux  " },
      "expected": { "outputs": { "out": { "name": "Flux" } } }
    },
    {
      "name": "空名称",
      "kind": "boundary",
      "input": { "name": "" },
      "expected": { "outputs": { "out": { "name": "" } } }
    }
  ]
}
```

模型必须只返回一个 JSON 对象，不得附带 Markdown、解释文字或第二个候选草案。

## 5. 元数据与端口规则

| 项目 | 规则 |
| --- | --- |
| `slug` | 2-48 字符，小写字母开头，只允许小写字母、数字和单连字符 |
| 名称 | 2-40 字符，使用用户能理解的动宾短语 |
| 描述 | 8-160 字符，只说明输入、处理和输出，不写宣传语 |
| 分类 | `source`、`transform`、`control`、`integration`、`output` 五选一 |
| 图标 | 只能使用协议允许的固定图标，不接受 SVG、URL 或自定义路径 |
| 端口 ID | 小写字母开头，只允许小写字母、数字、下划线，最长 32 字符 |
| 端口数量 | 每个方向最多 8 个；至少有一个输出端口 |
| 数据类型 | `any/string/number/boolean/object/array` |
| 连接容量 | 输入固定为 `one`（单上游）；输出默认为 `many`（可连接多个下游），只有业务语义明确互斥时才设置为 `one` |

端口 ID 一旦节点进入 `active` 即为兼容性契约。删除或改名端口属于破坏性变更，后续必须产生主版本升级和迁移提示。

`capacity` 是节点定义的一部分，不是画布临时状态。画布、持久化和运行时必须共同遵守这一契约：同一输出值可以广播给多个下游；同一输入当前只接受一个上游。多上游输入需要先定义聚合顺序和冲突语义，不在 V1 中开放。

## 6. 配置规则

- `configSchema` 和运行输入 Schema 的根节点必须是 `object`。
- 最多 20 个字段、最多 4 层嵌套。
- 只允许 `object/string/number/boolean/array`，数组必须声明 `items`。
- 枚举最多 50 项，`required` 只能引用已声明字段。
- 默认值必须能序列化为 JSON。
- 只允许 `textarea` 和 `code` 两种显示格式。
- 禁止 `secret`。敏感数据只能通过能力绑定保存，不能进入工作流 JSON。
- 长期配置放 `configSchema`；每次执行临时输入放 `runtimeInput`，不得混用。

## 7. 能力与授权规则

外部访问只能通过能力申请：

```json
{
  "key": "writer_model",
  "carrier": "ai",
  "actions": ["complete"],
  "reason": "根据输入生成客户回复"
}
```

- `key` 是草案内引用，不是真实绑定 ID。
- V1 只允许 `ai`、`app`、`data` 三类能力。
- AI 只能说明需要什么能力和动作，不能选择用户的真实连接或读取凭证。
- 用户必须逐项看到用途并选择真实绑定；新增能力后必须重新确认和测试。
- `integration` 分类必须至少声明一个能力。
- `invoke` 的能力 key 和 action 必须使用静态字符串，并与能力申请逐项一致；禁止动态拼接或调用未声明动作。
- 删除或失效的绑定会使节点进入不可运行状态，但不会自动换用其他连接。

## 8. 实现源码规则

运行时只提供以下受控变量：

```text
input
config
invoke(capabilityKey, action, payload)
log(level, message)
signal
```

实现必须返回：

```js
return { outputs: { out: value } };
```

硬性禁止：

- `eval`、`Function`、动态导入、`require`。
- `fetch`、`XMLHttpRequest`、`WebSocket` 等直接网络访问。
- `process`、`globalThis`、`window`、`document`。
- 文件系统、子进程、线程和任意宿主系统 API。
- 在源码或日志中写入凭证。
- 返回函数、循环引用、`BigInt` 等非 JSON 数据。

准入校验只能发现明显违规，不能替代正式隔离沙箱。当前 V1 为验证完整产品闭环，纯处理节点可以在一次性浏览器 Worker 中进行本地预览与本地流程试运行，并强制 5 秒超时、1 MB 输出上限和终止清理；这不是最终生产安全边界。云端执行、外部能力调用和公开分享前，仍必须接入具备独立内存限制、能力代理与审计的正式隔离运行时。

## 9. 测试与启用门槛

每个草案必须包含 2-8 个测试样例：

- 至少一个 `happy` 正常路径。
- 至少一个 `boundary` 或 `error` 路径。
- 成功样例只能断言已声明的输出端口。
- 错误样例必须使用稳定错误码，不能依赖堆栈文本。
- 调用 `invoke` 的测试必须提供 `mocks`，用静态 `key/action` 模拟成功回执或稳定错误码；测试阶段不得触发真实外部系统。
- 结构校验、静态安全检查和所有沙箱测试必须全部通过。
- 节点能力、端口或源码变化后，测试结果失效并重新执行。

启用前界面必须让用户看到：节点说明、输入输出、配置项、能力与真实绑定、测试结果和风险提示。用户必须显式点击“启用节点”，AI 不能代替确认。

## 10. 版本与兼容

- 平台创建时从 `0.1.0` 开始，版本号不由 AI 生成。
- 修改文案、图标、内部实现且 IO 行为不变：Patch。
- 新增可选配置或新增非破坏性能力：Minor，并重新确认权限。
- 删除/改名端口、改变数据类型、删除配置或改变行为契约：Major。
- 已被工作流引用的旧版本必须可解析；升级只能显式进行，禁止静默替换。

## 11. V1 功能边界

V1 先支持两类节点：

1. 无外部能力的纯数据处理节点：已支持本地创建、测试、启用和画布执行。
2. 声明外部能力的节点：已支持规则声明和模拟测试，真实绑定与正式沙箱执行尚未开放。

应用操控、HTTP、文件和数据库能力只有在统一 `invoke` 授权与审计底座完成后才能开放。现有 `POST /nodes/custom` 仅是早期元数据骨架，不具备执行注册和沙箱，不能作为正式创建入口。

## 12. 后续实现顺序

1. ~~AI 连接生成草案~~：桌面端已通过现有 AI Proxy 接入，并对失败草案执行一次规则修复。
2. ~~统一规则校验、模拟测试、本地持久化与激活版本~~：V1 已落地。
3. 能力绑定确认界面与凭证授权。
4. 正式隔离沙箱、测试结果签名和审计记录。
5. 云端节点包持久化、执行注册与节点版本固定引用。
6. 节点导入导出、分享与用户主动发布。
