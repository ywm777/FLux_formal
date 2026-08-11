import type {
  ExecutionEffectInvocation,
  ExecutionEffectRecord,
} from "@flux/workflow-runtime";

export const MAX_EFFECT_ERROR_LENGTH = 1024;

export function normalizeEffectError(error: string): string {
  return error.slice(0, MAX_EFFECT_ERROR_LENGTH);
}

function validateEffectInvocation(invocation: ExecutionEffectInvocation): void {
  const valid = invocation.id.length > 0 && invocation.id.length <= 80 &&
    invocation.bindingId.length > 0 && invocation.bindingId.length <= 256 &&
    invocation.action.length > 0 && invocation.action.length <= 128 &&
    invocation.metadata.nodeId.length > 0 &&
    invocation.metadata.nodeId.length <= 128 &&
    invocation.metadata.attempt >= 1 &&
    invocation.metadata.invocationIndex >= 0;
  if (!valid || invocation.metadata.idempotencyKey !== invocation.id) {
    throw new Error(`副作用调用元数据无效: ${invocation.id}`);
  }
}

export function assertEffectIdentity(
  record: ExecutionEffectRecord,
  invocation: ExecutionEffectInvocation,
): void {
  validateEffectInvocation(invocation);
  const same = record.id === invocation.id &&
    record.metadata.executionId === invocation.metadata.executionId &&
    record.metadata.nodeId === invocation.metadata.nodeId &&
    record.metadata.invocationIndex === invocation.metadata.invocationIndex &&
    record.bindingId === invocation.bindingId &&
    record.action === invocation.action;
  if (!same) {
    throw new Error(`副作用幂等键冲突: ${invocation.id}`);
  }
}

export function pendingEffect(
  invocation: ExecutionEffectInvocation,
): ExecutionEffectRecord {
  validateEffectInvocation(invocation);
  return {
    id: invocation.id,
    bindingId: invocation.bindingId,
    action: invocation.action,
    metadata: structuredClone(invocation.metadata),
    status: "pending",
    updatedAt: new Date().toISOString(),
  };
}
