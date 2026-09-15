import { Fragment, memo } from 'react'
import {
  FileDiff,
  HelpCircle,
  ListChecks,
  MessageSquareText,
  ShieldAlert,
  Terminal,
  Wrench,
} from 'lucide-react'

import { runtimeItemIdentity, type DecisionRecord, type RuntimeItem } from '../../../../shared/workflow-run'
import { Button } from '@renderer/components/ui/button'
import { Badge } from '@renderer/components/ui/badge'
import { zhCN as copy } from '@renderer/i18n/zh-CN'
import { ReasoningItem } from './ReasoningItem'
import { UserAnswer } from './DecisionMessages'

export function RuntimeItemList({
  items,
  onOpenInIde,
  compact = false,
  active = true,
  answers,
}: {
  items: RuntimeItem[]
  answers?: Map<string, DecisionRecord>
  compact?: boolean
  active?: boolean
  onOpenInIde?: () => void
}): React.JSX.Element {
  if (items.length === 0)
    return (
      <p className="text-sm text-muted-foreground">{copy.run.noRuntimeItems}</p>
    )
  return (
    <div className="grid gap-3">
      {items.map((item) => {
        const identity = runtimeItemIdentity(item)
        const answer = answers?.get(identity)
        return <Fragment key={identity}>
          <MemoRuntimeItemCard active={active} compact={compact} item={item} hideAnswers={Boolean(answer)} onOpenInIde={onOpenInIde} />
          {answer ? <UserAnswer decision={answer} /> : null}
        </Fragment>
      })}
    </div>
  )
}

function outputSummary(output: string): string {
  const line = output.split(/\r?\n/).map((value) => value.trim()).filter(Boolean).at(-1) ?? ''
  return line.length > 160 ? `${line.slice(0, 157)}...` : line
}

