import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const main = readFileSync(resolve(root, "src/main.tsx"), "utf8");
const provider = readFileSync(
  resolve(root, "src/app/WorkflowCommandProvider.tsx"),
  "utf8",
);

const requirements = [
  [
    "the provider wraps the application once",
    /<WorkflowCommandProvider>[\s\S]*<App \/>[\s\S]*<\/WorkflowCommandProvider>/,
    main,
  ],
  [
    "consumers receive stable public workflow commands",
    /export function useWorkflowCommands[\s\S]*return useCoordinator\(\)\.commands/,
    provider,
  ],
  [
    "the active canvas session registers through a dedicated hook",
    /export function useRegisterWorkflowCommands[\s\S]*handlersRef\.current = handlers[\s\S]*coordinator\.register/,
    provider,
  ],
  [
    "the provider forwards workflow navigation arguments to the latest handlers",
    /openWorkflow: \(workflowId\) =>\s*handlersRef\.current\.openWorkflow\(workflowId\)[\s\S]*createDraft: \(input\) => handlersRef\.current\.createDraft\(input\)/,
    provider,
  ],
];

const missing = requirements
  .filter(([, pattern, source]) => !pattern.test(source))
  .map(([label]) => label);

if (missing.length > 0) {
  console.error(`Missing ${missing.length} workflow command provider requirement(s):`);
  for (const label of missing) console.error(`- ${label}`);
  process.exit(1);
}

console.log("Workflow command provider contract passed.");
