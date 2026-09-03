# Software Delivery Workflow

本上下文描述一款桌面应用如何协调用户与 agent，把模糊的软件想法逐步推进为可验证的交付结果。

## Language

**Workflow Definition**：
一份可复用、可版本化的流程蓝图，由多个 Phase 组成，并引用完成具体工作的 Skill。
_Avoid_：Workflow template、prompt chain

**Workflow File**：
以可版本控制文件表达 Workflow Definition 的持久形式，只声明 Phase、Step、Skill 引用、Artifact 关系和 Approval Gate，不承载隐藏 prompt。
_Avoid_：Database-only workflow、prompt script

**Workflow Run**：
一个 Project 按某个确定版本的 Workflow Definition 进行的一次实际执行。
_Avoid_：Session、job

**Phase**：
Workflow 中具有明确目标和产物的一段高层工作，例如 Discovery、Implementation 或 Release。
_Avoid_：Stage、milestone

**Step**：
Phase 内由 agent、用户或工具完成的最小工作单元。
_Avoid_：Task、action

**Tool Step**：
由 APP 调用确定性命令、Git/GitHub API 或 Project 配置中的外部工具完成的 Step。
_Avoid_：Skill、agent reasoning

**Human Step**：
必须由用户在 APP 外部系统或现实环境中完成，并由 APP 等待、记录结果后继续的 Step。
_Avoid_：Automated step、Approval Gate

**Skill Package**：
可分发、可固定版本的 Skill 集合及其元数据和依赖声明，是 Skill 在 APP 中被内置或安装的载体。
_Avoid_：Prompt bundle、plugin

**Skill Manifest**：
描述 Skill Package 的名称、版本、入口、依赖、兼容 Runtime、能力和所需权限的机器可读声明；它不包含 Skill 的行为 prompt。
_Avoid_：Prompt、workflow definition

**Skill**：
Skill Package 中可被 Workflow Definition 引用、指导 agent 完成特定类型工作的既有能力，是工作行为的权威来源。
_Avoid_：Embedded prompt、app-authored skill

**Built-in Skill**：
随 APP 分发、无需联网即可使用的 Skill；其内容仍来自固定版本的 Skill Package，而不是 APP 内部另写的 prompt。
_Avoid_：Hidden skill、generated skill

**Installed Skill**：
用户通过本地文件或联网安装后可供 Workflow 使用的 Skill；其版本和来源必须可追溯。
_Avoid_：Discovered prompt、temporary capability

**Skill Registry**：
提供带 manifest 的 Skill Package 来源；它可以是 npm registry、Git URL 或其他可安装来源，用户必须确认后才能安装。
_Avoid_：Prompt marketplace、silent installer

**Skill Source**：
Skill Package 的实际获取位置，例如内置包、本地目录、压缩包、npm/npx 包或 Git URL；V1 不限制来源类型，由用户承担来源可信性判断。
_Avoid_：Approved registry、implicit dependency

**Artifact**：
Workflow Run 在推进过程中产生并保留的、具有明确类型和来源、可被后续流程或用户使用的可检查结果，例如需求文档、ADR、commit、测试结果、PR 或部署记录。
原始聊天消息、运行日志和临时文件默认不属于 Artifact。
_Avoid_：Output、attachment、log

**Step Execution**：
某个 Step 在一次 Workflow Run 中的一次实际尝试，记录其状态、输入、输出、Skill 版本、时间和错误。
_Avoid_：Step definition、log entry

**Run Snapshot**：
Workflow Run 当前可恢复状态的持久表示，说明流程正在何处、哪些 Approval Gate 待处理以及下一步是什么。
_Avoid_：Event history、progress text

**Run Activity View**：
以连续活动流呈现单个 Workflow Run 的主操作视图；它在吸顶进度中展示 Workflow、Phase 和 Implementation Ticket 位置，并投影 Runtime Item、Decision Record、Artifact 摘要及允许的状态转换，不拥有独立执行事实。
_Avoid_：Run Board、Kanban database、global chat

