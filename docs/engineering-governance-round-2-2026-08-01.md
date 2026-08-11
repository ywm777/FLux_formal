# Flux 第二轮工程治理报告

日期：2026-08-01  
更新：2026-08-02  
基线：`engineering-architecture-review-2026-07-29.md` 之后的当前工作区  
范围：工作流运行时、执行持久化、副作用幂等协议、队列幂等、API 出站安全、API 入口保护、架构边界与回归门禁。

## 1. 本轮结论

第二轮没有重写现有分层，而是围绕第一轮暴露出的“状态增长后才出现”的问题加固关键不变量：

1. checkpoint 是可替换快照，不应与日志事件一样逐条排队。现在同一时刻最多一个 checkpoint 写入在途，期间只保留最新快照，终态前强制 flush。
2. 节点输出是执行引擎与持久化之间的正式契约。现在会校验声明端口、JSON 持久化形态和 1 MiB 大小上限，并在进入下游前规范化为真实 JSON 值。
3. 终态必须晚于所有增量持久化。API 会等待日志/节点通道和 checkpoint 通道全部收敛后再 finalize；TypeORM checkpoint 改为单列更新，避免 stale entity save 覆盖并发终态。
4. 同一个执行阶段不能重复入队。内存队列对活跃/等待任务去重，BullMQ 使用稳定 `jobId` 去重。
5. AI 上游响应不能无界进入内存。OpenAI-compatible 与 Ollama 响应均按流读取，默认上限 2 MiB，可配置但最大 16 MiB；重定向继续关闭，生产私网目标继续拒绝。
6. API 入口需要最低限度的滥用保护。新增全局固定窗口限流，认证端点、高成本 AI/执行端点、普通端点采用不同额度，桶数量有硬上限。
7. 取消、暂停和 worker 所有权进入持久化控制面。API 请求不再依赖命中持有 `AbortController` 的进程；worker 轮询 durable intent，并用带续租的单赢家 lease 防止重复投递并发执行。`pause` 现在保存未完成 checkpoint，可通过通用 resume 接口继续。
8. 外部副作用拥有稳定调用身份。运行时为每次 `NodeContext.invoke` 生成跨重试稳定的幂等键，通过 effect journal 在调用前记账、完成后保存结果；本地执行快照已持久化 journal，HTTP 与 MCP provider 会传播幂等键。
9. 云端具备 durable effect journal。PostgreSQL、文件仓储和内存仓储共享同一状态机；执行处理器按 execution ID 接入 journal，已完成结果可以跨 worker/进程恢复回放，迟到失败不能覆盖完成态，幂等键身份碰撞会被拒绝。

这些改动降低了长流程写放大、内存耗尽、重复队列任务、终态回退、跨 worker 控制失效和部分副作用重放的风险。系统仍未完成端到端 exactly-once：云端 transactional outbox、provider 幂等实现约束、节点版本锁和统一 Capability Provider Registry 仍是下一轮 P0/P1。

## 2. 架构复核结果

当前依赖方向总体健康：共享包未反向依赖应用层，工作流运行时不依赖 NestJS、Tauri、React、数据库或队列实现；API 控制器通过应用服务访问仓储；桌面 application/core 的既有边界合同通过。

本轮确认的主要架构债务：

| 优先级 | 问题 | 当前判断 |
| --- | --- | --- |
| P0 | 云端外部副作用缺少 dispatcher/transactional outbox | 运行时 effect contract、稳定幂等键、本地与云端 durable journal、HTTP/MCP 传播已完成；但当前 worker 仍同步调用 provider，“外部成功、完成记录未落盘”的窗口依赖 provider 去重，支付/消息群发类节点不能宣称 exactly-once |
| P1 | 跨 worker 控制仍以数据库轮询为可靠通道 | durable cancel/pause intent、可恢复 checkpoint 与 worker lease 已完成；规模化部署应增加 Redis pub/sub 快通道，降低每个活动 execution 的轮询负载 |
| P1 | 两个历史 HTTP 内置节点仍直接 `fetch` | 为兼容已保存 raw URL 工作流，本轮没有强制破坏迁移；新增外部能力必须走 `NodeContext.invoke`，下一步需提供图迁移器后清零允许名单 |
| P1 | 图中没有节点定义版本/能力 lockfile | 节点实现升级后旧图语义可能漂移；发布快照应锁定 definition version、placement 与 capability requirement |
| P1 | 默认文件数据库仍整库 JSON 写入 | 当前原子性已提高，但数据量上升后写延迟和锁竞争会恶化；默认运行库应迁移 SQLite，JSON 只做导入导出 |
| P1 | 限流是单实例内存桶 | 已形成安全下限，但多实例总配额、租户额度和成本预算仍需 Redis/网关统一实施 |
| P2 | checkpoint 构造仍会复制增长中的完整快照 | 本轮消除了落盘队列写放大和重复 clone；要消除 CPU O(N²) 复制，需要增量 execution event/checkpoint compaction，而不是降低崩溃恢复精度 |
| P2 | DAG 执行仍为串行 | 正确性清晰但独立网络分支吞吐较低；应在能力级并发舱壁和确定性日志顺序准备好后引入 ready-set 调度 |

