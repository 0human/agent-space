# AI Agent Workspace PRD

## 1. 文档信息

- 产品名称：AI Agent Workspace
- 产品形态：Electron 桌面应用
- 文档版本：v0.1
- 当前阶段：需求分析
- 目标平台：macOS、Windows，后续可扩展 Linux

## 2. 产品概述

AI Agent Workspace 是一个面向个人开发者、AI 工具使用者和小型团队的桌面端 AI 工作台。它优先面向命令行 Agent 工具和 AI Team 的接入与管理，并以“项目”为单位组织多个 AI 工作窗口。

用户可以在创建项目时选择两种模式：`Team 模式` 或 `自由模式`。在 Team 模式下，用户先创建一个 AI Team，为团队中的不同成员配置角色和 CLI Agent Runtime；项目绑定默认 Team，随后工作窗口可以由 Team 自动分工，也可以由用户手动指定成员执行需求分析、架构设计、代码实现、测试审查、文档整理等任务。在自由模式下，项目不绑定 Team，用户直接手动打开多个工作窗口并选择不同的 CLI Agent Runtime。产品的核心目标是让用户更稳定、更清晰地管理多个 CLI Agent 在多个项目中的协作上下文，而不是把所有任务混在单一聊天窗口里。API Provider 接口作为后续扩展能力保留。

## 3. 背景与问题

当前用户在使用多个 AI 工具时，常见问题包括：

- 不同 CLI Agent、模型、登录状态和参数配置分散，切换成本高。
- 同一个项目的需求、设计、代码、测试讨论散落在不同聊天记录中，难以追踪。
- 多个 AI 同时参与项目时，任务边界和上下文容易混乱。
- 每次新开任务都需要重复粘贴项目背景、技术栈、约束条件。
- 缺少以项目为中心的 AI 工作记录沉淀。
- 桌面端对本地项目目录、文件上下文和隐私控制有更强需求。

本产品通过“AI Runtime 配置管理 + AI Team 管理 + 项目管理 + 工作窗口管理”的方式解决这些问题。

## 4. 产品目标

### 4.1 业务目标

- 提供一个统一的桌面端入口，优先管理多个 CLI Agent Runtime 配置和 AI Team。
- 支持以项目为单位沉淀 AI 工作过程和结果。
- 支持同一项目下多个 AI 工作窗口并行运行。
- 为后续 Agent 编排、自动任务流和本地代码操作打基础。

### 4.2 用户目标

- 快速创建 AI Team，或直接以自由模式创建项目。
- 为不同任务选择合适的 Team、Team 成员或单独的 Runtime。
- 清楚知道每个 AI 工作窗口在做什么、用的是什么配置、产出了什么结果。
- 避免不同项目、不同 AI、不同任务之间的上下文混淆。
- 安全地保存 CLI 凭据、对话历史和项目资料。

## 5. 目标用户

### 5.1 个人开发者

需要在多个项目中使用不同 AI 模型完成需求分析、编码辅助、测试生成和代码审查。

### 5.2 AI 工具重度用户

经常在 Claude Code、Codex CLI、Gemini CLI、本地 Agent 工具之间切换，需要统一管理配置和历史记录。

### 5.3 小型团队或独立产品团队

希望围绕一个产品项目沉淀 AI 参与过的需求、设计、开发和测试记录。

## 6. 核心概念

### 6.1 AI Runtime 配置

AI Runtime 配置表示一个可被工作窗口使用的 AI 运行配置。MVP 阶段优先支持通过本地 CLI 启动的 Agent 工具，API Provider 作为后续扩展能力预留。

AI Runtime 分为两类：

- CLI Agent：通过本地命令行工具启动完整 Agent，例如 Claude Code CLI、Codex CLI、Aider 或自定义脚本。
- API Provider：通过 HTTP API 调用远程或本地模型，后续版本接入。

示例：

- Claude Code CLI 项目分析助手
- Codex CLI 前端开发助手
- Gemini CLI 研究助手
- Custom CLI 自动化助手

### 6.2 项目

项目是 AI 工作的组织单位。一个项目可以关联本地目录、项目说明、阶段状态、文档资料、可选的默认 AI Team 和多个工作窗口。

项目支持两种模式：

- Team 模式：项目绑定默认 AI Team，新建工作窗口时默认继承 Team 或 Team 成员
- 自由模式：项目不绑定 Team，用户手动创建多个工作窗口并分别选择 AI Runtime

### 6.3 AI Team

AI Team 是一组具备明确分工的 AI 成员集合。每个成员绑定一个 CLI Agent Runtime，并承担特定角色，例如需求分析、架构设计、编码实现、测试审查或结果汇总。

AI Team 不只是配置分组，还应包含：

- 团队名称
- 团队目标
- 成员角色
- 成员默认 Runtime
- 分工规则
- 任务路由规则
- 汇总输出规则

一个 AI Team 可以被多个项目复用。项目在创建时可以选择默认 Team，也可以跳过 Team 进入自由模式。后续任务可以继承该 Team，也可以手动覆盖。

### 6.4 工作窗口

工作窗口是一次独立的 AI 工作空间。每个窗口属于一个项目，并绑定一个 AI Team、Team 中的特定成员，或直接绑定单独的 AI Runtime。窗口拥有独立的对话历史、上下文选择、任务目标、运行状态和进程状态。

### 6.5 项目上下文

项目上下文是 AI 可以参考的信息集合，包括项目说明、需求文档、技术栈说明、用户选择的本地文件和历史产出。

## 7. 使用场景

### 7.1 新建 AI Runtime 配置

用户打开应用后，进入 AI Runtime 配置页，优先添加 CLI Agent Runtime，填写可执行命令、默认参数、工作目录策略和权限策略。用户点击“检测命令”，确认配置可用后保存。API Provider 配置入口在后续版本开放。

### 7.2 创建 AI Team

用户创建一个 AI Team，为团队命名并设置团队目标，然后从已存在的 CLI Agent Runtime 中选择多个成员。每个成员可以指定角色，例如需求分析、架构设计、开发实现、测试审查和结果汇总。

### 7.3 创建项目

用户创建一个新项目，填写项目名称、项目描述和本地项目目录，并选择项目模式：

