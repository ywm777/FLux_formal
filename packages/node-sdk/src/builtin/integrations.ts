import { defineNode } from "../registry.js";
import { getInputValue, parseJson, toText, type PlainRecord } from "./value-utils.js";

export const dateTimeNode = defineNode({
  id: "flux.time.format",
  name: "日期时间",
  description: "获取当前时间、增减时间，并按时区与地区格式化",
  category: "时间",
  icon: "calendar-clock",
  version: "0.1.0",
  carrier: "basic",
  ports: {
    inputs: [{ id: "in", name: "输入" }],
    outputs: [{ id: "out", name: "时间" }],
  },
  configSchema: {
    type: "object",
    properties: {
      sourcePath: { type: "string", title: "时间来源路径", default: "" },
      amount: { type: "number", title: "增减数量", default: 0 },
      unit: {
        type: "string",
        title: "单位",
        enum: ["minute", "hour", "day", "week"],
        default: "day",
      },
      locale: { type: "string", title: "地区", default: "zh-CN" },
      timezone: { type: "string", title: "时区", default: "Asia/Shanghai" },
    },
  },
  async execute(ctx) {
    const {
      sourcePath = "",
      amount = 0,
      unit = "day",
      locale = "zh-CN",
      timezone = "Asia/Shanghai",
    } = ctx.config as {
      sourcePath?: string;
      amount?: number;
      unit?: "minute" | "hour" | "day" | "week";
      locale?: string;
      timezone?: string;
    };
    const source = sourcePath ? getInputValue(ctx.inputs, sourcePath) : Date.now();
    const date = new Date(source as string | number | Date);
    if (Number.isNaN(date.getTime())) throw new Error("输入不是有效的日期时间");
    const multipliers = { minute: 60_000, hour: 3_600_000, day: 86_400_000, week: 604_800_000 };
    const value = new Date(date.getTime() + Number(amount) * multipliers[unit]);
    let formatted: string;
    try {
      formatted = new Intl.DateTimeFormat(locale, {
        dateStyle: "medium",
        timeStyle: "medium",
        timeZone: timezone,
      }).format(value);
    } catch (error) {
      throw new Error(`日期格式配置无效：${(error as Error).message}`);
    }
    return { outputs: { out: { iso: value.toISOString(), timestamp: value.getTime(), formatted, timezone } } };
  },
});

export const urlBuilderNode = defineNode({
  id: "flux.network.url",
  name: "构建请求地址",
  description: "安全拼接基础地址与查询参数，自动处理编码和空值",
  category: "网络",
  icon: "link",
  version: "0.1.0",
  carrier: "basic",
  ports: {
    inputs: [{ id: "in", name: "参数" }],
    outputs: [{ id: "out", name: "地址" }],
  },
  configSchema: {
    type: "object",
    required: ["baseUrl"],
    properties: {
      baseUrl: { type: "string", title: "基础 URL", default: "https://api.example.com/items" },
      query: { type: "string", title: "查询参数 (JSON)", format: "code", default: "{}" },
      inputPath: { type: "string", title: "合并输入对象路径", default: "" },
    },
  },
  async execute(ctx) {
    const { baseUrl = "", query = "{}", inputPath = "" } = ctx.config as Record<string, string>;
    let url: URL;
    try {
      url = new URL(baseUrl);
    } catch {
      throw new Error("基础 URL 无效，必须包含 http:// 或 https://");
    }
    const configured = parseJson(query, "查询参数", {}) as PlainRecord;
    const inputValue = inputPath ? getInputValue(ctx.inputs, inputPath) : undefined;
    const input = typeof inputValue === "object" && inputValue !== null && !Array.isArray(inputValue)
      ? inputValue as PlainRecord
      : {};
    for (const [key, value] of Object.entries({ ...configured, ...input })) {
      url.searchParams.delete(key);
      if (value === undefined || value === null || value === "") continue;
      const values = Array.isArray(value) ? value : [value];
      for (const item of values) url.searchParams.append(key, toText(item));
    }
    return { outputs: { out: { url: url.toString() } } };
  },
});

async function fetchOne(
  url: string,
  options: { method: string; body?: string; timeout: number; signal: AbortSignal },
): Promise<PlainRecord> {
  const controller = new AbortController();
  const abort = () => controller.abort(options.signal.reason);
  options.signal.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(() => controller.abort(new Error("请求超时")), options.timeout);
  try {
    const response = await fetch(url, {
      method: options.method,
      body: options.method === "GET" || options.method === "DELETE" ? undefined : options.body,
      signal: controller.signal,
    });
    const body = (await response.text()).slice(0, 100_000);
    return { url, ok: response.ok, status: response.status, body };
  } catch (error) {
    return { url, ok: false, error: (error as Error).message };
  } finally {
    clearTimeout(timer);
    options.signal.removeEventListener("abort", abort);
  }
}

export const httpBatchNode = defineNode({
  id: "flux.action.httpBatch",
  name: "批量 HTTP",
  description: "并发请求一组地址，限制批量规模、并发数与单次超时",
  category: "网络",
  icon: "network",
  version: "0.1.0",
  carrier: "basic",
  ports: {
    inputs: [{ id: "in", name: "地址列表" }],
    outputs: [{ id: "out", name: "批量响应" }],
  },
  configSchema: {
    type: "object",
    properties: {
      sourcePath: { type: "string", title: "地址列表路径", default: "" },
      urls: { type: "string", title: "地址列表 (JSON)", format: "code", default: "[]" },
      method: { type: "string", title: "方法", enum: ["GET", "POST", "PUT", "PATCH", "DELETE"], default: "GET" },
      body: { type: "string", title: "请求体", format: "textarea", default: "" },
      concurrency: { type: "number", title: "并发数（1-5）", default: 3 },
      timeout: { type: "number", title: "单次超时（毫秒）", default: 10000 },
    },
  },
  async execute(ctx) {
    const {
      sourcePath = "",
      urls = "[]",
      method = "GET",
      body = "",
      concurrency = 3,
      timeout = 10_000,
    } = ctx.config as {
      sourcePath?: string;
      urls?: string;
      method?: string;
      body?: string;
      concurrency?: number;
      timeout?: number;
    };
    const source = sourcePath ? getInputValue(ctx.inputs, sourcePath) : parseJson(urls, "地址列表", []);
    if (!Array.isArray(source)) throw new Error("批量 HTTP 需要 URL 数组");
    const list = source.map(toText).filter(Boolean);
    if (list.length === 0) throw new Error("请至少提供一个请求地址");
    if (list.length > 20) throw new Error("单次最多请求 20 个地址");
    for (const url of list) {
      try { new URL(url); } catch { throw new Error(`无效 URL：${url}`); }
    }
    const results: PlainRecord[] = new Array(list.length);
    let cursor = 0;
    const worker = async () => {
      while (cursor < list.length) {
        const index = cursor++;
        results[index] = await fetchOne(list[index]!, {
          method,
          body,
          timeout: Math.min(120_000, Math.max(100, Number(timeout))),
          signal: ctx.signal,
        });
      }
    };
    const workerCount = Math.min(list.length, Math.min(5, Math.max(1, Math.trunc(Number(concurrency)))));
    await Promise.all(Array.from({ length: workerCount }, worker));
    const successCount = results.filter((result) => result.ok).length;
    ctx.log("info", `批量 HTTP 完成：${successCount}/${results.length} 成功`);
    return { outputs: { out: { results, count: results.length, successCount, failureCount: results.length - successCount } } };
  },
});

export const integrationNodes = [dateTimeNode, urlBuilderNode, httpBatchNode];