## 3. 关键设计决策

### 3.1 checkpoint 最新值写入器

`LatestAsyncWriter<T>` 只适用于“新值完整替代旧值”的快照：

- 写入进行中时，多次 `push` 只保留最后一个值；
- 同时最多一个持久化 Promise；
- `flush` 必须等最新值完成；
- 任一写入失败后 fail-closed，后续 `push` 与 `flush` 都暴露同一失败；
- 日志和节点事件仍走有序 append/upsert 队列，不允许被合并。

这一区分把“事件”和“快照”从持久化语义上分开，避免用一条无限增长的 Promise 链处理两类数据。

### 3.2 节点输出契约

运行时现在在传播输出之前执行以下步骤：

1. 输出必须是端口对象；
2. 每个端口必须存在于当前节点定义；
3. 非有限数、BigInt、循环引用等不可持久化值失败；
4. 嵌套可选 `undefined` 字段按 JSON 语义省略，端口值本身不能消失；
5. 规范化后的完整输出不得超过 1 MiB；
6. 下游、运行记录与 checkpoint 共用规范化后的值。

这避免了“本次内存运行成功，但文件库/PostgreSQL 持久化后数据形态改变或失败”的分叉。

### 3.3 持久化终态屏障

API 的日志/节点写入和 checkpoint 写入可以并行，但 finalize 之前使用 `Promise.allSettled` 等待两条通道都结束，再统一传播失败。PostgreSQL checkpoint 使用 partial update，只修改 jsonb 列，不执行 read-modify-save。

因此，即使一条持久化通道失败，处理器也不会在另一条仍在途时写入终态；迟到的 checkpoint 也不能携带旧 entity 状态覆盖终态。

### 3.4 副作用调用身份与 effect journal

`NodeContext.invoke` 现在会收到包含 execution、node、attempt、调用序号和 idempotency key 的元数据。幂等键由执行 ID、图 ID/版本、节点 ID 与节点内调用序号稳定派生；节点重试时调用序号重新开始，因此同一条确定性调用会复用同一键。

运行时遵循以下协议：

1. provider 调用前通过 journal 写入 `pending`；
2. journal 已存在 `completed` 记录时直接回放结果，不再次触发外部调用；
3. provider 成功后记录 `completed` 和结果，失败时记录错误；
4. HTTP 使用 `Idempotency-Key`，HTTP MCP 同时使用 header 与 `_meta["flux/idempotencyKey"]`，STDIO MCP 使用 `_meta`；
5. 本地执行快照升级到 schema v3，恢复时连同 effect journal 一起加载；journal 不保存请求 payload，避免额外复制敏感输入。

该协议提供稳定身份和已完成结果回放，但不是单方面的 exactly-once 保证：若 provider 成功后 Flux 在完成记录落盘前崩溃，恢复时仍会再次发起带相同幂等键的调用。外部 provider 必须真正实现去重；云端还需要把 execution event、effect/outbox 与数据库状态提交纳入同一事务。节点内部若根据非确定条件改变调用顺序，也必须显式建模，而不能依赖调用序号。

### 3.5 云端 durable effect journal

云端新增 `execution_effects` 事实表，幂等键作为主键，并记录 execution、node、binding、action、attempt、调用序号、状态、结果和错误。请求 payload 有意不落库，避免复制连接参数与业务敏感数据。状态转换遵循：

- 首次 `begin` 原子插入 `pending`；相同键但不同调用身份立即失败；
- `completed` 只回放已持久化 JSON 结果，不再调用 provider；
- `pending/failed` 在崩溃恢复或节点重试时允许携带原键重新执行；
- `failed` 可以转回 `pending`，但 CAS 条件阻止它覆盖并发到达的 `completed`；
- 迟到的 `fail` 只能更新非完成态；错误截断为数据库契约允许的 1024 字符；
- provider 结果在写 journal 和交给节点前统一规范化为最大 1 MiB 的 JSON 值。

文件仓储同样持久化 effect，并通过“重新创建仓储实例”的测试验证进程重启回放。PostgreSQL 使用独立迁移 `ExecutionEffects1785456000000`、外键级联清理和 execution 索引。该表目前是 journal，不称为 outbox：真正的 outbox 还需要 provider dispatcher、effect claim/lease、重试调度和 execution event 同事务提交。

## 4. 安全与容量参数

