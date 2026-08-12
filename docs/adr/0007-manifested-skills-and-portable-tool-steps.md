# 使用 Skill Manifest 和跨平台 Tool Step

Skill 的行为继续由 `SKILL.md` 提供，Skill Package 另以 Skill Manifest 声明名称、版本、入口、依赖、Runtime 兼容性、能力和权限。Workflow 的语义保持跨平台；Tool Step 可以为 macOS、Linux 和 Windows 声明不同命令或适配器，Preflight 在当前平台缺少依赖时阻止运行。Release 和 Post-release Validation 由 Project 配置提供 Tool Step 或 Human Step，APP 不内置特定云厂商的部署逻辑。

## Status

accepted

## Consequences

- 内置和联网安装的 Skill 使用同一套依赖与权限检查。
- Tool Step 必须显式声明平台差异，不能依赖隐含 shell 行为。
- Project 负责提供部署和验证方式，Workflow 引擎只负责调度、审批和记录。
