import { test, expect } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const API = process.env.E2E_API_URL ?? "http://localhost:3000/api";

/** 任务层与创作层 API 隔离：跨用户 PATCH 工作流应被拒绝 */
test("跨用户 PATCH workflow 返回 404", async ({ request }) => {
  const emailA = `a_${Date.now()}@flux.dev`;
  const emailB = `b_${Date.now()}@flux.dev`;
  const password = "supersecret1";

  const regA = await request.post(`${API}/auth/register`, {
    data: { email: emailA, password, displayName: "A" },
  });
  expect(regA.ok()).toBeTruthy();
  const userA = (await regA.json()) as { tokens: { accessToken: string } };

  const regB = await request.post(`${API}/auth/register`, {
    data: { email: emailB, password, displayName: "B" },
  });
  const userB = (await regB.json()) as { tokens: { accessToken: string } };

  const created = await request.post(`${API}/workflows`, {
    headers: { Authorization: `Bearer ${userA.tokens.accessToken}` },
    data: {
      title: "私有流",
      graph: { id: "g1", version: 1, nodes: [], edges: [], meta: { title: "t", tags: [] } },
    },
  });
  expect(created.ok()).toBeTruthy();
  const wf = (await created.json()) as { id: string };

  const stolen = await request.patch(`${API}/workflows/${wf.id}`, {
    headers: { Authorization: `Bearer ${userB.tokens.accessToken}` },
    data: { title: "hack" },
  });
  expect(stolen.status()).toBe(404);
});

/** Local-first 桌面形态不再保留独立任务编辑入口。 */
test("桌面端没有独立任务编辑页", () => {
  const tasksView = join(process.cwd(), "apps/desktop/src/features/tasks/TasksView.tsx");
  const app = readFileSync(join(process.cwd(), "apps/desktop/src/App.tsx"), "utf8");
  expect(existsSync(tasksView)).toBe(false);
  expect(app).not.toMatch(/TasksView|mode\s*===\s*["']tasks["']/);
});
