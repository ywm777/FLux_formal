import { Injectable } from "@nestjs/common";
import type { ExecutionControlMode } from "../../database/repositories/executions.repository";

export type CancelMode = ExecutionControlMode;

interface CancelEntry {
  controller: AbortController;
  mode: CancelMode | null;
}

/**
 * 进程内取消信号注册表：执行开始时登记 AbortController，
 * 取消/暂停时 abort 并记录模式。
 *
 * 分布式（多 worker）场景应在此之上叠加 Redis pub/sub，将 cancel
 * 信号广播到持有该执行的 worker 进程（见 plan 2.3）。
 */
@Injectable()
export class CancelRegistry {
  private readonly entries = new Map<string, CancelEntry>();

  register(executionId: string): AbortController {
    const controller = new AbortController();
    this.entries.set(executionId, { controller, mode: null });
    return controller;
  }

  cancel(executionId: string, mode: CancelMode): boolean {
    const entry = this.entries.get(executionId);
    if (!entry) return false;
    entry.mode = mode;
    entry.controller.abort(mode);
    return true;
  }

  modeOf(executionId: string): CancelMode | null {
    return this.entries.get(executionId)?.mode ?? null;
  }

  release(executionId: string): void {
    this.entries.delete(executionId);
  }
}
