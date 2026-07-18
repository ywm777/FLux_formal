import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const providerPath = resolve(root, "src/app/WorkspaceServiceProvider.tsx");
const main = readFileSync(resolve(root, "src/main.tsx"), "utf8");

let provider = "";
try {
  provider = readFileSync(providerPath, "utf8");
} catch {
  // The red phase intentionally starts before the provider exists.
}

const requirements = [
  [
    "provider exposes only the workspace repository application port",
    /createContext<WorkspaceRepositoryPort \| null>[\s\S]*export function WorkspaceServiceProvider[\s\S]*value=\{workspaceRepository\}[\s\S]*export function useWorkspaceRepository\(\): WorkspaceRepositoryPort/,
    provider,
  ],
  [
    "composition root installs workspace services above the app",
    /<WorkspaceServiceProvider>[\s\S]*<WorkflowCommandProvider>[\s\S]*<App \/>[\s\S]*<\/WorkflowCommandProvider>[\s\S]*<\/WorkspaceServiceProvider>/,
    main,
  ],
];

const missing = requirements
  .filter(([, pattern, source]) => !pattern.test(source))
  .map(([label]) => label);

if (missing.length > 0) {
  throw new Error(`Workspace service provider contract failed: ${missing.join("; ")}`);
}

console.log("Workspace service provider contract passed.");
