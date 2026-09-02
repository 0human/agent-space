# Run 状态机与 Codex Thread/Turn 映射

## 目标与边界

本文定义 Workflow Run、Step Execution、Codex Thread 和 Codex Turn 的映射。Workflow Engine 持有业务状态；Codex App Server 持有对话和执行历史。两者通过 Runtime Locator 关联，不共享事实所有权。

## Codex Session Module

Codex Session Module 是一个深 Module，其 Interface 向调用者提供：

- 检查本地 Codex 和所需能力；
- 为逻辑工作单元开始或恢复 Thread；
- 开始、继续或中断 Turn；
- 响应 Question 和 Runtime 审批；
- 订阅允许展示的 Item；
- 按 Runtime Locator 读取历史。

其 Implementation 隐藏本地进程、`initialize` / `initialized`、JSON-RPC、Thread/Turn 生命周期、审批请求、断线恢复、版本差异和脱敏。Workflow Engine 只跨 provider-neutral Seam 使用 Runtime Event；Renderer 不直接连接 App Server。

## Thread 范围

用户看到一条按 Workflow 顺序合并的连续活动流，但后端 Thread 按逻辑工作单元隔离：

| 工作单元 | Thread 策略 |
| --- | --- |
| Discovery | 一个独立 Thread |
| Requirements | 一个独立 Thread |
| Planning | 一个独立 Thread |
| Implementation Ticket | 每个 Ticket 一个独立 Thread |
| Product Verification | 一个独立 Thread |
| 确定性 Tool Step / Human Step | 默认不创建 Codex Thread |

Phase 和 Ticket 之间通过声明的 Artifact、Decision Record、Phase Context 和 Run 状态传递结果，不依赖无限增长的全局 Thread。

## Attempt、Thread 与 Turn

| 场景 | Thread | Turn | Step Execution attempt |
| --- | --- | --- | --- |
| 开始新的逻辑工作单元 | 新建 | 新建 | 新建 |
| `running` 时暂停 | 保持 | 当前 Turn 被中断 | 保持 |
| `paused` 后直接继续 | 保持 | 新建 | 保持 |
| `paused` 后发送指导 | 保持 | 新建 | 保持 |
| 回答 `waiting` Question | 保持 | 新建或恢复协议要求的原 Turn | 保持 |
| 响应 Runtime 审批 | 保持 | 原 Turn 继续 | 保持 |
| `failed` 后发送修复指导 | 保持 | 新建 | 新建 |
| 进入下一个 Implementation Ticket | 新建 | 新建 | 新建 |

Runtime 审批必须响应 App Server 发起的原请求；普通用户回答通过新的 `turn/start` 继续同一 Thread。若具体 App Server 请求要求在原 Turn 内响应，以协议语义优先，但不创建新的 Step Execution attempt。

## Runtime Locator

每个 Codex Turn 产生一个 Runtime Locator：

```ts
interface RuntimeLocator {
  runtimeProvider: 'codex'
  threadId: string
  turnId: string
  runtimeVersion?: string
}
```

目标模型中，一个 Step Execution attempt 按时间顺序关联 `runtimeLocators: RuntimeLocator[]`，并可标记当前活跃 locator。现有单个 `runtimeLocator` 字段需要兼容迁移为一元素数组，历史数据不得丢失。

用户看到的连续活动流按以下顺序合并：Workflow Phase 顺序 → Implementation Ticket 顺序 → Step Execution attempt → Runtime Locator → Runtime Item。Phase/Ticket 分隔符来自 Workflow 状态，不来自 Codex transcript。

## Workflow Run 状态机

```text
running ──pause/interrupt──> paused ──continue/send──> running
   │                            │
   ├──question/approval──────> waiting ──answer──────> running
   ├──recoverable blocker────> blocked ──retry───────> running
   ├──execution error────────> failed ──guidance────> running (new attempt)
   ├──all work complete──────> completed
   └──end Run────────────────> cancelled

paused/waiting/blocked/failed ──end Run──────────────> cancelled
```

