import type { Project } from './project'
import type { PermissionPolicy } from './project'
import type { WorkflowDefinition, WorkflowSource, WorkflowView } from './workflow'

export type WorkflowRunStatus = 'running' | 'paused' | 'waiting' | 'blocked' | 'failed' | 'completed' | 'cancelled'
export type StepExecutionStatus = 'pending' | 'running' | 'paused' | 'waiting' | 'blocked' | 'failed' | 'completed' | 'skipped' | 'cancelled'
export type ImplementationTicketStatus = 'pending' | 'running' | 'paused' | 'waiting' | 'blocked' | 'failed' | 'completed' | 'cancelled'
export type ImplementationTicketStage = 'implementation' | 'testing' | 'review' | 'commit'
export type ImplementationTicketStageStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped'

export interface ImplementationTicketStages {
  implementation: ImplementationTicketStageStatus
  testing: ImplementationTicketStageStatus
  review: ImplementationTicketStageStatus
  commit: ImplementationTicketStageStatus
}

export interface ImplementationTicketResult {
  attemptCount: number
  failedAttemptCount: number
  artifactIds: string[]
}

export interface ImplementationTicket {
  id: string
  runId: string
  sourceArtifactId: string | null
  title: string
  location: string | null
  position: number
  status: ImplementationTicketStatus
  stages: ImplementationTicketStages
  threadId: string | null
  result: ImplementationTicketResult
  startedAt: string | null
  finishedAt: string | null
}

export function isWorkflowRunInProgress(status: WorkflowRunStatus): boolean {
  return ['running', 'paused', 'waiting', 'blocked', 'failed'].includes(status)
}

export interface RuntimeLocator {
  runtimeProvider: string
  threadId: string
  turnId: string
  runtimeVersion: string
}

export type RuntimeItemStatus = 'in_progress' | 'completed' | 'failed' | 'declined'

interface RuntimeItemBase {
  id: string
  runId: string
  executionId: string
  status: RuntimeItemStatus
  provider: string
  source: string
  permissionPolicy: PermissionPolicy
  runtimeLocator: RuntimeLocator
}

export interface RuntimeAgentMessageItem extends RuntimeItemBase {
  type: 'agent_message'
  text: string
}

export interface RuntimeCommandItem extends RuntimeItemBase {
  type: 'command'
  command: string
  output: string
  exitCode: number | null
  durationMs: number | null
}

export interface RuntimeFileChange {
  path: string
  kind: 'add' | 'update' | 'delete'
  additions: number
  deletions: number
}

export interface RuntimeFileChangeItem extends RuntimeItemBase {
  type: 'file_change'
  changes: RuntimeFileChange[]
  additions: number
  deletions: number
}

export interface RuntimePlanItem extends RuntimeItemBase {
  type: 'plan'
  text: string
  steps?: Array<{ step: string; status: string }>
}

export interface RuntimeToolItem extends RuntimeItemBase {
  type: 'tool'
  name: string
  status: RuntimeItemStatus
  durationMs: number | null
  output: string | null
}

export interface RuntimeErrorItem extends RuntimeItemBase {
  type: 'error'
  status: 'failed'
  error: string
}

export type RuntimeItem = RuntimeAgentMessageItem | RuntimeCommandItem | RuntimeFileChangeItem | RuntimePlanItem | RuntimeToolItem | RuntimeErrorItem

export interface WorkflowEvent {
  id: number
  runId: string
  type: string
  data: Record<string, unknown>
  idempotencyKey?: string | null
  createdAt: string
}

export interface WorkflowLog {
  id: number
  runId: string
  executionId: string
  type: WorkflowLogType
  message: string
  data: RuntimeEvent
  idempotencyKey?: string | null
  createdAt: string
}

export interface PhaseContext {
  id: string
  runId: string
  phaseId: string
  content: string
  updatedAt: string
}

export interface DecisionRecord {
  id: string
  runId: string
  phaseId: string
  stepId: string
  executionId: string
  source: 'runtime-question' | 'approval-gate'
  question: string
  answer: string
  continuation: RunContinuation
  createdAt: string
}

export interface StepExecution {
  id: string
  runId: string
  phaseId: string
  stepId: string
  attempt: number
  idempotencyKey?: string
  status: StepExecutionStatus
  input: Record<string, unknown> | null
  skill: { name: string; version: string } | null
  implementationTicketId?: string | null
  runtimeLocators: RuntimeLocator[]
  runtimeSessionId?: string | null
  error: string | null
  output: Record<string, unknown> | null
  startedAt: string | null
  finishedAt: string | null
}

export interface ArtifactIndex {
  id: string
  runId: string
  stepExecutionId: string
  type: string
  name: string
  location: string | null
  versionHash: string | null
  status: string
  idempotencyKey?: string | null
  createdAt: string
}

export interface PullRequestCheck {
  name: string
  status: string
  conclusion: string | null
  detailsUrl?: string | null
}

export interface PullRequestReview {
  author: string
  state: string
  submittedAt?: string | null
}

export interface PullRequestGate {
  checksSatisfied: boolean
  reviewsSatisfied: boolean
  mergeabilitySatisfied: boolean
  canMerge: boolean
  reason: string | null
}

