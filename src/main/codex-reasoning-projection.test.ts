import { describe, expect, it, vi } from 'vitest'

import { createCodexItemProjection } from './codex-item-projection'

const scope = {
  runId: 'run-1', executionId: 'execution-1',
  runtimeLocator: { runtimeProvider: 'codex', threadId: 'thread-1', turnId: 'turn-1', runtimeVersion: '0.144.3' },
  permissionPolicy: { grantedPermissions: ['workspace.read'] }, source: 'codex app-server',
}
const params = { threadId: 'thread-1', turnId: 'turn-1' }

describe('Reasoning in the Runtime Item projection', () => {
  it('publishes thinking immediately and streams separate summary and content sections before completion', () => {
    const publish = vi.fn()
    const projection = createCodexItemProjection({ publish })
    projection.handle({ method: 'item/started', params: { ...params, item: { id: 'thinking', type: 'reasoning', summary: [], content: [] } } }, scope)
    expect(publish).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'reasoning', status: 'in_progress', summary: [], content: [] }))
    projection.handle({ method: 'item/reasoning/summaryTextDelta', params: { ...params, itemId: 'thinking', summaryIndex: 1, delta: '检查测试' } }, scope)
    projection.handle({ method: 'item/reasoning/summaryTextDelta', params: { ...params, itemId: 'thinking', summaryIndex: 0, delta: '读取' } }, scope)
    projection.handle({ method: 'item/reasoning/summaryPartAdded', params: { ...params, itemId: 'thinking', summaryIndex: 0 } }, scope)
    projection.handle({ method: 'item/reasoning/summaryTextDelta', params: { ...params, itemId: 'thinking', summaryIndex: 0, delta: '文件' } }, scope)
    projection.handle({ method: 'item/reasoning/textDelta', params: { ...params, itemId: 'thinking', contentIndex: 0, delta: 'Runtime 提供的详细文本。' } }, scope)
    expect(projection.list(scope.executionId)).toEqual([expect.objectContaining({
      type: 'reasoning', status: 'in_progress', summary: ['读取文件', '检查测试'], content: ['Runtime 提供的详细文本。'],
    })])
    projection.handle({ method: 'item/completed', params: { ...params, item: { id: 'thinking', type: 'reasoning', summary: ['已确认实现方向'], content: ['最终详细文本。'], encryptedContent: 'opaque-private-payload' } } }, scope)
    projection.handle({ method: 'item/reasoning/textDelta', params: { ...params, itemId: 'thinking', contentIndex: 0, delta: 'late' } }, scope)
    expect(projection.list(scope.executionId)).toEqual([expect.objectContaining({
      status: 'completed', summary: ['已确认实现方向'], content: ['最终详细文本。'],
    })])
    expect(JSON.stringify(publish.mock.calls)).not.toContain('opaque-private-payload')
  })

  it('redacts split credentials in each stream and isolates executions and turns', () => {
    const publish = vi.fn()
    const projection = createCodexItemProjection({ publish })
    for (const [method, index] of [['item/reasoning/summaryTextDelta', 'summaryIndex'], ['item/reasoning/textDelta', 'contentIndex']]) {
      for (const delta of ['token: ghp_', 'privateCredential123'])
        projection.handle({ method, params: { ...params, itemId: 'thinking', [index]: 0, delta } }, scope)
    }
    projection.handle({ method: 'item/reasoning/textDelta', params: { ...params, turnId: 'other', itemId: 'thinking', contentIndex: 0, delta: 'wrong turn' } }, scope)
    projection.handle({ method: 'item/reasoning/textDelta', params: { ...params, itemId: 'thinking', contentIndex: -1, delta: 'bad index' } }, scope)
    projection.handle({ method: 'item/reasoning/textDelta', params: { ...params, itemId: 'thinking', contentIndex: 0, delta: 'other execution' } }, { ...scope, executionId: 'execution-2' })
    const serialized = JSON.stringify(publish.mock.calls)
    expect(serialized).not.toMatch(/ghp_|privateCredential|wrong turn|bad index/)
    expect(projection.list(scope.executionId)).toEqual([expect.objectContaining({ summary: ['token: <redacted>'], content: ['token: <redacted>'] })])
    expect(projection.list('execution-2')).toEqual([expect.objectContaining({ content: ['other execution'] })])
  })

  it('restores active history without rolling back live text and recovers completed sections', () => {
    const projection = createCodexItemProjection()
    const history = { thread: { id: 'thread-1', turns: [{ id: 'turn-1', status: 'inProgress', items: [
      { type: 'reasoning', id: 'thinking', summary: ['正在'], content: ['详细'] },
    ] }] } }
    projection.restore(history, scope)
    projection.handle({ method: 'item/reasoning/summaryTextDelta', params: { ...params, itemId: 'thinking', summaryIndex: 0, delta: '检查' } }, scope)
    projection.restore(history, scope)
    expect(projection.list(scope.executionId).filter((item) => item.type !== 'turn')).toEqual([expect.objectContaining({ status: 'in_progress', summary: ['正在检查'], content: ['详细'] })])
    const recovered = createCodexItemProjection()
    recovered.restore({ thread: { ...history.thread, turns: [{ ...history.thread.turns[0], status: 'completed' }] } }, scope)
    expect(recovered.list(scope.executionId).filter((item) => item.type !== 'turn')).toEqual([expect.objectContaining({ status: 'completed', summary: ['正在'], content: ['详细'] })])
  })

  it.each(['completed', 'interrupted', 'failed'] as const)('ends the thinking indicator when the Turn is %s without an Item completion', (status) => {
    const projection = createCodexItemProjection()
    projection.handle({ method: 'item/started', params: { ...params, item: { id: 'thinking', type: 'reasoning', summary: [], content: [] } } }, scope)
    projection.completeTurn(status, null, scope)
    expect(projection.list(scope.executionId).filter((item) => item.type !== 'turn')).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'reasoning', status: status === 'interrupted' ? 'declined' : status })]))
  })
})
