import { isTauriRuntime } from "../desktopStorage.js";
import {
  HTTP_METHODS,
  HttpCapabilityError,
  type HttpCapabilityResponse,
  type HttpConnection,
  type HttpMethod,
} from "./httpConnection.js";
import { localHttpConnectionRepository } from "./localHttpConnectionRepository.js";
import { sessionHttpSecretVault } from "./sessionHttpSecretVault.js";
import type { CapabilityInvocationMetadata } from "@flux/node-sdk";

const MAX_REQUEST_BODY_BYTES = 256 * 1024;
const MAX_RESPONSE_BYTES = 1024 * 1024;
const REQUEST_TIMEOUT_MS = 12_000;
const FORBIDDEN_HEADER = /^(authorization|cookie|host|proxy-|sec-|x-.*(?:api[-_]?key|token|secret))/i;

export interface NativeHttpResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}

interface HttpCapabilityRequest {
  method?: unknown;
  path?: unknown;
  query?: unknown;
  body?: unknown;
  headers?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isJsonSerializable(value: unknown, seen = new Set<object>()): boolean {
  if (value === null || ["string", "number", "boolean"].includes(typeof value)) {
    return typeof value !== "number" || Number.isFinite(value as number);
  }
  if (typeof value !== "object" || seen.has(value as object)) return false;
  seen.add(value as object);
  const values = Array.isArray(value)
    ? value
    : Object.values(value as Record<string, unknown>);
  const valid = values.every((item) => isJsonSerializable(item, seen));
  seen.delete(value as object);
  return valid;
}

function parseRequest(payload: unknown): {
  method: HttpMethod;
  path: string;
  query: URLSearchParams;
  body?: string;
  headers: Record<string, string>;
} {
  if (!isRecord(payload)) {
    throw new HttpCapabilityError("HTTP_REQUEST_INVALID", "HTTP 请求参数必须是对象");
  }
  const request = payload as HttpCapabilityRequest;
  const method = String(request.method ?? "GET").toUpperCase();
  if (!HTTP_METHODS.includes(method as HttpMethod)) {
    throw new HttpCapabilityError("HTTP_METHOD_INVALID", "不支持的 HTTP 请求方法");
  }
  if (typeof request.path !== "string") {
    throw new HttpCapabilityError("HTTP_PATH_INVALID", "HTTP 请求必须提供相对 path");
  }
  const path = request.path.trim().replace(/^\/+/, "");
  if (!path || /^(?:https?:)?\/\//i.test(path) || path.includes("?") || path.includes("#") || path.includes("..")) {
    throw new HttpCapabilityError("HTTP_PATH_INVALID", "path 必须是安全的相对路径");
  }

  const query = new URLSearchParams();
  if (request.query !== undefined) {
    if (!isRecord(request.query)) {
      throw new HttpCapabilityError("HTTP_QUERY_INVALID", "query 必须是键值对象");
    }
    for (const [key, value] of Object.entries(request.query)) {
      if (!/^[A-Za-z][A-Za-z0-9_.-]{0,63}$/.test(key) || value === undefined || value === null) continue;
      if (["string", "number", "boolean"].includes(typeof value)) {
        query.set(key, String(value));
      } else if (Array.isArray(value) && value.every((item) => ["string", "number", "boolean"].includes(typeof item))) {
        for (const item of value) query.append(key, String(item));
      } else {
        throw new HttpCapabilityError("HTTP_QUERY_INVALID", "query 值只能是字符串、数字、布尔值或这些值的数组");
      }
    }
  }

  let body: string | undefined;
  if (request.body !== undefined) {
    if (!isJsonSerializable(request.body)) {
      throw new HttpCapabilityError("HTTP_BODY_INVALID", "请求 body 必须是可序列化的 JSON");
    }
    body = JSON.stringify(request.body);
    if (new Blob([body]).size > MAX_REQUEST_BODY_BYTES) {
      throw new HttpCapabilityError("HTTP_BODY_TOO_LARGE", "请求 body 不能超过 256KB");
    }
  }

  const headers: Record<string, string> = {};
  if (request.headers !== undefined) {
    if (!isRecord(request.headers)) {
      throw new HttpCapabilityError("HTTP_HEADERS_INVALID", "headers 必须是键值对象");
    }
    for (const [key, value] of Object.entries(request.headers)) {
      if (!/^[A-Za-z][A-Za-z0-9-]{0,63}$/.test(key) || typeof value !== "string" || value.length > 512) {
        throw new HttpCapabilityError("HTTP_HEADERS_INVALID", "请求头格式无效");
      }
      if (FORBIDDEN_HEADER.test(key)) {
        throw new HttpCapabilityError("HTTP_HEADER_FORBIDDEN", "敏感请求头必须配置在接口连接中，不能写入节点逻辑");
      }
      headers[key] = value;
    }
  }
  if (body && !Object.keys(headers).some((key) => key.toLowerCase() === "content-type")) {
    headers["Content-Type"] = "application/json";
  }
  headers.Accept ??= "application/json, text/plain;q=0.9, */*;q=0.8";
  return { method: method as HttpMethod, path, query, body, headers };
}

function requestUrl(connection: HttpConnection, path: string, query: URLSearchParams): string {
  const base = new URL(`${connection.baseUrl}/`);
  const target = new URL(path, base);
  const basePath = base.pathname.replace(/\/$/, "");
  if (target.origin !== base.origin || !(target.pathname === basePath || target.pathname.startsWith(`${basePath}/`))) {
    throw new HttpCapabilityError("HTTP_PATH_FORBIDDEN", "请求路径超出了接口连接的可信根地址");
  }
  const prefixes = connection.allowedPathPrefixes;
  if (prefixes.length > 0 && !prefixes.some((prefix) => {
    const allowed = `${basePath}/${prefix}`.replace(/\/+/g, "/").replace(/\/$/, "");
    return target.pathname === allowed || target.pathname.startsWith(`${allowed}/`);
  })) {
    throw new HttpCapabilityError("HTTP_PATH_FORBIDDEN", "请求路径不在此连接允许的范围内");
  }
  target.search = query.toString();
  return target.toString();
}

export async function performHttpRequest(input: {
  url: string;
  method: HttpMethod;
  headers: Record<string, string>;
  body?: string;
}): Promise<NativeHttpResponse> {
  if (isTauriRuntime()) {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<NativeHttpResponse>("http_request", { request: input });
  }
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(input.url, {
      method: input.method,
      headers: input.headers,
      body: input.body,
      signal: controller.signal,
    });
    const body = await response.text();
    if (new Blob([body]).size > MAX_RESPONSE_BYTES) {
      throw new HttpCapabilityError("HTTP_RESPONSE_TOO_LARGE", "接口响应不能超过 1MB");
    }
    return {
      status: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      body,
    };
  } catch (error) {
    if (error instanceof HttpCapabilityError) throw error;
    const message = error instanceof DOMException && error.name === "AbortError"
      ? "接口请求超时"
      : "接口请求失败。浏览器预览环境可能受 CORS 限制，请在桌面应用中运行。";
    throw new HttpCapabilityError("HTTP_REQUEST_FAILED", message);
  } finally {
    window.clearTimeout(timeout);
  }
}

