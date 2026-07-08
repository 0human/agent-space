# AI Agent Workspace MVP IPC API

## 1. 原则

- Renderer 只通过 `window.agentSpace` 调用能力。
- Renderer 不直接访问数据库、文件系统、凭据或子进程。
- 返回值统一使用 `ApiResult<T>`。
- 长运行任务通过事件通知刷新 UI。

## 2. 通用类型

```ts
type ID = string;
type ISODateTime = string;

type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: ApiError };

interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  recoverable?: boolean;
}
```

## 3. Preload 结构

```ts
interface AgentSpaceAPI {
  app: AppAPI;
  runtimes: RuntimeAPI;
  teams: TeamAPI;
  projects: ProjectAPI;
  planning: PlanningAPI;
  sessions: SessionAPI;
  files: FileAPI;
  events: EventAPI;
}
```

## 4. App API

```ts
interface AppAPI {
  getInfo(): Promise<ApiResult<AppInfo>>;
}

interface AppInfo {
  appVersion: string;
  platform: string;
  databaseReady: boolean;
  databasePath?: string;
}
```

## 5. Runtime API

```ts
type RuntimeProvider = 'claude_code_cli' | 'codex_cli' | 'gemini_cli' | 'custom_cli';

interface RuntimeSummary {
  id: ID;
  name: string;
  provider: RuntimeProvider;
  executablePath?: string;
  enabled: boolean;
  isDefault: boolean;
  lastTestStatus?: RuntimeTestStatus;
  lastTestedAt?: ISODateTime;
}

interface RuntimeDetail extends RuntimeSummary {
  defaultArgs: string[];
  defaultCwdMode: 'project_root' | 'custom_path';
  customCwd?: string;
  systemPrompt?: string;
  notes?: string;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

interface RuntimeCreateInput {
  name: string;
  provider: RuntimeProvider;
  executablePath?: string;
  defaultArgs?: string[];
  defaultCwdMode?: 'project_root' | 'custom_path';
  customCwd?: string;
  systemPrompt?: string;
  enabled?: boolean;
  isDefault?: boolean;
  notes?: string;
}

type RuntimeTestStatus =
  | 'success'
  | 'command_not_found'
  | 'version_incompatible'
  | 'auth_unavailable'
  | 'startup_failed'
  | 'unknown_error';

interface RuntimeTestResult {
  status: RuntimeTestStatus;
  message: string;
  installed: boolean;
  testedAt: ISODateTime;
}

interface RuntimeAPI {
  list(input?: { enabled?: boolean; provider?: RuntimeProvider }): Promise<ApiResult<RuntimeSummary[]>>;
  get(id: ID): Promise<ApiResult<RuntimeDetail>>;
  create(input: RuntimeCreateInput): Promise<ApiResult<RuntimeDetail>>;
  update(input: Partial<RuntimeCreateInput> & { id: ID }): Promise<ApiResult<RuntimeDetail>>;
  disable(id: ID): Promise<ApiResult<RuntimeDetail>>;
  test(input: { runtimeConfigId?: ID; provider?: RuntimeProvider; executablePath?: string }): Promise<ApiResult<RuntimeTestResult>>;
}
```

## 6. Team API

```ts
type TeamMemberRole =
  | 'analyst'
  | 'architect'
  | 'developer'
  | 'tester'
  | 'reviewer'
  | 'summarizer'
  | 'custom';

interface TeamSummary {
  id: ID;
  name: string;
  goal?: string;
  memberCount: number;
}

interface TeamMemberInput {
  name: string;
  role: TeamMemberRole;
  runtimeConfigId: ID;
  taskInstruction?: string;
  enabled?: boolean;
}

interface TeamDetail extends TeamSummary {
  description?: string;
  members: TeamMemberDetail[];
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

interface TeamMemberDetail extends TeamMemberInput {
  id: ID;
  runtimeName: string;
  runtimeProvider: RuntimeProvider;
}

interface TeamAPI {
  list(): Promise<ApiResult<TeamSummary[]>>;
  get(id: ID): Promise<ApiResult<TeamDetail>>;
  create(input: { name: string; goal?: string; description?: string; members?: TeamMemberInput[] }): Promise<ApiResult<TeamDetail>>;
  update(input: { id: ID; name?: string; goal?: string; description?: string; members?: TeamMemberInput[] }): Promise<ApiResult<TeamDetail>>;
}
```

