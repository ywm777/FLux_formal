# Flux 节点对象基石 V1

## 产品边界

Flux 不负责穷举邮件、CRM、Webhook、文件或 AI 等业务节点。Flux 提供稳定的节点对象协议、能力网关、测试、版本和工作流运行机制；用户决定节点的业务含义、输入输出和组合方式。

核心原则：**规则有界，能力无界。**

```text
Flux Kernel
  ├─ Node Object Protocol
  ├─ Capability Gateway
  ├─ Validation / Test / Version
  ├─ Runtime / Logging / Limits
  └─ Workflow Orchestration
          ↓
User Node Objects
          ↓
User Workflows
```

平台只提供宿主能力，不把宿主能力直接包装成用户必须接受的业务节点。例如平台可以提供受控应用调用、模型调用或数据访问能力，但“客户创建”“消息发送”“文档归档”等节点对象由用户设计。

## 已实现闭环

1. 顶级导航增加“节点库”，与工作台、画布并列。
2. 用户可以手动定义节点身份、端口、配置字段、外部能力申请、实现逻辑和测试。
3. 已连接 AI 时，可以通过自然语言生成完整 `CustomNodeDraft`；生成结果必须通过同一校验器，首次失败会按具体问题修复一次。
4. 节点草案与已激活版本分别保存。编辑草案不会立即替换正在使用的版本。
5. 每个节点至少有正常测试和边界/错误测试；外部能力通过 `mocks` 测试，不接触真实系统。
6. 测试通过后由用户显式启用；启用版本动态注册到本地节点目录。
7. 已启用的个人节点出现在本地画布节点面板中，并可完成工作流执行。
8. 停用节点只撤销新建与执行注册，节点包和历史版本继续保留。

## 对象与生命周期

```text
CustomNodePackage
  ├─ stable type id
  ├─ working draft
  ├─ lifecycle
  ├─ test report
  ├─ capability bindings
  └─ active revision
       ├─ immutable draft snapshot
       ├─ version
       └─ activatedAt
```

```text
draft → validated → tested → active → disabled
              └──── test failed ────┘
```

- 类型 ID 由平台生成：`custom.<ownerNamespace>.<slug>`。
- AI 不得生成 ID、owner、版本、状态、绑定 ID 或凭证。
- 新版本只有在规则和全部测试通过后才能替换活动定义。
- V1 工作流仍引用稳定类型 ID；后续云端节点包必须把引用升级为“类型 ID + 固定版本”。

## 能力边界

用户源码只能看到：

```text
input
config
invoke(capabilityKey, action, payload)
log(level, message)
signal
```

`invoke` 的 key 和 action 必须是静态字符串，并与节点草案声明完全匹配。真实 binding 由平台保存，永远不进入 AI 草案或工作流配置。

当前本地 V1 使用一次性 Worker 验证纯处理节点体验，并限制超时、输出大小、宿主关键字和未声明输出。这是产品闭环原型，不是最终生产安全沙箱。外部能力、云端执行和节点分享必须等待正式隔离运行时。

## 当前明确限制

- 个人节点库仅保存在当前设备。
- 个人节点只加入本地空间画布，避免云端执行器无法解析。
- 能力申请和模拟测试已完成，真实 binding 选择界面尚未完成。
- 浏览器 Worker 不提供可证明的内存隔离，不能作为公开节点的最终运行环境。
- 工作流尚未固定引用节点版本，更新活动版本会影响下一次运行。
- 现有 `POST /api/nodes/custom` 是早期内存元数据接口，不是 V1 正式节点包入口。

## 下一阶段

1. 定义 `NodePackageRepository` 与云端持久化模型，替换早期内存接口。
2. 建立 binding 选择、权限确认、撤销和审计界面。
3. 引入正式隔离运行时，所有外部访问通过能力代理完成。
4. 工作流记录固定节点版本，并提供显式升级与兼容性检查。
5. 加入节点包导入导出，再逐步开放私密分享和用户主动发布。

## 验证证据

```text
@flux/node-sdk typecheck/build + custom-node-rules smoke
@flux/desktop typecheck/build
apps/desktop/test/*.contract.mjs
pnpm test:architecture
@flux/desktop test:unit (42/42)
```

真实浏览器验证路径：

```text
节点库 → 默认草案 → 运行测试（2/2）→ 启用 v1
→ 画布节点面板 → 添加“我的处理节点” → 执行工作流 → 1/1 完成
```

