# AI Agent Workspace UI Flow

## 1. 文档信息

- 文档名称：AI Agent Workspace UI Flow
- 对应需求文档：`docs/PRD.md`
- 对应技术设计：`docs/TECH_DESIGN.md`
- 对应 IPC 文档：`docs/IPC_API.md`
- 文档版本：v0.1
- 当前阶段：MVP UI 流程设计

## 2. UI 设计判断

MVP 不建议做营销首页或大幅装饰型界面。这个产品的核心是本地 AI 工作台，首屏应该直接服务于项目扫描、风险识别和进入工作窗口。

推荐 UI 方向：

- 安静、清晰、偏操作台。
- 信息密度适中，优先让用户知道“哪个项目需要处理”。
- 使用左侧导航 + 主工作区 + 右侧详情/检查器的结构。
- 工作窗口是主窗口内页面或标签，不强依赖多个原生 BrowserWindow。

## 3. 信息架构

```text
App
 ├─ First Run Onboarding
 ├─ Dashboard
 │   ├─ Project Cards
 │   ├─ Project Table
 │   └─ Risk / Recent Activity Panel
 ├─ Runtime Settings
 ├─ Agent Profile Settings
 ├─ Permission Settings
 ├─ Team Settings
 ├─ Project Detail
 │   ├─ Overview
 │   ├─ Work Sessions
 │   ├─ Context Items
 │   └─ Runtime History
 └─ Work Session
     ├─ Context Panel
     ├─ Message Stream
     └─ Inspector Panel
```

## 4. 全局布局

### 4.1 桌面主布局

```text
+----------------+--------------------------------+----------------------+
| Global Nav     | Main Content                   | Inspector / Summary  |
|                |                                |                      |
| Dashboard      | Project list / session / form  | Metrics / details    |
| Projects       |                                |                      |
| Runtimes       |                                |                      |
| Profiles       |                                |                      |
| Permissions    |                                |                      |
| Teams          |                                |                      |
+----------------+--------------------------------+----------------------+
```

左侧导航：

- Dashboard
- Projects
- Work Sessions
- Runtimes
- Agent Profiles
- Permissions
- Teams
- Settings

主内容区：

- 列表
- 表单
- 项目详情
- 工作窗口消息流

右侧区：

- 当前项目指标
- 当前 Runtime 状态
- 当前工作窗口设置
- 输入包和运行日志展开内容

### 4.2 窗口尺寸策略

- 桌面宽屏：三栏布局。
- 中等宽度：右侧 Inspector 可收起。
- 小宽度：左侧导航折叠为图标栏，Inspector 进入抽屉。

## 5. 首次启动流程

首次启动时，如果没有可用 Runtime，不进入空白 Dashboard，而是进入引导。

```text
Start
  -> Check runtime count
  -> none: Runtime setup
  -> has runtime but no team: optional Team setup
  -> Project wizard
  -> Dashboard or Project Detail
```

### Step 1：创建或导入 Runtime

内容：

- 新建 CLI Runtime
- 导入外部 Runtime 配置
- 检测命令

状态：

- 未填写命令：不能继续
- 检测失败：允许保存为禁用配置，但不能作为默认 Runtime
- 检测成功：可继续

### Step 2：可选创建 Team

内容：

- Team 名称
- 团队目标
- 成员列表
- 成员绑定 Runtime

规则：

- 已有 Runtime 时可跳过 Team。
- 没有 Runtime 时不能创建可用成员。

### Step 3：创建项目

进入项目创建向导。用户可以选择：

- 创建后进入 Dashboard
- 创建后进入项目详情
- 创建后打开首个工作窗口

## 6. Dashboard 流程

Dashboard 是常规首屏。

### 6.1 默认视图

主区域：

- 项目卡片视图
- 项目表格视图切换
- 风险筛选
- 阶段筛选
- 最近活动排序

右侧区域：

- 需要关注的项目
- 等待权限确认
- 最近失败
- 最近产出

项目卡片展示：

- 项目名称
- 模式：Team / 自由
- 当前阶段
- 风险状态
- 活跃窗口数量
- 运行中 Agent 数量
- 等待处理数量
- 出错数量
- 最近活动时间

### 6.2 主要操作

- 新建项目
- 打开项目
- 新建工作窗口
- 打开 Runtime 设置
- 查看风险项目

### 6.3 空状态

如果没有项目：

- 显示创建第一个项目入口
- 如果没有可用 Runtime，优先引导创建 Runtime

## 7. Runtime 设置流程

### 7.1 Runtime 列表

字段：

- 名称
- Provider
- 命令
- 默认状态
- 启用状态
- 最近检测结果
- 最近使用时间

操作：

- 新建
- 编辑
- 检测
- 导入外部配置
- 禁用
- 查看引用影响

### 7.2 Runtime 表单

分区：

- 基础信息
- CLI 命令
- 默认参数
- 工作目录策略
- Agent Profile 引用
- 权限设置
- Secret 引用
- 备注

交互：

