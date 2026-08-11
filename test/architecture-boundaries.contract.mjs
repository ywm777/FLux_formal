import { readdirSync, readFileSync, statSync } from "node:fs";
import { relative, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const violations = [];

function sourceFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory)) {
    const path = resolve(directory, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      if (entry !== "dist" && entry !== "node_modules") {
        files.push(...sourceFiles(path));
      }
    } else if (/\.(?:ts|tsx|mts|mjs)$/.test(entry)) {
      files.push(path);
    }
  }
  return files;
}

function importsOf(source) {
  const imports = [];
  const patterns = [
    /(?:import|export)\s+(?:[\s\S]*?\sfrom\s*)?["']([^"']+)["']/g,
    /import\(["']([^"']+)["']\)/g,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) imports.push(match[1]);
  }
  return imports;
}

function report(file, message) {
  violations.push(`${relative(root, file)}: ${message}`);
}

const frameworkDependencies = [
  "react",
  "react-dom",
  "@nestjs/",
  "@tauri-apps/",
  "@xyflow/",
  "zustand",
  "typeorm",
  "bullmq",
];

for (const file of sourceFiles(resolve(root, "packages"))) {
  const source = readFileSync(file, "utf8");
  const isUiPackage = relative(resolve(root, "packages"), file)
    .replaceAll("\\", "/")
    .startsWith("ui/");
  for (const specifier of importsOf(source)) {
    if (specifier.includes("/apps/") || specifier.startsWith("apps/")) {
      report(file, `shared package imports application code: ${specifier}`);
    }
    if (
      !isUiPackage &&
      frameworkDependencies.some((dependency) =>
        specifier === dependency || specifier.startsWith(dependency)
      )
    ) {
      report(file, `domain package imports framework/infrastructure: ${specifier}`);
    }
  }
}

for (const file of sourceFiles(resolve(root, "apps/desktop/src/features"))) {
  const normalized = file.replaceAll("\\", "/");
  if (!normalized.includes("/application/")) continue;
  const source = readFileSync(file, "utf8");
  for (const specifier of importsOf(source)) {
    if (
      specifier.includes("/lib/") ||
      specifier.includes("/infrastructure/") ||
      specifier.includes("/store/") ||
      frameworkDependencies.some((dependency) =>
        specifier === dependency || specifier.startsWith(dependency)
      )
    ) {
      report(file, `application layer imports concrete dependency: ${specifier}`);
    }
  }
}

for (const file of sourceFiles(resolve(root, "apps/desktop/src/lib"))) {
  if (!/[\\/]\w+Core\.ts$/.test(file)) continue;
  const source = readFileSync(file, "utf8");
  for (const specifier of importsOf(source)) {
    if (specifier.includes("/store/")) {
      report(file, `core module imports UI state store: ${specifier}`);
    }
  }
}

for (const file of sourceFiles(resolve(root, "apps/api/src/modules"))) {
  const normalized = file.replaceAll("\\", "/");
  if (/\.(?:smoke|demo)\.ts$/.test(normalized)) continue;
  const source = readFileSync(file, "utf8");
  for (const specifier of importsOf(source)) {
    if (/database\/(?:file|typeorm|memory|entities)(?:\/|$)/.test(specifier)) {
      report(file, `API application module imports concrete persistence: ${specifier}`);
    }
    if (
      normalized.endsWith(".controller.ts") &&
      (specifier.includes("/database/") ||
        specifier.includes("execution-queue") ||
        specifier === "typeorm" ||
        specifier === "bullmq")
    ) {
      report(file, `API controller bypasses application service: ${specifier}`);
    }
  }
}

for (const file of sourceFiles(resolve(root, "apps/api/src/database"))) {
  const source = readFileSync(file, "utf8");
  for (const specifier of importsOf(source)) {
    if (specifier.includes("modules/")) {
      report(file, `persistence adapter imports feature module: ${specifier}`);
    }
  }
}

// Two built-ins still carry legacy direct fetch implementations. Keep that debt
// explicit while preventing additional domain/runtime files from bypassing the
// capability gateway.
const legacyNetworkGlobalAllowlist = new Set([
  "packages/node-sdk/src/builtin/index.ts",
  "packages/node-sdk/src/builtin/integrations.ts",
]);
for (const directory of [
  resolve(root, "packages/node-sdk/src"),
  resolve(root, "packages/workflow-runtime/src"),
]) {
  for (const file of sourceFiles(directory)) {
    const path = relative(root, file).replaceAll("\\", "/");
    if (/\.(?:smoke|test)\.[cm]?[jt]sx?$/.test(path)) continue;
    if (legacyNetworkGlobalAllowlist.has(path)) continue;
    if (/\b(?:fetch|XMLHttpRequest|WebSocket)\s*\(/.test(readFileSync(file, "utf8"))) {
      report(file, "domain/runtime code bypasses the capability gateway");
    }
  }
}

const presentationRules = [
  {
    file: "apps/desktop/src/features/workbench/WorkbenchView.tsx",
    forbidden: ["lib/workspaceRepository", "lib/workflowFile"],
  },
  {
    file: "apps/desktop/src/features/sharing/ShareWorkflowDialog.tsx",
    forbidden: ["lib/api", "lib/localWorkspaceRepository", "lib/workflowFile"],
  },
  {
    file: "apps/desktop/src/features/sharing/SharedWorkflowView.tsx",
    forbidden: ["lib/api"],
  },
];

for (const rule of presentationRules) {
  const file = resolve(root, rule.file);
  const imports = importsOf(readFileSync(file, "utf8"));
  for (const forbidden of rule.forbidden) {
    const matched = imports.find((specifier) => specifier.includes(forbidden));
    if (matched) report(file, `presentation imports concrete adapter: ${matched}`);
  }
}

for (const file of [
  ...sourceFiles(resolve(root, "apps")),
  ...sourceFiles(resolve(root, "packages")),
]) {
  if (file.replaceAll("\\", "/").includes("packages/workflow-schema/src/")) {
    continue;
  }
  if (/WorkflowGraphSchema\.(?:parse|safeParse)/.test(readFileSync(file, "utf8"))) {
    report(file, "bypasses the versioned workflow parser");
  }
}

if (violations.length > 0) {
  console.error(`Architecture boundary violations (${violations.length}):`);
  for (const violation of violations) console.error(`- ${violation}`);
  process.exit(1);
}

console.log("Architecture boundary contract passed.");
