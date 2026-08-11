import type { JSONSchema } from "@flux/node-sdk";
import type { CapabilityOperation } from "./capability.js";

export const MCP_PROTOCOL_VERSION = "2025-11-25";
export type McpTransport = "streamable-http" | "stdio";

export interface McpConnection {
  schemaVersion: 2;
  id: string;
  name: string;
  transport: McpTransport;
  enabled: boolean;
  serverUrl: string;
  authentication: "none" | "bearer";
  command: string;
  args: string[];
  cwd?: string;
  environment: Record<string, string>;
  protocolVersion: string;
  serverName?: string;
  serverVersion?: string;
  operations: CapabilityOperation[];
  createdAt: string;
  updatedAt: string;
}

export interface McpConnectionDraft {
  id?: string;
  name: string;
  transport: McpTransport;
  enabled: boolean;
  serverUrl: string;
  authentication: "none" | "bearer";
  command: string;
  argsText: string;
  cwd: string;
  environmentText: string;
}

export interface McpConnectionLibrarySnapshot {
  schemaVersion: 2;
  connections: McpConnection[];
}

export interface McpJsonConfigResult {
  draft: McpConnectionDraft;
  token: string;
}

export class McpCapabilityError extends Error {
  readonly code: string;

  constructor(
    code: string,
    message: string,
  ) {
    super(message);
    this.name = "McpCapabilityError";
    this.code = code;
  }
}

export function createMcpConnectionDraft(): McpConnectionDraft {
  return {
    name: "我的能力服务",
    transport: "streamable-http",
    enabled: true,
    serverUrl: "https://example.com/mcp",
    authentication: "none",
    command: "npx",
    argsText: "-y\n@modelcontextprotocol/server-everything",
    cwd: "",
    environmentText: "",
  };
}

export function createMcpJsonTemplate(): string {
  return JSON.stringify({
    mcpServers: {
      context7: {
        command: "npx",
        args: ["-y", "@upstash/context7-mcp"],
        env: {},
      },
    },
  }, null, 2);
}

export function mcpDraftToJson(draft: McpConnectionDraft): string {
  const name = draft.name.trim() || "mcp-server";
  const server = draft.transport === "stdio"
    ? {
        command: draft.command.trim(),
        args: draft.argsText.split(/\r?\n/).map((item) => item.trim()).filter(Boolean),
        ...(draft.cwd.trim() ? { cwd: draft.cwd.trim() } : {}),
        env: Object.fromEntries(
          draft.environmentText.split(/\r?\n/).map((item) => item.trim()).filter(Boolean).map((entry) => {
            const separator = entry.indexOf("=");
            return separator < 0 ? [entry, ""] : [entry.slice(0, separator).trim(), entry.slice(separator + 1)];
          }),
        ),
        enabled: draft.enabled,
      }
    : {
        url: draft.serverUrl.trim(),
        ...(draft.authentication !== "none" ? { authentication: draft.authentication } : {}),
        enabled: draft.enabled,
      };
  return JSON.stringify({ mcpServers: { [name]: server } }, null, 2);
}

