# Canvas History Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不改变撤销、重做和拖拽体验的前提下，把 `CanvasView` 的双 ref 栈替换为可测试的 `past / present / future` 历史模型和单一历史控制器。

**Architecture:** 纯 TypeScript 模块维护有限深度历史并保证新编辑清空 `future`。React Hook 适配现有“先记录、再调用多个 React setter”的画布写法，并把节点和分组拖拽作为事务，在手势结束时提交最终快照；选择、运行状态和 UI 浮层不进入快照。

**Tech Stack:** React 18、TypeScript、`@xyflow/react` 12、Node test runner、Playwright、Tauri 2、pnpm workspace

---

## Scope

本计划只实施总设计中的历史控制器阶段。快捷键监听仍暂时留在 `CanvasView`，但其撤销/重做调用改为控制器方法；键盘控制器和执行控制器使用后续独立计划。

## File Map

| File | Responsibility |
| --- | --- |
| `apps/desktop/src/features/canvas/history/canvasHistory.ts` | 泛型有限历史的 `create`、`commit`、`undo`、`redo`、`reset` |
| `apps/desktop/src/features/canvas/history/useCanvasHistoryController.ts` | 适配 React 更新批处理和拖拽事务，返回需要恢复的快照 |
| `apps/desktop/test/canvas-history.test.mts` | 证明 `past / present / future`、深度限制、新编辑清空重做路径 |
| `e2e/canvas-history.spec.ts` | 验证复制、撤销、重做、分叉编辑和拖拽最终位置 |
| `apps/desktop/src/features/canvas/CanvasView.tsx` | 提供图快照、调用历史控制器、删除本地双栈和选择快照 |
| `apps/desktop/test/canvas-history.contract.mjs` | 检查历史边界、快照排除瞬态状态和事务接入 |
| `apps/desktop/package.json` | 将历史模型测试加入桌面端单元测试命令 |
| `docs/superpowers/specs/2026-07-20-canvas-interaction-architecture-design.md` | 记录阶段 2 验证证据 |

### Task 1: Lock undo, redo, branch, and drag behavior

**Files:**
- Create: `e2e/canvas-history.spec.ts`

- [ ] **Step 1: Add deterministic history E2E**

Create a local workflow fixture with two nodes, then add two tests:

```ts
import { expect, test, type Page } from "@playwright/test";

const historyWorkflow = {
  schemaVersion: 1,
  updatedAt: "2026-07-20T00:00:00.000Z",
  workflows: [{
    id: "local_history",
    ownerId: "local-user",
    workspaceId: "local",
    title: "历史测试",
    tags: [],
    version: 1,
    status: "draft",
    isFavorite: false,
    createdAt: "2026-07-20T00:00:00.000Z",
    updatedAt: "2026-07-20T00:00:00.000Z",
    graph: {
      id: "wf_history",
      version: 1,
      viewport: { x: 0, y: 0, zoom: 1 },
      meta: { title: "历史测试", tags: [] },
      nodes: [
        {
          id: "first-node",
          type: "flux.source.textConstant",
          position: { x: 240, y: 240 },
          data: { _label: "第一节点", text: "历史内容" },
          ports: { inputs: [], outputs: [{ id: "out", name: "固定文本", dataType: "text" }] },
        },
        {
          id: "second-node",
          type: "flux.action.log",
          position: { x: 660, y: 320 },
          data: { _label: "第二节点" },
          ports: {
            inputs: [{ id: "in", name: "输入", dataType: "any" }],
            outputs: [{ id: "out", name: "输出", dataType: "any" }],
          },
        },
      ],
      edges: [],
      groups: [],
    },
  }],
};

async function openHistoryWorkflow(page: Page) {
  await page.addInitScript((snapshot) => {
    localStorage.setItem("flux.desktop.local-workspace", JSON.stringify(snapshot));
    localStorage.setItem("flux.desktop.workspace-preference", "local");
  }, historyWorkflow);
  await page.goto("/");
  await page.getByRole("button", { name: "打开 历史测试" }).click();
  await expect(page.locator(".react-flow__node")).toHaveCount(2);
}

test("undo and redo restore graph edits while a branch edit clears redo", async ({ page }) => {
  await openHistoryWorkflow(page);
  const first = page.locator('.react-flow__node[data-id="first-node"]');
  await first.click();
  await page.keyboard.press("Control+d");
  await expect(page.locator(".react-flow__node")).toHaveCount(3);

  await page.keyboard.press("Control+z");
  await expect(page.locator(".react-flow__node")).toHaveCount(2);
  await page.keyboard.press("Control+Shift+z");
  await expect(page.locator(".react-flow__node")).toHaveCount(3);

  await page.keyboard.press("Control+z");
  await expect(page.locator(".react-flow__node")).toHaveCount(2);
  await first.click();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Control+Shift+z");
  await expect(page.locator(".react-flow__node")).toHaveCount(2);
});

test("one drag undo restores the start and redo restores the final position", async ({ page }) => {
  await openHistoryWorkflow(page);
  const first = page.locator('.react-flow__node[data-id="first-node"]');
  const start = await first.boundingBox();
  expect(start).not.toBeNull();
  if (!start) throw new Error("first node bounds are unavailable");

  await page.mouse.move(start.x + start.width / 2, start.y + 24);
  await page.mouse.down();
  await page.mouse.move(start.x + start.width / 2 + 140, start.y + 104, { steps: 14 });
  await page.mouse.up();
  const dragged = await first.boundingBox();
  expect(dragged).not.toBeNull();
  if (!dragged) throw new Error("dragged node bounds are unavailable");
  expect(dragged.x).toBeGreaterThan(start.x + 100);

  await page.keyboard.press("Control+z");
  await expect.poll(async () => (await first.boundingBox())?.x ?? 0).toBeLessThan(start.x + 10);
  await page.keyboard.press("Control+Shift+z");
  await expect.poll(async () => (await first.boundingBox())?.x ?? 0).toBeGreaterThan(start.x + 100);
});
```

