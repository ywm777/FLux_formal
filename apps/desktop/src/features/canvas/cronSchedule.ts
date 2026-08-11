export type CronScheduleMode = "daily" | "weekdays" | "weekly" | "interval" | "custom";

export {
  cronValidationError,
  normalizeCronExpression,
} from "../../lib/cronExpression.ts";
import {
  cronValidationError,
  normalizeCronExpression,
} from "../../lib/cronExpression.ts";

export interface CronSchedulePreset {
  mode: CronScheduleMode;
  time: string;
  weekday: number;
  intervalMinutes: number;
  expression: string;
}

export const CRON_SCHEDULE_MODE_OPTIONS: Array<{
  value: Exclude<CronScheduleMode, "custom">;
  label: string;
}> = [
  { value: "daily", label: "每天" },
  { value: "weekdays", label: "工作日（周一至周五）" },
  { value: "weekly", label: "每周" },
  { value: "interval", label: "每隔一段时间" },
];

export const CRON_WEEKDAY_OPTIONS = [
  { value: 1, label: "周一" },
  { value: 2, label: "周二" },
  { value: 3, label: "周三" },
  { value: 4, label: "周四" },
  { value: 5, label: "周五" },
  { value: 6, label: "周六" },
  { value: 0, label: "周日" },
];

export const CRON_INTERVAL_OPTIONS = [1, 5, 10, 15, 30, 60];

export const CRON_TIMEZONE_OPTIONS = [
  { value: "Asia/Shanghai", label: "北京时间（UTC+8）" },
  { value: "UTC", label: "协调世界时（UTC）" },
  { value: "Asia/Tokyo", label: "东京时间（UTC+9）" },
  { value: "Europe/London", label: "伦敦时间" },
  { value: "America/New_York", label: "纽约时间" },
];

const DEFAULT_TIME = "09:00";
const DEFAULT_WEEKDAY = 1;
const DEFAULT_INTERVAL = 15;

function numberInRange(value: string, min: number, max: number): number | null {
  if (!/^\d+$/.test(value)) return null;
  const number = Number(value);
  return Number.isInteger(number) && number >= min && number <= max ? number : null;
}

function timeFromCron(minute: string, hour: string): string | null {
  const parsedMinute = numberInRange(minute, 0, 59);
  const parsedHour = numberInRange(hour, 0, 23);
  return parsedMinute === null || parsedHour === null
    ? null
    : `${String(parsedHour).padStart(2, "0")}:${String(parsedMinute).padStart(2, "0")}`;
}

export function parseCronSchedule(expression: string): CronSchedulePreset {
  const normalized = normalizeCronExpression(expression || "0 9 * * *");
  const common = {
    time: DEFAULT_TIME,
    weekday: DEFAULT_WEEKDAY,
    intervalMinutes: DEFAULT_INTERVAL,
    expression: normalized,
  };

  const weekdays = /^(\d{1,2}) (\d{1,2}) \* \* 1-5$/.exec(normalized);
  if (weekdays) {
    const time = timeFromCron(weekdays[1]!, weekdays[2]!);
    if (time) return { ...common, mode: "weekdays", time };
  }

  const daily = /^(\d{1,2}) (\d{1,2}) \* \* \*$/.exec(normalized);
  if (daily) {
    const time = timeFromCron(daily[1]!, daily[2]!);
    if (time) return { ...common, mode: "daily", time };
  }

  const weekly = /^(\d{1,2}) (\d{1,2}) \* \* ([0-6])$/.exec(normalized);
  if (weekly) {
    const time = timeFromCron(weekly[1]!, weekly[2]!);
    if (time) return { ...common, mode: "weekly", time, weekday: Number(weekly[3]) };
  }

  if (normalized === "0 * * * *") {
    return { ...common, mode: "interval", intervalMinutes: 60 };
  }
  const interval = /^\*\/(\d{1,2}) \* \* \* \*$/.exec(normalized);
  if (interval) {
    const minutes = Number(interval[1]);
    if (CRON_INTERVAL_OPTIONS.includes(minutes)) {
      return { ...common, mode: "interval", intervalMinutes: minutes };
    }
  }

  return { ...common, mode: "custom" };
}

function timeParts(time: string): { minute: number; hour: number } {
  const match = /^(\d{2}):(\d{2})$/.exec(time);
  const hour = match ? numberInRange(match[1]!, 0, 23) : null;
  const minute = match ? numberInRange(match[2]!, 0, 59) : null;
  return {
    hour: hour ?? 9,
    minute: minute ?? 0,
  };
}

export function buildCronExpression(schedule: CronSchedulePreset): string {
  if (schedule.mode === "custom") return schedule.expression;
  if (schedule.mode === "interval") {
    return schedule.intervalMinutes === 60
      ? "0 * * * *"
      : `*/${schedule.intervalMinutes} * * * *`;
  }
  const { minute, hour } = timeParts(schedule.time);
  if (schedule.mode === "weekdays") return `${minute} ${hour} * * 1-5`;
  if (schedule.mode === "weekly") return `${minute} ${hour} * * ${schedule.weekday}`;
  return `${minute} ${hour} * * *`;
}

function timezoneLabel(timezone: string): string {
  return CRON_TIMEZONE_OPTIONS.find((option) => option.value === timezone)?.label
    ?? timezone
    ?? "当前时区";
}

export function describeCronSchedule(expression: string, timezone: string): string {
  if (cronValidationError(expression)) return "计划尚未设置完成";
  const schedule = parseCronSchedule(expression);
  const zone = timezoneLabel(timezone);
  if (schedule.mode === "daily") return `${zone} · 每天 ${schedule.time} 执行`;
  if (schedule.mode === "weekdays") return `${zone} · 周一至周五 ${schedule.time} 执行`;
  if (schedule.mode === "weekly") {
    const weekday = CRON_WEEKDAY_OPTIONS.find((option) => option.value === schedule.weekday)?.label;
    return `${zone} · 每${weekday ?? "周"} ${schedule.time} 执行`;
  }
  if (schedule.mode === "interval") {
    return schedule.intervalMinutes === 60
      ? `${zone} · 每小时整点执行`
      : `${zone} · 每 ${schedule.intervalMinutes} 分钟执行`;
  }
  return `${zone} · 自定义计划（${schedule.expression}）`;
}
