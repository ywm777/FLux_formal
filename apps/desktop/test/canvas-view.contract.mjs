import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const canvasView = readFileSync(resolve(root, "src/features/canvas/CanvasView.tsx"), "utf8");
function readOptional(path) {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return "";
  }
}

const contextPalette = readOptional(
  resolve(root, "src/features/canvas/CanvasNodePalette.tsx"),
);

const requirements = [
  [
    "canvas uses a local contextual node palette instead of the global command palette",
    /<CanvasNodePalette[\s\S]*open=\{paletteOpen\}/,
  ],
  [
    "double click stores the screen coordinate for menu placement",
    /function openNodePaletteAtScreenPoint[\s\S]*setPaletteAnchor\(\{\s*x:\s*point\.x,\s*y:\s*point\.y\s*\}\)[\s\S]*const onPaneDoubleClick[\s\S]*openNodePaletteAtScreenPoint\(\{\s*x:\s*event\.clientX,\s*y:\s*event\.clientY\s*\}\)/,
  ],
  [
    "double click still stores the flow coordinate for node insertion",
    /function openNodePaletteAtScreenPoint[\s\S]*insertPos\.current\s*=\s*pos\s*\?\?\s*\{\s*x:\s*160,\s*y:\s*160\s*\}/,
  ],
  [
    "double click ignores existing nodes, edges, and controls",
    /function shouldIgnoreCanvasDoubleClick[\s\S]*target instanceof Element[\s\S]*closest\("\.react-flow__node, \.react-flow__edge, \.react-flow__edge-label, \.canvas-node-palette, \.canvas-node-toolbar, button, input, textarea"\)/,
  ],
  [
    "initial fit view never enlarges sparse workflows above natural scale",
    /fitViewOptions=\{\{\s*padding:\s*0\.32,\s*maxZoom:\s*1\s*\}\}/,
  ],
  [
    "palette receives an anchored screen position",
    /anchor=\{paletteAnchor\}/,
  ],
  [
    "selecting a palette item closes the contextual menu",
    /onSelect=\{\(item\) => \{[\s\S]*insertNode\([\s\S]*setPaletteOpen\(false\)/,
  ],
  [
    "contextual palette is screen anchored and not full screen",
    /position:\s*"fixed"[\s\S]*left:\s*anchor\.x[\s\S]*top:\s*anchor\.y/,
    contextPalette,
  ],
  [
    "contextual palette keeps abilities searchable",
    /placeholder="搜索能力"/,
    contextPalette,
  ],
];

const forbidden = [
  [
    "canvas does not expose instructional gesture copy",
    /canvas-gesture-hint|双击空白处添加节点/,
  ],
];

const missing = requirements
  .filter(([, pattern, source = canvasView]) => !pattern.test(source))
  .map(([label]) => label);

const presentForbidden = forbidden
  .filter(([, pattern, source = canvasView]) => pattern.test(source))
  .map(([label]) => label);

if (missing.length > 0 || presentForbidden.length > 0) {
  console.error(`Missing ${missing.length} canvas interaction requirement(s):`);
  for (const label of missing) console.error(`- ${label}`);
  console.error(`Found ${presentForbidden.length} forbidden canvas interaction pattern(s):`);
  for (const label of presentForbidden) console.error(`- ${label}`);
  process.exit(1);
}

console.log("Canvas view contextual double-click node palette contract passed.");
