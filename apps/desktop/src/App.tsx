import { useEffect, useState, type CSSProperties } from "react";
import { useAppStore } from "./store/appStore.js";
import { useAuthStore } from "./store/authStore.js";
import { TitleBar } from "./components/TitleBar.js";
import { StatusBar } from "./components/StatusBar.js";
import { CanvasView } from "./features/canvas/CanvasView.js";
import { WorkbenchView } from "./features/workbench/WorkbenchView.js";
import { LoginView } from "./features/auth/LoginView.js";
import { BrandMark } from "./components/BrandMark.js";
import { AiConnectionDrawer } from "./features/ai/AiConnectionDrawer.js";
import { SharedWorkflowView } from "./features/sharing/SharedWorkflowView.js";
import { useCanvasStore } from "./store/canvasStore.js";
import { useWorkspaceStore } from "./store/workspaceStore.js";
import { useWorkflowCommands } from "./app/WorkflowCommandProvider.js";

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
  const [shareId, setShareId] = useState<string | null>(() =>
    new URLSearchParams(window.location.search).get("share"),
  );
  const [shareLoginRequested, setShareLoginRequested] = useState(false);

  useEffect(() => {
    void bootstrapWorkspace();
    void bootstrapAuth();
  }, [bootstrapAuth, bootstrapWorkspace]);

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
          <SharedWorkflowView
            shareId={shareId}
            authStatus={status}
            onRequestLogin={() => setShareLoginRequested(true)}
            onCopied={openCopiedWorkflow}
            onBack={leaveSharedView}
          />
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
                  data-app-view="workbench"
                  aria-hidden={mode !== "workbench"}
                  style={viewLayerStyle(mode === "workbench")}
                >
                  <WorkbenchView
                    key={workspaceKind}
                    active={mode === "workbench"}
                  />
                </div>
                <div
                  data-app-view="canvas"
                  aria-hidden={mode !== "canvas"}
                  style={viewLayerStyle(mode === "canvas")}
                >
                  <CanvasView
                    key={workspaceKind}
                    active={mode === "canvas"}
                  />
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
