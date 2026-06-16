# Flux 无界工作流

极简界面承载无限业务，万能节点打通全场景办公生态的桌面端无界工作流平台。

- **形态**：Windows 桌面客户端（Tauri 2 + React）+ 官方 SaaS 云端（NestJS）
- **核心**：无界画布（创作层）/ 万能节点（可承载万物的容器）/ 任务管理（执行层）/ 账户资产
- 详见 [`docs/prd.md`](docs/prd.md)（产品需求）与 [`docs/ui-spec.md`](docs/ui-spec.md)（UI 规范）

## 仓库结构（pnpm monorepo）

```
Flux/
├── apps/
│   ├── desktop/          # Tauri 壳（src-tauri/）+ React/Vite 渲染进程
│   └── api/              # NestJS 云端 API
├── packages/
│   ├── shared/           # 通用类型、常量、工具
│   ├── workflow-schema/  # WorkflowGraph JSON Schema 与校验
│   ├── node-sdk/         # 万能节点定义 SDK + 内置节点
│   ├── canvas-core/      # 画布视口与序列化核心
│   └── ui/               # 极简设计系统（令牌 + 组件）
└── docs/                 # 产品 / UI / 技术文档
```

## 开发环境

| 工具 | 版本 |
|------|------|
| Node.js | ≥ 20（推荐 24） |
| pnpm | ≥ 10 |
| Rust | ≥ 1.77（Tauri 壳，含 cargo） |
| WebView2 | Windows 运行时（Win11 自带） |
| PostgreSQL | 16（API 运行时） |
| Redis | 7（任务队列） |

## 快速开始

```bash
pnpm install            # 安装全部依赖
pnpm build              # 构建所有 packages
pnpm typecheck          # 全仓类型检查

pnpm dev:api            # 启动云端 API（需先配置 .env）

# 桌面端（Tauri）
pnpm --filter @flux/desktop run dev        # 仅前端（浏览器调试 Vite）
pnpm --filter @flux/desktop run tauri:dev  # 完整桌面应用（Tauri 窗口）
```

首次打包前需生成应用图标：`pnpm --filter @flux/desktop exec tauri icon path/to/logo.png`。

复制 `.env.example` 为 `.env` 并按需填写。

## 包命名

所有内部包使用 `@flux/*` 作用域：`@flux/shared`、`@flux/workflow-schema`、`@flux/node-sdk`、`@flux/canvas-core`、`@flux/ui`、`@flux/api`、`@flux/desktop`。

## 状态

首期 MVP 骨架阶段。路线图见 `docs/prd.md` 第 9 节。
