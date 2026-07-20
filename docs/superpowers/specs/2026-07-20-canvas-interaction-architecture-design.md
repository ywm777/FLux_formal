# Flux 画布交互架构收敛设计

- 日期：2026-07-20
- 状态：实施中（阶段 0 行为安全网、阶段 1 选择控制器与阶段 2 历史控制器已完成）
- 上位设计：`2026-07-18-architecture-convergence-design.md`
- 范围：桌面端画布的选择、历史、快捷键、执行与组合边界

## 1. 决策摘要

本阶段采用“局部组合根 + 功能控制器 + 纯状态模型”的方案整理画布，不重写产品，也不把全部状态迁入全局 Store。

`CanvasView` 继续负责组装 React Flow 和页面组件，但不再亲自实现所有交互规则。选择、历史、快捷键和执行分别成为有明确输入输出的控制器；可独立验证的状态变换下沉为纯 TypeScript 模块。

用户可感知的目标只有三个：

1. 当前界面和操作习惯保持不变。
2. 框选、单选、多选、撤销、重做、快捷键、保存和运行不因内部重构退化。
3. 以后修改其中一项功能时，不再容易误伤其他画布功能。

## 2. 为什么现在整理

当前 `CanvasView.tsx` 同时承担以下职责：

- React Flow 的节点、连线、视口和事件接入；
- 单选、多选、分组、连线选择和检查器状态；
- 撤销、重做和拖拽事务；
- 键盘事件和命令分派；
- 保存、试运行、正式运行、回放、错误和审批；
- 菜单、浮层、工具条和产品反馈。

这些功能本身大多可用，但状态和事件互相穿插。近期“框选在长期运行的开发窗口中失效、完整刷新后恢复”的现象说明：源码合同测试无法替代真实交互验证，结构性修改也不能只依赖热更新确认。

本阶段的重点不是追求文件数量或行数，而是建立唯一的交互规则入口和可以重复执行的行为回归。

## 3. 参考原则

设计吸收以下成熟项目和官方模型中的可验证原则：

1. React Flow 支持受控的 `nodes`、`edges` 及变更回调，并提供 `selectionOnDrag`、`selectionMode`、`onSelectionChange` 等明确的选择接入点。Flux 保留这个框架边界，不把 React Flow 对象传播到应用层。
2. Redux 的撤销模型使用 `{ past, present, future }` 表达历史；新编辑会清空 `future`。Flux 采用相同的纯状态结构，但仅用于画布快照，不引入 Redux 依赖。
3. VS Code 通过稳定命令标识连接菜单、快捷键和实际处理器。Flux 延续已有命令协调器，让键盘控制器只负责“把按键翻译成命令”，不直接操作持久化或运行实现。
4. Tauri 开发模式通过 WebView 加载开发服务器并支持热更新。结构性重构的验收必须包含完整刷新或冷启动，避免把旧 WebView/HMR 状态当作新代码结果。

参考资料：

- React Flow：<https://reactflow.dev/api-reference/react-flow>
- React Flow 状态管理：<https://reactflow.dev/learn/advanced-use/state-management>
- Redux 撤销历史：<https://redux.js.org/usage/implementing-undo-history>
- VS Code Commands：<https://code.visualstudio.com/api/references/commands>
- Tauri 开发流程：<https://v2.tauri.app/develop/>

## 4. 目标边界

### 4.1 画布组合根

`CanvasView` 是画布页面的组合根，保留：

- 受控的 `nodes`、`edges` 和 `groups`；
- React Flow 实例、坐标转换和视口能力；
- 控制器的创建、依赖注入和 UI 组合；
- 只与具体渲染组件有关的短生命周期状态。

`CanvasView` 不再保留：

- 分散在多个回调中的选择互斥规则；
- 手写的历史栈推进规则；
- 巨型键盘事件分支；
- 执行流程的完整状态机和错误转换。

不以“必须缩减到某个行数”为验收条件。验收看职责和依赖是否收敛。

### 4.2 目录结构

第一轮目标结构为：

