export type CanvasSaveOperation = "save" | "publish";

interface CanvasSaveTask<T> {
  signature: string;
  operation: CanvasSaveOperation;
  execute: (operation: CanvasSaveOperation) => Promise<T>;
  onStart: () => void;
  onSuccess: (
    value: T,
    signature: string,
    operation: CanvasSaveOperation,
  ) => void;
  onError: (error: unknown, operation: CanvasSaveOperation) => void;
}

interface CanvasSaveWaiter<T> {
  resolve: (value: T | null) => void;
}

interface QueuedCanvasSave<T> extends CanvasSaveTask<T> {
  generation: number;
  waiters: CanvasSaveWaiter<T>[];
}

export interface CanvasSaveCoordinator<T> {
  enqueue: (task: CanvasSaveTask<T>) => Promise<T | null>;
  invalidate: () => void;
}

function mergedOperation(
  left: CanvasSaveOperation,
  right: CanvasSaveOperation,
): CanvasSaveOperation {
  return left === "publish" || right === "publish" ? "publish" : "save";
}

/**
 * Serializes persistence for one canvas session. While a write is in flight, only
 * the newest pending snapshot is retained. A publish request is never weakened
 * into a save when requests are merged.
 *
 * invalidate() is the session boundary: callbacks from the previous workflow or
 * workspace are ignored even if their underlying network request finishes later.
 */
export function createCanvasSaveCoordinator<T>(): CanvasSaveCoordinator<T> {
  let generation = 0;
  let running: QueuedCanvasSave<T> | null = null;
  let pending: QueuedCanvasSave<T> | null = null;

  function settle(waiters: CanvasSaveWaiter<T>[], value: T | null): void {
    for (const waiter of waiters.splice(0)) waiter.resolve(value);
  }

  function covers(
    current: QueuedCanvasSave<T>,
    task: CanvasSaveTask<T>,
  ): boolean {
    return current.generation === generation &&
      current.signature === task.signature &&
      (current.operation === task.operation || current.operation === "publish");
  }

  async function drain(next: QueuedCanvasSave<T>): Promise<void> {
    running = next;
    try {
      if (next.generation !== generation) {
        settle(next.waiters, null);
      } else {
        next.onStart();
        const value = await next.execute(next.operation);
        if (next.generation === generation) {
          next.onSuccess(value, next.signature, next.operation);
          settle(next.waiters, value);
        } else {
          settle(next.waiters, null);
        }
      }
    } catch (error) {
      if (next.generation === generation) {
        try {
          next.onError(error, next.operation);
        } catch {
          // A reporting callback must never wedge the persistence queue.
        }
      }
      settle(next.waiters, null);
    } finally {
      if (running === next) running = null;
      const queued = pending;
      pending = null;
      if (queued) void drain(queued);
    }
  }

  return {
    enqueue(task) {
      return new Promise<T | null>((resolve) => {
        const waiter = { resolve };
        if (running && covers(running, task)) {
          running.waiters.push(waiter);
          return;
        }

        if (!running) {
          void drain({ ...task, generation, waiters: [waiter] });
          return;
        }

        if (pending?.generation === generation) {
          pending = {
            ...task,
            generation,
            operation: mergedOperation(pending.operation, task.operation),
            waiters: [...pending.waiters, waiter],
          };
          return;
        }

        pending = { ...task, generation, waiters: [waiter] };
      });
    },

    invalidate() {
      generation += 1;
      if (running) settle(running.waiters, null);
      if (pending) settle(pending.waiters, null);
      pending = null;
    },
  };
}
