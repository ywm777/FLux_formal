/**
 * 可运行 demo：证明一条工作流的执行闭环（含条件分支）。
 * 运行：pnpm --filter @flux/api run demo:exec
 *
 * 工作流：演示触发 → 条件分支(input.ok===true) →(真) 日志A /(假) 日志B
 * 触发节点输出 { ok: true }，故应走"真"分支，日志B 被跳过。
 */
import { NodeRegistry, builtinNodes, defineNode } from "@flux/node-sdk";
import { parseGraph } from "@flux/workflow-schema";
import { runWorkflow } from "./engine";

async function main() {
  const registry = new NodeRegistry();
  registry.registerAll(builtinNodes);

  registry.register(
    defineNode({
      id: "demo.trigger.ok",
      name: "演示触发",
      category: "触发器",
      icon: "zap",
      version: "0.1.0",
      carrier: "trigger",
      ports: { inputs: [], outputs: [{ id: "out", name: "开始" }] },
      configSchema: { type: "object", properties: {} },
      async execute() {
        return { outputs: { out: { ok: true } } };
      },
    }),
  );

  const graph = parseGraph({
    id: "wf_demo",
    version: 1,
    meta: { title: "条件分支演示", tags: ["demo"] },
    nodes: [
      { id: "trigger", type: "demo.trigger.ok", position: { x: 0, y: 0 }, data: {}, ports: { inputs: [], outputs: [{ id: "out", name: "开始" }] } },
      {
        id: "cond",
        type: "flux.logic.condition",
        position: { x: 200, y: 0 },
        data: { expression: "input.ok === true" },
        ports: { inputs: [{ id: "in", name: "输入" }], outputs: [{ id: "true", name: "真" }, { id: "false", name: "假" }] },
      },
      { id: "logA", type: "flux.action.log", position: { x: 400, y: -60 }, data: { message: "走了【真】分支" }, ports: { inputs: [{ id: "in", name: "输入" }], outputs: [{ id: "out", name: "输出" }] } },
      { id: "logB", type: "flux.action.log", position: { x: 400, y: 60 }, data: { message: "走了【假】分支" }, ports: { inputs: [{ id: "in", name: "输入" }], outputs: [{ id: "out", name: "输出" }] } },
    ],
    edges: [
      { id: "e1", source: "trigger", target: "cond", sourcePort: "out", targetPort: "in" },
      { id: "e2", source: "cond", target: "logA", sourcePort: "true", targetPort: "in" },
      { id: "e3", source: "cond", target: "logB", sourcePort: "false", targetPort: "in" },
    ],
  });

  const processEvents: string[] = [];
  const result = await runWorkflow(graph, registry, {
    onNodeRun: (run) => processEvents.push(`${run.nodeId}:${run.status}`),
  });

  console.log("\n=== 执行结果 ===");
  console.log("状态:", result.status);
  console.log("拓扑顺序:", result.order.join(" -> "));
  console.log("\n节点运行:");
  for (const run of result.runs) {
    console.log(`  [${run.status}] ${run.nodeId} (${run.type})`);
  }
  console.log("\n日志:");
  for (const log of result.logs) {
    console.log(`  ${log.level} @${log.nodeId}: ${log.message}`);
  }

  const logBRun = result.runs.find((r) => r.nodeId === "logB");
  const logARun = result.runs.find((r) => r.nodeId === "logA");
  const ok =
    result.status === "success" &&
    logARun?.status === "success" &&
    logBRun?.status === "skipped" &&
    processEvents.includes("trigger:running") &&
    processEvents.includes("cond:running") &&
    processEvents.includes("logA:running") &&
    !processEvents.includes("logB:running");
  console.log(`过程状态事件: ${processEvents.join(" -> ")}`);
  console.log(`\n断言（真分支执行、假分支跳过）: ${ok ? "通过 PASS" : "失败 FAIL"}`);
  process.exit(ok ? 0 : 1);
}

void main();