export function parseMcpConnectionJson(source: string, id?: string): McpJsonConfigResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "JSON 语法无效";
    throw new McpCapabilityError("MCP_JSON_INVALID", `JSON 配置无法解析：${detail}`);
  }
  if (!isRecord(parsed)) {
    throw new McpCapabilityError("MCP_JSON_INVALID", "JSON 顶层必须是对象");
  }

  let name: string;
  let rawServer: Record<string, unknown>;
  if (parsed.mcpServers !== undefined) {
    if (!isRecord(parsed.mcpServers)) {
      throw new McpCapabilityError("MCP_JSON_INVALID", "mcpServers 必须是对象");
    }
    const entries = Object.entries(parsed.mcpServers);
    if (entries.length !== 1 || !isRecord(entries[0]?.[1])) {
      throw new McpCapabilityError("MCP_JSON_SERVER_COUNT", "每次请配置一个 MCP 服务");
    }
    name = entries[0][0];
    rawServer = entries[0][1] as Record<string, unknown>;
  } else {
    name = typeof parsed.name === "string" ? parsed.name : "MCP 服务";
    rawServer = parsed;
  }

  const enabled = typeof rawServer.enabled === "boolean" ? rawServer.enabled : true;
  const transportHint = rawServer.transport ?? rawServer.type;
  const hasCommand = typeof rawServer.command === "string";
  const hasUrl = typeof rawServer.url === "string";
  const stdio = hasCommand || transportHint === "stdio";
  const http = hasUrl || transportHint === "http" || transportHint === "streamable-http" || transportHint === "streamable_http";
  if (stdio === http) {
    throw new McpCapabilityError("MCP_JSON_TRANSPORT", "服务需要且只能提供 command 或 url");
  }

  if (stdio) {
    if (!hasCommand) {
      throw new McpCapabilityError("MCP_JSON_COMMAND", "STDIO 服务缺少 command");
    }
    if (rawServer.args !== undefined && (!Array.isArray(rawServer.args) || rawServer.args.some((item) => typeof item !== "string"))) {
      throw new McpCapabilityError("MCP_JSON_ARGS", "args 必须是字符串数组");
    }
    const rawEnvironment = rawServer.env ?? rawServer.environment ?? {};
    if (!isRecord(rawEnvironment) || Object.values(rawEnvironment).some((value) => typeof value !== "string")) {
      throw new McpCapabilityError("MCP_JSON_ENV", "env 必须是字符串键值对象");
    }
    return {
      draft: {
        ...(id ? { id } : {}),
        name,
        transport: "stdio",
        enabled,
        serverUrl: "",
        authentication: "none",
        command: rawServer.command as string,
        argsText: (rawServer.args as string[] | undefined)?.join("\n") ?? "",
        cwd: typeof rawServer.cwd === "string" ? rawServer.cwd : "",
        environmentText: Object.entries(rawEnvironment).map(([key, value]) => `${key}=${value as string}`).join("\n"),
      },
      token: "",
    };
  }

  const headers = isRecord(rawServer.headers)
    ? rawServer.headers
    : isRecord(rawServer.http_headers) ? rawServer.http_headers : {};
  const authorization = Object.entries(headers).find(([key]) => key.toLowerCase() === "authorization")?.[1];
  const headerToken = typeof authorization === "string" && /^Bearer\s+/i.test(authorization)
    ? authorization.replace(/^Bearer\s+/i, "").trim()
    : "";
  const explicitToken = typeof rawServer.accessToken === "string"
    ? rawServer.accessToken
    : typeof rawServer.bearerToken === "string" ? rawServer.bearerToken : "";
  const authentication = rawServer.authentication === "bearer" || headerToken || explicitToken ? "bearer" : "none";
  return {
    draft: {
      ...(id ? { id } : {}),
      name,
      transport: "streamable-http",
      enabled,
      serverUrl: rawServer.url as string,
      authentication,
      command: "",
      argsText: "",
      cwd: "",
      environmentText: "",
    },
    token: explicitToken || headerToken,
  };
}

function parseArguments(value: string): string[] {
  const args = value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
  if (args.length > 32 || args.some((item) => item.length > 1024)) {
    throw new McpCapabilityError("MCP_STDIO_ARGS_INVALID", "STDIO 参数最多 32 项，每项不能超过 1024 个字符");
  }
  return args;
}

