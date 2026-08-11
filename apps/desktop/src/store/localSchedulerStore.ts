import { create } from "zustand";
import type { LocalSchedulerSnapshot } from "../lib/localWorkflowSchedulerCore.js";

export type {
  LocalScheduleStatus,
  LocalSchedulerSnapshot,
  LocalWorkflowScheduleView,
} from "../lib/localWorkflowSchedulerCore.js";

interface LocalSchedulerState extends LocalSchedulerSnapshot {
  applySnapshot: (snapshot: LocalSchedulerSnapshot) => void;
  reset: () => void;
}

const EMPTY_SNAPSHOT: LocalSchedulerSnapshot = {
  active: false,
  checkedAt: null,
  serviceError: null,
  workflows: {},
};

export const useLocalSchedulerStore = create<LocalSchedulerState>((set) => ({
  ...EMPTY_SNAPSHOT,
  applySnapshot: (snapshot) => set({
    active: snapshot.active,
    checkedAt: snapshot.checkedAt,
    serviceError: snapshot.serviceError,
    workflows: snapshot.workflows,
  }),
  reset: () => set(EMPTY_SNAPSHOT),
}));
