import type { NodeDefinition } from "./types.js";

/** 节点注册表：内置 + 用户自定义 + 市场 Fork 节点统一登记 */
export class NodeRegistry {
  private readonly defs = new Map<string, NodeDefinition>();

  register(def: NodeDefinition): void {
    if (this.defs.has(def.id)) {
      throw new Error(`节点类型已存在: ${def.id}`);
    }
    this.defs.set(def.id, def);
  }

  registerAll(defs: NodeDefinition[]): void {
    for (const def of defs) this.register(def);
  }

  resolve(type: string): NodeDefinition | undefined {
    return this.defs.get(type);
  }

  list(): NodeDefinition[] {
    return [...this.defs.values()];
  }
}

/** 辅助：定义节点（提供类型推断与默认值） */
export function defineNode(def: NodeDefinition): NodeDefinition {
  return def;
}
