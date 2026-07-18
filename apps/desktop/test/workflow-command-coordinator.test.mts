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
    openWorkflow: async (workflowId) => {
      calls.push(`${prefix}:open:${workflowId}`);
    },
    createDraft: async (input) => {
      calls.push(
        `${prefix}:create:${input.title}:${input.templateId ?? "blank"}`,
      );
    },
    addNode: async () => { calls.push(`${prefix}:add-node`); },
    insertNodeType: async (nodeType) => {
      calls.push(`${prefix}:insert:${nodeType}`);
    },
    renameWorkflow: async () => { calls.push(`${prefix}:rename`); },
  };
}

test("commands are harmless before a canvas session registers", async () => {
  const coordinator = createWorkflowCommandCoordinator();
  await coordinator.commands.save();
  await coordinator.commands.publish();
  await coordinator.commands.share();
  await coordinator.commands.testRun();
  await coordinator.commands.addNode();
  await coordinator.commands.insertNodeType("flux.action.log");
  await coordinator.commands.renameWorkflow();
});

test("commands reach the active canvas session", async () => {
  const calls: string[] = [];
  const coordinator = createWorkflowCommandCoordinator();
  coordinator.register(handlers(calls, "active"));

  await coordinator.commands.save();
  await coordinator.commands.publish();
  await coordinator.commands.share();
  await coordinator.commands.testRun();
  await coordinator.commands.openWorkflow("workflow-1");
  await coordinator.commands.createDraft({ title: "Template", templateId: "t1" });
  await coordinator.commands.addNode();
  await coordinator.commands.insertNodeType("flux.action.log");
  await coordinator.commands.renameWorkflow();

  assert.deepEqual(calls, [
    "active:save",
    "active:publish",
    "active:share",
    "active:test-run",
    "active:open:workflow-1",
    "active:create:Template:t1",
    "active:add-node",
    "active:insert:flux.action.log",
    "active:rename",
  ]);
});

test("navigation waits for a canvas session and is delivered after registration", async () => {
  const calls: string[] = [];
  const coordinator = createWorkflowCommandCoordinator();
  let settled = false;
  const pending = coordinator.commands.openWorkflow("late-workflow").then(() => {
    settled = true;
  });

  await Promise.resolve();
  assert.equal(settled, false);

  coordinator.register(handlers(calls, "late"));
  await pending;

  assert.equal(settled, true);
  assert.deepEqual(calls, ["late:open:late-workflow"]);
});

test("only the latest pending navigation intent is delivered", async () => {
  const calls: string[] = [];
  const coordinator = createWorkflowCommandCoordinator();
  let supersededSettled = false;
  const superseded = coordinator.commands
    .createDraft({ title: "First" })
    .then(() => {
      supersededSettled = true;
    });
  const latest = coordinator.commands.openWorkflow("latest-workflow");

  await superseded;
  assert.equal(supersededSettled, true);

  coordinator.register(handlers(calls, "active"));
  await latest;

  assert.deepEqual(calls, ["active:open:latest-workflow"]);
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
    openWorkflow: async () => undefined,
    createDraft: async () => undefined,
    addNode: async () => undefined,
    insertNodeType: async () => undefined,
    renameWorkflow: async () => undefined,
  });

  await assert.rejects(() => coordinator.commands.save(), failure);
});