- 命令检测按钮放在命令输入旁。
- Secret 输入提交后清空明文，只显示脱敏摘要。
- 权限设置允许绑定多个 Permission Policy Set。

### 7.3 外部 Runtime 配置导入

```text
Open import dialog
  -> Paste config text / paste deep link text / select file
  -> Auto detect format or choose format hint
  -> Preview
  -> Resolve conflicts
  -> Choose secret import
  -> Commit
  -> Optional command test
```

说明：

- deep link 只作为文本解析，不打开 ccswitch 或其他外部应用。
- UI 文案使用“导入外部 Runtime 配置”，识别成功后再显示“检测到 ccswitch Provider 配置”。

冲突操作：

- 新建并重命名
- 覆盖已有元数据
- 跳过

## 8. Agent Profile 与 Permission 流程

### 8.1 Agent Profile 页面

用途：

- 管理基础 Prompt
- 管理角色 Prompt 模板
- 管理默认参数
- 绑定权限设置
- 查看被引用关系
- 预览最终生效配置

列表字段：

- 名称
- 描述
- 权限摘要
- 输出风格
- 最近使用时间

### 8.2 Permission 页面

用途：

- 管理可复用权限设置
- 编辑权限规则
- 查看绑定对象

内置模板：

- Project Read Only
- Project Safe Write
- Command Approval
- Git Safe
- Network Restricted
- Env Minimal
- Full Access

权限规则编辑：

- Scope
- Action
- Decision
- Resources
- Description

绑定方式：

- 在 Permission 页面查看被哪些对象引用。
- 在 Runtime、Agent Profile、Team Member、Project、Session 表单中绑定权限设置。

最终权限预览：

- 显示继承来源
- 显示合并策略
- 显示最终规则摘要
- 高风险权限明确提示

## 9. Team 管理流程

### 9.1 Team 列表

字段：

- Team 名称
- 目标
- 成员数量
- 默认角色摘要
- 关联项目数量
- 最近使用时间

操作：

- 新建
- 编辑
- 复制
- 删除
- 查看影响范围

### 9.2 Team 编辑

分区：

- 基础信息
- 成员列表
- 分工规则
- 输出汇总规则

成员字段：

- 名称
- 角色
- Runtime
- Agent Profile
- 权限设置
- 任务说明
- 是否启用
- 排序

异常提示：

- 成员 Runtime 不可用
- 成员引用的 Agent Profile 被删除
- 权限设置被禁用

## 10. 项目创建向导

项目创建采用三步式。

### Step 1：基本信息

字段：

- 项目名称
- 项目描述
- 本地目录路径
- 当前阶段

校验：

- 项目名称必填
- 本地路径必填
- 路径不存在或不可访问时阻止继续
- 路径已被其他项目绑定时提示复用风险

### Step 2：协作对象

字段：

- 默认协作对象（单选）
- 项目级 Agent Profile
- 项目级权限设置
- 创建后默认动作

推导：

```text
if defaultAiTeamId:
  mode = team
else:
  mode = manual
```

交互：

- 选择 Team 后只读展示“Team 模式”。
- 选择 Runtime 后只读展示“自由模式”。
- 清空已选协作对象后展示“自由模式”。
- Team 和 Runtime 只能单选，切换选择时自动清空另一项。
- 如果所选 Team 存在不可用成员，展示警告。

### Step 3：确认

展示：

- 项目名称
- 本地路径
- 推导模式
- 默认 Team
- 默认 Runtime
- 默认动作

提交：

- 调用 `project:create`
- 成功后按默认动作跳转
- 如果默认动作失败，保留项目并提示

## 11. 项目详情流程

### 11.1 项目概览

区域：

- 项目基础信息
- 模式与协作对象
- 当前阶段
- 风险状态
- 指标摘要
- 最近输出
- 最近失败

操作：

- 编辑项目
- 切换默认 Team
- 切换默认 Runtime
- 新建工作窗口
- 打开项目目录
- 归档项目

### 11.2 工作窗口列表

字段：

- 窗口名称
- 当前执行者
- Runtime
- 状态
- 最近消息时间
- 任务摘要
- 父子关联标识

操作：

- 打开窗口
- 新建窗口
- 归档窗口
- 从窗口创建子任务

### 11.3 项目资料

内容：

- 项目简介
- 产品目标
- 技术栈
- 约束条件
- 手动文档片段
- 本地文件引用

规则：

- 本地文件默认只保存引用路径和摘要。
- 文件内容进入输入包前需要用户明确选择。
- 大文件默认只进入摘要或片段，完整注入需要用户明确确认。

## 12. 工作窗口流程

### 12.1 布局

```text
+----------------------+--------------------------------+----------------------+
| Context Panel        | Message Stream                 | Session Inspector    |
|                      |                                |                      |
| Project notes        | User message                   | Assignee             |
| Selected files       | Input summary                  | Runtime              |
| Snapshots            | Assistant answer               | Permission summary   |
| Child sessions       | Runtime details expandable     | Run details          |
+----------------------+--------------------------------+----------------------+
```