function RuntimeItemCard({ item, onOpenInIde, compact = false, active: activityRunning = true, hideAnswers = false }: { item: RuntimeItem; onOpenInIde?: () => void; compact?: boolean; active?: boolean; hideAnswers?: boolean }): React.JSX.Element | null {
  if (item.type === 'turn') return null
  if (compact && (item.type === 'agent_message' || item.type === 'final_response')) return (
    <article aria-label={item.type === 'final_response' ? copy.run.finalResponseItem : copy.run.agentMessageItem} className="min-w-0 whitespace-pre-wrap break-words text-sm leading-7 [overflow-wrap:anywhere]">
      {item.text || copy.run.noOutput}
    </article>
  )
  if (compact && (item.type === 'command' || item.type === 'tool' || item.type === 'file_change' || item.type === 'plan')) {
    const active = activityRunning && item.status === 'in_progress'
    const Icon = item.type === 'command' ? Terminal : item.type === 'tool' ? Wrench : item.type === 'file_change' ? FileDiff : ListChecks
    const label = item.type === 'command' ? (active ? copy.run.runningCommand(item.command) : item.command)
      : item.type === 'tool' ? (active ? copy.run.runningTool(item.name) : item.name)
        : item.type === 'file_change' ? copy.run.fileChangeItem : copy.run.planItem
    return <details className="min-w-0 text-sm text-muted-foreground">
      <summary className="flex cursor-pointer list-none items-start gap-2 rounded-sm focus-visible:outline-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
        <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        <span className="min-w-0 break-words [overflow-wrap:anywhere]">{label}</span>
        {!active ? <span className="shrink-0">· {item.status === 'in_progress' ? copy.run.turnActivityPaused : copy.run.runtimeItemStatus[item.status]}</span> : null}
      </summary>
      <div className="mt-3 pl-6"><RuntimeItemCard item={item} onOpenInIde={onOpenInIde} /></div>
    </details>
  }
  if (item.type === 'reasoning') return <ReasoningItem item={item} compact={compact} paused={!activityRunning} />
  if (item.type === 'agent_message' || item.type === 'final_response')
    return (
      <ItemShell
        label={item.type === 'final_response' ? copy.run.finalResponseItem : copy.run.agentMessageItem}
        icon={<MessageSquareText />}
        status={item.status}
      >
        <pre className="whitespace-pre-wrap break-words text-xs">
          {item.text || copy.run.noOutput}
        </pre>
      </ItemShell>
    )
  if (item.type === 'command')
    return (
      <ItemShell
        label={copy.run.commandItem(item.command)}
        title={copy.run.commandItemTitle}
        icon={<Terminal />}
        status={item.status}
      >
        <code className="break-all rounded bg-muted px-2 py-1 text-xs">
          {item.command}
        </code>
        <p className="mt-3 text-xs text-muted-foreground">
          {outputSummary(item.output) || copy.run.noCommandOutput}
        </p>
        {item.output ? (
          <details className="mt-3 text-xs">
            <summary className="cursor-pointer text-muted-foreground">
              {copy.run.fullOutput}
            </summary>
            <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words">
              {item.output}
            </pre>
          </details>
        ) : null}
        {item.exitCode !== null || item.durationMs !== null ? (
          <footer className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
            {item.exitCode !== null ? (
              <span>{copy.run.commandExitCode(item.exitCode)}</span>
            ) : null}
            {item.durationMs !== null ? (
              <span>{copy.run.commandDuration(item.durationMs)}</span>
            ) : null}
          </footer>
        ) : null}
      </ItemShell>
    )
  if (item.type === 'file_change')
    return (
      <ItemShell
        label={copy.run.fileChangeItem}
        icon={<FileDiff />}
        status={item.status}
      >
        <details className="text-xs">
          <summary className="mb-3 cursor-pointer">{copy.run.expandFiles}</summary>
        <ul className="grid gap-2 text-xs">
          {item.changes.map((change) => (
            <li
              className="flex flex-wrap items-center justify-between gap-3"
              key={`${change.path}:${change.kind}`}
            >
              <code className="break-all">
                {item.status === 'completed'
                  ? copy.run.editedFile(change.path)
                  : copy.run.editingFile(change.path)}
              </code>
              <span className="text-muted-foreground">{copy.run.fileChangeKind[change.kind]}</span>
              <span className="text-muted-foreground">
                {copy.run.fileChangeCounts(change.additions, change.deletions)}
              </span>
            </li>
          ))}
        </ul>
        </details>
        {onOpenInIde ? <Button className="mt-3" size="sm" variant="outline" onClick={onOpenInIde}>{copy.run.openInIde}</Button> : null}
        <footer className="mt-3 text-xs text-muted-foreground">
          {copy.run.diffSummary(
            item.changes.length,
            item.additions,
            item.deletions,
          )}
        </footer>
      </ItemShell>
    )
  if (item.type === 'plan')
    return (
      <ItemShell
        label={copy.run.planItem}
        icon={<ListChecks />}
        status={item.status}
      >
        {item.text ? (
          <pre className="whitespace-pre-wrap break-words text-xs">
            {item.text}
          </pre>
        ) : null}
        {item.steps?.length ? (
          <ul className="grid gap-2 text-xs">
            {item.steps.map((step) => (
              <li
                className="flex justify-between gap-3"
                key={`${step.step}:${step.status}`}
              >
                <span>{step.step}</span>
                <span className="text-muted-foreground">{step.status}</span>
              </li>
            ))}
          </ul>
        ) : null}
        {!item.text && !item.steps?.length ? (
          <p className="text-xs text-muted-foreground">{copy.run.noOutput}</p>
        ) : null}
      </ItemShell>
    )
  if (item.type === 'question')
    return (
      <ItemShell
        label={copy.run.questionItem}
        icon={<HelpCircle />}
        status={item.status}
      >
        <ul className="grid gap-3 text-xs">
          {item.questions.map((question) => (
            <li key={question.id}>
              <strong>{question.header}</strong>
              <p>{question.question}</p>
              {question.options.length ? (
                <p className="text-muted-foreground">
                  {question.options.map((option) => option.label).join(' / ')}
                </p>
              ) : null}
              {!hideAnswers && item.answers[question.id]?.length ? (
                <p className="text-muted-foreground">
                  {copy.run.questionAnswer(item.answers[question.id].join(', '))}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      </ItemShell>
    )
  if (item.type === 'approval')
    return (
      <ItemShell
        label={copy.run.approvalItem}
        icon={<ShieldAlert />}
        status={item.status}
      >
        <p className="text-xs">{item.summary}</p>
        {item.decision ? (
          <p className="mt-2 text-xs text-muted-foreground">
            {copy.run.approvalDecision(item.decision)}
          </p>
        ) : null}
      </ItemShell>
    )
  if (item.type === 'interrupt')
    return (
      <ItemShell
        label={copy.run.interruptItem}
        icon={<ShieldAlert />}
        status={item.status}
      >
        <p className="text-xs text-muted-foreground">
          {item.status === 'in_progress'
            ? copy.run.interrupting
            : copy.run.interrupted}
        </p>
      </ItemShell>
    )
  if (item.type === 'tool')
    return (
      <ItemShell
        label={copy.run.toolItem(item.name)}
        title={copy.run.toolItemTitle}
        icon={<Wrench />}
        status={item.status}
      >
        <code className="break-all text-xs">{item.name}</code>
        {item.output ? (
          <>
            <p className="mt-3 text-xs text-muted-foreground">
              {outputSummary(item.output)}
            </p>
            <details className="mt-3 text-xs">
              <summary className="cursor-pointer text-muted-foreground">
                {copy.run.fullResult}
              </summary>
              <pre className="mt-2 whitespace-pre-wrap break-words">
                {item.output}
              </pre>
            </details>
          </>
        ) : null}
        {item.durationMs !== null ? (
          <footer className="mt-3 text-xs text-muted-foreground">
            {copy.run.commandDuration(item.durationMs)}
          </footer>
        ) : null}
      </ItemShell>
    )
  return (
    <ItemShell
      label={copy.run.errorItem}
      icon={<ShieldAlert />}
      status="failed"
    >
      <p className="text-sm text-destructive">{item.error}</p>
    </ItemShell>
  )
}

const MemoRuntimeItemCard = memo(RuntimeItemCard)

function ItemShell({
  label,
  title = label,
  icon,
  status,
  children,
}: {
  label: string
  title?: string
  icon: React.ReactElement
  status: RuntimeItem['status']
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <article
      className="min-w-0 rounded-lg border border-border bg-card p-4 [overflow-wrap:anywhere]"
      aria-label={label}
    >
      <header className="mb-3 flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-sm font-semibold">
          {
            <span className="text-primary [&>svg]:size-4" aria-hidden="true">
              {icon}
            </span>
          }
          <strong>{title}</strong>
        </span>
        <Badge
          variant={
            status === 'failed' || status === 'declined'
              ? 'destructive'
              : 'secondary'
          }
        >
          {copy.run.runtimeItemStatus[status]}
        </Badge>
      </header>
      {children}
    </article>
  )
}
