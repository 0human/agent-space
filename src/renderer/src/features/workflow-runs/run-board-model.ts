import type { RuntimeItem, WorkflowRun } from '../../../../shared/workflow-run'
import type { WorkflowStep } from '../../../../shared/workflow'

import { createRuntimeItemTimeline } from './runtime-item-timeline'

type StepExecution = WorkflowRun['stepExecutions'][number]

export interface StepCardProjection {
  execution: StepExecution | null
  isCurrent: boolean
  isApprovalPending: boolean
  canApprove: boolean
}

export interface DeliveryProjection {
  baseCommit: string | null
  branch: string | null
  isLocalOnly: boolean
  pullRequest: {
    url: string
    checks: Array<{ name: string; result: string }>
    approvedReviews: number
    totalReviews: number
    mergeable: string
    canMerge: boolean
    blockedReason: string | null
  } | null
}

export interface RunBoardModel {
  selectedStep: WorkflowStep | null
  selectedExecution: StepExecution | null
  selectedPhaseContext: WorkflowRun['phaseContexts'][number] | null
  selectedDecisions: WorkflowRun['decisionRecords']
  selectedLogs: WorkflowRun['logs']
  selectedRuntimeItems: RuntimeItem[]
  selectedBlocker: WorkflowRun['snapshot']['blockedBy']
  selectedIsCurrent: boolean
  selectedIsMergeConflict: boolean
  canPause: boolean
  canResume: boolean
  canRetry: boolean
  canCancel: boolean
  delivery: DeliveryProjection
  projectStep: (
    step: WorkflowStep,
    phaseIndex: number,
    stepIndex: number,
  ) => StepCardProjection
}

export function createRunBoardModel(
  run: WorkflowRun,
  runtimeItems: RuntimeItem[],
  selectedStepId: string | null,
): RunBoardModel {
  const latestExecutions = new Map<string, StepExecution>()
  for (const execution of run.stepExecutions)
    latestExecutions.set(execution.stepId, execution)

  const selectedStep =
    run.definition.phases
      .flatMap((phase) => phase.steps)
      .find((step) => step.id === selectedStepId) ?? null
  const selectedExecution = selectedStep
    ? (latestExecutions.get(selectedStep.id) ?? null)
    : null
  const selectedPhaseContext = selectedExecution
    ? ((run.phaseContexts ?? []).find(
        (context) => context.phaseId === selectedExecution.phaseId,
      ) ?? null)
    : null
  const selectedDecisions = selectedExecution
    ? (run.decisionRecords ?? []).filter(
        (record) => record.executionId === selectedExecution.id,
      )
    : []
  const selectedLogs = selectedExecution
    ? (run.logs ?? []).filter((log) => log.executionId === selectedExecution.id)
    : []
  const timeline = createRuntimeItemTimeline(runtimeItems, run.id)
  const selectedBlocker =
    selectedExecution &&
    run.snapshot.blockedBy?.executionId === selectedExecution.id
      ? run.snapshot.blockedBy
      : null
  const hasPendingDecision =
    run.status === 'waiting' &&
    Boolean(
      run.snapshot.pendingQuestionDetails ||
        run.snapshot.pendingApprovalDetails,
    )
  const pullRequest = run.pullRequest

  return {
    selectedStep,
    selectedExecution,
    selectedPhaseContext,
    selectedDecisions,
    selectedLogs,
    selectedRuntimeItems: selectedExecution
      ? timeline.forExecution(selectedExecution.id)
      : [],
    selectedBlocker,
    selectedIsCurrent:
      selectedExecution?.id === run.snapshot.currentStepExecutionId,
    selectedIsMergeConflict: Boolean(
      selectedBlocker && /merge conflict|冲突/i.test(selectedBlocker.reason),
    ),
    canPause: run.status === 'running',
    canResume:
      ['paused', 'blocked'].includes(run.status) ||
      (run.status === 'waiting' && !hasPendingDecision),
    canRetry:
      run.status === 'failed' ||
      run.stepExecutions.some((execution) => execution.status === 'skipped'),
    canCancel: ['running', 'paused', 'waiting', 'blocked', 'failed'].includes(
      run.status,
    ),
    delivery: {
      baseCommit: run.baseCommit,
      branch: run.branch,
      isLocalOnly:
        run.artifacts.some((artifact) => artifact.type === 'commit') &&
        !run.remote,
      pullRequest: pullRequest
        ? {
            url: pullRequest.url,
            checks: pullRequest.checks.map((check) => ({
              name: check.name,
              result: check.conclusion ?? check.status,
            })),
            approvedReviews: pullRequest.reviews.filter(
              (review) => review.state.toUpperCase() === 'APPROVED',
            ).length,
            totalReviews: pullRequest.reviews.length,
            mergeable: pullRequest.mergeable,
            canMerge: pullRequest.gate.canMerge,
            blockedReason: pullRequest.gate.reason,
          }
        : null,
    },
    projectStep: (step, phaseIndex, stepIndex) => {
      const execution = latestExecutions.get(step.id) ?? null
      const isApprovalPending = Boolean(
        step.approvalGate &&
          execution &&
          run.snapshot.pendingApprovalDetails?.decision === null &&
          run.snapshot.pendingApprovalDetails.continuation.executionId ===
            execution.id,
      )
      const isPullRequestGate =
        step.kind === 'tool' && step.adapter === 'github.pull-request'
      return {
        execution,
        isCurrent:
          phaseIndex === run.snapshot.phaseIndex &&
          stepIndex === run.snapshot.stepIndex,
        isApprovalPending,
        canApprove:
          !isPullRequestGate || run.pullRequest?.gate.canMerge === true,
      }
    },
  }
}