## 7. Project API

```ts
type ProjectPhase = 'requirements' | 'design' | 'development' | 'testing' | 'delivery' | 'archived';
type ProjectMode = 'team' | 'manual';

interface ProjectMetrics {
  activeSessionCount: number;
  runningAgentCount: number;
  waitingInputCount: number;
  errorSessionCount: number;
  recentOutputAt?: ISODateTime;
  recentFailureAt?: ISODateTime;
}

interface ProjectSummary {
  id: ID;
  name: string;
  localPath: string;
  mode: ProjectMode;
  phase: ProjectPhase;
  defaultAiTeamId?: ID;
  defaultAiRuntimeConfigId?: ID;
  metrics?: ProjectMetrics;
  lastActiveAt?: ISODateTime;
}

interface ProjectCreateInput {
  name: string;
  localPath: string;
  initialIdea?: string;
  phase?: ProjectPhase;
  defaultAiTeamId?: ID;
  defaultAiRuntimeConfigId?: ID;
}

interface ProjectDetail extends ProjectSummary {
  description?: string;
  initialIdea?: string;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
  archivedAt?: ISODateTime;
}

interface ProjectAPI {
  list(input?: { archived?: boolean; phase?: ProjectPhase }): Promise<ApiResult<ProjectSummary[]>>;
  get(id: ID): Promise<ApiResult<ProjectDetail>>;
  create(input: ProjectCreateInput): Promise<ApiResult<ProjectDetail>>;
  update(input: Partial<ProjectCreateInput> & { id: ID }): Promise<ApiResult<ProjectDetail>>;
  archive(input: { id: ID; archiveSessions?: boolean }): Promise<ApiResult<ProjectDetail>>;
}
```

## 8. Planning API

```ts
type TaskStatus = 'draft' | 'todo' | 'in_progress' | 'review' | 'done' | 'blocked' | 'cancelled';
type TaskType = 'requirements' | 'design' | 'development' | 'testing' | 'review' | 'documentation' | 'delivery' | 'other';
type DeliverableType = 'prd' | 'technical_design' | 'code_change' | 'test_result' | 'review' | 'summary' | 'other';

interface ProjectBrief {
  id: ID;
  projectId: ID;
  rawIdea: string;
  summary?: string;
  targetUsers: string[];
  coreFeatures: string[];
  technicalPreferences: string[];
  nonGoals: string[];
  openQuestions: string[];
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

interface ProjectBlueprint {
  id: ID;
  projectId: ID;
  title: string;
  productGoal?: string;
  mvpScope: string[];
  technicalPlan?: string;
  milestones: string[];
  acceptanceCriteria: string[];
  risks: string[];
  updatedAt: ISODateTime;
}

interface ProjectTask {
  id: ID;
  projectId: ID;
  blueprintId?: ID;
  title: string;
  type: TaskType;
  phase: ProjectPhase;
  status: TaskStatus;
  recommendedRole?: TeamMemberRole;
  aiTeamMemberId?: ID;
  aiRuntimeConfigId?: ID;
  goal: string;
  acceptanceCriteria: string[];
  workSessionId?: ID;
  sortOrder: number;
}

interface ProjectDeliverable {
  id: ID;
  projectId: ID;
  projectTaskId?: ID;
  workSessionId?: ID;
  sourceMessageId?: ID;
  title: string;
  type: DeliverableType;
  content: string;
  createdAt: ISODateTime;
}

interface PlanningAPI {
  getBrief(projectId: ID): Promise<ApiResult<ProjectBrief | undefined>>;
  saveBrief(input: Partial<ProjectBrief> & { projectId: ID; rawIdea: string }): Promise<ApiResult<ProjectBrief>>;
  generateBlueprint(projectId: ID): Promise<ApiResult<ProjectBlueprint>>;
  saveBlueprint(input: Partial<ProjectBlueprint> & { projectId: ID; title: string }): Promise<ApiResult<ProjectBlueprint>>;
  listTasks(projectId: ID): Promise<ApiResult<ProjectTask[]>>;
  generateTasks(projectId: ID): Promise<ApiResult<ProjectTask[]>>;
  updateTask(input: Partial<ProjectTask> & { id: ID }): Promise<ApiResult<ProjectTask>>;
  startTaskSession(input: { taskId: ID; title?: string }): Promise<ApiResult<WorkSessionDetail>>;
  listDeliverables(projectId: ID): Promise<ApiResult<ProjectDeliverable[]>>;
  saveDeliverable(input: { projectId: ID; projectTaskId?: ID; workSessionId?: ID; sourceMessageId?: ID; title: string; type: DeliverableType; content: string }): Promise<ApiResult<ProjectDeliverable>>;
}
```

