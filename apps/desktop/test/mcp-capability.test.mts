import assert from "node:assert/strict";
import test from "node:test";
import {
  mcpDraftToJson,
  normalizeMcpConnectionDraft,
  parseMcpConnectionJson,
  operationFromMcpTool,
  parseMcpConnectionLibrarySnapshot,
  type McpConnection,
} from "../src/lib/capabilities/mcpConnection.ts";
import { createMcpNodeDefinitions } from "../src/lib/capabilities/mcpNodeDefinitions.ts";
import { callMcpTool } from "../src/lib/capabilities/mcpClient.ts";

test("MCP connections require HTTPS except for local development", () => {
  assert.equal(normalizeMcpConnectionDraft({
    name: "CRM 能力",
    transport: "streamable-http",
    enabled: true,
    serverUrl: "https://mcp.example.com/mcp/",
    authentication: "bearer",
    command: "",
    argsText: "",
    cwd: "",
    environmentText: "",
  }).serverUrl, "https://mcp.example.com/mcp");

  assert.equal(normalizeMcpConnectionDraft({
    name: "本地能力",
    transport: "streamable-http",
    enabled: true,
    serverUrl: "http://127.0.0.1:3210/mcp",
    authentication: "none",
    command: "",
    argsText: "",
    cwd: "",
    environmentText: "",
  }).serverUrl, "http://127.0.0.1:3210/mcp");

  assert.throws(() => normalizeMcpConnectionDraft({
    name: "不安全连接",
    transport: "streamable-http",
    enabled: true,
    serverUrl: "http://example.com/mcp",
    authentication: "none",
    command: "",
    argsText: "",
    cwd: "",
    environmentText: "",
  }), /必须使用 HTTPS/);
});

test("STDIO connections keep command arguments separate from the shell", () => {
  const normalized = normalizeMcpConnectionDraft({
    name: "本地文档",
    transport: "stdio",
    enabled: true,
    serverUrl: "",
    authentication: "none",
    command: "npx",
    argsText: "-y\n@upstash/context7-mcp",
    cwd: "D:\\workspace",
    environmentText: "REGION=cn\nDEBUG=0",
  });

  assert.equal(normalized.transport, "stdio");
  assert.equal(normalized.command, "npx");
  assert.deepEqual(normalized.args, ["-y", "@upstash/context7-mcp"]);
  assert.deepEqual(normalized.environment, { REGION: "cn", DEBUG: "0" });
  assert.equal(normalized.serverUrl, "");
});

test("mcpServers JSON parses STDIO and round-trips through the visual draft", () => {
  const parsed = parseMcpConnectionJson(JSON.stringify({
    mcpServers: {
      context7: {
        command: "npx",
        args: ["-y", "@upstash/context7-mcp"],
        env: { REGION: "cn" },
        cwd: "D:\\workspace",
        enabled: false,
      },
    },
  }));

  assert.equal(parsed.draft.name, "context7");
  assert.equal(parsed.draft.transport, "stdio");
  assert.equal(parsed.draft.argsText, "-y\n@upstash/context7-mcp");
  assert.equal(parsed.draft.environmentText, "REGION=cn");
  assert.equal(parsed.draft.enabled, false);
  assert.deepEqual(JSON.parse(mcpDraftToJson(parsed.draft)), {
    mcpServers: {
      context7: {
        command: "npx",
        args: ["-y", "@upstash/context7-mcp"],
        cwd: "D:\\workspace",
        env: { REGION: "cn" },
        enabled: false,
      },
    },
  });
});

test("mcpServers JSON accepts HTTP and keeps bearer values session-only", () => {
  const parsed = parseMcpConnectionJson(JSON.stringify({
    mcpServers: {
      figma: {
        type: "http",
        url: "https://mcp.example.com/mcp",
        headers: { Authorization: "Bearer session-secret" },
      },
    },
  }));

  assert.equal(parsed.draft.transport, "streamable-http");
  assert.equal(parsed.draft.authentication, "bearer");
  assert.equal(parsed.token, "session-secret");
  assert.doesNotMatch(mcpDraftToJson(parsed.draft), /session-secret/);
});

test("stored HTTP MCP connections migrate to the transport-aware shape", () => {
  const migrated = parseMcpConnectionLibrarySnapshot({
    schemaVersion: 1,
    connections: [{
      schemaVersion: 1,
      id: "mcp_legacy",
      name: "旧连接",
      serverUrl: "https://example.com/mcp",
      authentication: "none",
      protocolVersion: "2025-11-25",
      operations: [],
      createdAt: "2026-07-25T00:00:00.000Z",
      updatedAt: "2026-07-25T00:00:00.000Z",
    }],
  });

  assert.equal(migrated?.schemaVersion, 2);
  assert.equal(migrated?.connections[0]?.transport, "streamable-http");
  assert.equal(migrated?.connections[0]?.enabled, true);
});

