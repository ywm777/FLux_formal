export interface CanvasHistory<T> {
  past: T[];
  present: T;
  future: T[];
  limit: number;
}

export function createCanvasHistory<T>(
  present: T,
  limit = 80,
): CanvasHistory<T> {
  return { past: [], present, future: [], limit };
}

export function commitCanvasHistory<T>(
  history: CanvasHistory<T>,
  present: T,
): CanvasHistory<T> {
  return {
    past: [...history.past, history.present].slice(-history.limit),
    present,
    future: [],
    limit: history.limit,
  };
}

export function undoCanvasHistory<T>(
  history: CanvasHistory<T>,
): CanvasHistory<T> {
  const previous = history.past.at(-1);
  if (previous === undefined) return history;
  return {
    past: history.past.slice(0, -1),
    present: previous,
    future: [history.present, ...history.future],
    limit: history.limit,
  };
}

export function redoCanvasHistory<T>(
  history: CanvasHistory<T>,
): CanvasHistory<T> {
  const [next, ...future] = history.future;
  if (next === undefined) return history;
  return {
    past: [...history.past, history.present].slice(-history.limit),
    present: next,
    future,
    limit: history.limit,
  };
}

export function resetCanvasHistory<T>(
  history: CanvasHistory<T>,
  present: T,
): CanvasHistory<T> {
  return createCanvasHistory(present, history.limit);
}