## 9. Session API

```ts
type WorkSessionStatus = 'idle' | 'running' | 'waiting_input' | 'completed' | 'error' | 'archived';
type MessageRole = 'user' | 'assistant' | 'system';
type RuntimeRunStatus = 'starting' | 'running' | 'completed' | 'failed' | 'stopped' | 'interrupted';

interface WorkSessionSummary {
  id: ID;
  projectId: ID;
  projectTaskId?: ID;
  title: string;
  goal?: string;
  status: WorkSessionStatus;
  aiTeamMemberId?: ID;
  aiRuntimeConfigId?: ID;
  latestRunId?: ID;
  lastMessageAt?: ISODateTime;
}

interface WorkSessionDetail extends WorkSessionSummary {
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

interface MessageSummary {
  id: ID;
  workSessionId: ID;
  role: MessageRole;
  content: string;
  createdAt: ISODateTime;
}

interface RuntimeRunSummary {
  id: ID;
  workSessionId: ID;
  runtimeConfigId: ID;
  provider: RuntimeProvider;
  status: RuntimeRunStatus;
  startedAt: ISODateTime;
  endedAt?: ISODateTime;
  errorSummary?: string;
}

interface RuntimeEventSummary {
  id: ID;
  runId: ID;
  workSessionId: ID;
  type: string;
  content?: string;
  sequenceNo: number;
  createdAt: ISODateTime;
}

interface SessionAPI {
  list(input?: { projectId?: ID; status?: WorkSessionStatus }): Promise<ApiResult<WorkSessionSummary[]>>;
  get(id: ID): Promise<ApiResult<WorkSessionDetail>>;
  create(input: { projectId: ID; projectTaskId?: ID; title: string; goal?: string; aiRuntimeConfigId?: ID; aiTeamMemberId?: ID }): Promise<ApiResult<WorkSessionDetail>>;
  listMessages(input: { workSessionId: ID; limit?: number; offset?: number }): Promise<ApiResult<MessageSummary[]>>;
  sendMessage(input: { workSessionId: ID; content: string }): Promise<ApiResult<{ userMessage: MessageSummary; assistantMessage?: MessageSummary; run: RuntimeRunSummary }>>;
  stopRun(input: { workSessionId: ID }): Promise<ApiResult<RuntimeRunSummary>>;
  listRuns(workSessionId: ID): Promise<ApiResult<RuntimeRunSummary[]>>;
  listEvents(runId: ID): Promise<ApiResult<RuntimeEventSummary[]>>;
}
```

## 10. File API

```ts
interface FileEntry {
  name: string;
  path: string;
  type: 'file' | 'directory';
}

interface FileAPI {
  listProjectFiles(projectId: ID, dir?: string): Promise<ApiResult<FileEntry[]>>;
  readTextFile(projectId: ID, path: string): Promise<ApiResult<{ path: string; content: string }>>;
}
```

## 11. Event API

```ts
interface SessionChangedEvent {
  workSessionId: ID;
  projectId?: ID;
  runId?: ID;
  reason: 'session_created' | 'message_created' | 'run_started' | 'run_finished' | 'session_updated';
}

interface EventAPI {
  onSessionChanged(listener: (event: SessionChangedEvent) => void): () => void;
}
```
