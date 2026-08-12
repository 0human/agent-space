# 分离 Workflow 状态与 Artifact 内容

Workflow Run 的控制状态采用本地 SQLite 持久化：每个 Step 产生结构化的 Step Execution 记录，状态变化追加为 Workflow Event，并同步更新可恢复的 Run Snapshot。Artifact 的实际内容继续保存在 Workspace、GitHub 或其他真实来源中，APP 只保存其类型、来源、版本/hash 和关联关系。这样可以在 APP 重启后恢复和审计长流程，同时避免把项目内容锁进 APP 的私有数据库。

## Status

accepted

## Considered Options

- 只保存最后状态：实现简单，但丢失重试、失败和审批历史，难以可靠恢复。
- 将所有 Artifact 内容复制到 APP 数据库：查询方便，但造成重复存储和项目锁定。
