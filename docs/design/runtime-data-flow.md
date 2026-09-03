# Runtime 数据流事件规范

## 目的

Runtime 数据流让用户在不打开 IDE 的情况下理解 Agent 正在做什么、发生了哪些可观察副作用、当前是否需要介入。MVP 的视觉和交互尽量贴近 Codex VS Code extension，但 Agent Space 增加 Workflow / Phase / Implementation Ticket 编排层。

## 双投影结构

```text
codex app-server notifications
              │
      Codex Session Module
        ┌─────┴──────────┐
        │                │
Display Projection   Control Projection
Codex Item 语义       provider-neutral Runtime Event
        │                │
Run Activity View    Workflow Engine
```

### Display Projection

Display Projection 保留允许展示的 Codex Item 身份、类型、状态和增量语义，以支持 Codex 风格的原位更新。它通过 Electron IPC 发送给 Renderer，不是 Workflow 状态事实来源。

### Control Projection

Control Projection 把 provider 事件归一化为 Runtime Event，供 Workflow Engine 推进 Step、保存 Artifact、进入 waiting / blocked / failed 或完成。Workflow Engine 不解析 Codex JSON-RPC、命令文本或 transcript。

这两个投影可以来自同一个原始通知，但用途和数据保留策略不同；不得让 Renderer 展示模型反向驱动 Workflow 状态。

## Display Item 类型

| Item | 运行中显示 | 完成后显示 | 默认展开策略 |
| --- | --- | --- | --- |
| Agent Message | 流式文字 | 最终面向用户的文字 | 展开 |
| Plan | Step 状态变化 | 最终 Plan 与各项状态 | 展开 |
| Command | 命令摘要、运行中 | exit code、耗时、输出摘要 | 完整输出折叠 |
| Tool | Tool 名称、参数摘要 | 成功/失败与结果摘要 | 结果折叠 |
| File Change | `Editing <path>` | `Edited <path> +x -y` | 文件列表可展开 |
| Question | 问题和可选项 | 用户回答摘要 | 展开 |
| Approval | 请求原因和允许决定 | 决定与最终 Item 状态 | 展开 |
| Error | 错误摘要 | 错误码、可恢复提示 | 展开 |
| Interrupt | 正在停止 | Turn 已 interrupted | 展开 |
| Final Response | 流式最终消息 | 稳定最终消息 | 展开 |

Renderer 可以用不同视觉样式呈现 Item，但必须保留稳定 Item identity、状态、顺序和可访问文本。

## Item 更新规则

1. `item/started` 创建 Item；delta 只更新同一 Item；`item/completed` 收敛最终状态。
2. Item identity 至少由 `runtimeProvider + threadId + turnId + itemId` 确定。
3. 重复通知必须幂等；已完成 Item 不因迟到的 started/delta 回退。
4. 最终 `item/completed` 是内容与状态的权威来源。
5. 未识别 Item 进入安全忽略路径并记录脱敏诊断，不导致 Turn 或 Workflow Run 失败。
6. Display Projection / IPC / Renderer 失败是观察性故障，不得中断 Codex Turn。
7. 历史重建使用同一投影契约，但不承诺重放实时 delta 的原始动画和到达时间。

## Runtime Event 契约

MVP 的 provider-neutral Runtime Event 至少包含：

| Event | Workflow Engine 用途 |
| --- | --- |
| `text_delta` | 更新允许持久化的 Phase Context 摘要，不作为完整 transcript |
| `tool_call` | 记录可观察工具结果或驱动声明的工具衔接 |
| `question` | 进入 `waiting` 并创建 Decision Record 继续位置 |
| `approval_required` | 保存最小请求定位并进入 `waiting` |
| `artifact_produced` | 注册 Artifact 元数据和来源 Step Execution |
| `status_changed` | 推进 `running`、`completed`、`blocked` 等业务状态 |
| `error` | 结束当前 attempt 或形成可恢复 blocker |

所有 Event 都应包含 `runId`、`executionId`、`source`，Codex 事件还包含 Runtime Locator。敏感字段在跨越 Module Interface 前完成脱敏。

## 文件修改与产出总结

File Change 是 Runtime Item，不是源文件 Artifact。单次修改完成后在活动流中显示路径、add/update/delete 和 `+x -y`。Ticket 完成时，按该 Ticket 的所有 attempts 聚合：

- 新增、修改、删除文件数量；
- additions / deletions；
- 测试、Review、Commit 状态；
- 关键 Artifact；
- 历史失败或中断次数。

不提供内置文件查看器。文件路径允许调用 Desktop Shell 在外部 IDE 中打开；完整 diff 和源码仍以 Workspace/Git 为事实来源。

## Question 与 Approval

Question 是 Agent 为继续当前逻辑工作单元而请求用户输入。用户回答形成 Decision Record，并在同一 Thread / attempt 内继续。

Runtime Approval 是 Codex App Server 的执行协议请求，必须响应原 server request；Workflow Approval Gate 是 Workflow Definition 的业务控制点。两者都在活动流中显示，但类型、决定集合和恢复规则不能混用。

运行时若审批请求在 Desktop Shell 重启后无法可靠关联，Step 进入 `blocked`，不得假设批准或拒绝。

## 隐私与安全

禁止进入 Display Projection 或持久 Runtime Event 的内容：

- hidden chain-of-thought 或原始 reasoning；
- token、password、authorization header、credential 和 secret；
- 未经脱敏的绝对敏感路径与环境变量；
- 原始 JSON-RPC payload；
- 未经 allowlist 的未知 Item 字段。

命令、Tool 和 File Change 只展示用户理解执行所需的最小信息。完整 Codex 历史由本地 Codex 持有，Agent Space SQLite 不复制 Agent Message、Command Output、Diff、Plan、Tool 结果或 provider transcript。

## 验收与测试 Seam

- Codex Session Module Interface：使用可控 transport 验证通知、delta、完成、中断、审批和未知 Item。
- Workflow Engine Interface：使用 fake Runtime Adapter 验证 Runtime Event 到 Run/Step 状态的映射。
- Run Activity View：验证 Item 原位更新、折叠、Live/Inspection Mode、历史合并和不可用状态。
- 恢复测试：验证多 Thread、多 Turn、多 attempt 的 Runtime Locator 顺序和幂等历史重建。
- 数据边界测试：验证 SQLite 不新增 Codex transcript 副本，reasoning 和 secret 不进入 IPC 或 UI。

## 官方能力依据

OpenAI 官方的 [Codex App Server](https://developers.openai.com/codex/app-server/) 文档定义了流式 Turn/Item 通知、`thread/read(includeTurns: true)`、`turn/interrupt` 以及命令和文件变更审批请求。Agent Space 的 Phase、Implementation Ticket、双投影和累计总结是产品自己的编排语义。