```text
apps/desktop/src/features/canvas/
├─ CanvasView.tsx
├─ selection/
│  ├─ canvasSelection.ts
│  └─ useCanvasSelectionController.ts
├─ history/
│  ├─ canvasHistory.ts
│  └─ useCanvasHistoryController.ts
├─ keyboard/
│  └─ useCanvasKeyboardController.ts
├─ execution/
│  └─ useCanvasExecutionController.ts
└─ ...现有节点、连线、菜单和检查器组件
```

若某个纯模型后续被多个应用复用，再移动到共享包；本阶段不为未来假设创建新包。

## 5. 选择模型

### 5.1 唯一规则入口

选择策略由一个规范化模型表达：

```ts
type CanvasSelectionState = {
  nodeIds: string[];
  primaryNodeId: string | null;
  groupId: string | null;
  edgeId: string | null;
  inspectingNodeId: string | null;
};
```

规则：

- 节点多选时，`nodeIds` 是完整集合，`primaryNodeId` 是属性面板或快捷操作的主节点。
- 选择分组时清除节点和连线选择。
- 选择连线时清除节点和分组选择。
- 清空画布选择不一定关闭用户主动打开的检查器；该行为由明确动作区分，不能靠多个 `setState` 的先后顺序偶然决定。
- 选择集合按稳定顺序去重，避免重复事件造成无意义渲染。

`canvasSelection.ts` 是纯 reducer/状态变换，定义 `replaceNodes`、`selectNode`、`selectGroup`、`selectEdge`、`clearCanvasSelection`、`openInspector` 和 `closeInspector` 等动作。

### 5.2 React Flow 的角色

React Flow 的 `selected` 标志是渲染投影和框架交互接口，不是第二套产品规则。

事件方向固定为：

```text
鼠标/键盘/React Flow 事件
        ↓
选择控制器动作
        ↓
规范化选择状态
        ↓
节点/连线 selected 投影 + 工具条/检查器渲染
```

`onSelectionChange` 是选择控制器的一个输入。控制器在需要时通过注入的节点/连线更新函数同步投影，但不能形成“状态 A 监听状态 B、状态 B 又反写状态 A”的循环。

### 5.3 框选保护

必须用真实指针事件验证：

- 在空白区域按下左键并拖动，出现选择矩形；
- 与矩形部分相交的节点被选中；
- 释放后多选工具条出现；
- 点击空白区域后选择清空；
- 中键或右键平移不触发框选；
- 完整刷新后的 Tauri 窗口仍通过上述流程。

仅检查源码中是否存在 `selectionOnDrag` 不再视为有效回归验证。

## 6. 历史模型

### 6.1 纯状态结构

历史模块使用：

```ts
type CanvasHistory<T> = {
  past: T[];
  present: T;
  future: T[];
};
```

提供 `commit`、`undo`、`redo`、`reset` 和容量裁剪。新 `commit` 必须清空 `future`。

### 6.2 快照边界

历史快照只包含可编辑图数据：

- 节点及其可持久化数据和位置；
- 连线；
- 分组及成员关系。

以下状态不进入历史：

- 当前选择、菜单和检查器开关；
- 运行进度、回放帧和临时错误；
- 视口缩放和鼠标悬停；
- 保存状态和网络请求状态。

拖拽、缩放等连续手势按事务提交：手势开始时记录基线，手势结束时只提交一次，不能在每个鼠标移动事件中生成历史记录。

## 7. 快捷键与命令

键盘控制器只完成三件事：

1. 判断事件是否来自输入框、文本编辑器或声明了忽略快捷键的区域；
2. 使用现有快捷键目录把按键映射为稳定命令标识；
3. 调用注入的命令接口并处理 `preventDefault`。

它不能直接：

- 调用 API、文件系统或 Tauri；
- 修改 React Flow 节点；
- 读取具体 Store 实现；
- 自行复制保存、运行或删除规则。

菜单、命令面板和键盘应调用相同命令处理器。由此保证修改一个动作时不会出现三套不同实现。

## 8. 执行控制器

执行控制器负责一次完整的画布执行会话：

```text
输入预检 → 必要时保存 → 发起执行 → 接收进度
→ 映射节点运行投影 → 完成/取消/失败 → 产品反馈
```

边界约束：

