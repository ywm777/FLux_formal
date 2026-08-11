/* eslint-disable no-console */
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NodeRegistry, defineNode } from "@flux/node-sdk";
import {
  runWorkflow,
  type ExecutionEffectInvocation,
} from "@flux/workflow-runtime";
import {
  CURRENT_WORKFLOW_SCHEMA_VERSION,
  type WorkflowGraph,
} from "@flux/workflow-schema";
import { InMemoryExecutionsRepository } from "../../database/memory/in-memory-executions.repository";
import { FileDb } from "../../database/file/file-db";
import { FileExecutionsRepository } from "../../database/file/file-executions.repository";
import { createExecutionEffectJournal } from "./execution-effect-journal";

async function main(): Promise<void> {
  const executions = new InMemoryExecutionsRepository();
  const execution = await executions.create({
    workflowId: "effect-workflow",
    ownerId: "effect-owner",
    graphSnapshot: {},
  });
  const type = "test.cloud-effect";
  let failAfterEffect = true;
  let providerCalls = 0;
  const registry = new NodeRegistry();
  registry.register(defineNode({
    id: type,
    name: "Cloud effect",
    category: "test",
    icon: "test",
    version: "1.0.0",
    carrier: "app",
    ports: { inputs: [], outputs: [{ id: "out", name: "out" }] },
    configSchema: { type: "object" },
    async execute(context) {
      const result = await context.invoke("connection-a", "messages.send", {
        text: "hello",
      });
      if (failAfterEffect) throw new Error("simulated crash before checkpoint");
      return { outputs: { out: result } };
    },
  }));
  const graph: WorkflowGraph = {
    schemaVersion: CURRENT_WORKFLOW_SCHEMA_VERSION,
    id: "cloud-effect-journal",
    version: 1,
    viewport: { x: 0, y: 0, zoom: 1 },
    meta: { title: "Cloud effect journal", tags: [] },
    nodes: [{
      id: "effect-node",
      type,
      position: { x: 0, y: 0 },
      data: {},
      ports: {
        inputs: [],
        outputs: [{ id: "out", name: "out", dataType: "any", capacity: "one" }],
      },
    }],
    edges: [],
  };
  const invoke = async () => {
    providerCalls += 1;
    return { messageId: `message-${providerCalls}` };
  };
  const effectJournal = createExecutionEffectJournal(executions);

  const first = await runWorkflow(graph, registry, {
    executionId: execution.id,
    effectJournal,
    invoke,
  });
  assert.equal(first.status, "failed");
  assert.equal(providerCalls, 1);

  const effects = await executions.listEffects(execution.id);
  assert.equal(effects.length, 1);
  assert.equal(effects[0]?.status, "completed");
  assert.match(effects[0]?.id ?? "", /^flux_[a-f0-9]{64}$/);

  failAfterEffect = false;
  const recovered = await runWorkflow(graph, registry, {
    executionId: execution.id,
    effectJournal,
    invoke,
  });
  assert.equal(recovered.status, "success");
  assert.equal(providerCalls, 1, "durable completed effect must replay after recovery");
  assert.deepEqual(recovered.runs[0]?.outputs, {
    out: { messageId: "message-1" },
  });

  const completed = effects[0]!;
  const invocation: ExecutionEffectInvocation = {
    id: completed.id,
    bindingId: completed.bindingId,
    action: completed.action,
    metadata: completed.metadata,
  };
  await executions.failEffect(invocation, "late failure");
  assert.equal((await executions.listEffects(execution.id))[0]?.status, "completed");

  await assert.rejects(
    executions.beginEffect({ ...invocation, action: "messages.delete" }),
    /幂等键冲突/,
  );

  const ambiguousExecution = await executions.create({
    workflowId: "ambiguous-effect-workflow",
    ownerId: "effect-owner",
    graphSnapshot: {},
  });
  const ambiguousInvocation: ExecutionEffectInvocation = {
    id: `flux_${"b".repeat(64)}`,
    bindingId: "connection-b",
    action: "payments.capture",
    metadata: {
      executionId: ambiguousExecution.id,
      nodeId: "payment-node",
      attempt: 1,
      invocationIndex: 0,
      idempotencyKey: `flux_${"b".repeat(64)}`,
    },
  };
  assert.deepEqual(await executions.beginEffect(ambiguousInvocation), {
    kind: "execute",
  });
  assert.deepEqual(await executions.beginEffect(ambiguousInvocation), {
    kind: "execute",
  });
  await executions.failEffect(ambiguousInvocation, "x".repeat(2_000));
  const failedEffect = (await executions.listEffects(ambiguousExecution.id))[0];
  assert.equal(failedEffect?.status, "failed");
  assert.equal(failedEffect?.error?.length, 1_024);
  assert.deepEqual(await executions.beginEffect({
    ...ambiguousInvocation,
    metadata: { ...ambiguousInvocation.metadata, attempt: 2 },
  }), { kind: "execute" });
  assert.equal(
    (await executions.listEffects(ambiguousExecution.id))[0]?.metadata.attempt,
    2,
  );

  const temp = mkdtempSync(join(tmpdir(), "flux-effect-journal-"));
  const previousDataDir = process.env.FLUX_DATA_DIR;
  process.env.FLUX_DATA_DIR = temp;
  try {
    const fileExecutions = new FileExecutionsRepository(new FileDb());
    const fileExecution = await fileExecutions.create({
      workflowId: "file-effect-workflow",
      ownerId: "file-effect-owner",
      graphSnapshot: {},
    });
    const fileInvocation: ExecutionEffectInvocation = {
      id: `flux_${"a".repeat(64)}`,
      bindingId: "connection-file",
      action: "records.create",
      metadata: {
        executionId: fileExecution.id,
        nodeId: "file-node",
        attempt: 1,
        invocationIndex: 0,
        idempotencyKey: `flux_${"a".repeat(64)}`,
      },
    };
    assert.deepEqual(await fileExecutions.beginEffect(fileInvocation), {
      kind: "execute",
    });
    await fileExecutions.completeEffect(fileInvocation, { recordId: "record-1" });

    const restarted = new FileExecutionsRepository(new FileDb());
    assert.deepEqual(await restarted.beginEffect(fileInvocation), {
      kind: "replay",
      result: { recordId: "record-1" },
    });
  } finally {
    if (previousDataDir === undefined) delete process.env.FLUX_DATA_DIR;
    else process.env.FLUX_DATA_DIR = previousDataDir;
    rmSync(temp, { recursive: true, force: true });
  }

  console.log("✅ durable execution effect journal smoke 全部通过");
}

void main();
