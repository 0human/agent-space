# PR 创建后再进行 review 和 approval

Development Workflow 在独立 feature branch 上完成实现后，先由 `implement` 内部调用 `code-review` 执行 Automatic Review；发现问题时由 agent 修复。之后 APP 可以自动 commit、push 并创建 PR，不在这些动作之前设置 Approval Gate。PR 创建后等待 CI 和 GitHub review，用户在 Merge Gate 检查结果并明确批准，APP 才通过 GitHub 远程合并；不在本地合并后直接 push 默认分支。这样既能复用现有 Skill 的自动检查，又让人工 review 面向 GitHub 上实际可合并的变更，并保留 merge 这一高影响动作的人工控制。

## Status

accepted

## Consequences

- feature branch push 和 PR 创建必须具备幂等与重试能力，避免重复 PR。
- 直接更新默认分支和 force push 仍属于高风险操作。
- 本地且没有远程仓库的 Project 不存在 PR/Merge Gate，其交付止于本地 commit 或显式 Human Step。
