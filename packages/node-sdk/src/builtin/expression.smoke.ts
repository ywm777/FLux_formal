import { evaluateCondition } from "./expression.js";
import { builtinNodes, conditionNode, customCodeNode } from "./index.js";

function equal(actual: unknown, expected: unknown, message: string): void {
  if (!Object.is(actual, expected)) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

function throws(run: () => unknown, pattern: RegExp, message: string): void {
  try {
    run();
  } catch (error) {
    const text = error instanceof Error ? error.message : String(error);
    if (pattern.test(text)) return;
    throw new Error(`${message}: unexpected error ${text}`);
  }
  throw new Error(`${message}: expected an error`);
}

async function rejects(
  run: () => Promise<unknown>,
  pattern: RegExp,
  message: string,
): Promise<void> {
  try {
    await run();
  } catch (error) {
    const text = error instanceof Error ? error.message : String(error);
    if (pattern.test(text)) return;
    throw new Error(`${message}: unexpected error ${text}`);
  }
  throw new Error(`${message}: expected a rejection`);
}

equal(evaluateCondition("input.status === 200", { status: 200 }), true, "strict equality");
equal(
  evaluateCondition("input.ok && input.count >= 2", { ok: true, count: 3 }),
  true,
  "boolean composition",
);
equal(
  evaluateCondition("!(input.kind === 'skip')", { kind: "run" }),
  true,
  "parentheses and unary not",
);
equal(evaluateCondition("input.missing === null", {}), false, "missing path");
throws(
  () => evaluateCondition("input.constructor.constructor('return process')()", {}),
  /不支持|非法|属性/,
  "function calls must be rejected",
);

equal(
  builtinNodes.some((node) => node.id === customCodeNode.id),
  false,
  "custom code must not be registered as a built-in node",
);
await rejects(
  () =>
    customCodeNode.execute({
      nodeId: "custom",
      config: { code: "return input;" },
      inputs: { value: 1 },
      signal: new AbortController().signal,
      log: () => undefined,
      invoke: async () => undefined,
    }),
  /隔离沙箱|已禁用/,
  "custom code must fail closed",
);
const conditionResult = await conditionNode.execute({
  nodeId: "condition",
  config: { expression: "input.status === 200" },
  inputs: { status: 200 },
  signal: new AbortController().signal,
  log: () => undefined,
  invoke: async () => undefined,
});
equal("true" in conditionResult.outputs, true, "condition node uses restricted evaluator");

console.log("expression smoke passed");
