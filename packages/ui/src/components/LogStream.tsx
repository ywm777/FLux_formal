import { useEffect, useRef } from "react";

export interface LogEntry {
  nodeId?: string;
  level: "info" | "warn" | "error";
  message: string;
  at: string;
}

export interface LogStreamProps {
  entries: LogEntry[];
  /** 新记录到达时自动滚动到底部 */
  autoScroll?: boolean;
  emptyHint?: string;
}

const levelColor: Record<LogEntry["level"], string> = {
  info: "var(--text-muted)",
  warn: "var(--warning)",
  error: "var(--danger)",
};

function formatTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleTimeString();
}

export function LogStream({
  entries,
  autoScroll = true,
  emptyHint = "暂无运行记录",
}: LogStreamProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (autoScroll) bottomRef.current?.scrollIntoView({ block: "end" });
  }, [entries.length, autoScroll]);

  if (entries.length === 0) {
    return (
      <div
        style={{
          color: "var(--text-muted)",
          fontSize: "var(--text-sm)",
          padding: "var(--space-4)",
          textAlign: "center",
        }}
      >
        {emptyHint}
      </div>
    );
  }

  return (
    <div
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: "var(--text-base)",
        lineHeight: 1.6,
        background: "var(--bg-inset)",
        borderRadius: "var(--radius-md)",
        padding: "var(--space-3)",
        overflowY: "auto",
      }}
    >
      {entries.map((entry, index) => (
        <div
          key={index}
          style={{ display: "flex", gap: "var(--space-2)", whiteSpace: "pre-wrap" }}
        >
          <span style={{ color: "var(--text-disabled)", flexShrink: 0 }}>
            {formatTime(entry.at)}
          </span>
          {entry.nodeId ? (
            <span style={{ color: "var(--accent)", flexShrink: 0 }}>
              [{entry.nodeId}]
            </span>
          ) : null}
          <span style={{ color: levelColor[entry.level] }}>{entry.message}</span>
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
