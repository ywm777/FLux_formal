import {
  useCallback,
  useEffect,
  useRef,
  useSyncExternalStore,
} from "react";
import {
  CanvasExecutionController,
  type CanvasExecutionControllerPorts,
  type CanvasExecutionRunRequest,
} from "./canvasExecutionController.js";

export function useCanvasExecutionController(
  ports: CanvasExecutionControllerPorts,
) {
  const controllerRef = useRef<CanvasExecutionController | null>(null);
  if (!controllerRef.current) {
    controllerRef.current = new CanvasExecutionController(ports);
  }
  const controller = controllerRef.current;
  controller.updatePorts(ports);

  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );

  useEffect(() => () => controller.dispose(), [controller]);

  const run = useCallback(
    (request: CanvasExecutionRunRequest) => controller.run(request),
    [controller],
  );
  const approve = useCallback(
    (decision: "approved" | "rejected") => controller.approve(decision),
    [controller],
  );
  const updateRuntimeInput = useCallback(
    (nodeId: string, value: Record<string, unknown>) => {
      controller.updateRuntimeInput(nodeId, value);
    },
    [controller],
  );
  const getRuntimeInput = useCallback(
    (nodeId: string) => controller.getRuntimeInput(nodeId),
    [controller],
  );

  return {
    ...snapshot,
    run,
    approve,
    clear: controller.clear,
    reset: controller.reset,
    updateRuntimeInput,
    getRuntimeInput,
  };
}
