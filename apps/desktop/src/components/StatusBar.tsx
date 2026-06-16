export function StatusBar() {
  return (
    <footer
      style={{
        height: 28,
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        gap: "var(--space-4)",
        padding: "0 var(--space-4)",
        background: "var(--bg-surface)",
        borderTop: "1px solid var(--border-subtle)",
        color: "var(--text-muted)",
        fontSize: "var(--text-xs)",
      }}
    >
      <span>已保存</span>
      <span>缩放 100%</span>
    </footer>
  );
}
