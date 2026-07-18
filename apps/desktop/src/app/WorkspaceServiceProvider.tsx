import {
  createContext,
  useContext,
  type PropsWithChildren,
} from "react";
import { workspaceRepository } from "../lib/workspaceRepository.js";
import type { WorkspaceRepositoryPort } from "../features/workspace/application/workspaceRepositoryPort.js";

const WorkspaceServiceContext =
  createContext<WorkspaceRepositoryPort | null>(null);

export function WorkspaceServiceProvider({ children }: PropsWithChildren) {
  return (
    <WorkspaceServiceContext.Provider value={workspaceRepository}>
      {children}
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
