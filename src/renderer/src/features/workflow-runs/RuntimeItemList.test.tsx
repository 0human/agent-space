import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import type { RuntimeReasoningItem } from '../../../../shared/workflow-run'
import { RuntimeItemList } from './RuntimeItemList'

const item: RuntimeReasoningItem = {
  id: 'thinking', runId: 'run-1', executionId: 'execution-1',
  provider: 'codex', source: 'codex app-server',
  runtimeLocator: { runtimeProvider: 'codex', threadId: 'thread-1', turnId: 'turn-1', runtimeVersion: '0.144.3' },
  permissionPolicy: { grantedPermissions: [] }, type: 'reasoning',
  status: 'in_progress', summary: [], content: [],
}

describe('Reasoning in the activity stream', () => {
  it('shows thinking before text arrives, streams the summary and preserves expanded details through completion', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<RuntimeItemList items={[item]} />)
    const card = screen.getByRole('article', { name: '思考过程' })
    expect(within(card).getByRole('status')).toHaveTextContent('正在思考')
    const streaming = { ...item, summary: ['正在检查事件链路'], content: ['详细文本第一段'] }
    rerender(<RuntimeItemList items={[streaming]} />)
    expect(screen.getByText('正在检查事件链路')).toBeVisible()
    const details = screen.getByText('查看原始推理').closest('details')!
    expect(details).not.toHaveAttribute('open')
    expect(screen.getByText('详细文本第一段')).not.toBeVisible()
    await user.click(screen.getByText('查看原始推理'))
    expect(screen.getByText('详细文本第一段')).toBeVisible()
    rerender(<RuntimeItemList items={[{ ...streaming, content: ['详细文本第一段，继续更新'], summary: ['已检查事件链路'], status: 'completed' }]} />)
    expect(screen.getByRole('article', { name: '思考过程' })).toBe(card)
    expect(details).toHaveAttribute('open')
    expect(screen.getByText('详细文本第一段，继续更新')).toBeVisible()
    expect(within(card).getByRole('status')).toHaveTextContent('思考完成')
    expect(screen.queryByText('正在思考')).not.toBeInTheDocument()
  })

  it('explains missing raw text without presenting the summary as raw reasoning', async () => {
    const user = userEvent.setup()
    render(<RuntimeItemList items={[{ ...item, status: 'completed', summary: ['已检查文件'] }]} />)
    await user.click(screen.getByText('查看原始推理'))
    expect(screen.getByText('Runtime 未提供原始推理文本。')).toBeVisible()
    expect(screen.getAllByText('已检查文件')).toHaveLength(1)
  })

  it.each([['declined', '思考已停止'], ['failed', '思考失败']] as const)('does not keep the thinking indicator active after %s', (status, label) => {
    render(<RuntimeItemList items={[{ ...item, status }]} />)
    expect(screen.getByRole('status')).toHaveTextContent(label)
    expect(screen.queryByText('正在思考')).not.toBeInTheDocument()
  })
})
