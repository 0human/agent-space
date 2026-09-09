import { useLayoutEffect, useRef } from 'react'
import type {
  ImplementationTicket,
  WorkflowRun,
} from '../../../../shared/workflow-run'
import { zhCN as copy } from '@renderer/i18n/zh-CN'
import { StatusBadge } from './RunActivitySupport'

export function phaseStatus(run: WorkflowRun, phaseIndex: number): string {
  const phase = run.definition.phases[phaseIndex]
  const executions = run.stepExecutions.filter(
    (execution) => execution.phaseId === phase.id,
  )
  const latest = new Map(
    executions.map((execution) => [
      `${execution.stepId}:${execution.implementationTicketId ?? ''}`,
      execution,
    ]),
  )
  if (
    latest.size > 0 &&
    [...latest.values()].every((execution) => execution.status === 'skipped')
  )
    return 'skipped'
  if (run.status === 'completed') return 'completed'
  if (phaseIndex === run.snapshot.phaseIndex) return run.status
  if (phaseIndex < run.snapshot.phaseIndex) return 'completed'
  return 'pending'
}

export function currentRunPosition(run: WorkflowRun): string {
  const phase = run.definition.phases[run.snapshot.phaseIndex]
  const progress = run.snapshot.ticketProgress
  if (phase?.id === 'implementation' && progress?.total) {
    return `${phase.name} · ${copy.run.ticketPosition(progress.current, progress.total)}`
  }
  return (
    [phase?.name, phase?.steps[run.snapshot.stepIndex]?.name]
      .filter(Boolean)
      .join(' · ') || copy.run.noRuntimeItems
  )
}

export function RunProgress({
  run,
  onInspect,
  selected,
}: {
  run: WorkflowRun
  onInspect: (target: string) => void
  selected: string | null
}): React.JSX.Element {
  const phase = run.definition.phases[run.snapshot.phaseIndex]
  const phaseNav = useRef<HTMLElement>(null)
  const ticketNav = useRef<HTMLElement>(null)
  const tickets = run.implementationTickets ?? []
  const currentTicket =
    phase?.id === 'implementation'
      ? tickets.find(
          (ticket) =>
            ticket.id === run.snapshot.ticketProgress?.currentTicketId,
        )
      : undefined
  useLayoutEffect(() => {
    const revealCurrent = (): void => {
      for (const nav of [phaseNav.current, ticketNav.current]) {
        const current = nav?.querySelector<HTMLElement>('[aria-current="step"]')
        if (!nav || !current) continue
        const bounds = current.getBoundingClientRect()
        const viewport = nav.getBoundingClientRect()
        if (bounds.left < viewport.left)
          nav.scrollLeft -= viewport.left - bounds.left
        else if (bounds.right > viewport.right)
          nav.scrollLeft += bounds.right - viewport.right
      }
    }
    revealCurrent()
    const observer = new ResizeObserver(revealCurrent)
    if (phaseNav.current) observer.observe(phaseNav.current)
    if (ticketNav.current) observer.observe(ticketNav.current)
    return () => observer.disconnect()
  }, [run.snapshot.phaseIndex, currentTicket?.id])
  return (
    <div
      className="shrink-0 border-b bg-background"
      aria-label={copy.run.progressLabel}
    >
      <nav
        ref={phaseNav}
        className="overflow-x-auto border-b px-4 py-2 sm:px-8"
        aria-label={copy.run.workflowProgress}
      >
        <ol className="flex w-max gap-2">
          {run.definition.phases.map((entry, index) => {
            const status = phaseStatus(run, index)
            const target = `phase:${entry.id}`
            return (
              <li key={entry.id}>
                <button
                  type="button"
                  className="flex items-center gap-2 rounded-md px-2 py-1 text-xs hover:bg-muted focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50"
                  aria-current={
                    index === run.snapshot.phaseIndex ? 'step' : undefined
                  }
                  aria-pressed={selected === target}
                  aria-label={`${entry.name}：${copy.run.status[status as keyof typeof copy.run.status] ?? copy.run.pending}`}
                  disabled={
                    !run.stepExecutions.some(
                      (execution) => execution.phaseId === entry.id,
                    )
                  }
                  onClick={() => onInspect(target)}
                >
                  <span>{entry.name}</span>
                  <StatusBadge status={status} />
                </button>
              </li>
            )
          })}
        </ol>
      </nav>
      <section
        className="min-w-0 px-4 py-2 text-xs sm:px-8"
        aria-label={copy.run.currentProgress}
      >
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="min-w-0 break-words font-semibold">
            {currentRunPosition(run)}
          </span>
          {currentTicket ? (
            <TicketStages ticket={currentTicket} />
          ) : (
            <StatusBadge status={run.status} />
          )}
        </div>
        {tickets.length > 0 ? (
          <nav
            ref={ticketNav}
            className="mt-2 overflow-x-auto"
            aria-label={copy.run.ticketHistory}
          >
            <ol className="flex w-max gap-2">
              {[...tickets]
                .sort((left, right) => left.position - right.position)
                .map((ticket) => (
                  <li key={ticket.id}>
                    <button
                      type="button"
                      className="rounded px-2 py-1 hover:bg-muted focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50"
                      aria-label={copy.run.ticketTitle(
                        ticket.position,
                        tickets.length,
                        ticket.title,
                      )}
                      aria-current={
                        currentTicket?.id === ticket.id ? 'step' : undefined
                      }
                      aria-pressed={selected === `ticket:${ticket.id}`}
                      disabled={
                        !run.stepExecutions.some(
                          (execution) =>
                            execution.implementationTicketId === ticket.id,
                        )
                      }
                      onClick={() => onInspect(`ticket:${ticket.id}`)}
                    >
                      {copy.run.ticketPosition(ticket.position, tickets.length)}
                    </button>
                  </li>
                ))}
            </ol>
          </nav>
        ) : null}
      </section>
    </div>
  )
}

function TicketStages({
  ticket,
}: {
  ticket: ImplementationTicket
}): React.JSX.Element {
  return (
    <ol className="flex flex-wrap gap-2" aria-label={copy.run.ticketStages}>
      {(
        Object.keys(copy.run.stages) as Array<
          keyof ImplementationTicket['stages']
        >
      ).map((stage, index) => {
        const label = copy.run.stages[stage]
        const status = ticket.stages[stage]
        return (
          <li
            key={stage}
            className="flex items-center gap-1"
            aria-label={`${label}：${copy.run.status[status as keyof typeof copy.run.status] ?? copy.run.pending}`}
          >
            {index > 0 ? <span aria-hidden="true">→</span> : null}
            <span
              className={
                status === 'running' ? 'font-semibold text-primary' : ''
              }
            >
              {label}
            </span>
            <span
              aria-hidden="true"
              className={
                status === 'failed' ? 'text-destructive' : 'text-primary'
              }
            >
              {status === 'completed'
                ? '✓'
                : status === 'running'
                  ? '●'
                  : status === 'failed'
                    ? '!'
                    : status === 'skipped'
                      ? '–'
                      : ''}
            </span>
          </li>
        )
      })}
    </ol>
  )
}
