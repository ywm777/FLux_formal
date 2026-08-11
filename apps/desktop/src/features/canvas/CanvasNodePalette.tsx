import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import type { CommandItem } from "@flux/ui";

export interface CanvasNodePaletteProps {
  open: boolean;
  anchor: { x: number; y: number } | null;
  items: CommandItem[];
  onSelect: (item: CommandItem) => void;
  onClose: () => void;
}

const PALETTE_WIDTH = 280;
const PALETTE_HEIGHT = 320;
const VIEWPORT_MARGIN = 12;

function optionId(id: string): string {
  return `canvas-node-palette-option-${id.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

function matches(item: CommandItem, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  return [item.label, item.description, item.group, ...(item.keywords ?? [])]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .includes(q);
}

function clampPosition(anchor: { x: number; y: number }) {
  const maxX = Math.max(VIEWPORT_MARGIN, window.innerWidth - PALETTE_WIDTH - VIEWPORT_MARGIN);
  const maxY = Math.max(VIEWPORT_MARGIN, window.innerHeight - PALETTE_HEIGHT - VIEWPORT_MARGIN);
  return {
    x: Math.min(Math.max(anchor.x + 8, VIEWPORT_MARGIN), maxX),
    y: Math.min(Math.max(anchor.y + 8, VIEWPORT_MARGIN), maxY),
  };
}

export function CanvasNodePalette({
  open,
  anchor: suppliedAnchor,
  items,
  onSelect,
  onClose,
}: CanvasNodePaletteProps) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(
    () => items.filter((item) => matches(item, query)),
    [items, query],
  );
  const activeOptionId = filtered[active]
    ? optionId(filtered[active].id)
    : undefined;

  const anchor = suppliedAnchor ?? { x: window.innerWidth / 2 - 140, y: 88 };
  const position = useMemo(() => clampPosition(anchor), [anchor]);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActive(0);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (panelRef.current?.contains(event.target as Node)) return;
      onClose();
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open, onClose]);

  if (!open) return null;

  function commit(index: number) {
    const item = filtered[index];
    if (item) onSelect(item);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((index) => Math.min(index + 1, filtered.length - 1));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((index) => Math.max(index - 1, 0));
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      commit(active);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    }
  }

  return (
    <div
      ref={panelRef}
      className="canvas-node-palette"
      role="dialog"
      aria-label="添加节点"
      style={{
        position: "fixed",
        left: anchor.x,
        top: anchor.y,
        width: PALETTE_WIDTH,
        maxHeight: PALETTE_HEIGHT,
        zIndex: "var(--z-canvas-palette)" as unknown as number,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        border: "1px solid var(--border-subtle)",
        borderRadius: "var(--radius-md)",
        background: "var(--bg-elevated)",
        boxShadow: "var(--shadow-popover)",
        transform: `translate(${position.x - anchor.x}px, ${position.y - anchor.y}px)`,
      }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <input
        ref={inputRef}
        role="combobox"
        aria-label="搜索能力"
        aria-expanded={open}
        aria-controls="canvas-node-palette-list"
        aria-activedescendant={activeOptionId}
        aria-autocomplete="list"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={onKeyDown}
        placeholder="搜索能力"
        style={{
          width: "100%",
          height: 38,
          padding: "0 var(--space-3)",
          border: "none",
          borderBottom: "1px solid var(--border-subtle)",
          outline: "none",
          background: "var(--bg-inset)",
          color: "var(--text-primary)",
          fontSize: "var(--text-sm)",
          fontFamily: "var(--font-sans)",
        }}
      />
      <div
        id="canvas-node-palette-list"
        role="listbox"
        aria-label="能力列表"
        style={{ overflowY: "auto", padding: "var(--space-2)" }}
      >
        {filtered.length === 0 ? (
          <div
            style={{
              padding: "var(--space-4)",
              textAlign: "center",
              color: "var(--text-muted)",
              fontSize: "var(--text-sm)",
            }}
          >
            没有匹配的能力
          </div>
        ) : (
          filtered.map((item, index) => (
            <button
              key={item.id}
              id={optionId(item.id)}
              type="button"
              role="option"
              aria-selected={index === active}
              onMouseEnter={() => setActive(index)}
              onClick={() => commit(index)}
              style={{
                width: "100%",
                minHeight: 50,
                display: "grid",
                gridTemplateColumns: "8px minmax(0, 1fr)",
                alignItems: "center",
                gap: "var(--space-3)",
                padding: "var(--space-2) var(--space-3)",
                border: "none",
                borderRadius: "var(--radius-sm)",
                background: index === active ? "var(--accent-subtle)" : "transparent",
                color: "var(--text-primary)",
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 28,
                  borderRadius: "var(--radius-full)",
                  background: item.accent ?? "var(--carrier-basic)",
                }}
              />
              <span style={{ minWidth: 0 }}>
                <span
                  style={{
                    display: "block",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    fontSize: "var(--text-sm)",
                    fontWeight: 650,
                  }}
                >
                  {item.label}
                </span>
                <span
                  style={{
                    display: "block",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    color: "var(--text-muted)",
                    fontSize: "var(--text-xs)",
                  }}
                >
                  {item.group ? `${item.group} · ` : ""}
                  {item.description}
                </span>
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
