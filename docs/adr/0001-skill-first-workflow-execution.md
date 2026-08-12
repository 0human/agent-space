# Workflow 以 Skill 为行为来源

Workflow 的编排层不在 APP 内复制业务 prompt 或创建隐藏的 internal skill；所有需要 agent 推理、访谈或生成内容的行为都由可追踪版本的 Skill Package 提供。内置 Workflow 可以随 APP 分发固定版本的 Built-in Skill，外部 Workflow 则声明 Skill 依赖并通过本地文件或联网方式安装；APP 只负责组织 Workflow 状态、权限、工具调用和 Approval Gate。这样可以复用现有 engineering skills，并让后续 Workflow 类型与 agent runtime 保持可扩展。

## Status

accepted

## Considered Options

- 在 APP 内维护一套独立 prompt 和 internal skill：实现直接，但会复制现有能力并使 Skill 与 APP 分叉。
- 所有能力都要求联网获取：可保持更新，但无法离线运行内置 Workflow。
