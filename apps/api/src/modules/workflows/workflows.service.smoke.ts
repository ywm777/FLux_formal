import assert from "node:assert/strict";
import { BadRequestException, ConflictException } from "@nestjs/common";
import { CURRENT_WORKFLOW_SCHEMA_VERSION } from "@flux/workflow-schema";
import { InMemoryWorkflowsRepository } from "../../database/memory/in-memory-workflows.repository";
import { WorkflowsService } from "./workflows.service";

async function main(): Promise<void> {
  const repository = new InMemoryWorkflowsRepository();
  const service = new WorkflowsService(repository);
  const legacyGraph = {
    id: "source-graph",
    version: 1,
    viewport: { x: 0, y: 0, zoom: 1 },
    nodes: [
      {
        id: "ai-1",
        type: "flux.ai.complete",
        position: { x: 40, y: 80 },
        data: {
          prompt: "summarize",
          connectionId: "private-connection",
          nested: { apiKey: "private-key", model: "gpt-test" },
        },
        ports: { inputs: [], outputs: [] },
      },
    ],
    edges: [],
    meta: { title: "Versioned", tags: [] },
  };
  const created = await service.create("owner-a", {
    title: "Versioned",
    graph: legacyGraph,
  });

  assert.equal(
    (created.graph as { schemaVersion?: number }).schemaVersion,
    CURRENT_WORKFLOW_SCHEMA_VERSION,
    "API writes must normalize legacy graphs before persistence",
  );
  assert.equal(
    "schemaVersion" in legacyGraph,
    false,
    "normalization must not mutate request input",
  );
  await assert.rejects(
    () => service.create("owner-a", { title: "Invalid", graph: { id: 42 } }),
    BadRequestException,
  );

  const localOnly = await service.create("owner-a", {
    title: "Local MCP",
    graph: {
      ...legacyGraph,
      id: "local-only",
      nodes: [{
        ...legacyGraph.nodes[0],
        id: "mcp-1",
        type: "capability.mcp.example.search-deadbeef",
        data: {},
      }],
    },
  });
  await assert.rejects(
    () => service.publish("owner-a", localOnly.id),
    (error: unknown) =>
      error instanceof BadRequestException &&
      JSON.stringify(error.getResponse()).includes("UNSUPPORTED_CLOUD_NODE_TYPES"),
    "云端发布应在入队前拒绝仅本地可用的动态节点",
  );

  await service.update("owner-a", created.id, {
    title: "Version 2",
    expectedVersion: 1,
  });

  let conflict: ConflictException | undefined;
  try {
    await service.update("owner-a", created.id, {
      title: "Stale",
      expectedVersion: 1,
    });
  } catch (error) {
    if (error instanceof ConflictException) conflict = error;
  }

  assert.ok(conflict, "stale writes must become ConflictException");
  assert.deepEqual(conflict.getResponse(), {
    statusCode: 409,
    code: "WORKFLOW_VERSION_CONFLICT",
    message: "工作流版本冲突：当前 v2，提交基于 v1",
    currentVersion: 2,
    expectedVersion: 1,
  });

  const share = await service.enableShare("owner-a", created.id);
  assert.equal(share.workflowId, created.id);
  assert.ok(share.shareId.length >= 32, "share id must have enough entropy");
  assert.deepEqual(
    await service.enableShare("owner-a", created.id),
    share,
    "enabling an existing share must keep its URL stable",
  );

  const shared = await service.getShared(share.shareId);
  assert.equal(shared.title, "Version 2");
  assert.equal("ownerId" in shared, false, "public share must hide owner id");
  const sharedData = (shared.graph as {
    nodes: Array<{ data: Record<string, unknown> }>;
  }).nodes[0]!.data;
  assert.equal(sharedData.connectionId, undefined);
  assert.deepEqual(sharedData.nested, { model: "gpt-test" });

  const copied = await service.copyShared("owner-b", share.shareId);
  assert.notEqual(copied.id, created.id);
  assert.equal(copied.ownerId, "owner-b");
  assert.equal(copied.title, "Version 2 副本");
  assert.equal(copied.status, "draft");
  assert.equal(copied.shareId, undefined);
  assert.equal((copied.graph as { id: string }).id, copied.id);
  assert.equal(
    (copied.graph as { meta: { title: string } }).meta.title,
    "Version 2 副本",
  );
  assert.equal(
    (copied.graph as { nodes: Array<{ data: Record<string, unknown> }> })
      .nodes[0]!.data.connectionId,
    undefined,
  );

  await service.disableShare("owner-a", created.id);
  await assert.rejects(
    () => service.getShared(share.shareId),
    /分享链接不存在或已失效/,
  );
  console.log("workflows service smoke passed");
}

void main();
