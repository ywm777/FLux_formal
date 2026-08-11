/* eslint-disable no-console */
import assert from "node:assert/strict";
import { validate } from "class-validator";
import {
  CreateWorkflowDto,
  ToggleFavoriteDto,
  UpdateWorkflowDto,
} from "./workflows/dto/workflow.dto";
import {
  ApproveExecutionDto,
  StartExecutionDto,
} from "./executions/dto/execution.dto";

async function main(): Promise<void> {
  const create = new CreateWorkflowDto();
  create.title = "Smoke";
  create.graph = { id: "graph", version: 1, nodes: [], edges: [] };
  create.tags = ["smoke"];
  assert.equal((await validate(create, { whitelist: true })).length, 0);

  const unknownField = Object.assign(new CreateWorkflowDto(), {
    title: "Whitelist",
    graph: { id: "graph", version: 1, nodes: [], edges: [] },
    ignored: true,
  });
  assert.equal((await validate(unknownField, { whitelist: true })).length, 0);
  assert.equal("ignored" in unknownField, false, "DTO 应由 whitelist 移除未知字段");

  const missingGraph = new CreateWorkflowDto();
  missingGraph.title = "Missing graph";
  assert.ok((await validate(missingGraph)).some((error) => error.property === "graph"));

  const update = new UpdateWorkflowDto();
  update.expectedVersion = 2;
  assert.equal((await validate(update, { whitelist: true })).length, 0);

  const favorite = new ToggleFavoriteDto();
  favorite.isFavorite = true;
  assert.equal((await validate(favorite)).length, 0);

  const start = new StartExecutionDto();
  start.workflowId = "workflow-1";
  start.inputs = { "node-1": { value: "ok" } };
  assert.equal((await validate(start, { whitelist: true })).length, 0);

  const approval = new ApproveExecutionDto();
  approval.nodeId = "review-1";
  approval.decision = "approved";
  assert.equal((await validate(approval, { whitelist: true })).length, 0);

  const badApproval = new ApproveExecutionDto();
  badApproval.nodeId = "review-1";
  badApproval.decision = "pending" as never;
  assert.ok((await validate(badApproval)).some((error) => error.property === "decision"));

  console.log("✅ API DTO class-validator smoke 全部通过");
}

void main();