- Team 模式：选择一个默认 AI Team
- 自由模式：不选择 Team，直接进入项目工作台

应用保存项目基础信息，并进入项目工作台。

### 7.4 打开需求分析窗口

用户在项目中创建新工作窗口：

- 如果项目为 Team 模式，窗口默认继承项目绑定的 AI Team，并由 Team 中的“需求分析成员”执行任务
- 如果项目为自由模式，用户手动选择一个 CLI Agent Runtime 执行任务

用户输入任务目标：“分析这个 AI 工具的产品需求并输出 PRD”。AI 在该窗口中独立对话，结果保存到项目历史中。

### 7.5 同一项目中使用多个 AI

用户继续打开另一个工作窗口：

- 在 Team 模式下，选择沿用项目默认 Team，或手动指定 Team 中的“架构设计成员”或“开发实现成员”
- 在自由模式下，手动选择另一个 CLI Agent Runtime

让它基于需求文档设计 Electron 技术架构或执行代码任务。两个窗口互不干扰，但都属于同一项目。

### 7.6 复用历史结果

用户在新的工作窗口中选择引用之前的 PRD 或架构文档，作为当前 AI 的上下文输入。

## 8. 功能范围

### 8.1 MVP 范围

第一阶段需要实现：

- AI Runtime 配置管理
- AI Team 管理
- 项目管理
- Team 模式与自由模式
- 工作窗口管理
- 单工作窗口 CLI Agent 对话与任务执行
- 创建项目时可选择默认 AI Team，也可跳过 Team
- 每个工作窗口绑定一个 AI Team、Team 成员或单独的 AI Runtime
- 对话历史本地保存
- 项目基础资料管理
- 本地项目目录关联
- 基础文件选择与上下文注入
- CLI Agent 调用失败提示与重试
- ccswitch 格式配置导入
- CLI Agent 可执行命令检测
- CLI Agent 基础进程启动、停止和输出记录

### 8.2 非 MVP 范围

第一阶段暂不实现：

- API Provider 接入与管理
- 多 AI 自动任务调度
- Agent 自动协作编排
- CLI Agent 自动修改本地代码后的复杂回滚
- CLI Agent 自动执行高风险终端命令
- 团队协作和云同步
- 插件市场
- 权限复杂审批流
- 完整知识库向量检索

这些能力应作为后续版本的扩展方向。

## 9. 功能需求

### 9.1 AI Runtime 配置管理

#### 9.1.1 配置列表

用户可以查看所有已保存的 AI Runtime 配置。

列表字段：

- 配置名称
- Runtime 类型：CLI Agent
- CLI 类型
- 默认命令
- 是否默认
- 最近使用时间
- 连接状态

#### 9.1.2 新建配置

用户可以新建 AI Runtime 配置。

必填字段：

- 配置名称
- CLI 类型
- CLI 可执行命令
- 默认命令参数

可选字段：

- CLI 工作目录策略
- CLI 默认参数
- 系统提示词
- 是否启用流式输出
- 权限策略

#### 9.1.3 编辑配置

用户可以修改已有配置。修改后，新建工作窗口使用新配置；已存在工作窗口是否同步更新由用户确认。

#### 9.1.4 删除配置

用户可以删除 AI Runtime 配置。如果配置正在被工作窗口使用，应用需要提示影响范围。

#### 9.1.5 测试连接

用户可以在保存前或保存后检测命令。测试结果包括：

- 成功
- CLI 命令不存在
- CLI 版本不兼容
- CLI 未登录或认证状态不可用
- CLI 启动失败

#### 9.1.6 导入配置

用户可以从外部配置导入 AI Runtime 配置。MVP 阶段优先支持 ccswitch 中与 CLI Agent 相关的 Provider 导入格式。

支持的导入来源：

- ccswitch deep link：`ccswitch://v1/import?resource=provider&...`
- ccswitch 导出的 Provider 配置片段
- ccswitch 数据备份中的 Provider 配置，首版可先支持用户选择性导入，不直接覆盖本应用数据库

ccswitch Provider 字段映射：

- `app` 映射为目标 CLI 类型，例如 `claude`、`codex`、`gemini`、`opencode`、`openclaw`
- `name` 映射为 Runtime 配置名称
- `endpoint` 映射为 CLI 相关端点信息或保留为原始配置摘要
- `apiKey` 映射为待加密保存的凭据字段，仅在目标 CLI Agent 确实需要时导入
- `model` 映射为默认模型或默认模型偏好
- `config` 和 `configFormat` 映射为原始配置内容和格式
- `notes` 映射为配置备注
- `enabled` 映射为是否启用

导入流程：

- 用户粘贴 deep link、选择文件或粘贴配置文本。
- 应用解析并展示导入预览。
- 应用提示是否包含敏感字段，例如 API Key、Token、Usage API Key 或 CLI 凭据字段。
- 用户选择导入为新的 Runtime 配置，或合并到已有配置。
- 如果配置名称重复，应用提供重命名、覆盖、跳过三种处理方式。
- 导入完成后，应用执行 CLI 命令检测。

导入限制：

- 仅从可信来源导入配置。
- 默认不自动启用导入配置，需要用户确认。
- 默认不自动写入 Claude Code、Codex 等外部 CLI 的真实配置目录。
- ccswitch 数据库备份导入不得覆盖本应用数据库。

### 9.2 项目管理

#### 9.2.1 项目列表

用户可以查看所有项目。

列表字段：

- 项目名称
- 本地路径
- 当前阶段
- 最近活动时间
- 工作窗口数量
- 活跃窗口数量
- 运行中 CLI Agent 数量
- 等待用户输入数量
- 等待权限确认数量
- 出错窗口数量
- 最近失败时间
- 最近产出时间
- 最近使用的 CLI Agent 类型
- 文件变更数量摘要
- 风险状态

项目列表需要支持在主工作台中以“指标卡片”或“增强表格”的方式展示，用户应能在不进入项目详情的情况下快速判断项目当前状态。

风险状态建议分为：

- 正常：最近无错误，且没有等待处理项
- 关注：存在等待用户输入或等待权限确认的窗口
- 风险：存在出错窗口、最近运行失败或未处理冲突