function parseEnvironment(value: string): Record<string, string> {
  const entries = value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
  if (entries.length > 32) {
    throw new McpCapabilityError("MCP_STDIO_ENV_INVALID", "STDIO 环境变量最多 32 项");
  }
  const environment: Record<string, string> = {};
  for (const entry of entries) {
    const separator = entry.indexOf("=");
    const key = separator < 0 ? entry : entry.slice(0, separator).trim();
    const valuePart = separator < 0 ? "" : entry.slice(separator + 1);
    if (!/^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(key) || valuePart.length > 4096) {
      throw new McpCapabilityError("MCP_STDIO_ENV_INVALID", "环境变量需要使用 KEY=value 格式，名称和长度必须有效");
    }
    environment[key] = valuePart;
  }
  return environment;
}

export function normalizeMcpConnectionDraft(
  draft: McpConnectionDraft,
): Omit<McpConnection, "schemaVersion" | "id" | "protocolVersion" | "serverName" | "serverVersion" | "operations" | "createdAt" | "updatedAt"> {
  const name = draft.name.trim();
  if (name.length < 2 || name.length > 48) {
    throw new McpCapabilityError("MCP_CONNECTION_NAME_INVALID", "连接名称需为 2-48 个字符");
  }
  if (draft.transport === "stdio") {
    const command = draft.command.trim();
    if (!command || command.length > 512 || /[\r\n]/.test(command)) {
      throw new McpCapabilityError("MCP_STDIO_COMMAND_INVALID", "请填写有效的 STDIO 启动命令");
    }
    const cwd = draft.cwd.trim();
    if (cwd.length > 1024 || /[\r\n]/.test(cwd)) {
      throw new McpCapabilityError("MCP_STDIO_CWD_INVALID", "STDIO 工作目录无效");
    }
    return {
      name,
      transport: "stdio",
      enabled: draft.enabled,
      serverUrl: "",
      authentication: "none",
      command,
      args: parseArguments(draft.argsText),
      ...(cwd ? { cwd } : {}),
      environment: parseEnvironment(draft.environmentText),
    };
  }
  let url: URL;
  try {
    url = new URL(draft.serverUrl.trim());
  } catch {
    throw new McpCapabilityError("MCP_CONNECTION_URL_INVALID", "MCP 服务地址无效");
  }
  const localHttp = url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.protocol !== "https:" && !localHttp) {
    throw new McpCapabilityError("MCP_CONNECTION_URL_INSECURE", "远程 MCP 服务必须使用 HTTPS；本机服务可以使用 localhost HTTP");
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new McpCapabilityError("MCP_CONNECTION_URL_INVALID", "MCP 服务地址不能包含账号、查询参数或片段");
  }
  return {
    name,
    transport: "streamable-http",
    enabled: draft.enabled,
    serverUrl: url.toString().replace(/\/$/, ""),
    authentication: draft.authentication,
    command: "",
    args: [],
    environment: {},
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sanitizeSchema(value: unknown, depth = 0): JSONSchema {
  if (!isRecord(value) || depth > 4) return { type: "object", properties: {} };
  const rawType = value.type;
  const type: JSONSchema["type"] = rawType === "integer"
    ? "number"
    : ["object", "string", "number", "boolean", "array"].includes(String(rawType))
      ? rawType as JSONSchema["type"]
      : depth === 0 ? "object" : "string";
  const schema: JSONSchema = { type };
  if (typeof value.title === "string") schema.title = value.title.slice(0, 80);
  if (typeof value.description === "string") schema.description = value.description.slice(0, 240);
  if (value.default !== undefined) schema.default = value.default;
  if (Array.isArray(value.enum)) {
    schema.enum = value.enum
      .filter((item): item is string | number => typeof item === "string" || typeof item === "number")
      .slice(0, 50);
  }
  if (type === "object" && isRecord(value.properties)) {
    schema.properties = Object.fromEntries(
      Object.entries(value.properties)
        .slice(0, 24)
        .map(([key, child]) => [key, sanitizeSchema(child, depth + 1)]),
    );
    if (Array.isArray(value.required)) {
      schema.required = value.required
        .filter((item): item is string => typeof item === "string" && Boolean(schema.properties?.[item]))
        .slice(0, 24);
    }
  }
  if (type === "array" && value.items !== undefined) {
    schema.items = sanitizeSchema(value.items, depth + 1);
  }
  return schema;
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function shortHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

function nodeTypeFor(connectionId: string, toolName: string): string {
  const provider = connectionId.replace(/^mcp_/, "").replace(/[^a-zA-Z0-9]/g, "").slice(0, 20);
  const slug = toolName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 32) || "tool";
  return `capability.mcp.${provider}.${slug}-${shortHash(toolName)}`;
}

export interface McpToolLike {
  name: string;
  title?: string;
  description?: string;
  inputSchema?: unknown;
  outputSchema?: unknown;
  annotations?: {
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    idempotentHint?: boolean;
  };
}

export function operationFromMcpTool(
  connectionId: string,
  tool: McpToolLike,
): CapabilityOperation {
  const inputSchema = sanitizeSchema(tool.inputSchema);
  const outputSchema = tool.outputSchema ? sanitizeSchema(tool.outputSchema) : undefined;
  const fingerprintSource = stableStringify({ inputSchema, outputSchema });
  return {
    id: `${connectionId}:${tool.name}`,
    providerId: connectionId,
    nodeType: nodeTypeFor(connectionId, tool.name),
    externalName: tool.name,
    title: tool.title?.trim() || tool.name,
    description: tool.description?.trim().slice(0, 240),
    inputSchema,
    outputSchema,
    effect: tool.annotations?.destructiveHint
      ? "destructive"
      : tool.annotations?.readOnlyHint ? "read" : "write",
    idempotent: tool.annotations?.idempotentHint === true,
    schemaFingerprint: shortHash(fingerprintSource),
  };
}

export function isMcpConnection(value: unknown): value is McpConnection {
  if (!isRecord(value)) return false;
  return value.schemaVersion === 2 &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    (value.transport === "streamable-http" || value.transport === "stdio") &&
    typeof value.enabled === "boolean" &&
    typeof value.serverUrl === "string" &&
    (value.authentication === "none" || value.authentication === "bearer") &&
    typeof value.command === "string" &&
    Array.isArray(value.args) && value.args.every((item) => typeof item === "string") &&
    (value.cwd === undefined || typeof value.cwd === "string") &&
    isRecord(value.environment) && Object.values(value.environment).every((item) => typeof item === "string") &&
    typeof value.protocolVersion === "string" &&
    Array.isArray(value.operations) &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string";
}

interface LegacyMcpConnection {
  schemaVersion: 1;
  id: string;
  name: string;
  serverUrl: string;
  authentication: "none" | "bearer";
  protocolVersion: string;
  serverName?: string;
  serverVersion?: string;
  operations: CapabilityOperation[];
  createdAt: string;
  updatedAt: string;
}

function isLegacyMcpConnection(value: unknown): value is LegacyMcpConnection {
  if (!isRecord(value)) return false;
  return value.schemaVersion === 1 &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.serverUrl === "string" &&
    (value.authentication === "none" || value.authentication === "bearer") &&
    typeof value.protocolVersion === "string" &&
    Array.isArray(value.operations) &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string";
}

export function parseMcpConnectionLibrarySnapshot(value: unknown): McpConnectionLibrarySnapshot | null {
  if (!isRecord(value) || !Array.isArray(value.connections)) return null;
  if (value.schemaVersion === 2 && value.connections.every(isMcpConnection)) {
    return value as unknown as McpConnectionLibrarySnapshot;
  }
  if (value.schemaVersion === 1 && value.connections.every(isLegacyMcpConnection)) {
    return {
      schemaVersion: 2,
      connections: value.connections.map((connection) => ({
        ...connection,
        schemaVersion: 2,
        transport: "streamable-http",
        enabled: true,
        command: "",
        args: [],
        environment: {},
      })),
    };
  }
  return null;
}
