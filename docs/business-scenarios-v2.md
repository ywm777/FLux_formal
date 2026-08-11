# Flux 真实业务场景 V2

## 产品判断

Flux 的场景不按“某个应用能做什么”组织，而按业务闭环组织：接收事件、理解与分流、人工决策、执行动作、归档结果、通知责任人。场景模板只提供可运行的默认组合，节点能力必须能跨场景复用。

## 调研依据

- Zapier 的销售自动化把线索捕获、补全、评分、路由、CRM 更新和负责人提醒串成完整链路：https://zapier.com/automations/marketing/lead-management
- Zapier 的客户支持方案强调工单捕获、优先级路由、SLA 升级、AI 回复草稿和人工复核：https://zapier.com/automations/customer-service-success
- ServiceNow 将客户问题建模为从创建、分类、分配、沟通到解决和报告的 Case 生命周期：https://www.servicenow.com/docs/r/customer-service-management/csm-case-management.html
- Microsoft Power Automate 的审批模板包含条件分支、阶段、多人审批、委派、超时和审计记录：https://learn.microsoft.com/en-us/power-automate/guidance/business-approvals-templates/introduction
- GitHub Actions 支持按失败任务重跑和保留运行日志，说明生产工作流需要可定位、可恢复的执行记录：https://docs.github.com/en/actions/how-tos/manage-workflow-runs/re-run-workflows-and-jobs

## V2 场景包

### 销售运营：客户线索处理

接收线索 → AI 评分 → 主管确认 → 写入客户池 → 通知负责人。

### 客户支持：客户工单分诊

接收工单 → AI 分诊与 SLA 路由 → 紧急事项人工接管 → 生成回复 → 归档工单 → 通知支持团队。

### 运营审批：采购申请审批

接收申请 → 金额与风险策略检查 → 按规则自动通过或人工审批 → 归档审批记录 → 通知申请人。

## 共用能力

- 人工确认：所有场景共用暂停、通过、退回和继续执行能力。
- 记录归档：统一配置目标系统、记录类型、去重键、重试与异常负责人。
- 团队通知：统一配置渠道、接收人、消息、重试与升级策略。
- 执行反馈：画布直接显示步骤、运行中、等待确认、失败和完成状态。

## 后续优先级

1. 持久化节点输出和执行游标，审批后从暂停点继续，而不是重跑上游。
2. 提供连接器绑定，让归档和通知节点真正写入 CRM、工单系统和企业协作工具。
3. 增加超时计时器、代理审批和失败节点单独重跑。
