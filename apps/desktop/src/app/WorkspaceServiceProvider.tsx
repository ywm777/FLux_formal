import {
  createContext,
  useMemo,
  useContext,
  type PropsWithChildren,
} from "react";
import { createWorkspaceRepository } from "../lib/workspaceRepository.js";
import { browserWorkflowFileAdapter } from "../infrastructure/browser/workflowFileAdapter.js";
import { cloudWorkflowSharingAdapter } from "../infrastructure/cloud/cloudWorkflowSharingAdapter.js";
import {
  createSharingService,
  type SharingService,
} from "../features/sharing/application/sharingService.js";
import {
  createWorkbenchService,
  type WorkbenchService,
} from "../features/workbench/application/workbenchService.js";
import type { WorkspaceRepositoryPort } from "../features/workspace/application/workspaceRepositoryPort.js";
import { useWorkspaceStore } from "../store/workspaceStore.js";

const WorkspaceServiceContext = createContext<WorkspaceRepositoryPort | null>(null);
const WorkbenchServiceContext = createContext<WorkbenchService | null>(null);
const SharingServiceContext = createContext<SharingService | null>(null);

export function WorkspaceServiceProvider({ children }: PropsWithChildren) {
  const workspaceKind = useWorkspaceStore((state) => state.kind);
  const workspaceRepository = useMemo(
    () => createWorkspaceRepository(workspaceKind),
    [workspaceKind],
  );
  const workbenchService = useMemo(
    () => createWorkbenchService(workspaceRepository, browserWorkflowFileAdapter),
    [workspaceRepository],
  );
  const sharingService = useMemo(
    () => createSharingService(
      workspaceRepository,
      browserWorkflowFileAdapter,
      cloudWorkflowSharingAdapter,
    ),
    [workspaceRepository],
  );

  return (
    <WorkspaceServiceContext.Provider value={workspaceRepository}>
      <WorkbenchServiceContext.Provider value={workbenchService}>
        <SharingServiceContext.Provider value={sharingService}>
          {children}
        </SharingServiceContext.Provider>
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

export function useSharingService(): SharingService {
  const service = useContext(SharingServiceContext);
  if (!service) {
    throw new Error("WorkspaceServiceProvider is missing");
  }
  return service;
}
