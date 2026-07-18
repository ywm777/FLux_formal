import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AUTOSAVE_DEBOUNCE_MS, type WorkflowRecord } from "@flux/shared";
import { useWorkspaceRepository } from "../../../app/WorkspaceServiceProvider.js";
import type { CreateWorkflowDraftInput } from "../../../app/workflowCommandCoordinator.js";
import { formatProductErrorMessage } from "../../../lib/productError.js";
import { useCanvasStore } from "../../../store/canvasStore.js";
import {
  WorkflowVersionConflictError,
} from "../../workspace/application/workspaceRepositoryPort.js";
import { createWorkflowSessionService } from "../../workspace/application/workflowSessionService.js";

const FORCE_AUTOSAVE_SIGNATURE = "__force_autosave__";

export interface CanvasSessionConflict {
  localVersion: number;
  remoteVersion: number;
}

export interface UseCanvasSessionOptions {
  active: boolean;
  signature: string;
  createGraph: () => unknown;
  applyWorkflowRecord: (
    record: WorkflowRecord,
    preserveDirtyTitle?: boolean,
  ) => string | null;
  resetCanvasDraft: (templateId?: string) => void;
}

export interface CanvasSessionController {
  conflict: CanvasSessionConflict | null;
  saveNow: () => Promise<WorkflowRecord | null>;
  publish: () => Promise<WorkflowRecord | null>;
  openWorkflow: (workflowId: string) => Promise<void>;
  createDraft: (input: CreateWorkflowDraftInput) => Promise<void>;
  keepLocalVersion: () => Promise<void>;
  useStoredVersion: () => Promise<void>;
}

