import { useEffect, useMemo, useRef, useState } from "react";
import { Button, Input } from "@flux/ui";
import type { WorkflowShareInfo } from "@flux/shared";
import { formatProductErrorMessage } from "../../lib/productError.js";
import { useWorkspaceStore } from "../../store/workspaceStore.js";
import { useAuthStore } from "../../store/authStore.js";
import { useSharingService } from "../../app/WorkspaceServiceProvider.js";

interface ShareWorkflowDialogProps {
  open: boolean;
  workflowId: string | null;
  workflowTitle: string;
  onClose: () => void;
  onChanged?: () => void;
}

export function ShareWorkflowDialog({
  open,
  workflowId,
  workflowTitle,
  onClose,
  onChanged,
}: ShareWorkflowDialogProps) {
  const [share, setShare] = useState<WorkflowShareInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [working, setWorking] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cloudWorkflowId, setCloudWorkflowId] = useState<string | null>(null);
  const workspaceKind = useWorkspaceStore((state) => state.kind);
  const requestCloudAccess = useWorkspaceStore((state) => state.requestCloudAccess);
  const authStatus = useAuthStore((state) => state.status);
  const sharingService = useSharingService();
  const dialogRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const workingRef = useRef(false);
  const shareUrl = useMemo(
    () => (share ? buildShareUrl(share.shareId) : ""),
    [share],
  );

  useEffect(() => {
    workingRef.current = working;
  }, [working]);

  useEffect(() => {
    if (!open || !workflowId) return;
    if (workspaceKind === "local") {
      setLoading(false);
      setShare(null);
      setCloudWorkflowId(null);
      setError(null);
      setCopied(false);
      setConfirmRevoke(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setShare(null);
    setError(null);
    setCopied(false);
    setConfirmRevoke(false);
    void sharingService
      .getShare(workflowId)
      .then((result) => {
        if (!cancelled) setShare(result);
      })
      .catch((reason) => {
        if (!cancelled) {
          setError(formatProductErrorMessage(reason, "读取分享状态失败"));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, sharingService, workflowId, workspaceKind]);

  useEffect(() => {
    if (!open) return;
    previousFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    requestAnimationFrame(() => closeRef.current?.focus());

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !workingRef.current) {
        event.preventDefault();
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled), [href], [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      previousFocusRef.current?.focus();
    };
  }, [onClose, open]);

  if (!open || !workflowId) return null;

  async function enableShare() {
    if (!workflowId) return;
    if (workspaceKind === "local" && authStatus !== "authenticated") {
      requestCloudAccess("share");
      return;
    }
    setWorking(true);
    setError(null);
    try {
      const result = await sharingService.enableShare(workflowId, workspaceKind);
      setCloudWorkflowId(result.cloudWorkflowId);
      setShare(result.share);
      onChanged?.();
    } catch (reason) {
      setError(formatProductErrorMessage(reason, "创建分享链接失败"));
    } finally {
      setWorking(false);
    }
  }

  async function exportLocalCopy() {
    if (!workflowId) return;
    setError(null);
    try {
      await sharingService.exportWorkflow(workflowId);
    } catch (reason) {
      setError(formatProductErrorMessage(reason, "导出工作流失败"));
    }
  }

  async function copyLink() {
    if (!shareUrl) return;
    setError(null);
    try {
      await copyText(shareUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch (reason) {
      setError(formatProductErrorMessage(reason, "复制链接失败"));
    }
  }

  async function revokeShare() {
    const shareWorkflowId = cloudWorkflowId ?? workflowId;
    if (!shareWorkflowId) return;
    if (!confirmRevoke) {
      setConfirmRevoke(true);
      return;
    }
    setWorking(true);
    setError(null);
    try {
      await sharingService.disableShare(shareWorkflowId);
      setShare(null);
      setConfirmRevoke(false);
      setCopied(false);
      onChanged?.();
    } catch (reason) {
      setError(formatProductErrorMessage(reason, "停止分享失败"));
    } finally {
      setWorking(false);
    }
  }

  return (
    <div
      className="share-workflow-overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !working) onClose();
      }}
    >
      <section
        ref={dialogRef}
        className="share-workflow-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-workflow-title"
      >
        <header className="share-workflow-header">
          <div>
            <h2 id="share-workflow-title">分享工作流</h2>
            <span>{workflowTitle}</span>
          </div>
          <button
            ref={closeRef}
            type="button"
            className="share-workflow-close"
            aria-label="关闭分享"
            title="关闭"
            disabled={working}
            onClick={onClose}
          >
            <CloseIcon />
          </button>
        </header>

        <div className="share-workflow-content">
          {loading ? (
            <div className="share-workflow-loading" role="status">
              <span />
              正在读取分享状态
            </div>
          ) : share ? (
            <>
              <div className="share-workflow-state" data-active="true">
                <span aria-hidden="true" />
                链接分享已开启
              </div>
              <div className="share-workflow-link-row">
                <Input
                  aria-label="分享链接"
                  readOnly
                  value={shareUrl}
                  onFocus={(event) => event.currentTarget.select()}
                />
                <button
                  type="button"
                  className="share-workflow-copy"
                  onClick={() => void copyLink()}
                >
                  <CopyIcon />
                  {copied ? "已复制" : "复制链接"}
                </button>
              </div>
              <div className="share-workflow-actions-row">
                <a
                  href={shareUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="share-workflow-open"
                >
                  <ExternalIcon />
                  打开预览
                </a>
                <button
                  type="button"
                  className={confirmRevoke ? "share-workflow-revoke is-confirming" : "share-workflow-revoke"}
                  disabled={working}
                  onClick={() => void revokeShare()}
                >
                  {working
                    ? "正在停止"
                    : confirmRevoke
                      ? "再次点击停止分享"
                      : "停止分享"}
                </button>
                {workspaceKind === "local" && (
                  <button
                    type="button"
                    className="share-workflow-open"
                    onClick={() => void exportLocalCopy()}
                  >
                    导出 .flux
                  </button>
                )}
              </div>
              {confirmRevoke && (
                <p className="share-workflow-warning" role="status">
                  停止后，已经发出的链接将立即失效。
                </p>
              )}
            </>
          ) : (
            <div className="share-workflow-empty">
              <span className="share-workflow-empty-icon" aria-hidden="true">
                <LinkIcon />
              </span>
              <strong>{workspaceKind === "local" ? "分享本地工作流" : "创建只读分享链接"}</strong>
              {workspaceKind === "cloud" && (
                <p>获得链接的人可以查看流程，并复制一份到自己的工作台。</p>
              )}
              <div className="share-workflow-actions-row">
                {workspaceKind === "local" && (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => void exportLocalCopy()}
                  >
                    导出 .flux
                  </Button>
                )}
                <Button
                  type="button"
                  disabled={working}
                  onClick={() => void enableShare()}
                >
                  {working
                    ? "正在创建"
                    : workspaceKind === "local" && authStatus !== "authenticated"
                      ? "登录后在线分享"
                      : "创建分享链接"}
                </Button>
              </div>
            </div>
          )}

          {error && (
            <div className="share-workflow-error" role="alert">
              {error}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function buildShareUrl(shareId: string): string {
  const configured = (import.meta.env.VITE_PUBLIC_APP_URL as string | undefined)?.trim();
  const url = new URL(configured || window.location.origin);
  url.pathname = "/";
  url.search = "";
  url.hash = "";
  url.searchParams.set("share", shareId);
  return url.toString();
}

async function copyText(value: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) throw new Error("浏览器未允许复制");
}

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5" />
    </svg>
  );
}

function LinkIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M9.5 14.5 14.5 9.5M8 17H6.5a4.5 4.5 0 0 1 0-9H10m4 0h3.5a4.5 4.5 0 0 1 0 9H14" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.6" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
      <rect x="5" y="5" width="8" height="8" rx="1.4" fill="none" stroke="currentColor" strokeWidth="1.25" />
      <path d="M3 10.5V4.4C3 3.6 3.6 3 4.4 3h6.1" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.25" />
    </svg>
  );
}

function ExternalIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M8.5 3H13v4.5M12.7 3.3 7.4 8.6M7 4H4.5C3.7 4 3 4.7 3 5.5v6c0 .8.7 1.5 1.5 1.5h6c.8 0 1.5-.7 1.5-1.5V9" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.3" />
    </svg>
  );
}
