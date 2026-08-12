# 允许使用独立 Workspace 的 Parallel Workflow Run

同一个 Project 可以并行运行多个会修改代码的 Workflow Run，但每个 Run 必须固定 Base Commit，并使用独立 worktree 或 branch；不允许多个 Run 直接写入同一个可写 Workspace。变更通过 commit、PR 和合并流程汇合，冲突时 Run 进入 blocked 状态，可调用 `resolving-merge-conflicts` 或 Human Step，APP 不自动覆盖或合并其他 Run 的修改。这样可以保留并行开发能力，同时把冲突控制在可见的版本控制边界内。

## Status

accepted

## Consequences

- branch、PR、Issue 和 Artifact 需要关联 Run 标识。
- `CONTEXT.md`、ADR、Workflow File 等共享文件也可能产生合并冲突。
- APP 必须在创建 Run 时完成 Workspace/branch 隔离和 Base Commit 记录。
