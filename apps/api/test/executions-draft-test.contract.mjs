import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const controller = readFileSync(resolve(root, "src/modules/executions/executions.controller.ts"), "utf8");
const service = readFileSync(resolve(root, "src/modules/executions/executions.service.ts"), "utf8");
const processor = readFileSync(resolve(root, "src/modules/executions/execution-processor.service.ts"), "utf8");
const smoke = readFileSync(resolve(root, "src/modules/executions/executions.service.smoke.ts"), "utf8");

const requirements = [
  [
    "executions controller exposes a draft test-run endpoint",
    /@Post\("test"\)[\s\S]*startDraft\([\s\S]*@Body\(\) body: StartExecutionDto[\s\S]*this\.executions\.startDraft\(user\.id,\s*body\.workflowId,\s*body\.inputs\)/,
    controller,
  ],
  [
    "published execution path still requires published workflows",
    /async start\([\s\S]*workflow\.status !== WORKFLOW_STATUS\.PUBLISHED[\s\S]*throw new ConflictException\("工作流尚未发布"\)/,
    service,
  ],
  [
    "draft test-run path validates ownership without requiring published status",
    /async startDraft\([\s\S]*const workflow = await this\.workflows\.findById\(workflowId\)[\s\S]*workflow\.ownerId !== ownerId[\s\S]*return this\.createExecutionFromWorkflow\(workflow,\s*inputs\)/,
    service,
  ],
  [
    "shared execution creation validates graph and enqueues the graph snapshot",
    /private async createExecutionFromWorkflow[\s\S]*safeParseGraph\(workflow\.graph\)[\s\S]*validateGraph\(parsed\.data\)[\s\S]*compileExecutionOrder\(parsed\.data\)[\s\S]*this\.queue\.add\(\{[\s\S]*graph: parsed\.data/,
    service,
  ],
  [
    "smoke test proves draft test-runs do not publish the workflow first",
    /const draftTest = await service\.startDraft\("owner-a", draft\.id\)[\s\S]*assert\.equal\(draftTest\.status,\s*"running"\)[\s\S]*assert\.equal\(queue\.jobs\.length,\s*1\)/,
    smoke,
  ],
  [
    "execution processor records human review as a non-final paused state",
    /result\.status === "paused"[\s\S]*EXECUTION_STATUS\.PAUSED[\s\S]*this\.executions\.markStatus\(executionId,\s*status/,
    processor,
  ],
  [
    "executions controller exposes approval for paused human review",
    /@Post\(":id\/approval"\)[\s\S]*@Body\(\) body: ApproveExecutionDto[\s\S]*this\.executions\.approve\(user\.id,\s*id,\s*body\)/,
    controller,
  ],
  [
    "approval service only continues paused executions and mutates the review decision in the queued graph",
    /async approve\([\s\S]*execution\.status !== EXECUTION_STATUS\.PAUSED[\s\S]*node\.type !== "flux\.business\.humanReview"[\s\S]*decision:\s*input\.decision[\s\S]*this\.executions\.markStatus\(executionId,\s*EXECUTION_STATUS\.RUNNING\)[\s\S]*this\.queue\.add\(\{[\s\S]*executionId[\s\S]*graph: parsed\.data/,
    service,
  ],
  [
    "service smoke proves paused approval reuses the same execution id",
    /await executions\.markStatus\(approvalRun\.executionId,\s*"paused"\)[\s\S]*service\.approve\("owner-a",\s*approvalRun\.executionId[\s\S]*assert\.equal\(queue\.jobs\[0\]\?\.executionId,\s*approvalRun\.executionId\)[\s\S]*decision,\s*"approved"/,
    smoke,
  ],
];

const missing = requirements
  .filter(([, pattern, source]) => !pattern.test(source))
  .map(([label]) => label);

if (missing.length > 0) {
  console.error(`Missing ${missing.length} draft execution requirement(s):`);
  for (const label of missing) console.error(`- ${label}`);
  process.exit(1);
}

console.log("Draft execution contract passed.");
