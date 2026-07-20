# Canvas Keyboard Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不改变现有快捷键、焦点保护和 Escape 关闭顺序的前提下，把全局键盘事件路由从 `CanvasView` 抽成单一控制器，使保存、运行、视图、历史和节点编辑动作只通过注入端口调用。

**Architecture:** `useCanvasKeyboardController` 是浏览器键盘适配层，负责监听生命周期、快捷键匹配、可编辑目标保护和动作优先级；它不读取 Zustand、React Flow、Tauri 或工作流 API。`CanvasView` 继续作为组合根，把当前选择状态与已经存在的领域动作组装成稳定回调传入控制器。

**Tech Stack:** React 18、TypeScript、`@xyflow/react` 12、Zustand、Node contract tests、Playwright、Tauri 2、pnpm workspace

---

## Scope

本阶段只重构键盘输入边界，不新增或调整快捷键。现有顺序必须保持：Escape 先关闭重命名、节点面板、菜单、检查器，最后清空选择；其余快捷键在输入框、文本域和可编辑元素中不得触发画布动作；边、复选节点、单选节点的删除和移动优先级不变。

## File Map

| File | Responsibility |
| --- | --- |
| `e2e/canvas-keyboard.spec.ts` | 锁定检查器、Escape、移动、复制、删除和输入焦点保护行为 |
| `apps/desktop/src/features/canvas/keyboard/useCanvasKeyboardController.ts` | 唯一全局 `keydown` 监听器和快捷键动作路由 |
| `apps/desktop/src/features/canvas/CanvasView.tsx` | 组合键盘控制器并提供保存、运行、视图、选择和节点动作端口 |
| `apps/desktop/test/canvas-keyboard.contract.mjs` | 检查监听器所有权、依赖边界和 `CanvasView` 接线 |
| `docs/superpowers/specs/2026-07-20-canvas-interaction-architecture-design.md` | 记录阶段 3 的自动化和桌面回归证据 |

### Task 1: Lock current keyboard behavior

**Files:**
- Create: `e2e/canvas-keyboard.spec.ts`

- [ ] **Step 1: Add a deterministic local workflow fixture**

复用历史阶段的双节点图，通过本地工作区存储打开画布，避免依赖用户测试数据。

- [ ] **Step 2: Characterize node and layer shortcuts**

验证以下可见效果：

```ts
await first.click();
await page.keyboard.press("Enter");
await expect(page.getByText("高级设置")).toBeVisible();
await page.keyboard.press("Escape");
await expect(page.getByText("高级设置")).toBeHidden();

const start = await first.boundingBox();
await page.keyboard.press("ArrowRight");
await expect.poll(async () => (await first.boundingBox())?.x ?? 0)
  .toBeGreaterThan((start?.x ?? 0) + 5);
await page.keyboard.press("Control+d");
await expect(page.locator(".react-flow__node")).toHaveCount(3);
await page.keyboard.press("Delete");
await expect(page.locator(".react-flow__node")).toHaveCount(2);
```

- [ ] **Step 3: Characterize editable-target protection**

聚焦文本节点的输入控件后发送 `Control+d` 和 `Delete`，节点数量保持不变。Escape 仍可关闭最上层画布浮层，因为其优先级在焦点保护之前。

- [ ] **Step 4: Run and commit the safety net**

```powershell
pnpm exec playwright test -c e2e/playwright.config.ts e2e/canvas-keyboard.spec.ts --workers=1
git add -- e2e/canvas-keyboard.spec.ts
git commit -m "test: lock canvas keyboard behavior"
```

Expected: 新增用例在重构前通过；任何行为差异先修正测试假设或产品回归，不进入抽取。

### Task 2: Define the keyboard boundary with a failing contract

**Files:**
- Modify: `apps/desktop/test/canvas-keyboard.contract.mjs`

- [ ] **Step 1: Replace implementation-shaped assertions**

契约要求：

- `CanvasView` 导入并调用 `useCanvasKeyboardController`；
- `CanvasView` 不再直接监听 `window.keydown`，也不直接导入快捷键匹配器；
- 控制器拥有唯一监听器并导入 `matchesShortcut` 与 `isEditableShortcutTarget`；
- 控制器不允许导入 store、React Flow、Tauri、执行网关或 API；
- `CanvasView` 注入保存、预览运行、适配视图、撤销、重做、选择和节点编辑动作。

- [ ] **Step 2: Run RED**

```powershell
node apps/desktop/test/canvas-keyboard.contract.mjs
```

Expected: FAIL because `keyboard/useCanvasKeyboardController.ts` does not exist and `CanvasView` still owns the listener.

- [ ] **Step 3: Commit the red contract with the implementation**

契约在 Task 4 变绿后与生产代码一起提交，避免主分支留下故意失败的检查。

### Task 3: Implement the keyboard adapter

