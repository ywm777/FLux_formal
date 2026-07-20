import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");

function read(path) {
  return readFileSync(resolve(root, path), "utf8");
}

function readOptional(path) {
  const resolved = resolve(root, path);
  return existsSync(resolved) ? readFileSync(resolved, "utf8") : "";
}

const productError = readOptional("src/lib/productError.ts");
const authStore = read("src/store/authStore.ts");
const tasksStore = read("src/store/tasksStore.ts");
const canvasView = read("src/features/canvas/CanvasView.tsx");
const canvasSession = read("src/features/canvas/session/useCanvasSession.ts");
const canvasErrorSources = `${canvasSession}\n${canvasView}`;

const requirements = [
  [
    "product error helper centralizes user-facing API error copy",
    /export function formatProductErrorMessage\(error: unknown,\s*fallback: string\): string[\s\S]*Failed to fetch[\s\S]*NetworkError[\s\S]*HTTP 401[\s\S]*HTTP 403[\s\S]*HTTP 404[\s\S]*HTTP 409[\s\S]*HTTP 5\\d\\d/,
    productError,
  ],
  [
    "auth store formats login and registration errors with product copy",
    /import \{ formatProductErrorMessage \} from "\.\.\/lib\/productError\.js";[\s\S]*formatProductErrorMessage\(err,\s*"登录失败"\)[\s\S]*formatProductErrorMessage\(err,\s*"注册失败"\)/,
    authStore,
  ],
  [
    "workbench task store formats workflow loading errors with product copy",
    /import \{ formatProductErrorMessage \} from "\.\.\/lib\/productError\.js";[\s\S]*formatProductErrorMessage\(err,\s*"加载失败"\)/,
    tasksStore,
  ],
  [
    "canvas formats open, save, publish, and execution errors with product copy",
    (source) => [
      /formatProductErrorMessage\(error,\s*"打开工作流失败"\)/,
      /operation === "publish" \? "发布失败" : "保存失败"/,
      /formatProductErrorMessage\(err,\s*"执行工作流失败"\)/,
    ].every((pattern) => pattern.test(source)),
    canvasErrorSources,
  ],
];

const forbidden = [
  [
    "auth store does not expose raw Error.message",
    /err instanceof Error \? err\.message/,
    authStore,
  ],
  [
    "task store does not expose raw Error.message",
    /err instanceof Error \? err\.message/,
    tasksStore,
  ],
  [
    "canvas does not expose raw Error.message",
    /err instanceof Error \? err\.message/,
    canvasErrorSources,
  ],
];

const missing = requirements
  .filter(([, pattern, source]) => (
    typeof pattern === "function" ? !pattern(source) : !pattern.test(source)
  ))
  .map(([label]) => label);

const presentForbidden = forbidden
  .filter(([, pattern, source]) => pattern.test(source))
  .map(([label]) => label);

if (missing.length > 0 || presentForbidden.length > 0) {
  console.error(`Missing ${missing.length} product error message requirement(s):`);
  for (const label of missing) console.error(`- ${label}`);
  console.error(`Found ${presentForbidden.length} forbidden raw error pattern(s):`);
  for (const label of presentForbidden) console.error(`- ${label}`);
  process.exit(1);
}

console.log("Product error message contract passed.");