项目列表应支持按以下指标排序或筛选：

- 最近活动时间
- 风险状态
- 运行中 CLI Agent 数量
- 出错窗口数量
- 当前阶段

#### 9.2.2 新建项目

用户可以创建项目。

字段：

- 项目名称
- 项目描述
- 本地目录路径
- 当前阶段
- 项目模式：Team / Manual
- 默认 AI Team（可选）

规则：

- 选择 Team 模式时，默认 AI Team 为必填
- 选择自由模式时，默认 AI Team 为空
- 自由模式项目创建后，用户可直接新建工作窗口并手动选择 AI Runtime
- 自由模式项目后续可以升级为 Team 模式

#### 9.2.3 编辑项目

用户可以修改项目名称、描述、阶段、本地目录路径、项目模式和默认 AI Team。

#### 9.2.4 删除或归档项目

用户可以归档项目。删除项目时需要二次确认，并说明是否删除本地对话历史数据。

删除与归档策略：

- 归档项目后，项目默认不出现在活跃项目列表中，但历史数据保留
- 归档项目下的工作窗口默认一并归档，但不删除历史消息和运行记录
- 删除项目时需要明确提示将影响的内容，包括工作窗口、关联窗口、对话历史、运行日志和上下文缓存
- 删除项目默认不删除被项目引用的 AI Team 和 AI Runtime 配置
- 删除项目时，用户可选择：
  - 仅删除项目记录，保留本地历史数据
  - 删除项目记录及本地历史数据
- 如果项目下存在关联工作窗口，删除确认中需要展示关联窗口数量
- 删除完成后，所有指向该项目的工作窗口、关联窗口和缓存索引都必须失效

#### 9.2.5 项目关键指标

主工作台中的项目列表需要聚合并展示每个项目的关键指标，用于帮助用户快速识别优先级、风险和活跃度。

MVP 阶段建议展示的核心指标：

- 当前阶段
- 活跃窗口数量
- 运行中 CLI Agent 数量
- 等待用户输入数量
- 等待权限确认数量
- 出错窗口数量
- 最近活动时间
- 最近产出时间
- 最近使用的 CLI Agent 类型
- 文件变更数量摘要

指标口径定义：

- 活跃窗口数量：未归档且最近 24 小时内有消息、状态变更或运行事件的窗口数量
- 运行中 CLI Agent 数量：当前状态为“生成中”的工作窗口数量
- 等待用户输入数量：当前状态为“等待用户输入”的工作窗口数量
- 等待权限确认数量：当前状态为“等待权限确认”的工作窗口数量
- 出错窗口数量：当前状态为“出错”的工作窗口数量
- 最近活动时间：项目内最近一次用户消息、AI 输出、状态切换或文件变更事件发生时间
- 最近产出时间：项目内最近一次成功生成 AI 输出的时间
- 文件变更数量摘要：项目内未归档窗口最近一次任务产生的文件变更总数摘要

指标设计原则：

- 优先展示“现在是否需要我处理”的状态指标
- 其次展示“项目是否活跃”的活跃度指标
- 最后展示“最近发生了什么”的历史指标

如果指标过多，主工作台默认展示最关键的 5 至 7 项，其他指标可在项目悬浮详情、展开面板或右侧概览区查看。

#### 9.2.6 创建项目交互规格

创建项目流程需要支持 Team 模式和自由模式两条路径，并保证新用户可以快速完成首次项目创建。

入口：

- 主工作台顶部“新建项目”按钮
- 左侧项目导航中的“新建项目”
- 空状态页中的“创建第一个项目”

推荐使用分步式创建流程，共 3 步：

1. 基本信息
2. 模式与协作设置
3. 创建确认

第一步：基本信息

字段：

- 项目名称
- 项目描述
- 本地目录路径
- 当前阶段

交互要求：

- 项目名称为必填
- 本地目录路径为必填
- 支持文件夹选择器选择本地目录
- 如果目录不存在或不可访问，需要即时提示
- 如果目录已被其他项目绑定，需要提示用户继续复用或取消创建

第二步：模式与协作设置

字段：

- 项目模式：Team / Manual
- 默认 AI Team
- 创建后默认动作

Team 模式交互：

- 用户选择 Team 模式后，默认 AI Team 为必填
- 展示可选 Team 列表，包括 Team 名称、团队目标、成员数量和最近使用时间
- 支持在当前流程中快捷新建 AI Team
- 如果所选 Team 的成员 Runtime 缺失或不可用，需要展示警告

自由模式交互：

- 用户选择自由模式后，隐藏默认 AI Team 必填约束
- 展示说明：创建后可直接打开多个工作窗口并手动选择不同 Runtime
- 可选设置“创建后自动打开一个空白工作窗口”

创建后默认动作：

- 仅创建项目并进入项目详情
- 创建项目并打开首个工作窗口
- 创建项目并进入项目工作台概览

第三步：创建确认

确认信息需要展示：

- 项目名称
- 本地目录路径
- 项目模式
- 默认 AI Team 或“未设置”
- 创建后默认动作

用户点击“创建项目”后，应用执行：

- 校验本地目录
- 保存项目记录
- 保存模式和 Team 绑定关系
- 根据默认动作决定后续跳转

创建成功后的默认行为：

- Team 模式下，如果用户选择“创建后打开首个工作窗口”，应用优先建议使用 Team 中的默认成员
- 自由模式下，如果用户选择“创建后打开首个工作窗口”，应用弹出 Runtime 选择器
- 创建完成后，项目应立即出现在主工作台项目列表中

异常与边界处理：

- 如果创建过程中目录失效，需要阻止创建并提示重新选择
- 如果 Team 模式下所选 Team 被删除或不可用，需要要求用户重新选择 Team
- 如果没有任何可用 Runtime，应用需要提示先去创建 AI Runtime 配置
- 如果用户中途取消创建，不应产生半成品项目记录

#### 9.2.7 首次启动与创建前引导

首次启动应用时，需要提供最小可用的引导流程，避免用户在没有 Runtime 或 Team 的情况下直接卡在创建项目环节。

推荐引导顺序：

1. 创建或导入第一个 AI Runtime
2. 可选创建第一个 AI Team
3. 进入创建项目向导

引导规则：

