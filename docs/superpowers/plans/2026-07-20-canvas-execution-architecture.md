# Canvas Execution Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在保持保存后运行、运行时输入预检、节点进度动画、人工确认和顶部状态反馈不变的前提下，把执行会话从 `CanvasView` 提取为可独立测试、可隔离陈旧异步返回的应用控制器。

**Architecture:** 纯策略模块只处理普通执行描述、输入草稿、运行结果和回放帧；框架无关的 `CanvasExecutionController` 通过保存、运行、人工确认、测试状态和节点投影端口协调一次执行会话；React Hook 仅负责订阅控制器快照。`CanvasView` 继续把 React Flow 节点投影、注册表 Schema、Zustand 状态和具体执行网关组装到这些端口。

**Tech Stack:** React 18、TypeScript、Zustand、`@xyflow/react` 12、Node test runner、Playwright、Tauri 2、pnpm workspace

---

## Scope

本阶段迁移运行时输入草稿、输入预检、保存后运行、进度接收、无进度回放、失败文案、人工确认和会话失效。发布与分享仍由画布会话处理；节点颜色、徽标、输出展示和顶部进度仍由 `CanvasView` 投影。执行控制器不得接收 React Flow `Node`、`Edge`，也不得导入 Zustand、Tauri、API 或具体执行网关。

## File Map

| File | Responsibility |
| --- | --- |
| `e2e/canvas-execution.spec.ts` | 锁定运行时输入预检、保存后本地运行和节点完成反馈 |
| `apps/desktop/src/features/canvas/execution/canvasExecution.ts` | 普通执行类型、输入准备、人工确认查找和回放帧策略 |
| `apps/desktop/src/features/canvas/execution/canvasExecutionController.ts` | 框架无关的执行会话协调、异步令牌和端口调用 |
| `apps/desktop/src/features/canvas/execution/useCanvasExecutionController.ts` | 通过 `useSyncExternalStore` 将控制器快照接入 React |
| `apps/desktop/test/canvas-execution.test.mts` | 输入、回放、人工确认、连续运行和陈旧响应单元测试 |
| `apps/desktop/src/features/canvas/CanvasView.tsx` | 构造普通运行时输入描述并实现 React Flow/Zustand/网关适配端口 |
| `apps/desktop/test/canvas-execution-controller.contract.mjs` | 约束控制器无框架依赖和 `CanvasView` 组合边界 |
| `apps/desktop/test/canvas-test-run.contract.mjs` | 将旧执行源码形状契约迁移到控制器边界 |
| `apps/desktop/test/runtime-input-preflight.contract.mjs` | 将输入预检契约迁移到普通描述与控制器边界 |
| `apps/desktop/package.json` | 把执行模型和控制器测试加入 `test:unit` |
| `docs/superpowers/specs/2026-07-20-canvas-interaction-architecture-design.md` | 记录阶段 4 验证证据 |

### Task 1: Lock visible execution behavior

**Files:**
- Create: `e2e/canvas-execution.spec.ts`

- [x] **Step 1: Add a deterministic local workflow**

使用本地工作区快照创建一个未连接的 `flux.input.text` 节点。运行按钮第一次触发输入预检，填写“文本内容”后第二次运行走本地执行端口。

- [x] **Step 2: Characterize preflight and completion**

```ts
await page.getByRole("button", { name: "执行工作流" }).click();
await expect(page.getByRole("alert")).toHaveText("请完成本次运行所需的输入");
await expect(node).toHaveClass(/selected/);

await node.getByRole("textbox", { name: "文本内容" }).fill("执行控制器回归");
await page.getByRole("button", { name: "执行工作流" }).click();
await expect(node.getByLabel(/过程状态：已完成/)).toBeVisible();
await expect(page.getByLabel(/运行进度：执行成功，1\/1/)).toBeVisible();
```

- [x] **Step 3: Run and commit characterization**

```powershell
pnpm exec playwright test -c e2e/playwright.config.ts e2e/canvas-execution.spec.ts --workers=1
git add -- e2e/canvas-execution.spec.ts
git commit -m "test: lock canvas execution behavior"
```

Expected: behavior passes before extraction.

### Task 2: Build execution policies with TDD

**Files:**
- Create: `apps/desktop/test/canvas-execution.test.mts`
- Create: `apps/desktop/src/features/canvas/execution/canvasExecution.ts`
- Modify: `apps/desktop/package.json`

- [x] **Step 1: Add failing pure-policy tests**

覆盖：默认输入与草稿合并、首个缺失节点、连接上游时 fallback 免填、回放帧顺序、暂停人工确认节点和执行 ID 解析。

- [x] **Step 2: Add failing controller concurrency tests**

使用 deferred promise 和假端口证明：

- 保存成功后才调用运行端口；
- 第二次运行开始后，第一次运行的进度、结果、错误和 `finally` 都不能覆盖新会话；
- `clear` 会使在途会话失效并关闭全局 testing；
- 人工确认只对当前暂停会话调用端口。

- [x] **Step 3: Run RED**

```powershell
pnpm --filter @flux/desktop test:unit
```

Expected: FAIL because execution policy and controller modules do not exist.

- [x] **Step 4: Implement the minimum pure policy and controller**

