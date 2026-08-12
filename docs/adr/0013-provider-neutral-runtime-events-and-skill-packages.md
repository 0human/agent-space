# 使用 Provider-neutral Runtime Event 和通用 Skill Package

Agent Runtime Adapter 将 Codex 或其他 provider 的输出转换为统一的 Runtime Event（text_delta、tool_call、question、approval_required、artifact_produced、status_changed、error），Workflow 引擎不解析 provider 特有的 transcript 或 CLI 格式。APP 同时定义通用 Skill Package Format：`skill-manifest.json` 加上 `skills/<skill-name>/SKILL.md`，可选 references、scripts 和 assets；现有 Codex plugin 可以通过 importer 转换或兼容读取。这样 Workflow 和安装协议不会被单一 Runtime 或 plugin 目录锁定。

## Status

accepted

## Consequences

- 每个 Agent Runtime 都需要实现 Adapter，而不是让 Workflow 直接调用 provider。
- Adapter 必须保留数据来源、权限和错误信息，不能只返回拼接后的文本。
- Skill Package 的 manifest 是安装和 Preflight 的机器可读入口，Skill 行为仍由 `SKILL.md` 定义。
