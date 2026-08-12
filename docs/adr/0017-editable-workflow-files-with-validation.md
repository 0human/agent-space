# 允许手动编辑 Workflow File 但必须通过校验

用户可以直接编辑 Workflow File；APP 负责 schema 校验、Skill 依赖检查、权限检查和可视化预览。校验通过后，APP 重新加载文件并展示变更；校验失败时不能启动新的 Workflow Run。内置 Workflow 保持只读，用户必须复制为 Project Workflow 或新的 Library 版本后再编辑。这样 Workflow 既能被 Git 和人工工具直接修改，又不会在运行时静默接受不完整或不安全的定义。

## Status

accepted
