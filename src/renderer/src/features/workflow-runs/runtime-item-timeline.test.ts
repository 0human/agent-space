import { describe, expect, it } from 'vitest'

import type { RuntimeItem } from '../../../../shared/workflow-run'

import { mergeRuntimeItemTimeline } from './runtime-item-timeline'

function message(turnId: string, status: 'in_progress' | 'completed', text: string): RuntimeItem {
  return {
    id: 'shared-item',
    runId: 'run-1',
    executionId: 'execution-1',
    provider: 'codex',
    source: 'codex app-server',
    permissionPolicy: { grantedPermissions: ['workspace.read'] },
    runtimeLocator: { runtimeProvider: 'codex', threadId: 'thread-1', turnId, runtimeVersion: '0.144.3' },
    type: 'agent_message',
    status,
    text
  }
}

describe('Runtime Item timeline merge', () => {
  it('keeps terminal Items monotonic while isolating the same item id across Turns', () => {
    const completed = message('turn-1', 'completed', 'Final')
    const delayedDraft = message('turn-1', 'in_progress', 'Stale draft')
    const nextTurn = message('turn-2', 'in_progress', 'Next turn')

    expect(mergeRuntimeItemTimeline([completed], [delayedDraft, nextTurn])).toEqual([
      completed,
      nextTurn
    ])
  })
})
