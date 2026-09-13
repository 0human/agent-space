import type { RunSummary, WorkflowRunStatus } from '../../../../shared/workflow-run'
import { Button } from '@renderer/components/ui/button'
import { zhCN as copy } from '@renderer/i18n/zh-CN'
import { Artifact } from './RunActivitySupport'

export function RunSummaryMessage({ summary, onOpenInIde }: { summary: RunSummary; onOpenInIde?: () => void }): React.JSX.Element {
  const title = summary.scope === 'run' ? copy.run.finalSummary : copy.run.ticketSummary(summary.title)
  const kinds = (['add', 'update', 'delete'] as const).flatMap((kind) => {
    const count = summary.files.filter((file) => file.kinds.includes(kind)).length
    return count ? [`${copy.run.fileChangeKind[kind]} ${count}`] : []
  })
  return (
    <article aria-label={title} className="my-5 rounded-lg border bg-muted/30 p-4 text-sm">
      <h3 className="font-semibold">{title} · {copy.run.status.completed}</h3>
      {summary.scope === 'run' && summary.ticketCount > 0 ? <p className="mt-2">{copy.run.completedTickets(summary.ticketCount)}</p> : null}
      {summary.results.length > 0 ? (
        <ul className="mt-3 grid gap-1">
          {summary.results.map((result, index) => <li key={`${result.category}:${index}`}>
            {copy.run.summaryCategories[result.category]}：{copy.run.status[result.status as WorkflowRunStatus] ?? result.status} · {result.name}
          </li>)}
        </ul>
      ) : null}
      {summary.files.length > 0 ? (
        <details className="mt-3">
          <summary className="cursor-pointer">{copy.run.fileChangeItem} · {kinds.join('、')} · {copy.run.fileChangeCounts(summary.files.reduce((total, file) => total + file.additions, 0), summary.files.reduce((total, file) => total + file.deletions, 0))}</summary>
          <ul className="my-2 grid gap-1">
            {summary.files.map((file) => <li className="break-all" key={file.path}>{file.path} · {file.kinds.map((kind) => copy.run.fileChangeKind[kind]).join('、')} · {copy.run.fileChangeCounts(file.additions, file.deletions)}</li>)}
          </ul>
          {onOpenInIde ? <Button size="sm" variant="outline" onClick={onOpenInIde}>{copy.run.openInIde}</Button> : null}
        </details>
      ) : null}
      {summary.failedAttemptCount > 0 ? <p className="mt-3">{copy.run.summaryFailures(summary.failedAttemptCount, summary.attemptCount)}</p> : null}
      {summary.failures.map((failure, index) => <p className="mt-1 text-destructive" key={index}>{failure}</p>)}
      {summary.interruptionCount > 0 ? <p className="mt-2">{copy.run.summaryInterruptions(summary.interruptionCount)}</p> : null}
      {summary.artifacts.length > 0 ? (
        <details className="mt-3">
          <summary className="mb-2 cursor-pointer">{copy.run.artifactsTitle}</summary>
          {summary.artifacts.map((artifact) => <Artifact key={artifact.id} {...artifact} />)}
        </details>
      ) : null}
      {summary.durationMs !== null ? <p className="mt-3 text-muted-foreground">{copy.run.commandDuration(summary.durationMs)}</p> : null}
    </article>
  )
}
