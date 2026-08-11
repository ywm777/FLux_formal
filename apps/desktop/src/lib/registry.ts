import { NodeRegistry, builtinNodes, catalogNodes } from "@flux/node-sdk";

/** 渲染进程共享的节点注册表（内置节点） */
export const registry = new NodeRegistry();
registry.registerAll(builtinNodes);

export { builtinNodes, catalogNodes };
