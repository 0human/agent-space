# MVP Workflow Run 交互设计

## 文档状态

- 状态：Frozen
- 冻结日期：2026-09-02
- 范围：单个 Workflow Run 的创建入口、连续执行、状态控制和结果呈现
- 相关文档：[Run 状态机与 Codex Thread/Turn 映射](./run-state-and-codex-mapping.md)、[Runtime 数据流事件规范](./runtime-data-flow.md)

## 目标

MVP 的核心路径是：

> 创建空 Project → 自动使用可见的默认 Development Workflow → Agent 连续执行 → 交付一个可运行的软件产品

用户首先需要理解三件事：整个 Workflow 走到哪里、当前正在做什么、截至目前产生了什么。APP 是 Workflow 编排器而不是 IDE，不承担源代码阅读和编辑。

## 创建与启动

创建空 Project 只要求：

- Project 名称；
- 空目录；
- 初始 Idea。

APP 自动初始化 Git、本地 Project 配置和默认 Development Workflow。默认 Workflow 必须在启动前可见并自动选中，不要求用户先进入 Workflow 选择器。Preflight 检查本地 Codex、Skill、命令、权限和 Workspace 条件；失败时阻止启动并给出可操作说明。

Workflow 启动后默认连续执行，不在每个 Phase 设置固定确认。只有 Agent 问题、Runtime 审批、Approval Gate、失败或阻塞才暂停自动推进。

## 页面结构

```text
┌ Project / Idea                         Run 状态   … ┐
├ Workflow 总进度：Discovery … Post-release          ┤  sticky
├ 当前进度：Implementation · Ticket 5/12 · 测试中    ┤  sticky
│                                                       │
│ Phase / Ticket 分隔符                                 │
│ Codex 风格 Runtime Item 数据流                        │
│ Agent 消息、Plan、Command、Tool、File Change、Question │
│ Ticket 累计总结 / Workflow Run 最终总结               │
│                                                       │
├ 状态相关的控制区与输入框                              ┤
```

不设置常驻右侧栏。详细信息在活动流内按需展开，历史检查通过 Inspection Mode 完成。

## 两级吸顶进度

第一行展示整个 Development Workflow 的 Phase 位置，包含已完成、当前、待执行、skipped、failed 或 blocked 状态。

第二行展示当前 Phase 内的执行位置：

- 非 Implementation Phase：显示当前 Step 和状态；
- Implementation Phase：显示 `Ticket 5/12` 及当前 Ticket 的 `实现 → 测试 → Review → Commit` 子流程；
- `5/12` 同时可以出现在当前 Ticket 的活动流分隔符中，不在每条 Runtime Item 上重复。

某类 Step 不产生测试或验证结果时，直接隐藏对应字段，不显示“无需验证”之类的占位状态。

## Runtime 数据流

所有 Runtime 数据流交互尽量复现 Codex VS Code extension 的可观察行为：内容流式出现、同一 Item 原位更新、完成后收敛为稳定摘要。MVP 不复制 extension 的源码、资产或品牌。

默认展示密度：

- Agent 面向用户的消息和进度说明；
- Plan 及状态变化；
- Command 名称、运行状态和结果摘要，完整输出默认折叠；
- Tool 调用和结果摘要；
- File Change 的进行中状态、完成状态、路径及 `+x -y`；
- Question、Approval、Error、Interrupt 和最终回复。

不展示隐藏 chain-of-thought、原始 reasoning、凭据或未脱敏环境信息。

## Live Mode 与 Inspection Mode

### Live Mode

- 默认模式，自动跟随当前执行位置和最新 Runtime Item；
- Item 流式更新时保持身份稳定，不重复创建卡片；
- 用户主动滚离最新位置时可以暂时停止自动滚动，并提供“返回实时”。

### Inspection Mode

- 用户点击历史 Phase 或 Implementation Ticket 后进入；
- Workflow Run 继续执行，不自动暂停；
- 页面不抢回滚动位置；
- 显示当前实际执行位置和新增活动数量；
- 用户点击“返回实时”回到 Live Mode。

## 状态相关控制

| Run 状态 | 输入框 | 主操作 | 说明 |
| --- | --- | --- | --- |
| `running` | 禁用 | 暂停 | 暂停会中断当前 Codex Turn |
| `interrupting` | 禁用 | 正在暂停 | UI 瞬时状态，等待 Turn 以 `interrupted` 结束 |
| `paused` | 可用 | 继续 / 发送并继续 | 空输入为继续；有文字时发送指导并继续 |
| `waiting` | 可用 | 发送 | 回答当前 Question 或 Approval，不创建新 attempt |
| `blocked` | 视阻塞类型可用 | 重试或发送 | 只有具备明确恢复动作时才启用 |
| `failed` | 可用 | 发送 | 指导内容在同一 Thread 开始新 Turn，并创建新 Step Execution attempt |
| `completed` | 保留但禁用 | 无 | MVP 禁止继续输入，为后续继续 Run 保留布局位置 |
| `cancelled` | 禁用 | 无 | 终态，不可恢复 |

“取消”统一命名为“结束 Run”，放在右上角 `…` 菜单并要求确认。结束 Run 会中断活跃 Turn、停止后续调度并将 Run 标记为 `cancelled`；保留 Workspace 修改、Codex 历史、Artifact 和 Workflow 状态记录，不执行 reset、删除或回滚。

## 产出呈现

活动流展示每次执行的可观察过程；Artifact 只表示可被后续流程或用户使用的持久结果。源文件本身不逐个作为 Artifact。

每个 Implementation Ticket 完成后追加累计总结，至少包括适用项：

- Ticket 名称和完成状态；
- 实现、测试、Review、Commit 结果；
- 新增、修改、删除文件及累计 `+x -y`；
- 关键 Artifact 或阻塞；
- 耗时。

Workflow Run 完成后，最终累计总结作为活动流最后一条正式消息，汇总 Ticket、build、验证、累计文件修改、关键 Artifact 和总耗时。顶部 Workflow 进度全部完成，底部输入框保持可见但禁用。

APP 不提供文件内容查看器。文件修改摘要可以展开文件列表，并提供“在 IDE 中打开”。

## MVP 验收场景

1. 用户从空目录和 Idea 创建 Project，看到默认 Workflow 并完成 Preflight。
2. Run 连续跨越多个 Phase，顶部进度和活动流位置始终一致。
3. Implementation 有 12 个 Ticket 时，用户能看到 `5/12` 和当前 Ticket 子流程，不被重复周期淹没。
4. Command、Tool 和 File Change 在运行中原位更新，完成后显示稳定摘要。
5. 用户检查历史 Ticket 时 Run 继续执行，新增活动不会夺回页面位置。
6. 用户暂停后可以继续或补充指导；失败后发送指导会产生新的 attempt。
7. App 重启后能恢复 Run 控制状态，并通过 Runtime Locator 恢复 Codex 历史；历史缺失时采用可解释降级。
8. Run 完成后显示最终累计总结，输入框保留但不可用。

## Post-MVP TODO

- 允许 `completed` Run 继续输入并定义重新打开 Workflow 的语义；
- 根据真实使用数据优化 Codex 风格数据流，而非继续追求逐像素复制；
- 定义删除或归档 Workflow Run 时关联 Codex Thread 的保留、归档和删除策略；
- 评估更多 Agent Runtime 的展示 Adapter；
- 完善跨 Run 的 Project Overview 与通知体验。
