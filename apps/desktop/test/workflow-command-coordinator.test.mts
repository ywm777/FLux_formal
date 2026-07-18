import assert from "node:assert/strict";
import test from "node:test";
import {
  createWorkflowCommandCoordinator,
  type WorkflowCommandHandlers,
} from "../src/app/workflowCommandCoordinator.ts";

function handlers(
  calls: string[],
  prefix: string,
): WorkflowCommandHandlers {
  return {
    save: async () => { calls.push(`${prefix}:save`); },
    publish: async () => { calls.push(`${prefix}:publish`); },
    share: async () => { calls.push(`${prefix}:share`); },
    testRun: async () => { calls.push(`${prefix}:test-run`); },
  };
}

test("commands are harmless before a canvas session registers", async () => {
  const coordinator = createWorkflowCommandCoordinator();
  await coordinator.commands.save();
  await coordinator.commands.publish();
  await coordinator.commands.share();
  await coordinator.commands.testRun();
});

test("commands reach the active canvas session", async () => {
  const calls: string[] = [];
  const coordinator = createWorkflowCommandCoordinator();
  coordinator.register(handlers(calls, "active"));

  await coordinator.commands.save();
  await coordinator.commands.publish();
  await coordinator.commands.share();
  await coordinator.commands.testRun();

  assert.deepEqual(calls, [
    "active:save",
    "active:publish",
    "active:share",
    "active:test-run",
  ]);
});

test("stale cleanup cannot disconnect a newer canvas session", async () => {
  const calls: string[] = [];
  const coordinator = createWorkflowCommandCoordinator();
  const unregisterFirst = coordinator.register(handlers(calls, "first"));
  const unregisterSecond = coordinator.register(handlers(calls, "second"));

  unregisterFirst();
  await coordinator.commands.save();
  unregisterSecond();
  await coordinator.commands.save();

  assert.deepEqual(calls, ["second:save"]);
});

test("command failures propagate to the caller", async () => {
  const coordinator = createWorkflowCommandCoordinator();
  const failure = new Error("save failed");
  coordinator.register({
    save: async () => { throw failure; },
    publish: async () => undefined,
    share: async () => undefined,
    testRun: async () => undefined,
  });

  await assert.rejects(() => coordinator.commands.save(), failure);
});
