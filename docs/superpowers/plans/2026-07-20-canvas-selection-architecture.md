# Canvas Selection Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不改变 Flux 当前界面和操作习惯的前提下，为真实框选建立行为回归，并把画布选择规则从 `CanvasView` 收敛到唯一、可测试的选择控制器。

**Architecture:** `CanvasView` 继续持有 React Flow 的受控节点和连线，并作为页面组合根。纯 TypeScript reducer 负责选择互斥和规范化，React Hook 负责把画布事件翻译为 reducer 动作；React Flow 的 `selected` 字段只是选择状态的渲染投影。

**Tech Stack:** React 18、TypeScript、`@xyflow/react` 12、Node test runner、Playwright、Tauri 2、pnpm workspace

---

## Scope

本计划只实施总设计中的“阶段 0 行为安全网”和“阶段 1 选择控制器”。历史、快捷键和执行控制器分别使用后续独立计划，以保证本计划完成后软件处于可运行、可回归和可回退状态。

## File Map

| File | Responsibility |
| --- | --- |
| `e2e/canvas-box-selection.spec.ts` | 用真实鼠标拖拽验证框选矩形、部分相交、多选工具条和清空选择 |
| `apps/desktop/src/features/canvas/selection/canvasSelection.ts` | 无 React、无 React Flow 依赖的选择状态、动作和 reducer |
| `apps/desktop/src/features/canvas/selection/useCanvasSelectionController.ts` | 将画布交互转换为语义化选择动作，负责保留有效分组选择 |
| `apps/desktop/test/canvas-selection.test.mts` | 证明选择互斥、边锁定、检查器和删除后的状态规则 |
| `apps/desktop/src/features/canvas/CanvasView.tsx` | 使用选择控制器并删除五组分散的选择 `useState`/setter |
| `apps/desktop/test/canvas-multi-select-group.contract.mjs` | 从检查内部变量名改为检查控制器边界和框架隔离 |
| `apps/desktop/package.json` | 将选择模型测试加入桌面端单元测试命令 |
| `docs/superpowers/specs/2026-07-20-canvas-interaction-architecture-design.md` | 阶段通过后更新实施状态和证据 |

### Task 1: Lock the real box-selection behavior

**Files:**
- Create: `e2e/canvas-box-selection.spec.ts`

- [ ] **Step 1: Add a deterministic two-node workflow fixture and real pointer test**

Create the file with this complete test. It derives drag coordinates from rendered node bounds instead of hard-coding screen positions, so viewport fitting does not make the test fragile.

