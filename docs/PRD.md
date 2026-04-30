# AI Agent Workspace PRD

## 1. 文档信息

- 产品名称：AI Agent Workspace
- 产品形态：Electron 桌面应用
- 文档版本：v0.1
- 当前阶段：需求分析
- 目标平台：macOS、Windows，后续可扩展 Linux

## 2. 产品概述

AI Agent Workspace 是一个面向个人开发者、AI 工具使用者和小型团队的桌面端 AI 工作台。它优先面向命令行 Agent 工具的接入与管理，并以“项目”为单位组织多个 AI 工作窗口。

用户可以在同一个项目中打开多个独立工作窗口，每个窗口选择不同的 CLI Agent Runtime 配置，分别承担需求分析、架构设计、代码实现、测试审查、文档整理等任务。产品的核心目标是让用户更稳定、更清晰地管理多个 CLI Agent 在多个项目中的工作上下文，而不是把所有任务混在单一聊天窗口里。API Provider 接口作为后续扩展能力保留。

## 3. 背景与问题

当前用户在使用多个 AI 工具时，常见问题包括：

- 不同 CLI Agent、模型、登录状态和参数配置分散，切换成本高。
- 同一个项目的需求、设计、代码、测试讨论散落在不同聊天记录中，难以追踪。
- 多个 AI 同时参与项目时，任务边界和上下文容易混乱。
- 每次新开任务都需要重复粘贴项目背景、技术栈、约束条件。
- 缺少以项目为中心的 AI 工作记录沉淀。
- 桌面端对本地项目目录、文件上下文和隐私控制有更强需求。

本产品通过“AI Runtime 配置管理 + 项目管理 + 工作窗口管理”的方式解决这些问题。

## 4. 产品目标

### 4.1 业务目标

- 提供一个统一的桌面端入口，优先管理多个 CLI Agent Runtime 配置。
- 支持以项目为单位沉淀 AI 工作过程和结果。
- 支持同一项目下多个 AI 工作窗口并行运行。
- 为后续 Agent 编排、自动任务流和本地代码操作打基础。

### 4.2 用户目标

- 快速创建项目并关联本地目录。
- 为不同任务选择合适的 CLI Agent Runtime 配置。
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

项目是 AI 工作的组织单位。一个项目可以关联本地目录、项目说明、阶段状态、文档资料和多个工作窗口。

### 6.3 工作窗口

工作窗口是一次独立的 AI 工作空间。每个窗口属于一个项目，并绑定一个 CLI Agent Runtime 配置。窗口拥有独立的对话历史、上下文选择、任务目标、运行状态和进程状态。

### 6.4 项目上下文

项目上下文是 AI 可以参考的信息集合，包括项目说明、需求文档、技术栈说明、用户选择的本地文件和历史产出。

## 7. 使用场景

### 7.1 新建 AI Runtime 配置

用户打开应用后，进入 AI Runtime 配置页，优先添加 CLI Agent Runtime，填写可执行命令、默认参数、工作目录策略和权限策略。用户点击“检测命令”，确认配置可用后保存。API Provider 配置入口在后续版本开放。

### 7.2 创建项目

用户创建一个新项目，填写项目名称、项目描述，并选择本地项目目录。应用保存项目基础信息，并进入项目工作台。

### 7.3 打开需求分析窗口

用户在项目中创建新工作窗口，选择“需求分析助手”Runtime 配置，输入任务目标：“分析这个 AI 工具的产品需求并输出 PRD”。AI 在该窗口中独立对话，结果保存到项目历史中。

### 7.4 同一项目中使用多个 AI

用户继续打开另一个工作窗口，选择“Claude Code CLI 架构设计助手”或“Codex CLI 开发助手”，让它基于需求文档设计 Electron 技术架构或执行代码任务。两个窗口互不干扰，但都属于同一项目。

### 7.5 复用历史结果

用户在新的工作窗口中选择引用之前的 PRD 或架构文档，作为当前 AI 的上下文输入。

## 8. 功能范围

### 8.1 MVP 范围

第一阶段需要实现：

- AI Runtime 配置管理
- 项目管理
- 工作窗口管理
- 单工作窗口 CLI Agent 对话与任务执行
- 每个工作窗口绑定一个 AI Runtime 配置
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

#### 9.2.2 新建项目

用户可以创建项目。

字段：

- 项目名称
- 项目描述
- 本地目录路径
- 当前阶段
- 默认 AI Runtime 配置

#### 9.2.3 编辑项目

用户可以修改项目名称、描述、阶段和本地目录路径。

#### 9.2.4 删除或归档项目

用户可以归档项目。删除项目时需要二次确认，并说明是否删除本地对话历史数据。

### 9.3 工作窗口管理

#### 9.3.1 新建工作窗口

用户可以在项目内新建工作窗口。

字段：

- 窗口名称
- 任务目标
- AI Runtime 配置
- 初始上下文

#### 9.3.2 工作窗口列表

项目内展示所有工作窗口。

列表字段：

- 窗口名称
- 绑定 AI Runtime 配置
- 当前状态
- 最近消息时间
- 任务摘要

#### 9.3.3 切换 AI Runtime 配置

用户可以在工作窗口创建时选择 AI Runtime 配置。已创建窗口允许切换配置，但应用需要提示：切换后后续消息将使用新配置，历史消息不变。由于 MVP 主要支持 CLI Agent，应用需要重点提示该 Runtime 可能访问项目目录、修改文件或执行命令。

#### 9.3.4 窗口状态

工作窗口状态包括：

- 空闲
- 生成中
- 等待用户输入
- 等待权限确认
- 已完成
- 出错
- 已归档