**Workflow Event**：
描述 Workflow Run 状态变化的不可变记录，例如 started、paused、completed、failed 或 cancelled。
_Avoid_：Log、notification

**Approval Gate**：
一次执行中必须暂停并取得用户明确确认的节点，用于产品方向决策、危险操作、PR merge、Release 和凭据修改。
_Avoid_：Manual step、confirmation popup

**Merge Gate**：
PR 已创建并完成 CI/review 后、在远程合并前必须取得用户明确确认的 Approval Gate。
_Avoid_：Pre-commit approval、PR creation approval

**Automatic Review**：
由 `code-review` Skill 在 PR 创建前对本地变更执行的非阻塞人工前置检查；发现问题时由 agent 修复，不替代 PR 创建后的 CI、外部 review 或 Merge Gate。
_Avoid_：Human approval、final review

**Phase Context**：
某个 Phase 内可持续的对话和推理上下文；Phase 之间通过 Artifact、Decision Record 和 Run 状态传递结果。
_Avoid_：Global conversation、chat history

**Implementation Ticket**：
Planning Phase 产生并由 Implementation Phase 逐个交付的工作单元；每个 Implementation Ticket 可以包含多次 Step Execution attempt，但在 Run 中只占一个有序进度位置。
_Avoid_：Step、Runtime Item、generic task

**Decision Record**：
用户或 agent 在 Workflow Run 中确认的、会影响后续流程的结构化决定，包含问题、答案、来源和继续位置。
_Avoid_：Chat reply、transient answer

**Project**：
一次软件交付所服务的工作对象，可以从已有代码仓库开始，也可以从空目录和初始 Idea 开始。
_Avoid_：Repository、workspace

**Project Import**：
用户将本地目录或远程 Git 仓库显式登记为 Project 的动作；APP 不把同一目录自动推断成多个 Project。
_Avoid_：Directory scan、implicit project

**Dirty Workspace**：
存在未提交修改、未跟踪文件或与当前 HEAD 不一致状态的 Workspace；创建新 Run 前必须展示其状态，不得自动 stash、reset 或丢弃变更。
_Avoid_：Unclean project、temporary changes

**Workflow Validation**：
APP 对手动编辑或导入的 Workflow File 执行的 schema、Skill 依赖、版本和权限检查；校验失败时不能启动新的 Workflow Run。
_Avoid_：Visual preview、runtime trial

**Workspace**：
Workflow Run 操作 Project 时使用的本地目录；远程 Git 仓库也先进入本地 Workspace 再执行。
_Avoid_：Project、repository

**Post-release Validation**：
Release 后确认交付结果在目标环境中可用的收尾 Phase，是 V1 软件交付 Workflow 的终点。
_Avoid_：Monitoring、operations

**Workflow Library**：
可跨 Project 复用的、带版本的 Workflow Definition 集合。
_Avoid_：Project Workflow、run history

**Development Workflow**：
V1 内置的 software delivery Workflow，从 Idea / Discovery 经 Requirements、Planning、Implementation、Verification 和 GitHub delivery 推进到 Release 与 Post-release Validation。
_Avoid_：Coding task、implementation-only workflow

**Project Workflow**：
Project 选定的 Workflow Definition 版本及其显式定制，是该 Project 后续 Workflow Run 的依据。
_Avoid_：Global template、workflow run

**Base Commit**：
一个 Workflow Run 开始代码修改时固定的版本控制基点，后续 branch、worktree 和 PR 都以此作为变更上下文。
_Avoid_：Latest HEAD、shared state

**Parallel Workflow Run**：
同一个 Project 中同时进行、各自拥有独立 Workspace/branch 的多个 Workflow Run；它们通过 PR 或合并流程汇合，不直接共享可写目录。
_Avoid_：Concurrent edit、shared run

**Merge Conflict**：
多个 Parallel Workflow Run 的变更无法直接合并时产生的阻塞状态，必须由 Skill 或用户解决后才能继续。
_Avoid_：Overwrite、automatic resolution

