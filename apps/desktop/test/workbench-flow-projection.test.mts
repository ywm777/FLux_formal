import assert from "node:assert/strict";
import test from "node:test";
import { EXECUTION_STATUS, type WorkflowSummary } from "@flux/shared";
import {
  matchesWorkbenchFlowFilter,
  projectWorkbenchFlows,
  type WorkbenchRuntimeSnapshot,
} from "../src/features/workbench/domain/workbenchFlowProjection.ts";

function workflow(id: string, status: "draft" | "published" = "published"): WorkflowSummary {
  return {
    id,
    ownerId: "owner",
    workspaceId: "workspace",
    title: `流程 ${id}`,
    tags: [],
    version: 1,
    status,
    isFavorite: false,
    createdAt: "2026-08-11T00:00:00.000Z",
    updatedAt: "2026-08-11T00:00:00.000Z",
  };
}

function runtime(
  status: WorkbenchRuntimeSnapshot["status"],
  error: string | null = null,
): WorkbenchRuntimeSnapshot {
  return {
    status,
    triggerCount: 1,
    timezone: "Asia/Shanghai",
    nextRunAt: "2026-08-12T01:00:00.000Z",
    lastRunAt: "2026-08-11T01:00:00.000Z",
    error,
  };
}

test("projects definitions and runtime snapshots into one prioritized flow view", () => {
  const projection = projectWorkbenchFlows(
    [workflow("ready"), workflow("draft", "draft"), workflow("running"), workflow("failed"), workflow("done"), workflow("scheduled")],
    {
      running: runtime(EXECUTION_STATUS.RUNNING),
      failed: runtime(EXECUTION_STATUS.FAILED, "连接超时"),
      done: runtime(EXECUTION_STATUS.SUCCESS),
      scheduled: runtime("waiting"),
    },
  );

  assert.deepEqual(projection.items.map((item) => item.workflow.id), [
    "failed",
    "running",
    "scheduled",
    "done",
    "ready",
    "draft",
  ]);
  assert.deepEqual(projection.overview, {
    total: 6,
    attention: 1,
    running: 1,
    scheduled: 1,
    completed: 1,
  });
  assert.equal(projection.items[0]?.statusLabel, "运行失败");
  assert.equal(projection.items[0]?.error, "连接超时");
});

test("paused executions become actionable instead of being reported as generic running state", () => {
  const projection = projectWorkbenchFlows(
    [workflow("approval")],
    { approval: runtime(EXECUTION_STATUS.PAUSED) },
  );

  assert.equal(projection.items[0]?.state, "attention");
  assert.equal(projection.items[0]?.statusLabel, "等待处理");
  assert.equal(matchesWorkbenchFlowFilter(projection.items[0]!, "attention"), true);
  assert.equal(matchesWorkbenchFlowFilter(projection.items[0]!, "running"), false);
});

test("published definitions without runtime data remain ready without invented progress", () => {
  const projection = projectWorkbenchFlows([workflow("manual")], {});
  const item = projection.items[0]!;

  assert.equal(item.state, "ready");
  assert.equal(item.statusLabel, "可运行");
  assert.equal(item.nextRunAt, null);
  assert.equal(item.lastRunAt, null);
});
