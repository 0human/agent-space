import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { BUILT_IN_DEVELOPMENT_WORKFLOW } from '../../../../shared/workflow'
import type { RuntimeItem, WorkflowRun } from '../../../../shared/workflow-run'
import { RunActivityView, type RunActivityViewProps } from './RunActivityView'

function fixture(): RunActivityViewProps {
  const run: WorkflowRun = {
    id: 'run-activity',
    projectId: 'project-1',
    workspacePath: '/work/run-activity',
    remote: null,
    idea: '交付完整产品',
    workflowId: 'development-workflow',
    workflowVersion: '1.0.0',
    workflowSource: {
      source: 'built-in',
      id: 'development-workflow',
      version: '1.0.0',
      path: null,
    },
    baseCommit: 'abc123',
    branch: 'run-activity',
    definition: BUILT_IN_DEVELOPMENT_WORKFLOW,
    status: 'running',
    error: null,
    snapshot: {
      phaseIndex: 3,
      stepIndex: 0,
      currentStepExecutionId: 'execution-5',
      pendingQuestion: null,
      pendingApproval: null,
      pendingQuestionDetails: null,
      pendingApprovalDetails: null,
      blockedBy: null,
      ticketProgress: { current: 5, total: 12, currentTicketId: 'ticket-5' },
      nextAction: '测试中',
    },
    implementationTickets: Array.from({ length: 12 }, (_, i) => ({
      id: `ticket-${i + 1}`,
      runId: 'run-activity',
      title: `功能 ${i + 1}`,
      position: i + 1,
      sourceArtifactId: null,
      location: null,
      threadId: `thread-${i + 1}`,
      status: i < 4 ? 'completed' : i === 4 ? 'running' : 'pending',
      stages: {
        implementation: i <= 4 ? 'completed' : 'pending',
        testing: i < 4 ? 'completed' : i === 4 ? 'running' : 'pending',
        review: i < 4 ? 'completed' : 'pending',
        commit: i < 4 ? 'completed' : 'pending',
      },
      result: { attemptCount: 1, failedAttemptCount: 0, artifactIds: [] },
      startedAt: null,
      finishedAt: null,
    })),
    stepExecutions: Array.from({ length: 5 }, (_, i) => ({
      id: `execution-${i + 1}`,
      runId: 'run-activity',
      phaseId: 'implementation',
      stepId: 'implement',
      implementationTicketId: `ticket-${i + 1}`,
      attempt: 1,
      status: i < 4 ? 'completed' : 'running',
      input: null,
      output: null,
      skill: null,
      runtimeLocators: [],
      error: null,
      startedAt: null,
      finishedAt: null,
    })),
    events: [],
    logs: [],
    phaseContexts: [],
    decisionRecords: [],
    artifacts: [],
    createdAt: '2026-09-09T00:00:00Z',
    updatedAt: '2026-09-09T00:00:00Z',
  }
  const runtimeItems: RuntimeItem[] = run.stepExecutions.map(
    (execution, i) => ({
      id: 'message',
      runId: run.id,
      executionId: execution.id,
      provider: 'codex',
      source: 'codex app-server',
      permissionPolicy: { grantedPermissions: ['workspace.read'] },
      runtimeLocator: {
        runtimeProvider: 'codex',
        threadId: `thread-${i + 1}`,
        turnId: 'turn-1',
        runtimeVersion: 'test',
      },
      type: 'agent_message',
      status: i < 4 ? 'completed' : 'in_progress',
      text: `执行输出 ${i + 1}`,
    }),
  )
  return {
    run,
    runtimeItems,
    error: null,
    onBack: vi.fn(),
    onPause: vi.fn(),
    onResume: vi.fn(),
    onRetry: vi.fn(),
    onCancel: vi.fn(),
    onAnswer: vi.fn(),
    onApprove: vi.fn(),
    onReject: vi.fn(),
  }
}

