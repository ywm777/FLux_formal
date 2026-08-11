import { useEffect, useMemo, useRef, type CSSProperties } from "react";
import type { AppMode } from "../store/appStore.js";
import {
  SHORTCUTS,
  SHORTCUT_SCOPE_LABELS,
  shortcutSequences,
  type ShortcutScope,
} from "../lib/keyboardShortcuts.js";

interface KeyboardShortcutsDialogProps {
  open: boolean;
  activeMode: AppMode;
  onClose: () => void;
}

const SCOPE_ORDER: ShortcutScope[] = ["global", "workbench", "canvas"];

export function KeyboardShortcutsDialog({
  open,
  activeMode,
  onClose,
}: KeyboardShortcutsDialogProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const groups = useMemo(
    () => SCOPE_ORDER.map((scope) => ({
      scope,
      items: SHORTCUTS.filter((shortcut) => shortcut.scope === scope),
    })),
    [],
  );

  useEffect(() => {
    if (!open) return;
    previousFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    requestAnimationFrame(() => closeRef.current?.focus());

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key === "Tab") {
        event.preventDefault();
        closeRef.current?.focus();
      }
    }

    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      previousFocusRef.current?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="presentation"
      className="keyboard-shortcuts-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      style={overlayStyle}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="keyboard-shortcuts-title"
        aria-describedby="keyboard-shortcuts-description"
        className="keyboard-shortcuts-dialog"
        style={dialogStyle}
      >
        <header style={headerStyle}>
          <div style={{ minWidth: 0 }}>
            <h2 id="keyboard-shortcuts-title" style={titleStyle}>键盘快捷键</h2>
            <p id="keyboard-shortcuts-description" style={descriptionStyle}>
              输入文本时，单字母与画布操作会自动停用，避免误触。
            </p>
          </div>
          <button
            ref={closeRef}
            type="button"
            aria-label="关闭快捷键面板"
            title="关闭 (Esc)"
            onClick={onClose}
            style={closeButtonStyle}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
              <path
                d="M4 4l8 8M12 4l-8 8"
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeWidth="1.5"
              />
            </svg>
          </button>
        </header>

        <div style={contentStyle}>
          {groups.map(({ scope, items }) => {
            const active = scope === "global" || scope === activeMode;
            return (
              <section key={scope} aria-labelledby={`shortcut-scope-${scope}`} style={groupStyle}>
                <div style={groupHeaderStyle}>
                  <h3 id={`shortcut-scope-${scope}`} style={groupTitleStyle}>
                    {SHORTCUT_SCOPE_LABELS[scope]}
                  </h3>
                  {active && <span style={activeBadgeStyle}>{scope === "global" ? "始终可用" : "当前页面"}</span>}
                </div>
                <div style={listStyle}>
                  {items.map((item) => (
                    <div key={item.id} style={rowStyle}>
                      <span style={labelStyle}>{item.label}</span>
                      <span aria-label={shortcutSequences(item.id).map((keys) => keys.join("加")).join(" 或 ")} style={bindingsStyle}>
                        {shortcutSequences(item.id).map((keys, bindingIndex) => (
                          <span key={`${item.id}-${bindingIndex}`} style={bindingStyle}>
                            {bindingIndex > 0 && <span aria-hidden="true" style={orStyle}>或</span>}
                            {keys.map((key) => <kbd key={key} style={keyStyle}>{key}</kbd>)}
                          </span>
                        ))}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </section>
    </div>
  );
}

const overlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: "var(--z-command-palette)" as unknown as number,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "var(--space-5)",
  background: "var(--overlay-scrim)",
};

const dialogStyle: CSSProperties = {
  width: 700,
  maxWidth: "94vw",
  maxHeight: "84vh",
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
  border: "1px solid var(--border-strong)",
  borderRadius: "var(--radius-lg)",
  background: "var(--bg-elevated)",
  boxShadow: "var(--shadow-command)",
};

const headerStyle: CSSProperties = {
  minHeight: 72,
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: "var(--space-4)",
  padding: "var(--space-4) var(--space-5)",
  borderBottom: "1px solid var(--border-subtle)",
};

const titleStyle: CSSProperties = { margin: 0, fontSize: "var(--text-lg)", fontWeight: 700 };
const descriptionStyle: CSSProperties = { margin: "var(--space-1) 0 0", color: "var(--text-muted)", fontSize: "var(--text-sm)" };
const closeButtonStyle: CSSProperties = {
  width: 30,
  height: 30,
  flexShrink: 0,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  border: "1px solid var(--border-subtle)",
  borderRadius: "var(--radius-md)",
  background: "var(--bg-inset)",
  color: "var(--text-muted)",
  cursor: "pointer",
};
const contentStyle: CSSProperties = { overflowY: "auto", padding: "var(--space-4) var(--space-5) var(--space-5)" };
const groupStyle: CSSProperties = { marginBottom: "var(--space-5)" };
const groupHeaderStyle: CSSProperties = { display: "flex", alignItems: "center", gap: "var(--space-2)", marginBottom: "var(--space-2)" };
const groupTitleStyle: CSSProperties = { margin: 0, color: "var(--text-primary)", fontSize: "var(--text-sm)", fontWeight: 700 };
const activeBadgeStyle: CSSProperties = { padding: "2px 6px", borderRadius: "var(--radius-full)", background: "var(--accent-subtle)", color: "var(--accent)", fontSize: 10, fontWeight: 700 };
const listStyle: CSSProperties = { overflow: "hidden", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)", background: "var(--bg-surface)" };
const rowStyle: CSSProperties = { minHeight: 42, display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--space-4)", padding: "var(--space-2) var(--space-3)", borderBottom: "1px solid var(--border-subtle)" };
const labelStyle: CSSProperties = { color: "var(--text-secondary)", fontSize: "var(--text-sm)" };
const bindingsStyle: CSSProperties = { display: "flex", alignItems: "center", gap: "var(--space-2)", flexWrap: "wrap", justifyContent: "flex-end" };
const bindingStyle: CSSProperties = { display: "inline-flex", alignItems: "center", gap: 4 };
const orStyle: CSSProperties = { marginRight: 2, color: "var(--text-disabled)", fontSize: "var(--text-xs)" };
const keyStyle: CSSProperties = {
  minWidth: 26,
  height: 24,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "0 7px",
  border: "1px solid var(--border-strong)",
  borderBottomWidth: 2,
  borderRadius: "var(--radius-sm)",
  background: "var(--bg-inset)",
  color: "var(--text-primary)",
  fontFamily: "var(--font-mono)",
  fontSize: "var(--text-xs)",
  fontWeight: 650,
  lineHeight: 1,
};
