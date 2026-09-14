# 每个 Project 仅允许一个 Workflow Run

每个 Project 在整个生命周期中最多创建一个 Workflow Run，任何状态（包括 completed 和 cancelled）都不能再创建第二个实例。该决定取代 ADR-0009 的同工程并行 Run 设计，以简化工程入口和运行关系；本次不处理完成后继续或结束后恢复的问题。

## Status

accepted

## Consequences

- 工程详情右上角和 Workflow 页面直接进入已有运行实例，工程不再提供多 Run 列表。
- 存储层在创建 Workspace 前原子检查，并以 Project 唯一索引约束 Run；重复提交不产生额外实例或 Workspace。
- 旧数据库中拥有多个 Run 的工程清空其运行记录及关联执行数据，不迁移历史；本地 Workspace、Git 分支和外部 Runtime 历史不删除。已有单个 Run 的工程继续使用该实例。
- 保留独立 Workspace、Base Commit、branch 和 Run ID，以保护工程原目录并关联交付产物。
