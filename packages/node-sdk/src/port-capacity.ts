import type { PortSpec } from "./types.js";

export type PortDirection = "input" | "output";
export type PortCapacity = NonNullable<PortSpec["capacity"]>;

/**
 * 统一端口基数契约：输出默认广播到多个下游，输入默认只接收一个上游。
 * 显式 capacity 始终优先，供分支、聚合等特殊节点覆盖默认值。
 */
export function defaultPortCapacity(direction: PortDirection): PortCapacity {
  return direction === "output" ? "many" : "one";
}

export function resolvePortCapacity(
  port: Pick<PortSpec, "capacity">,
  direction: PortDirection,
): PortCapacity {
  return port.capacity ?? defaultPortCapacity(direction);
}
