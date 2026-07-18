export type WorkflowCommandHandler = () => void | Promise<void>;

export interface WorkflowCommandHandlers {
  save: WorkflowCommandHandler;
  publish: WorkflowCommandHandler;
  share: WorkflowCommandHandler;
  testRun: WorkflowCommandHandler;
}

export interface WorkflowCommands {
  save: () => Promise<void>;
  publish: () => Promise<void>;
  share: () => Promise<void>;
  testRun: () => Promise<void>;
}

export interface WorkflowCommandCoordinator {
  commands: WorkflowCommands;
  register: (handlers: WorkflowCommandHandlers) => () => void;
}

export function createWorkflowCommandCoordinator(): WorkflowCommandCoordinator {
  let activeHandlers: WorkflowCommandHandlers | null = null;

  async function invoke(command: keyof WorkflowCommandHandlers): Promise<void> {
    await activeHandlers?.[command]();
  }

  const commands: WorkflowCommands = {
    save: () => invoke("save"),
    publish: () => invoke("publish"),
    share: () => invoke("share"),
    testRun: () => invoke("testRun"),
  };

  return {
    commands,
    register(handlers) {
      activeHandlers = handlers;
      return () => {
        if (activeHandlers === handlers) activeHandlers = null;
      };
    },
  };
}
