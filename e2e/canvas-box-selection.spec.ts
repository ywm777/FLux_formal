import { expect, test, type Page } from "@playwright/test";

const selectionWorkflow = {
  schemaVersion: 1,
  updatedAt: "2026-07-20T00:00:00.000Z",
  workflows: [
    {
      id: "local_box_selection",
      ownerId: "local-user",
      workspaceId: "local",
      title: "框选测试",
      tags: [],
      version: 1,
      status: "draft",
      isFavorite: false,
      createdAt: "2026-07-20T00:00:00.000Z",
      updatedAt: "2026-07-20T00:00:00.000Z",
      graph: {
        id: "wf_box_selection",
        version: 1,
        viewport: { x: 0, y: 0, zoom: 1 },
        meta: { title: "框选测试", tags: [] },
        nodes: [
          {
            id: "first-node",
            type: "flux.source.textConstant",
            position: { x: 220, y: 220 },
            data: { _label: "第一节点", text: "第一段文本" },
            ports: {
              inputs: [],
              outputs: [{ id: "out", name: "固定文本", dataType: "text" }],
            },
          },
          {
            id: "second-node",
            type: "flux.action.log",
            position: { x: 620, y: 360 },
            data: { _label: "第二节点" },
            ports: {
              inputs: [{ id: "in", name: "输入", dataType: "any" }],
              outputs: [{ id: "out", name: "输出", dataType: "any" }],
            },
          },
        ],
        edges: [],
        groups: [],
      },
    },
  ],
};

async function openSelectionWorkflow(page: Page) {
  await page.addInitScript((snapshot) => {
    localStorage.setItem("flux.desktop.local-workspace", JSON.stringify(snapshot));
    localStorage.setItem("flux.desktop.workspace-preference", "local");
  }, selectionWorkflow);
  await page.goto("/");
  await page.getByRole("button", { name: "打开 框选测试" }).click();
  await expect(page.locator(".react-flow__node")).toHaveCount(2);
}

test("left drag box-selects partially intersecting nodes and commits the selection", async ({ page }) => {
  await openSelectionWorkflow(page);

  const pane = page.locator(".react-flow__pane");
  const nodes = page.locator(".react-flow__node");
  const paneBox = await pane.boundingBox();
  const firstBox = await nodes.nth(0).boundingBox();
  const secondBox = await nodes.nth(1).boundingBox();
  expect(paneBox).not.toBeNull();
  expect(firstBox).not.toBeNull();
  expect(secondBox).not.toBeNull();
  if (!paneBox || !firstBox || !secondBox) {
    throw new Error("canvas bounds are unavailable");
  }

  const start = {
    x: Math.max(paneBox.x + 8, Math.min(firstBox.x, secondBox.x) - 18),
    y: Math.max(paneBox.y + 8, Math.min(firstBox.y, secondBox.y) - 18),
  };
  const end = {
    x: Math.min(
      paneBox.x + paneBox.width - 8,
      Math.max(firstBox.x + firstBox.width, secondBox.x + secondBox.width) + 18,
    ),
    y: Math.min(
      paneBox.y + paneBox.height - 8,
      Math.max(firstBox.y + firstBox.height, secondBox.y + secondBox.height) + 18,
    ),
  };

  await page.mouse.move(start.x, start.y);
  await page.mouse.down({ button: "left" });
  await page.mouse.move(end.x, end.y, { steps: 12 });
  await expect(page.locator(".react-flow__selection")).toBeVisible();
  await page.mouse.up({ button: "left" });

  await expect(page.locator(".react-flow__node.selected")).toHaveCount(2);
  await expect(page.getByRole("toolbar", { name: "批量节点操作" })).toContainText(
    "已选 2 个节点",
  );

  await pane.click({ position: { x: 8, y: paneBox.height - 8 } });
  await expect(page.locator(".react-flow__node.selected")).toHaveCount(0);
  await expect(page.getByRole("toolbar", { name: "批量节点操作" })).toHaveCount(0);
});