- [ ] **Step 2: Run the characterization tests**

```powershell
pnpm exec playwright test -c e2e/playwright.config.ts e2e/canvas-history.spec.ts --workers=1
```

Expected: `2 passed`. A failure caused by actual undo/redo behavior blocks the extraction.

- [ ] **Step 3: Commit the behavior safety net**

```powershell
git add -- e2e/canvas-history.spec.ts
git commit -m "test: lock canvas history behavior"
```

### Task 2: Build the pure bounded history model with TDD

**Files:**
- Create: `apps/desktop/test/canvas-history.test.mts`
- Create: `apps/desktop/src/features/canvas/history/canvasHistory.ts`
- Modify: `apps/desktop/package.json`

- [ ] **Step 1: Add failing unit tests and include them in `test:unit`**

Append `test/canvas-history.test.mts` to the desktop `test:unit` command and create:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import {
  commitCanvasHistory,
  createCanvasHistory,
  redoCanvasHistory,
  resetCanvasHistory,
  undoCanvasHistory,
} from "../src/features/canvas/history/canvasHistory.ts";

test("commit moves present to past and clears future", () => {
  const initial = createCanvasHistory("a", 3);
  const edited = commitCanvasHistory(initial, "b");
  const undone = undoCanvasHistory(edited);
  const branched = commitCanvasHistory(undone, "c");
  assert.deepEqual(branched, { past: ["a"], present: "c", future: [], limit: 3 });
});

test("undo and redo move through past present and future", () => {
  const history = commitCanvasHistory(commitCanvasHistory(createCanvasHistory(1), 2), 3);
  const undone = undoCanvasHistory(history);
  assert.deepEqual(undone, { past: [1], present: 2, future: [3], limit: 80 });
  assert.deepEqual(redoCanvasHistory(undone), history);
});

test("history depth is bounded without losing the current value", () => {
  let history = createCanvasHistory(0, 2);
  history = commitCanvasHistory(history, 1);
  history = commitCanvasHistory(history, 2);
  history = commitCanvasHistory(history, 3);
  assert.deepEqual(history, { past: [1, 2], present: 3, future: [], limit: 2 });
});

test("undo and redo at a boundary are stable", () => {
  const history = createCanvasHistory("only");
  assert.strictEqual(undoCanvasHistory(history), history);
  assert.strictEqual(redoCanvasHistory(history), history);
});

test("reset replaces the complete timeline", () => {
  const history = commitCanvasHistory(createCanvasHistory("a"), "b");
  assert.deepEqual(resetCanvasHistory(history, "fresh"), {
    past: [], present: "fresh", future: [], limit: 80,
  });
});
```

- [ ] **Step 2: Run RED**

```powershell
pnpm --filter @flux/desktop test:unit
```

Expected: FAIL because `history/canvasHistory.ts` does not exist.

- [ ] **Step 3: Implement the pure model**

Create `apps/desktop/src/features/canvas/history/canvasHistory.ts`:

```ts
export interface CanvasHistory<T> {
  past: T[];
  present: T;
  future: T[];
  limit: number;
}

