import { expect, test } from "@playwright/test";

const edgeWorkflow = {
  schemaVersion: 1,
  updatedAt: "2026-07-16T00:00:00.000Z",
  workflows: [
    {
      id: "local_edge_selection",
      ownerId: "local-user",
      workspaceId: "local",
      title: "连线选择测试",
      tags: [],
      version: 1,
      status: "draft",
      isFavorite: false,
      createdAt: "2026-07-16T00:00:00.000Z",
      updatedAt: "2026-07-16T00:00:00.000Z",
      graph: {
        id: "wf_edge_selection",
        version: 1,
        viewport: { x: 0, y: 0, zoom: 1 },
        meta: { title: "连线选择测试", tags: [] },
        nodes: [
          {
            id: "constant-node",
            type: "flux.source.textConstant",
            position: { x: 160, y: 180 },
            data: { _label: "文本常量", text: "原始内容" },
            ports: {
              inputs: [],
              outputs: [{ id: "out", name: "固定文本", dataType: "text" }],
            },
          },
          {
            id: "result-node",
            type: "flux.action.log",
            position: { x: 620, y: 180 },
            data: { _label: "记录结果" },
            ports: {
              inputs: [{ id: "in", name: "输入", dataType: "any" }],
              outputs: [{ id: "out", name: "输出", dataType: "any" }],
            },
          },
          {
            id: "result-node-2",
            type: "flux.action.log",
            position: { x: 980, y: 360 },
            data: { _label: "备用结果" },
            ports: {
              inputs: [{ id: "in", name: "输入", dataType: "any" }],
              outputs: [{ id: "out", name: "输出", dataType: "any" }],
            },
          },
          {
            id: "constant-node-2",
            type: "flux.source.textConstant",
            position: { x: 160, y: 520 },
            data: { _label: "备用文本", text: "备用内容" },
            ports: {
              inputs: [],
              outputs: [{ id: "out", name: "固定文本", dataType: "text" }],
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

const compactEdgeWorkflow = {
  ...edgeWorkflow,
  workflows: [{
    ...edgeWorkflow.workflows[0],
    id: "local_compact_edge",
    title: "短连线可见性测试",
    graph: {
      ...edgeWorkflow.workflows[0].graph,
      id: "wf_compact_edge",
      meta: { title: "短连线可见性测试", tags: [] },
      nodes: [
        {
          id: "formatter",
          type: "flux.transform.jsonFormat",
          position: { x: 400, y: 100 },
          size: { width: 352, height: 315 },
          data: { _label: "JSON 格式优化" },
          ports: {
            inputs: [{ id: "in", name: "JSON 文本", dataType: "any" }],
            outputs: [{ id: "out", name: "格式化结果", dataType: "any" }],
          },
        },
        {
          id: "error-handler",
          type: "flux.flow.catchError",
          position: { x: 427, y: 429 },
          data: { _label: "异常捕获" },
          ports: {
            inputs: [{ id: "error", name: "捕获异常", dataType: "error" }],
            outputs: [{ id: "out", name: "错误文本", dataType: "text" }],
          },
        },
      ],
      edges: [{
        id: "compact-error-edge",
        source: "formatter",
        target: "error-handler",
        sourcePort: "removed-output",
        targetPort: "removed-input",
        sourceAnchor: "bottom",
        targetAnchor: "top",
        route: "error",
      }, {
        id: "orphan-edge",
        source: "formatter",
        target: "removed-node",
        sourcePort: "out",
        targetPort: "in",
        sourceAnchor: "right",
        targetAnchor: "left",
        route: "normal",
      }],
    },
  }],
};

const errorConnectionWorkflow = {
  ...compactEdgeWorkflow,
  workflows: [{
    ...compactEdgeWorkflow.workflows[0],
    id: "local_error_connection",
    title: "异常连线兼容性测试",
    graph: {
      ...compactEdgeWorkflow.workflows[0].graph,
      id: "wf_error_connection",
      meta: { title: "异常连线兼容性测试", tags: [] },
      nodes: [
        ...compactEdgeWorkflow.workflows[0].graph.nodes.map((node) =>
          node.id === "formatter"
            ? {
                ...node,
                ports: {
                  ...node.ports,
                  outputs: [{ id: "out", name: "格式化结果", dataType: "text" }],
                },
              }
            : { ...node, position: { x: 850, y: 300 } },
        ),
        {
          ...compactEdgeWorkflow.workflows[0].graph.nodes[0],
          id: "formatter-two",
          position: { x: 400, y: 560 },
          data: { _label: "JSON 格式优化 2" },
          ports: {
            ...compactEdgeWorkflow.workflows[0].graph.nodes[0].ports,
            outputs: [{ id: "out", name: "格式化结果", dataType: "text" }],
          },
        },
      ],
      edges: [],
    },
  }],
};

test("an error handler accepts multiple incompatible outputs as error routes", async ({ page }) => {
  await page.addInitScript((snapshot) => {
    localStorage.setItem("flux.desktop.local-workspace", JSON.stringify(snapshot));
    localStorage.setItem("flux.desktop.workspace-preference", "local");
  }, errorConnectionWorkflow);

  await page.goto("/");
  await page.getByRole("button", { name: "打开 异常连线兼容性测试" }).click();

  const source = page.locator(
    '.react-flow__node[data-id="formatter"] .canvas-port-handle.source[aria-label="右侧输出：格式化结果"]',
  );
  const secondSource = page.locator(
    '.react-flow__node[data-id="formatter-two"] .canvas-port-handle.source[aria-label="右侧输出：格式化结果"]',
  );
  const target = page.locator(
    '.react-flow__node[data-id="error-handler"] .canvas-port-handle.target[aria-label="左侧输入：捕获异常"]',
  );
  const sourceBox = await source.boundingBox();
  const secondSourceBox = await secondSource.boundingBox();
  const targetBox = await target.boundingBox();
  if (!sourceBox || !secondSourceBox || !targetBox) throw new Error("error route ports are not visible");

  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, { steps: 8 });
  await expect(target).toHaveClass(/is-reconnect-candidate/);
  await page.mouse.up();

  await expect(page.locator(".react-flow__edge.canvas-edge-error")).toHaveCount(1);
  await expect(page.getByText("两个端口的数据类型不兼容")).toHaveCount(0);

  await page.mouse.move(secondSourceBox.x + secondSourceBox.width / 2, secondSourceBox.y + secondSourceBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, { steps: 8 });
  await expect(target).toHaveClass(/is-reconnect-candidate/);
  await page.mouse.up();

  await expect(page.locator(".react-flow__edge.canvas-edge-error")).toHaveCount(2);
  await expect.poll(() => page.evaluate(() => {
    const raw = localStorage.getItem("flux.desktop.local-workspace");
    if (!raw) return null;
    const edges = JSON.parse(raw).workflows[0]?.graph.edges ?? [];
    return edges
      .map((edge: { source: string; sourcePort: string; targetPort: string; route: string }) => ({
        source: edge.source,
        sourcePort: edge.sourcePort,
        targetPort: edge.targetPort,
        route: edge.route,
      }))
      .sort((left: { source: string }, right: { source: string }) => left.source.localeCompare(right.source));
  })).toEqual([
    { source: "formatter", sourcePort: "out", targetPort: "error", route: "error" },
    { source: "formatter-two", sourcePort: "out", targetPort: "error", route: "error" },
  ]);
});

test("a committed edge remains visible when its nodes nearly touch", async ({ page }) => {
  await page.addInitScript((snapshot) => {
    localStorage.setItem("flux.desktop.local-workspace", JSON.stringify(snapshot));
    localStorage.setItem("flux.desktop.workspace-preference", "local");
  }, compactEdgeWorkflow);

  await page.goto("/");
  await page.getByRole("button", { name: "打开 短连线可见性测试" }).click();

  const edge = page.locator('[data-id="compact-error-edge"]');
  const edgePath = edge.locator(".react-flow__edge-path");
  await expect(edge).toHaveCount(1);
  await expect(page.locator(".react-flow__edge")).toHaveCount(1);
  await expect(page.locator(".canvas-port-handle.is-connected")).toHaveCount(2);
  await expect(edge.locator(".react-flow__edge-text")).toHaveCount(0);
  await expect.poll(async () => {
    const box = await edgePath.boundingBox();
    return box ? Math.max(box.width, box.height) : 0;
  }).toBeGreaterThan(0);
  await expect.poll(async () => {
    const box = await edgePath.boundingBox();
    return box ? Math.max(box.width, box.height) : Number.POSITIVE_INFINITY;
  }).toBeLessThanOrEqual(32);
  await expect(edgePath).toHaveAttribute("d", / L/);

});

test("edge selection highlights the whole line without duplicate endpoint visuals", async ({ page }) => {
  await page.addInitScript((snapshot) => {
    localStorage.setItem("flux.desktop.local-workspace", JSON.stringify(snapshot));
    localStorage.setItem("flux.desktop.workspace-preference", "local");
  }, edgeWorkflow);

  await page.goto("/");
  await page.getByRole("button", { name: "打开 连线选择测试" }).click();

  const edge = page.locator(".react-flow__edge");
  const interactionPath = page.locator(".react-flow__edge-interaction");
  await expect(edge).toHaveCount(1);
  await expect(interactionPath).toHaveCount(1);

  await interactionPath.click();
  await expect(edge).toHaveClass(/selected/);
  await expect(page.locator(".react-flow__edgeupdater")).toHaveCount(0);
  await expect(page.locator(".canvas-port-handle.is-edge-selected")).toHaveCount(2);

  await interactionPath.dblclick();
  await expect(page.locator(".react-flow__edgeupdater")).toHaveCount(0);
  await expect(page.locator(".canvas-node-palette")).toHaveCount(0);

  await page.keyboard.press("Escape");
  await expect(page.locator(".react-flow__edgeupdater")).toHaveCount(0);
  await expect(page.locator(".canvas-port-handle.is-edge-selected")).toHaveCount(0);
});

test("the selected endpoint follows the pointer and commits on release", async ({ page }) => {
  await page.addInitScript((snapshot) => {
    localStorage.setItem("flux.desktop.local-workspace", JSON.stringify(snapshot));
    localStorage.setItem("flux.desktop.workspace-preference", "local");
  }, edgeWorkflow);

  await page.goto("/");
  await page.getByRole("button", { name: "打开 连线选择测试" }).click();

  await page.locator(".react-flow__edge-interaction").click();
  const selectedTargetPort = page.locator(
    '.react-flow__node[data-id="result-node"] .canvas-port-handle.target.is-edge-selected[aria-label="左侧输入：输入"]',
  );
  const topTargetPort = page.locator(
    '.react-flow__node[data-id="result-node"] .canvas-port-handle.source[aria-label="上方输出：输出"]',
  );
  const snappedTargetPort = page.locator(
    '.react-flow__node[data-id="result-node"] .canvas-port-handle.target[aria-label="上方输入：输入"]',
  );
  await expect(selectedTargetPort).toHaveCount(1);
  await expect(topTargetPort).toHaveCount(1);

  const selectedPortBox = await selectedTargetPort.boundingBox();
  const topPortBox = await topTargetPort.boundingBox();
  expect(selectedPortBox).not.toBeNull();
  expect(topPortBox).not.toBeNull();
  if (!selectedPortBox || !topPortBox) throw new Error("connection ports are not visible");

  const start = {
    x: selectedPortBox.x + selectedPortBox.width / 2,
    y: selectedPortBox.y + selectedPortBox.height / 2,
  };
  const pointer = {
    x: start.x - 90,
    y: start.y + 120,
  };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(pointer.x, pointer.y, { steps: 8 });

  const movingEndpoint = page.locator(".canvas-edge-moving-endpoint");
  await expect(movingEndpoint).toHaveCount(1);
  const liveEdgePath = page.locator(".react-flow__edge-path");
  await expect(liveEdgePath).toHaveCount(1);
  expect(await liveEdgePath.evaluate((element) => {
    const path = element as SVGPathElement;
    const style = getComputedStyle(path);
    return path.getTotalLength() > 50 &&
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      style.opacity !== "0" &&
      style.stroke !== "none" &&
      style.stroke !== "rgba(0, 0, 0, 0)";
  })).toBe(true);
  await expect(page.locator(".canvas-port-handle.is-edge-selected")).toHaveCount(1);
  const movingEndpointBox = await movingEndpoint.boundingBox();
  expect(movingEndpointBox).not.toBeNull();
  if (!movingEndpointBox) throw new Error("moving endpoint is not visible");
  expect(Math.abs(movingEndpointBox.x + movingEndpointBox.width / 2 - pointer.x)).toBeLessThan(3);
  expect(Math.abs(movingEndpointBox.y + movingEndpointBox.height / 2 - pointer.y)).toBeLessThan(3);

  await page.mouse.move(
    topPortBox.x + topPortBox.width / 2,
    topPortBox.y + topPortBox.height / 2,
    { steps: 8 },
  );
  await expect(snappedTargetPort).toHaveClass(/is-reconnect-candidate/);
  await page.mouse.up();

  await expect(page.locator(".react-flow__edge")).toHaveCount(1);
  await expect(page.locator(".react-flow__edgeupdater")).toHaveCount(0);
  await expect(page.locator(".canvas-port-handle.is-edge-selected")).toHaveCount(2);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const raw = localStorage.getItem("flux.desktop.local-workspace");
        if (!raw) return null;
        const snapshot = JSON.parse(raw);
        const edge = snapshot.workflows[0]?.graph.edges[0];
        return edge
          ? { id: edge.id, target: edge.target, targetAnchor: edge.targetAnchor }
          : null;
      }),
    )
    .toEqual({
      id: "constant-to-result",
      target: "result-node",
      targetAnchor: "top",
    });
  await expect(
    page.locator(
      '.react-flow__node[data-id="result-node"] .canvas-port-handle.target.is-edge-selected[aria-label="上方输入：输入"]',
    ),
  ).toHaveCount(1);
});

test("moving an endpoint to another node replaces the edge instead of creating a branch", async ({ page }) => {
  await page.addInitScript((snapshot) => {
    localStorage.setItem("flux.desktop.local-workspace", JSON.stringify(snapshot));
    localStorage.setItem("flux.desktop.workspace-preference", "local");
  }, edgeWorkflow);

  await page.goto("/");
  await page.getByRole("button", { name: "打开 连线选择测试" }).click();
  await page.locator(".react-flow__edge-interaction").click();

  const currentTargetPort = page.locator(
    '.react-flow__node[data-id="result-node"] .canvas-port-handle.target.is-edge-selected[aria-label="左侧输入：输入"]',
  );
  const nextTargetPort = page.locator(
    '.react-flow__node[data-id="result-node-2"] .canvas-port-handle.target[aria-label="左侧输入：输入"]',
  );
  const currentBox = await currentTargetPort.boundingBox();
  const nextBox = await nextTargetPort.boundingBox();
  expect(currentBox).not.toBeNull();
  expect(nextBox).not.toBeNull();
  if (!currentBox || !nextBox) throw new Error("reconnection ports are not visible");

  await page.mouse.move(
    currentBox.x + currentBox.width / 2,
    currentBox.y + currentBox.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    nextBox.x + nextBox.width / 2,
    nextBox.y + nextBox.height / 2,
    { steps: 12 },
  );
  await expect(nextTargetPort).toHaveClass(/is-reconnect-candidate/);
  await page.mouse.up();

  await expect(page.locator(".react-flow__edge")).toHaveCount(1);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const raw = localStorage.getItem("flux.desktop.local-workspace");
        if (!raw) return null;
        const snapshot = JSON.parse(raw);
        return snapshot.workflows[0]?.graph.edges.map((edge: { id: string; target: string }) => ({
          id: edge.id,
          target: edge.target,
        })) ?? null;
      }),
    )
    .toEqual([{ id: "constant-to-result", target: "result-node-2" }]);
});