#### 9.3.5 归档工作窗口

用户可以归档已完成或不再使用的工作窗口。归档窗口默认不出现在活跃窗口列表中，但可以从归档列表恢复。

### 9.4 AI 对话

#### 9.4.1 发送消息

用户可以在工作窗口中向 CLI Agent 发送消息或任务指令。

消息内容可以包含：

- 普通文本
- 引用的项目文档
- 引用的本地文件片段
- 历史工作窗口产出

#### 9.4.2 流式响应

如果 AI Runtime 配置启用流式输出，应用需要实时展示 CLI Agent 事件流和文本响应。

#### 9.4.3 停止生成

用户可以中止当前生成任务。中止后，已生成内容保留，并标记为未完整输出。

#### 9.4.4 重试

用户可以对失败消息或不满意的结果发起重试。重试需要保留原始消息和重试版本。

#### 9.4.5 对话历史

每个工作窗口保存独立对话历史，包括：

- 用户消息
- AI 响应
- 使用的 AI Runtime 配置快照
- 调用时间
- 错误信息
- CLI 进程信息
- 工具调用或命令执行记录

### 9.5 项目上下文管理

#### 9.5.1 项目资料

用户可以在项目中维护基础资料：

- 项目简介
- 产品目标
- 技术栈
- 约束条件
- 重要链接

#### 9.5.2 本地文件选择

用户可以选择本地项目目录中的文件作为上下文。应用需要明确展示本次发送给 AI 的文件范围。

#### 9.5.3 上下文引用

用户可以在工作窗口中引用：

- 项目资料
- 本地文件
- 其他工作窗口的产出
- 手动添加的文档片段

#### 9.5.4 上下文大小提示

当上下文内容可能超过模型限制时，应用需要提示用户减少文件或内容。

### 9.6 数据保存

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

### 9.7 CLI Agent 接入

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

主工作台用于查看项目列表和最近活动。

主要区域：

- 左侧项目导航
- 中间项目工作窗口列表
- 右侧项目概览和快捷操作

主要操作：

- 新建项目
- 打开项目
- 新建工作窗口
- 打开 AI Runtime 配置页

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

### 10.3 项目详情页

主要区域：

- 项目基础信息
- 项目阶段
- 工作窗口列表
- 项目资料
- 最近 AI 输出
- 最近 CLI Agent 运行记录

主要操作：

- 编辑项目
- 新建工作窗口
- 打开项目目录
- 管理项目资料

### 10.4 工作窗口页

主要区域：

- 顶部：窗口名称、项目名、AI Runtime 配置、状态
- 左侧：上下文文件和项目资料
- 中间：对话区
- 右侧：任务设置、输出摘要、调用信息、进程信息

主要操作：

- 发送消息
- 停止生成
- 重试
- 选择上下文
- 切换 AI Runtime 配置
- 查看 CLI 运行日志
- 归档窗口

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
  phase: 'requirements' | 'design' | 'development' | 'testing' | 'delivery' | 'archived';
  defaultAiRuntimeConfigId?: string;
  createdAt: string;
  updatedAt: string;
  lastActiveAt?: string;
}
```

### 11.3 WorkSession

```ts
interface WorkSession {
  id: string;
  projectId: string;
  aiRuntimeConfigId: string;
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

### 11.4 Message

```ts
interface Message {
  id: string;
  workSessionId: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
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

### 11.5 RuntimeEvent

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

### 11.6 ContextItem

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
- 工作窗口与 AI Runtime 配置应解耦，便于后续切换 Provider 或 CLI Agent。
- 数据模型需要支持未来 Agent 编排、工具调用和权限管理。

### 12.5 可用性

- 新用户应能在 5 分钟内完成首个 CLI Agent Runtime 配置并发起一次任务。
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
- 用户可以从 ccswitch 格式成功导入至少一个 AI Runtime 配置。
- 用户可以成功创建项目并打开工作窗口。
- 用户可以在同一项目中创建多个绑定不同 AI Runtime 配置的窗口。
- 每个窗口的对话历史可以独立保存和恢复。
- 用户可以明确看到本次 CLI Agent 任务使用的配置和上下文。
- 用户可以明确看到 CLI Agent 的工作目录、运行状态和退出结果。
- 凭据字段不以明文形式保存在普通配置文件中。

## 18. 版本规划

### 18.1 v0.1 MVP

- AI Runtime 配置管理
- ccswitch 格式配置导入
- 项目管理
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
- API Provider 接口预留

### 18.3 v0.3 多 AI 协作

- 手动分配多个 AI 任务
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
- 用户可以创建、编辑、删除 AI Runtime 配置。
- 用户可以粘贴 ccswitch deep link 并导入为 AI Runtime 配置。
- 用户可以在导入前看到配置预览和敏感字段脱敏提示。
- 用户可以检测 Claude Code CLI 或 Codex CLI 命令是否可用。
- 用户可以创建、编辑、归档项目。
- 用户可以在项目中创建多个工作窗口。
- 每个工作窗口可以选择一个 AI Runtime 配置。
- 用户可以在工作窗口中发送消息或任务指令并获得 CLI Agent 输出。
- 用户可以在工作窗口中启动 CLI Agent 任务并查看输出。
- 用户可以停止正在运行的 CLI Agent 任务。
- 对话历史在应用重启后仍可查看。
- CLI Agent 运行日志在应用重启后仍可查看。
- 用户可以选择项目资料或本地文件作为上下文。
- 应用能够显示当前窗口使用的 AI Runtime 配置、状态和错误信息。
- CLI 凭据不以明文形式出现在普通数据库字段或日志中。