- 通过 `ExecutionPort` 或现有等价能力调用执行，不依赖具体 HTTP 客户端。
- 通过注入的 `saveNow` 请求保存，不读取保存按钮或 `nonce`。
- 应用/执行层只认识工作流、节点运行结果和语义错误，不接收 React Flow `Node`、`Edge` 或组件实例。
- 节点的运行颜色、徽标和动画由画布适配函数投影。
- 产品错误统一转换，控制器不在不同分支中散落相似中文文案。
- 旧执行返回晚于新执行时必须被会话标识丢弃，避免陈旧结果覆盖当前状态。

执行是本轮最后拆分的控制器。选择、历史和快捷键稳定后再迁移，降低一次改动触碰过多高风险路径的概率。

## 9. 状态归属

采用“状态放在最靠近使用者的位置”的原则：

| 状态 | 归属 | 原因 |
| --- | --- | --- |
| nodes / edges / groups | `CanvasView` 受控画布会话 | 与 React Flow 渲染和图操作强相关 |
| 选择策略 | selection controller | 多个画布组件共享，但不属于全应用 |
| 历史 | history controller | 只服务当前编辑会话 |
| 快捷键监听 | keyboard controller | 生命周期与画布页面一致 |
| 运行会话 | execution controller / session store | 需要被状态栏等观察，但不泄漏框架对象 |
| 工作流身份、保存状态 | 现有 canvas session/store | 已跨页面和外壳共享 |
| 菜单、悬停、临时拖拽 | 最近的组件或 ref | 短生命周期、无需全局观察 |

本阶段明确不做“全部放进 Zustand”。全局 Store 只保存跨组件、跨页面确实需要观察的会话状态，不能成为新的巨型组件。

## 10. 错误和并发

- 控制器内部使用有类型的结果或语义错误；UI 边界统一映射为用户文案。
- 异步操作必须带会话/请求标识，忽略陈旧返回。
- 组件卸载时取消可取消的订阅和定时器。
- 保存与运行冲突沿用命令协调器的串行规则，不在控制器间建立隐式相互监听。
- 选择和历史的纯模型不得吞掉非法状态；开发环境应暴露清晰断言，生产环境使用安全回退并记录诊断信息。

## 11. 实施顺序

### 阶段 0：行为安全网

- 增加真实鼠标框选 E2E。
- 补齐撤销/重做、保存、运行、适配视图和节点微移的行为测试。
- 将只匹配源码字符串的脆弱合同测试替换为行为测试或模块边界测试。
- 记录冷启动和完整刷新基线。

### 阶段 1：选择控制器

- 先以纯状态测试锁定选择互斥和检查器行为。
- 迁移所有显式选择入口。
- 接回 React Flow `onSelectionChange` 和 `selected` 投影。
- 完成框选、单选、多选、分组和连线回归。

### 阶段 2：历史控制器

- 建立纯历史模型和容量策略。
- 迁移节点、连线、分组和拖拽事务。
- 验证撤销后编辑会清空重做路径。

### 阶段 3：键盘控制器

- 迁移按键判断和监听生命周期。
- 统一键盘、菜单和命令面板处理器。
- 验证文本输入时不会误触删除、运行或画布移动。

### 阶段 4：执行控制器

- 提取输入预检、保存协调、执行生命周期和错误映射。
- 保留现有产品反馈和节点动画。
- 验证取消、失败、连续运行和陈旧响应隔离。

### 阶段 5：组合清理

- 删除失去用途的重复状态、ref 和兼容分支。
- 更新架构边界测试，阻止 React Flow、Tauri 和具体 API 越层。
- 以职责审查决定是否继续拆分，不进行机械拆文件。

## 12. 每阶段验收

每个阶段必须满足：

1. TypeScript 类型检查通过。
2. 相关纯模块和组件测试通过。
3. 桌面端核心 E2E 通过。
4. 架构边界测试通过。
5. Tauri 开发窗口执行一次完整刷新或重新启动后，完成对应真实操作。
6. 保存、关闭再打开后，工作流内容不丢失。
7. 不以热更新后的单次截图代替回归结果。

一旦某阶段破坏用户可见行为，先修复该阶段，不继续叠加后续重构。

## 13. 非目标

