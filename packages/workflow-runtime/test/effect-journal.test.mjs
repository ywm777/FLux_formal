import assert from "node:assert/strict";
import test from "node:test";
import { NodeRegistry, defineNode } from "@flux/node-sdk";
import { runWorkflow } from "../dist/index.js";

function graph(type, retryTimes = 0) {
  return {
    schemaVersion: 2,
    id: "effect-journal",
    version: 3,
    viewport: { x: 0, y: 0, zoom: 1 },
    meta: { title: "Effect journal", tags: [] },
    nodes: [{
      id: "effect",
      type,
      position: { x: 0, y: 0 },
      data: { retryTimes },
      ports: {
        inputs: [],
        outputs: [{ id: "out", name: "out", dataType: "any", capacity: "one" }],
      },
    }],
    edges: [],
  };
}

function registry(type, afterInvoke) {
  const nodes = new NodeRegistry();
  nodes.register(defineNode({
    id: type,
    name: "Effect",
    category: "test",
    icon: "test",
    version: "1.0.0",
    carrier: "app",
    ports: { inputs: [], outputs: [{ id: "out", name: "out" }] },
    configSchema: { type: "object" },
    async execute(context) {
      const result = await context.invoke("binding", "write", { value: 1 });
      await afterInvoke();
      return { outputs: { out: result } };
    },
  }));
  return nodes;
}

function memoryJournal(options = {}) {
  const records = new Map();
  let completeCalls = 0;
  return {
    records,
    journal: {
      async begin(invocation) {
        const existing = records.get(invocation.id);
        return existing?.status === "completed"
          ? { kind: "replay", result: existing.result }
          : { kind: "execute" };
      },
      async complete(invocation, result) {
        completeCalls += 1;
        if (options.failFirstComplete && completeCalls === 1) {
          throw new Error("journal write interrupted");
        }
        records.set(invocation.id, { status: "completed", result });
      },
      async fail(invocation, error) {
        records.set(invocation.id, { status: "failed", error });
      },
    },
  };
}

test("completed capability effects replay after a crash before node checkpoint", async () => {
  const type = "test.effect-replay";
  let crashAfterEffect = true;
  let providerCalls = 0;
  const metadata = [];
  const effects = memoryJournal();
  const nodes = registry(type, async () => {
    if (crashAfterEffect) throw new Error("process crashed before checkpoint");
  });
  const invoke = async (_binding, _action, _payload, meta) => {
    providerCalls += 1;
    metadata.push(meta);
    return { providerCall: providerCalls };
  };

  const failed = await runWorkflow(graph(type), nodes, {
    executionId: "execution-stable",
    effectJournal: effects.journal,
    invoke,
  });
  assert.equal(failed.status, "failed");
  crashAfterEffect = false;

  const resumed = await runWorkflow(graph(type), nodes, {
    executionId: "execution-stable",
    effectJournal: effects.journal,
    invoke,
  });
  assert.equal(resumed.status, "success");
  assert.equal(providerCalls, 1, "completed external effect must not execute twice");
  assert.deepEqual(resumed.runs[0].outputs, { out: { providerCall: 1 } });
  assert.match(metadata[0].idempotencyKey, /^flux_[a-f0-9]{64}$/);
});

test("provider retries receive the same idempotency key when journal completion is interrupted", async () => {
  const type = "test.effect-retry-key";
  const effects = memoryJournal({ failFirstComplete: true });
  const keys = [];
  const attempts = [];
  const result = await runWorkflow(
    graph(type, 1),
    registry(type, async () => undefined),
    {
      executionId: "execution-retry",
      effectJournal: effects.journal,
      async invoke(_binding, _action, _payload, metadata) {
        keys.push(metadata.idempotencyKey);
        attempts.push(metadata.attempt);
        return { ok: true };
      },
    },
  );

  assert.equal(result.status, "success");
  assert.deepEqual(attempts, [1, 2]);
  assert.equal(keys[0], keys[1], "retry must preserve the provider idempotency key");
});

test("capability results must be bounded JSON before journal persistence", async () => {
  const type = "test.effect-result-contract";
  const effects = memoryJournal();
  const result = await runWorkflow(
    graph(type),
    registry(type, async () => undefined),
    {
      executionId: "execution-invalid-result",
      effectJournal: effects.journal,
      async invoke() {
        return { value: 1n };
      },
    },
  );

  assert.equal(result.status, "failed");
  assert.match(result.runs[0].error, /外部能力结果无法安全持久化/);
  assert.equal([...effects.records.values()][0]?.status, "failed");
});