```ts
import { expect, test, type Page } from "@playwright/test";

const selectionWorkflow = {
  schemaVersion: 1,
  updatedAt: "2026-07-20T00:00:00.000Z",
  workflows: [
    {
      id: "local_box_selection",
      ownerId: "local-user",
      workspaceId: "local",
      title: "框选测试",
      tags: [],
      version: 1,
      status: "draft",
      isFavorite: false,
      createdAt: "2026-07-20T00:00:00.000Z",
      updatedAt: "2026-07-20T00:00:00.000Z",
      graph: {
        id: "wf_box_selection",
        version: 1,
        viewport: { x: 0, y: 0, zoom: 1 },
        meta: { title: "框选测试", tags: [] },
        nodes: [
          {
            id: "first-node",
            type: "flux.source.textConstant",
            position: { x: 220, y: 220 },
            data: { _label: "第一节点", text: "第一段文本" },
            ports: {
              inputs: [],
              outputs: [{ id: "out", name: "固定文本", dataType: "text" }],
            },
          },
          {
            id: "second-node",
            type: "flux.action.log",
            position: { x: 620, y: 360 },
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
    },
  ],
};

async function openSelectionWorkflow(page: Page) {
  await page.addInitScript((snapshot) => {
    localStorage.setItem("flux.desktop.local-workspace", JSON.stringify(snapshot));
    localStorage.setItem("flux.desktop.workspace-preference", "local");
  }, selectionWorkflow);
  await page.goto("/");
  await page.getByRole("button", { name: "打开 框选测试" }).click();
  await expect(page.locator(".react-flow__node")).toHaveCount(2);
}

test("left drag box-selects partially intersecting nodes and commits the selection", async ({ page }) => {
  await openSelectionWorkflow(page);

  const pane = page.locator(".react-flow__pane");
  const nodes = page.locator(".react-flow__node");
  const paneBox = await pane.boundingBox();
  const firstBox = await nodes.nth(0).boundingBox();
  const secondBox = await nodes.nth(1).boundingBox();
  expect(paneBox).not.toBeNull();
  expect(firstBox).not.toBeNull();
  expect(secondBox).not.toBeNull();
  if (!paneBox || !firstBox || !secondBox) throw new Error("canvas bounds are unavailable");

  const start = {
    x: Math.max(paneBox.x + 8, Math.min(firstBox.x, secondBox.x) - 18),
    y: Math.max(paneBox.y + 8, Math.min(firstBox.y, secondBox.y) - 18),
  };
  const end = {
    x: Math.min(
      paneBox.x + paneBox.width - 8,
      Math.max(firstBox.x + firstBox.width, secondBox.x + secondBox.width) + 18,
    ),
    y: Math.min(
      paneBox.y + paneBox.height - 8,
      Math.max(firstBox.y + firstBox.height, secondBox.y + secondBox.height) + 18,
    ),
  };

  await page.mouse.move(start.x, start.y);
  await page.mouse.down({ button: "left" });
  await page.mouse.move(end.x, end.y, { steps: 12 });
  await expect(page.locator(".react-flow__selection")).toBeVisible();
  await page.mouse.up({ button: "left" });

  await expect(page.locator(".react-flow__node.selected")).toHaveCount(2);
  await expect(page.getByRole("toolbar", { name: "批量节点操作" })).toContainText("已选 2 个节点");

  await pane.click({ position: { x: 8, y: paneBox.height - 8 } });
  await expect(page.locator(".react-flow__node.selected")).toHaveCount(0);
  await expect(page.getByRole("toolbar", { name: "批量节点操作" })).toHaveCount(0);
});
```

- [ ] **Step 2: Run the characterization test against the current implementation**

Run:

```powershell
pnpm exec playwright test -c e2e/playwright.config.ts e2e/canvas-box-selection.spec.ts
```

Expected: `1 passed`. This is a characterization test for behavior that currently works after a full page load; if it fails, fix test geometry only when the screenshot proves the drag missed the intended blank start point. A product behavior failure blocks refactoring.

- [ ] **Step 3: Commit the safety net**

```powershell
git add -- e2e/canvas-box-selection.spec.ts
git commit -m "test: lock canvas box selection behavior"
```

### Task 2: Build the pure selection model with TDD

**Files:**
- Create: `apps/desktop/test/canvas-selection.test.mts`
- Create: `apps/desktop/src/features/canvas/selection/canvasSelection.ts`
- Modify: `apps/desktop/package.json`

- [ ] **Step 1: Add the selection model test to the unit command**

Change `apps/desktop/package.json`:

```json
"test:unit": "node --test test/workflow-command-coordinator.test.mts test/workflow-session-service.test.mts test/workbench-service.test.mts test/sharing-service.test.mts test/canvas-selection.test.mts"
```

- [ ] **Step 2: Write failing reducer tests**