- 不改变当前视觉设计、节点外观或产品导航。
- 不增加新的画布功能。
- 不重写 React Flow，不切换状态管理库。
- 不修改工作流持久化 Schema，不触发数据迁移。
- 不同时重构 `TitleBar`、`WorkbenchView` 和 API 大模块。
- 不为了目录整齐创建没有实际行为的抽象层。

## 14. 完成定义

本阶段完成时应满足：

- `CanvasView` 主要体现页面组合和 React Flow 适配，而非包含全部业务规则；
- 选择、历史、快捷键和执行各有一个清晰入口；
- 框选具备真实指针 E2E，并在 Tauri 完整刷新/冷启动后验证；
- 历史模型可通过纯单元测试证明 `past/present/future` 规则；
- 菜单、命令面板和键盘不会复制同一命令实现；
- React Flow 类型不会进入应用服务、执行端口或持久化接口；
- 现有用户流程、数据和视觉效果保持不变；
- 每个迁移阶段都有独立提交和可回退边界。

## 15. 后续顺序

画布交互边界收敛并稳定后，再按风险顺序处理：

1. `TitleBar` 的外壳、账户和窗口职责；
2. `WorkbenchView` 的查询、文件和工作空间用例；
3. `FluxNode` 的节点外壳与业务表面；
4. API 端口和适配器目录治理。

这个顺序优先消除最容易造成用户直接感知回归的编辑器风险，再处理外围模块。

## 16. 阶段 0–1 实施证据

完成日期：2026-07-20。

已落地内容：

- 新增真实左键拖拽框选 E2E，覆盖选择矩形、两个节点提交、多选工具条和空白清除。
- 新增无 React、无 React Flow 依赖的纯选择 reducer。
- 新增画布选择控制器，统一节点、批量节点、分组、连线、检查器和 React Flow 选择事件。
- `CanvasView` 已删除 `setSelectedId`、`setSelectedNodeIds`、`setSelectedGroupId`、`setSelectedEdgeId` 和 `setInspectingId` 五类分散 setter。
- 框选、连线选择和端点重连的产品行为保持不变。

自动验证：

```text
pnpm --filter @flux/desktop typecheck
  PASS

pnpm --filter @flux/desktop test:unit
  28 passed, 0 failed

node test/architecture-boundaries.contract.mjs
  PASS

node apps/desktop/test/canvas-multi-select-group.contract.mjs
  PASS

pnpm exec playwright test -c e2e/playwright.config.ts \
  e2e/canvas-box-selection.spec.ts \
  e2e/edge-selection-mode.spec.ts \
  e2e/view-switch-continuity.spec.ts
  9 passed, 0 failed

pnpm exec playwright test -c e2e/playwright.config.ts \
  e2e/canvas-box-selection.spec.ts --workers=1
  1 passed, 0 failed
```

Tauri 完整刷新验证：

1. 对长期运行的 `Flux 无界工作流` WebView 执行 `Ctrl+R`。
2. 从刷新后的工作台重新打开“客户线索处理”。
3. 在空白画布左键拖过前两个节点，拖动期间选择矩形可见。
4. 释放后两个节点保持蓝色选中状态，并显示“已选 2 个节点”工具条。
5. 点击空白区域后节点和工具条选择状态清除。
6. 点击第一条连线后整线及两个端点高亮；按 `Escape` 后高亮清除。
7. WebView DevTools 控制台没有红色错误；存在 2 条 React Flow 既有用法警告，不属于本阶段新增错误。

本证据只代表阶段 0–1；阶段 2 证据见下节，快捷键和执行控制器仍按后续独立计划实施。

## 17. 阶段 2 实施证据

完成日期：2026-07-20。

已落地内容：

- 新增泛型、有限深度的 `{ past, present, future, limit }` 纯历史模型。
- 新编辑会清空重做路径，历史深度默认限制为 80。
- `CanvasView` 已删除 `undoStackRef`、`redoStackRef` 和 `nodeDragHistoryRef`。
- 历史快照只包含节点、连线和分组；选择、检查器、节点运行状态与运行时 action 不进入快照。
- 节点拖拽和分组拖拽改为事务，在手势结束时只提交最终位置。
- 撤销/重做通过历史控制器返回快照，画布只负责恢复受控图状态。

自动验证：

