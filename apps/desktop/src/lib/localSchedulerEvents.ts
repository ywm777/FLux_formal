import type { ExecutionDetail } from "@flux/shared";

type ScheduledExecutionListener = (detail: ExecutionDetail) => void;

const listeners = new Set<ScheduledExecutionListener>();

export function publishScheduledExecutionProgress(detail: ExecutionDetail): void {
  for (const listener of listeners) listener(structuredClone(detail));
}

export function subscribeScheduledExecutionProgress(
  listener: ScheduledExecutionListener,
): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
