import {
  createContext,
  useContext,
  type PropsWithChildren,
} from "react";
import { workspaceRepository } from "../lib/workspaceRepository.js";
import { browserWorkflowFileAdapter } from "../infrastructure/browser/workflowFileAdapter.js";
import {
  createWorkbenchService,
  type WorkbenchService,
} from "../features/workbench/application/workbenchService.js";
import type { WorkspaceRepositoryPort } from "../features/workspace/application/workspaceRepositoryPort.js";

const WorkspaceServiceContext =
  createContext<WorkspaceRepositoryPort | null>(null);
const WorkbenchServiceContext = createContext<WorkbenchService | null>(null);
const workbenchService = createWorkbenchService(
  workspaceRepository,
  browserWorkflowFileAdapter,
);

export function WorkspaceServiceProvider({ children }: PropsWithChildren) {
  return (
    <WorkspaceServiceContext.Provider value={workspaceRepository}>
      <WorkbenchServiceContext.Provider value={workbenchService}>
        {children}
      </WorkbenchServiceContext.Provider>
    </WorkspaceServiceContext.Provider>
  );
}

export function useWorkspaceRepository(): WorkspaceRepositoryPort {
  const repository = useContext(WorkspaceServiceContext);
  if (!repository) {
    throw new Error("WorkspaceServiceProvider is missing");
  }
  return repository;
}

export function useWorkbenchService(): WorkbenchService {
  const service = useContext(WorkbenchServiceContext);
  if (!service) {
    throw new Error("WorkspaceServiceProvider is missing");
  }
  return service;
}