Create `apps/desktop/test/canvas-selection.test.mts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import {
  canvasSelectionReducer,
  createEmptyCanvasSelection,
} from "../src/features/canvas/selection/canvasSelection.ts";

test("flow node selection is unique and keeps only a fully retained group", () => {
  const selectedGroup = canvasSelectionReducer(createEmptyCanvasSelection(), {
    type: "select-group",
    groupId: "group-1",
    nodeIds: ["a", "b"],
  });
  const retained = canvasSelectionReducer(selectedGroup, {
    type: "sync-flow-selection",
    nodeIds: ["b", "a", "a"],
    edgeId: null,
    lockedEdgeId: null,
    retainedGroupId: "group-1",
  });
  assert.deepEqual(retained.nodeIds, ["b", "a"]);
  assert.equal(retained.primaryNodeId, null);
  assert.equal(retained.groupId, "group-1");

  const partial = canvasSelectionReducer(retained, {
    type: "sync-flow-selection",
    nodeIds: ["a"],
    edgeId: null,
    lockedEdgeId: null,
    retainedGroupId: null,
  });
  assert.deepEqual(partial.nodeIds, ["a"]);
  assert.equal(partial.primaryNodeId, "a");
  assert.equal(partial.groupId, null);
});

test("a locked connection edge wins over a simultaneous node selection", () => {
  const state = canvasSelectionReducer(createEmptyCanvasSelection(), {
    type: "sync-flow-selection",
    nodeIds: ["a", "b"],
    edgeId: null,
    lockedEdgeId: "edge-1",
    retainedGroupId: null,
  });
  assert.deepEqual(state.nodeIds, []);
  assert.equal(state.primaryNodeId, null);
  assert.equal(state.edgeId, "edge-1");
});

test("node, group, and edge selection are mutually exclusive", () => {
  const node = canvasSelectionReducer(createEmptyCanvasSelection(), {
    type: "select-node",
    nodeId: "a",
    mode: "replace",
    inspector: "open",
  });
  assert.deepEqual(node.nodeIds, ["a"]);
  assert.equal(node.inspectingNodeId, "a");

  const edge = canvasSelectionReducer(node, {
    type: "select-edge",
    edgeId: "edge-1",
    inspector: "close",
  });
  assert.deepEqual(edge.nodeIds, []);
  assert.equal(edge.groupId, null);
  assert.equal(edge.edgeId, "edge-1");
  assert.equal(edge.inspectingNodeId, null);

  const group = canvasSelectionReducer(edge, {
    type: "select-group",
    groupId: "group-1",
    nodeIds: ["a", "b"],
  });
  assert.deepEqual(group.nodeIds, ["a", "b"]);
  assert.equal(group.edgeId, null);
  assert.equal(group.groupId, "group-1");
});

test("modified node click leaves React Flow in charge of the node set", () => {
  const multi = canvasSelectionReducer(createEmptyCanvasSelection(), {
    type: "sync-flow-selection",
    nodeIds: ["a", "b"],
    edgeId: null,
    lockedEdgeId: null,
    retainedGroupId: null,
  });
  const prepared = canvasSelectionReducer(
    { ...multi, edgeId: "edge-1", inspectingNodeId: "a" },
    { type: "prepare-node-toggle" },
  );
  assert.deepEqual(prepared.nodeIds, ["a", "b"]);
  assert.equal(prepared.edgeId, null);
  assert.equal(prepared.inspectingNodeId, null);
});

test("removing nodes also removes stale primary and inspector targets", () => {
  const selected = canvasSelectionReducer(createEmptyCanvasSelection(), {
    type: "select-node",
    nodeId: "a",
    mode: "replace",
    inspector: "open",
  });
  const removed = canvasSelectionReducer(selected, {
    type: "remove-nodes",
    nodeIds: ["a"],
  });
  assert.deepEqual(removed.nodeIds, []);
  assert.equal(removed.primaryNodeId, null);
  assert.equal(removed.groupId, null);
  assert.equal(removed.inspectingNodeId, null);
});

test("closing an inspector does not clear canvas selection", () => {
  const selected = canvasSelectionReducer(createEmptyCanvasSelection(), {
    type: "select-node",
    nodeId: "a",
    mode: "replace",
    inspector: "open",
  });
  const closed = canvasSelectionReducer(selected, { type: "close-inspector" });
  assert.deepEqual(closed.nodeIds, ["a"]);
  assert.equal(closed.primaryNodeId, "a");
  assert.equal(closed.inspectingNodeId, null);
});
```

- [ ] **Step 3: Run the test to verify the missing model fails**

Run:

```powershell
pnpm --filter @flux/desktop test:unit
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `selection/canvasSelection.ts`.

- [ ] **Step 4: Implement the pure reducer**

Create `apps/desktop/src/features/canvas/selection/canvasSelection.ts`:

```ts
export interface CanvasSelectionState {
  nodeIds: string[];
  primaryNodeId: string | null;
  groupId: string | null;
  edgeId: string | null;
  inspectingNodeId: string | null;
}

