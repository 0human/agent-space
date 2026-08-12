# Skill 安装与高风险操作必须显式确认

Skill 可以从内置包、本地目录或压缩包、npm/npx 包、Git URL 及其他 APP 能够调用的安装来源获取；V1 不建立强制的 registry 白名单或中心化审核，Skill Source 的可信性由用户判断。安装前必须展示来源、版本、依赖和权限，并由用户明确确认，Workflow 不得静默安装 Skill。普通读取、分析、测试以及向独立 feature branch commit、push 和创建 PR 可以自动执行；删除、覆盖、force push、直接更新默认分支、PR merge、部署、凭据修改以及超出 Project Permission Policy 的访问必须进入 Approval Gate。GitHub 身份优先使用系统 Git credential、`gh` 登录状态或操作系统凭据存储，APP 不把 token、密码或 secrets 写入 Workflow File、Artifact 或普通日志。这个边界允许用户自由扩展 Skill，同时把供应链判断责任明确交给用户。

## Status

accepted

## Considered Options

- 仅允许可信 registry 和 Git URL：更容易集中治理，但会阻止用户通过 npm/npx、本地包或其他来源复用 Skill。
- 由 APP 自动生成替代 prompt：可以绕过缺失依赖，但会破坏 Skill-first 的行为来源约束。
- 所有动作默认全自动：流程更短，但无法让用户在 merge、部署等高风险副作用前介入。
