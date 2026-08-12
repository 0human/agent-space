# 使用 Electron 并保持 APP 数据本地优先

V1 使用 Electron 同时支持 macOS、Linux 和 Windows。Workflow 状态、对话、日志和 Artifact 索引默认保存在本机；APP 不把 Project 内容或执行数据上传到 App-owned Server，也不启用强制遥测。这个边界不禁止用户明确授权的 External Destination：例如向 GitHub push、创建 PR，或按 Agent Runtime provider 的协议把必要上下文发送给远程模型。每个需要网络或向外部服务传输数据的 Step 都必须在 Preflight 和执行界面中标明目标与权限；未来若增加诊断上传，必须单独征得用户同意并脱敏。

## Status

accepted

## Consequences

- “不上传源代码”仅表示不上传到 App-owned Server 或未授权的遥测服务，不影响用户授权的 GitHub push/PR。
- 使用远程 Agent Runtime 时，APP 必须显示其数据传输边界，不能宣称该步骤完全离线。
- Desktop Shell 的实现选择不改变 Workflow Definition、Skill Package 或 Run 状态模型。