test("releasing a moving endpoint on empty canvas restores the original edge", async ({ page }) => {
  await page.addInitScript((snapshot) => {
    localStorage.setItem("flux.desktop.local-workspace", JSON.stringify(snapshot));
    localStorage.setItem("flux.desktop.workspace-preference", "local");
  }, edgeWorkflow);

  await page.goto("/");
  await page.getByRole("button", { name: "打开 连线选择测试" }).click();
  await page.locator(".react-flow__edge-interaction").click();

  const selectedTargetPort = page.locator(
    '.react-flow__node[data-id="result-node"] .canvas-port-handle.target.is-edge-selected[aria-label="左侧输入：输入"]',
  );
  const selectedPortBox = await selectedTargetPort.boundingBox();
  expect(selectedPortBox).not.toBeNull();
  if (!selectedPortBox) throw new Error("selected connection port is not visible");

  await page.mouse.move(
    selectedPortBox.x + selectedPortBox.width / 2,
    selectedPortBox.y + selectedPortBox.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(selectedPortBox.x - 140, selectedPortBox.y + 180, { steps: 8 });
  await expect(page.locator(".canvas-edge-moving-endpoint")).toHaveCount(1);
  await page.mouse.up();

  await expect(page.locator(".canvas-edge-moving-endpoint")).toHaveCount(0);
  await expect(page.locator(".react-flow__edge-path")).toHaveCount(1);
  await expect(page.locator(".canvas-port-handle.is-edge-selected")).toHaveCount(2);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const raw = localStorage.getItem("flux.desktop.local-workspace");
        if (!raw) return null;
        const snapshot = JSON.parse(raw);
        return snapshot.workflows[0]?.graph.edges[0]?.targetAnchor ?? null;
      }),
    )
    .toBe("left");
});

