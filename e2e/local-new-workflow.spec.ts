import { expect, test } from "@playwright/test";

const existingWorkflow = {
  schemaVersion: 1,
  updatedAt: "2026-07-16T00:00:00.000Z",
  workflows: [
    {
      id: "local_existing",
      ownerId: "local-user",
      workspaceId: "local",
      title: "已有流程",
      tags: [],
      version: 1,
      status: "draft",
      isFavorite: false,
      createdAt: "2026-07-16T00:00:00.000Z",
      updatedAt: "2026-07-16T00:00:00.000Z",
      graph: {
        id: "wf_existing",
        version: 1,
        viewport: { x: 0, y: 0, zoom: 1 },
        meta: { title: "已有流程", tags: [] },
        nodes: [
          {
            id: "old-node",
            type: "flux.trigger.manual",
            position: { x: 100, y: 100 },
            data: { _label: "旧流程节点" },
            ports: {
              inputs: [],
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

test("new local workflow stays blank after opening an existing workflow", async ({
  page,
}) => {
  await page.addInitScript((snapshot) => {
    localStorage.setItem("flux.desktop.local-workspace", JSON.stringify(snapshot));
    localStorage.setItem("flux.desktop.workspace-preference", "local");
  }, existingWorkflow);

  await page.goto("/");
  await page.getByRole("button", { name: "打开 已有流程" }).click();
  await expect(page.locator(".react-flow__node")).toHaveCount(1);

  await page.getByRole("tab", { name: "工作台" }).click();
  await page.getByRole("button", { name: "新建工作流" }).click();

  await expect(
    page.getByRole("button", { name: "重命名工作流：未命名工作流" }),
  ).toBeVisible();
  await expect(page.locator(".react-flow__node")).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const raw = localStorage.getItem("flux.desktop.local-workspace");
        return raw ? JSON.parse(raw).workflows.length : 0;
      }),
    )
    .toBe(2);

  const storedWorkflows = await page.evaluate(() => {
    const raw = localStorage.getItem("flux.desktop.local-workspace");
    return raw ? JSON.parse(raw).workflows : [];
  });
  expect(storedWorkflows).toHaveLength(2);
  expect(
    storedWorkflows.find(
      (workflow: { id: string }) => workflow.id !== "local_existing",
    ),
  ).toMatchObject({
    title: "未命名工作流",
    graph: { nodes: [] },
  });
});
