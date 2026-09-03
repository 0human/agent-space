# 使用 Run Activity View 作为 Workflow Run 主界面

单个 Workflow Run 的主界面采用全宽 Run Activity View，而不是以 Phase 为列的 Jira 式 Run Board。Run Activity View 以 Codex 风格的连续 Runtime Item 数据流为主体，在顶部用两级吸顶进度显示整个 Workflow 和当前 Phase / Implementation Ticket，并通过 Live Mode 与 Inspection Mode 兼顾实时跟随和历史检查；Workflow Engine 仍是状态事实来源，视图只投影允许的状态转换。该决定 supersede ADR-0008，因为长时间 agent 执行的首要问题是理解当前活动、等待项和最新产出，而不是在多个列之间管理卡片。

## Status

accepted

## Consequences

- Phase、Step 和 Implementation Ticket 仍是 Workflow 结构，不因连续活动流而退化为一条全局聊天。
- Workflow / Phase / Ticket 导航位于 Runtime 数据流之外；Phase 和 Ticket 切换在流中使用轻量分隔符。
- V1 不实现源文件查看器；文件修改只展示路径、状态和行数摘要，并可交给外部 IDE 打开。
- Project Overview 继续负责多个 Workflow Run 的汇总；本 ADR 只改变单个 Run 的操作视图。
