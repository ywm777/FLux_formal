import { defineNode } from "../registry.js";
import {
  asRecord,
  getByPath,
  getInputValue,
  parseJson,
  toText,
  type PlainRecord,
} from "./value-utils.js";

function stableKey(value: unknown): string {
  if (value === undefined) return "undefined";
  if (typeof value === "object" && value !== null) {
    try {
      return JSON.stringify(value, Object.keys(value as PlainRecord).sort());
    } catch {
      return String(value);
    }
  }
  return `${typeof value}:${String(value)}`;
}

function getList(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (
    typeof value === "object" &&
    value !== null &&
    Array.isArray((value as PlainRecord).items)
  ) {
    return (value as { items: unknown[] }).items;
  }
  throw new Error("列表处理需要数组输入");
}

function compareValues(left: unknown, right: unknown): number {
  if (typeof left === "number" && typeof right === "number") return left - right;
  return toText(left).localeCompare(toText(right), "zh-CN", {
    numeric: true,
    sensitivity: "base",
  });
}

function parseCsv(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]!;
    if (character === '"') {
      if (quoted && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (!quoted && character === delimiter) {
      row.push(field);
      field = "";
      continue;
    }
    if (!quoted && (character === "\n" || character === "\r")) {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(field);
      if (row.some((cell) => cell.length > 0)) rows.push(row);
      row = [];
      field = "";
      continue;
    }
    field += character;
  }
  row.push(field);
  if (row.some((cell) => cell.length > 0)) rows.push(row);
  if (quoted) throw new Error("CSV 存在未闭合的引号");
  return rows;
}

