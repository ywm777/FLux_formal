import { useEffect, useRef, useState, type ReactNode } from "react";

export interface ContextMenuItem {
  label: string;
  onClick: () => void;
  icon?: ReactNode;
  danger?: boolean;
  disabled?: boolean;
}

export interface ContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
  ariaLabel?: string;
}

const MENU_WIDTH = 176;

export function ContextMenu({ x, y, items, onClose, ariaLabel = "操作菜单" }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    requestAnimationFrame(() => {
      ref.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
    });
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  // 防溢出修正
  const left = Math.min(x, window.innerWidth - MENU_WIDTH - 8);
  const top = Math.min(y, window.innerHeight - items.length * 34 - 16);

  return (
    <div
      ref={ref}
      className="canvas-context-menu"
      role="menu"
      aria-label={ariaLabel}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={(event) => {
        const buttons = Array.from(
          ref.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? [],
        );
        const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          const offset = event.key === "ArrowDown" ? 1 : -1;
          buttons[(current + offset + buttons.length) % buttons.length]?.focus();
        }
        if (event.key === "Home" || event.key === "End") {
          event.preventDefault();
          buttons[event.key === "Home" ? 0 : buttons.length - 1]?.focus();
        }
      }}
      style={{
        position: "fixed",
        left: Math.max(8, left),
        top: Math.max(8, top),
        zIndex: "var(--z-context-menu)" as unknown as number,
        width: MENU_WIDTH,
        padding: 4,
        background: "var(--bg-elevated)",
        border: "1px solid var(--border-subtle)",
        borderRadius: "var(--radius-md)",
        boxShadow: "var(--shadow-popover)",
      }}
    >
      {items.map((item, i) => (
        <MenuRow key={i} item={item} onClose={onClose} />
      ))}
    </div>
  );
}

function MenuRow({
  item,
  onClose,
}: {
  item: ContextMenuItem;
  onClose: () => void;
}) {
  const [hover, setHover] = useState(false);
  const color = item.danger ? "var(--danger)" : "var(--text-primary)";
  return (
    <button
      type="button"
      role="menuitem"
      disabled={item.disabled}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={() => {
        if (item.disabled) return;
        item.onClick();
        onClose();
      }}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "var(--space-2)",
        width: "100%",
        padding: "var(--space-2) var(--space-3)",
        border: "none",
        borderRadius: "var(--radius-sm)",
        background:
          hover && !item.disabled
            ? item.danger
              ? "var(--danger-subtle)"
              : "var(--bg-inset)"
            : "transparent",
        color: item.disabled ? "var(--text-disabled)" : color,
        fontSize: "var(--text-sm)",
        textAlign: "left",
        cursor: item.disabled ? "not-allowed" : "pointer",
      }}
    >
      {item.icon ? <span aria-hidden style={menuIconStyle}>{item.icon}</span> : null}
      <span>{item.label}</span>
    </button>
  );
}

const menuIconStyle: React.CSSProperties = {
  width: 16,
  height: 16,
  flexShrink: 0,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
};
