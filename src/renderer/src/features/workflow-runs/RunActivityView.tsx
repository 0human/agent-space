import { useRef, useState } from 'react'
import { ArrowLeft } from 'lucide-react'

import type {
  RuntimeItem,
  StepExecution,
  WorkflowRun,
} from '../../../../shared/workflow-run'
import { Alert, AlertDescription } from '@renderer/components/ui/alert'
import { Button } from '@renderer/components/ui/button'
import { zhCN as copy } from '@renderer/i18n/zh-CN'

import { createRunActivityModel } from './run-activity-model'
import {
  Artifact,
  DeliveryCard,
  StatusBadge,
} from './RunActivitySupport'
import { RunComposer, RunEndMenu, type RunControlAction } from './RunControls'
import { RunSummaryMessage } from './RunSummaryMessage'
import { RuntimeItemList } from './RuntimeItemList'
import { useRunActivityScroll } from './use-run-activity-scroll'
import { currentRunPosition, RunProgress } from './RunProgress'

export interface RunActivityViewProps {
  run: WorkflowRun
  runtimeItems: RuntimeItem[]
  runtimeItemsUnavailable?: boolean
  error: string | null
  onOpenInIde?: () => void
  onBack: () => void
  onPause: () => void | Promise<void | boolean>
  onResume: (guidance?: string) => void | Promise<void | boolean>
  onRetry: (guidance?: string) => void | Promise<void | boolean>
  onCancel: () => void | Promise<void | boolean>
  onAnswer: (answer: string) => void | Promise<void | boolean>
  onApprove: () => void | Promise<void | boolean>
  onReject: () => void | Promise<void | boolean>
}