控制器维护不可变快照、运行时草稿、递增会话令牌和订阅器。所有异步回调在写状态前检查令牌；旧会话的 `finally` 不得将新会话的 testing 设为 false。

- [x] **Step 5: Run GREEN and commit**

```powershell
pnpm --filter @flux/desktop test:unit
git add -- apps/desktop/src/features/canvas/execution apps/desktop/test/canvas-execution.test.mts apps/desktop/package.json
git commit -m "refactor: add canvas execution controller"
```

### Task 3: Add the React adapter and architecture contract

**Files:**
- Create: `apps/desktop/src/features/canvas/execution/useCanvasExecutionController.ts`
- Create: `apps/desktop/test/canvas-execution-controller.contract.mjs`

- [x] **Step 1: Add a failing boundary contract**

契约要求纯策略和控制器不导入 React、React Flow、Zustand、Tauri、store、API 或执行网关；Hook 使用 `useSyncExternalStore`；`CanvasView` 导入 Hook 并通过端口组合具体能力。

- [x] **Step 2: Implement the thin Hook**

Hook 在首次渲染创建控制器，每次渲染更新端口，订阅快照，并在卸载时使在途会话失效。

- [x] **Step 3: Keep RED until composition is complete**

边界契约与 `CanvasView` 接线在 Task 4 一起提交，避免保留故意失败的分支状态。

### Task 4: Integrate at the canvas composition root

**Files:**
- Modify: `apps/desktop/src/features/canvas/CanvasView.tsx`
- Modify: `apps/desktop/test/canvas-test-run.contract.mjs`
- Modify: `apps/desktop/test/runtime-input-preflight.contract.mjs`
- Modify: `apps/desktop/test/product-error-message.contract.mjs`

- [x] **Step 1: Keep only projection adapters in `CanvasView`**

保留三个 React Flow 适配函数：清空节点运行投影、初始化 pending 投影、把普通 `NodeRunRecord[]` 应用到节点。删除画布内的执行详情/result/error state、播放令牌和回放循环。

- [x] **Step 2: Build plain runtime-input descriptors**

从注册表和连线派生 `{ nodeId, defaults, required, upstreamFallback, hasUpstream }`，控制器只接收这些普通值和草稿，不接收节点或连线实例。

- [x] **Step 3: Wire session, store, and gateway ports**

组合 `saveNow`、当前 workflow ID/保存错误、`runDraftExecution`、`approveExecutionAndContinue`、`setTesting`、节点投影和选择动作。图编辑调用控制器 `clear`；打开/新建工作流调用 `reset`。

- [x] **Step 4: Preserve product projection**

顶部进度继续由执行快照派生；节点 action 继续读取当前草稿、错误和人工确认状态；命令协调器的 `testRun` 指向控制器入口。

- [x] **Step 5: Run integration GREEN and commit**

```powershell
node apps/desktop/test/canvas-execution-controller.contract.mjs
node apps/desktop/test/canvas-test-run.contract.mjs
node apps/desktop/test/runtime-input-preflight.contract.mjs
node apps/desktop/test/product-error-message.contract.mjs
pnpm --filter @flux/desktop typecheck
pnpm exec playwright test -c e2e/playwright.config.ts e2e/canvas-execution.spec.ts --workers=1
git add -- apps/desktop/src/features/canvas/CanvasView.tsx apps/desktop/src/features/canvas/execution/useCanvasExecutionController.ts apps/desktop/test/canvas-execution-controller.contract.mjs apps/desktop/test/canvas-test-run.contract.mjs apps/desktop/test/runtime-input-preflight.contract.mjs apps/desktop/test/product-error-message.contract.mjs
git commit -m "refactor: integrate canvas execution control"
```

### Task 5: Run regression and record evidence

**Files:**
- Modify: `docs/superpowers/specs/2026-07-20-canvas-interaction-architecture-design.md`

- [x] **Step 1: Run fresh automated regression**

```powershell
pnpm --filter @flux/desktop typecheck
pnpm --filter @flux/desktop test:unit
node test/architecture-boundaries.contract.mjs
# run every apps/desktop/test/*.contract.mjs
pnpm exec playwright test -c e2e/playwright.config.ts e2e/canvas-execution.spec.ts e2e/canvas-keyboard.spec.ts e2e/canvas-history.spec.ts e2e/canvas-box-selection.spec.ts e2e/edge-selection-mode.spec.ts e2e/view-switch-continuity.spec.ts --workers=1
```

- [x] **Step 2: Verify the real Tauri window after full reload**

完整刷新后实际检查：缺少运行输入时定位并提示节点；填写后运行，顶部进度和节点状态完成；立即连续运行不会被旧结果覆盖；人工确认工作流仍可继续；DevTools 无新增红色异常。

- [x] **Step 3: Record and commit evidence**

```powershell
git add -- docs/superpowers/specs/2026-07-20-canvas-interaction-architecture-design.md
git commit -m "docs: record canvas execution architecture progress"
```

## Stop Conditions

- characterization 在抽取前失败；
- 控制器必须读取 React Flow 节点、Zustand store、Tauri 或具体 API 才能工作；
- 旧执行回调能够覆盖新执行或在图编辑后重新出现；
- 输入草稿随普通重渲染丢失；
- 保存、运行、人工确认或节点状态出现用户可见差异；
- Tauri 完整刷新后出现空白、进度残留或新增控制台错误。
