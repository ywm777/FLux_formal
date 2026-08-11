import type { WorkflowRecord } from "@flux/shared";
import { safeParseGraph } from "@flux/workflow-schema";
import { desktopStorage } from "./desktopStorage.js";
import { runLocalDraftExecution } from "./localExecution.js";
import { localWorkspaceRepository } from "./localWorkspaceRepository.js";
import {
  createLocalWorkflowScheduler,
  type SchedulableWorkflow,
} from "./localWorkflowSchedulerCore.js";
import { useLocalSchedulerStore } from "../store/localSchedulerStore.js";
import { publishScheduledExecutionProgress } from "./localSchedulerEvents.js";

const STORAGE_KEY = "local-scheduler";

async function loadLocalWorkflows(): Promise<SchedulableWorkflow[]> {
  const records = await localWorkspaceRepository.listRecords();
  return records.flatMap((record: WorkflowRecord) => {
    const parsed = safeParseGraph(record.graph);
    return parsed.success ? [{ id: record.id, title: record.title, graph: parsed.data }] : [];
  });
}

export const localWorkflowScheduler = createLocalWorkflowScheduler({
  loadWorkflows: loadLocalWorkflows,
  runWorkflow: (workflowId) => runLocalDraftExecution(
    workflowId,
    {},
    publishScheduledExecutionProgress,
  ),
  readState: () => desktopStorage.read(STORAGE_KEY),
  writeState: (value) => desktopStorage.write(STORAGE_KEY, value),
  onSnapshot: (snapshot) => useLocalSchedulerStore.getState().applySnapshot(snapshot),
});

export {
  createLocalWorkflowScheduler,
  type LocalWorkflowScheduler,
  type LocalWorkflowSchedulerDependencies,
  type SchedulableWorkflow,
} from "./localWorkflowSchedulerCore.js";
