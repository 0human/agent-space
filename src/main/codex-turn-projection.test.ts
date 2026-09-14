import { describe, expect, it, vi } from 'vitest'
import { createCodexItemProjection } from './codex-item-projection'

const scope = {
  runId: 'run-1', executionId: 'execution-1',
  runtimeLocator: { runtimeProvider: 'codex', threadId: 'thread-1', turnId: 'turn-1', runtimeVersion: 'test' },
  permissionPolicy: { grantedPermissions: [] }, source: 'codex app-server',
}
const params = { threadId: 'thread-1', turnId: 'turn-1' }

describe('Turn display lifecycle', () => {
  it('starts before Items arrive, excludes waiting, and freezes only at Turn completion', () => {
    let now = 0
    const publish = vi.fn()
    const projection = createCodexItemProjection({ now: () => now, publish })
    projection.startTurn(scope)
    expect(publish).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'turn', elapsedMs: 0, status: 'in_progress' }))
    now = 3000
    projection.handle({ method: 'item/completed', params: { ...params, item: { id: 'reasoning', type: 'reasoning', summary: [], content: [] } } }, scope)
    const request = { id: 1, method: 'item/commandExecution/requestApproval', params: { ...params, itemId: 'command', command: 'pnpm test' } }
    now = 13000
    projection.handleRequest(request, scope)
    const turn = () => projection.list(scope.executionId).find((item) => item.type === 'turn')!
    expect(turn()).toMatchObject({ elapsedMs: 13000, activeSince: null, waitingFor: 'approval', status: 'in_progress' })
    now = 23000
    projection.handleRequest(request, scope)
    expect(turn()).toMatchObject({ elapsedMs: 13000 })
    now = 73000
    projection.completeRequest(request, { decision: 'accept' }, scope)
    expect(turn()).toMatchObject({ elapsedMs: 13000, activeSince: new Date(now).toISOString(), waitingFor: null })
    projection.handle({ method: 'item/started', params: { ...params, item: { id: 'command', type: 'commandExecution', command: 'pnpm test' } } }, scope)
    now = 86000
    projection.completeTurn('completed', null, scope)
    expect(turn()).toMatchObject({ elapsedMs: 26000, activeSince: null, status: 'completed', finishedAt: new Date(now).toISOString() })
    expect(projection.list(scope.executionId).find((item) => item.type === 'command')).toMatchObject({ status: 'completed' })
    now = 100000
    projection.startTurn(scope)
    projection.completeTurn('completed', null, scope)
    expect(turn()).toMatchObject({ elapsedMs: 26000, finishedAt: new Date(86000).toISOString() })
  })

  it('keeps overlapping requests paused until all responses and isolates Turns', () => {
    let now = 0
    const projection = createCodexItemProjection({ now: () => now })
    projection.startTurn(scope)
    const question = { id: 1, method: 'item/tool/requestUserInput', params: { ...params, itemId: 'q', questions: [{ id: 'q', header: '范围', question: '首版范围？' }] } }
    const approval = { id: 2, method: 'item/commandExecution/requestApproval', params: { ...params, itemId: 'a', command: 'pwd' } }
    now = 5000
    projection.handleRequest(question, scope)
    projection.handleRequest(approval, scope)
    now = 15000
    projection.completeRequest(question, { answers: {} }, scope)
    expect(projection.list(scope.executionId)[0]).toMatchObject({ elapsedMs: 5000, waitingFor: 'approval', activeSince: null })
    projection.completeTurn('interrupted', null, scope)
    const next = { ...scope, runtimeLocator: { ...scope.runtimeLocator, turnId: 'turn-2' } }
    projection.startTurn(next)
    now = 18000
    projection.completeTurn('failed', 'failed', next)
    expect(projection.list(scope.executionId).filter((item) => item.type === 'turn')).toMatchObject([
      { status: 'declined', elapsedMs: 5000 }, { status: 'failed', elapsedMs: 3000 },
    ])
  })

  it('fills an active history placeholder when the live Turn start arrives later', () => {
    let now = 1000
    const projection = createCodexItemProjection({ now: () => now })
    projection.restore({ thread: { id: 'thread-1', turns: [{ id: 'turn-1', status: 'inProgress', items: [] }] } }, scope)
    now = 2000
    projection.startTurn(scope, 500)
    now = 3500
    projection.completeTurn('completed', null, scope)
    expect(projection.list(scope.executionId)[0]).toMatchObject({ elapsedMs: 3000, startedAt: new Date(500).toISOString() })
  })

  it('restores unknown timing without inventing elapsed time or overwriting live timing', () => {
    let now = 1000
    const projection = createCodexItemProjection({ now: () => now })
    const history = { thread: { id: 'thread-1', turns: [{ id: 'turn-1', status: 'completed', items: [] }] } }
    projection.startTurn(scope)
    now = 4000
    projection.completeTurn('completed', null, scope)
    projection.restore(history, scope)
    expect(projection.list(scope.executionId)[0]).toMatchObject({ elapsedMs: 3000 })
    const recovered = createCodexItemProjection({ now: () => now })
    recovered.restore(history, scope)
    expect(recovered.list(scope.executionId)[0]).toMatchObject({ elapsedMs: null, startedAt: null, activeSince: null, status: 'completed' })
  })
})
