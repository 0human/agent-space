import type { WorkflowRun } from '../../../../shared/workflow-run'

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

export function runControlAvailability(run: WorkflowRun) {
  return {
    canPause: run.status === 'running',
    canResume:
      run.status === 'paused' ||
      (run.status === 'blocked' &&
        run.snapshot.blockedBy?.recoveryAction === 'resume'),
    canRetry: run.status === 'failed',
    canAnswer: run.status === 'waiting' && run.snapshot.pendingQuestionDetails?.answer === null,
    canCancel: ['running', 'paused', 'waiting', 'blocked', 'failed'].includes(
      run.status,
    ),
  }
}

export function createRunActivityModel(run: WorkflowRun) {
  const pullRequest = run.pullRequest
  return {
    ...runControlAvailability(run),
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
  }
}