test("dragging between free ports creates exactly one edge", async ({ page }) => {
  const workflow = structuredClone(edgeWorkflow);
  workflow.workflows[0]!.graph.edges = [];
  await page.addInitScript((snapshot) => {
    localStorage.setItem("flux.desktop.local-workspace", JSON.stringify(snapshot));
    localStorage.setItem("flux.desktop.workspace-preference", "local");
  }, workflow);

  await page.goto("/");
  await page.getByRole("button", { name: "打开 连线选择测试" }).click();

  const source = page.locator(
    '.react-flow__node[data-id="constant-node"] .canvas-port-handle.source[aria-label="右侧输出：固定文本"]',
  );
  const target = page.locator(
    '.react-flow__node[data-id="result-node"] .canvas-port-handle.target[aria-label="左侧输入：输入"]',
  );
  const sourceBox = await source.boundingBox();
  const targetBox = await target.boundingBox();
  expect(sourceBox).not.toBeNull();
  expect(targetBox).not.toBeNull();
  if (!sourceBox || !targetBox) throw new Error("free connection ports are not visible");

  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, {
    steps: 12,
  });
  await expect(page.locator(".canvas-edge-draft")).toHaveCount(1);
  await expect(target).toHaveClass(/is-reconnect-candidate/);
  await page.mouse.up();

  await expect(page.locator(".react-flow__edge:not(.canvas-edge-draft)")).toHaveCount(1);
  await expect(page.locator(".canvas-edge-draft")).toHaveCount(0);
  await expect
    .poll(() => page.evaluate(() => {
      const raw = localStorage.getItem("flux.desktop.local-workspace");
      if (!raw) return null;
      return JSON.parse(raw).workflows[0]?.graph.edges.length ?? null;
    }))
    .toBe(1);
});