export function createCanvasHistory<T>(present: T, limit = 80): CanvasHistory<T> {
  return { past: [], present, future: [], limit };
}

export function commitCanvasHistory<T>(history: CanvasHistory<T>, present: T): CanvasHistory<T> {
  return {
    past: [...history.past, history.present].slice(-history.limit),
    present,
    future: [],
    limit: history.limit,
  };
}

export function undoCanvasHistory<T>(history: CanvasHistory<T>): CanvasHistory<T> {
  const previous = history.past.at(-1);
  if (previous === undefined) return history;
  return {
    past: history.past.slice(0, -1),
    present: previous,
    future: [history.present, ...history.future],
    limit: history.limit,
  };
}

export function redoCanvasHistory<T>(history: CanvasHistory<T>): CanvasHistory<T> {
  const [next, ...future] = history.future;
  if (next === undefined) return history;
  return {
    past: [...history.past, history.present].slice(-history.limit),
    present: next,
    future,
    limit: history.limit,
  };
}

export function resetCanvasHistory<T>(history: CanvasHistory<T>, present: T): CanvasHistory<T> {
  return createCanvasHistory(present, history.limit);
}
```

- [ ] **Step 4: Run GREEN and typecheck**

```powershell
pnpm --filter @flux/desktop test:unit
pnpm --filter @flux/desktop typecheck
```

Expected: all unit tests PASS and typecheck PASS.

- [ ] **Step 5: Commit the pure history model**

Stage only the test command hunk from `apps/desktop/package.json` if unrelated hunks are present.

```powershell
git add -- apps/desktop/src/features/canvas/history/canvasHistory.ts apps/desktop/test/canvas-history.test.mts
git add -p -- apps/desktop/package.json
git commit -m "refactor: add bounded canvas history model"
```

### Task 3: Add the React history controller

**Files:**
- Create: `apps/desktop/src/features/canvas/history/useCanvasHistoryController.ts`

- [ ] **Step 1: Implement batched commit and transaction semantics**

```ts
import { useCallback, useEffect, useReducer, useRef } from "react";
import {
  commitCanvasHistory,
  createCanvasHistory,
  redoCanvasHistory,
  resetCanvasHistory,
  undoCanvasHistory,
} from "./canvasHistory.js";

interface CanvasHistoryControllerInput<T> {
  value: T;
  clone: (value: T) => T;
  equals: (left: T, right: T) => boolean;
  limit?: number;
}

