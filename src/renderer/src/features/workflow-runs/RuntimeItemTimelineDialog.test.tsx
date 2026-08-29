import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import type { RuntimeItem } from '../../../../shared/workflow-run'

import { RuntimeItemTimelineDialog } from './RuntimeItemTimelineDialog'

const metadata = {
  runId: 'run-timeline',
  executionId: 'execution-timeline',
  provider: 'codex',
  source: 'codex app-server',
  permissionPolicy: { grantedPermissions: ['workspace.read'] },
  runtimeLocator: {
    runtimeProvider: 'codex',
    threadId: 'thread-timeline',
    turnId: 'turn-timeline',
    runtimeVersion: '0.144.3',
  },
}

const initialItem: RuntimeItem = {
  id: 'agent-timeline',
  ...metadata,
  type: 'agent_message',
  status: 'in_progress',
  text: 'Initial output',
}

describe('Runtime Item timeline dialog', () => {
  it('opens with execution context and closes with Escape', async () => {
    const user = userEvent.setup()

    render(
      <RuntimeItemTimelineDialog
        runId="run-timeline"
        phaseName="Discovery"
        stepName="Clarify Idea"
        executionId="execution-timeline"
        items={[initialItem]}
      />,
    )

    await user.click(
      screen.getByRole('button', { name: '查看实时 Runtime Item' }),
    )

    expect(screen.getByRole('dialog')).toHaveTextContent('Run ID: run-timeline')
    expect(screen.getByRole('dialog')).toHaveTextContent('Phase：Discovery')
    expect(screen.getByRole('dialog')).toHaveTextContent('Step：Clarify Idea')
    expect(screen.getByRole('dialog')).toHaveTextContent(
      'Step Execution：execution-timeline',
    )
    expect(screen.getByText('Initial output')).toBeVisible()

    await user.keyboard('{Escape}')

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: '查看实时 Runtime Item' }),
    ).toHaveFocus()

    await user.click(
      screen.getByRole('button', { name: '查看实时 Runtime Item' }),
    )
    expect(screen.getByText('Initial output')).toBeVisible()
  })

  it('explains when Runtime Item history is unavailable', async () => {
    const user = userEvent.setup()

    render(
      <RuntimeItemTimelineDialog
        runId="run-timeline"
        phaseName="Discovery"
        stepName="Clarify Idea"
        executionId="execution-timeline"
        items={[]}
        historyUnavailable
      />,
    )

    await user.click(
      screen.getByRole('button', { name: '查看实时 Runtime Item' }),
    )

    expect(
      screen.getByText(
        '当前无法读取 Runtime Item 历史；已接收的实时更新仍会展示。',
      ),
    ).toBeVisible()
  })

  it('keeps long execution context within the narrow dialog width', async () => {
    const user = userEvent.setup()

    render(
      <RuntimeItemTimelineDialog
        runId="run-with-a-long-identifier-that-must-wrap"
        phaseName="Discovery Phase with a long name"
        stepName="Clarify Idea with a long name"
        executionId="execution-with-a-long-identifier-that-must-wrap"
        items={[initialItem]}
      />,
    )

    await user.click(
      screen.getByRole('button', { name: '查看实时 Runtime Item' }),
    )

    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveClass('max-w-[calc(100%-2rem)]')
    expect(dialog).toHaveTextContent(
      'Step Execution：execution-with-a-long-identifier-that-must-wrap',
    )
  })

  it('preserves a scrolled-up position and offers a return-to-bottom action', async () => {
    const user = userEvent.setup()
    const { rerender } = render(
      <RuntimeItemTimelineDialog
        runId="run-timeline"
        phaseName="Discovery"
        stepName="Clarify Idea"
        executionId="execution-timeline"
        items={[initialItem]}
      />,
    )

    await user.click(
      screen.getByRole('button', { name: '查看实时 Runtime Item' }),
    )
    const viewport = screen.getByRole('region', {
      name: 'Runtime Item 时间线',
    })
    let scrollTop = 600
    let scrollHeight = 1000
    Object.defineProperties(viewport, {
      clientHeight: { configurable: true, value: 400 },
      scrollHeight: {
        configurable: true,
        get: () => scrollHeight,
      },
      scrollTop: {
        configurable: true,
        get: () => scrollTop,
        set: (value: number) => {
          scrollTop = value
        },
      },
    })

    scrollTop = 200
    fireEvent.scroll(viewport)
    expect(
      screen.getByRole('button', { name: '回到底部' }),
    ).toBeVisible()

    const nextItem: RuntimeItem = {
      id: 'command-timeline',
      ...metadata,
      type: 'command',
      status: 'in_progress',
      command: 'pnpm test',
      output: 'partial output',
      exitCode: null,
      durationMs: null,
    }
    rerender(
      <RuntimeItemTimelineDialog
        runId="run-timeline"
        phaseName="Discovery"
        stepName="Clarify Idea"
        executionId="execution-timeline"
        items={[initialItem, nextItem]}
      />,
    )

    expect(scrollTop).toBe(200)

    await user.click(screen.getByRole('button', { name: '回到底部' }))

    expect(scrollTop).toBe(600)
    expect(
      screen.queryByRole('button', { name: '回到底部' }),
    ).not.toBeInTheDocument()

    scrollHeight = 1200
    const finalItem: RuntimeItem = {
      id: 'tool-timeline',
      ...metadata,
      type: 'tool',
      status: 'completed',
      name: 'test',
      durationMs: 42,
      output: 'done',
    }
    rerender(
      <RuntimeItemTimelineDialog
        runId="run-timeline"
        phaseName="Discovery"
        stepName="Clarify Idea"
        executionId="execution-timeline"
        items={[initialItem, nextItem, finalItem]}
      />,
    )

    expect(scrollTop).toBe(800)
  })
})
