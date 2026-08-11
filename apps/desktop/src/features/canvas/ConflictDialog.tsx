import { Button, Surface } from "@flux/ui";

export interface ConflictDialogProps {
  open: boolean;
  localVersion: number;
  remoteVersion: number;
  onKeepLocal: () => void;
  onUseRemote: () => void;
}

/** 乐观锁冲突解决：保留本地 / 使用云端 */
export function ConflictDialog({
  open,
  onKeepLocal,
  onUseRemote,
}: ConflictDialogProps) {
  if (!open) return null;
  return (
    <div
      className="conflict-dialog-overlay"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: "var(--z-modal)" as unknown as number,
        background: "var(--overlay-scrim)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Surface style={{ width: 400, padding: "var(--space-6)" }}>
        <h3 style={{ margin: "0 0 var(--space-3)" }}>版本冲突</h3>
        <p style={{ color: "var(--text-muted)", fontSize: "var(--text-md)" }}>
          本地修改与云端内容不一致。请选择要保留的内容。
        </p>
        <div style={{ display: "flex", gap: "var(--space-3)", marginTop: "var(--space-4)" }}>
          <Button variant="ghost" onClick={onKeepLocal} style={{ flex: 1 }}>
            保留本地
          </Button>
          <Button variant="primary" onClick={onUseRemote} style={{ flex: 1 }}>
            使用云端
          </Button>
        </div>
      </Surface>
    </div>
  );
}
