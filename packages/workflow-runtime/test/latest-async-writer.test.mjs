import assert from "node:assert/strict";
import test from "node:test";
import { LatestAsyncWriter } from "../dist/index.js";

test("latest async writer coalesces replaceable values and flushes the newest", async () => {
  const writes = [];
  let releaseFirst;
  const firstWrite = new Promise((resolve) => {
    releaseFirst = resolve;
  });
  const writer = new LatestAsyncWriter(async (value) => {
    writes.push(value);
    if (value === 1) await firstWrite;
  });

  writer.push(1);
  writer.push(2);
  writer.push(3);
  assert.deepEqual(writes, [1]);

  releaseFirst();
  await writer.flush();
  assert.deepEqual(writes, [1, 3]);
});

test("latest async writer surfaces persistence failures at flush", async () => {
  const expected = new Error("disk unavailable");
  const writer = new LatestAsyncWriter(async () => {
    throw expected;
  });

  writer.push("checkpoint");
  await assert.rejects(() => writer.flush(), expected);
  assert.throws(() => writer.push("later"), expected);
});
