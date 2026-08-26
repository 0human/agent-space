import type { Project } from './project'
import type { PermissionPolicy } from './project'
import type { WorkflowDefinition, WorkflowSource, WorkflowView } from './workflow'

export type WorkflowRunStatus = 'running' | 'paused' | 'waiting' | 'blocked' | 'failed' | 'completed' | 'cancelled'
export type StepExecutionStatus = 'pending' | 'running' | 'waiting' | 'blocked' | 'failed' | 'completed' | 'skipped' | 'cancelled'

export interface RuntimeLocator {
  runtimeProvider: string
  threadId: string
  turnId: string
  runtimeVersion: string
}

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
  runtimeLocator?: RuntimeLocator | null
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
  nextAction: string
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

export type RuntimeEvent =
  | ({ type: 'text_delta'; text: string } & RuntimeEventMetadata)
  | ({ type: 'tool_call'; name: string; input: Record<string, unknown> } & RuntimeEventMetadata)
  | ({ type: 'question'; question: string } & RuntimeEventMetadata)
  | ({ type: 'approval_required'; approval: string } & RuntimeEventMetadata)
  | ({ type: 'artifact_produced'; artifact: RuntimeArtifact } & RuntimeEventMetadata)
  | ({ type: 'status_changed'; status: 'running' | 'completed' | 'blocked'; reason?: string } & RuntimeEventMetadata)
  | ({ type: 'error'; error: string } & RuntimeEventMetadata)

export interface RuntimeEventMetadata {
  idempotencyKey?: string
  sessionId?: string
  provider?: string
  source?: string
  permissionPolicy?: PermissionPolicy
  runtimeLocator?: RuntimeLocator
}

export type WorkflowLogType = RuntimeEvent['type']

export interface AgentRuntimeAdapter {
  preflight?(context: RuntimePreflightContext): Promise<RuntimePreflightResult>
  execute(context: RuntimeExecutionContext): Promise<RuntimeEvent[]>
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
