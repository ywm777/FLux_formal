import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../src/", import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), "utf8");
}

test("MCP service management lives in settings, not the canvas palette", async () => {
  const [titleBar, canvas, palette, settings] = await Promise.all([
    source("components/TitleBar.tsx"),
    source("features/canvas/CanvasView.tsx"),
    source("features/canvas/CanvasNodePalette.tsx"),
    source("features/capabilities/McpConnectionDrawer.tsx"),
  ]);

  assert.match(titleBar, /<McpSettingsDialog/);
  assert.match(titleBar, /aria-label="设置"/);
  assert.match(settings, /返回工作区/);
  assert.match(settings, /MCP 服务器/);
  assert.match(settings, /搜索 MCP 服务器/);
  assert.match(settings, /mcpServers JSON/);
  assert.match(settings, /从 JSON 导入/);
  assert.match(settings, /JSON 高级编辑/);
  assert.match(settings, /连接设置/);
  assert.match(settings, /添加 MCP 服务/);
  assert.match(settings, /能力在画布中使用/);
  assert.match(settings, /前往画布/);
  assert.match(settings, /已发现能力/);
  assert.match(settings, /Streamable HTTP/);
  assert.match(settings, /STDIO/);
  assert.match(settings, /Flux 将启动本地进程/);
  assert.doesNotMatch(settings, /设置分类[\s\S]*常规[\s\S]*外观[\s\S]*插件/);
  assert.doesNotMatch(canvas, /McpSettingsDialog|McpConnectionDrawer|capabilityDrawerOpen/);
  assert.doesNotMatch(palette, /onConnectCapability|连接外部能力/);
});

test("configured MCP capabilities remain selectable from the canvas", async () => {
  const [canvas, definitions] = await Promise.all([
    source("features/canvas/CanvasView.tsx"),
    source("lib/capabilities/mcpNodeDefinitions.ts"),
  ]);

  assert.match(canvas, /mcpNodeDefinitions/);
  assert.match(canvas, /\.\.\.\(workspaceKind === "local" \? mcpNodeDefinitions : \[\]\)/);
  assert.match(definitions, /category: `已连接服务 · \$\{connection\.name\}`/);
});
