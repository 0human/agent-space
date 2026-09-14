import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { RuntimeItem, RuntimeTurnItem } from '../../../../shared/workflow-run'
import { RuntimeTurnList } from './RuntimeTurnList'

const turn: RuntimeTurnItem = {
  id: 'turn:turn-1', runId: 'run-1', executionId: 'execution-1', provider: 'codex', source: 'codex app-server',
  permissionPolicy: { grantedPermissions: [] },
  runtimeLocator: { runtimeProvider: 'codex', threadId: 'thread-1', turnId: 'turn-1', runtimeVersion: 'test' },
  type: 'turn', status: 'in_progress', startedAt: new Date(0).toISOString(), finishedAt: null,
  elapsedMs: 0, activeSince: new Date(0).toISOString(), waitingFor: null,
}
const progress: RuntimeItem = { ...turn, id: 'progress', type: 'agent_message', status: 'completed', text: '我先检查现有实现。' }
const thinking: RuntimeItem = { ...turn, id: 'thinking', type: 'reasoning', summary: [], content: [] }
const command: RuntimeItem = { ...turn, id: 'command', type: 'command', command: 'cat workflow-run.ts', output: '文件内容', exitCode: null, durationMs: null }
const final: RuntimeItem = { ...turn, id: 'final', type: 'final_response', status: 'completed', text: '已经完成修改。' }

afterEach(() => vi.useRealTimers())

describe('Codex style Turn activity', () => {
  it('keeps timing separate from thinking and tools, then collapses process while preserving the final reply', () => {
    vi.useFakeTimers()
    vi.setSystemTime(13000)
    const { rerender } = render(<RuntimeTurnList items={[turn, progress, thinking]} executionStatus="running" />)
    expect(screen.getByText('已处理 13秒')).toBeVisible()
    expect(screen.getByText('正在思考')).toBeVisible()
    expect(screen.getByText(progress.text)).toBeVisible()
    act(() => vi.advanceTimersByTime(6000))
    rerender(<RuntimeTurnList items={[turn, progress, { ...thinking, status: 'completed' }, command]} executionStatus="running" />)
    expect(screen.getByText('已处理 19秒')).toBeVisible()
    expect(screen.getByText('正在运行 cat workflow-run.ts')).toBeVisible()
    expect(screen.queryByText('正在思考')).not.toBeInTheDocument()
    act(() => vi.advanceTimersByTime(7000))
    const completed: RuntimeTurnItem = { ...turn, status: 'completed', elapsedMs: 26000, activeSince: null, finishedAt: new Date(26000).toISOString() }
    const doneItems: RuntimeItem[] = [completed, progress, { ...thinking, status: 'completed' }, { ...command, status: 'completed' }, final]
    rerender(<RuntimeTurnList items={doneItems} executionStatus="completed" />)
    expect(screen.getByText('用时 26秒')).toBeVisible()
    expect(screen.getByText(progress.text)).not.toBeVisible()
    expect(screen.getByText(final.text)).toBeVisible()
    const details = screen.getByText('用时 26秒').closest('details')!
    fireEvent.click(screen.getByText('用时 26秒'))
    expect(screen.getByText(progress.text)).toBeVisible()
    expect(details).toHaveAttribute('open')
    act(() => vi.advanceTimersByTime(10000))
    rerender(<RuntimeTurnList items={[...doneItems]} executionStatus="completed" />)
    expect(screen.getByText('用时 26秒')).toBeVisible()
    expect(details).toHaveAttribute('open')
  })

  it('freezes while waiting and keeps approval and errors visible even with process collapsed', () => {
    vi.useFakeTimers()
    vi.setSystemTime(10000)
    const waiting: RuntimeTurnItem = { ...turn, elapsedMs: 10000, activeSince: null, waitingFor: 'approval' }
    const approval: RuntimeItem = { ...turn, id: 'approval', type: 'approval', kind: 'command', summary: '需要运行测试', decision: null }
    const { rerender } = render(<RuntimeTurnList items={[waiting, progress, approval]} executionStatus="waiting" />)
    fireEvent.click(screen.getByText('已处理 10秒'))
    expect(screen.getByText('需要运行测试')).toBeVisible()
    expect(screen.getByText('· 等待审批')).toBeVisible()
    act(() => vi.advanceTimersByTime(60000))
    expect(screen.getByText('已处理 10秒')).toBeVisible()
    const error: RuntimeItem = { ...turn, id: 'error', type: 'error', status: 'failed', error: '命令执行失败' }
    rerender(<RuntimeTurnList items={[{ ...waiting, status: 'failed', waitingFor: null }, progress, error]} executionStatus="failed" />)
    expect(screen.getByText('命令执行失败')).toBeVisible()
    expect(screen.getByText('· 处理失败')).toBeVisible()
    expect(screen.getByText(progress.text)).not.toBeVisible()
  })

  it('isolates Turns sharing Item IDs and degrades historical timing without hiding the last unphased reply', () => {
    const historical: RuntimeTurnItem = { ...turn, status: 'completed', startedAt: null, activeSince: null, elapsedMs: null }
    const next: RuntimeTurnItem = { ...turn, runtimeLocator: { ...turn.runtimeLocator, turnId: 'turn-2' } }
    render(<RuntimeTurnList items={[historical, progress, next, { ...thinking, runtimeLocator: next.runtimeLocator }]} executionStatus="running" />)
    const groups = screen.getAllByRole('region', { name: '本轮处理过程' })
    expect(groups).toHaveLength(2)
    expect(within(groups[0]).getByText('用时未知')).toBeVisible()
    expect(within(groups[0]).getByText(progress.text)).toBeVisible()
    expect(within(groups[1]).getByText('正在思考')).toBeVisible()
  })
})