- 如果没有任何可用 Runtime，应用优先引导用户进入 Runtime 配置页
- 如果已有 Runtime 但没有 Team，允许用户直接以自由模式创建项目
- 如果用户已有 Team，创建项目时默认高亮最近使用的 Team
- 首次启动的引导流程应支持跳过可选步骤，但不能跳过 Runtime 创建

### 9.3 AI Team 管理

#### 9.3.1 Team 列表

用户可以查看所有 AI Team。

列表字段：

- Team 名称
- 团队目标
- 成员数量
- 默认成员角色摘要
- 关联项目数量
- 最近使用时间

#### 9.3.2 新建 Team

用户可以创建 AI Team。

字段：

- Team 名称
- 团队目标
- 团队描述
- 默认启动模式
- 成员列表

每个成员需包含：

- 成员名称
- 成员角色
- 绑定的 AI Runtime 配置
- 是否默认启用
- 任务说明

#### 9.3.3 编辑 Team

用户可以修改 Team 名称、目标、成员和分工规则。修改后，新创建项目默认使用更新后的 Team；已绑定该 Team 的项目是否同步成员变更由用户确认。

如果 Team 成员绑定的 Runtime 被删除、失效或不可用，应用需要在 Team 编辑页和项目创建流程中明确提示受影响成员。

#### 9.3.4 复用 Team

一个 AI Team 可以被多个项目复用。项目在创建时选择默认 Team，后续也允许切换默认 Team。

#### 9.3.5 Team 分工规则

AI Team 需要支持基础分工配置，包括：

- 哪些角色用于需求分析
- 哪些角色用于架构设计
- 哪些角色用于开发实现
- 哪些角色用于测试审查
- 哪些角色用于结果汇总

MVP 阶段可以先支持手动配置和手动选择成员，后续版本再扩展自动任务路由。

### 9.4 工作窗口管理

#### 9.4.1 新建工作窗口

用户可以在项目内新建工作窗口。

字段：

- 窗口名称
- 任务目标
- AI Team（可选）
- Team 成员（可选）
- AI Runtime（可选）
- 初始上下文

规则：

- 如果项目已绑定默认 AI Team，新建工作窗口时默认继承该 Team。用户可以直接使用 Team 默认成员，也可以手动指定某个成员执行。
- 如果项目为自由模式，用户直接选择一个 AI Runtime。
- Team 模式下，用户仍可绕过 Team，直接手动选择单独的 AI Runtime。

Runtime 不可用时的回退策略：

- 如果默认 Team 成员绑定的 Runtime 不可用，窗口创建时需要提示用户重新选择成员或改为手动选择 Runtime
- 如果自由模式下所选 Runtime 不可用，需要阻止创建并提示修复配置
- 如果已创建窗口的当前 Runtime 在运行前变为不可用，需要阻止启动并显示恢复入口
- 恢复入口至少包括：重新选择 Runtime、切换成员、打开 Runtime 配置页

#### 9.4.2 工作窗口列表

项目内展示所有工作窗口。

列表字段：

- 窗口名称
- 绑定 AI Team
- 绑定 Team 成员
- 绑定 AI Runtime
- 当前状态
- 最近消息时间
- 任务摘要

#### 9.4.3 切换 Team 或成员

用户可以在工作窗口创建时选择 AI Team、Team 成员或单独的 AI Runtime。已创建窗口允许切换 Team、成员或 Runtime，但应用需要提示：切换后后续消息将使用新配置，历史消息不变。由于 MVP 主要支持 CLI Agent，应用需要重点提示目标 Runtime 可能访问项目目录、修改文件或执行命令。

#### 9.4.4 工作窗口中的 Team 成员使用规则

MVP 阶段遵循“单一激活成员”原则：一个工作窗口在同一时刻只能有一个当前激活的 Team 成员负责执行任务。

规则：

- 同一窗口中不支持多个成员同时连续自动输出
- 当前激活成员负责处理后续消息和任务指令
- 切换成员后，历史消息保留，但后续回复由新成员负责
- 每条 AI 输出需要明确标记所属成员

支持的成员使用方式：

- 切换当前成员：用户在窗口顶部或右侧面板切换当前激活成员
- 转交任务：用户将当前任务上下文转交给 Team 中另一位成员继续处理
- 新开关联窗口：用户从当前窗口为另一位成员新开一个关联工作窗口

不在 MVP 阶段实现：

- 多成员在同一窗口内自动群聊
- 多成员并发写入同一主消息流
- 自动轮流发言

后续扩展方向：

- 支持同一工作窗口内的多人自动群聊
- 支持多成员围绕同一任务进行交叉评审
- 支持按角色顺序进行多轮评论、反驳和汇总

#### 9.4.5 转交任务

用户可以将当前窗口中的任务转交给 Team 中另一位成员。

转交时应用需要：

- 保留当前窗口上下文
- 自动附带任务摘要
- 记录转交来源成员和目标成员
- 在消息流中插入一条转交事件记录

转交后有两种处理方式：

- 在当前窗口内切换当前激活成员
- 为目标成员新开一个关联工作窗口

MVP 阶段建议优先支持在当前窗口内切换成员，并保留“新开关联窗口”入口。

#### 9.4.6 关联窗口行为规则

关联窗口用于承接从当前窗口派生出的子任务或转交任务。

规则：

- 一个工作窗口可以拥有多个关联子窗口
- 关联窗口需要记录父窗口 ID
- 子窗口创建后拥有独立的消息流、状态和运行记录
- 父窗口关闭或归档时，不自动关闭子窗口，但需要保留关联关系
- 子窗口中需要提供返回父窗口的快捷入口
- 父窗口中需要展示已关联子窗口列表和状态摘要

#### 9.4.7 窗口状态

工作窗口状态包括：

- 空闲
- 生成中
- 等待用户输入
- 等待权限确认
- 已完成
- 出错
- 已归档

#### 9.4.8 归档工作窗口

用户可以归档已完成或不再使用的工作窗口。归档窗口默认不出现在活跃窗口列表中，但可以从归档列表恢复。

### 9.5 AI 对话

#### 9.5.1 发送消息

用户可以在工作窗口中向 CLI Agent 发送消息或任务指令。