`interrupting` 是 Renderer 在发出 `turn/interrupt` 后、收到 Turn `interrupted` 完成状态前的瞬时 UI 状态，不作为独立的 Workflow Run 持久状态。

### 状态不变量

- `running`：至多一个活跃 Turn；用户不能发送新内容。
- `paused`：没有活跃 Turn，但保留当前 Phase、Ticket、Step、Thread 和 attempt。
- `waiting`：存在可定位的 Question、Runtime 审批或 Approval Gate。
- `blocked`：APP 无法安全自动继续，必须带原因和明确恢复动作。
- `failed`：当前 attempt 已结束；用户指导创建新 attempt，但复用同一逻辑工作单元 Thread。
- `completed` 与 `cancelled`：MVP 终态；不接受新输入。
- “结束 Run”不会修改或回滚 Workspace。

## 暂停与继续

暂停调用 `turn/interrupt`。成功后当前 Turn 以 `interrupted` 结束，尚未完成的 Runtime Item 显示为 interrupted，Run 进入 `paused`。已产生的文件修改和命令副作用保持原状。

继续时，在同一 Thread 创建新 Turn。它接收当前 Phase Context、Decision Record、Artifact 和“继续当前 Step”的控制输入，并追加新的 Runtime Locator；不会创建新的 attempt。

## 失败重试

当 Turn 或 Step 失败时：

1. 当前 Step Execution attempt 标记为 `failed`；
2. 活动流保留错误和已有修改摘要；
3. 用户发送指导后创建下一个 attempt；
4. 新 attempt 复用当前逻辑工作单元 Thread，但创建新 Turn 和 Runtime Locator；
5. Ticket 累计总结按所有 attempts 计算，并区分最终成功与历史失败。

## 历史恢复

Agent Space 持久化 Workflow Run、Run Snapshot、Step Execution、Runtime Locator、Decision Record 和 Artifact，不复制完整 Codex transcript。

重新打开 Run 时：

1. 读取本地 Workflow 状态；
2. 对每个 Runtime Locator 使用 `thread/read(includeTurns: true)` 或等价稳定能力读取 Thread；
3. 严格按 `turnId` 选择 Turn；
4. 通过与实时模式相同的 Item Projection 重建活动流；
5. 将多个 Thread/Turn 按 Workflow 顺序合并。

历史缺失的处理：

- 已完成 Run：保留 Phase、Ticket、Artifact、Decision Record 和最终总结，明确标记“Codex 执行历史不可用”；
- 进行中 Run：进入 `blocked`，不得静默创建替代 Thread；
- 用户未来可以从现有 Artifact 重建新 Thread，但必须留下缺失记录；此恢复入口不属于 MVP。

## Preflight 与运行中升级

Preflight 必须定位用户本机 `codex`，完成连接初始化并检查 MVP 依赖的方法、事件和字段。缺失 Codex 或必要能力时阻止 Run，展示可执行路径、检测到的版本、缺失能力以及安装/更新建议，不提供其他 Runtime fallback。

运行中 Codex 升级后重新连接时执行 capability negotiation：

- 所需能力兼容：继续恢复 Thread；
- 所需能力不兼容或无法安全确认：Run 进入 `blocked`；
- 不因版本字符串变化本身阻止执行。

Agent Space 继承本地 Codex 的登录、模型配置和 MCP/tool 环境，同时显式传递 Workspace、Workflow Skill、Permission Policy、sandbox 与 approval policy；本地更宽权限不能绕过 Project Permission Policy。

## 官方能力依据

OpenAI 官方文档说明 Codex App Server 用于构建包括 VS Code extension 在内的 rich client，支持 authentication、conversation history、approvals 和 streamed agent events；稳定接口包含 `thread/start`、`thread/resume`、`thread/read`、`turn/start` 和 `turn/interrupt`。参见 [Codex App Server](https://developers.openai.com/codex/app-server/)。