**Files:**
- Create: `apps/desktop/src/features/canvas/keyboard/useCanvasKeyboardController.ts`

- [ ] **Step 1: Define a flat injected command interface**

输入只包含激活状态、浮层/选择标识和语义动作回调，例如：

```ts
export interface CanvasKeyboardControllerInput {
  active: boolean;
  renameOpen: boolean;
  paletteOpen: boolean;
  menuOpen: boolean;
  inspectingNodeId: string | null;
  selectedNodeId: string | null;
  selectedNodeIds: string[];
  selectedEdgeId: string | null;
  onCloseRename(): void;
  onClosePalette(): void;
  onCloseMenu(): void;
  onCloseInspector(): void;
  onClearSelection(): void;
  onAddNode(): void;
  onSave(): void | Promise<void>;
  onRunPreview(): void | Promise<void>;
  onFitView(): void;
  onUndo(): void;
  onRedo(): void;
  // node and edge command ports follow
}
```

- [ ] **Step 2: Move the listener without changing routing order**

保留所有 `preventDefault`、8/24 像素移动量、边优先删除、复选优先动作和单选回退。异步命令用 `void` 调用，控制器不解释业务状态。

- [ ] **Step 3: Type-check the isolated adapter**

```powershell
pnpm --filter @flux/desktop typecheck
```

Expected: PASS after the integration in Task 4; during isolated creation only允许出现尚未接线的未使用问题。

### Task 4: Integrate at the canvas composition root

**Files:**
- Modify: `apps/desktop/src/features/canvas/CanvasView.tsx`
- Modify: `apps/desktop/test/canvas-keyboard.contract.mjs`

- [ ] **Step 1: Add stable composition callbacks**

在 `CanvasView` 中封装关闭面板、清空选择、居中/下游加节点、保存、预览运行和适配视图。预览运行的 `testing / publishing / saving` 门禁仍留在组合根。

- [ ] **Step 2: Mount the controller once**

将当前选择和动作端口传入 `useCanvasKeyboardController`，删除 `CanvasView` 中原有约 170 行的 `useEffect`。

- [ ] **Step 3: Remove leaked dependencies**

删除 `CanvasView` 对 `matchesShortcut`、`isEditableShortcutTarget` 的导入，确认控制器没有 store、React Flow 或应用服务依赖。

- [ ] **Step 4: Run GREEN**

```powershell
node apps/desktop/test/canvas-keyboard.contract.mjs
pnpm --filter @flux/desktop typecheck
pnpm exec playwright test -c e2e/playwright.config.ts e2e/canvas-keyboard.spec.ts --workers=1
```

Expected: contract passes, type-check passes, keyboard characterization passes.

- [ ] **Step 5: Commit the extraction**

```powershell
git add -- apps/desktop/src/features/canvas/keyboard/useCanvasKeyboardController.ts apps/desktop/src/features/canvas/CanvasView.tsx apps/desktop/test/canvas-keyboard.contract.mjs
git commit -m "refactor: centralize canvas keyboard control"
```

### Task 5: Run regression and record evidence

**Files:**
- Modify: `docs/superpowers/specs/2026-07-20-canvas-interaction-architecture-design.md`

- [ ] **Step 1: Run fresh automated regression**

```powershell
pnpm --filter @flux/desktop typecheck
pnpm --filter @flux/desktop test:unit
node test/architecture-boundaries.contract.mjs
node apps/desktop/test/canvas-selection-controller.contract.mjs
node apps/desktop/test/canvas-history.contract.mjs
node apps/desktop/test/canvas-keyboard.contract.mjs
pnpm exec playwright test -c e2e/playwright.config.ts e2e/canvas-keyboard.spec.ts e2e/canvas-history.spec.ts e2e/canvas-box-selection.spec.ts e2e/edge-selection-mode.spec.ts e2e/view-switch-continuity.spec.ts --workers=1
```

- [ ] **Step 2: Verify the real Tauri window after full reload**

在桌面应用中实际检查：选中节点后 Enter 打开检查器、Escape 关闭；方向键移动并可撤销；复制后删除；输入控件聚焦时不会复制或删除节点。检查开发者工具无新增红色异常。

- [ ] **Step 3: Record evidence and commit**

在总设计文档记录命令、通过数量和桌面验证结果，然后：

```powershell
git add -- docs/superpowers/specs/2026-07-20-canvas-interaction-architecture-design.md
git commit -m "docs: record canvas keyboard architecture progress"
```

## Stop Conditions

- 任一 characterization E2E 在抽取前失败；
- 控制器需要读取 Zustand、React Flow、Tauri 或执行服务才能保持行为；
- 输入框焦点保护、Escape 层级顺序、边/节点删除优先级发生改变；
- 真实 Tauri 窗口在完整刷新后出现空白、快捷键失效或新增控制台错误。
