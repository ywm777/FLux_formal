import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCronExpression,
  cronValidationError,
  describeCronSchedule,
  parseCronSchedule,
} from "../src/features/canvas/cronSchedule.ts";

test("daily and weekday schedules are presented in user language", () => {
  assert.equal(parseCronSchedule("0 9 * * *").mode, "daily");
  assert.equal(
    describeCronSchedule("0 9 * * *", "Asia/Shanghai"),
    "北京时间（UTC+8） · 每天 09:00 执行",
  );
  assert.equal(
    describeCronSchedule("30 8 * * 1-5", "Asia/Shanghai"),
    "北京时间（UTC+8） · 周一至周五 08:30 执行",
  );
});

test("weekly and interval presets build valid five-part expressions", () => {
  const weekly = parseCronSchedule("0 9 * * *");
  assert.equal(buildCronExpression({ ...weekly, mode: "weekly", weekday: 3, time: "14:25" }), "25 14 * * 3");
  assert.equal(buildCronExpression({ ...weekly, mode: "interval", intervalMinutes: 15 }), "*/15 * * * *");
  assert.equal(buildCronExpression({ ...weekly, mode: "interval", intervalMinutes: 60 }), "0 * * * *");
});

test("custom schedules expose useful validation instead of accepting malformed input", () => {
  assert.equal(cronValidationError("0 9 * * *"), null);
  assert.equal(cronValidationError("0 9 * *"), "Cron 表达式需要包含 5 段");
  assert.equal(cronValidationError("0 25 * * *"), "表达式包含无效的时间范围或符号");
  assert.equal(parseCronSchedule("0 9 1 * *").mode, "custom");
});