export function RunActivityView(
  props: RunActivityViewProps,
): React.JSX.Element {
  const { run, runtimeItems, runtimeItemsUnavailable, error } = props
  const model = createRunActivityModel(run)
  const scroll = useRunActivityScroll(run, runtimeItems)
  const [pending, setPending] = useState<RunControlAction | null>(null)
  const actionInFlight = useRef(false)
  const [controlError, setControlError] = useState<string | null>(null)
  async function perform(action: RunControlAction, operation: () => void | Promise<void | boolean>): Promise<boolean> {
    if (actionInFlight.current) return false
    actionInFlight.current = true
    setPending(action)
    setControlError(null)
    try {
      return await operation() !== false
    } catch (reason) {
      setControlError(reason instanceof Error ? reason.message : String(reason))
      return false
    } finally {
      actionInFlight.current = false
      setPending(null)
    }
  }
  const itemsByExecution = new Map<string, RuntimeItem[]>()
  for (const item of runtimeItems) {
    if (item.runId !== run.id) continue
    const items = itemsByExecution.get(item.executionId) ?? []
    items.push(item)
    itemsByExecution.set(item.executionId, items)
  }

  return (
    <main
      className="flex h-[calc(100dvh-3rem)] min-w-0 flex-col md:h-dvh"
      aria-labelledby="run-activity-title"
    >
      <header className="shrink-0 border-b px-4 py-3 sm:px-8">
        <Button variant="ghost" size="sm" onClick={props.onBack}>
          <ArrowLeft aria-hidden="true" />
          {copy.run.backAction}
        </Button>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <h1
            id="run-activity-title"
            className="line-clamp-2 min-w-0 flex-1 break-words text-lg font-semibold"
            title={run.idea}
          >
            {run.idea}
          </h1>
          <StatusBadge status={pending === 'pause' ? 'interrupting' : run.status} />
          <RunEndMenu disabled={!model.canCancel || pending !== null} onEnd={() => { void perform('end', props.onCancel) }} />
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {copy.run.sourceSnapshot(
            run.workflowSource?.source ?? 'project',
            run.workflowSource?.version ?? run.workflowVersion,
          )}
        </p>
        {run.error || error || controlError ? (
          <Alert variant="destructive" className="my-4" role="alert">
            <AlertDescription>{controlError ?? error ?? run.error}</AlertDescription>
          </Alert>
        ) : null}
      </header>
      <RunProgress
        run={run}
        onInspect={scroll.inspect}
        selected={scroll.inspection?.target ?? null}
      />
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b px-4 py-2 text-xs sm:px-8">
        <p role="status" aria-label={copy.run.viewMode}>
          {scroll.inspection ? copy.run.inspectionMode : copy.run.liveMode}
          {scroll.inspection
            ? ` · ${copy.run.actualPosition(currentRunPosition(run))} · ${copy.run.newActivities(scroll.newActivityCount)}`
            : ''}
        </p>
        {scroll.inspection ? (
          <Button size="sm" variant="outline" onClick={scroll.returnToLive}>
            {copy.run.returnToLive}
          </Button>
        ) : null}
      </div>
      <div
        ref={scroll.viewportRef}
        onScroll={scroll.onScroll}
        style={{ overflowAnchor: 'none' }}
        role="region"
        aria-label={copy.run.activityView}
        tabIndex={0}
        className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-6 sm:px-8"
      >
        <div ref={scroll.contentRef}>
          {runtimeItemsUnavailable ? (
            <p role="status" className="my-4 text-sm text-muted-foreground">
              {copy.run.runtimeTimelineUnavailable}
            </p>
          ) : null}
          {run.stepExecutions.length === 0 ? (
            <p className="py-6 text-sm">{copy.run.noRuntimeItems}</p>
          ) : null}
          {run.stepExecutions.map((execution, index) => {
            const phase = run.definition.phases.find(
              (entry) => entry.id === execution.phaseId,
            )
            const previous = run.stepExecutions[index - 1]
            const ticket = run.implementationTickets?.find(
              (entry) => entry.id === execution.implementationTicketId,
            )
            return (
              <section key={execution.id} className="min-w-0 py-3">
                {previous?.phaseId !== execution.phaseId ? (
                  <h2
                    tabIndex={-1}
                    ref={(element) => {
                      if (element)
                        scroll.targets.current.set(
                          `phase:${execution.phaseId}`,
                          element,
                        )
                    }}
                    className="mb-4 border-b py-3 text-sm font-semibold"
                  >
                    {phase?.name ?? execution.phaseId}
                  </h2>
                ) : null}
                {ticket && previous?.implementationTicketId !== ticket.id ? (
                  <h3
                    tabIndex={-1}
                    ref={(element) => {
                      if (element)
                        scroll.targets.current.set(
                          `ticket:${ticket.id}`,
                          element,
                        )
                    }}
                    className="mb-4 border-b py-2 text-sm font-medium"
                  >
                    {copy.run.ticketTitle(
                      ticket.position,
                      run.implementationTickets!.length,
                      ticket.title,
                    )}
                  </h3>
                ) : null}
                <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <h3>
                    {phase?.steps.find((step) => step.id === execution.stepId)
                      ?.name ?? execution.stepId}
                  </h3>
                  <span>{copy.run.attempt(execution.attempt)}</span>
                  <StatusBadge status={execution.status} />
                </div>
                <RuntimeItemList
                  items={itemsByExecution.get(execution.id) ?? []}
                  onOpenInIde={props.onOpenInIde}
                />
                <ExecutionDetails run={run} execution={execution} />
                {ticket && !run.stepExecutions.slice(index + 1).some((next) => next.implementationTicketId === ticket.id)
                  ? (run.summaries ?? []).filter((summary) => summary.ticketId === ticket.id).map((summary) => <RunSummaryMessage key={ticket.id} summary={summary} onOpenInIde={props.onOpenInIde} />)
                  : null}
                {run.snapshot.pendingApprovalDetails?.continuation
                  .executionId === execution.id &&
                run.snapshot.pendingApprovalDetails.decision === null && run.status === 'waiting' ? (
                  <Approval
                    run={run}
                    execution={execution}
                    disabled={pending !== null}
                    onApprove={() => { void perform('approve', props.onApprove) }}
                    onReject={() => { void perform('reject', props.onReject) }}
                  />
                ) : null}
              </section>
            )
          })}
          <details
            className="mt-5 text-sm"
            open={Boolean(
              run.pullRequest &&
                run.snapshot.pendingApprovalDetails?.decision === null,
            )}
          >
            <summary className="cursor-pointer">
              {copy.run.deliveryTitle}
            </summary>
            <DeliveryCard delivery={model.delivery} />
          </details>
          {run.status === 'completed' ? (run.summaries ?? []).filter((summary) => summary.scope === 'run').map((summary) => <RunSummaryMessage key="run-summary" summary={summary} onOpenInIde={props.onOpenInIde} />) : null}
        </div>
      </div>
      <footer
        className="max-h-[40dvh] shrink-0 overflow-y-auto border-t bg-background px-4 py-3 sm:px-8"
        aria-label={copy.run.availableActionsTitle}
      >
        <p className="mb-2 text-xs text-muted-foreground">
          {run.snapshot.nextAction}
        </p>
        <RunComposer
          run={run}
          pending={pending}
          onPause={() => perform('pause', props.onPause)}
          onSubmit={(value) => run.status === 'failed'
            ? perform('send', () => props.onRetry(value))
            : run.status === 'waiting'
              ? perform('send', () => props.onAnswer(value ?? ''))
              : perform('send', () => props.onResume(value))}
        />
      </footer>
    </main>
  )
}