test("an occupied target rejects a second incoming edge", async ({ page }) => {
  await page.addInitScript((snapshot) => {
    localStorage.setItem("flux.desktop.local-workspace", JSON.stringify(snapshot));
    localStorage.setItem("flux.desktop.workspace-preference", "local");
  }, edgeWorkflow);

  await page.goto("/");
  await page.getByRole("button", { name: "打开 连线选择测试" }).click();

  const freeSource = page.locator(
    '.react-flow__node[data-id="constant-node-2"] .canvas-port-handle.source[aria-label="右侧输出：固定文本"]',
  );
  const occupiedTarget = page.locator(
    '.react-flow__node[data-id="result-node"] .canvas-port-handle.target[aria-label="左侧输入：输入"]',
  );
  const sourceBox = await freeSource.boundingBox();
  const targetBox = await occupiedTarget.boundingBox();
  expect(sourceBox).not.toBeNull();
  expect(targetBox).not.toBeNull();
  if (!sourceBox || !targetBox) throw new Error("capacity test ports are not visible");

  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, {
    steps: 12,
  });
  await expect(occupiedTarget).toHaveClass(/is-connect-invalid/);
  await page.mouse.up();

  await expect(page.locator(".react-flow__edge")).toHaveCount(1);
  await expect
    .poll(() => page.evaluate(() => {
      const raw = localStorage.getItem("flux.desktop.local-workspace");
      if (!raw) return null;
      return JSON.parse(raw).workflows[0]?.graph.edges.length ?? null;
    }))
    .toBe(1);
});