type InspectorMode = "preserve" | "close" | "open";

export type CanvasSelectionAction =
  | { type: "reset" }
  | {
      type: "sync-flow-selection";
      nodeIds: string[];
      edgeId: string | null;
      lockedEdgeId: string | null;
      retainedGroupId: string | null;
    }
  | {
      type: "select-node";
      nodeId: string;
      mode: "replace" | "preserve";
      inspector: InspectorMode;
    }
  | { type: "prepare-node-toggle" }
  | { type: "select-group"; groupId: string; nodeIds: string[] }
  | { type: "select-edge"; edgeId: string | null; inspector: Exclude<InspectorMode, "open"> }
  | { type: "clear-canvas"; closeInspector: boolean }
  | { type: "close-inspector" }
  | { type: "remove-nodes"; nodeIds: string[] }
  | { type: "remove-edge"; edgeId: string }
  | { type: "clear-group"; groupId: string }
  | {
      type: "restore-graph-selection";
      nodeIds: string[];
      primaryNodeId: string | null;
      groupId: string | null;
    };

export function createEmptyCanvasSelection(): CanvasSelectionState {
  return {
    nodeIds: [],
    primaryNodeId: null,
    groupId: null,
    edgeId: null,
    inspectingNodeId: null,
  };
}

function uniqueIds(ids: string[]): string[] {
  return [...new Set(ids)];
}

function inspectorTarget(
  state: CanvasSelectionState,
  mode: InspectorMode,
  nodeId: string,
): string | null {
  if (mode === "open") return nodeId;
  if (mode === "close") return null;
  return state.inspectingNodeId;
}

export function canvasSelectionReducer(
  state: CanvasSelectionState,
  action: CanvasSelectionAction,
): CanvasSelectionState {
  switch (action.type) {
    case "reset":
      return createEmptyCanvasSelection();
    case "sync-flow-selection": {
      const nodeIds = uniqueIds(action.nodeIds);
      if (action.lockedEdgeId && nodeIds.length > 0) {
        return {
          ...state,
          nodeIds: [],
          primaryNodeId: null,
          groupId: null,
          edgeId: action.lockedEdgeId,
        };
      }
      if (nodeIds.length > 0) {
        return {
          ...state,
          nodeIds,
          primaryNodeId: nodeIds.length === 1 ? nodeIds[0] : null,
          groupId: action.retainedGroupId,
          edgeId: null,
        };
      }
      return {
        ...state,
        nodeIds: [],
        primaryNodeId: null,
        groupId: null,
        edgeId: action.edgeId ?? action.lockedEdgeId,
      };
    }
    case "select-node": {
      const nodeIds = action.mode === "preserve" ? state.nodeIds : [action.nodeId];
      return {
        ...state,
        nodeIds,
        primaryNodeId: action.nodeId,
        groupId: action.mode === "preserve" ? state.groupId : null,
        edgeId: null,
        inspectingNodeId: inspectorTarget(state, action.inspector, action.nodeId),
      };
    }
    case "prepare-node-toggle":
      return { ...state, edgeId: null, inspectingNodeId: null };
    case "select-group": {
      const nodeIds = uniqueIds(action.nodeIds);
      return {
        ...state,
        nodeIds,
        primaryNodeId: nodeIds.length === 1 ? nodeIds[0] : null,
        groupId: action.groupId,
        edgeId: null,
        inspectingNodeId: null,
      };
    }
    case "select-edge":
      return {
        ...state,
        nodeIds: [],
        primaryNodeId: null,
        groupId: null,
        edgeId: action.edgeId,
        inspectingNodeId: action.inspector === "close" ? null : state.inspectingNodeId,
      };
    case "clear-canvas":
      return {
        ...createEmptyCanvasSelection(),
        inspectingNodeId: action.closeInspector ? null : state.inspectingNodeId,
      };
    case "close-inspector":
      return { ...state, inspectingNodeId: null };
    case "remove-nodes": {
      const removed = new Set(action.nodeIds);
      const nodeIds = state.nodeIds.filter((id) => !removed.has(id));
      return {
        ...state,
        nodeIds,
        primaryNodeId: state.primaryNodeId && removed.has(state.primaryNodeId)
          ? nodeIds.length === 1 ? nodeIds[0] : null
          : state.primaryNodeId,
        groupId: null,
        inspectingNodeId: state.inspectingNodeId && removed.has(state.inspectingNodeId)
          ? null
          : state.inspectingNodeId,
      };
    }
    case "remove-edge":
      return state.edgeId === action.edgeId ? { ...state, edgeId: null } : state;
    case "clear-group":
      return state.groupId === action.groupId ? { ...state, groupId: null } : state;
    case "restore-graph-selection":
      return {
        nodeIds: uniqueIds(action.nodeIds),
        primaryNodeId: action.primaryNodeId,
        groupId: action.groupId,
        edgeId: null,
        inspectingNodeId: null,
      };
  }
}
```

- [ ] **Step 5: Run unit tests and typecheck**

Run:

```powershell
pnpm --filter @flux/desktop test:unit
pnpm --filter @flux/desktop typecheck
```

Expected: all desktop unit tests PASS; typecheck PASS.

- [ ] **Step 6: Commit the pure model**

```powershell
git add -- apps/desktop/package.json apps/desktop/test/canvas-selection.test.mts apps/desktop/src/features/canvas/selection/canvasSelection.ts
git commit -m "refactor: add canvas selection state model"
```

### Task 3: Add the React selection controller

**Files:**
- Create: `apps/desktop/src/features/canvas/selection/useCanvasSelectionController.ts`

- [ ] **Step 1: Implement the framework adapter**

Create `apps/desktop/src/features/canvas/selection/useCanvasSelectionController.ts`:

```ts
import { useCallback, useReducer } from "react";
import type { CanvasGroup } from "@flux/workflow-schema";
import {
  canvasSelectionReducer,
  createEmptyCanvasSelection,
} from "./canvasSelection.js";