| 参数 | 默认值 | 范围/说明 |
| --- | --- | --- |
| `AI_MAX_RESPONSE_BYTES` | 2 MiB | 1 KiB–16 MiB；同时校验 Content-Length 和 chunked 实际字节数 |
| `AUTH_RATE_LIMIT_PER_MINUTE` | 20 | 登录、注册、短信、微信、刷新令牌；每进程/客户端地址 |
| `EXPENSIVE_RATE_LIMIT_PER_MINUTE` | 60 | AI 与执行创建类请求 |
| `API_RATE_LIMIT_PER_MINUTE` | 300 | 其他 API 请求 |
| `EXEC_CONTROL_POLL_MS` | 250 ms | durable pause/terminate intent 的数据库观察间隔，限制 50–5000 ms |
| `EXEC_WORKER_LEASE_MS` | 30 s | worker 单赢家租约，限制 1–300 s，按约三分之一周期续租 |
| 节点输出 | 1 MiB | 运行时硬上限，进入下游与 checkpoint 前校验 |
| Capability 结果 | 1 MiB | 运行时硬上限，写 effect journal 与交给节点前规范化为 JSON |
| 限流桶 | 10,000 | 内存硬上限；过期清理，满时淘汰最旧桶 |

生产部署现在强制要求 `DATABASE_URL`，文件仓储只保留给单进程本地运行。反向代理后应确保应用看到可信的连接源地址；在多实例环境中，上述进程内限流只是第二道防线，第一道应由 API Gateway/Redis 提供租户级配额。

## 5. 已加入的回归门禁

- `LatestAsyncWriter`：覆盖合并最新快照、最终 flush、持久化失败传播。
- 节点输出：覆盖未声明端口、不可持久化端口值、嵌套可选字段规范化、超大输出拒绝。
- 执行队列：覆盖并发/容量与同执行重复入队。
- AI：覆盖生产私网拒绝、IPv4-mapped IPv6、禁止重定向、流式超大响应拒绝、凭证加密与真实 provider 响应。
- API 限流：覆盖认证额度耗尽返回 429、不同客户端隔离。
- 副作用 journal：覆盖 checkpoint 前崩溃后的已完成结果回放、journal 完成写入中断后的同键重试，以及本地快照恢复。
- 云端 durable journal：覆盖跨仓储实例回放、pending/failed 恢复、完成态单调性、身份碰撞拒绝、错误长度上限和迁移链注册。
- HTTP/MCP 传播：覆盖 `Idempotency-Key` 与 MCP `_meta`，Rust STDIO 测试覆盖 `_meta` 透传。
- 原有架构合同继续约束包方向、桌面 application/core、API controller/service/repository 和领域层网络全局对象。
- AI smoke 已从独立脚本并入 API `test:core`，限流 smoke 同样进入核心门禁。

## 6. 下一轮建议顺序

1. 建立云端 Capability Provider Registry 与授权解析，让所有新增外部调用统一经过 durable journal；迁移两个直接 `fetch` 的历史 HTTP 节点。
2. 在 journal 之上增加 effect claim/lease、dispatcher 与重试调度，再将 execution event/outbox 和执行状态纳入同一数据库事务。
3. 为持久化控制面增加 Redis pub/sub 快通道；数据库 intent 继续作为断线与重启后的可靠事实源。
4. 升级 workflow schema：记录 definition version、placement、capability lockfile，并提供节点迁移器。
5. 默认仓储迁移 SQLite，随后用 execution event 做 checkpoint compaction，解决剩余 CPU/存储增长问题。
6. 建立 100/500/2000 节点基准，再决定 ready-set 并发、画布 patch history 和大组件拆分的顺序。

## 7. 本轮验证

最终根级 `pnpm test:ci` 已通过，覆盖：

- 工作流运行时：13/13，覆盖控制暂停/恢复、副作用完成回放、模糊失败同键重试和 capability 结果持久化契约；
- API `test:core`：DTO、认证、AI、安全限流、队列、恢复、数据库、工作流、执行服务全部通过，12/12 真实节点场景通过；
- 桌面单元测试：76/76；本地执行恢复与 effect journal：3/3；
- 架构边界合同：通过。
- 桌面生产构建：通过，463 个模块；主 chunk 653.14 KiB（gzip 206.55 KiB），仍触发 500 KiB 预算告警；
- Tauri/Rust：4/4。

持续治理增量还覆盖：跨实例 pause/terminate、排队前取消、通用恢复 CAS、重复 worker 投递单赢家、租约过期接管、PostgreSQL 执行控制迁移、`execution_effects` 迁移，以及 HTTP/MCP 的副作用幂等元数据传播。

真实 PostgreSQL 迁移、Redis 多 worker、代理源地址和断电故障注入仍需要独立集成环境验证。桌面主 chunk 仍高于目标预算，后续应拆分节点 manifest/executor 与低频设置模块，而不是放宽构建告警。