test("moving an occupied source endpoint replaces its edge instead of branching", async ({ page }) => {
  await page.addInitScript((snapshot) => {
    localStorage.setItem("flux.desktop.local-workspace", JSON.stringify(snapshot));
    localStorage.setItem("flux.desktop.workspace-preference", "local");
  }, edgeWorkflow);

  await page.goto("/");
  await page.getByRole("button", { name: "打开 连线选择测试" }).click();
  await page.locator(".react-flow__edge-interaction").click();

  const currentSource = page.locator(
    '.react-flow__node[data-id="constant-node"] .canvas-port-handle.source.is-edge-selected[aria-label="右侧输出：固定文本"]',
  );
  const nextSource = page.locator(
    '.react-flow__node[data-id="constant-node-2"] .canvas-port-handle.source[aria-label="右侧输出：固定文本"]',
  );
  const currentBox = await currentSource.boundingBox();
  const nextBox = await nextSource.boundingBox();
  expect(currentBox).not.toBeNull();
  expect(nextBox).not.toBeNull();
  if (!currentBox || !nextBox) throw new Error("source reconnection ports are not visible");

  await page.mouse.move(currentBox.x + currentBox.width / 2, currentBox.y + currentBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(nextBox.x + nextBox.width / 2, nextBox.y + nextBox.height / 2, {
    steps: 12,
  });
  await expect(nextSource).toHaveClass(/is-reconnect-candidate/);
  await page.mouse.up();

  await expect(page.locator(".react-flow__edge")).toHaveCount(1);
  await expect
    .poll(() => page.evaluate(() => {
      const raw = localStorage.getItem("flux.desktop.local-workspace");
      if (!raw) return null;
      const edges = JSON.parse(raw).workflows[0]?.graph.edges ?? [];
      return edges.map((edge: { id: string; source: string }) => ({
        id: edge.id,
        source: edge.source,
      }));
    }))
    .toEqual([{ id: "constant-to-result", source: "constant-node-2" }]);
});
