# Flux 同步协议（Phase 4）

## 概述

桌面端与云端通过 REST API 同步工作流草稿。离线时使用本地队列缓存 PATCH 操作，恢复网络后增量推送。

## 乐观锁

- 每次 `PATCH /workflows/:id` 可携带 `expectedVersion`
- 服务端 version 不匹配时返回 `409 Conflict`，客户端展示冲突 UI
- 响应包含稳定错误码 `WORKFLOW_VERSION_CONFLICT`、`currentVersion` 与 `expectedVersion`

## 离线队列

```typescript
interface PendingSyncOp {
  id: string;
  workflowId: string;
  patch: { title?: string; graph?: unknown; expectedVersion?: number };
  localVersion: number;
  createdAt: string;
}
```

实现：`apps/desktop/src/lib/syncAgent.ts`（localStorage；Tauri 可替换为 SQLite）

## 冲突解决

1. 检测到 `409` 且错误码为 `WORKFLOW_VERSION_CONFLICT`
2. 用户选择「保留本地」→ 使用服务端返回的 `currentVersion` 作为下一次 PATCH 的 `expectedVersion`
3. 用户选择「使用云端」→ GET 拉取最新 graph 覆盖本地

「保留本地」仍使用 compare-and-swap，不会通过省略 `expectedVersion` 绕过并发保护；若重试期间再次发生更新，服务端会返回新的 409。

## .flux 包格式

```json
{
  "version": 1,
  "exportedAt": "2026-06-16T00:00:00.000Z",
  "workflow": { /* WorkflowGraph */ }
}
```

导出/导入：`exportFluxPack` / `importFluxPack` in `syncAgent.ts`
