/**
 * HTTP 连接是工作流运行时的基础设施，而不是节点草案的一部分。
 * 节点只保存对连接 ID 的绑定；密钥只驻留在当前桌面会话的 Vault 中。
 */

export const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;

export type HttpMethod = typeof HTTP_METHODS[number];

export interface HttpConnectionAuth {
  /** 例如 Authorization、X-API-Key；实际值不会写入磁盘。 */
  headerName: string;
  /** 例如 Bearer；为空时原样发送密钥。 */
  valuePrefix: string;
}

export interface HttpConnection {
  schemaVersion: 1;
  id: string;
  name: string;
  /** 连接的可信根地址，例如 https://api.example.com/v1。 */
  baseUrl: string;
  /** 相对 baseUrl 的允许路径前缀；空数组表示 baseUrl 下的全部路径。 */
  allowedPathPrefixes: string[];
  allowedMethods: HttpMethod[];
  auth?: HttpConnectionAuth;
  createdAt: string;
  updatedAt: string;
}

export interface HttpConnectionDraft {
  id?: string;
  name: string;
  baseUrl: string;
  allowedPathPrefixes: string[];
  allowedMethods: HttpMethod[];
  auth?: HttpConnectionAuth;
}

export interface HttpConnectionLibrarySnapshot {
  schemaVersion: 1;
  connections: HttpConnection[];
}

export interface HttpCapabilityResponse {
  status: number;
  headers: Record<string, string>;
  data: unknown;
}

export class HttpCapabilityError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "HttpCapabilityError";
  }
}

export function createHttpConnectionDraft(): HttpConnectionDraft {
  return {
    name: "我的接口连接",
    baseUrl: "https://api.example.com/v1",
    allowedPathPrefixes: [],
    allowedMethods: ["GET"],
    auth: {
      headerName: "Authorization",
      valuePrefix: "Bearer",
    },
  };
}

function normalizeBaseUrl(value: string): string {
  const url = new URL(value.trim());
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new HttpCapabilityError("CONNECTION_URL_INVALID", "接口地址只能使用 HTTP 或 HTTPS");
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new HttpCapabilityError("CONNECTION_URL_INVALID", "接口地址不能包含账号、查询参数或片段");
  }
  const pathname = url.pathname.replace(/\/+$/, "");
  return `${url.origin}${pathname === "/" ? "" : pathname}`;
}

function normalizePathPrefix(value: string): string {
  const result = value.trim().replace(/^\/+|\/+$/g, "");
  if (!result) return "";
  if (result.includes("..") || result.includes("?") || result.includes("#")) {
    throw new HttpCapabilityError("CONNECTION_PATH_INVALID", "允许路径不能包含 ..、查询参数或片段");
  }
  return result;
}

function normalizeAuth(value: HttpConnectionAuth | undefined): HttpConnectionAuth | undefined {
  if (!value) return undefined;
  const headerName = value.headerName.trim();
  const valuePrefix = value.valuePrefix.trim();
  if (!/^[A-Za-z][A-Za-z0-9-]{0,63}$/.test(headerName)) {
    throw new HttpCapabilityError("CONNECTION_AUTH_INVALID", "认证请求头名称无效");
  }
  if (valuePrefix.length > 32) {
    throw new HttpCapabilityError("CONNECTION_AUTH_INVALID", "认证前缀不能超过 32 个字符");
  }
  return { headerName, valuePrefix };
}

export function normalizeHttpConnectionDraft(
  draft: HttpConnectionDraft,
): Omit<HttpConnection, "schemaVersion" | "id" | "createdAt" | "updatedAt"> {
  const name = draft.name.trim();
  if (name.length < 2 || name.length > 48) {
    throw new HttpCapabilityError("CONNECTION_NAME_INVALID", "连接名称需为 2-48 个字符");
  }
  const allowedMethods = [...new Set(draft.allowedMethods)];
  if (allowedMethods.length === 0 || allowedMethods.some((item) => !HTTP_METHODS.includes(item))) {
    throw new HttpCapabilityError("CONNECTION_METHOD_INVALID", "至少选择一种允许的请求方法");
  }
  const allowedPathPrefixes = [...new Set(
    draft.allowedPathPrefixes.map(normalizePathPrefix),
  )].slice(0, 16);
  return {
    name,
    baseUrl: normalizeBaseUrl(draft.baseUrl),
    allowedPathPrefixes,
    allowedMethods,
    auth: normalizeAuth(draft.auth),
  };
}

export function isHttpConnection(value: unknown): value is HttpConnection {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const connection = value as Partial<HttpConnection>;
  return connection.schemaVersion === 1 &&
    typeof connection.id === "string" &&
    typeof connection.name === "string" &&
    typeof connection.baseUrl === "string" &&
    Array.isArray(connection.allowedPathPrefixes) &&
    Array.isArray(connection.allowedMethods) &&
    typeof connection.createdAt === "string" &&
    typeof connection.updatedAt === "string";
}
