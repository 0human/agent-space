import { and, eq, inArray } from 'drizzle-orm'
import type { AppDatabase } from '../db/client'
import { runtimeRuns, workSessions } from '../db/schema'

export interface StartupRecoveryResult {
  interruptedRunCount: number
  erroredSessionCount: number
}

const RECOVERABLE_RUN_STATUSES = ['starting', 'running', 'waiting_input', 'waiting_permission']

// This is a startup consistency repair, not a shutdown cleanup. The failures
// that leave runs stuck in active states are usually crashes, kills, or power
// loss, where shutdown hooks never run. On the next launch we can reliably scan
// persisted state and mark those unfinished runs as interrupted.
export function recoverInterruptedRuns(db: AppDatabase): StartupRecoveryResult {
  return db.transaction((tx) => {
    const activeRuns = tx
      .select({
        id: runtimeRuns.id,
        workSessionId: runtimeRuns.workSessionId
      })
      .from(runtimeRuns)
      .where(inArray(runtimeRuns.status, RECOVERABLE_RUN_STATUSES))
      .all()

    if (activeRuns.length === 0) {
      return {
        interruptedRunCount: 0,
        erroredSessionCount: 0
      }
    }

    const recoveredAt = new Date().toISOString()
    const runIds = activeRuns.map((run) => run.id)
    const sessionIds = [...new Set(activeRuns.map((run) => run.workSessionId))]

    const interruptedRuns = tx
      .update(runtimeRuns)
      .set({
        status: 'interrupted',
        endedAt: recoveredAt,
        errorSummary: 'Run was interrupted because the app shut down before it completed.'
      })
      .where(inArray(runtimeRuns.id, runIds))
      .returning({ id: runtimeRuns.id })
      .all()

    const erroredSessions = tx
      .update(workSessions)
      .set({
        status: 'error',
        updatedAt: recoveredAt
      })
      .where(and(inArray(workSessions.id, sessionIds), eq(workSessions.status, 'running')))
      .returning({ id: workSessions.id })
      .all()

    return {
      interruptedRunCount: interruptedRuns.length,
      erroredSessionCount: erroredSessions.length
    }
  })
}
