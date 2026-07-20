import { expect, test, type Page } from "@playwright/test";

const historyWorkflow = {
  schemaVersion: 1,
  updatedAt: "2026-07-20T00:00:00.000Z",
  workflows: [
    {
      id: "local_history",
      ownerId: "local-user",
      workspaceId: "local",
      title: "历史测试",
      tags: [],
      version: 1,
      status: "draft",
      isFavorite: false,
      createdAt: "2026-07-20T00:00:00.000Z",
      updatedAt: "2026-07-20T00:00:00.000Z",
      graph: {
        id: "wf_history",
        version: 1,
        viewport: { x: 0, y: 0, zoom: 1 },
        meta: { title: "历史测试", tags: [] },
        nodes: [
          {
            id: "first-node",
            type: "flux.source.textConstant",
            position: { x: 240, y: 240 },
            data: { _label: "第一节点", text: "历史内容" },
            ports: {
              inputs: [],
              outputs: [{ id: "out", name: "固定文本", dataType: "text" }],
            },
          },
          {
            id: "second-node",
            type: "flux.action.log",
            position: { x: 660, y: 320 },
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

async function openHistoryWorkflow(page: Page) {
  await page.addInitScript((snapshot) => {
    localStorage.setItem("flux.desktop.local-workspace", JSON.stringify(snapshot));
    localStorage.setItem("flux.desktop.workspace-preference", "local");
  }, historyWorkflow);
  await page.goto("/");
  await page.getByRole("button", { name: "打开 历史测试" }).click();
  await expect(page.locator(".react-flow__node")).toHaveCount(2);
}

test("undo and redo restore graph edits while a branch edit clears redo", async ({
  page,
}) => {
  await openHistoryWorkflow(page);
  const first = page.locator('.react-flow__node[data-id="first-node"]');
  await first.locator("header").click();
  await page.keyboard.press("Control+d");
  await expect(page.locator(".react-flow__node")).toHaveCount(3);

  await page.keyboard.press("Control+z");
  await expect(page.locator(".react-flow__node")).toHaveCount(2);
  await page.keyboard.press("Control+Shift+z");
  await expect(page.locator(".react-flow__node")).toHaveCount(3);

  await page.keyboard.press("Control+z");
  await expect(page.locator(".react-flow__node")).toHaveCount(2);
  await first.locator("header").click();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Control+Shift+z");
  await expect(page.locator(".react-flow__node")).toHaveCount(2);
});

test("one drag undo restores the start and redo restores the final position", async ({
  page,
}) => {
  await openHistoryWorkflow(page);
  const first = page.locator('.react-flow__node[data-id="first-node"]');
  const start = await first.boundingBox();
  expect(start).not.toBeNull();
  if (!start) throw new Error("first node bounds are unavailable");

  await page.mouse.move(start.x + start.width / 2, start.y + 24);
  await page.mouse.down();
  await page.mouse.move(start.x + start.width / 2 + 140, start.y + 104, {
    steps: 14,
  });
  await page.mouse.up();
  const dragged = await first.boundingBox();
  expect(dragged).not.toBeNull();
  if (!dragged) throw new Error("dragged node bounds are unavailable");
  expect(dragged.x).toBeGreaterThan(start.x + 100);

  await page.keyboard.press("Control+z");
  await expect
    .poll(async () => (await first.boundingBox())?.x ?? 0)
    .toBeLessThan(start.x + 10);
  await page.keyboard.press("Control+Shift+z");
  await expect
    .poll(async () => (await first.boundingBox())?.x ?? 0)
    .toBeGreaterThan(start.x + 100);
});