describe('Run Activity View', () => {
  it('shows one Workflow phase per definition and Ticket 5/12 with its four stage states', () => {
    const props = fixture()
    render(<RunActivityView {...props} />)
    const workflow = screen.getByRole('navigation', { name: 'Workflow 总进度' })
    expect(within(workflow).getAllByRole('button')).toHaveLength(8)
    expect(
      within(workflow).getByRole('button', { name: '实现：运行中' }),
    ).toHaveAttribute('aria-current', 'step')
    const progress = screen.getByRole('region', { name: '当前进度' })
    expect(progress).toHaveTextContent('Ticket 5/12')
    expect(within(progress).getByLabelText('实现：已完成')).toBeVisible()
    expect(within(progress).getByLabelText('测试：运行中')).toBeVisible()
    expect(within(progress).getByLabelText('Review：待执行')).toBeVisible()
    expect(within(progress).getByLabelText('Commit：待执行')).toBeVisible()
    const activity = screen.getByRole('region', { name: 'Run Activity View' })
    expect(
      within(activity).getAllByRole('heading', { name: '实现' }),
    ).toHaveLength(1)
    expect(
      within(activity).getByRole('heading', { name: 'Ticket 5/12 · 功能 5' }),
    ).toBeVisible()
    expect(
      within(activity).getAllByRole('article', { name: 'Agent 消息' }),
    ).toHaveLength(5)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
  it('keeps Inspection scroll and keyboard focus stable while counting changed Items, then resumes live following', async () => {
    const user = userEvent.setup()
    const props = fixture()
    const { rerender } = render(<RunActivityView {...props} />)
    const viewport = screen.getByRole('region', { name: 'Run Activity View' })
    let height = 5000
    Object.defineProperties(viewport, {
      clientHeight: { configurable: true, value: 400 },
      scrollHeight: { configurable: true, get: () => height },
    })
    rerender(
      <RunActivityView {...props} runtimeItems={[...props.runtimeItems]} />,
    )
    expect(viewport.scrollTop).toBe(4600)

    const historicalTicket = screen.getByRole('button', {
      name: 'Ticket 2/12 · 功能 2',
    })
    historicalTicket.focus()
    await user.keyboard('{Enter}')
    expect(screen.getByRole('status', { name: '查看模式' })).toHaveTextContent(
      'Inspection Mode',
    )
    const heading = screen.getByRole('heading', {
      name: 'Ticket 2/12 · 功能 2',
    })
    expect(heading).toHaveFocus()
    viewport.scrollTop = 700
    fireEvent.scroll(viewport)
    const changed: RuntimeItem = {
      ...props.runtimeItems[4],
      type: 'agent_message',
      text: '新的测试输出',
    }
    height = 5300
    rerender(
      <RunActivityView
        {...props}
        runtimeItems={[...props.runtimeItems.slice(0, 4), changed]}
      />,
    )
    expect(viewport.scrollTop).toBe(700)
    expect(heading).toHaveFocus()
    expect(screen.getByRole('status', { name: '查看模式' })).toHaveTextContent(
      '新增活动 1',
    )
    expect(screen.getByRole('status', { name: '查看模式' })).toHaveTextContent(
      '当前执行：实现 · Ticket 5/12',
    )
    expect(props.onPause).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: '返回实时' }))
    expect(viewport.scrollTop).toBe(4900)
    expect(viewport).toHaveFocus()
    expect(screen.getByRole('status', { name: '查看模式' })).toHaveTextContent(
      'Live Mode',
    )
    height = 5500
    rerender(
      <RunActivityView
        {...props}
        runtimeItems={[
          ...props.runtimeItems.slice(0, 4),
          { ...changed, text: '测试完成' },
        ]}
      />,
    )
    expect(viewport.scrollTop).toBe(5100)
  })

  it('expands file paths with change counts and opens the Run workspace in an IDE', async () => {
    const user = userEvent.setup()
    const props = fixture()
    const openInIde = vi.fn()
    const item: RuntimeItem = {
      ...props.runtimeItems[4],
      type: 'file_change',
      status: 'completed',
      changes: [
        { path: 'src/feature.ts', kind: 'update', additions: 8, deletions: 2 },
      ],
      additions: 8,
      deletions: 2,
    }
    render(
      <RunActivityView
        {...props}
        runtimeItems={[item]}
        onOpenInIde={openInIde}
      />,
    )
    const files = screen.getByRole('article', { name: '文件修改' })
    const summary = within(files).getByText('展开文件列表')
    expect(summary.closest('details')).not.toHaveAttribute('open')
    expect(files).toHaveTextContent('1 个文件，新增 8 行，删除 2 行')
    await user.click(summary)
    expect(within(files).getByText('Edited src/feature.ts')).toBeVisible()
    expect(files).toHaveTextContent('+8 -2')
    await user.click(
      within(files).getByRole('button', { name: '在 IDE 中打开' }),
    )
    expect(openInIde).toHaveBeenCalledOnce()
  })

  it('stops following when scrolled away in a long stream and keeps collapsed command output stable', async () => {
    const props = fixture()
    const messages: RuntimeItem[] = Array.from({ length: 500 }, (_, index) => ({
      ...props.runtimeItems[4],
      id: `long-${index}`,
    }))
    const { rerender } = render(
      <RunActivityView {...props} runtimeItems={messages} />,
    )
    const viewport = screen.getByRole('region', { name: 'Run Activity View' })
    Object.defineProperties(viewport, {
      clientHeight: { value: 400 },
      scrollHeight: { value: 100000 },
    })
    viewport.scrollTop = 200
    fireEvent.scroll(viewport)
    const first = within(viewport).getAllByRole('article', {
      name: 'Agent 消息',
    })[0]
    const command: RuntimeItem = {
      ...props.runtimeItems[4],
      id: 'command',
      type: 'command',
      status: 'completed',
      command: 'pnpm test',
      output: 'collecting tests\nTests: 12 passed',
      exitCode: 0,
      durationMs: 420,
    }
    rerender(
      <RunActivityView {...props} runtimeItems={[...messages, command]} />,
    )
    expect(viewport.scrollTop).toBe(200)
    expect(
      within(viewport).getAllByRole('article', { name: 'Agent 消息' })[0],
    ).toBe(first)
    expect(screen.getByRole('status', { name: '查看模式' })).toHaveTextContent(
      '新增活动 1',
    )
    const commandCard = within(viewport).getByRole('article', {
      name: '命令执行：pnpm test',
    })
    expect(
      within(commandCard).getByText('Tests: 12 passed', { selector: 'p' }),
    ).toBeVisible()
    expect(
      within(commandCard).getByText('完整输出').closest('details'),
    ).not.toHaveAttribute('open')
  })

  it('inspects a historical Phase while the current Run advances to another Phase', async () => {
    const user = userEvent.setup()
    const props = fixture()
    const { rerender } = render(<RunActivityView {...props} />)
    await user.click(screen.getByRole('button', { name: '实现：运行中' }))
    const viewport = screen.getByRole('region', { name: 'Run Activity View' })
    viewport.scrollTop = 50
    const advanced: WorkflowRun = {
      ...props.run,
      snapshot: {
        ...props.run.snapshot,
        phaseIndex: 4,
        currentStepExecutionId: 'verify-1',
      },
      stepExecutions: [
        ...props.run.stepExecutions,
        {
          ...props.run.stepExecutions[4],
          id: 'verify-1',
          phaseId: 'verification',
          stepId: 'verify',
          implementationTicketId: null,
        },
      ],
    }
    rerender(<RunActivityView {...props} run={advanced} />)
    expect(viewport.scrollTop).toBe(50)
    expect(screen.getByRole('status', { name: '查看模式' })).toHaveTextContent(
      '当前执行：产品验证 · 产品级验证',
    )
    expect(
      screen.queryByRole('list', { name: 'Ticket 子流程' }),
    ).not.toBeInTheDocument()
    expect(props.onPause).not.toHaveBeenCalled()
    expect(
      screen.getByRole('button', { name: '产品验证：运行中' }),
    ).toHaveAttribute('aria-current', 'step')
  })

  it('explains empty or unavailable history without hiding live Items and shows action errors', () => {
    const props = fixture()
    const empty = {
      ...props.run,
      stepExecutions: [],
      implementationTickets: [],
      snapshot: { ...props.run.snapshot, phaseIndex: 0, ticketProgress: null },
    }
    const { rerender } = render(
      <RunActivityView {...props} run={empty} runtimeItems={[]} />,
    )
    expect(screen.getByText('当前还没有实时 Runtime Item。')).toBeVisible()
    expect(screen.getByRole('region', { name: '当前进度' })).toHaveTextContent(
      '澄清 Idea',
    )
    expect(
      screen.getByRole('button', { name: '产品验证：待执行' }),
    ).toBeDisabled()
    rerender(
      <RunActivityView
        {...props}
        runtimeItemsUnavailable
        error="操作暂不可用"
      />,
    )
    expect(
      screen.getByText(
        '当前无法读取 Runtime Item 历史；已接收的实时更新仍会展示。',
      ),
    ).toBeVisible()
    expect(screen.getByText('执行输出 5')).toBeVisible()
    expect(screen.getByRole('alert')).toHaveTextContent('操作暂不可用')
  })

  it('shows skipped and failed Phase states and keeps multiple attempts under a single Ticket divider', () => {
    const props = fixture()
    const run: WorkflowRun = {
      ...props.run,
      status: 'failed',
      stepExecutions: [
        {
          ...props.run.stepExecutions[0],
          id: 'skipped',
          phaseId: 'planning',
          stepId: 'tickets',
          implementationTicketId: null,
          status: 'skipped',
        },
        ...props.run.stepExecutions,
        {
          ...props.run.stepExecutions[4],
          id: 'retry',
          attempt: 2,
          status: 'failed',
        },
      ],
    }
    render(<RunActivityView {...props} run={run} />)
    expect(screen.getByRole('button', { name: '规划：已跳过' })).toBeEnabled()
    expect(
      screen.getByRole('button', { name: '实现：Step 失败' }),
    ).toBeEnabled()
    expect(
      screen.getAllByRole('heading', { name: 'Ticket 5/12 · 功能 5' }),
    ).toHaveLength(1)
    expect(screen.getByText('attempt 2')).toBeVisible()
  })
  it.each(['completed', 'cancelled', 'running', 'waiting'] as const)(
    'does not offer retry for historical skipped steps when the Run is %s',
    (status) => {
      const props = fixture()
      render(
        <RunActivityView
          {...props}
          run={{
            ...props.run,
            status,
            stepExecutions: [
              { ...props.run.stepExecutions[0], status: 'skipped' },
            ],
          }}
        />,
      )
      expect(
        screen.getByRole('button', { name: '重试失败 Step' }),
      ).toBeDisabled()
      expect(screen.getByRole('button', { name: '继续' })).toBeDisabled()
    },
  )
})
