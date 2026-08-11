export type PlainRecord = Record<string, unknown>;

export function getByPath(source: unknown, path: string): unknown {
  if (!path.trim()) return source;
  return path.split(".").reduce<unknown>((value, segment) => {
    if (value == null) return undefined;
    if (Array.isArray(value)) return value[Number(segment)];
    if (typeof value === "object") {
      return (value as PlainRecord)[segment];
    }
    return undefined;
  }, source);
}

export function getInputValue(inputs: PlainRecord, path = ""): unknown {
  if (path.trim()) return getByPath(inputs, path.trim());
  if (Object.prototype.hasOwnProperty.call(inputs, "value")) {
    return inputs.value;
  }
  return inputs;
}

export function asRecord(value: unknown, label = "输入"): PlainRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label}必须是对象`);
  }
  return value as PlainRecord;
}

export function parseJson(
  value: unknown,
  label: string,
  fallback?: unknown,
): unknown {
  const text = String(value ?? "").trim();
  if (!text && fallback !== undefined) return fallback;
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw new Error(`${label}不是有效 JSON：${(error as Error).message}`);
  }
}

export function parseLiteral(value: unknown): unknown {
  const text = String(value ?? "").trim();
  if (!text) return "";
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

export function toText(value: unknown): string {
  if (typeof value === "string") return value;
  if (value == null) return "";
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}

export function toFiniteNumber(value: unknown, label: string): number {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`${label}必须是有效数字`);
  return number;
}
