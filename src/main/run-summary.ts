import type { ImplementationTicket, RunSummary, WorkflowRun } from '../shared/workflow-run'

/** A durable result snapshot; no transcript, command output or file contents. */
export function createRunSummary(run: WorkflowRun, ticket?: ImplementationTicket): RunSummary {
  const executions = run.stepExecutions.filter((execution) => !ticket || execution.implementationTicketId === ticket.id)
  const executionIds = new Set(executions.map((execution) => execution.id))
  const logs = run.logs.filter((log) => executionIds.has(log.executionId))
  const artifacts = run.artifacts.filter((artifact) => executionIds.has(artifact.stepExecutionId))
  const files = new Map<string, RunSummary['files'][number]>()
  for (const log of logs) {
    if (log.data.type !== 'file_changes') continue
    for (const change of log.data.changes) {
      const file = files.get(change.path) ?? { path: change.path, kinds: [], additions: 0, deletions: 0 }
      if (!file.kinds.includes(change.kind)) file.kinds.push(change.kind)
      file.additions += change.additions
      file.deletions += change.deletions
      files.set(change.path, file)
    }
  }
  const results: RunSummary['results'] = []
  for (const candidate of ticket ? [ticket] : run.implementationTickets ?? []) {
    for (const category of ['implementation', 'testing', 'review', 'commit'] as const) {
      if (candidate.stages[category] === 'skipped' || candidate.stages[category] === 'pending') continue
      results.push({ category, name: candidate.title, status: candidate.stages[category] })
    }
  }
  for (const execution of executions) {
    if (execution.implementationTicketId || execution.status === 'skipped') continue
    const step = run.definition.phases.find((phase) => phase.id === execution.phaseId)?.steps.find((step) => step.id === execution.stepId)
    const category = step?.operation === 'build' ? 'build'
      : step?.skill?.name === 'product-verification' || execution.phaseId === 'verification' ? 'verification'
        : step?.skill?.name === 'code-review' || step?.id === 'review' ? 'review' : null
    if (category) results.push({ category, name: step?.name ?? execution.stepId, status: execution.status })
  }
  for (const log of logs) {
    if (log.data.type !== 'tool_call' || typeof log.data.input.exitCode !== 'number') continue
    const category = /(?:^|\s)(?:build|compile)(?:\s|$)/i.test(log.data.name) ? 'build'
      : /(?:^|\s)(?:test|typecheck|check|vitest|pytest)(?:\s|$)/i.test(log.data.name) ? 'testing' : null
    if (category) results.push({ category, name: log.data.name, status: log.data.input.exitCode === 0 ? 'completed' : 'failed' })
  }
  for (const artifact of artifacts) {
    const category = ({ 'test-result': 'testing', 'check-result': 'testing', 'review-report': 'review', 'build-result': 'build', 'verification-result': 'verification', commit: 'commit' } as const)[artifact.type]
    if (category && !results.some((result) => result.category === category)) results.push({ category, name: artifact.name, status: artifact.status })
  }
  const startedAt = ticket?.startedAt ?? run.createdAt
  const finishedAt = ticket?.finishedAt ?? run.events.findLast((event) => event.type === 'completed')?.createdAt ?? run.updatedAt
  const duration = Date.parse(finishedAt) - Date.parse(startedAt)
  const failures = executions.filter((execution) => execution.status === 'failed').flatMap((execution) => execution.error ? [execution.error] : [])
  const interruptions = new Set(logs.filter((log) => log.data.type === 'status_changed' && log.data.status === 'paused').map((log) => log.idempotencyKey ?? log.id))
  return {
    scope: ticket ? 'ticket' : 'run', ticketId: ticket?.id ?? null, title: ticket?.title ?? run.idea,
    status: 'completed', finishedAt, durationMs: Number.isFinite(duration) && duration >= 0 ? duration : null,
    attemptCount: executions.filter((execution) => execution.status !== 'skipped').length,
    ticketCount: ticket ? 1 : (run.implementationTickets ?? []).filter((ticket) => ticket.status === 'completed').length,
    failedAttemptCount: executions.filter((execution) => execution.status === 'failed').length,
    interruptionCount: interruptions.size, failures, results, files: [...files.values()], artifacts,
  }
}