消息内容可以包含：

- 普通文本
- 引用的项目文档
- 引用的本地文件片段
- 历史工作窗口产出

#### 9.5.2 流式响应

如果 AI Runtime 配置启用流式输出，应用需要实时展示 CLI Agent 事件流和文本响应。

#### 9.5.3 停止生成

用户可以中止当前生成任务。中止后，已生成内容保留，并标记为未完整输出。

#### 9.5.4 重试

用户可以对失败消息或不满意的结果发起重试。重试需要保留原始消息和重试版本。

#### 9.5.5 对话历史

每个工作窗口保存独立对话历史，包括：

- 用户消息
- AI 响应
- 当前激活成员标识
- 成员切换事件
- 任务转交事件
- 使用的 AI Runtime 配置快照
- 调用时间
- 错误信息
- CLI 进程信息
- 工具调用或命令执行记录

### 9.6 项目上下文管理

#### 9.6.1 项目资料

用户可以在项目中维护基础资料：

- 项目简介
- 产品目标
- 技术栈
- 约束条件
- 重要链接

#### 9.6.2 本地文件选择

用户可以选择本地项目目录中的文件作为上下文。应用需要明确展示本次发送给 AI 的文件范围。

#### 9.6.3 上下文引用

用户可以在工作窗口中引用：

- 项目资料
- 本地文件
- 其他工作窗口的产出
- 手动添加的文档片段

#### 9.6.4 上下文大小提示

当上下文内容可能超过模型限制时，应用需要提示用户减少文件或内容。

### 9.7 数据保存

应用需要本地保存：

- AI Runtime 配置元数据
- 加密后的 CLI 相关凭据
- 导入来源和原始配置摘要
- CLI 可执行命令路径和默认参数
- 项目信息
- 工作窗口信息
- 对话历史
- 错误日志
- 用户偏好设置

### 9.8 CLI Agent 接入

#### 9.7.1 CLI Agent 类型

MVP 阶段建议优先支持：

- Claude Code CLI
- Codex CLI
- Custom CLI

后续可扩展：

- Gemini CLI
- Aider
- Continue CLI
- 其他本地 Agent 工具

#### 9.7.2 命令检测

用户配置 CLI Agent 时，应用需要检测：

- 可执行命令是否存在
- CLI 版本
- 是否可在当前系统运行
- 是否需要登录或认证
- 是否支持结构化输出

#### 9.7.3 进程启动

应用通过 Electron 主进程启动 CLI Agent 子进程。每次启动必须明确：

- 绑定的项目目录
- 工作窗口 ID
- Runtime 配置 ID
- 用户输入
- 初始上下文
- 环境变量白名单
- 权限策略

#### 9.7.4 输出解析

CLI Agent 输出应优先使用结构化格式，例如 JSON、JSON Lines 或事件流。应用需要分别记录：

- 普通文本输出
- Agent 状态事件
- 工具调用事件
- 文件变更事件
- 权限请求事件
- 错误输出
- 退出码

#### 9.7.5 会话恢复

如果 CLI Agent 支持会话恢复，应用需要保存会话标识，并允许用户在同一工作窗口中继续该 CLI 会话。

#### 9.7.6 进程控制

用户可以对 CLI Agent 执行：

- 启动
- 停止
- 重试
- 复制输出
- 查看运行日志

当进程异常退出时，应用需要展示退出码和错误摘要。

#### 9.7.7 文件变更与命令执行提示

如果 CLI Agent 可能修改项目文件或执行 shell 命令，应用需要在界面中明确展示该 Runtime 的权限级别。MVP 阶段可以先复用 CLI 自身的审批机制，但应用侧必须记录相关事件和结果。

## 10. 页面与交互需求

### 10.1 主工作台

主工作台用于查看项目列表、关键项目指标和最近活动。

主要区域：

- 左侧项目导航
- 中间项目列表与指标视图
- 右侧项目概览、异常提醒和快捷操作

主要操作：

- 新建项目
- 新建 AI Team
- 打开项目
- 新建工作窗口
- 打开 AI Runtime 配置页
- 按风险状态筛选项目
- 按活跃度排序项目

主工作台中的项目列表应支持以下展示方式：

- 卡片视图：适合直观看到每个项目的状态摘要
- 表格视图：适合按指标排序、筛选和批量扫描

每个项目卡片或列表行建议展示：

- 项目名称
- 项目模式
- 当前阶段
- 风险状态标签
- 活跃窗口数量
- 运行中 CLI Agent 数量
- 等待处理数量
- 出错数量
- 最近活动时间
- 最近产出时间
- 最近使用的 CLI Agent 类型

当项目存在需要立即关注的事项时，需要有明确的高优先级视觉提示，例如：

- 等待权限确认
- 运行失败
- 长时间无响应
- 文件变更待确认

### 10.1.1 首次启动引导

首次启动时，应用应优先进入引导模式，而不是直接展示空白主工作台。

引导步骤：

- 第一步：创建或导入 AI Runtime
- 第二步：可选创建 AI Team
- 第三步：进入创建项目向导

引导要求：

- 必须有至少一个可用 Runtime 后才能进入创建项目
- 用户可以跳过 AI Team 创建，直接进入自由模式项目创建
- 如果用户中途中断引导，应用下次启动时应继续提示完成剩余步骤

### 10.2 AI Runtime 配置页

主要区域：

- 配置列表
- 配置详情表单
- 测试连接结果
- CLI 命令检测结果

主要操作：

- 新建配置
- 编辑配置
- 删除配置
- 设置默认配置
- 导入 ccswitch 配置
- 检测 CLI 命令

### 10.3 AI Team 管理页

主要区域：

- Team 列表
- Team 基础信息
- 成员列表与角色分工
- 默认规则配置

主要操作：

- 新建 Team
- 编辑 Team
- 复制 Team
- 删除 Team
- 管理 Team 成员
- 调整成员角色和顺序

### 10.4 项目详情页

主要区域：

- 项目基础信息
- 项目模式
- 默认 AI Team
- 项目阶段
- 工作窗口列表
- 项目资料
- 最近 AI 输出
- 最近 CLI Agent 运行记录

主要操作：

