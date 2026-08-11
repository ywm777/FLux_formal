import type { CarrierKind, NodeDefinition } from "@flux/node-sdk";
import { registry } from "./registry.js";

const CARRIER_LABELS: Record<string, string> = {
  basic: "工具",
  app: "应用",
  code: "代码",
  ai: "AI",
  data: "数据",
  subflow: "子工作流",
  trigger: "触发",
};

export function getCarrierLabel(carrier: CarrierKind): string {
  return CARRIER_LABELS[String(carrier)] ?? String(carrier);
}

export function getNodeDefinitionSummary(def: NodeDefinition): string {
  return def.description ?? getCarrierLabel(def.carrier);
}

export function getNodeTypeName(type: string): string {
  const def = registry.resolve(type);
  if (def) return def.name;
  return type
    .replace(/^flux\./, "")
    .split(".")
    .filter(Boolean)
    .join(" / ");
}

export function getNodeTypeSummary(type: string): string {
  const def = registry.resolve(type);
  if (!def) return "自定义节点";
  const carrier = getCarrierLabel(def.carrier);
  return def.category === carrier ? carrier : `${def.category} · ${carrier}`;
}
