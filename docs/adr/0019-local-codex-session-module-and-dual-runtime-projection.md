# 使用本地 Codex Session Module、双投影与工作单元 Thread

V1 直接连接用户本机的 `codex app-server`，由一个深的 Codex Session Module 隐藏握手、Thread、Turn、中断、审批、历史恢复和 capability negotiation。该 Module 同时产生两种投影：Run Activity View 使用保留 Codex Item 语义的展示投影，Workflow Engine 只接收 provider-neutral Runtime Event；Discovery、Requirements、Planning、每个 Implementation Ticket 和 Product Verification 分别使用独立 Thread，同一逻辑工作单元内的暂停、回答、继续和失败重试通过同一 Thread 的多个 Turn 完成。这样既能贴近 Codex VS Code extension 的可观察交互，又不会让 Workflow Engine 依赖 Codex JSON-RPC。

## Status

accepted

## Consequences

- Step Execution 必须能够有序关联多个 Runtime Locator，而不能假设一次 attempt 只有一个 Turn。
- Agent Space 持久化 Workflow Run 控制状态和 Runtime Locator；完整 Codex 执行历史仍由本地 Codex 持有。
- 本地 Codex 缺失或不具备 MVP 所需能力时，Preflight 阻止启动；运行中升级后按能力兼容性判断是否继续。
- Codex 历史缺失时不得伪造空活动流：已完成 Run 降级显示业务状态，进行中的 Run 进入 blocked。
- 未来接入第二个 Agent Runtime 时，在既有 provider-neutral Seam 增加 Adapter，不要求其复制 Codex 展示协议。