- 编辑项目
- 切换项目模式
- 切换默认 AI Team
- 新建工作窗口
- 打开项目目录
- 管理项目资料

### 10.4.1 新建项目向导

新建项目建议采用向导式弹窗或独立侧边面板，而不是单屏长表单。

展示要求：

- 顶部显示当前步骤和总步骤数
- 每一步只展示与当前决策相关的字段
- Team 模式和自由模式切换时，表单内容即时变化
- 关键字段错误需要在当前步骤内即时提示
- 最后一步展示创建摘要，避免用户在提交前失去全局感知

快捷操作：

- 在向导中直接新建 AI Team
- 在向导中直接打开本地目录选择器
- 在最后一步返回上一步修改设置

### 10.5 工作窗口页

主要区域：

- 顶部：窗口名称、项目名、AI Team / 成员 / Runtime、状态
- 左侧：上下文文件和项目资料
- 中间：对话区
- 右侧：任务设置、输出摘要、调用信息、进程信息、关联窗口信息

主要操作：

- 发送消息
- 停止生成
- 重试
- 选择上下文
- 切换 AI Team、成员或 Runtime
- 转交任务给其他成员
- 为其他成员新开关联窗口
- 查看 CLI 运行日志
- 归档窗口

工作窗口中的 Team 成员交互要求：

- 顶部需要明确显示当前激活成员名称和角色
- 右侧面板需要展示当前负责人、已参与成员和最近一次转交记录
- 消息流中的每条 AI 回复需要显示成员标识
- 转交任务时需要弹出成员选择器，并显示将要传递的上下文摘要
- 如果当前 Runtime 不可用，需要显示阻断提示和恢复入口
- 如果存在关联窗口，需要在右侧面板展示子窗口列表和返回父窗口入口

## 11. 数据模型草案

### 11.1 AIRuntimeConfig

```ts
interface AIRuntimeConfig {
  id: string;
  name: string;
  runtimeType: 'cli-agent';
  provider: 'claude-code-cli' | 'codex-cli' | 'gemini-cli' | 'custom-cli';
  source?: 'manual' | 'ccswitch' | 'imported';
  sourceRef?: string;
  model?: string;
  executablePath?: string;
  defaultArgs?: string[];
  defaultCwdMode?: 'project-root' | 'custom-path';
  customCwd?: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  contextWindow?: number;
  streamEnabled: boolean;
  permissionProfile: 'read-only' | 'project-write' | 'command-approval' | 'full-access';
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
  lastUsedAt?: string;
}
```

### 11.2 Project

```ts
interface Project {
  id: string;
  name: string;
  description?: string;
  localPath?: string;
  mode: 'team' | 'manual';
  phase: 'requirements' | 'design' | 'development' | 'testing' | 'delivery' | 'archived';
  defaultAiTeamId?: string;
  riskStatus?: 'normal' | 'attention' | 'risk';
  activeSessionCount?: number;
  runningAgentCount?: number;
  waitingInputCount?: number;
  waitingPermissionCount?: number;
  errorSessionCount?: number;
  recentOutputAt?: string;
  recentFailureAt?: string;
  recentRuntimeType?: 'claude-code-cli' | 'codex-cli' | 'gemini-cli' | 'custom-cli';
  fileChangeCount?: number;
  createdAt: string;
  updatedAt: string;
  lastActiveAt?: string;
}
```

### 11.3 AITeam

```ts
interface AITeam {
  id: string;
  name: string;
  goal?: string;
  description?: string;
  defaultLaunchMode?: 'analysis' | 'development' | 'custom';
  createdAt: string;
  updatedAt: string;
  lastUsedAt?: string;
}
```

### 11.4 AITeamMember

```ts
interface AITeamMember {
  id: string;
  teamId: string;
  name: string;
  role: 'analyst' | 'architect' | 'developer' | 'tester' | 'reviewer' | 'summarizer' | 'custom';
  aiRuntimeConfigId: string;
  taskInstruction?: string;
  enabled: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}
```

### 11.5 WorkSession

```ts
interface WorkSession {
  id: string;
  projectId: string;
  aiTeamId?: string;
  aiTeamMemberId?: string;
  aiRuntimeConfigId?: string;
  assignmentMode: 'team-member' | 'runtime';
  activeAssigneeType: 'team-member' | 'runtime';
  parentWorkSessionId?: string;
  childWorkSessionCount?: number;
  title: string;
  goal?: string;
  status: 'idle' | 'running' | 'waiting' | 'waiting_permission' | 'completed' | 'error' | 'archived';
  processId?: string;
  externalSessionId?: string;
  summary?: string;
  createdAt: string;
  updatedAt: string;
  lastMessageAt?: string;
}
```

### 11.6 Message

```ts
interface Message {
  id: string;
  workSessionId: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  aiTeamMemberId?: string;
  eventType?: 'message' | 'member_switch' | 'handoff';
  fromAiTeamMemberId?: string;
  toAiTeamMemberId?: string;
  content: string;
  aiRuntimeConfigSnapshot?: AIRuntimeConfig;
  tokenUsage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
  error?: {
    code?: string;
    message: string;
  };
  createdAt: string;
}
```

### 11.7 RuntimeEvent

```ts
interface RuntimeEvent {
  id: string;
  workSessionId: string;
  aiRuntimeConfigId: string;
  type: 'stdout' | 'stderr' | 'status' | 'tool_call' | 'file_change' | 'permission_request' | 'exit' | 'error';
  content: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}
```

### 11.8 ContextItem

```ts
interface ContextItem {
  id: string;
  projectId: string;
  workSessionId?: string;
  type: 'project_note' | 'local_file' | 'session_output' | 'manual_text';
  title: string;
  path?: string;
  content?: string;
  createdAt: string;
  updatedAt: string;
}
```

## 12. 非功能需求

### 12.1 安全与隐私

- CLI 凭据字段必须加密保存在本地。
- CLI Agent 的登录态和密钥优先由 CLI 自身或系统凭据管理，应用不主动复制密钥。
- 从 ccswitch 导入的凭据字段必须进入同一加密保存流程，不得明文落库或写入日志。
- 默认不上传本地项目文件。
- 每次发送文件内容给 AI 前，应在界面上展示文件范围。
- 每次启动 CLI Agent 前，应明确展示工作目录和权限级别。
- 不同项目之间的上下文默认隔离。
- 不同工作窗口之间的上下文默认隔离，除非用户显式引用。

