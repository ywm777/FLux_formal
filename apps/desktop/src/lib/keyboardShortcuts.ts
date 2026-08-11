export type ShortcutScope = "global" | "workbench" | "canvas";

export type ShortcutId =
  | "command-palette"
  | "shortcut-help"
  | "open-workbench"
  | "open-canvas"
  | "close-layer"
  | "new-workflow"
  | "focus-workflow-search"
  | "add-node"
  | "save-workflow"
  | "run-preview"
  | "fit-view"
  | "undo"
  | "redo"
  | "inspect-node"
  | "duplicate-node"
  | "delete-node"
  | "nudge-node"
  | "nudge-node-fast";

interface ShortcutBinding {
  key: string;
  primary?: boolean;
  shift?: boolean;
  alt?: boolean;
  display?: string;
}

export interface ShortcutDefinition {
  id: ShortcutId;
  scope: ShortcutScope;
  label: string;
  bindings: ShortcutBinding[];
}

export const SHORTCUT_SCOPE_LABELS: Record<ShortcutScope, string> = {
  global: "全局",
  workbench: "工作台",
  canvas: "画布",
};

export const SHORTCUTS: readonly ShortcutDefinition[] = [
  {
    id: "command-palette",
    scope: "global",
    label: "打开命令面板",
    bindings: [{ key: "k", primary: true }],
  },
  {
    id: "shortcut-help",
    scope: "global",
    label: "查看快捷键",
    bindings: [{ key: "F1" }],
  },
  {
    id: "open-workbench",
    scope: "global",
    label: "切换到工作台",
    bindings: [{ key: "1", primary: true }],
  },
  {
    id: "open-canvas",
    scope: "global",
    label: "切换到画布",
    bindings: [{ key: "2", primary: true }],
  },
  {
    id: "close-layer",
    scope: "global",
    label: "关闭当前面板 / 取消选择",
    bindings: [{ key: "Escape", display: "Esc" }],
  },
  {
    id: "new-workflow",
    scope: "workbench",
    label: "新建工作流",
    bindings: [{ key: "n" }],
  },
  {
    id: "focus-workflow-search",
    scope: "workbench",
    label: "聚焦工作流搜索",
    bindings: [{ key: "/" }],
  },
  {
    id: "add-node",
    scope: "canvas",
    label: "添加节点 / 追加下游节点",
    bindings: [{ key: "a" }],
  },
  {
    id: "save-workflow",
    scope: "canvas",
    label: "立即保存",
    bindings: [{ key: "s", primary: true }],
  },
  {
    id: "run-preview",
    scope: "canvas",
    label: "运行预览",
    bindings: [{ key: "Enter", primary: true }],
  },
  {
    id: "fit-view",
    scope: "canvas",
    label: "适应全部节点",
    bindings: [{ key: "0", primary: true }],
  },
  {
    id: "undo",
    scope: "canvas",
    label: "撤销",
    bindings: [{ key: "z", primary: true }],
  },
  {
    id: "redo",
    scope: "canvas",
    label: "重做",
    bindings: [
      { key: "z", primary: true, shift: true },
      { key: "y", primary: true },
    ],
  },
  {
    id: "inspect-node",
    scope: "canvas",
    label: "查看选中节点的输入与输出",
    bindings: [{ key: "Enter" }],
  },
  {
    id: "duplicate-node",
    scope: "canvas",
    label: "复制选中节点",
    bindings: [{ key: "d", primary: true }],
  },
  {
    id: "delete-node",
    scope: "canvas",
    label: "删除选中节点或连线",
    bindings: [
      { key: "Delete", display: "Delete" },
      { key: "Backspace", display: "Backspace" },
    ],
  },
  {
    id: "nudge-node",
    scope: "canvas",
    label: "微调选中节点（8 px）",
    bindings: [
      { key: "ArrowUp", display: "↑" },
      { key: "ArrowDown", display: "↓" },
      { key: "ArrowLeft", display: "←" },
      { key: "ArrowRight", display: "→" },
    ],
  },
  {
    id: "nudge-node-fast",
    scope: "canvas",
    label: "快速移动选中节点（24 px）",
    bindings: [
      { key: "ArrowUp", shift: true, display: "↑" },
      { key: "ArrowDown", shift: true, display: "↓" },
      { key: "ArrowLeft", shift: true, display: "←" },
      { key: "ArrowRight", shift: true, display: "→" },
    ],
  },
] as const;

function isMacPlatform(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Mac|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

function normalizedKey(key: string): string {
  return key.length === 1 ? key.toLocaleLowerCase() : key;
}

function definitionFor(id: ShortcutId): ShortcutDefinition {
  const definition = SHORTCUTS.find((shortcut) => shortcut.id === id);
  if (!definition) throw new Error(`Unknown shortcut: ${id}`);
  return definition;
}

export function isEditableShortcutTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest([
    "input",
    "textarea",
    "select",
    "[role='textbox']",
    "[contenteditable]:not([contenteditable='false'])",
    "[data-canvas-shortcuts='ignore']",
  ].join(", ")));
}

export function matchesShortcut(event: KeyboardEvent, id: ShortcutId): boolean {
  const primaryPressed = event.ctrlKey || event.metaKey;
  return definitionFor(id).bindings.some((binding) => (
    normalizedKey(event.key) === normalizedKey(binding.key) &&
    primaryPressed === Boolean(binding.primary) &&
    event.shiftKey === Boolean(binding.shift) &&
    event.altKey === Boolean(binding.alt)
  ));
}

export function shortcutSequences(id: ShortcutId): string[][] {
  const primary = isMacPlatform() ? "⌘" : "Ctrl";
  return definitionFor(id).bindings.map((binding) => [
    ...(binding.primary ? [primary] : []),
    ...(binding.shift ? ["Shift"] : []),
    ...(binding.alt ? [isMacPlatform() ? "⌥" : "Alt"] : []),
    binding.display ?? (binding.key.length === 1 ? binding.key.toLocaleUpperCase() : binding.key),
  ]);
}

export function shortcutLabel(id: ShortcutId): string {
  return shortcutSequences(id).map((sequence) => sequence.join("+")).join(" / ");
}
