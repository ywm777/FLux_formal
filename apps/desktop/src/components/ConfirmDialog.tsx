import { useEffect, useRef, type CSSProperties } from "react";
import { Button } from "@flux/ui";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  busy?: boolean;
  error?: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  busy = false,
  error,
  onCancel,
  onConfirm,
}: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    previousFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    requestAnimationFrame(() => cancelRef.current?.focus());

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) {
        event.preventDefault();
        onCancel();
        return;
      }
      if (event.key === "Tab") {
        event.preventDefault();
        if (document.activeElement === cancelRef.current) confirmRef.current?.focus();
        else cancelRef.current?.focus();
      }
    }

    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      previousFocusRef.current?.focus();
    };
  }, [busy, onCancel, open]);

  if (!open) return null;

  return (
    <div
      role="presentation"
      className="confirm-dialog-overlay"
      style={overlayStyle}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onCancel();
      }}
    >
      <section
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-description"
        style={dialogStyle}
      >
        <h2 id="confirm-dialog-title" style={titleStyle}>{title}</h2>
        <p id="confirm-dialog-description" style={descriptionStyle}>{description}</p>
        {error ? <div role="alert" style={errorStyle}>{error}</div> : null}
        <div style={actionsStyle}>
          <Button ref={cancelRef} variant="ghost" disabled={busy} onClick={onCancel}>
            取消
          </Button>
          <Button ref={confirmRef} variant="danger" disabled={busy} onClick={onConfirm}>
            {busy ? "正在删除" : confirmLabel}
          </Button>
        </div>
      </section>
    </div>
  );
}

const overlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: "var(--z-modal)" as unknown as number,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "var(--space-5)",
  background: "var(--overlay-scrim)",
};

const dialogStyle: CSSProperties = {
  width: 420,
  maxWidth: "94vw",
  padding: "var(--space-5)",
  border: "1px solid var(--border-strong)",
  borderRadius: "var(--radius-lg)",
  background: "var(--bg-elevated)",
  boxShadow: "var(--shadow-command)",
};

const titleStyle: CSSProperties = { margin: 0, color: "var(--text-primary)", fontSize: "var(--text-lg)" };
const descriptionStyle: CSSProperties = { margin: "var(--space-2) 0 0", color: "var(--text-muted)", fontSize: "var(--text-sm)", lineHeight: 1.6 };
const errorStyle: CSSProperties = { marginTop: "var(--space-3)", padding: "var(--space-2) var(--space-3)", border: "1px solid var(--danger)", borderRadius: "var(--radius-sm)", background: "var(--danger-subtle)", color: "var(--danger)", fontSize: "var(--text-xs)" };
const actionsStyle: CSSProperties = { display: "flex", justifyContent: "flex-end", gap: "var(--space-2)", marginTop: "var(--space-5)" };
