# V1 中文优先并预留英文国际化

APP 的 Primary UI Language 在 V1 固定为 Simplified Chinese，内置 Development Workflow 的用户可见标题、状态、Approval Gate 和错误说明也以中文为默认。领域术语保留稳定的 English code identifiers（如 `Workflow Run`、`Artifact`、`Skill`），便于与现有 Skill 和代码生态对应；所有用户可见文案通过可替换的本地化资源组织，为后续增加 English 留出边界。V1 不要求完整双语覆盖。

## Status

accepted

## Consequences

- 首版验收、帮助信息和错误处理以中文为准。
- Workflow File、Skill Manifest 和 API 字段不因界面语言翻译而改变。
- 新增 English 时需要为内置文案补齐资源和语言切换，而不是重写领域模型。
