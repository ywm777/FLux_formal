import type { JSONSchema, NodeDefinition } from "@flux/node-sdk";
import type { CapabilityOperation } from "./capability.js";
import type { McpConnection } from "./mcpConnection.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseConfiguredValue(value: unknown, schema: JSONSchema): unknown {
  if ((schema.type === "object" || schema.type === "array") && typeof value === "string") {
    if (!value.trim()) return undefined;
    try {
      return JSON.parse(value);
    } catch {
      throw new Error(`${schema.title ?? "JSON 参数"}不是有效的 JSON`);
    }
  }
  return value === "" ? undefined : value;
}

function buildArguments(
  operation: CapabilityOperation,
  config: Record<string, unknown>,
  inputs: unknown,
): Record<string, unknown> {
  const properties = operation.inputSchema.properties ?? {};
  const configured = Object.fromEntries(
    Object.entries(properties).flatMap(([key, schema]) => {
      const value = parseConfiguredValue(config[key], schema);
      return value === undefined ? [] : [[key, value]];
    }),
  );
  const upstream = isRecord(inputs)
    ? inputs
    : inputs === undefined || inputs === null
      ? {}
      : Object.keys(properties).length === 1
        ? { [Object.keys(properties)[0]!]: inputs }
        : { input: inputs };
  const args = { ...configured, ...upstream };
  const missing = (operation.inputSchema.required ?? []).filter((key) => {
    const value = args[key];
    return value === undefined || value === null || (typeof value === "string" && !value.trim());
  });
  if (missing.length > 0) {
    const labels = missing.map((key) => properties[key]?.title ?? key);
    throw new Error(`请在节点高级设置中填写：${labels.join("、")}`);
  }
  return args;
}

export function createMcpNodeDefinitions(connections: McpConnection[]): NodeDefinition[] {
  return connections.flatMap((connection) =>
    connection.operations.map((operation): NodeDefinition => ({
      id: operation.nodeType,
      name: operation.title,
      description: operation.description || `通过 ${connection.name} 执行 ${operation.externalName}`,
      category: `已连接服务 · ${connection.name}`,
      icon: "network",
      version: `0.1.0+${operation.schemaFingerprint}`,
      carrier: "app",
      ports: {
        inputs: [{ id: "in", name: "参数", dataType: "object", capacity: "one" }],
        outputs: [{ id: "out", name: "结果", dataType: "any", capacity: "many" }],
      },
      configSchema: operation.inputSchema,
      bindings: [{ bindingId: connection.id, carrier: "app", label: connection.name }],
      async execute(ctx) {
        const args = buildArguments(operation, ctx.config, ctx.inputs);
        ctx.log("info", `正在通过 ${connection.name} 调用 ${operation.title}`);
        const result = await ctx.invoke(connection.id, operation.externalName, args);
        return { outputs: { out: result } };
      },
    })),
  );
}
