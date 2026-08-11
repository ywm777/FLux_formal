import assert from "node:assert/strict";
import test from "node:test";
import {
  cronMatchesDate,
  cronSlotKey,
  cronValidationError,
  nextCronOccurrence,
} from "../src/lib/cronExpression.ts";

test("cron matching uses the configured timezone", () => {
  const atNineInShanghai = new Date("2026-07-24T01:00:00.000Z");
  assert.equal(cronMatchesDate("0 9 * * *", "Asia/Shanghai", atNineInShanghai), true);
  assert.equal(cronMatchesDate("0 9 * * *", "UTC", atNineInShanghai), false);
  assert.equal(cronSlotKey(atNineInShanghai, "Asia/Shanghai"), "2026-07-24T09:00@Asia/Shanghai");
});

test("lists, ranges, steps and Sunday alias are supported", () => {
  const fridayAtTenThirty = new Date("2026-07-24T10:30:00.000Z");
  const sundayAtTenThirty = new Date("2026-07-26T10:30:00.000Z");
  assert.equal(cronMatchesDate("*/15 9-11 * * 1-5", "UTC", fridayAtTenThirty), true);
  assert.equal(cronMatchesDate("30 10 * * 7", "UTC", sundayAtTenThirty), true);
  assert.equal(cronValidationError("0,30 8-18/2 * * 1-5"), null);
});

test("next occurrence is strictly after the reference minute", () => {
  const next = nextCronOccurrence(
    "*/5 * * * *",
    "UTC",
    new Date("2026-07-24T07:30:20.000Z"),
  );
  assert.equal(next?.toISOString(), "2026-07-24T07:35:00.000Z");
});

test("day-of-month and day-of-week follow standard cron OR semantics", () => {
  const fridayNotFirst = new Date("2026-07-24T09:00:00.000Z");
  assert.equal(cronMatchesDate("0 9 1 * 5", "UTC", fridayNotFirst), true);
});
