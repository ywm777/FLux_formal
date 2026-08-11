/* eslint-disable no-console */
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { InMemoryUsersRepository } from "./memory/in-memory-users.repository";
import { InMemoryWorkflowsRepository } from "./memory/in-memory-workflows.repository";
import { WorkflowVersionConflictError } from "./repositories/workflows.repository";
import { readJsonFile, writeJsonFile } from "./file/paths";
import { migrations } from "./data-source";

async function main() {
  assert.deepEqual(
    migrations.map((migration) => migration.name),
    [
      "InitialSchema1785283200000",
      "ExecutionControl1785369600000",
      "ExecutionEffects1785456000000",
    ],
    "production migration chain must include execution control and effect journal schemas",
  );
  const users = new InMemoryUsersRepository();
  const workflows = new InMemoryWorkflowsRepository();

  const user = await users.createUser({
    displayName: "Tester",
    passwordHash: "hash",
  });
  await users.addIdentity({
    userId: user.id,
    channel: "email",
    externalId: "a@b.com",
    verified: true,
  });
  const found = await users.findByIdentity("email", "a@b.com");
  assert.equal(found?.id, user.id, "findByIdentity 应返回同一用户");

  const wf = await workflows.create({
    ownerId: user.id,
    workspaceId: "default",
    title: "Demo",
    graph: { nodes: [] },
  });
  assert.equal(wf.version, 1, "初始 version=1");
  assert.equal(wf.status, "draft", "初始状态为 draft");

  const updated = await workflows.update(wf.id, {
    title: "Demo2",
    expectedVersion: 1,
  });
  assert.equal(updated?.version, 2, "update 后 version=2");

  let conflict = false;
  try {
    await workflows.update(wf.id, { title: "x", expectedVersion: 1 });
  } catch (err) {
    conflict = err instanceof WorkflowVersionConflictError;
  }
  assert.ok(conflict, "过期版本应抛出冲突错误");

  const published = await workflows.setStatus(wf.id, "published");
  assert.equal(published?.status, "published", "状态切换为 published");
  const list = await workflows.listPublished();
  assert.equal(list.length, 1, "listPublished 返回 1 条");
  assert.ok(!("graph" in list[0]!), "summary 不含 graph");

  const temp = mkdtempSync(join(tmpdir(), "flux-file-db-"));
  try {
    const file = join(temp, "db.json");
    writeJsonFile(file, { version: 1 });
    writeJsonFile(file, { version: 2 });
    writeFileSync(file, "{broken", "utf8");
    assert.deepEqual(
      readJsonFile(file, { version: 0 }),
      { version: 1 },
      "主文件损坏时应读取最后一个完整备份",
    );
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }

  console.log("✅ database smoke 全部通过");
}

void main();