function escapeCsv(value: unknown, delimiter: string): string {
  const text = toText(value);
  if (text.includes(delimiter) || /["\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export const objectMergeNode = defineNode({
  id: "flux.data.merge",
  name: "合并对象",
  description: "把上游对象与配置的数据合并，并控制字段覆盖策略",
  category: "数据",
  icon: "combine",
  version: "0.1.0",
  carrier: "data",
  ports: {
    inputs: [{ id: "in", name: "对象" }],
    outputs: [{ id: "out", name: "合并结果" }],
  },
  configSchema: {
    type: "object",
    properties: {
      sourcePath: { type: "string", title: "来源路径", default: "" },
      overlay: {
        type: "string",
        title: "附加对象 (JSON)",
        format: "code",
        default: "{}",
      },
      strategy: {
        type: "string",
        title: "冲突策略",
        enum: ["override", "preserve"],
        default: "override",
      },
    },
  },
  async execute(ctx) {
    const { sourcePath = "", overlay = "{}", strategy = "override" } =
      ctx.config as Record<string, string>;
    const source = asRecord(getInputValue(ctx.inputs, sourcePath), "来源数据");
    const extra = asRecord(parseJson(overlay, "附加对象", {}), "附加对象");
    const value =
      strategy === "preserve"
        ? { ...extra, ...source }
        : { ...source, ...extra };
    return { outputs: { out: value } };
  },
});

export const listTransformNode = defineNode({
  id: "flux.data.list",
  name: "列表处理",
  description: "对数组去重、排序、截取、反转或扁平化",
  category: "数据",
  icon: "list-filter",
  version: "0.1.0",
  carrier: "data",
  ports: {
    inputs: [{ id: "in", name: "列表" }],
    outputs: [{ id: "out", name: "结果" }],
  },
  configSchema: {
    type: "object",
    properties: {
      sourcePath: { type: "string", title: "来源路径", default: "" },
      operation: {
        type: "string",
        title: "操作",
        enum: ["unique", "sort", "slice", "reverse", "flatten"],
        default: "unique",
      },
      fieldPath: {
        type: "string",
        title: "字段路径",
        description: "排序或去重时使用，例如 user.id",
        default: "",
      },
      direction: {
        type: "string",
        title: "排序方向",
        enum: ["asc", "desc"],
        default: "asc",
      },
      start: { type: "number", title: "开始位置", default: 0 },
      end: { type: "number", title: "结束位置", default: 10 },
      depth: { type: "number", title: "扁平层级", default: 1 },
    },
  },
  async execute(ctx) {
    const {
      sourcePath = "",
      operation = "unique",
      fieldPath = "",
      direction = "asc",
      start = 0,
      end = 10,
      depth = 1,
    } = ctx.config as {
      sourcePath?: string;
      operation?: string;
      fieldPath?: string;
      direction?: string;
      start?: number;
      end?: number;
      depth?: number;
    };
    const source = getList(getInputValue(ctx.inputs, sourcePath));
    let items: unknown[];

    switch (operation) {
      case "sort":
        items = [...source].sort((left, right) => {
          const leftValue = fieldPath ? getByPath(left, fieldPath) : left;
          const rightValue = fieldPath ? getByPath(right, fieldPath) : right;
          const result = compareValues(leftValue, rightValue);
          return direction === "desc" ? -result : result;
        });
        break;
      case "slice":
        items = source.slice(Math.max(0, start), Math.max(0, end));
        break;
      case "reverse":
        items = [...source].reverse();
        break;
      case "flatten":
        items = source.flat(Math.min(10, Math.max(0, depth)));
        break;
      case "unique":
      default: {
        const seen = new Set<string>();
        items = source.filter((item) => {
          const value = fieldPath ? getByPath(item, fieldPath) : item;
          const key = stableKey(value);
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      }
    }
    ctx.log("info", `列表处理完成：${source.length} → ${items.length}`);
    return { outputs: { out: { items, count: items.length } } };
  },
});

export const csvNode = defineNode({
  id: "flux.transform.csv",
  name: "CSV 转换",
  description: "在 CSV 文本与结构化对象列表之间双向转换",
  category: "转换",
  icon: "table",
  version: "0.1.0",
  carrier: "data",
  ports: {
    inputs: [{ id: "in", name: "输入" }],
    outputs: [{ id: "out", name: "结果" }],
  },
  configSchema: {
    type: "object",
    properties: {
      operation: {
        type: "string",
        title: "操作",
        enum: ["parse", "stringify"],
        default: "parse",
      },
      sourcePath: { type: "string", title: "来源路径", default: "" },
      delimiter: { type: "string", title: "分隔符", default: "," },
      header: { type: "boolean", title: "首行为字段名", default: true },
    },
  },
  async execute(ctx) {
    const {
      operation = "parse",
      sourcePath = "",
      delimiter = ",",
      header = true,
    } = ctx.config as {
      operation?: "parse" | "stringify";
      sourcePath?: string;
      delimiter?: string;
      header?: boolean;
    };
    if (delimiter.length !== 1) throw new Error("CSV 分隔符必须是单个字符");
    const source = getInputValue(ctx.inputs, sourcePath);

    if (operation === "stringify") {
      const items = getList(source);
      if (items.length === 0) return { outputs: { out: { value: "", count: 0 } } };
      const objectRows = items.every(
        (item) => typeof item === "object" && item !== null && !Array.isArray(item),
      );
      let rows: unknown[][];
      if (objectRows) {
        const keys = [
          ...new Set(
            items.flatMap((item) => Object.keys(item as PlainRecord)),
          ),
        ];
        rows = [
          ...(header ? [keys] : []),
          ...items.map((item) =>
            keys.map((key) => (item as PlainRecord)[key]),
          ),
        ];
      } else {
        rows = items.map((item) => (Array.isArray(item) ? item : [item]));
      }
      const value = rows
        .map((row) => row.map((cell) => escapeCsv(cell, delimiter)).join(delimiter))
        .join("\n");
      return { outputs: { out: { value, count: items.length } } };
    }

    const rows = parseCsv(toText(source), delimiter);
    if (!header || rows.length === 0) {
      return { outputs: { out: { rows, count: rows.length } } };
    }
    const [columns = [], ...dataRows] = rows;
    const items = dataRows.map((row) =>
      Object.fromEntries(columns.map((column, index) => [column, row[index] ?? ""])),
    );
    return { outputs: { out: { items, count: items.length } } };
  },
});

export const collectionNodes = [objectMergeNode, listTransformNode, csvNode];