### 12.2 稳定性

- CLI Agent 进程异常退出时需要保留 stdout、stderr、退出码和运行参数摘要。
- 网络中断时不得丢失用户输入。
- 应用重启后可以恢复项目、窗口和历史记录。
- 长响应生成过程中需要支持停止。

### 12.3 性能

- 项目列表、窗口列表和历史记录加载应保持流畅。
- 大文件默认不直接完整注入上下文。
- 对话历史应分页或按需加载。
- 文件扫描应避免阻塞主界面。
- CLI Agent 的长时间运行不得阻塞渲染进程。

### 12.4 可扩展性

- AI Runtime 需要使用统一接口抽象。
- AI Team、工作窗口与 AI Runtime 配置应解耦，便于后续切换 Team、成员、Provider 或 CLI Agent。
- 数据模型需要支持未来 Agent 编排、工具调用和权限管理。

### 12.5 可用性

- 新用户应能在 5 分钟内完成首个 CLI Agent Runtime 配置、创建 AI Team 并发起一次任务。
- 关键错误需要给出明确原因和下一步操作。
- 对长任务状态、当前 AI Runtime 配置、上下文范围和 CLI 进程状态要有明确展示。

## 13. AI Runtime 抽象需求

系统需要提供统一 AI Runtime 调用接口，MVP 阶段业务层不直接依赖具体 CLI Agent，后续保留接入 API Provider 的扩展能力。

```ts
interface AIRuntime {
  test(config: AIRuntimeConfig): Promise<RuntimeTestResult>;
  start(input: RuntimeStartInput): Promise<RuntimeHandle>;
  send?(handle: RuntimeHandle, input: RuntimeInput): Promise<void>;
  stop(handle: RuntimeHandle): Promise<void>;
  events(handle: RuntimeHandle): AsyncIterable<RuntimeEvent>;
}
```

首批 CLI Agent 建议支持：

- Claude Code CLI
- Codex CLI
- Custom CLI

后续扩展：

- Gemini CLI
- Aider
- OpenAI-Compatible API
- Anthropic
- Ollama

## 14. 外部配置导入需求

系统需要提供外部配置导入能力，降低用户迁移多个 CLI Agent 配置的成本。

### 14.1 ccswitch 格式导入

MVP 阶段需要支持 ccswitch Provider 导入格式。应用需要能够解析 ccswitch deep link 和配置片段，将其中与 CLI Agent 相关的 Provider 信息转换为本应用的 AI Runtime 配置。

导入对象：

- Claude Code 相关 Provider
- Codex CLI 相关 Provider
- Gemini CLI 相关 Provider
- 其他可映射到 Custom CLI 的 Provider

### 14.2 导入预览

导入前需要展示：

- 配置名称
- 目标 Runtime 类型
- 目标 CLI 类型
- Endpoint 或导入摘要
- 模型名称
- 是否包含敏感字段
- 是否与现有配置重名
- 备注信息

### 14.3 冲突处理

如果导入配置与现有配置冲突，用户可以选择：

- 新建并自动重命名
- 覆盖已有配置
- 跳过该配置

覆盖已有配置前必须二次确认。

### 14.4 敏感信息处理

导入内容中如果包含 API Key、Token、Usage API Key 或其他 CLI 凭据字段，应用需要：

- 在预览中只显示脱敏内容。
- 保存时写入加密凭据存储。
- 不在日志和错误信息中打印明文。
- 支持用户选择不导入密钥，只导入非敏感元数据。

### 14.5 导入结果

导入完成后，应用需要展示：

- 成功导入数量
- 跳过数量
- 失败数量
- 每个失败项的原因
- 可选的 CLI 命令检测结果

## 15. CLI Agent 接入需求

CLI Agent 通过 Electron 主进程以子进程方式运行。应用需要把 CLI Agent 视为 MVP 的核心 Runtime。

### 15.1 Claude Code CLI

Claude Code CLI 接入需要支持：

- 检测 `claude` 命令是否可用。
- 读取版本信息。
- 以项目目录作为工作目录启动。
- 支持一次性任务模式。
- 支持结构化输出或流式输出。
- 支持停止进程。
- 保存 CLI 会话标识，用于后续恢复。
- 记录工具调用、文件变更、权限请求和错误输出。

### 15.2 Codex CLI

Codex CLI 接入需要支持：

- 检测 `codex` 命令是否可用。
- 读取版本信息。
- 以项目目录作为工作目录启动。
- 支持一次性任务或交互式任务。
- 支持审批模式配置。
- 支持停止进程。
- 记录文件变更、命令执行、审批事件和错误输出。

### 15.3 Custom CLI

用户可以配置自定义 CLI Agent。

配置字段：

- 显示名称
- 可执行命令
- 默认参数
- 工作目录策略
- 环境变量白名单
- 输出格式：text、json、jsonl、stream-json
- 权限策略

### 15.4 进程隔离

- 每个工作窗口启动独立进程。
- 每个进程必须绑定唯一工作窗口 ID。
- 进程默认只在项目目录内运行。
- 应用需要维护进程状态表。
- 应用退出时需要处理仍在运行的 CLI 进程。

### 15.5 结构化事件

应用内部需要把不同 CLI 的输出转换为统一 RuntimeEvent，便于 UI 展示和历史记录复用。

## 16. 权限需求

MVP 阶段权限控制保持简单，但数据结构预留扩展。

权限类型：

- 读取项目资料
- 读取用户选择的本地文件
- 写入本地对话历史
- 启动本地 CLI Agent
- 读取 CLI Agent 输出
- 停止 CLI Agent 进程

后续可扩展：

- 调用外部 AI API
- 写入本地项目文件
- 执行终端命令
- 访问网络搜索
- 调用外部工具

## 17. 成功指标

MVP 可用性的判断指标：

