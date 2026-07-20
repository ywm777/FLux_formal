import { expect, test, type Page } from "@playwright/test";

const executionWorkflow = {
  schemaVersion: 1,
  updatedAt: "2026-07-20T00:00:00.000Z",
  workflows: [
    {
      id: "local_execution",
      ownerId: "local-user",
      workspaceId: "local",
      title: "执行控制器测试",
      tags: [],
      version: 1,
      status: "draft",
      isFavorite: false,
      createdAt: "2026-07-20T00:00:00.000Z",
      updatedAt: "2026-07-20T00:00:00.000Z",
      graph: {
        id: "wf_execution",
        version: 1,
        viewport: { x: 0, y: 0, zoom: 1 },
        meta: { title: "执行控制器测试", tags: [] },
        nodes: [
          {
            id: "runtime-input",
            type: "flux.input.text",
            position: { x: 360, y: 240 },
            data: { _label: "运行输入" },
            ports: {
              inputs: [{ id: "in", name: "上游文本", dataType: "text" }],
              outputs: [{ id: "out", name: "文本", dataType: "any" }],
            },
          },
        ],
        edges: [],
        groups: [],
      },
    },
  ],
};

async function openExecutionWorkflow(page: Page) {
  await page.addInitScript((snapshot) => {
    localStorage.setItem("flux.desktop.local-workspace", JSON.stringify(snapshot));
    localStorage.setItem("flux.desktop.workspace-preference", "local");
  }, executionWorkflow);
  await page.goto("/");
  await page.getByRole("button", { name: "打开 执行控制器测试" }).click();
  await expect(page.locator(".react-flow__node")).toHaveCount(1);
}

test("runtime input preflight focuses the node before a successful local run", async ({
  page,
}) => {
  await openExecutionWorkflow(page);
  const node = page.locator('.react-flow__node[data-id="runtime-input"]');

  await page.getByRole("button", { name: "执行工作流" }).click();
  await expect(node.getByRole("alert")).toHaveText("请完成本次运行所需的输入");
  await expect(node).toHaveClass(/selected/);

  await node.getByRole("textbox", { name: "文本内容" }).fill("执行控制器回归");
  await page.getByRole("button", { name: "执行工作流" }).click();

  await expect(node.getByLabel(/过程状态：已完成/)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByLabel(/运行进度：已完成，1\/1/)).toBeVisible();
  await expect(node.getByRole("alert")).toBeHidden();
});
