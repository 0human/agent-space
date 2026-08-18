import type { Project } from './project'
import type { WorkflowDefinition, WorkflowView } from './workflow'

export type WorkflowRunStatus = 'running' | 'paused' | 'waiting' | 'blocked' | 'failed' | 'completed' | 'cancelled'
export type StepExecutionStatus = 'pending' | 'running' | 'waiting' | 'blocked' | 'failed' | 'completed' | 'cancelled'

export interface WorkflowEvent {
  id: number
  runId: string
  type: string
  data: Record<string, unknown>
  createdAt: string
}

export interface WorkflowLog {
  id: number
  runId: string
  executionId: string
  type: string
  message: string
  data: Record<string, unknown>
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
  status: StepExecutionStatus
  input: Record<string, unknown> | null
  skill: { name: string; version: string } | null
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
  createdAt: string
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

export interface RunBlocker {
  phaseIndex: number
  stepIndex: number
  executionId: string
  reason: string
}

export interface WorkflowRun {
  id: string
  projectId: string
  workspacePath: string
  idea: string
  workflowId: string
  workflowVersion: string
  baseCommit: string | null
  branch: string | null
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

export interface RuntimeExecutionContext {
  runId: string
  project: Project
  idea: string
  workflow: WorkflowDefinition
  phaseIndex: number
  stepIndex: number
  execution: StepExecution
  events: WorkflowEvent[]
}

export interface RuntimeArtifact {
  type: string
  name: string
  location?: string | null
  versionHash?: string | null
  status?: string
}

export type RuntimeEvent =
  | { type: 'text_delta'; text: string }
  | { type: 'tool_call'; name: string; input: Record<string, unknown> }
  | { type: 'question'; question: string }
  | { type: 'approval_required'; approval: string }
  | { type: 'artifact_produced'; artifact: RuntimeArtifact }
  | { type: 'status_changed'; status: 'running' | 'completed' | 'blocked' }
  | { type: 'error'; error: string }

export interface AgentRuntimeAdapter {
  execute(context: RuntimeExecutionContext): Promise<RuntimeEvent[]>
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