interface CanvasSelectionControllerInput {
  groups: CanvasGroup[];
}

interface FlowSelectionInput {
  nodeIds: string[];
  edgeId: string | null;
  lockedEdgeId: string | null;
}

export function useCanvasSelectionController({ groups }: CanvasSelectionControllerInput) {
  const [state, dispatch] = useReducer(
    canvasSelectionReducer,
    undefined,
    createEmptyCanvasSelection,
  );

  const syncFlowSelection = useCallback((input: FlowSelectionInput) => {
    const retainedGroupId = state.groupId && groups.some((group) => (
      group.id === state.groupId &&
      group.nodeIds.every((nodeId) => input.nodeIds.includes(nodeId))
    )) ? state.groupId : null;
    dispatch({
      type: "sync-flow-selection",
      ...input,
      retainedGroupId,
    });
  }, [groups, state.groupId]);

  const selectNode = useCallback((
    nodeId: string,
    options: {
      mode?: "replace" | "preserve";
      inspector?: "preserve" | "close" | "open";
    } = {},
  ) => dispatch({
    type: "select-node",
    nodeId,
    mode: options.mode ?? "replace",
    inspector: options.inspector ?? "close",
  }), []);

  const selectGroup = useCallback((groupId: string, nodeIds: string[]) => {
    dispatch({ type: "select-group", groupId, nodeIds });
  }, []);
  const selectEdge = useCallback((
    edgeId: string | null,
    inspector: "preserve" | "close" = "close",
  ) => dispatch({ type: "select-edge", edgeId, inspector }), []);
  const clearCanvas = useCallback((closeInspector = true) => {
    dispatch({ type: "clear-canvas", closeInspector });
  }, []);
  const reset = useCallback(() => dispatch({ type: "reset" }), []);
  const prepareNodeToggle = useCallback(() => dispatch({ type: "prepare-node-toggle" }), []);
  const closeInspector = useCallback(() => dispatch({ type: "close-inspector" }), []);
  const removeNodes = useCallback((nodeIds: string[]) => {
    dispatch({ type: "remove-nodes", nodeIds });
  }, []);
  const removeEdge = useCallback((edgeId: string) => {
    dispatch({ type: "remove-edge", edgeId });
  }, []);
  const clearGroup = useCallback((groupId: string) => {
    dispatch({ type: "clear-group", groupId });
  }, []);
  const restoreGraphSelection = useCallback((input: {
    nodeIds: string[];
    primaryNodeId: string | null;
    groupId: string | null;
  }) => dispatch({ type: "restore-graph-selection", ...input }), []);

  return {
    state,
    syncFlowSelection,
    selectNode,
    selectGroup,
    selectEdge,
    clearCanvas,
    reset,
    prepareNodeToggle,
    closeInspector,
    removeNodes,
    removeEdge,
    clearGroup,
    restoreGraphSelection,
  };
}
```

- [ ] **Step 2: Verify the adapter compiles without adding framework types to the pure model**

Run:

```powershell
pnpm --filter @flux/desktop typecheck
rg -n "react|@xyflow" apps/desktop/src/features/canvas/selection/canvasSelection.ts
```

Expected: typecheck PASS; `rg` prints no matches.

- [ ] **Step 3: Commit the adapter**

```powershell
git add -- apps/desktop/src/features/canvas/selection/useCanvasSelectionController.ts
git commit -m "refactor: add canvas selection controller"
```

### Task 4: Route every CanvasView selection transition through the controller

**Files:**
- Modify: `apps/desktop/src/features/canvas/CanvasView.tsx:64-104,361-420,453-534,568-733,835-879,900-1193,1319-1368,1545-1703,1830-1838,1976-2206,2291-2299`
- Modify: `apps/desktop/test/canvas-multi-select-group.contract.mjs`

- [ ] **Step 1: Make the architecture contract fail until the controller is wired**

Add reads for the controller and pure model:

```js
const selectionController = readFileSync(
  resolve(desktopRoot, "src/features/canvas/selection/useCanvasSelectionController.ts"),
  "utf8",
);
const selectionModel = readFileSync(
  resolve(desktopRoot, "src/features/canvas/selection/canvasSelection.ts"),
  "utf8",
);
```

Replace the old “multi-selection is controlled independently” requirement with:

```js
[
  "canvas selection is routed through one controller and projected into React Flow nodes",
  (source) =>
    /useCanvasSelectionController\(\{ groups \}\)/.test(source) &&
    /onSelectionChange=\{onCanvasSelectionChange\}/.test(source) &&
    /selected: selectedNodeIdSet\.has\(node\.id\)/.test(source) &&
    !/setSelected(?:Id|NodeIds|GroupId|EdgeId)|setInspectingId/.test(source),
  canvas,
],
[
  "the pure selection policy does not import React or React Flow",
  (source) =>
    !/from ["']react["']|from ["']@xyflow\/react["']/.test(source) &&
    /function canvasSelectionReducer/.test(source),
  selectionModel,
],
[
  "the selection controller retains a group only while all members stay selected",
  /group\.nodeIds\.every[\s\S]*type: "sync-flow-selection"/,
  selectionController,
],
```

Run:

```powershell
node apps/desktop/test/canvas-multi-select-group.contract.mjs
```

Expected: FAIL because `CanvasView` still contains raw selection setters and does not use the controller.

- [ ] **Step 2: Replace the five selection states with the controller**

Import:

```ts
import { useCanvasSelectionController } from "./selection/useCanvasSelectionController.js";
```

Immediately after `groups` state, create and unpack the single state:

```ts
const selection = useCanvasSelectionController({ groups });
const {
  nodeIds: selectedNodeIds,
  primaryNodeId: selectedId,
  groupId: selectedGroupId,
  edgeId: selectedEdgeId,
  inspectingNodeId: inspectingId,
} = selection.state;
```

Delete these declarations:

```ts
const [selectedId, setSelectedId] = useState<string | null>(null);
const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
const [inspectingId, setInspectingId] = useState<string | null>(null);
```

- [ ] **Step 3: Replace reset, restore, deletion, and inspector transitions**

Use these exact semantic conversions throughout `CanvasView.tsx`:

| Existing transition | Replacement |
| --- | --- |
| clear all five selection setters | `selection.reset()` or `selection.clearCanvas()` |
| restore `selectedId`, `selectedNodeIds`, `selectedGroupId` and clear edge/inspector | `selection.restoreGraphSelection({ primaryNodeId: snapshot.selectedId, nodeIds: snapshot.selectedNodeIds, groupId: snapshot.selectedGroupId })` |
| select one node and close inspector | `selection.selectNode(nodeId)` |
| select one node and open inspector | `selection.selectNode(nodeId, { inspector: "open" })` |
| close only inspector | `selection.closeInspector()` |
| delete node(s) and prune selection | `selection.removeNodes(ids)` |
| delete selected edge | `selection.removeEdge(edgeId)` |
| select group | `selection.selectGroup(group.id, nodeIds)` |
| ungroup current group | `selection.clearGroup(groupId)` |
| select edge and close inspector | `selection.selectEdge(edgeId)` |

The snapshot restore block becomes:

```ts
selection.restoreGraphSelection({
  nodeIds: snapshot.selectedNodeIds,
  primaryNodeId: snapshot.selectedId,
  groupId: snapshot.selectedGroupId,
});
```

The inspector close callback becomes:

```tsx
onClose={selection.closeInspector}
```

- [ ] **Step 4: Replace the React Flow selection boundary**

Change `onCanvasSelectionChange` to keep only the framework-object adaptation and edge ref:

```ts
const onCanvasSelectionChange = useCallback((flowSelection: {
  nodes: Node<FluxNodeData>[];
  edges: Edge[];
}) => {
  const lockedEdgeId = selectedEdgeDragRef.current?.id ?? null;
  const selectedEdge = flowSelection.edges.length === 1 ? flowSelection.edges[0] : null;
  if (selectedEdge) selectedEdgeDragRef.current = selectedEdge;
  selection.syncFlowSelection({
    nodeIds: flowSelection.nodes.map((node) => node.id),
    edgeId: selectedEdge?.id ?? null,
    lockedEdgeId,
  });
}, [selection.syncFlowSelection]);
```

In `onCanvasEdgesChange`, route selected/deselected IDs through `selection.selectEdge` and `selection.removeEdge`, then retain the existing `applyEdgeChanges` call:

```ts
const selectedChange = changes.find((change) => change.type === "select" && change.selected);
if (selectedChange?.type === "select" && selectedChange.selected) {
  selection.selectEdge(selectedChange.id, "preserve");
} else {
  const lockedEdgeId = selectedEdgeDragRef.current?.id ?? null;
  if (lockedEdgeId) {
    selection.selectEdge(lockedEdgeId, "preserve");
  } else {
    for (const change of changes) {
      if (change.type === "select" && !change.selected) selection.removeEdge(change.id);
    }
  }
}
setEdges((current) => applyEdgeChanges(changes, current));
```

- [ ] **Step 5: Replace React Flow pointer callbacks without changing behavior**

For an unmodified node click:

```ts
selection.selectNode(node.id);
```

For a Ctrl/Meta/Shift node click, leave the node set to React Flow and only clear conflicting transient selection:

```ts
selection.prepareNodeToggle();
```

For node double-click:

```ts
selection.selectNode(node.id, { inspector: "open" });
```

For edge click:

```ts
selectedEdgeDragRef.current = edge;
selection.selectEdge(edge.id);
```

For pane click and pane context menu:

```ts
selectedEdgeDragRef.current = null;
selection.clearCanvas();
```

For node context menu, preserve a pre-existing multi-selection only when the clicked node belongs to it:

```ts
const preserveMultiSelection = selectedNodeIds.includes(node.id) && selectedNodeIds.length > 1;
selection.selectNode(node.id, {
  mode: preserveMultiSelection ? "preserve" : "replace",
  inspector: "preserve",
});
```

- [ ] **Step 6: Prove no raw selection setters remain**

Run:

```powershell
rg -n "setSelectedId|setSelectedNodeIds|setSelectedGroupId|setSelectedEdgeId|setInspectingId" apps/desktop/src/features/canvas/CanvasView.tsx
pnpm --filter @flux/desktop typecheck
node apps/desktop/test/canvas-multi-select-group.contract.mjs
```

Expected: `rg` prints no matches; typecheck PASS; contract PASS.

- [ ] **Step 7: Run unit and focused E2E regression**

Run:

```powershell
pnpm --filter @flux/desktop test:unit
pnpm exec playwright test -c e2e/playwright.config.ts e2e/canvas-box-selection.spec.ts e2e/edge-selection-mode.spec.ts
```

Expected: all desktop unit tests PASS; all tests in both focused E2E files PASS.

- [ ] **Step 8: Commit the controller integration**

```powershell
git add -- apps/desktop/src/features/canvas/CanvasView.tsx apps/desktop/test/canvas-multi-select-group.contract.mjs
git commit -m "refactor: centralize canvas selection control"
```

### Task 5: Run the phase regression and record evidence

**Files:**
- Modify: `docs/superpowers/specs/2026-07-20-canvas-interaction-architecture-design.md`

- [ ] **Step 1: Run static, unit, architecture, and focused behavior checks**

Run:

```powershell
pnpm --filter @flux/desktop typecheck
pnpm --filter @flux/desktop test:unit
node test/architecture-boundaries.contract.mjs
node apps/desktop/test/canvas-multi-select-group.contract.mjs
pnpm exec playwright test -c e2e/playwright.config.ts e2e/canvas-box-selection.spec.ts e2e/edge-selection-mode.spec.ts e2e/view-switch-continuity.spec.ts
```

Expected: every command exits `0` and every Playwright test passes.

- [ ] **Step 2: Verify a fresh browser page rather than an HMR-retained page**

Run the focused Playwright command a second time with a fresh browser worker:

```powershell
pnpm exec playwright test -c e2e/playwright.config.ts e2e/canvas-box-selection.spec.ts --workers=1
```

Expected: `1 passed`; the run launches a new browser context and does not reuse the prior page state.

- [ ] **Step 3: Verify the Tauri development window after a full reload or restart**

Use the already running Tauri application when available. Perform these visible operations after `Ctrl+R`; if the window or dev server is not healthy, restart with `pnpm --filter @flux/desktop tauri:dev` and then perform them:

1. Open a workflow containing at least two nodes.
2. Left-drag from blank canvas across both nodes.
3. Confirm the selection rectangle appears during the drag.
4. Confirm both nodes remain selected after release and the batch toolbar appears.
5. Click blank canvas and confirm the selection clears.
6. Select an edge and press `Escape`; confirm its endpoint highlighting clears.

Expected: all six checks succeed with no console error.

- [ ] **Step 4: Update the design status with concrete evidence**

Change the status line to:

```markdown
- 状态：实施中（阶段 0 行为安全网与阶段 1 选择控制器已完成）
```

Append an implementation evidence section containing the exact commands and observed pass counts from Steps 1–3. Do not claim the history、快捷键或执行控制器已经完成。

- [ ] **Step 5: Commit the verified phase record**

```powershell
git add -- docs/superpowers/specs/2026-07-20-canvas-interaction-architecture-design.md
git commit -m "docs: record canvas selection architecture progress"
```

## Completion Check

This plan is complete only when all of the following are true:

- `CanvasView.tsx` contains none of the five legacy selection setter names.
- The pure selection model imports neither React nor React Flow.
- Reducer tests prove node/group/edge exclusivity, locked-edge priority, inspector isolation, and removal cleanup.
- Real left-drag E2E proves selection rectangle visibility and committed multi-selection.
- Existing edge selection/reconnection E2E remains green.
- Architecture checks and desktop typecheck pass.
- A full reload or cold-start Tauri check confirms the same box-selection behavior.
- Only files named by this plan are included in its commits; unrelated dirty workspace files remain untouched.
