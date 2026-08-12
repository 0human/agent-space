# Workflow Definition 以版本控制文件为事实来源

Workflow Definition 使用可版本控制的 Workflow File 表达，并作为可审阅、可提交和可复现的事实来源。APP 提供编辑、校验和运行能力，但不把 Workflow 只存储在私有数据库中；Project Workflow 通过固定文件版本进行显式定制，内置 Workflow 保持只读并通过复制产生新版本。这样可以让 Workflow 与代码和文档一起经过 Git review，也避免 APP 数据库成为唯一存档。

## Status

accepted

## Consequences

- Workflow 的结构必须可序列化、可校验，并能引用 Skill Package 版本。
- UI 修改需要产生可查看的文件差异。
- 内置 Workflow、Project Workflow 和 Library 版本之间的关系必须清晰可追踪。
