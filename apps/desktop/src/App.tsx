import { lazy, Suspense, useEffect, useState, type CSSProperties } from "react";
import { useAppStore } from "./store/appStore.js";
import { useAuthStore } from "./store/authStore.js";
import { TitleBar } from "./components/TitleBar.js";
import { StatusBar } from "./components/StatusBar.js";
import { WorkbenchView } from "./features/workbench/WorkbenchView.js";
import { LoginView } from "./features/auth/LoginView.js";
import { BrandMark } from "./components/BrandMark.js";
import { AiConnectionDrawer } from "./features/ai/AiConnectionDrawer.js";
import { useCanvasStore } from "./store/canvasStore.js";
import { useWorkspaceStore } from "./store/workspaceStore.js";
import { useWorkflowCommands } from "./app/WorkflowCommandProvider.js";
import { useCustomNodeStore } from "./features/node-studio/store/customNodeStore.js";
import { localWorkflowScheduler } from "./lib/localWorkflowScheduler.js";
import { useMcpConnectionStore } from "./features/capabilities/store/mcpConnectionStore.js";

const NodeStudioView = lazy(async () => {
  const module = await import("./features/node-studio/NodeStudioView.js");
  return { default: module.NodeStudioView };
});

const CanvasView = lazy(async () => {
  const module = await import("./features/canvas/CanvasView.js");
  return { default: module.CanvasView };
});

const SharedWorkflowView = lazy(async () => {
  const module = await import("./features/sharing/SharedWorkflowView.js");
  return { default: module.SharedWorkflowView };
});

