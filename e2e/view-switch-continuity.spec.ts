import { expect, test } from "@playwright/test";

const existingWorkflow = {
  schemaVersion: 1,
  updatedAt: "2026-07-16T00:00:00.000Z",
  workflows: [
    {
      id: "local_continuity",
      ownerId: "local-user",
      workspaceId: "local",
      title: "切换连续性",
      tags: [],
      version: 1,
      status: "draft",
      isFavorite: false,
      createdAt: "2026-07-16T00:00:00.000Z",
      updatedAt: "2026-07-16T00:00:00.000Z",
      graph: {
        id: "wf_continuity",
        version: 1,
        viewport: { x: 0, y: 0, zoom: 1 },
        meta: { title: "切换连续性", tags: [] },
        nodes: [
          {
            id: "constant-node",
            type: "flux.source.textConstant",
            position: { x: 160, y: 140 },
            data: { _label: "文本常量", text: "原始内容" },
            ports: {
              inputs: [],
              outputs: [{ id: "out", name: "固定文本", dataType: "text" }],
            },
          },
          {
            id: "result-node",
            type: "flux.action.log",
            position: { x: 560, y: 140 },
            data: { _label: "记录结果" },
            ports: {
              inputs: [{ id: "in", name: "输入", dataType: "any" }],
              outputs: [{ id: "out", name: "输出", dataType: "any" }],
            },
          },
        ],
        edges: [
          {
            id: "constant-to-result",
            source: "constant-node",
            target: "result-node",
            sourcePort: "out",
            targetPort: "in",
            sourceAnchor: "right",
            targetAnchor: "left",
            route: "normal",
          },
        ],
        groups: [],
      },
    },
  ],
};

test("workbench and canvas switches preserve visible data and unsaved edits", async ({
  page,
}) => {
  await page.addInitScript((snapshot) => {
    localStorage.setItem("flux.desktop.local-workspace", JSON.stringify(snapshot));
    localStorage.setItem("flux.desktop.workspace-preference", "local");
  }, existingWorkflow);

  await page.goto("/");
  await page.getByRole("button", { name: "打开 切换连续性" }).click();
  await expect(page.locator(".react-flow__node")).toHaveCount(2);
  await expect(page.locator(".react-flow__edge-path")).toHaveCount(1);

  const editor = page.getByRole("textbox", { name: "常量内容" });
  await expect(editor).toBeVisible();
  await editor.fill("切换后仍然保留");

  for (let index = 0; index < 3; index += 1) {
    await page.getByRole("tab", { name: "工作台" }).click();
    await expect(page.getByRole("button", { name: "打开 切换连续性" })).toBeVisible();
    await expect(
      page.locator('[data-app-view="canvas"] .react-flow__node'),
    ).toHaveCount(2);

    await page.getByRole("tab", { name: "画布" }).click();
    await expect(editor).toBeVisible();
    await expect(editor).toHaveValue("切换后仍然保留");
    await expect(page.locator(".react-flow__edge-path")).toHaveCount(1);
    await expect(page.locator(".react-flow__edge-path")).toHaveAttribute(
      "d",
      /.+/,
    );
    await expect
      .poll(() =>
        page.locator(".react-flow__edge-path").evaluate((path) => {
          const canvasLayer = path.closest('[data-app-view="canvas"]');
          return {
            layerOpacity: canvasLayer ? getComputedStyle(canvasLayer).opacity : "0",
            visibility: getComputedStyle(path).visibility,
            stroke: getComputedStyle(path).stroke,
          };
        }),
      )
      .toEqual({
        layerOpacity: "1",
        visibility: "visible",
        stroke: expect.not.stringMatching(/^(none|rgba\(0, 0, 0, 0\))$/),
      });
  }

  await expect
    .poll(() =>
      page.evaluate(() => {
        const raw = localStorage.getItem("flux.desktop.local-workspace");
        if (!raw) return null;
        const snapshot = JSON.parse(raw);
        return snapshot.workflows[0]?.graph.nodes[0]?.data.text ?? null;
      }),
    )
    .toBe("切换后仍然保留");
});
