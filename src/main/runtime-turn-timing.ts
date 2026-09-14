import type { RuntimeTurnItem } from '../shared/workflow-run'

/** Accumulate only active intervals, including tool execution and final text streaming. */
export function advanceTurnTiming(
  turn: RuntimeTurnItem,
  status: RuntimeTurnItem['status'],
  waitingFor: RuntimeTurnItem['waitingFor'],
  now: number,
): RuntimeTurnItem {
  if (turn.status !== 'in_progress') return turn
  const elapsedMs = turn.elapsedMs === null ? null : turn.elapsedMs + (
    turn.activeSince === null ? 0 : Math.max(0, now - Date.parse(turn.activeSince))
  )
  const terminal = status !== 'in_progress'
  return {
    ...turn, status, elapsedMs,
    waitingFor: terminal ? null : waitingFor,
    activeSince: terminal || waitingFor || elapsedMs === null ? null : new Date(now).toISOString(),
    finishedAt: terminal ? new Date(now).toISOString() : null,
  }
}