- 用户可以成功添加至少一个 AI Runtime 配置。
- 用户可以成功创建至少一个 AI Team。
- 用户可以从 ccswitch 格式成功导入至少一个 AI Runtime 配置。
- 用户可以成功创建项目并打开工作窗口。
- 用户可以在创建项目时选择 Team 模式或自由模式。
- 用户可以在 Team 模式项目中选择默认 AI Team。
- 用户可以在同一项目中创建多个绑定不同 Team 成员或 Runtime 的窗口。
- 用户可以在一个 Team 模式工作窗口中切换当前激活成员并继续任务。
- 用户可以在 Runtime 不可用时看到明确的恢复入口并继续完成任务配置。
- 每个窗口的对话历史可以独立保存和恢复。
- 用户可以明确看到本次 CLI Agent 任务使用的配置和上下文。
- 用户可以明确看到 CLI Agent 的工作目录、运行状态和退出结果。
- 凭据字段不以明文形式保存在普通配置文件中。
- 用户可以在主工作台快速识别需要优先处理的项目。

## 18. 版本规划

### 18.1 v0.1 MVP

- AI Runtime 配置管理
- AI Team 管理
- ccswitch 格式配置导入
- 项目管理
- Team 模式与自由模式
- 创建项目时可选择默认 AI Team，也可跳过 Team
- 工作窗口管理
- 单窗口 CLI Agent 对话与任务执行
- Claude Code CLI 和 Codex CLI 基础接入
- 本地历史保存
- 基础上下文选择

### 18.2 v0.2 本地项目增强

- 文件树浏览
- 文件内容预览
- 文件片段引用
- 项目资料模板
- 消息导出为 Markdown
- CLI 运行日志查看
- 关联窗口可视化
- API Provider 接口预留

### 18.3 v0.3 多 AI 协作

- 团队级任务拆解
- 手动分配多个 AI 任务
- 同窗口多人自动群聊
- 多人交叉评审
- 工作窗口之间引用产出
- 项目级任务看板
- AI 输出摘要聚合
- CLI Agent 产出聚合

### 18.4 v0.4 Agent 编排

- 自动拆解任务
- 多 Agent 顺序执行
- 工具权限审批
- 执行日志和回滚记录

## 19. 风险与待确认问题

### 19.1 主要风险

- 不同 CLI Agent 输出格式差异较大，需要稳定的适配层。
- AI Team 的成员分工和任务路由规则设计不当时，容易造成职责重叠或结果碎片化。
- Team 模式与自由模式并存后，项目配置入口和窗口选择逻辑会更复杂，需要避免用户理解成本过高。
- 转交任务、关联窗口和成员切换同时存在时，窗口责任归属需要持续保持清晰。
- 上下文文件过大时容易造成成本和性能问题。
- CLI 凭据本地安全保存需要谨慎设计。
- 多工作窗口并行请求可能带来并发状态管理复杂度。
- CLI Agent 可能修改文件或执行命令，需要清晰的权限提示和日志记录。
- CLI 版本变化可能导致输出解析不稳定。
- ccswitch 格式未来变化可能导致导入解析不稳定。
- 导入配置中可能包含敏感信息，需要严格脱敏和加密保存。
- 后续如果加入文件写入和命令执行，需要更严格的权限模型。

### 19.2 待确认问题

- MVP 是否仅支持 Claude Code CLI、Codex CLI 和 Custom CLI，还是同时纳入 Gemini CLI。
- AI Team 首版是否必须包含固定角色模板，还是允许完全自定义角色。
- 自由模式项目是否支持一键转换为 Team 模式，并自动根据现有窗口生成 Team 草稿。
- 本地数据存储使用 SQLite 还是文件型 JSON。
- 是否需要首版支持 Markdown 文档导出。
- 工作窗口是否需要独立成 Electron BrowserWindow，还是在主窗口中以标签页形式呈现。
- 是否需要支持中文和英文双语言界面。
- CLI 凭据加密方案使用系统 Keychain，还是应用级主密钥。
- CLI Agent 的文件修改是否在 MVP 阶段只记录，不做应用侧 diff 审批。
- CLI Agent 的登录认证是否完全交给 CLI 自身处理。
- ccswitch 导入首版支持 deep link 即可，还是同时支持备份数据库文件。
- 从 ccswitch 导入后是否需要回写到 Claude Code、Codex CLI 等工具的原生配置。

## 20. 验收标准

MVP 完成时，应满足以下验收标准：

- 用户可以启动桌面应用并进入主工作台。
- 用户可以在主工作台看到每个项目的关键指标摘要。
- 用户可以识别哪些项目正在运行、等待输入、等待权限确认或存在错误。
- 用户可以创建、编辑、删除 AI Runtime 配置。
- 用户可以创建、编辑、删除 AI Team。
- 用户可以粘贴 ccswitch deep link 并导入为 AI Runtime 配置。
- 用户可以在导入前看到配置预览和敏感字段脱敏提示。
- 用户可以在创建项目时选择 Team 模式或自由模式。
- 用户可以在 Team 模式下选择一个默认 AI Team。
- 用户可以通过分步式创建项目向导完成项目创建，并在最后一步看到完整创建摘要。
- 用户可以检测 Claude Code CLI 或 Codex CLI 命令是否可用。
- 用户可以创建、编辑、归档项目。
- 用户可以在项目中创建多个工作窗口。
- 每个工作窗口可以选择一个 AI Team、Team 成员或单独的 AI Runtime。
- Team 模式工作窗口在同一时刻只允许一个激活成员负责输出。
- 用户可以在工作窗口中切换当前成员、转交任务，或为其他成员新开关联窗口。
- 用户可以在 Runtime 不可用时通过恢复入口重新选择 Runtime、切换成员或打开 Runtime 配置页。
- 关联窗口能够保留父子关系，并支持从子窗口返回父窗口。
- 用户可以在工作窗口中发送消息或任务指令并获得 CLI Agent 输出。
- 用户可以在工作窗口中启动 CLI Agent 任务并查看输出。
- 用户可以停止正在运行的 CLI Agent 任务。
- 对话历史在应用重启后仍可查看。
- CLI Agent 运行日志在应用重启后仍可查看。
- 用户可以选择项目资料或本地文件作为上下文。
- 应用能够显示当前窗口使用的 AI Team、成员、Runtime 配置、状态和错误信息。
- CLI 凭据不以明文形式出现在普通数据库字段或日志中。
