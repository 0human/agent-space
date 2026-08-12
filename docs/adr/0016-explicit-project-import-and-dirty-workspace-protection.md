# 显式导入 Project 并保护 Dirty Workspace

用户必须显式创建或导入 Project，Project 记录本地路径、Git remote（可选）、默认分支、Project Workflow、Permission Policy 和 Release 配置。打开已有目录时，Preflight 展示 branch、HEAD、未提交文件和 Dirty Workspace 状态；新 Run 使用独立 worktree/branch，不覆盖原目录的未提交修改，APP 不自动 stash、reset 或丢弃用户变更。这样 Project 身份和代码安全边界都由用户确认，而不是由目录扫描或隐式推断决定。

## Status

accepted
