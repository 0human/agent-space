import { useEffect, useState } from 'react'
import { ChevronRight } from 'lucide-react'

import { runtimeItemIdentity, type DecisionRecord, type RuntimeItem, type RuntimeTurnItem, type StepExecutionStatus } from '../../../../shared/workflow-run'
import { zhCN as copy } from '@renderer/i18n/zh-CN'
import { RuntimeItemList } from './RuntimeItemList'
import { locateDecisionMessages, MissingDecisionMessages } from './DecisionMessages'

export function RuntimeTurnList({ items, decisions = [], executionStatus, onOpenInIde }: {
  items: RuntimeItem[]
  decisions?: DecisionRecord[]
  executionStatus: StepExecutionStatus
  onOpenInIde?: () => void
}): React.JSX.Element {
  const groups = new Map<string, RuntimeItem[]>()
  for (const item of items) {
    const key = JSON.stringify([item.provider, item.runtimeLocator.threadId, item.runtimeLocator.turnId])
    const group = groups.get(key) ?? []
    group.push(item)
    groups.set(key, group)
  }
  const messages = locateDecisionMessages(items, decisions)
  if (!items.length && !messages.unmatched.length) return <RuntimeItemList items={[]} />
  return <div className="space-y-6">{[...groups].map(([key, group]) => {
    const turn = group.find((item): item is RuntimeTurnItem => item.type === 'turn')
    return turn
      ? <RuntimeTurn key={key} turn={turn} items={group.filter((item) => item.type !== 'turn')} answers={messages.afterItem} executionStatus={executionStatus} onOpenInIde={onOpenInIde} />
      : <RuntimeItemList key={key} items={group} answers={messages.afterItem} onOpenInIde={onOpenInIde} />
  })}<MissingDecisionMessages decisions={messages.unmatched} /></div>
}

function TurnDuration({ turn, running }: { turn: RuntimeTurnItem; running: boolean }): React.JSX.Element {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    if (!running || !turn.activeSince || turn.elapsedMs === null) return
    setNow(Date.now())
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [running, turn.activeSince, turn.elapsedMs])
  const elapsed = turn.elapsedMs === null ? null : turn.elapsedMs + (
    running && turn.activeSince ? Math.max(0, now - Date.parse(turn.activeSince)) : 0
  )
  return <span>{elapsed === null
    ? (turn.status === 'in_progress' ? copy.run.processing : copy.run.turnDurationUnknown)
    : (turn.status === 'in_progress' ? copy.run.turnElapsed(elapsed) : copy.run.turnDuration(elapsed))}</span>
}

function RuntimeTurn({ turn, items, answers, executionStatus, onOpenInIde }: {
  turn: RuntimeTurnItem
  items: RuntimeItem[]
  answers: Map<string, DecisionRecord>
  executionStatus: StepExecutionStatus
  onOpenInIde?: () => void
}): React.JSX.Element {
  const terminal = turn.status !== 'in_progress'
  // User choices survive deltas; completion has its own default (collapsed).
  const [expanded, setExpanded] = useState<{ terminal: boolean; open: boolean } | null>(null)
  const open = expanded?.terminal === terminal ? expanded.open : !terminal
  const running = !terminal && !turn.waitingFor && executionStatus === 'running'
  const finalItems = items.filter((item) => item.type === 'final_response')
  // Older providers may omit the final_answer phase. Preserve the last reply.
  const fallback = turn.status === 'completed' && !finalItems.length ? [...items].reverse().find((item) => item.type === 'agent_message') : undefined
  const outside = items.filter((item) => answers.has(runtimeItemIdentity(item)) || item.type === 'final_response' || item === fallback ||
    item.type === 'question' || item.type === 'approval' || item.type === 'error' || item.type === 'interrupt')
  const process = items.filter((item) => !outside.includes(item))
  const activity = process.some((item) => item.status === 'in_progress') || finalItems.some((item) => item.status === 'in_progress')
  const status = turn.waitingFor === 'question' ? copy.run.turnWaitingQuestion
    : turn.waitingFor === 'approval' ? copy.run.turnWaitingApproval
      : turn.status === 'failed' ? copy.run.turnFailed
        : turn.status === 'declined' ? copy.run.turnInterrupted
          : !terminal && executionStatus !== 'running' ? copy.run.status[executionStatus === 'pending' ? 'waiting' : executionStatus] : null
  return (
    <section aria-label={copy.run.turnProcess} className="min-w-0">
      <details open={open}>
        <summary onClick={(event) => { event.preventDefault(); setExpanded({ terminal, open: !open }) }} className="flex cursor-pointer list-none items-center gap-2 border-b pb-3 text-sm text-muted-foreground focus-visible:outline-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
          <TurnDuration turn={turn} running={running} />
          {status ? <span role="status">· {status}</span> : null}
          <ChevronRight aria-hidden="true" className={`size-4 transition-transform ${open ? 'rotate-90' : ''}`} />
        </summary>
        <div className="space-y-3 py-4">
          {process.length ? <RuntimeItemList items={process} compact active={running} onOpenInIde={onOpenInIde} /> : null}
          {running && !activity ? <p role="status" className="text-sm text-muted-foreground">{copy.run.processing}</p> : null}
        </div>
      </details>
      {outside.length ? <div className="pt-4"><RuntimeItemList items={outside} answers={answers} compact onOpenInIde={onOpenInIde} /></div> : null}
    </section>
  )
}
