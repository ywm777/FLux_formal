import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";
import {
  createWorkflowCommandCoordinator,
  type WorkflowCommandCoordinator,
  type WorkflowCommandHandlers,
  type WorkflowCommands,
} from "./workflowCommandCoordinator.js";

const WorkflowCommandContext = createContext<WorkflowCommandCoordinator | null>(
  null,
);

function useCoordinator(): WorkflowCommandCoordinator {
  const coordinator = useContext(WorkflowCommandContext);
  if (!coordinator) {
    throw new Error("WorkflowCommandProvider is missing");
  }
  return coordinator;
}

export function WorkflowCommandProvider({ children }: PropsWithChildren) {
  const [coordinator] = useState(createWorkflowCommandCoordinator);
  return (
    <WorkflowCommandContext.Provider value={coordinator}>
      {children}
    </WorkflowCommandContext.Provider>
  );
}

export function useWorkflowCommands(): WorkflowCommands {
  return useCoordinator().commands;
}

export function useRegisterWorkflowCommands(
  handlers: WorkflowCommandHandlers,
): void {
  const coordinator = useCoordinator();
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(
    () => coordinator.register({
      save: () => handlersRef.current.save(),
      publish: () => handlersRef.current.publish(),
      share: () => handlersRef.current.share(),
      testRun: () => handlersRef.current.testRun(),
    }),
    [coordinator],
  );
}
