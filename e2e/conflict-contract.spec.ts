import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

const API = process.env.E2E_API_URL ?? "http://localhost:3000/api";

test("stale workflow PATCH returns a structured 409", async ({ request }) => {
  const email = `conflict-${Date.now()}@example.com`;
  const register = await request.post(`${API}/auth/register`, {
    data: { email, password: "password123", displayName: "Conflict" },
  });
  expect(register.ok()).toBe(true);
  const auth = (await register.json()) as { tokens: { accessToken: string } };
  const headers = { Authorization: `Bearer ${auth.tokens.accessToken}` };

  const create = await request.post(`${API}/workflows`, {
    headers,
    data: {
      title: "Conflict",
      graph: {
        id: "conflict",
        version: 1,
        nodes: [],
        edges: [],
        meta: { title: "Conflict", tags: [] },
      },
    },
  });
  expect(create.ok()).toBe(true);
  const workflow = (await create.json()) as { id: string };

  const first = await request.patch(`${API}/workflows/${workflow.id}`, {
    headers,
    data: { title: "Version 2", expectedVersion: 1 },
  });
  expect(first.ok()).toBe(true);

  const stale = await request.patch(`${API}/workflows/${workflow.id}`, {
    headers,
    data: { title: "Stale", expectedVersion: 1 },
  });
  expect(stale.status()).toBe(409);
  expect(await stale.json()).toMatchObject({
    statusCode: 409,
    code: "WORKFLOW_VERSION_CONFLICT",
    currentVersion: 2,
    expectedVersion: 1,
  });
});

test("workflow conflicts preserve server metadata and retry from current version", async () => {
  const api = await readFile(
    join(process.cwd(), "apps/desktop/src/lib/api.ts"),
    "utf8",
  );
  const store = await readFile(
    join(process.cwd(), "apps/desktop/src/store/canvasStore.ts"),
    "utf8",
  );
  const repository = await readFile(
    join(process.cwd(), "apps/desktop/src/lib/workspaceRepository.ts"),
    "utf8",
  );
  const session = await readFile(
    join(
      process.cwd(),
      "apps/desktop/src/features/canvas/session/useCanvasSession.ts",
    ),
    "utf8",
  );
  const canvas = await readFile(
    join(process.cwd(), "apps/desktop/src/features/canvas/CanvasView.tsx"),
    "utf8",
  );

  expect(api).toContain("readonly details: Record<string, unknown>");
  expect(repository).toContain("error.status === 409");
  expect(repository).toContain('error.details.code === "WORKFLOW_VERSION_CONFLICT"');
  expect(repository).toContain("throw new WorkflowVersionConflictError");
  expect(session).toContain("error instanceof WorkflowVersionConflictError");
  expect(session).toContain("remoteVersion: error.currentVersion");
  expect(store).toContain("setVersion: (version: number) => void");
  expect(session).toContain("setVersion(conflict.remoteVersion)");
  expect(canvas).toContain("onKeepLocal={() => void keepLocalVersion()}");
  expect(canvas).toContain("onUseRemote={useStoredVersion}");
});