**Project Overview**：
汇总一个 Project 下多个 Parallel Workflow Run 的当前 Phase、阻塞状态和最近 Artifact 的视图，不直接改变各 Run 的 Workflow 状态。
_Avoid_：Run Board、global kanban

**Repository Connector**：
把远程或本地代码来源接入 Project 的能力；V1 支持本地目录和 GitHub，其他 Git 服务留给后续扩展。
_Avoid_：Agent Runtime、deployment adapter

**Primary UI Language**：
APP 面向用户的默认界面和内置 Workflow 文案所使用的语言；V1 为 Simplified Chinese，后续增加 English。
_Avoid_：Runtime language、repository language

**App-owned Server**：
由 APP 产品方控制、用于同步、遥测或托管执行数据的远程服务；V1 默认不向其上传 Project 内容或执行数据。
_Avoid_：GitHub、Agent Runtime provider

**External Destination**：
用户明确选择或授权的外部服务，例如 GitHub repository、PR 平台或 Agent Runtime provider；向其传输数据必须由对应操作和网络权限明确触发。
_Avoid_：App-owned Server、implicit upload

**Desktop Shell**：
承载跨平台 UI、文件、进程和系统集成能力的桌面运行壳；V1 使用 Electron。
_Avoid_：Workflow engine、browser app

**Runtime Event**：
Agent Runtime Adapter 向 Workflow 引擎返回的统一结构化事件，例如 text_delta、tool_call、question、approval_required、artifact_produced、status_changed 或 error。
_Avoid_：Provider transcript、raw CLI output

**Runtime Item**：
Agent Runtime 在一次 Turn 内产生的、可增量更新并归属于某个 Step Execution 的可观察工作单元，例如 Agent 消息或命令执行。
_Avoid_：Workflow Event、Artifact、provider transcript

**Item Projection**：
按 Step Execution 汇集 Runtime Item 当前状态、供 Run Activity View 实时或历史展示的操作投影；它不是 Run Snapshot、Artifact 或持久化执行事实。
_Avoid_：Run Snapshot、durable transcript、Workflow log

**Runtime Locator**：
Step Execution 用来重新定位 Agent Runtime 历史的稳定引用；一次 attempt 可以按顺序关联多个 Runtime Locator，以覆盖暂停、回答和继续产生的多个 Turn。
_Avoid_：Chat transcript、Run Snapshot、Artifact location

**Live Mode**：
Run Activity View 自动跟随当前执行位置和最新 Runtime Item 的查看模式。
_Avoid_：Auto-run、follow-up queue

**Inspection Mode**：
用户检查历史 Phase 或 Implementation Ticket、同时让 Workflow Run 继续执行的查看模式；新活动不会夺回滚动位置。
_Avoid_：Paused Run、read-only Run

**Data Transfer Notice**：
联网或向 External Destination 发送数据前展示的说明，包含目标服务、数据类型、权限和断网后的恢复方式。
_Avoid_：Privacy policy、silent upload

**Skill Package Format**：
APP 使用的通用 Skill Package 目录和 manifest 规范，包含 `skill-manifest.json` 以及 `skills/<skill-name>/SKILL.md`，可选 references、scripts 和 assets。
_Avoid_：Codex plugin layout、prompt folder

**Agent Runtime**：
实际加载 Skill、与用户交互并执行 Workflow Step 的 agent 执行环境；V1 首先支持 Codex。
_Avoid_：Workflow engine、Skill

**Permission Policy**：
Project 对 Workspace、命令和网络访问范围的明确允许边界，高风险动作超出普通自动执行范围时必须触发 Approval Gate。
_Avoid_：Security prompt、implicit permission

**Preflight**：
Workflow Run 启动前对 Skill、Runtime、命令、凭据、Workspace 和 Project 配置进行的依赖与权限检查。
_Avoid_：Trial run、late failure
