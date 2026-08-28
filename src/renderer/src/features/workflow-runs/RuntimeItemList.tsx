import {
  FileDiff,
  ListChecks,
  MessageSquareText,
  ShieldAlert,
  Terminal,
  Wrench,
} from 'lucide-react'

import type { RuntimeItem } from '../../../../shared/workflow-run'
import { Badge } from '@renderer/components/ui/badge'
import { zhCN as copy } from '@renderer/i18n/zh-CN'

export function RuntimeItemList({
  items,
}: {
  items: RuntimeItem[]
}): React.JSX.Element {
  if (items.length === 0)
    return (
      <p className="text-sm text-muted-foreground">{copy.run.noRuntimeItems}</p>
    )
  return (
    <div className="grid gap-3">
      {items.map((item) => (
        <RuntimeItemCard item={item} key={item.id} />
      ))}
    </div>
  )
}

function RuntimeItemCard({ item }: { item: RuntimeItem }): React.JSX.Element {
  if (item.type === 'agent_message')
    return (
      <ItemShell
        label={copy.run.agentMessageItem}
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
        <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap break-words text-xs">
          {item.output || copy.run.noCommandOutput}
        </pre>
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
        <ul className="grid gap-2 text-xs">
          {item.changes.map((change) => (
            <li
              className="flex items-center justify-between gap-3"
              key={`${change.path}:${change.kind}`}
            >
              <code className="break-all">{change.path}</code>
              <span className="text-muted-foreground">
                {copy.run.fileChangeCounts(change.additions, change.deletions)}
              </span>
            </li>
          ))}
        </ul>
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
          <pre className="mt-3 whitespace-pre-wrap break-words text-xs">
            {item.output}
          </pre>
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
      className="rounded-lg border border-border bg-card p-4"
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
