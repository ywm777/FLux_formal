/* eslint-disable no-console */
import assert from "node:assert/strict";
import { setImmediate as nextTurn } from "node:timers/promises";
import {
  InMemoryExecutionQueue,
  readExecutionQueueInteger,
} from "./execution-queue";
import type { ExecutionJob } from "./execution-processor.service";

function job(id: string): ExecutionJob {
  return { executionId: id, workflowId: "workflow", ownerId: "owner", graph: {} };
}

async function main(): Promise<void> {
  const releases: Array<() => void> = [];
  const started: string[] = [];
  const finished: string[] = [];
  let active = 0;
  let maximumActive = 0;
  const queue = new InMemoryExecutionQueue(
    {
      async process(current) {
        started.push(current.executionId);
        active += 1;
        maximumActive = Math.max(maximumActive, active);
        await new Promise<void>((resolve) => releases.push(resolve));
        active -= 1;
        finished.push(current.executionId);
      },
    },
    { concurrency: 1, capacity: 2 },
  );

  await queue.add(job("one"));
  await queue.add(job("one"));
  await queue.add(job("two"));
  await assert.rejects(queue.add(job("three")), /执行队列已满/);
  await nextTurn();
  assert.deepEqual(started, ["one"], "并发上限为 1 时只启动第一个任务");
  assert.equal(started.filter((id) => id === "one").length, 1, "同一执行不得重复入队");
  releases.shift()?.();
  await nextTurn();
  await nextTurn();
  assert.deepEqual(started, ["one", "two"], "前一个任务完成后启动等待任务");
  assert.equal(maximumActive, 1, "内存队列不得突破并发上限");
  releases.shift()?.();
  await nextTurn();
  await nextTurn();
  assert.deepEqual(finished, ["one", "two"], "等待任务最终完成");

  assert.throws(
    () => readExecutionQueueInteger("0", 4, "EXEC_CONCURRENCY", 64),
    /1-64/,
  );
  console.log("✅ execution queue smoke 全部通过");
}

void main();
