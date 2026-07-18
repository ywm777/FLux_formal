import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const titleBar = readFileSync(resolve(root, "src/components/TitleBar.tsx"), "utf8");

const testRunButton =
  titleBar.match(
    /<button[\s\S]*aria-label=\{testing \? "工作流执行中" : "执行工作流"\}[\s\S]*?<\/button>/,
  )?.[0] ?? "";
const publishButton =
  titleBar.match(
    /<button[\s\S]*aria-label=\{publishing \? "发布中" : "发布工作流"\}[\s\S]*?<\/button>/,
  )?.[0] ?? "";

const requirements = [
  [
    "canvas-only top bar actions remain scoped to canvas mode",
    /mode === "canvas"[\s\S]*workflowCommands\.testRun\(\)[\s\S]*workflowCommands\.publish\(\)/,
    titleBar,
  ],
  [
    "workflow execution is one emphasized labelled button with accessible state",
    /aria-label=\{testing \? "工作流执行中" : "执行工作流"\}[\s\S]*aria-keyshortcuts="Control\+Enter Meta\+Enter"[\s\S]*disabled=\{testRunDisabled\}[\s\S]*title=\{`执行工作流 \(\$\{shortcutLabel\("run-preview"\)\}\)`\}[\s\S]*\.\.\.workflowPrimaryButton[\s\S]*<svg[\s\S]*aria-hidden[\s\S]*<span>\{testing \? "运行中" : "运行"\}<\/span>/,
    testRunButton,
  ],
  [
    "publish action is an icon button with accessible state",
    /aria-label=\{publishing \? "发布中" : "发布工作流"\}[\s\S]*disabled=\{publishDisabled\}[\s\S]*title="发布工作流"[\s\S]*<svg[\s\S]*aria-hidden/,
    publishButton,
  ],
  [
    "test-run disabled state covers testing, saving, and publishing",
    /const testRunDisabled = testing \|\| saving \|\| publishing/,
    titleBar,
  ],
  [
    "publish disabled state covers publishing, saving, and testing",
    /const publishDisabled = publishing \|\| saving \|\| testing/,
    titleBar,
  ],
];

const forbidden = [
  [
    "workflow execution action avoids verbose technical copy in the top bar",
    />\s*(执行工作流|工作流执行中|运行预览|测试运行)\s*</,
    testRunButton,
  ],
  [
    "publish action does not expose permanent text in the top bar",
    />\s*(↑ 发布|发布中…)\s*</,
    publishButton,
  ],
];

const missing = requirements
  .filter(([, pattern, source]) => !pattern.test(source))
  .map(([label]) => label);

const presentForbidden = forbidden
  .filter(([, pattern, source]) => pattern.test(source))
  .map(([label]) => label);

if (missing.length > 0 || presentForbidden.length > 0) {
  console.error(`Missing ${missing.length} titlebar canvas action requirement(s):`);
  for (const label of missing) console.error(`- ${label}`);
  console.error(`Found ${presentForbidden.length} forbidden canvas action pattern(s):`);
  for (const label of presentForbidden) console.error(`- ${label}`);
  process.exit(1);
}

console.log("Titlebar canvas actions contract passed.");
