import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const workflowsController = readFileSync(
  resolve(root, "src/modules/workflows/workflows.controller.ts"),
  "utf8",
);
const executionsController = readFileSync(
  resolve(root, "src/modules/executions/executions.controller.ts"),
  "utf8",
);
const workflowsDto = readFileSync(
  resolve(root, "src/modules/workflows/dto/workflow.dto.ts"),
  "utf8",
);
const executionsDto = readFileSync(
  resolve(root, "src/modules/executions/dto/execution.dto.ts"),
  "utf8",
);

assert.match(workflowsController, /@Body\(\) body: CreateWorkflowDto/);
assert.match(workflowsController, /@Body\(\) body: UpdateWorkflowDto/);
assert.match(workflowsController, /@Body\(\) body: ToggleFavoriteDto/);
assert.doesNotMatch(workflowsController, /@Body\(\) body: \{/);
assert.match(executionsController, /@Body\(\) body: StartExecutionDto/);
assert.match(executionsController, /@Body\(\) body: ApproveExecutionDto/);
assert.doesNotMatch(executionsController, /@Body\(\) body: \{/);
assert.match(workflowsDto, /export class CreateWorkflowDto/);
assert.match(workflowsDto, /@IsDefined\(\)[\s\S]*graph!: unknown/);
assert.match(executionsDto, /export class StartExecutionDto/);
assert.match(executionsDto, /@IsIn\(\["approved", "rejected"\]\)/);

console.log("API controller DTO contract passed.");
