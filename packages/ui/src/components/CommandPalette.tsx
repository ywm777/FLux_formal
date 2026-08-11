import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";

export interface CommandItem {
  id: string;
  label: string;
  description?: string;
  group?: string;
  keywords?: string[];
  /** 左侧色条/图标色 */
  accent?: string;
  /** 可选的快捷键提示，仅用于展示（如 Ctrl+K） */
  shortcut?: string;
}

export interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  items: CommandItem[];
  onSelect: (item: CommandItem) => void;
  placeholder?: string;
}

function matches(item: CommandItem, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  const haystack = [item.label, item.description, item.group, ...(item.keywords ?? [])]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(q);
}

function optionId(id: string): string {
  return `command-palette-option-${id.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

export function CommandPalette({
  open,
  onClose,
  items,
  onSelect,
  placeholder = "搜索能力或命令…",
}: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(
    () => items.filter((item) => matches(item, query)),
    [items, query],
  );
  const activeOptionId = filtered[active]
    ? optionId(filtered[active].id)
    : undefined;

  useEffect(() => {
    if (open) {
      setQuery("");
      setActive(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  if (!open) return null;

  function commit(index: number) {
    const item = filtered[index];
    if (item) {
      onSelect(item);
      onClose();
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((i) => Math.min(i + 1, filtered.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      commit(active);
    } else if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    }
  }

  return (
    <div
      onMouseDown={onClose}
      role="dialog"
      aria-label="命令面板"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: "var(--z-command-palette)" as unknown as number,
        background: "var(--overlay-scrim)",
        display: "flex",
        justifyContent: "center",
        alignItems: "flex-start",
        paddingTop: "12vh",
      }}
    >
      <div
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          width: 520,
          maxWidth: "90vw",
          background: "var(--bg-elevated)",
          border: "1px solid var(--border-strong)",
          borderRadius: "var(--radius-lg)",
          boxShadow: "var(--shadow-command)",
          overflow: "hidden",
        }}
      >
        <input
          ref={inputRef}
          role="combobox"
          aria-label="搜索命令"
          aria-expanded={open}
          aria-controls="command-palette-list"
          aria-activedescendant={activeOptionId}
          aria-autocomplete="list"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          style={{
            width: "100%",
            boxSizing: "border-box",
            padding: "var(--space-4)",
            fontSize: "var(--text-lg)",
            background: "transparent",
            border: "none",
            borderBottom: "1px solid var(--border-subtle)",
            color: "var(--text-primary)",
            outline: "none",
            fontFamily: "var(--font-sans)",
          }}
        />
        <div
          id="command-palette-list"
          role="listbox"
          aria-label="命令结果"
          style={{ maxHeight: 360, overflowY: "auto", padding: "var(--space-2)" }}
        >
          {filtered.length === 0 ? (
            <div
              style={{
                padding: "var(--space-4)",
                color: "var(--text-muted)",
                fontSize: "var(--text-sm)",
                textAlign: "center",
              }}
            >
              无匹配项
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
                  display: "flex",
                  alignItems: "center",
                  gap: "var(--space-3)",
                  width: "100%",
                  textAlign: "left",
                  border: "none",
                  cursor: "pointer",
                  borderRadius: "var(--radius-md)",
                  padding: "var(--space-2) var(--space-3)",
                  background:
                    index === active ? "var(--accent-subtle)" : "transparent",
                  color: "var(--text-primary)",
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "var(--radius-full)",
                    flexShrink: 0,
                    background: item.accent ?? "var(--carrier-basic)",
                  }}
                />
                <span style={{ display: "flex", flexDirection: "column" }}>
                  <span style={{ fontSize: "var(--text-md)" }}>{item.label}</span>
                  {item.description ? (
                    <span
                      style={{
                        fontSize: "var(--text-xs)",
                        color: "var(--text-muted)",
                      }}
                    >
                      {item.description}
                    </span>
                  ) : null}
                </span>
                <span
                  style={{
                    marginLeft: "auto",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "var(--space-2)",
                    flexShrink: 0,
                  }}
                >
                  {item.shortcut ? (
                    <kbd
                      aria-label={`快捷键 ${item.shortcut}`}
                      style={{
                        minWidth: 24,
                        height: 22,
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        padding: "0 6px",
                        border: "1px solid var(--border-strong)",
                        borderRadius: "var(--radius-sm)",
                        background: "var(--bg-inset)",
                        color: "var(--text-secondary)",
                        fontFamily: "var(--font-mono)",
                        fontSize: "var(--text-xs)",
                      }}
                    >
                      {item.shortcut}
                    </kbd>
                  ) : null}
                  {item.group ? (
                    <span
                      style={{
                        fontSize: "var(--text-xs)",
                        color: "var(--text-disabled)",
                      }}
                    >
                      {item.group}
                    </span>
                  ) : null}
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
