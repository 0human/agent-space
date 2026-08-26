import { describe, expect, it, vi } from 'vitest'

import { createCodexItemProjection } from './codex-item-projection'

const scope = {
  runId: 'run-1',
  executionId: 'execution-1',
  threadId: 'thread-1',
  turnId: 'turn-1'
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
      runId: 'run-1',
      executionId: 'execution-1',
      type: 'agent_message',
      status: 'in_progress',
      text: 'Draft answer'
    }])

    projection.handle({ method: 'item/completed', params: { threadId: 'thread-1', turnId: 'turn-1', item: { type: 'agentMessage', id: 'item-1', text: 'Final answer' } } }, scope)

    expect(projection.list(scope.executionId)).toEqual([{
      id: 'item-1',
      runId: 'run-1',
      executionId: 'execution-1',
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
      runId: 'run-1',
      executionId: 'execution-1',
      type: 'command',
      status: 'failed',
      command: 'pnpm test',
      cwd: '/work/demo',
      output: 'authoritative output',
      exitCode: 2,
      durationMs: 1250
    }])
  })
})
