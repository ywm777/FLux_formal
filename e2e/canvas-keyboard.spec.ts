import { expect, test, type Page } from "@playwright/test";

const keyboardWorkflow = {
  schemaVersion: 1,
  updatedAt: "2026-07-20T00:00:00.000Z",
  workflows: [
    {
      id: "local_keyboard",
      ownerId: "local-user",
      workspaceId: "local",
      title: "快捷键测试",
      tags: [],
      version: 1,
      status: "draft",
      isFavorite: false,
      createdAt: "2026-07-20T00:00:00.000Z",
      updatedAt: "2026-07-20T00:00:00.000Z",
      graph: {
        id: "wf_keyboard",
        version: 1,
        viewport: { x: 0, y: 0, zoom: 1 },
        meta: { title: "快捷键测试", tags: [] },
        nodes: [
          {
            id: "first-node",
            type: "flux.source.textConstant",
            position: { x: 240, y: 240 },
            data: { _label: "第一节点", text: "快捷键内容" },
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

async function openKeyboardWorkflow(page: Page) {
  await page.addInitScript((snapshot) => {
    localStorage.setItem("flux.desktop.local-workspace", JSON.stringify(snapshot));
    localStorage.setItem("flux.desktop.workspace-preference", "local");
  }, keyboardWorkflow);
  await page.goto("/");
  await page.getByRole("button", { name: "打开 快捷键测试" }).click();
  await expect(page.locator(".react-flow__node")).toHaveCount(2);
}

test("node shortcuts preserve inspector, movement, duplicate, and delete behavior", async ({
  page,
}) => {
  await openKeyboardWorkflow(page);
  const first = page.locator('.react-flow__node[data-id="first-node"]');
  await first.locator("header").click();

  await page.keyboard.press("Enter");
  await expect(page.getByRole("complementary", { name: "节点高级设置" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("complementary", { name: "节点高级设置" })).toBeHidden();

  const start = await first.boundingBox();
  expect(start).not.toBeNull();
  if (!start) throw new Error("first node bounds are unavailable");

  await page.keyboard.press("ArrowRight");
  await expect
    .poll(async () => (await first.boundingBox())?.x ?? 0)
    .toBeGreaterThan(start.x + 5);

  await page.keyboard.press("Control+d");
  await expect(page.locator(".react-flow__node")).toHaveCount(3);
  await page.keyboard.press("Delete");
  await expect(page.locator(".react-flow__node")).toHaveCount(2);

  await page.keyboard.press("Escape");
  await expect(page.locator(".react-flow__node.selected")).toHaveCount(0);
});

test("editable node fields do not trigger canvas edit shortcuts", async ({ page }) => {
  await openKeyboardWorkflow(page);
  const first = page.locator('.react-flow__node[data-id="first-node"]');
  const textField = first.locator("textarea").first();
  await textField.click();
  await expect(textField).toBeFocused();

  await page.keyboard.press("Control+d");
  await page.keyboard.press("Delete");

  await expect(page.locator(".react-flow__node")).toHaveCount(2);
  await expect(first).toBeVisible();
});
