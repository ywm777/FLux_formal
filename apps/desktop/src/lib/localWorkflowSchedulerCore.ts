import {
  EXECUTION_STATUS,
  type ExecutionStatus,
} from "@flux/shared";
import type { WorkflowGraph } from "@flux/workflow-schema";
import {
  cronMatchesDate,
  cronSlotKey,
  cronValidationError,
  isValidTimeZone,
  nextCronOccurrence,
  normalizeCronExpression,
} from "./cronExpression.ts";

const DEFAULT_TIMEZONE = "Asia/Shanghai";
const DEFAULT_CRON = "0 9 * * *";
const CHECK_INTERVAL_MS = 5_000;
const MAX_CATCH_UP_MINUTES = 24 * 60;

export type LocalScheduleStatus =
  | ExecutionStatus
  | "waiting"
  | "invalid"
  | "disabled";

export interface LocalWorkflowScheduleView {
  workflowId: string;
  title: string;
  triggerCount: number;
  status: LocalScheduleStatus;
  timezone: string;
  nextRunAt: string | null;
  lastRunAt: string | null;
  lastScheduledFor: string | null;
  lastExecutionId: string | null;
  error: string | null;
}

export interface LocalSchedulerSnapshot {
  active: boolean;
  checkedAt: string | null;
  serviceError: string | null;
  workflows: Record<string, LocalWorkflowScheduleView>;
}

interface ScheduledTrigger {
  nodeId: string;
  enabled: boolean;
  expression: string;
  timezone: string;
  error: string | null;
}

export interface SchedulableWorkflow {
  id: string;
  title: string;
  graph: WorkflowGraph;
}

interface PersistedRun {
  status: ExecutionStatus;
  startedAt: string;
  finishedAt?: string;
  scheduleSignature?: string;
  scheduledFor?: string;
  executionId?: string;
  error?: string;
}

interface SchedulerStateSnapshot {
  schemaVersion: 1;
  claims: Record<string, string>;
  runs: Record<string, PersistedRun>;
}

interface ScheduledExecutionResult {
  executionId: string;
  status: ExecutionStatus;
  error?: string;
}

export interface LocalWorkflowSchedulerDependencies {
  loadWorkflows: () => Promise<SchedulableWorkflow[]>;
  runWorkflow: (workflowId: string) => Promise<ScheduledExecutionResult>;
  readState: () => Promise<string | null>;
  writeState: (value: string) => Promise<void>;
  onSnapshot: (snapshot: LocalSchedulerSnapshot) => void;
  now?: () => Date;
  setInterval?: (callback: () => void, delay: number) => ReturnType<typeof globalThis.setInterval>;
  clearInterval?: (handle: ReturnType<typeof globalThis.setInterval>) => void;
}

export interface LocalWorkflowScheduler {
  start: () => Promise<void>;
  stop: () => void;
  refresh: () => Promise<void>;
}

function emptyState(): SchedulerStateSnapshot {
  return { schemaVersion: 1, claims: {}, runs: {} };
}

function parseState(raw: string | null): SchedulerStateSnapshot {
  if (!raw) return emptyState();
  try {
    const parsed = JSON.parse(raw) as Partial<SchedulerStateSnapshot>;
    if (parsed.schemaVersion !== 1 || !parsed.claims || !parsed.runs) return emptyState();
    return {
      schemaVersion: 1,
      claims: { ...parsed.claims },
      runs: { ...parsed.runs },
    };
  } catch {
    return emptyState();
  }
}

function triggerKey(workflowId: string, nodeId: string): string {
  return `${workflowId}:${nodeId}`;
}

function workflowScheduleSignature(triggers: ScheduledTrigger[]): string {
  return JSON.stringify(
    triggers
      .map((trigger) => [
        trigger.nodeId,
        trigger.enabled,
        trigger.expression,
        trigger.timezone,
      ] as const)
      .sort((left, right) => left[0].localeCompare(right[0])),
  );
}

function extractTriggers(graph: WorkflowGraph): ScheduledTrigger[] {
  return graph.nodes
    .filter((node) => node.type === "flux.trigger.cron")
    .map((node) => {
      const expression = normalizeCronExpression(String(node.data.cron ?? DEFAULT_CRON));
      const timezone = String(node.data.timezone ?? DEFAULT_TIMEZONE).trim() || DEFAULT_TIMEZONE;
      const expressionError = cronValidationError(expression);
      const timezoneError = isValidTimeZone(timezone) ? null : `无法识别时区：${timezone}`;
      return {
        nodeId: node.id,
        enabled: node.data.enabled !== false,
        expression,
        timezone,
        error: expressionError ?? timezoneError,
      };
    });
}