function parseResponse(response: NativeHttpResponse): HttpCapabilityResponse {
  if (new Blob([response.body]).size > MAX_RESPONSE_BYTES) {
    throw new HttpCapabilityError("HTTP_RESPONSE_TOO_LARGE", "接口响应不能超过 1MB");
  }
  const contentType = response.headers["content-type"] ?? "";
  let data: unknown = response.body;
  if (/[/+]json\b/i.test(contentType) && response.body.trim()) {
    try {
      data = JSON.parse(response.body);
    } catch {
      throw new HttpCapabilityError("HTTP_RESPONSE_INVALID", "接口声明为 JSON，但返回内容无法解析");
    }
  }
  if (response.status < 200 || response.status >= 300) {
    throw new HttpCapabilityError(
      `HTTP_STATUS_${response.status}`,
      `接口返回 HTTP ${response.status}`,
    );
  }
  return { status: response.status, headers: response.headers, data };
}

/** 运行时唯一的 HTTP 能力入口。节点实现无法绕过此路径直接访问网络。 */
export async function invokeLocalHttpCapability(
  bindingId: string,
  action: string,
  payload?: unknown,
  metadata?: CapabilityInvocationMetadata,
): Promise<HttpCapabilityResponse> {
  if (action !== "request") {
    throw new HttpCapabilityError("CAPABILITY_ACTION_UNSUPPORTED", "HTTP 连接只支持 request 动作");
  }
  const connection = await localHttpConnectionRepository.find(bindingId);
  if (!connection) {
    throw new HttpCapabilityError("CONNECTION_NOT_FOUND", "找不到此节点绑定的接口连接");
  }
  const request = parseRequest(payload);
  if (!connection.allowedMethods.includes(request.method)) {
    throw new HttpCapabilityError("HTTP_METHOD_FORBIDDEN", "此接口连接未授权该请求方法");
  }
  const headers = { ...request.headers };
  if (metadata) headers["Idempotency-Key"] = metadata.idempotencyKey;
  if (connection.auth) {
    const secret = sessionHttpSecretVault.require(connection.id);
    headers[connection.auth.headerName] = connection.auth.valuePrefix
      ? `${connection.auth.valuePrefix} ${secret}`
      : secret;
  }
  return parseResponse(await performHttpRequest({
    url: requestUrl(connection, request.path, request.query),
    method: request.method,
    headers,
    body: request.body,
  }));
}
