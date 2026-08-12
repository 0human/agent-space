# 按 Phase 保存上下文并结构化用户决定

Workflow Run 不使用一个无限增长的全局 agent 对话，而是为每个 Phase 保存可恢复的 Phase Context；Phase 之间通过 Artifact、Decision Record 和 Run 状态衔接。Skill 产生的用户问题会暂停当前 Step，并持久化问题、回答、来源和继续位置，回答后从原 Phase/Step 继续。V1 先实现一个内置的 software delivery Workflow，覆盖 Idea、需求、计划、实现、验证、review、commit/PR；Release 与 Post-release Validation 通过 Tool Step、Human Step 或 Project 配置接入，Workflow Builder、外部 Skill Registry 和第三方 Runtime 留到后续版本。

## Status

accepted

## Considered Options

- 整个 Run 共享一个持续增长的对话：早期连贯，但长流程会失控且难以恢复。
- 每个 Step 完全隔离：容易管理，但会丢失 `grill-with-docs` 等连续访谈所需的上下文。