export function useCanvasSession({
  active,
  signature,
  createGraph,
  applyWorkflowRecord,
  resetCanvasDraft,
}: UseCanvasSessionOptions): CanvasSessionController {
  const repository = useWorkspaceRepository();
  const session = useMemo(
    () => createWorkflowSessionService(repository),
    [repository],
  );
  const [conflict, setConflict] = useState<CanvasSessionConflict | null>(null);
  const readyRef = useRef(false);
  const lastSignatureRef = useRef("");
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const signatureRef = useRef(signature);
  const wasActiveRef = useRef(active);
  const sessionRequestVersionRef = useRef(0);
  signatureRef.current = signature;

  const acceptRecord = useCallback(
    (record: WorkflowRecord, preserveDirtyTitle = false) => {
      const loadedSignature = applyWorkflowRecord(record, preserveDirtyTitle);
      if (loadedSignature !== null) lastSignatureRef.current = loadedSignature;
      return loadedSignature !== null;
    },
    [applyWorkflowRecord],
  );

  const cancelAutosave = useCallback(() => {
    if (!saveTimerRef.current) return;
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = null;
  }, []);

  const persist = useCallback(
    async (
      requestedSignature: string,
      operation: "save" | "publish",
    ): Promise<WorkflowRecord | null> => {
      const store = useCanvasStore.getState();
      store.setStatus("saving");
      try {
        const request = {
          workflowId: store.workflowId,
          version: store.version,
          title: store.title,
          graph: createGraph(),
        };
        const record = operation === "publish"
          ? await session.publish(request)
          : await session.save(request);
        lastSignatureRef.current = requestedSignature;
        useCanvasStore.getState().applyRecord(record);
        return record;
      } catch (error) {
        if (error instanceof WorkflowVersionConflictError) {
          setConflict({
            localVersion: useCanvasStore.getState().version,
            remoteVersion: error.currentVersion,
          });
        }
        const message = error instanceof WorkflowVersionConflictError
          ? "版本冲突，请选择保留本地或使用云端"
          : formatProductErrorMessage(
              error,
              operation === "publish" ? "发布失败" : "保存失败",
            );
        useCanvasStore.getState().setStatus("error", message);
        return null;
      }
    },
    [createGraph, session],
  );

  const saveNow = useCallback(async () => {
    cancelAutosave();
    return persist(signatureRef.current, "save");
  }, [cancelAutosave, persist]);

  const publish = useCallback(async () => {
    cancelAutosave();
    return persist(signatureRef.current, "publish");
  }, [cancelAutosave, persist]);

  useEffect(() => {
    let cancelled = false;
    const requestVersion = sessionRequestVersionRef.current;
    void (async () => {
      try {
        const result = await session.restore({
          requestedWorkflowId: null,
          pendingNewWorkflow: false,
        });
        if (
          cancelled ||
          requestVersion !== sessionRequestVersionRef.current
        ) return;

        if (result.kind === "record") {
          acceptRecord(result.record, result.preserveDirtyTitle);
        }
      } catch {
        // Authentication and transient network failures preserve the seed graph.
      } finally {
        if (
          !cancelled &&
          requestVersion === sessionRequestVersionRef.current
        ) {
          if (!lastSignatureRef.current) {
            lastSignatureRef.current = signatureRef.current;
          }
          readyRef.current = true;
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [acceptRecord, resetCanvasDraft, session]);

  const openWorkflow = useCallback(async (workflowId: string) => {
    const requestVersion = ++sessionRequestVersionRef.current;
    cancelAutosave();
    setConflict(null);
    readyRef.current = false;
    try {
      const record = await session.open(workflowId);
      if (requestVersion === sessionRequestVersionRef.current) {
        acceptRecord(record);
      }
    } catch (error) {
      if (requestVersion !== sessionRequestVersionRef.current) return;
      useCanvasStore
        .getState()
        .setStatus("error", formatProductErrorMessage(error, "打开工作流失败"));
    } finally {
      if (requestVersion === sessionRequestVersionRef.current) {
        readyRef.current = true;
      }
    }
  }, [acceptRecord, cancelAutosave, session]);

  const createDraft = useCallback(async (input: CreateWorkflowDraftInput) => {
    sessionRequestVersionRef.current += 1;
    cancelAutosave();
    setConflict(null);
    useCanvasStore.getState().startDraft(input.title);
    resetCanvasDraft(input.templateId);
    lastSignatureRef.current = FORCE_AUTOSAVE_SIGNATURE;
    readyRef.current = true;
  }, [cancelAutosave, resetCanvasDraft]);

  useEffect(() => {
    if (!readyRef.current || signature === lastSignatureRef.current) return;
    cancelAutosave();
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      void persist(signature, "save");
    }, AUTOSAVE_DEBOUNCE_MS);
    return cancelAutosave;
  }, [cancelAutosave, persist, signature]);

  useEffect(() => {
    const wasActive = wasActiveRef.current;
    wasActiveRef.current = active;
    if (!wasActive || active || !readyRef.current) return;
    if (useCanvasStore.getState().status === "saving") return;
    if (signatureRef.current !== lastSignatureRef.current) void saveNow();
  }, [active, saveNow]);

  const keepLocalVersion = useCallback(async () => {
    if (!conflict) return;
    useCanvasStore.getState().setVersion(conflict.remoteVersion);
    setConflict(null);
    await saveNow();
  }, [conflict, saveNow]);

  const useStoredVersion = useCallback(async () => {
    const requestVersion = ++sessionRequestVersionRef.current;
    setConflict(null);
    const workflowId = useCanvasStore.getState().workflowId;
    if (!workflowId) return;
    try {
      const record = await session.open(workflowId);
      if (requestVersion === sessionRequestVersionRef.current) {
        acceptRecord(record);
      }
    } catch (error) {
      useCanvasStore
        .getState()
        .setStatus(
          "error",
          formatProductErrorMessage(error, "重新加载工作流失败"),
        );
    }
  }, [acceptRecord, session]);

  return {
    conflict,
    saveNow,
    publish,
    openWorkflow,
    createDraft,
    keepLocalVersion,
    useStoredVersion,
  };
}
