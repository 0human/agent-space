# AI Agent Workspace MVP UI Flow

## 1. UI 原则

MVP 不做营销页，不做完整 IDE。首屏是多项目 Agent 状态工作台。

界面目标：

- 快速知道哪些项目正在跑 Agent。
- 快速进入需要处理的项目或工作窗口。
- 把项目想法推进成任务和交付物。

## 2. 全局布局

```text
+----------------+-------------------------------+----------------------+
| Nav            | Main                          | Inspector            |
|                |                               |                      |
| Dashboard      | Project / Session / Planning  | Status / Logs        |
| Projects       |                               |                      |
| Runtimes       |                               |                      |
| Teams          |                               |                      |
+----------------+-------------------------------+----------------------+
```

MVP 导航只保留：

- Dashboard。
- Projects。
- Work Sessions。
- Runtimes。
- Teams。

暂不显示不参与 MVP 主链路的高级入口。

## 3. Dashboard

Dashboard 是主窗口默认页。

展示：

- 项目列表。
- 每个项目的运行中 Agent 数。
- 等待输入数。
- 错误数。
- 最近产出时间。
- 当前阶段。

操作：

- 新建项目。
- 打开项目详情。
- 打开运行中的 Work Session。
- 新建 Runtime。

空状态：

- 没有 Runtime：引导创建 Runtime。
- 有 Runtime 但没有项目：引导创建项目。

## 4. Runtime 页面

列表字段：

- 名称。
- Provider。
- 命令。
- 启用状态。
- 最近检测结果。

表单字段：

- 名称。
- Provider。
- 可执行命令。
- 默认参数。
- 工作目录策略。
- 是否启用。

操作：

- 新建。
- 编辑。
- 检测命令。
- 禁用。

## 5. Team Lite 页面

列表字段：

- Team 名称。
- 目标。
- 成员数量。

成员字段：

- 名称。
- 角色。
- 绑定 Runtime。

MVP 不展示复杂规则配置。

## 6. Project Detail

项目详情包含标签：

- Overview。
- Brief。
- Blueprint。
- Tasks。
- Sessions。
- Deliverables。
- Files。

### 6.1 Overview

展示：

- 项目名称。
- 本地路径。
- 当前阶段。
- 默认 Runtime 或 Team。
- 运行状态摘要。

### 6.2 Brief

操作：

- 编辑原始想法。
- 编辑结构化摘要。
- 保存。
- 从 Brief 生成 Blueprint。

### 6.3 Blueprint

操作：

- 查看生成的蓝图。
- 编辑目标、范围、技术摘要、里程碑、风险。
- 生成任务。

### 6.4 Tasks

展示：

- 标题。
- 类型。
- 推荐角色。
- 状态。
- 关联 Session。

操作：

- 编辑任务。
- 启动 Session。
- 标记 done/cancelled。

### 6.5 Sessions

展示该项目下的工作窗口：

- 标题。
- 当前执行者。
- 状态。
- 最新运行。
- 最近消息时间。

### 6.6 Deliverables

展示：

- 标题。
- 类型。
- 来源任务。
- 来源 Session。
- 创建时间。

### 6.7 Files

MVP 只做：

- 简单文件树。
- 只读文本预览。
- 选择为上下文。

## 7. Work Session

布局：

```text
+----------------------+------------------------+
| Message Stream       | Run Logs / Inspector   |
|                      |                        |
| User / Assistant     | Runtime Run            |
|                      | stdout / stderr        |
+----------------------+------------------------+
| Input box                                      |
+------------------------------------------------+
```

操作：

- 发送消息。
- 停止运行。
- 查看日志。
- 保存某条输出为 Deliverable。

## 8. UI 边界

MVP UI 只服务 Dashboard、Project Detail、Runtime、Team Lite 和 Work Session。
