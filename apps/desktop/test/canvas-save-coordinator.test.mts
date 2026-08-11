import assert from "node:assert/strict";
import test from "node:test";
import {
  createCanvasSaveCoordinator,
  type CanvasSaveOperation,
} from "../src/features/canvas/session/canvasSaveCoordinator.ts";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

test("serializes writes, coalesces pending snapshots, and creates a draft only once", async () => {
  const coordinator = createCanvasSaveCoordinator<{ id: string; version: number }>();
  const firstWrite = deferred<{ id: string; version: number }>();
  let workflowId: string | null = null;
  let version = 0;
  let createCalls = 0;
  let updateCalls = 0;
  const starts: string[] = [];
  const committed: string[] = [];

  function enqueue(
    signature: string,
    operation: CanvasSaveOperation,
    block = false,
  ) {
    return coordinator.enqueue({
      signature,
      operation,
      onStart: () => starts.push(signature),
      execute: async (effectiveOperation) => {
        assert.equal(effectiveOperation, signature === "v3" ? "publish" : "save");
        if (!workflowId) {
          createCalls += 1;
          return block
            ? firstWrite.promise
            : { id: "created", version: 1 };
        }
        updateCalls += 1;
        return { id: workflowId, version: version + 1 };
      },
      onSuccess: (record, committedSignature) => {
        workflowId = record.id;
        version = record.version;
        committed.push(committedSignature);
      },
      onError: (error) => assert.fail(String(error)),
    });
  }

  const first = enqueue("v1", "save", true);
  const superseded = enqueue("v2", "save");
  const latest = enqueue("v3", "publish");

  assert.deepEqual(starts, ["v1"]);
  firstWrite.resolve({ id: "created", version: 1 });

  assert.deepEqual(await first, { id: "created", version: 1 });
  assert.deepEqual(await superseded, { id: "created", version: 2 });
  assert.deepEqual(await latest, { id: "created", version: 2 });
  assert.equal(createCalls, 1);
  assert.equal(updateCalls, 1);
  assert.deepEqual(starts, ["v1", "v3"]);
  assert.deepEqual(committed, ["v1", "v3"]);
});

test("invalidating a session suppresses every callback from stale responses", async () => {
  const coordinator = createCanvasSaveCoordinator<{ id: string }>();
  const write = deferred<{ id: string }>();
  const events: string[] = [];

  const running = coordinator.enqueue({
    signature: "workflow-a",
    operation: "save",
    onStart: () => events.push("start"),
    execute: () => write.promise,
    onSuccess: () => events.push("success"),
    onError: () => events.push("error"),
  });
  const pending = coordinator.enqueue({
    signature: "workflow-a-newer",
    operation: "save",
    onStart: () => events.push("pending-start"),
    execute: async () => ({ id: "must-not-run" }),
    onSuccess: () => events.push("pending-success"),
    onError: () => events.push("pending-error"),
  });

  coordinator.invalidate();
  assert.equal(await pending, null);
  write.resolve({ id: "workflow-a" });
  assert.equal(await running, null);
  assert.deepEqual(events, ["start"]);
});

test("identical requests join the active write instead of scheduling another save", async () => {
  const coordinator = createCanvasSaveCoordinator<number>();
  const write = deferred<number>();
  let calls = 0;
  const task = {
    signature: "same",
    operation: "save" as const,
    onStart() {},
    execute() {
      calls += 1;
      return write.promise;
    },
    onSuccess() {},
    onError(error: unknown) {
      assert.fail(String(error));
    },
  };

  const first = coordinator.enqueue(task);
  const duplicate = coordinator.enqueue(task);
  write.resolve(7);

  assert.equal(await first, 7);
  assert.equal(await duplicate, 7);
  assert.equal(calls, 1);
});