export function App() {
  const workflowCommands = useWorkflowCommands();
  const mode = useAppStore((s) => s.mode);
  const setMode = useAppStore((s) => s.setMode);
  const status = useAuthStore((s) => s.status);
  const bootstrapAuth = useAuthStore((s) => s.bootstrap);
  const workspaceKind = useWorkspaceStore((s) => s.kind);
  const workspaceReady = useWorkspaceStore((s) => s.ready);
  const cloudAccessIntent = useWorkspaceStore((s) => s.cloudAccessIntent);
  const bootstrapWorkspace = useWorkspaceStore((s) => s.bootstrap);
  const setWorkspaceKind = useWorkspaceStore((s) => s.setKind);
  const closeCloudAccess = useWorkspaceStore((s) => s.closeCloudAccess);
  const loadCustomNodes = useCustomNodeStore((s) => s.load);
  const customNodeLoadStatus = useCustomNodeStore((s) => s.loadStatus);
  const loadMcpConnections = useMcpConnectionStore((s) => s.load);
  const mcpConnectionLoadStatus = useMcpConnectionStore((s) => s.loadStatus);
  const [shareId, setShareId] = useState<string | null>(() =>
    new URLSearchParams(window.location.search).get("share"),
  );
  const [shareLoginRequested, setShareLoginRequested] = useState(false);
  const [canvasVisited, setCanvasVisited] = useState(false);
  const [nodeStudioVisited, setNodeStudioVisited] = useState(false);

  useEffect(() => {
    void bootstrapWorkspace();
    void bootstrapAuth();
    void loadCustomNodes();
    void loadMcpConnections();
  }, [bootstrapAuth, bootstrapWorkspace, loadCustomNodes, loadMcpConnections]);

  useEffect(() => {
    if (!workspaceReady || status === "loading") return;

    if (status === "unauthenticated" && workspaceKind === "cloud" && !cloudAccessIntent) {
      void setWorkspaceKind("local");
      return;
    }

    if (status === "authenticated" && cloudAccessIntent === "switch") {
      useCanvasStore.getState().reset();
      setMode("workbench");
      void setWorkspaceKind("cloud");
      return;
    }

    if (status === "authenticated" && cloudAccessIntent === "share") {
      closeCloudAccess();
    }
  }, [
    cloudAccessIntent,
    closeCloudAccess,
    setMode,
    setWorkspaceKind,
    status,
    workspaceKind,
    workspaceReady,
  ]);

  useEffect(() => {
    if (mode === "canvas") setCanvasVisited(true);
    if (mode === "nodes") setNodeStudioVisited(true);
  }, [mode]);

  useEffect(() => {
    const runtimeReady =
      (customNodeLoadStatus === "ready" || customNodeLoadStatus === "error") &&
      (mcpConnectionLoadStatus === "ready" || mcpConnectionLoadStatus === "error");
    if (!workspaceReady || !runtimeReady || workspaceKind !== "local") {
      localWorkflowScheduler.stop();
      return;
    }
    void localWorkflowScheduler.start();
    return () => localWorkflowScheduler.stop();
  }, [customNodeLoadStatus, mcpConnectionLoadStatus, workspaceKind, workspaceReady]);

  const showingSharedView = Boolean(
    shareId && !(shareLoginRequested && status !== "authenticated"),
  );

  function leaveSharedView() {
    removeShareQuery();
    setShareId(null);
    setShareLoginRequested(false);
    if (status === "authenticated") setMode("workbench");
  }

  function openCopiedWorkflow(workflowId: string) {
    removeShareQuery();
    setShareId(null);
    setShareLoginRequested(false);
    void setWorkspaceKind("cloud").then(() => {
      void workflowCommands.openWorkflow(workflowId);
      setMode("canvas");
    });
  }

  const recoveringWorkspace =
    !workspaceReady ||
    customNodeLoadStatus === "idle" ||
    customNodeLoadStatus === "loading" ||
    mcpConnectionLoadStatus === "idle" ||
    mcpConnectionLoadStatus === "loading" ||
    (workspaceKind === "cloud" && status !== "authenticated" && !cloudAccessIntent);
  const cloudLoginOpen = Boolean(
    cloudAccessIntent && status !== "authenticated",
  );

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        overflow: "hidden",
      }}
    >
      <TitleBar sharedView={showingSharedView} />
      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", position: "relative" }}>
        {recoveringWorkspace ? (
          <div
            className="app-loading-state"
            role="status"
            aria-live="polite"
          >
            <BrandMark size={36} />
            <strong>正在打开工作空间</strong>
            <span>正在恢复最近的工作流…</span>
            <span className="app-loading-track" aria-hidden="true">
              <span />
            </span>
          </div>
        ) : shareId && showingSharedView ? (
          <Suspense
            fallback={(
              <div className="app-loading-state" role="status">
                <BrandMark size={32} />
                <strong>正在打开共享工作流</strong>
                <span>正在加载只读画布…</span>
              </div>
            )}
          >
            <SharedWorkflowView
              shareId={shareId}
              authStatus={status}
              onRequestLogin={() => setShareLoginRequested(true)}
              onCopied={openCopiedWorkflow}
              onBack={leaveSharedView}
            />
          </Suspense>
        ) : shareLoginRequested && status !== "authenticated" ? (
          <LoginView onCancel={() => setShareLoginRequested(false)} />
        ) : (
          <>
            <main
              style={{
                flex: 1,
                minHeight: 0,
                display: "flex",
                position: "relative",
              }}
            >
              <div
                style={{
                  flex: 1,
                  minWidth: 0,
                  minHeight: 0,
                  position: "relative",
                }}
              >
                <div
                  className="app-view-layer"
                  data-app-view="workbench"
                  data-view-state={mode === "workbench" ? "active" : "inactive"}
                  aria-hidden={mode !== "workbench"}
                  style={viewLayerStyle(mode === "workbench")}
                >
                  <WorkbenchView
                    key={workspaceKind}
                    active={mode === "workbench"}
                  />
                </div>
                <div
                  className="app-view-layer"
                  data-app-view="canvas"
                  data-view-state={mode === "canvas" ? "active" : "inactive"}
                  aria-hidden={mode !== "canvas"}
                  style={viewLayerStyle(mode === "canvas")}
                >
                  {(canvasVisited || mode === "canvas") && (
                    <Suspense
                      fallback={(
                        <div className="app-loading-state" role="status">
                          <BrandMark size={32} />
                          <strong>正在打开画布</strong>
                          <span>正在加载画布与节点运行时…</span>
                        </div>
                      )}
                    >
                      <CanvasView
                        key={workspaceKind}
                        active={mode === "canvas"}
                      />
                    </Suspense>
                  )}
                </div>
                <div
                  className="app-view-layer"
                  data-app-view="nodes"
                  data-view-state={mode === "nodes" ? "active" : "inactive"}
                  aria-hidden={mode !== "nodes"}
                  style={viewLayerStyle(mode === "nodes")}
                >
                  {(nodeStudioVisited || mode === "nodes") && (
                    <Suspense
                      fallback={(
                        <div className="app-loading-state" role="status">
                          <BrandMark size={32} />
                          <strong>正在打开节点设计器</strong>
                          <span>正在加载你的节点规则与草案…</span>
                        </div>
                      )}
                    >
                      <NodeStudioView active={mode === "nodes"} />
                    </Suspense>
                  )}
                </div>
              </div>
              {status === "authenticated" && <AiConnectionDrawer />}
            </main>
            {mode === "canvas" && <StatusBar />}
          </>
        )}
        {cloudLoginOpen && !recoveringWorkspace && (
          <div
            className="cloud-login-layer"
            role="dialog"
            aria-modal="true"
            aria-label="登录云端空间"
          >
            <LoginView onCancel={closeCloudAccess} />
          </div>
        )}
      </div>
    </div>
  );
}

function viewLayerStyle(active: boolean): CSSProperties {
  return {
    position: "absolute",
    inset: 0,
    minWidth: 0,
    minHeight: 0,
    overflow: "hidden",
    opacity: active ? 1 : 0,
    transform: active ? "translate3d(0, 0, 0)" : "translate3d(8px, 0, 0)",
    pointerEvents: active ? "auto" : "none",
    zIndex: active ? 1 : 0,
  };
}

function removeShareQuery(): void {
  const url = new URL(window.location.href);
  url.searchParams.delete("share");
  window.history.replaceState(
    {},
    "",
    `${url.pathname}${url.search}${url.hash}`,
  );
}