function ExecutionDetails({
  run,
  execution,
}: {
  run: WorkflowRun
  execution: StepExecution
}): React.JSX.Element {
  const context = (run.phaseContexts ?? []).find(
    (entry) => entry.phaseId === execution.phaseId,
  )
  const decisions = (run.decisionRecords ?? []).filter(
    (entry) => entry.executionId === execution.id,
  )
  const logs = (run.logs ?? []).filter(
    (entry) => entry.executionId === execution.id,
  )
  const blocker =
    run.snapshot.blockedBy?.executionId === execution.id
      ? run.snapshot.blockedBy
      : null
  return (
    <>
      {execution.error ? (
        <p className="my-3 text-sm text-destructive">{execution.error}</p>
      ) : null}
      {blocker ? (
        <div className="my-3 text-sm text-destructive">
          <p>{blocker.reason}</p>
          {/merge conflict|冲突/i.test(blocker.reason) ? (
            <div className="mt-2">
              <p>{copy.run.conflictResolutionDescription}</p>
              <p>{copy.run.conflictResolutionSkill}</p>
              <p>{copy.run.conflictResolutionHuman}</p>
            </div>
          ) : null}
        </div>
      ) : null}
      {decisions.map((decision) => (
        <div key={decision.id} className="my-3 border-l-2 pl-3 text-sm">
          <strong>{decision.question}</strong>
          <p>{decision.answer}</p>
        </div>
      ))}
      {run.artifacts
        .filter((artifact) => artifact.stepExecutionId === execution.id)
        .map((artifact) => (
          <Artifact key={artifact.id} {...artifact} />
        ))}
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer text-muted-foreground">
          {copy.run.detailsTitle}
        </summary>
        <p className="mt-2">{context?.content ?? copy.run.noContext}</p>
        {logs.map((log) => (
          <p className="mt-2" key={log.id}>
            {log.message}
          </p>
        ))}
      </details>
    </>
  )
}

function Approval({
  run,
  execution,
  onApprove,
  onReject,
  disabled,
}: {
  run: WorkflowRun
  execution: StepExecution
  onApprove: () => void | Promise<void | boolean>
  onReject: () => void | Promise<void | boolean>
  disabled: boolean
}): React.JSX.Element {
  const step = run.definition.phases
    .find((phase) => phase.id === execution.phaseId)
    ?.steps.find((entry) => entry.id === execution.stepId)
  const canApprove =
    step?.adapter !== 'github.pull-request' ||
    run.pullRequest?.gate.canMerge === true
  const approval = run.snapshot.pendingApprovalDetails!.approval
  return (
    <article
      className="mt-4 rounded-lg border p-4"
      aria-label={`${copy.run.approvalTitle}: ${approval}`}
    >
      <h4 className="font-semibold">{approval}</h4>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" onClick={onApprove} disabled={disabled || !canApprove}>
          {copy.run.approveAction}
        </Button>
        <Button size="sm" variant="outline" onClick={onReject} disabled={disabled}>
          {copy.run.rejectAction}
        </Button>
      </div>
    </article>
  )
}
