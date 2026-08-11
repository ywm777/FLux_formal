import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const drawer = readFileSync(
  resolve(root, "src/features/ai/AiConnectionDrawer.tsx"),
  "utf8",
);
const titleBar = readFileSync(resolve(root, "src/components/TitleBar.tsx"), "utf8");
const sharedDrawer = readFileSync(
  resolve(root, "../../packages/ui/src/components/Drawer.tsx"),
  "utf8",
);
const tokens = readFileSync(
  resolve(root, "../../packages/ui/src/tokens/tokens.css"),
  "utf8",
);

function styleBlock(source, name, type = "CSSProperties") {
  return (
    source.match(new RegExp(`const ${name}: (?:React\\.)?${type} = \\{[\\s\\S]*?\\n\\};`))?.[0] ??
    ""
  );
}

const overlay = styleBlock(drawer, "overlayWrap");
const aiMark = styleBlock(drawer, "aiMark");
const accountStatus = styleBlock(titleBar, "accountMenuStatus");

const requirements = [
  [
    "the AI overlay uses the shared scrim and drawer layer tokens",
    /zIndex:\s*"var\(--z-drawer\)" as unknown as number[\s\S]*background:\s*"var\(--overlay-scrim\)"/,
    overlay,
  ],
  [
    "AI identity uses semantic carrier and subtle status tokens",
    /background:\s*"var\(--success-subtle\)"[\s\S]*color:\s*"var\(--carrier-ai\)"/,
    aiMark,
  ],
  [
    "connection statuses use the shared success, danger, and warning families",
    /var\(--success-subtle\)[\s\S]*var\(--danger-subtle\)[\s\S]*var\(--warning-subtle\)[\s\S]*var\(--success\)[\s\S]*var\(--danger\)[\s\S]*var\(--warning\)/,
    drawer,
  ],
  [
    "the account-menu connection summary uses shared muted text typography",
    /color:\s*"var\(--text-muted\)"[\s\S]*fontSize:\s*"var\(--text-xs\)"/,
    accountStatus,
  ],
  [
    "the shared Drawer uses surface, border, overlay shadow, and layer tokens",
    /background:\s*"var\(--bg-surface\)"[\s\S]*borderLeft:\s*"1px solid var\(--border-subtle\)"[\s\S]*zIndex:\s*"var\(--z-drawer\)" as unknown as number[\s\S]*boxShadow:\s*"var\(--shadow-drawer\)"/,
    sharedDrawer,
  ],
  [
    "the shared Drawer close interaction uses motion and semantic color tokens",
    /background:\s*hover \? "var\(--bg-inset\)" : "transparent"[\s\S]*color:\s*hover \? "var\(--text-primary\)" : "var\(--text-muted\)"[\s\S]*var\(--motion-fast\) var\(--ease-standard\)/,
    sharedDrawer,
  ],
  [
    "the token sheet defines every AI drawer-specific shared token",
    /--carrier-ai:\s*[^;]+;[\s\S]*--overlay-scrim:\s*[^;]+;[\s\S]*--shadow-drawer:\s*[^;]+;[\s\S]*--z-drawer:\s*[^;]+;/,
    tokens,
  ],
];

const forbidden = [
  [
    "AI drawer component styles do not hard-code colors",
    /#[0-9a-fA-F]{3,8}|rgba?\(/,
    drawer,
  ],
  [
    "shared Drawer component styles do not hard-code colors",
    /#[0-9a-fA-F]{3,8}|rgba?\(/,
    sharedDrawer,
  ],
  [
    "AI and shared drawers do not hard-code stacking levels or motion durations",
    /zIndex:\s*\d+|\b\d+ms\b/,
    `${drawer}\n${sharedDrawer}`,
  ],
];

const missing = requirements
  .filter(([, pattern, source]) => !pattern.test(source))
  .map(([label]) => label);
const presentForbidden = forbidden
  .filter(([, pattern, source]) => pattern.test(source))
  .map(([label]) => label);

if (missing.length > 0 || presentForbidden.length > 0) {
  console.error(`Missing ${missing.length} AI connection theme-token requirement(s):`);
  for (const label of missing) console.error(`- ${label}`);
  console.error(`Found ${presentForbidden.length} forbidden AI connection theme pattern(s):`);
  for (const label of presentForbidden) console.error(`- ${label}`);
  process.exit(1);
}

console.log("AI connection theme token contract passed.");