function floorToMinute(date: Date): Date {
  const minute = new Date(date);
  minute.setSeconds(0, 0);
  return minute;
}

function evaluationMinutes(previous: Date | null, now: Date): Date[] {
  const current = floorToMinute(now);
  if (!previous) return [current];
  const previousMinute = floorToMinute(previous);
  if (previousMinute.getTime() >= current.getTime()) return [current];
  const oldest = new Date(current.getTime() - MAX_CATCH_UP_MINUTES * 60_000);
  const cursor = new Date(Math.max(previousMinute.getTime() + 60_000, oldest.getTime()));
  const minutes: Date[] = [];
  while (cursor.getTime() <= current.getTime()) {
    minutes.push(new Date(cursor));
    cursor.setMinutes(cursor.getMinutes() + 1);
  }
  return minutes;
}

function latestDueMinute(
  trigger: ScheduledTrigger,
  minutes: Date[],
  claimedSlot: string | undefined,
): { minute: Date; slot: string } | null {
  let latest: { minute: Date; slot: string } | null = null;
  for (const minute of minutes) {
    if (!cronMatchesDate(trigger.expression, trigger.timezone, minute)) continue;
    const slot = cronSlotKey(minute, trigger.timezone);
    if (slot !== claimedSlot) latest = { minute, slot };
  }
  return latest;
}

function statusFromRun(run: PersistedRun | undefined): LocalScheduleStatus {
  return run?.status ?? "waiting";
}

function interruptedRun(run: PersistedRun): PersistedRun {
  return run.status === EXECUTION_STATUS.RUNNING
    ? {
        ...run,
        status: EXECUTION_STATUS.FAILED,
        finishedAt: new Date().toISOString(),
        error: "上次定时运行在应用退出前没有完成",
      }
    : run;
}

function inferLegacyScheduledFor(
  workflowId: string,
  triggers: ScheduledTrigger[],
  run: PersistedRun,
  claims: Record<string, string>,
): string | null {
  const startedAt = new Date(run.startedAt);
  if (Number.isNaN(startedAt.getTime())) return null;
  const matchingTrigger = triggers.find((trigger) => (
    trigger.enabled &&
    !trigger.error &&
    cronMatchesDate(trigger.expression, trigger.timezone, startedAt) &&
    claims[triggerKey(workflowId, trigger.nodeId)] === cronSlotKey(startedAt, trigger.timezone)
  ));
  return matchingTrigger ? floorToMinute(startedAt).toISOString() : null;
}

