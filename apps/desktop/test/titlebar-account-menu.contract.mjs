import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const titleBar = readFileSync(resolve(root, "src/components/TitleBar.tsx"), "utf8");

const requirements = [
  [
    "avatar button opens the workspace menu instead of logging out directly",
    /const \[accountMenuOpen,\s*setAccountMenuOpen\] = useState\(false\)[\s\S]*aria-label="打开空间菜单"[\s\S]*title=\{workspaceKind[\s\S]*onClick=\{\(\) => \{[\s\S]*setWorkflowMenuOpen\(false\)[\s\S]*setAccountMenuOpen\(\(open\) => !open\)/,
  ],
  [
    "avatar button exposes expanded state for accessibility",
    /aria-haspopup="menu"[\s\S]*aria-expanded=\{accountMenuOpen\}/,
  ],
  [
    "workspace menu is rendered conditionally",
    /\{accountMenuOpen && \([\s\S]*role="menu"[\s\S]*aria-label="空间菜单"[\s\S]*<span style=\{accountEyebrow\}>空间<\/span>/,
  ],
  [
    "menu shows the authenticated user's display name",
    /authed \? user\?\.displayName \?\? "未命名用户" : "本地空间"/,
  ],
  [
    "menu derives a readable account identity without exposing auth internals",
    /const accountIdentity = authed[\s\S]*user\?\.identities\.find\(\(identity\) => identity\.channel === "email"\)[\s\S]*数据仅保存在此设备/,
  ],
  [
    "workspace header shows name and account identity",
    /<span style=\{accountEyebrow\}>空间<\/span>[\s\S]*<strong style=\{accountName\}>\{displayName\}<\/strong>[\s\S]*<span style=\{accountIdentityText\}>\{accountIdentity\}<\/span>/,
  ],
  [
    "workspace section distinguishes local and cloud modes",
    /<div style=\{accountSection\}>[\s\S]*<span style=\{accountSectionLabel\}>当前空间<\/span>[\s\S]*workspaceKind === "local" \? "本地空间" : "云端空间"/,
  ],
  [
    "My Space does not show canvas, publishing, or workflow status fields",
    (source) =>
      !/(同步状态|workflowTitle|syncLabel|publishedCount|accountMetaGrid|accountMetaLabel|accountMetaValue|发布状态|运行状态|已保存)/.test(
        source,
      ),
  ],
  [
    "menu provides workspace navigation without adding another top-level page",
    /role="menuitem"[\s\S]*aria-label="工作台"[\s\S]*setMode\("workbench"\)[\s\S]*role="menuitem"[\s\S]*aria-label="画布"[\s\S]*setMode\("canvas"\)/,
  ],
  [
    "logout is available as a menu item",
    /role="menuitem"[\s\S]*onClick=\{\(\) => \{[\s\S]*logout\(\)/,
  ],
  [
    "menu closes on outside pointer interaction",
    /pointerdown[\s\S]*accountMenuRef[\s\S]*setAccountMenuOpen\(false\)/,
  ],
  [
    "menu closes on Escape",
    /Escape[\s\S]*setAccountMenuOpen\(false\)[\s\S]*keydown/,
  ],
];

const missing = requirements
  .filter(([, pattern]) =>
    typeof pattern === "function" ? !pattern(titleBar) : !pattern.test(titleBar),
  )
  .map(([label]) => label);

if (missing.length > 0) {
  console.error(`Missing ${missing.length} titlebar account menu requirement(s):`);
  for (const label of missing) console.error(`- ${label}`);
  process.exit(1);
}

console.log("Titlebar account menu contract passed.");