export interface PullRequestState {
  number: number
  url: string
  title: string
  headBranch: string
  baseBranch: string
  headCommit: string
  checks: PullRequestCheck[]
  reviews: PullRequestReview[]
  mergeable: string
  merged: boolean
  mergedAt: string | null
  draft: boolean
  gate: PullRequestGate
  updatedAt: string | null
}

export interface RunSnapshot {
  phaseIndex: number
  stepIndex: number
  currentStepExecutionId: string | null
  pendingQuestion: string | null
  pendingApproval: string | null
  pendingQuestionDetails: PendingQuestion | null
  pendingApprovalDetails: PendingApproval | null
  blockedBy: RunBlocker | null
  ticketProgress?: ImplementationTicketProgress | null
  nextAction: string
}

export interface ImplementationTicketProgress {
  current: number
  total: number
  currentTicketId: string | null
}

export interface RunContinuation {
  phaseIndex: number
  stepIndex: number
  executionId: string
}

export interface PendingQuestion {
  question: string
  answer: string | null
  continuation: RunContinuation
}

export interface PendingApproval {
  approval: string
  decision: 'approved' | 'rejected' | null
  continuation: RunContinuation
}

export interface RunBlocker extends RunContinuation {
  reason: string
  recoveryAction: 'resume'
}

export interface WorkflowRun {
  id: string
  projectId: string
  workspacePath: string
  remote: string | null
  idea: string
  workflowId: string
  workflowVersion: string
  workflowSource: WorkflowSourceSnapshot
  baseCommit: string | null
  branch: string | null
  pullRequest?: PullRequestState | null
  definition: WorkflowDefinition
  status: WorkflowRunStatus
  error: string | null
  snapshot: RunSnapshot
  implementationTickets?: ImplementationTicket[]
  stepExecutions: StepExecution[]
  events: WorkflowEvent[]
  logs: WorkflowLog[]
  phaseContexts: PhaseContext[]
  decisionRecords: DecisionRecord[]
  artifacts: ArtifactIndex[]
  createdAt: string
  updatedAt: string
}

export interface WorkflowSourceSnapshot {
  source: WorkflowSource
  id: string
  version: string
  path: string | null
}

export interface RuntimeExecutionContext {
  runId: string
  project: Project
  workspace: { path: string }
  idea: string
  workflow: WorkflowDefinition
  phaseIndex: number
  stepIndex: number
  execution: StepExecution
  implementationTicket?: ImplementationTicket | null
  skill: StepExecution['skill']
  phaseContext: PhaseContext | null
  inputArtifacts: ArtifactIndex[]
  decisionRecords: DecisionRecord[]
  permissionPolicy: PermissionPolicy
  events: WorkflowEvent[]
  persistRuntimeLocator?(locator: RuntimeLocator): Promise<void>
}

export interface RuntimeArtifact {
  type: string
  name: string
  runId?: string
  location?: string | null
  versionHash?: string | null
  status?: string
  idempotencyKey?: string | null
}

type RuntimeEventPayload =
  | { type: 'text_delta'; text: string }
  | { type: 'tool_call'; name: string; input: Record<string, unknown> }
  | { type: 'question'; question: string }
  | { type: 'approval_required'; approval: string }
  | { type: 'artifact_produced'; artifact: RuntimeArtifact }
  | { type: 'ticket_progress'; stage: ImplementationTicketStage; status: ImplementationTicketStageStatus }
  | { type: 'status_changed'; status: 'running' | 'paused' | 'completed' | 'blocked'; reason?: string }
  | { type: 'error'; error: string }

type WithRuntimeMetadata<T, TMetadata> = T extends RuntimeEventPayload ? T & TMetadata : never

export type RuntimeEvent = WithRuntimeMetadata<RuntimeEventPayload, RuntimeEventMetadata>
export type RuntimeEventInput = WithRuntimeMetadata<RuntimeEventPayload, RuntimeEventInputMetadata>

export interface RuntimeEventMetadata {
  runId: string
  executionId: string
  source: string
  idempotencyKey?: string
  sessionId?: string
  provider?: string
  permissionPolicy?: PermissionPolicy
  runtimeLocator?: RuntimeLocator
}

export type RuntimeEventInputMetadata = Omit<RuntimeEventMetadata, 'runId' | 'executionId' | 'source'> & Partial<Pick<RuntimeEventMetadata, 'runId' | 'executionId' | 'source'>>

export type WorkflowLogType = RuntimeEvent['type']

export interface AgentRuntimeAdapter {
  preflight?(context: RuntimePreflightContext): Promise<RuntimePreflightResult>
  execute(context: RuntimeExecutionContext): Promise<RuntimeEventInput[]>
  interrupt?(context: RuntimeInterruptContext): Promise<void>
}

export interface RuntimeInterruptContext {
  runId: string
  executionId: string
  runtimeLocator: RuntimeLocator
}

export interface RuntimePreflightContext {
  workspace: { path: string }
  skill: StepExecution['skill']
  permissionPolicy: PermissionPolicy
}

export interface RuntimePreflightResult {
  checks: string[]
  errors: string[]
}

export interface WorkflowPreflightInput {
  project: Project
  workflow: WorkflowView
  idea: string
}

export interface WorkflowPreflightResult {
  passed: boolean
  checks: string[]
  errors: string[]
}

export interface StartWorkflowRunInput extends WorkflowPreflightInput {
  preflight?: WorkflowPreflightResult
}

export interface WorkflowRunActionResult {
  ok: boolean
  error: string | null
  run: WorkflowRun | null
}