export function createLocalWorkflowScheduler(
  dependencies: LocalWorkflowSchedulerDependencies,
): LocalWorkflowScheduler {
  const now = dependencies.now ?? (() => new Date());
  const scheduleInterval = dependencies.setInterval ?? globalThis.setInterval.bind(globalThis);
  const cancelInterval = dependencies.clearInterval ?? globalThis.clearInterval.bind(globalThis);
  let active = false;
  let lifecycleVersion = 0;
  let interval: ReturnType<typeof globalThis.setInterval> | null = null;
  let checking = false;
  let refreshRequested = false;
  let state: SchedulerStateSnapshot | null = null;
  let persistQueue = Promise.resolve();
  let previousCheck: Date | null = null;
  let lastWorkflows: SchedulableWorkflow[] = [];
  const runningWorkflows = new Set<string>();
  const nextOccurrenceCache = new Map<string, {
    signature: string;
    occurrence: Date | null;
  }>();

  async function ensureState(): Promise<SchedulerStateSnapshot> {
    if (state) return state;
    state = parseState(await dependencies.readState());
    let changed = false;
    for (const [workflowId, run] of Object.entries(state.runs)) {
      const recovered = interruptedRun(run);
      if (recovered !== run) {
        state.runs[workflowId] = recovered;
        changed = true;
      }
    }
    if (changed) await persistState();
    return state;
  }

  async function persistState(): Promise<void> {
    if (!state) return;
    const payload = JSON.stringify(state);
    const operation = () => dependencies.writeState(payload);
    const result = persistQueue.then(operation, operation);
    persistQueue = result.then(() => undefined, () => undefined);
    await result;
  }

  function nextForTrigger(
    workflowId: string,
    trigger: ScheduledTrigger,
    reference: Date,
  ): Date | null {
    const key = triggerKey(workflowId, trigger.nodeId);
    const signature = `${trigger.expression}|${trigger.timezone}`;
    const cached = nextOccurrenceCache.get(key);
    if (
      cached?.signature === signature &&
      cached.occurrence &&
      cached.occurrence.getTime() > reference.getTime()
    ) return cached.occurrence;
    const occurrence = nextCronOccurrence(trigger.expression, trigger.timezone, reference);
    nextOccurrenceCache.set(key, { signature, occurrence });
    return occurrence;
  }

  function publishSnapshot(workflows: SchedulableWorkflow[], checkedAt: Date, serviceError: string | null): void {
    const views: Record<string, LocalWorkflowScheduleView> = {};
    for (const workflow of workflows) {
      const triggers = extractTriggers(workflow.graph);
      if (triggers.length === 0) continue;
      const enabledTriggers = triggers.filter((trigger) => trigger.enabled);
      const validTriggers = enabledTriggers.filter((trigger) => !trigger.error);
      const nextCandidates = validTriggers
        .map((trigger) => ({ trigger, occurrence: nextForTrigger(workflow.id, trigger, checkedAt) }))
        .filter((candidate): candidate is { trigger: ScheduledTrigger; occurrence: Date } => Boolean(candidate.occurrence))
        .sort((left, right) => left.occurrence.getTime() - right.occurrence.getTime());
      const next = nextCandidates[0];
      const invalidMessage = enabledTriggers.find((trigger) => trigger.error)?.error ?? null;
      const allDisabled = enabledTriggers.length === 0;
      const storedRun = state?.runs[workflow.id];
      const scheduleSignature = workflowScheduleSignature(triggers);
      const run = storedRun?.scheduleSignature === scheduleSignature ? storedRun : undefined;
      views[workflow.id] = {
        workflowId: workflow.id,
        title: workflow.title,
        triggerCount: triggers.length,
        status: allDisabled
          ? "disabled"
          : invalidMessage && validTriggers.length === 0 ? "invalid"
          : runningWorkflows.has(workflow.id) ? EXECUTION_STATUS.RUNNING : statusFromRun(run),
        timezone: next?.trigger.timezone ?? validTriggers[0]?.timezone ?? triggers[0]?.timezone ?? DEFAULT_TIMEZONE,
        nextRunAt: next?.occurrence.toISOString() ?? null,
        lastRunAt: run?.finishedAt ?? run?.startedAt ?? null,
        lastScheduledFor: run?.scheduledFor ?? null,
        lastExecutionId: run?.executionId ?? null,
        error: allDisabled ? null : invalidMessage ?? run?.error ?? null,
      };
    }
    dependencies.onSnapshot({
      active,
      checkedAt: checkedAt.toISOString(),
      serviceError,
      workflows: views,
    });
  }

  async function runDueWorkflow(
    workflow: SchedulableWorkflow,
    startedAt: Date,
    scheduleSignature: string,
    scheduledFor: Date,
  ): Promise<void> {
    if (!state || !runningWorkflows.has(workflow.id)) return;
    try {
      const result = await dependencies.runWorkflow(workflow.id);
      state.runs[workflow.id] = {
        status: result.status,
        startedAt: startedAt.toISOString(),
        finishedAt: now().toISOString(),
        scheduleSignature,
        scheduledFor: scheduledFor.toISOString(),
        executionId: result.executionId,
        error: result.error,
      };
    } catch (error) {
      state.runs[workflow.id] = {
        status: EXECUTION_STATUS.FAILED,
        startedAt: startedAt.toISOString(),
        finishedAt: now().toISOString(),
        scheduleSignature,
        scheduledFor: scheduledFor.toISOString(),
        error: error instanceof Error ? error.message : "定时运行失败",
      };
    } finally {
      runningWorkflows.delete(workflow.id);
      await persistState();
      publishSnapshot(lastWorkflows, now(), null);
    }
  }

  async function performCheck(
    expectedVersion = lifecycleVersion,
    waitForDispatched = true,
  ): Promise<void> {
    if (!active || expectedVersion !== lifecycleVersion) return;
    if (checking) {
      refreshRequested = true;
      return;
    }
    checking = true;
    const dispatched: Promise<void>[] = [];
    try {
      await ensureState();
      const checkedAt = now();
      const workflows = await dependencies.loadWorkflows();
      if (!active || expectedVersion !== lifecycleVersion) return;
      lastWorkflows = workflows;
      const currentWorkflowIds = new Set(workflows.map((workflow) => workflow.id));
      let scheduleStateChanged = false;
      for (const workflow of workflows) {
        const run = state!.runs[workflow.id];
        if (!run) continue;
        const triggers = extractTriggers(workflow.graph);
        const currentSignature = workflowScheduleSignature(triggers);
        if (!run.scheduleSignature) {
          const scheduledFor = inferLegacyScheduledFor(
            workflow.id,
            triggers,
            run,
            state!.claims,
          );
          if (scheduledFor) {
            state!.runs[workflow.id] = {
              ...run,
              scheduleSignature: currentSignature,
              scheduledFor,
            };
            scheduleStateChanged = true;
            continue;
          }
        }
        if (run.scheduleSignature !== currentSignature) {
          delete state!.runs[workflow.id];
          scheduleStateChanged = true;
        }
      }
      for (const workflowId of Object.keys(state!.runs)) {
        if (!currentWorkflowIds.has(workflowId)) {
          delete state!.runs[workflowId];
          scheduleStateChanged = true;
        }
      }
      if (scheduleStateChanged) await persistState();
      const minutes = evaluationMinutes(previousCheck, checkedAt);
      previousCheck = checkedAt;
      const due: Array<{
        workflow: SchedulableWorkflow;
        claims: Array<{ key: string; slot: string; scheduledFor: Date }>;
        scheduleSignature: string;
        scheduledFor: Date;
      }> = [];

      for (const workflow of workflows) {
        const triggers = extractTriggers(workflow.graph);
        const claims: Array<{ key: string; slot: string; scheduledFor: Date }> = [];
        for (const trigger of triggers) {
          if (!trigger.enabled || trigger.error) continue;
          const key = triggerKey(workflow.id, trigger.nodeId);
          const match = latestDueMinute(trigger, minutes, state!.claims[key]);
          if (match) claims.push({ key, slot: match.slot, scheduledFor: match.minute });
        }
        if (claims.length > 0 && !runningWorkflows.has(workflow.id)) {
          due.push({
            workflow,
            claims,
            scheduleSignature: workflowScheduleSignature(triggers),
            scheduledFor: claims.reduce(
              (latest, claim) => claim.scheduledFor.getTime() > latest.getTime() ? claim.scheduledFor : latest,
              claims[0]!.scheduledFor,
            ),
          });
        }
      }

      if (due.length > 0) {
        const stateBeforeClaims = structuredClone(state!);
        for (const item of due) {
          for (const claim of item.claims) state!.claims[claim.key] = claim.slot;
          runningWorkflows.add(item.workflow.id);
          state!.runs[item.workflow.id] = {
            status: EXECUTION_STATUS.RUNNING,
            startedAt: checkedAt.toISOString(),
            scheduleSignature: item.scheduleSignature,
            scheduledFor: item.scheduledFor.toISOString(),
          };
        }
        try {
          // claim 与 RUNNING 状态一次提交；崩溃恢复时不会出现“已 claim 但无运行记录”。
          await persistState();
        } catch (error) {
          state = stateBeforeClaims;
          for (const item of due) runningWorkflows.delete(item.workflow.id);
          throw error;
        }
      }
      publishSnapshot(workflows, checkedAt, null);
      for (const item of due) {
        const task = runDueWorkflow(
          item.workflow,
          checkedAt,
          item.scheduleSignature,
          item.scheduledFor,
        ).catch((error: unknown) => {
          publishSnapshot(
            lastWorkflows,
            now(),
            error instanceof Error ? error.message : "定时运行状态保存失败",
          );
        });
        dispatched.push(task);
      }
    } catch (error) {
      if (!active || expectedVersion !== lifecycleVersion) return;
      const checkedAt = now();
      publishSnapshot(lastWorkflows, checkedAt, error instanceof Error ? error.message : "定时器检查失败");
    } finally {
      checking = false;
      if (refreshRequested && active) {
        refreshRequested = false;
        void performCheck(lifecycleVersion, false);
      }
    }
    if (waitForDispatched) await Promise.allSettled(dispatched);
  }

  return {
    async start() {
      if (active) return;
      active = true;
      lifecycleVersion += 1;
      const startedVersion = lifecycleVersion;
      dependencies.onSnapshot({
        active: true,
        checkedAt: null,
        serviceError: null,
        workflows: {},
      });
      interval = scheduleInterval(
        () => void performCheck(startedVersion, false),
        CHECK_INTERVAL_MS,
      );
      await performCheck(startedVersion);
    },
    stop() {
      active = false;
      lifecycleVersion += 1;
      if (interval !== null) cancelInterval(interval);
      interval = null;
      previousCheck = null;
      dependencies.onSnapshot({
        active: false,
        checkedAt: null,
        serviceError: null,
        workflows: {},
      });
    },
    refresh: () => performCheck(lifecycleVersion),
  };
}
