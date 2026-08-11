# Flux MCP 设置设计 QA

- Source visual truth: `D:\Cache\Temp\codex-clipboard-d3f61e5f-f337-498c-942f-4b056564b553.png`
- Implementation screenshot: `D:\AppData\Codex\visualizations\2026\07\25\019f96e2-ea90-7b60-a3ac-04f3e3a20a3f\flux-mcp-settings-final.png`
- Form drawer screenshot: `D:\AppData\Codex\visualizations\2026\07\25\019f96e2-ea90-7b60-a3ac-04f3e3a20a3f\flux-mcp-add-form-drawer.png`
- JSON advanced editor screenshot: `D:\AppData\Codex\visualizations\2026\07\25\019f96e2-ea90-7b60-a3ac-04f3e3a20a3f\flux-mcp-json-advanced.png`
- Full-view comparison: `D:\AppData\Codex\visualizations\2026\07\25\019f96e2-ea90-7b60-a3ac-04f3e3a20a3f\flux-mcp-reference-comparison.png`
- Viewport: 1198 × 798 CSS pixels
- Pixel dimensions: source 1198 × 798; implementation 1198 × 798
- Density normalization: both compared at 1:1 pixels, device scale factor 1
- State: MCP overview, dark theme, zero user-configured services. The source is treated as a window-architecture reference, not as Flux's information architecture.

## Full-view comparison evidence

The implementation preserves the useful source structure: dedicated full-window settings surface, persistent left navigation, strong MCP heading, short description, compact actions, search, grouped service region, and dark low-contrast visual hierarchy. Flux intentionally narrows the sidebar to one real destination and uses the recovered space for the connection workflow.

No focused crop was required for the overview comparison because both artifacts are native 1198 × 798 captures and the primary typography, navigation, actions, search, empty state, and canvas handoff are legible at original resolution. The form drawer and JSON editor were inspected separately because the source does not provide equivalent states.

## Findings

- No actionable P0, P1, or P2 visual or workflow issues remain.
- P3: The source shows plugin-owned server rows while Flux shows a valid zero-config state. This is an intentional data-state difference.
- P3: Flux replaces the source's broad settings taxonomy with a single real MCP destination. This is an intentional product correction: placeholder navigation would misrepresent unavailable Flux features.
- P3: The add/edit flow uses a right-side drawer so the service list remains spatially present. The source does not show this state, so it was judged against Flux's existing drawer language rather than copied.

## Required fidelity surfaces

- Fonts and typography: system UI stack, 30 px heading, compact labels, consistent optical weights, line heights, truncation, and hierarchy are crisp at native density.
- Spacing and layout rhythm: window bar, 232 px sidebar, content inset, search/list rhythm, empty row, canvas callout, and 720 px editor drawer remain balanced without clipping at 1198 × 798.
- Colors and visual tokens: existing Flux dark surfaces, subtle borders, blue semantic active states, and readable muted text are consistently token-driven.
- Image quality and asset fidelity: the screen has no raster product imagery; existing Flux interface icons remain sharp. No visible source assets were replaced with placeholders.
- Copy and content: text now describes the real Flux journey—connect once, discover abilities, select them on the canvas. STDIO is explicitly on-demand and HTTP explicitly connects to an already running service.

## Interaction verification

- Opened MCP settings from the account menu.
- Opened “添加服务” and verified the form is the default state.
- Switched to “JSON 高级编辑” and verified editable `mcpServers` JSON remains visible without hiding the primary form path.
- Returned to the service list and used “前往画布”; settings closed and Flux navigated to the canvas.
- Verified build output and installer generation.
- Verified 67 desktop unit tests, 2 MCP placement contract tests, and 2 native STDIO MCP tests.

## Comparison history

- Earlier pass: the implementation copied the source's complete category hierarchy and made JSON the default editor. The user correctly identified that the copied functions did not fit Flux's usage scenario.
- Current fixes: removed non-functional categories; made visual connection settings primary; retained JSON as import/advanced editing; kept the service list behind a right-side editor; added discovered-ability preview and an explicit canvas handoff.
- Post-fix evidence: `flux-mcp-settings-final.png`, `flux-mcp-add-form-drawer.png`, `flux-mcp-json-advanced.png`, and `flux-mcp-canvas-navigation.png`.

## Follow-up polish

- When the first real service is connected, verify the discovered-ability list with long tool names and descriptions at this same viewport.

final result: passed
