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

export interface StepExecution {
  id: string
  runId: string
  phaseId: string
  stepId: string
  attempt: number
  status: StepExecutionStatus
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
  nextAction: string
}

export interface WorkflowRun {
  id: string
  projectId: string
  workspacePath: string
  idea: string
  workflowId: string
  workflowVersion: string
  definition: WorkflowDefinition
  status: WorkflowRunStatus
  error: string | null
  snapshot: RunSnapshot
  stepExecutions: StepExecution[]
  events: WorkflowEvent[]
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
}

export interface RuntimeArtifact {
  type: string
  name: string
  location?: string | null
  versionHash?: string | null
  status?: string
}

export type RuntimeResult =
  | { type: 'completed'; output?: Record<string, unknown>; artifacts?: RuntimeArtifact[] }
  | { type: 'waiting'; question: string }
  | { type: 'blocked'; reason: string }
  | { type: 'failed'; error: string }

export interface AgentRuntimeAdapter {
  execute(context: RuntimeExecutionContext): Promise<RuntimeResult>
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
