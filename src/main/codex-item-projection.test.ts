import { describe, expect, it, vi } from 'vitest'

import { createCodexItemProjection } from './codex-item-projection'

const scope = {
  runId: 'run-1',
  executionId: 'execution-1',
  runtimeLocator: { runtimeProvider: 'codex', threadId: 'thread-1', turnId: 'turn-1', runtimeVersion: '0.144.3' },
  permissionPolicy: { grantedPermissions: ['workspace.read', 'workspace.write'] },
  source: 'codex app-server'
}

const metadata = {
  runId: 'run-1',
  executionId: 'execution-1',
  provider: 'codex',
  source: 'codex app-server',
  permissionPolicy: { grantedPermissions: ['workspace.read', 'workspace.write'] },
  runtimeLocator: scope.runtimeLocator
}

describe('Codex Item Projection', () => {
  it('updates one Agent message Item across deltas and treats completion as authoritative', () => {
    const publish = vi.fn()
    const projection = createCodexItemProjection({ publish })

    projection.handle({ method: 'item/started', params: { threadId: 'thread-1', turnId: 'turn-1', item: { type: 'agentMessage', id: 'item-1', text: '' } } }, scope)
    projection.handle({ method: 'item/agentMessage/delta', params: { threadId: 'thread-1', turnId: 'turn-1', itemId: 'item-1', delta: 'Draft ' } }, scope)
    projection.handle({ method: 'item/agentMessage/delta', params: { threadId: 'thread-1', turnId: 'turn-1', itemId: 'item-1', delta: 'answer' } }, scope)

    expect(projection.list(scope.executionId)).toEqual([{
      id: 'item-1',
      ...metadata,
      type: 'agent_message',
      status: 'in_progress',
      text: 'Draft answer'
    }])

    projection.handle({ method: 'item/completed', params: { threadId: 'thread-1', turnId: 'turn-1', item: { type: 'agentMessage', id: 'item-1', text: 'Final answer' } } }, scope)

    expect(projection.list(scope.executionId)).toEqual([{
      id: 'item-1',
      ...metadata,
      type: 'agent_message',
      status: 'completed',
      text: 'Final answer'
    }])
    expect(publish).toHaveBeenCalledTimes(4)
  })

  it('projects command start, aggregated output, and authoritative completion details', () => {
    const projection = createCodexItemProjection()

    projection.handle({
      method: 'item/started',
      params: {
        threadId: 'thread-1', turnId: 'turn-1',
        item: { type: 'commandExecution', id: 'item-command', command: 'pnpm test', cwd: '/work/demo', status: 'inProgress', aggregatedOutput: null, exitCode: null, durationMs: null }
      }
    }, scope)
    projection.handle({ method: 'item/commandExecution/outputDelta', params: { threadId: 'thread-1', turnId: 'turn-1', itemId: 'item-command', delta: 'partial output\n' } }, scope)
    projection.handle({ method: 'item/commandExecution/outputDelta', params: { threadId: 'thread-1', turnId: 'turn-1', itemId: 'item-command', delta: 'stale ending' } }, scope)

    expect(projection.list(scope.executionId)).toEqual([expect.objectContaining({
      id: 'item-command',
      type: 'command',
      status: 'in_progress',
      output: 'partial output\nstale ending'
    })])

    projection.handle({
      method: 'item/completed',
      params: {
        threadId: 'thread-1', turnId: 'turn-1',
        item: { type: 'commandExecution', id: 'item-command', command: 'pnpm test', cwd: '/work/demo', status: 'failed', aggregatedOutput: 'authoritative output', exitCode: 2, durationMs: 1250 }
      }
    }, scope)

    expect(projection.list(scope.executionId)).toEqual([{
      id: 'item-command',
      ...metadata,
      type: 'command',
      status: 'failed',
      command: 'pnpm test',
      output: 'authoritative output',
      exitCode: 2,
      durationMs: 1250
    }])
  })

  it('projects safe file, plan, supported tool and error items while ignoring reasoning and unknown items', () => {
    const projection = createCodexItemProjection()
    projection.handle({ method: 'item/started', params: { threadId: 'thread-1', turnId: 'turn-1', item: { type: 'reasoning', id: 'reasoning-1', content: ['secret'] } } }, scope)
    projection.handle({ method: 'item/started', params: { threadId: 'thread-1', turnId: 'turn-1', item: { type: 'fileChange', id: 'file-1', status: 'inProgress', changes: [{ path: 'src/a.ts', kind: { type: 'update' }, diff: '@@\n+one\n-two' }, { path: 'secrets/config.json', kind: 'add', diff: '+TOKEN=abc' }] } } }, scope)
    projection.handle({ method: 'item/completed', params: { threadId: 'thread-1', turnId: 'turn-1', item: { type: 'plan', id: 'plan-1', status: 'failed', text: 'Implement and verify', extra: 'do not expose' } } }, scope)
    projection.handle({ method: 'item/completed', params: { threadId: 'thread-1', turnId: 'turn-1', item: { type: 'mcpToolCall', id: 'tool-1', server: 'github', tool: 'list_issues', status: 'completed', arguments: { token: 'secret' }, durationMs: 42, result: { content: [{ text: '2 issues' }] } } } }, scope)
    projection.handle({ method: 'item/started', params: { threadId: 'thread-1', turnId: 'turn-1', item: { type: 'futureItem', id: 'unknown-1', secret: 'do not expose' } } }, scope)
    projection.handle({ method: 'error', params: { threadId: 'thread-1', turnId: 'turn-1', error: { message: 'authorization=secret failed' }, rawJsonRpc: { secret: true } } }, scope)

    expect(projection.list(scope.executionId)).toEqual([
      expect.objectContaining({ type: 'file_change', changes: [{ path: 'src/a.ts', kind: 'update', additions: 1, deletions: 1 }, { path: '<redacted path>', kind: 'add', additions: 1, deletions: 0 }], additions: 2, deletions: 1 }),
      expect.objectContaining({ type: 'plan', status: 'failed', text: 'Implement and verify' }),
      expect.objectContaining({ type: 'tool', name: 'github.list_issues', status: 'completed', durationMs: 42, output: '2 issues' }),
      expect.objectContaining({ type: 'error', status: 'failed', error: 'authorization=<redacted> failed' })
    ])
    expect(JSON.stringify(projection.list(scope.executionId))).not.toContain('secret')
  })

  it('does not reapply duplicate lifecycle or delta notifications', () => {
    const publish = vi.fn()
    const projection = createCodexItemProjection({ publish })
    const started = { method: 'item/started', params: { threadId: 'thread-1', turnId: 'turn-1', item: { type: 'agentMessage', id: 'item-1', text: '' } } } as const
    const delta = { method: 'item/agentMessage/delta', params: { threadId: 'thread-1', turnId: 'turn-1', itemId: 'item-1', delta: 'same' } } as const
    projection.handle(started, scope)
    projection.handle({ ...started, params: { ...started.params, item: { ...started.params.item } } }, scope)
    projection.handle(delta, scope)
    projection.handle({ ...delta, params: { ...delta.params } }, scope)
    expect(projection.list(scope.executionId)[0]).toMatchObject({ text: 'same' })
    expect(publish).toHaveBeenCalledTimes(2)

    const completed = { method: 'item/completed', params: { threadId: 'thread-1', turnId: 'turn-1', item: { type: 'agentMessage', id: 'item-1', text: 'final' } } } as const
    projection.handle(completed, scope)
    projection.handle({ ...completed, params: { ...completed.params, item: { ...completed.params.item } } }, scope)
    expect(projection.list(scope.executionId)[0]).toMatchObject({ status: 'completed', text: 'final' })
    expect(publish).toHaveBeenCalledTimes(3)
  })
})