export function useCanvasHistoryController<T>({
  value,
  clone,
  equals,
  limit = 80,
}: CanvasHistoryControllerInput<T>) {
  const currentRef = useRef(value);
  currentRef.current = value;
  const historyRef = useRef(createCanvasHistory(clone(value), limit));
  const pendingCommitRef = useRef(false);
  const transactionRef = useRef(false);
  const [flushRevision, requestFlush] = useReducer(
    (revision: number) => revision + 1,
    0,
  );

  useEffect(() => {
    if (!pendingCommitRef.current) return;
    pendingCommitRef.current = false;
    const next = clone(currentRef.current);
    if (equals(historyRef.current.present, next)) return;
    historyRef.current = commitCanvasHistory(historyRef.current, next);
  }, [value, clone, equals, flushRevision]);

  const record = useCallback(() => {
    if (transactionRef.current) return;
    pendingCommitRef.current = true;
    requestFlush();
  }, []);

  const beginTransaction = useCallback(() => {
    if (transactionRef.current) return;
    transactionRef.current = true;
    pendingCommitRef.current = false;
  }, []);

  const endTransaction = useCallback(() => {
    if (!transactionRef.current) return;
    transactionRef.current = false;
    pendingCommitRef.current = true;
    requestFlush();
  }, []);

  const reset = useCallback((next: T) => {
    pendingCommitRef.current = false;
    transactionRef.current = false;
    historyRef.current = resetCanvasHistory(historyRef.current, clone(next));
  }, [clone]);

  const undo = useCallback((): T | null => {
    pendingCommitRef.current = false;
    transactionRef.current = false;
    const next = undoCanvasHistory(historyRef.current);
    if (next === historyRef.current) return null;
    historyRef.current = next;
    return clone(next.present);
  }, [clone]);

  const redo = useCallback((): T | null => {
    pendingCommitRef.current = false;
    transactionRef.current = false;
    const next = redoCanvasHistory(historyRef.current);
    if (next === historyRef.current) return null;
    historyRef.current = next;
    return clone(next.present);
  }, [clone]);

  return { record, beginTransaction, endTransaction, reset, undo, redo };
}
```

- [ ] **Step 2: Verify framework isolation and compilation**

```powershell
pnpm --filter @flux/desktop typecheck
rg -n "react|@xyflow" apps/desktop/src/features/canvas/history/canvasHistory.ts
```

Expected: typecheck PASS; `rg` prints no matches.

- [ ] **Step 3: Commit the controller**

```powershell
git add -- apps/desktop/src/features/canvas/history/useCanvasHistoryController.ts
git commit -m "refactor: add canvas history controller"
```

### Task 4: Integrate history without transient selection state

**Files:**
- Modify: `apps/desktop/src/features/canvas/CanvasView.tsx`
- Modify: `apps/desktop/test/canvas-history.contract.mjs`

- [ ] **Step 1: Make the architecture contract require the new boundary**

Update the contract to read both history modules and require:

```js
[
  "canvas routes graph history through one controller",
  (source) =>
    /useCanvasHistoryController\(\{/.test(source) &&
    !/undoStackRef|redoStackRef|nodeDragHistoryRef/.test(source),
  canvasView,
],
[
  "history snapshot excludes selection and runtime actions",
  (source) =>
    /interface GraphSnapshot[\s\S]*nodes:[\s\S]*edges:[\s\S]*groups:/.test(source) &&
    !/selectedId:|selectedNodeIds:|selectedGroupId:/.test(
      source.slice(source.indexOf("interface GraphSnapshot"), source.indexOf("function missingRuntimeInputFields")),
    ) &&
    /actions:\s*undefined[\s\S]*run:\s*undefined/.test(source),
  canvasView,
],
[
  "node and group drags use history transactions",
  /onNodeDragStart=\{history\.beginTransaction\}[\s\S]*onNodeDragStop=\{history\.endTransaction\}[\s\S]*beginGroupDrag[\s\S]*history\.beginTransaction\(\)[\s\S]*endGroupDrag[\s\S]*history\.endTransaction\(\)/,
  canvasView,
],
[
  "the pure history model has no framework import",
  (source) => !/from ["']react["']|from ["']@xyflow\/react["']/.test(source),
  historyModel,
],
```

Run the contract and expect it to fail before integration.

- [ ] **Step 2: Reduce `GraphSnapshot` to persistent graph state**

Use:

```ts
interface GraphSnapshot {
  nodes: Node<FluxNodeData>[];
  edges: Edge[];
  groups: CanvasGroup[];
}

function cloneGraphSnapshot(snapshot: GraphSnapshot): GraphSnapshot {
  return {
    nodes: snapshot.nodes.map((node) => ({
      ...node,
      selected: false,
      position: { ...node.position },
      data: {
        ...node.data,
        inputs: node.data.inputs.map((input) => ({ ...input })),
        outputs: node.data.outputs.map((output) => ({ ...output })),
        config: cloneConfig(node.data.config),
        actions: undefined,
        run: undefined,
      },
    })),
    edges: snapshot.edges.map((edge) => ({ ...edge, selected: false })),
    groups: snapshot.groups.map((group) => ({ ...group, nodeIds: [...group.nodeIds] })),
  };
}

function equalGraphSnapshots(left: GraphSnapshot, right: GraphSnapshot): boolean {
  return graphSignature(left.nodes, left.edges, "", left.groups) ===
    graphSignature(right.nodes, right.edges, "", right.groups);
}
```

- [ ] **Step 3: Create and use the controller**

After `nodes`、`edges` and `groups` are declared:

```ts
const historyValue = useMemo<GraphSnapshot>(
  () => ({ nodes, edges, groups }),
  [nodes, edges, groups],
);
const history = useCanvasHistoryController({
  value: historyValue,
  clone: cloneGraphSnapshot,
  equals: equalGraphSnapshots,
  limit: 80,
});
const recordHistory = history.record;
```

Delete `MAX_HISTORY_DEPTH`、`undoStackRef`、`redoStackRef`、`nodeDragHistoryRef` and the old `recordHistory` stack implementation.

Reset history with the exact new graph in `resetCanvasDraft` and `applyWorkflowRecordToCanvas`:

```ts
history.reset({ nodes: freshNodes, edges: templateGraph?.edges ?? [], groups: [] });
history.reset({ nodes: ln, edges: le, groups: loadedGroups });
```

- [ ] **Step 4: Restore only graph state during undo and redo**

```ts
const restoreGraphSnapshot = useCallback((snapshot: GraphSnapshot) => {
  setNodes(snapshot.nodes);
  setEdges(snapshot.edges);
  setGroups(snapshot.groups);
  selection.clearCanvas();
  setPaletteOpen(false);
  setPaletteAnchor(null);
  setMenu(null);
}, [setNodes, setEdges, selection.clearCanvas]);

const undoGraph = useCallback(() => {
  const snapshot = history.undo();
  if (snapshot) restoreGraphSnapshot(snapshot);
}, [history.undo, restoreGraphSnapshot]);

const redoGraph = useCallback(() => {
  const snapshot = history.redo();
  if (snapshot) restoreGraphSnapshot(snapshot);
}, [history.redo, restoreGraphSnapshot]);
```

- [ ] **Step 5: Convert node and group drag to transactions**

Use direct React Flow props:

```tsx
onNodeDragStart={history.beginTransaction}
onNodeDragStop={history.endTransaction}
```

Call `history.beginTransaction()` in `beginGroupDrag` instead of `recordHistory()` and `history.endTransaction()` in `endGroupDrag` before clearing the group drag ref.

In `onCanvasNodesChange`, call `recordHistory()` for every graph-changing change. The controller ignores record calls while a transaction is active.

- [ ] **Step 6: Verify no legacy stacks or transient snapshot fields remain**

```powershell
rg -n "undoStackRef|redoStackRef|nodeDragHistoryRef" apps/desktop/src/features/canvas/CanvasView.tsx
pnpm --filter @flux/desktop typecheck
pnpm --filter @flux/desktop test:unit
node apps/desktop/test/canvas-history.contract.mjs
```

Expected: `rg` prints no matches; all other commands PASS.

- [ ] **Step 7: Run focused behavior regression and commit**

```powershell
pnpm exec playwright test -c e2e/playwright.config.ts e2e/canvas-history.spec.ts e2e/canvas-box-selection.spec.ts e2e/edge-selection-mode.spec.ts --workers=1
git add -- apps/desktop/src/features/canvas/CanvasView.tsx apps/desktop/test/canvas-history.contract.mjs
git commit -m "refactor: centralize canvas history control"
```

Expected: all focused E2E tests PASS before the commit.

### Task 5: Verify and record history phase evidence

**Files:**
- Modify: `docs/superpowers/specs/2026-07-20-canvas-interaction-architecture-design.md`

- [ ] **Step 1: Run the phase verification**

```powershell
pnpm --filter @flux/desktop typecheck
pnpm --filter @flux/desktop test:unit
node test/architecture-boundaries.contract.mjs
node apps/desktop/test/canvas-history.contract.mjs
pnpm exec playwright test -c e2e/playwright.config.ts e2e/canvas-history.spec.ts e2e/canvas-box-selection.spec.ts e2e/edge-selection-mode.spec.ts e2e/view-switch-continuity.spec.ts --workers=1
```

Expected: every command exits `0`.

- [ ] **Step 2: Perform a Tauri full-refresh history check**

After `Ctrl+R` and reopening a workflow:

1. Select a node and press `Ctrl+D`; a copy appears.
2. Press `Ctrl+Z`; the copy disappears.
3. Press `Ctrl+Shift+Z`; the copy returns.
4. Drag a node, press `Ctrl+Z`, then `Ctrl+Shift+Z`; it returns first to the start and then to the final drag position.
5. Confirm selection may clear during history restore and graph content remains intact.

- [ ] **Step 3: Update and commit the design evidence**

Update the status to include “阶段 2 历史控制器已完成”, append exact pass counts and Tauri results, then:

```powershell
git add -- docs/superpowers/specs/2026-07-20-canvas-interaction-architecture-design.md
git commit -m "docs: record canvas history architecture progress"
```

## Completion Check

- The pure history module imports no React or React Flow.
- The history state is explicitly `{ past, present, future, limit }`.
- New edits clear `future` and depth is bounded.
- `CanvasView` contains no dual undo/redo stack refs.
- History snapshots exclude selection, inspectors, runtime actions, and run state.
- Node and group drags are one transaction and redo restores the final position.
- Duplicate, undo, redo, branch edit, selection, edge, and view-switch E2E remain green.
- Tauri full-refresh undo/redo succeeds on real pointer and keyboard input.
- Unrelated dirty files remain unstaged.
