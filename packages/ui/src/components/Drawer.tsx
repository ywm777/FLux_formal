import {
  useState,
  type CSSProperties,
  type HTMLAttributes,
  type ReactNode,
} from "react";

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  /** 宽度，默认 320（ui-spec §6） */
  width?: number;
  /** push：作为 flex 兄弟挤压画布；overlay：浮层覆盖 */
  variant?: "push" | "overlay";
  /** 默认 complementary；需要模态语义的 overlay 可显式传 dialog。 */
  role?: "complementary" | "dialog";
  ariaLabel?: string;
  ariaLabelledBy?: string;
  className?: string;
  children: ReactNode;
  footer?: ReactNode;
}

export function Drawer({
  open,
  onClose,
  title,
  width = 320,
  variant = "push",
  role = "complementary",
  ariaLabel,
  ariaLabelledBy,
  className,
  children,
  footer,
}: DrawerProps) {
  const [closeHover, setCloseHover] = useState(false);

  if (!open) return null;

  const panel: CSSProperties = {
    width,
    flexShrink: 0,
    height: "100%",
    display: "flex",
    flexDirection: "column",
    background: "var(--bg-surface)",
    borderLeft: "1px solid var(--border-subtle)",
    ...(variant === "overlay"
      ? {
          position: "absolute",
          top: 0,
          right: 0,
          zIndex: "var(--z-drawer)" as unknown as number,
          boxShadow: "var(--shadow-drawer)",
        }
      : {}),
  };

  return (
    <aside
      style={panel}
      role={role as HTMLAttributes<HTMLElement>["role"]}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
      aria-modal={role === "dialog" && variant === "overlay" ? true : undefined}
      className={className}
    >
      <header
        style={{
          height: 44,
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 var(--space-3) 0 var(--space-4)",
          borderBottom: "1px solid var(--border-subtle)",
        }}
      >
        <span style={{ fontSize: "var(--text-md)", fontWeight: 600 }}>
          {title}
        </span>
        <button
          type="button"
          onClick={onClose}
          onMouseEnter={() => setCloseHover(true)}
          onMouseLeave={() => setCloseHover(false)}
          aria-label="关闭"
          title="关闭"
          style={closeButtonStyle(closeHover)}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 16 16"
            aria-hidden="true"
            focusable="false"
          >
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
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          padding: "var(--space-4)",
        }}
      >
        {children}
      </div>
      {footer ? (
        <footer
          style={{
            flexShrink: 0,
            padding: "var(--space-3) var(--space-4)",
            borderTop: "1px solid var(--border-subtle)",
          }}
        >
          {footer}
        </footer>
      ) : null}
    </aside>
  );
}

function closeButtonStyle(hover: boolean): CSSProperties {
  return {
    width: 28,
    height: 28,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 0,
    border: "none",
    borderRadius: "var(--radius-sm)",
    background: hover ? "var(--bg-inset)" : "transparent",
    color: hover ? "var(--text-primary)" : "var(--text-muted)",
    cursor: "pointer",
    transition: "background var(--motion-fast) var(--ease-standard), color var(--motion-fast) var(--ease-standard)",
  };
}
