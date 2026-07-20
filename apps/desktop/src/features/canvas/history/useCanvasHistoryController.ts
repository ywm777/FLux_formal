import { useCallback, useEffect, useReducer, useRef } from "react";
import {
  commitCanvasHistory,
  createCanvasHistory,
  redoCanvasHistory,
  resetCanvasHistory,
  undoCanvasHistory,
} from "./canvasHistory.js";

interface CanvasHistoryControllerInput<T> {
  value: T;
  clone: (value: T) => T;
  equals: (left: T, right: T) => boolean;
  limit?: number;
}

export function useCanvasHistoryController<T>({
  value,
  clone,
  equals,
  limit = 80,
}: CanvasHistoryControllerInput<T>) {
  const currentRef = useRef(value);
  currentRef.current = value;
  const historyRef = useRef(createCanvasHistory(clone(value), limit));
  const pendingCommitRef = useRef(false);
  const transactionRef = useRef(false);
  const [flushRevision, requestFlush] = useReducer(
    (revision: number) => revision + 1,
    0,
  );

  useEffect(() => {
    if (!pendingCommitRef.current) return;
    pendingCommitRef.current = false;
    const next = clone(currentRef.current);
    if (equals(historyRef.current.present, next)) return;
    historyRef.current = commitCanvasHistory(historyRef.current, next);
  }, [value, clone, equals, flushRevision]);

  const record = useCallback(() => {
    if (transactionRef.current) return;
    pendingCommitRef.current = true;
    requestFlush();
  }, []);

  const beginTransaction = useCallback(() => {
    if (transactionRef.current) return;
    transactionRef.current = true;
    pendingCommitRef.current = false;
  }, []);

  const endTransaction = useCallback(() => {
    if (!transactionRef.current) return;
    transactionRef.current = false;
    pendingCommitRef.current = true;
    requestFlush();
  }, []);

  const reset = useCallback(
    (next: T) => {
      pendingCommitRef.current = false;
      transactionRef.current = false;
      historyRef.current = resetCanvasHistory(
        historyRef.current,
        clone(next),
      );
    },
    [clone],
  );

  const undo = useCallback((): T | null => {
    pendingCommitRef.current = false;
    transactionRef.current = false;
    const next = undoCanvasHistory(historyRef.current);
    if (next === historyRef.current) return null;
    historyRef.current = next;
    return clone(next.present);
  }, [clone]);

  const redo = useCallback((): T | null => {
    pendingCommitRef.current = false;
    transactionRef.current = false;
    const next = redoCanvasHistory(historyRef.current);
    if (next === historyRef.current) return null;
    historyRef.current = next;
    return clone(next.present);
  }, [clone]);

  return {
    record,
    beginTransaction,
    endTransaction,
    reset,
    undo,
    redo,
  };
}