### 12.2 顶部栏

展示：

- 窗口名称
- 项目名称
- 当前状态
- 当前成员或 Runtime
- 停止按钮
- 重试按钮
- 归档按钮

状态：

- idle
- running
- waiting_input
- waiting_permission
- completed
- error
- archived

### 12.3 消息流

用户消息：

- 主文本
- 输入摘要
- 完整输入包展开入口

AI 消息：

- 成员标识
- 可读正文
- 结果摘要
- 运行细节展开入口

系统事件：

- 成员切换
- 任务转交
- 创建子窗口
- 运行中断
- 权限等待

### 12.4 发送消息

```text
User enters prompt
  -> select context items
  -> preview input summary
  -> send
  -> save user message
  -> create runtime run
  -> stream runtime events
  -> update assistant message
  -> update session/project metrics
```

发送前阻断：

- 没有可用 Runtime
- 当前窗口已有运行中任务
- 项目目录不可访问
- 权限规则要求先确认高风险操作

### 12.5 运行中

展示：

- 流式内容
- 当前 Run 状态
- Runtime 名称
- 工作目录
- 运行时间

操作：

- 停止
- 查看 Runtime Events
- 查看 stdout / stderr 摘要

### 12.6 等待输入

触发：

- CLI 请求用户补充信息

UI：

- 在消息流中显示阻塞原因
- 输入框保持可用
- 发送后继续同一个工作窗口流程

### 12.7 等待权限

触发：

- CLI 或应用权限策略请求确认

UI：

- 高优先级提示
- 展示请求来源
- 展示操作摘要
- 展示风险说明

操作：

- 允许一次
- 拒绝
- 调整权限设置

MVP 可以先记录权限请求事件，不做完整审批工单。

### 12.8 错误与恢复

错误类型：

- 命令不存在
- Runtime 不可用
- 认证失效
- 项目目录不可访问
- CLI 异常退出
- 输出解析失败

恢复入口：

- 重试
- 重新检测 Runtime
- 切换 Runtime
- 切换 Team 成员
- 打开 Runtime 设置
- 选择项目目录

## 13. 成员切换、转交与关联窗口

### 13.1 成员切换

流程：

```text
Open assignee selector
  -> choose team member or runtime
  -> if running: require stop first
  -> confirm
  -> insert member_switch message
  -> update session assignee
```

说明：

- 历史消息不变。
- 后续消息使用新执行者。

### 13.2 当前窗口内转交

流程：

```text
Click handoff
  -> choose target member
  -> edit handoff summary
  -> confirm
  -> insert handoff message
  -> switch active member
```

### 13.3 新开关联窗口

流程：

```text
Click create child session
  -> choose target member/runtime
  -> choose context refs
  -> create child session
  -> parent inserts child_session_created message
  -> navigate to child session
```

规则：

- 子窗口独立消息流。
- 父窗口归档不自动归档子窗口。
- UI 首版只展示直接父级和直接子级。

## 14. 输入包与运行细节展示

### 14.1 输入摘要

默认展示：

- 引用文件数量
- 项目资料数量
- 历史产出数量
- 当前成员
- Runtime
- 工作目录
- 权限摘要

### 14.2 完整输入包

默认折叠。

内容：

- 用户原始输入
- 项目上下文摘要
- 文件引用列表
- Team 成员任务说明
- Runtime System Prompt 摘要
- 执行元数据

要求：

- 敏感字段脱敏。
- 大文件内容默认只展示摘要。

### 14.3 运行细节

按类别折叠：

- tool_call
- file_change
- permission_request
- command_execution
- stderr
- status

主消息流默认只显示可读答案。

## 15. 上下文压缩流程

触发：

- 用户手动压缩
- 上下文过大提示

流程：

```text
Detect large context
  -> show warning
  -> preview preserved content
  -> user confirms
  -> create context_snapshot
  -> snapshot becomes reusable context item
```

规则：

- 上下文过大时不静默自动压缩
- 用户取消压缩时，不改写当前上下文
- 压缩结果必须保留关键问题、关键结论、关键决策、关键约束和来源引用

压缩结果展示：

- 当前任务目标
- 关键决策
- 关键结论
- 未决问题
- 关键约束
- 当前风险
- 下一步动作
- 来源引用

## 16. 非 MVP UI 暂缓

- 云同步设置
- 多用户团队协作
- 插件市场
- API Provider 完整配置页
- 多 Agent 自动编排可视化
- 原生多窗口管理器
- 完整 diff 审批工作台

## 17. 首版页面优先级

P0：

- First Run Onboarding
- Dashboard
- Runtime Settings
- Permission Settings
- Agent Profile Settings
- Project Wizard
- Project Detail
- Work Session

P1：

- Team Settings
- External Runtime Import
- Context Items
- Runtime Event Detail
- Project Metrics Table

P2：

- Context Compression
- Advanced Permission Preview
- Child Session Graph
- Archived Items Browser
