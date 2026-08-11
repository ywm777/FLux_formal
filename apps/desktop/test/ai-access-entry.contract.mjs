import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const titleBar = readFileSync(resolve(root, "src/components/TitleBar.tsx"), "utf8");
const app = readFileSync(resolve(root, "src/App.tsx"), "utf8");
const appStore = readFileSync(resolve(root, "src/store/appStore.ts"), "utf8");

const commandItem =
  titleBar.match(/\{\s*id: "ai-access",[\s\S]*?keywords: \[[^\]]+\],[\s\S]*?\}/)?.[0] ?? "";
const accountHandler =
  titleBar.match(/const showAiAccess = useCallback\(\(\) => \{[\s\S]*?\}, \[[^\]]+\]\);/)?.[0] ?? "";

const requirements = [
  [
    "the application store owns the single AI drawer visibility contract",
    /aiAccessOpen:\s*boolean[\s\S]*openAiAccess:\s*\(\) => void[\s\S]*closeAiAccess:\s*\(\) => void[\s\S]*aiAccessOpen:\s*false[\s\S]*openAiAccess:\s*\(\) => set\(\{ aiAccessOpen: true \}\)[\s\S]*closeAiAccess:\s*\(\) => set\(\{ aiAccessOpen: false \}\)/,
    appStore,
  ],
  [
    "the title bar consumes the shared store action instead of local drawer state",
    /const openAiAccess = useAppStore\(\(s\) => s\.openAiAccess\)/,
    titleBar,
  ],
  [
    "the command palette advertises AI access as an account capability",
    /id:\s*"ai-access"[\s\S]*label:\s*"AI 接入"[\s\S]*description:\s*"连接和管理模型服务"[\s\S]*group:\s*"账户"[\s\S]*keywords:\s*\[[^\]]*"ollama"[^\]]*"openai"[^\]]*"模型"/,
    commandItem,
  ],
  [
    "the command palette route uses the same handler as the account menu",
    /case "ai-access":[\s\S]*showAiAccess\(\)[\s\S]*break/,
    titleBar,
  ],
  [
    "the account menu exposes the same AI access destination as a menu item",
    /role="menuitem"[\s\S]{0,120}aria-label="AI 接入"[\s\S]{0,120}onClick=\{showAiAccess\}/,
    titleBar,
  ],
  [
    "the account route closes competing surfaces before using the shared action",
    /setAccountMenuOpen\(false\)[\s\S]*setCommandOpen\(false\)[\s\S]*setShortcutHelpOpen\(false\)[\s\S]*openAiAccess\(\)/,
    accountHandler,
  ],
  [
    "the authenticated application shell mounts one shared AI drawer beside its workspace",
    /import \{ AiConnectionDrawer \} from "\.\/features\/ai\/AiConnectionDrawer\.js"[\s\S]*<main[\s\S]*<AiConnectionDrawer \/>[\s\S]*<\/main>/,
    app,
  ],
  [
    "the workspace establishes a positioning context so wide-screen push drawers stay visible",
    /minWidth:\s*0,[\s\S]{0,160}minHeight:\s*0,[\s\S]{0,160}position:\s*"relative"[\s\S]*<AiConnectionDrawer \/>/,
    app,
  ],
];

const forbidden = [
  [
    "the title bar does not maintain a second AI drawer visibility flag",
    /useState\([^)]*\)[^\n]*(?:aiAccess|AiAccess)|setAiAccessOpen/,
    titleBar,
  ],
];

const missing = requirements
  .filter(([, pattern, source]) => !pattern.test(source))
  .map(([label]) => label);
const presentForbidden = forbidden
  .filter(([, pattern, source]) => pattern.test(source))
  .map(([label]) => label);

if (missing.length > 0 || presentForbidden.length > 0) {
  console.error(`Missing ${missing.length} AI access entry requirement(s):`);
  for (const label of missing) console.error(`- ${label}`);
  console.error(`Found ${presentForbidden.length} forbidden AI access entry pattern(s):`);
  for (const label of presentForbidden) console.error(`- ${label}`);
  process.exit(1);
}

console.log("AI access entry contract passed.");