```text
pnpm --filter @flux/desktop typecheck
  PASS

pnpm --filter @flux/desktop test:unit
  33 passed, 0 failed

node test/architecture-boundaries.contract.mjs
  PASS

node apps/desktop/test/canvas-history.contract.mjs
  PASS

pnpm exec playwright test -c e2e/playwright.config.ts \
  e2e/canvas-history.spec.ts \
  e2e/canvas-box-selection.spec.ts \
  e2e/edge-selection-mode.spec.ts \
  e2e/view-switch-continuity.spec.ts --workers=1
  11 passed, 0 failed
```

Tauri 完整刷新验证：

1. 对长期运行的 WebView 执行 `Ctrl+R`，从工作台重新打开“客户线索处理”。
2. 选择“接收官网线索”并按 `Ctrl+D`，出现“接收官网线索 副本”。
3. 按 `Ctrl+Z` 后副本消失；按 `Ctrl+Shift+Z` 后副本恢复。
4. 将原节点从左上区域拖到画布下方，连线随最终位置更新。
5. 按 `Ctrl+Z` 后节点回到原始位置；按 `Ctrl+Shift+Z` 后节点回到最终拖拽位置，而不是中间帧。
6. 历史恢复后选择状态按设计清除，工作流其他节点与连线保持完整。
7. WebView DevTools 控制台没有红色错误；可见警告为既有 React Flow/ARIA 开发警告。

本证据只代表阶段 2。快捷键与执行控制器仍按后续独立计划实施。

## 18. 阶段 3 实施证据

完成日期：2026-07-20。

已落地内容：

- 新增 `useCanvasKeyboardController`，集中管理画布激活期间唯一的全局 `keydown` 监听器。
- 快捷键控制器只依赖按键目录、当前浮层/选择标识和语义动作端口，不导入 Zustand、React Flow、Tauri、API 或执行网关。
- `CanvasView` 不再直接匹配快捷键，只在组合根注入保存、预览运行、适配视图、历史、选择、节点和连线动作。
- Escape 的关闭优先级保持为重命名、节点面板、菜单、检查器、画布选择；输入框、文本域和可编辑区域继续保护原生编辑行为。
- 保存与运行的业务门禁仍留在画布组合根，键盘适配层不读取或解释应用状态。
- 旧源码形状契约已迁移为选择、历史、会话和键盘控制器边界契约；当前 90 个桌面契约全部通过。

自动验证：

```text
pnpm --filter @flux/desktop typecheck
  PASS

pnpm --filter @flux/desktop test:unit
  33 passed, 0 failed

node test/architecture-boundaries.contract.mjs
  PASS

apps/desktop/test/*.contract.mjs
  90 passed, 0 failed

pnpm exec playwright test -c e2e/playwright.config.ts \
  e2e/canvas-keyboard.spec.ts \
  e2e/canvas-history.spec.ts \
  e2e/canvas-box-selection.spec.ts \
  e2e/edge-selection-mode.spec.ts \
  e2e/view-switch-continuity.spec.ts --workers=1
  13 passed, 0 failed
```

Tauri 完整刷新验证：

1. 对长期运行的 `Flux 无界工作流` WebView 执行 `Ctrl+R`，应用完整回到工作台且没有空白窗口。
2. 重新打开工作流并点击节点标题，按 `Enter` 后“高级设置”抽屉出现；按 `Escape` 后抽屉关闭而节点仍可继续操作。
3. 选择节点后按 `Shift+ArrowRight`，节点产生快速微移；按 `Ctrl+Z` 后回到原始位置，选择按历史恢复规则清除。
4. 重新选择节点并按 `Ctrl+D`，画布从 4 个节点增加为 5 个并选中新副本；按 `Delete` 后恢复为 4 个节点。
5. 聚焦文本常量的多行输入框后发送 `Ctrl+D` 与 `Delete`，输入框保留焦点且画布仍为 4 个节点，没有误复制或误删除节点。
6. WebView DevTools 控制台没有红色错误；可见 13 条为既有 ARIA 开发警告，没有本阶段新增异常。

本证据只代表阶段 3。下一阶段将独立提取执行控制器，避免在同一回退边界中混入异步运行生命周期改动。
