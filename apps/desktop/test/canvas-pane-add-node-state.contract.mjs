import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const canvasView = readFileSync(
  resolve(root, "src/features/canvas/CanvasView.tsx"),
  "utf8",
);

const onPaneContextMenuSource =
  canvasView.match(/const onPaneContextMenu = useCallback[\s\S]*?\n  \);/)?.[0] ?? "";
const paneMenuItemsSource =
  canvasView.match(/const menuItems: ContextMenuItem\[][\s\S]*?const stepByNodeId/)?.[0] ?? "";

const requirements = [
  [
    "pane context menu clears any stale downstream append source",
    /insertSourceId\.current = null/,
    onPaneContextMenuSource,
  ],
  [
    "pane context menu closes transient node surfaces before showing canvas actions",
    /selection\.clearCanvas\(\)[\s\S]*setPaletteOpen\(false\)[\s\S]*setPaletteAnchor\(null\)/,
    onPaneContextMenuSource,
  ],
  [
    "pane add-node menu action reuses the same screen-point palette opener",
    /label:\s*"添加节点"[\s\S]*openNodePaletteAtScreenPoint\(\{\s*x:\s*menu\.x,\s*y:\s*menu\.y\s*\}\)/,
    paneMenuItemsSource,
  ],
];

const forbidden = [
  [
    "pane add-node menu action does not open the palette with a partial state update",
    /label:\s*"添加节点"[\s\S]*setPaletteAnchor\(\{\s*x:\s*menu\.x,\s*y:\s*menu\.y\s*\}\)[\s\S]*setPaletteOpen\(true\)/,
    paneMenuItemsSource,
  ],
];

const missing = requirements
  .filter(([, pattern, source]) => !pattern.test(source))
  .map(([label]) => label);

const presentForbidden = forbidden
  .filter(([, pattern, source]) => pattern.test(source))
  .map(([label]) => label);

if (missing.length > 0 || presentForbidden.length > 0) {
  console.error(`Missing ${missing.length} pane add-node state requirement(s):`);
  for (const label of missing) console.error(`- ${label}`);
  console.error(`Found ${presentForbidden.length} forbidden pane add-node state pattern(s):`);
  for (const label of presentForbidden) console.error(`- ${label}`);
  process.exit(1);
}

console.log("Canvas pane add-node state contract passed.");