test("MCP tools become protocol-neutral versioned operations", () => {
  const operation = operationFromMcpTool("mcp_provider", {
    name: "crm_create_contact",
    title: "创建客户",
    description: "在 CRM 中创建一个客户记录",
    inputSchema: {
      type: "object",
      required: ["name"],
      properties: {
        name: { type: "string", title: "客户名称" },
        score: { type: "integer", title: "评分" },
      },
    },
    annotations: { destructiveHint: false, idempotentHint: true },
  });

  assert.equal(operation.providerId, "mcp_provider");
  assert.equal(operation.externalName, "crm_create_contact");
  assert.equal(operation.title, "创建客户");
  assert.equal(operation.inputSchema.properties?.score?.type, "number");
  assert.equal(operation.idempotent, true);
  assert.match(operation.nodeType, /^capability\.mcp\./);
  assert.ok(operation.schemaFingerprint);
});

test("generated capability nodes merge configured and upstream arguments", async () => {
  const operation = operationFromMcpTool("mcp_provider", {
    name: "echo",
    title: "回显内容",
    inputSchema: {
      type: "object",
      required: ["message"],
      properties: {
        message: { type: "string", title: "内容" },
        meta: { type: "object", title: "附加信息" },
      },
    },
  });
  const connection: McpConnection = {
    schemaVersion: 2,
    id: "mcp_provider",
    name: "测试服务",
    transport: "streamable-http",
    enabled: true,
    serverUrl: "http://127.0.0.1:3210/mcp",
    authentication: "none",
    command: "",
    args: [],
    environment: {},
    protocolVersion: "2025-11-25",
    operations: [operation],
    createdAt: "2026-07-25T00:00:00.000Z",
    updatedAt: "2026-07-25T00:00:00.000Z",
  };
  const definition = createMcpNodeDefinitions([connection])[0]!;
  const calls: unknown[] = [];

  const result = await definition.execute({
    nodeId: "node-1",
    config: { message: "configured", meta: "{\"source\":\"flux\"}" },
    inputs: { message: "from-upstream" },
    signal: new AbortController().signal,
    log() {},
    async invoke(bindingId, action, payload) {
      calls.push({ bindingId, action, payload });
      return { echoed: payload };
    },
  });

  assert.deepEqual(calls, [{
    bindingId: "mcp_provider",
    action: "echo",
    payload: { message: "from-upstream", meta: { source: "flux" } },
  }]);
  assert.deepEqual(result.outputs, {
    out: { echoed: { message: "from-upstream", meta: { source: "flux" } } },
  });
});

test("HTTP MCP tool calls propagate the runtime idempotency key in header and _meta", async () => {
  const connection: McpConnection = {
    schemaVersion: 2,
    id: "mcp_idempotency",
    name: "幂等测试",
    transport: "streamable-http",
    enabled: true,
    serverUrl: "https://mcp.example.com/mcp",
    authentication: "none",
    command: "",
    args: [],
    environment: {},
    protocolVersion: "2025-11-25",
    operations: [],
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
  };
  const metadata = {
    executionId: "execution",
    nodeId: "node",
    attempt: 1,
    invocationIndex: 0,
    idempotencyKey: `flux_${"a".repeat(64)}`,
  };
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;
  let callHeader: string | null = null;
  let callMeta: unknown;
  Object.assign(globalThis, { window: { setTimeout, clearTimeout } });
  globalThis.fetch = async (_input, init) => {
    const message = JSON.parse(String(init?.body ?? "{}")) as {
      id?: string;
      method?: string;
      params?: Record<string, unknown>;
    };
    if (message.method === "tools/call") {
      callHeader = new Headers(init?.headers).get("Idempotency-Key");
      callMeta = message.params?._meta;
      return new Response(JSON.stringify({
        jsonrpc: "2.0",
        id: message.id,
        result: { structuredContent: { ok: true } },
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    if (message.method === "initialize") {
      return new Response(JSON.stringify({
        jsonrpc: "2.0",
        id: message.id,
        result: {
          protocolVersion: "2025-11-25",
          serverInfo: { name: "test", version: "1" },
        },
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    return new Response("", { status: 202 });
  };
  try {
    assert.deepEqual(
      await callMcpTool(connection, "write", { value: 1 }, metadata),
      { ok: true },
    );
    assert.equal(callHeader, metadata.idempotencyKey);
    assert.deepEqual(callMeta, { "flux/idempotencyKey": metadata.idempotencyKey });
  } finally {
    globalThis.fetch = originalFetch;
    if (originalWindow === undefined) {
      delete (globalThis as { window?: unknown }).window;
    } else {
      Object.assign(globalThis, { window: originalWindow });
    }
  }
});
