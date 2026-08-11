import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const drawer = readFileSync(
  resolve(root, "src/features/ai/AiConnectionDrawer.tsx"),
  "utf8",
);
const sharedDrawer = readFileSync(
  resolve(root, "../../packages/ui/src/components/Drawer.tsx"),
  "utf8",
);
const api = readFileSync(resolve(root, "src/lib/api.ts"), "utf8");

const connectionShape =
  api.match(/export interface AiConnection \{[\s\S]*?^\}/m)?.[0] ?? "";
const focusLifecycle =
  drawer.match(/useEffect\(\(\) => \{\s*if \(!open\) return;\s*previousFocusRef[\s\S]*?\}, \[close, isOverlay, open\]\);/)?.[0] ?? "";
const secretField =
  drawer.match(/<FormField\s+label="API Key"[\s\S]*?<\/FormField>/)?.[0] ?? "";

const requirements = [
  [
    "the shared Drawer forwards an accessible role, name, and modal state",
    /role\?: "complementary" \| "dialog"[\s\S]*ariaLabelledBy\?: string[\s\S]*<aside[\s\S]*role=\{role as HTMLAttributes<HTMLElement>\["role"\]\}[\s\S]*aria-labelledby=\{ariaLabelledBy\}[\s\S]*aria-modal=\{role === "dialog" && variant === "overlay" \? true : undefined\}/,
    sharedDrawer,
  ],
  [
    "the responsive AI drawer is labelled and uses dialog semantics only as an overlay",
    /matchMedia\("\(max-width: 1279px\)"\)[\s\S]*id="ai-connection-drawer-title"[\s\S]*tabIndex=\{-1\}[\s\S]*variant=\{isOverlay \? "overlay" : "push"\}[\s\S]*role=\{isOverlay \? "dialog" : "complementary"\}[\s\S]*ariaLabelledBy="ai-connection-drawer-title"/,
    drawer,
  ],
  [
    "opening captures the active element and moves focus to the drawer title",
    /previousFocusRef\.current =\s*document\.activeElement instanceof HTMLElement[\s\S]*requestAnimationFrame\(\(\) => titleRef\.current\?\.focus\(\)\)/,
    focusLifecycle,
  ],
  [
    "Escape is intercepted in capture phase and closes the drawer",
    /event\.key === "Escape"[\s\S]*event\.preventDefault\(\)[\s\S]*event\.stopPropagation\(\)[\s\S]*close\(\)[\s\S]*window\.addEventListener\("keydown", onKeyDown, true\)/,
    focusLifecycle,
  ],
  [
    "overlay mode traps forward and reverse Tab navigation within the panel",
    /event\.key !== "Tab" \|\| !isOverlay[\s\S]*querySelectorAll<HTMLElement>\([\s\S]*button:not\(\[disabled\]\)[\s\S]*const first = focusable\[0\][\s\S]*const last = focusable\[focusable\.length - 1\][\s\S]*event\.shiftKey && document\.activeElement === first[\s\S]*last\.focus\(\)[\s\S]*document\.activeElement === last[\s\S]*first\.focus\(\)/,
    focusLifecycle,
  ],
  [
    "closing restores prior focus or falls back to the account trigger",
    /window\.removeEventListener\("keydown", onKeyDown, true\)[\s\S]*previous\?\.isConnected[\s\S]*previous\.focus\(\)[\s\S]*getElementById\("account-menu-trigger"\)\?\.focus\(\)/,
    focusLifecycle,
  ],
  [
    "the API key field is masked by default and its reveal control exposes state",
    /type=\{showApiKey \? "text" : "password"\}[\s\S]*autoComplete="new-password"[\s\S]*aria-label=\{showApiKey \? "隐藏 API Key" : "显示 API Key"\}[\s\S]*aria-pressed=\{showApiKey\}[\s\S]*setShowApiKey\(\(value\) => !value\)/,
    secretField,
  ],
  [
    "saved connections render only credential presence, never a returned secret",
    /hasApiKey:\s*boolean/,
    connectionShape,
  ],
  [
    "the saved connection card communicates credential presence without rendering a key",
    /connection\.hasApiKey \? "密钥已保存" : "未使用密钥"/,
    drawer,
  ],
];

const forbidden = [
  [
    "the persisted connection response must not contain an apiKey field",
    /\bapiKey\??\s*:/,
    connectionShape,
  ],
  [
    "the drawer must not read a persisted key value from a connection",
    /connection\.apiKey/,
    drawer,
  ],
];

const missing = requirements
  .filter(([, pattern, source]) => !pattern.test(source))
  .map(([label]) => label);
const presentForbidden = forbidden
  .filter(([, pattern, source]) => pattern.test(source))
  .map(([label]) => label);

if (missing.length > 0 || presentForbidden.length > 0) {
  console.error(`Missing ${missing.length} AI drawer accessibility requirement(s):`);
  for (const label of missing) console.error(`- ${label}`);
  console.error(`Found ${presentForbidden.length} forbidden AI drawer pattern(s):`);
  for (const label of presentForbidden) console.error(`- ${label}`);
  process.exit(1);
}

console.log("AI connection drawer accessibility contract passed.");
