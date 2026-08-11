import type { JSONSchema } from "@flux/node-sdk";

export type CapabilityEffect = "read" | "write" | "destructive";

/**
 * 协议中立的外部能力描述。画布只消费这个对象，不感知 MCP、HTTP 等协议。
 */
export interface CapabilityOperation {
  id: string;
  providerId: string;
  nodeType: string;
  externalName: string;
  title: string;
  description?: string;
  inputSchema: JSONSchema;
  outputSchema?: JSONSchema;
  effect: CapabilityEffect;
  idempotent: boolean;
  schemaFingerprint: string;
}

export interface CapabilityProviderSummary {
  id: string;
  adapter: "mcp" | "http";
  name: string;
  operationCount: number;
}
