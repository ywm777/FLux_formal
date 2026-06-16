import { useAppStore, type AppMode } from "../store/appStore.js";

const MODES: { key: AppMode; label: string }[] = [
  { key: "canvas", label: "画布" },
  { key: "tasks", label: "任务" },
];

export function TopBar() {
  const mode = useAppStore((s) => s.mode);
  const setMode = useAppStore((s) => s.setMode);

  return (
    <header
      style={{
        height: 48,
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        gap: "var(--space-4)",
        padding: "0 var(--space-4)",
        background: "var(--bg-surface)",
        borderBottom: "1px solid var(--border-subtle)",
      }}
    >
      <strong style={{ fontSize: "var(--text-lg)", letterSpacing: 0.5 }}>
        Flux
      </strong>
      <nav
        style={{
          display: "flex",
          gap: "var(--space-1)",
          background: "var(--bg-inset)",
          borderRadius: "var(--radius-md)",
          padding: 2,
        }}
      >
        {MODES.map((m) => (
          <button
            key={m.key}
            onClick={() => setMode(m.key)}
            style={{
              padding: "var(--space-1) var(--space-3)",
              fontSize: "var(--text-md)",
              border: "none",
              borderRadius: "var(--radius-sm)",
              cursor: "pointer",
              background:
                mode === m.key ? "var(--accent-subtle)" : "transparent",
              color: mode === m.key ? "var(--accent)" : "var(--text-muted)",
            }}
          >
            {m.label}
          </button>
        ))}
      </nav>
      <div style={{ flex: 1 }} />
      <span style={{ color: "var(--text-muted)", fontSize: "var(--text-sm)" }}>
        已同步
      </span>
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: "var(--radius-full)",
          background: "var(--bg-elevated)",
        }}
      />
    </header>
  );
}
