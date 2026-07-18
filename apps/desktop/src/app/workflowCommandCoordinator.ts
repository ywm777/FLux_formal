export type WorkflowCommandHandler = () => void | Promise<void>;

export interface CreateWorkflowDraftInput {
  title: string;
  templateId?: string;
}

export interface WorkflowCommandHandlers {
  save: WorkflowCommandHandler;
  publish: WorkflowCommandHandler;
  share: WorkflowCommandHandler;
  testRun: WorkflowCommandHandler;
  openWorkflow: (workflowId: string) => void | Promise<void>;
  createDraft: (input: CreateWorkflowDraftInput) => void | Promise<void>;
  addNode: WorkflowCommandHandler;
  insertNodeType: (nodeType: string) => void | Promise<void>;
  renameWorkflow: WorkflowCommandHandler;
}

export interface WorkflowCommands {
  save: () => Promise<void>;
  publish: () => Promise<void>;
  share: () => Promise<void>;
  testRun: () => Promise<void>;
  openWorkflow: (workflowId: string) => Promise<void>;
  createDraft: (input: CreateWorkflowDraftInput) => Promise<void>;
  addNode: () => Promise<void>;
  insertNodeType: (nodeType: string) => Promise<void>;
  renameWorkflow: () => Promise<void>;
}

export interface WorkflowCommandCoordinator {
  commands: WorkflowCommands;
  register: (handlers: WorkflowCommandHandlers) => () => void;
}

export function createWorkflowCommandCoordinator(): WorkflowCommandCoordinator {
  let activeHandlers: WorkflowCommandHandlers | null = null;
  let pendingNavigation: {
    execute: (handlers: WorkflowCommandHandlers) => void | Promise<void>;
    resolve: () => void;
    reject: (error: unknown) => void;
  } | null = null;

  async function invoke(
    command:
      | "save"
      | "publish"
      | "share"
      | "testRun"
      | "addNode"
      | "renameWorkflow",
  ): Promise<void> {
    await activeHandlers?.[command]();
  }

  function navigate(
    execute: (handlers: WorkflowCommandHandlers) => void | Promise<void>,
  ): Promise<void> {
    if (activeHandlers) {
      return Promise.resolve().then(() => execute(activeHandlers!));
    }

    pendingNavigation?.resolve();
    return new Promise<void>((resolve, reject) => {
      pendingNavigation = { execute, resolve, reject };
    });
  }

  const commands: WorkflowCommands = {
    save: () => invoke("save"),
    publish: () => invoke("publish"),
    share: () => invoke("share"),
    testRun: () => invoke("testRun"),
    openWorkflow: (workflowId) =>
      navigate((handlers) => handlers.openWorkflow(workflowId)),
    createDraft: (input) =>
      navigate((handlers) => handlers.createDraft(input)),
    addNode: () => invoke("addNode"),
    insertNodeType: async (nodeType) => {
      await activeHandlers?.insertNodeType(nodeType);
    },
    renameWorkflow: () => invoke("renameWorkflow"),
  };

  return {
    commands,
    register(handlers) {
      activeHandlers = handlers;
      const queued = pendingNavigation;
      if (queued) {
        pendingNavigation = null;
        void Promise.resolve()
          .then(() => queued.execute(handlers))
          .then(queued.resolve, queued.reject);
      }
      return () => {
        if (activeHandlers === handlers) activeHandlers = null;
      };
    },
  };
}
