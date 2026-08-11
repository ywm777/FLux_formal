const CRON_FIELD_RANGES = [
  [0, 59],
  [0, 23],
  [1, 31],
  [1, 12],
  [0, 7],
] as const;

interface CronFieldMatcher {
  wildcard: boolean;
  values: Set<number>;
}

interface CronMatcher {
  minute: CronFieldMatcher;
  hour: CronFieldMatcher;
  dayOfMonth: CronFieldMatcher;
  month: CronFieldMatcher;
  dayOfWeek: CronFieldMatcher;
}

export interface ZonedDateParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  dayOfWeek: number;
}

const formatterCache = new Map<string, Intl.DateTimeFormat>();
const matcherCache = new Map<string, CronMatcher | null>();

export function normalizeCronExpression(expression: string): string {
  return expression.trim().split(/\s+/).filter(Boolean).join(" ");
}

function integerInRange(value: string, min: number, max: number): number | null {
  if (!/^\d+$/.test(value)) return null;
  const number = Number(value);
  return Number.isInteger(number) && number >= min && number <= max ? number : null;
}

function parseCronField(field: string, min: number, max: number): CronFieldMatcher | null {
  const values = new Set<number>();
  let wildcard = false;

  for (const rawPart of field.split(",")) {
    const [base, rawStep, ...rest] = rawPart.split("/");
    if (!base || rest.length > 0) return null;
    const step = rawStep === undefined
      ? 1
      : integerInRange(rawStep, 1, max - min + 1);
    if (step === null) return null;

    let start: number;
    let end: number;
    if (base === "*") {
      wildcard = true;
      start = min;
      end = max;
    } else {
      const range = /^(\d+)-(\d+)$/.exec(base);
      if (range) {
        const parsedStart = integerInRange(range[1]!, min, max);
        const parsedEnd = integerInRange(range[2]!, min, max);
        if (parsedStart === null || parsedEnd === null || parsedStart > parsedEnd) return null;
        start = parsedStart;
        end = parsedEnd;
      } else {
        const parsedStart = integerInRange(base, min, max);
        if (parsedStart === null) return null;
        start = parsedStart;
        end = rawStep === undefined ? parsedStart : max;
      }
    }

    for (let value = start; value <= end; value += step) values.add(value);
  }

  return values.size > 0 ? { wildcard, values } : null;
}

function parseCronExpression(expression: string): CronMatcher | null {
  const normalized = normalizeCronExpression(expression);
  if (matcherCache.has(normalized)) return matcherCache.get(normalized) ?? null;
  const fields = normalized.split(" ");
  if (fields.length !== 5) {
    matcherCache.set(normalized, null);
    return null;
  }
  const parsed = fields.map((field, index) => {
    const range = CRON_FIELD_RANGES[index]!;
    return parseCronField(field!, range[0], range[1]);
  });
  if (parsed.some((field) => field === null)) {
    matcherCache.set(normalized, null);
    return null;
  }
  const matcher = {
    minute: parsed[0]!,
    hour: parsed[1]!,
    dayOfMonth: parsed[2]!,
    month: parsed[3]!,
    dayOfWeek: parsed[4]!,
  };
  matcherCache.set(normalized, matcher);
  return matcher;
}

export function cronValidationError(expression: string): string | null {
  const fields = normalizeCronExpression(expression).split(" ");
  if (fields.length !== 5) return "Cron 表达式需要包含 5 段";
  return parseCronExpression(expression)
    ? null
    : "表达式包含无效的时间范围或符号";
}

export function isValidTimeZone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: timezone }).format();
    return true;
  } catch {
    return false;
  }
}

function formatterFor(timezone: string): Intl.DateTimeFormat {
  const cached = formatterCache.get(timezone);
  if (cached) return cached;
  const formatter = new Intl.DateTimeFormat("en-GB-u-nu-latn", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  formatterCache.set(timezone, formatter);
  return formatter;
}

export function getZonedDateParts(date: Date, timezone: string): ZonedDateParts {
  const values = Object.fromEntries(
    formatterFor(timezone)
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );
  const year = values.year;
  const month = values.month;
  const day = values.day;
  const hour = values.hour;
  const minute = values.minute;
  if ([year, month, day, hour, minute].some((value) => !Number.isFinite(value))) {
    throw new Error(`无法按时区 ${timezone} 解析时间`);
  }
  return {
    year,
    month,
    day,
    hour,
    minute,
    dayOfWeek: new Date(Date.UTC(year, month - 1, day)).getUTCDay(),
  };
}

function dayOfWeekMatches(field: CronFieldMatcher, value: number): boolean {
  return field.values.has(value) || (value === 0 && field.values.has(7));
}

export function cronMatchesDate(
  expression: string,
  timezone: string,
  date: Date,
): boolean {
  const matcher = parseCronExpression(expression);
  if (!matcher) return false;
  const parts = getZonedDateParts(date, timezone);
  if (
    !matcher.minute.values.has(parts.minute) ||
    !matcher.hour.values.has(parts.hour) ||
    !matcher.month.values.has(parts.month)
  ) return false;

  const dayOfMonthMatches = matcher.dayOfMonth.values.has(parts.day);
  const dayOfWeekMatchesValue = dayOfWeekMatches(matcher.dayOfWeek, parts.dayOfWeek);
  return !matcher.dayOfMonth.wildcard && !matcher.dayOfWeek.wildcard
    ? dayOfMonthMatches || dayOfWeekMatchesValue
    : dayOfMonthMatches && dayOfWeekMatchesValue;
}

export function cronSlotKey(date: Date, timezone: string): string {
  const parts = getZonedDateParts(date, timezone);
  return [
    String(parts.year).padStart(4, "0"),
    String(parts.month).padStart(2, "0"),
    String(parts.day).padStart(2, "0"),
  ].join("-") + `T${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}@${timezone}`;
}

export function nextCronOccurrence(
  expression: string,
  timezone: string,
  after: Date,
  maxMinutes = 370 * 24 * 60,
): Date | null {
  if (cronValidationError(expression) || !isValidTimeZone(timezone)) return null;
  const cursor = new Date(after);
  cursor.setSeconds(0, 0);
  cursor.setMinutes(cursor.getMinutes() + 1);
  for (let offset = 0; offset < maxMinutes; offset += 1) {
    if (cronMatchesDate(expression, timezone, cursor)) return new Date(cursor);
    cursor.setMinutes(cursor.getMinutes() + 1);
  }
  return null;
}
