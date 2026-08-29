import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { BUILT_IN_DEVELOPMENT_WORKFLOW } from '../../../../shared/workflow'
import type { RuntimeItem } from '../../../../shared/workflow-run'
import App from '../../App'
import { createAppShellApi } from '../../test/app-shell-fake'

describe('Workflow Run through the App seam', () => {
  beforeEach(() => {
    window.appShell = createAppShellApi()
  })

  it('shows persisted context, decisions, logs, blockers, and allowed operations for a Step card', async () => {
    const user = userEvent.setup()
    const project = {
      id: 'project-1',
      name: 'demo',
      workspacePath: '/work/demo',
      workspaceAvailable: true,
      remote: null,
      currentBranch: 'main',
      head: 'abc123',
      defaultBranch: 'main',
      isGreenfield: false,
      dirty: false,
      dirtySummary: { staged: 0, unstaged: 0, untracked: 0, files: [] },
      updatedAt: '2026-08-14T00:00:00.000Z',
    }
    const run = {
      id: 'run-1',
      projectId: 'project-1',
      workspacePath: '/work/demo',
      idea: '这是一个用于验证窄窗口不会重叠的非常长的中文 Workflow Run 标题',
      workflowId: BUILT_IN_DEVELOPMENT_WORKFLOW.id,
      workflowVersion: BUILT_IN_DEVELOPMENT_WORKFLOW.version,
      definition: BUILT_IN_DEVELOPMENT_WORKFLOW,
      status: 'blocked' as const,
      error: 'Merge conflict detected.',
      snapshot: {
        phaseIndex: 0,
        stepIndex: 0,
        currentStepExecutionId: 'execution-1',
        pendingQuestion: null,
        pendingApproval: null,
        pendingQuestionDetails: null,
        pendingApprovalDetails: null,
        blockedBy: {
          phaseIndex: 0,
          stepIndex: 0,
          executionId: 'execution-1',
          reason: 'Merge conflict detected.',
        },
        nextAction: 'Workflow Run 已 blocked，需要处理阻塞原因。',
      },
      stepExecutions: [
        {
          id: 'execution-1',
          runId: 'run-1',
          phaseId: 'discovery',
          stepId: 'discover',
          attempt: 1,
          status: 'blocked' as const,
          input: { idea: '测试' },
          skill: { name: 'grill-with-docs', version: '1.0.0' },
          error: 'Merge conflict detected.',
          output: null,
          startedAt: '2026-08-18T00:00:00.000Z',
          finishedAt: null,
        },
      ],
      events: [],
      logs: [
        {
          id: 1,
          runId: 'run-1',
          executionId: 'execution-1',
          type: 'text_delta',
          message: '已读取当前领域文档。',
          data: { type: 'text_delta' },
          createdAt: '2026-08-18T00:00:00.000Z',
        },
      ],
      phaseContexts: [
        {
          id: 'context-1',
          runId: 'run-1',
          phaseId: 'discovery',
          content: '用户确认目标是建立可恢复的 Run Board。',
          updatedAt: '2026-08-18T00:00:00.000Z',
        },
      ],
      decisionRecords: [
        {
          id: 'decision-1',
          runId: 'run-1',
          phaseId: 'discovery',
          stepId: 'discover',
          executionId: 'execution-1',
          source: 'runtime-question' as const,
          question: '优先保证什么？',
          answer: '优先保证可恢复性。',
          continuation: {
            phaseIndex: 0,
            stepIndex: 0,
            executionId: 'execution-1',
          },
          createdAt: '2026-08-18T00:00:00.000Z',
        },
      ],
      artifacts: [],
      createdAt: '2026-08-18T00:00:00.000Z',
      updatedAt: '2026-08-18T00:00:00.000Z',
    }
    window.appShell.listProjects = vi.fn().mockResolvedValue([project])
    window.appShell.listWorkflowRuns = vi.fn().mockResolvedValue([run])
    window.appShell.getWorkflowRun = vi.fn().mockResolvedValue(run)
    window.appShell.subscribeRuntimeItemUpdates = vi.fn(() => {
      throw new Error('Runtime Item IPC unavailable')
    })

    render(<App />)
    await user.click(await screen.findByRole('button', { name: /demo/ }))
    await user.click(
      await screen.findByRole('button', { name: /这是一个用于验证窄窗口/ }),
    )
    await user.click(screen.getByRole('button', { name: /澄清 Idea/ }))

    expect(
      screen.getByText('用户确认目标是建立可恢复的 Run Board。'),
    ).toBeVisible()
    expect(screen.getByText('优先保证什么？')).toBeVisible()
    expect(screen.getByText('优先保证可恢复性。')).toBeVisible()
    expect(screen.getByText('已读取当前领域文档。')).toBeVisible()
    expect(
      screen.getAllByText('Merge conflict detected.').length,
    ).toBeGreaterThan(0)
    expect(screen.getByText('resolving-merge-conflicts')).toBeVisible()
    expect(
      screen.getByText('Human Step：确认冲突解决结果后继续 Run'),
    ).toBeVisible()
    expect(screen.getByRole('heading', { name: '可用操作' })).toBeVisible()
    expect(screen.getAllByRole('button', { name: '继续' }).at(-1)).toBeEnabled()
    expect(
      screen.getAllByRole('button', { name: '取消 Run' }).at(-1),
    ).toBeEnabled()
  })

  it('keeps live Item cards stable and renders authoritative Agent and command completion', async () => {
    const user = userEvent.setup()
    const project = {
      id: 'project-live',
      name: 'live-demo',
      workspacePath: '/work/live-demo',
      workspaceAvailable: true,
      remote: null,
      currentBranch: 'main',
      head: 'abc123',
      defaultBranch: 'main',
      isGreenfield: false,
      dirty: false,
      dirtySummary: { staged: 0, unstaged: 0, untracked: 0, files: [] },
      updatedAt: '2026-08-26T00:00:00.000Z',
    }
    const step = BUILT_IN_DEVELOPMENT_WORKFLOW.phases[0].steps[0]
    const run = {
      id: 'run-live',
      projectId: project.id,
      workspacePath: project.workspacePath,
      remote: null,
      idea: 'Observe live Runtime Items',
      workflowId: BUILT_IN_DEVELOPMENT_WORKFLOW.id,
      workflowVersion: BUILT_IN_DEVELOPMENT_WORKFLOW.version,
      workflowSource: {
        source: 'built-in' as const,
        id: BUILT_IN_DEVELOPMENT_WORKFLOW.id,
        version: BUILT_IN_DEVELOPMENT_WORKFLOW.version,
        path: null,
      },
      definition: BUILT_IN_DEVELOPMENT_WORKFLOW,
      status: 'running' as const,
      error: null,
      snapshot: {
        phaseIndex: 0,
        stepIndex: 0,
        currentStepExecutionId: 'execution-live',
        pendingQuestion: null,
        pendingApproval: null,
        pendingQuestionDetails: null,
        pendingApprovalDetails: null,
        blockedBy: null,
        nextAction: '等待 Runtime 完成当前 Step。',
      },
      stepExecutions: [
        {
          id: 'execution-live',
          runId: 'run-live',
          phaseId: BUILT_IN_DEVELOPMENT_WORKFLOW.phases[0].id,
          stepId: step.id,
          attempt: 1,
          status: 'running' as const,
          input: null,
          skill: step.skill ?? null,
          error: null,
          output: null,
          startedAt: '2026-08-26T00:00:00.000Z',
          finishedAt: null,
        },
      ],
      events: [],
      logs: [],
      phaseContexts: [],
      decisionRecords: [],
      artifacts: [],
      createdAt: '2026-08-26T00:00:00.000Z',
      updatedAt: '2026-08-26T00:00:00.000Z',
    }
    const itemMetadata = {
      runId: run.id,
      executionId: 'execution-live',
      provider: 'codex',
      source: 'codex app-server',
      permissionPolicy: {
        grantedPermissions: ['workspace.read', 'workspace.write'],
      },
      runtimeLocator: {
        runtimeProvider: 'codex',
        threadId: 'thread-live',
        turnId: 'turn-live',
        runtimeVersion: '0.144.3',
      },
    }
    let emitUpdate: ((item: RuntimeItem) => void) | undefined
    const unsubscribe = vi.fn()
    window.appShell.listProjects = vi.fn().mockResolvedValue([project])
    window.appShell.listWorkflowRuns = vi.fn().mockResolvedValue([run])
    window.appShell.getWorkflowRun = vi.fn().mockResolvedValue(run)
    window.appShell.listRuntimeItems = vi.fn().mockResolvedValue([
      {
        id: 'agent-1',
        ...itemMetadata,
        type: 'agent_message',
        status: 'in_progress',
        text: 'Initial draft',
      },
    ])
    window.appShell.subscribeRuntimeItemUpdates = vi.fn((listener) => {
      emitUpdate = listener
      return unsubscribe
    })

    render(<App />)
    await user.click(await screen.findByRole('button', { name: /live-demo/ }))
    await user.click(
      await screen.findByRole('button', { name: /Observe live Runtime Items/ }),
    )
    await user.click(
      screen.getByRole('button', { name: new RegExp(step.name) }),
    )
    await user.click(
      screen.getByRole('button', { name: '查看实时 Runtime Item' }),
    )

    const agentCard = await screen.findByRole('article', {
      name: 'Agent 消息',
    })
    expect(agentCard).toHaveTextContent('Initial draft')

    act(() =>
      emitUpdate?.({
        id: 'agent-1',
        ...itemMetadata,
        type: 'agent_message',
        status: 'in_progress',
        text: 'Draft answer',
      }),
    )
    expect(screen.getByRole('article', { name: 'Agent 消息' })).toBe(agentCard)
    act(() =>
      emitUpdate?.({
        id: 'agent-1',
        ...itemMetadata,
        type: 'agent_message',
        status: 'completed',
        text: 'Final answer',
      }),
    )
    expect(screen.getByRole('article', { name: 'Agent 消息' })).toBe(agentCard)
    expect(agentCard).toHaveTextContent('Final answer')
    expect(agentCard).not.toHaveTextContent('Draft answer')

    act(() =>
      emitUpdate?.({
        id: 'command-1',
        ...itemMetadata,
        type: 'command',
        status: 'in_progress',
        command: 'pnpm test',
        output: 'partial output',
        exitCode: null,
        durationMs: null,
      }),
    )
    const commandCard = screen.getByRole('article', {
      name: '命令执行：pnpm test',
    })
    expect(commandCard).toHaveTextContent('partial output')
    act(() =>
      emitUpdate?.({
        id: 'command-1',
        ...itemMetadata,
        type: 'command',
        status: 'failed',
        command: 'pnpm test',
        output: 'authoritative output',
        exitCode: 2,
        durationMs: 1250,
      }),
    )
    expect(screen.getByRole('article', { name: '命令执行：pnpm test' })).toBe(
      commandCard,
    )
    expect(commandCard).toHaveTextContent('authoritative output')
    expect(commandCard).not.toHaveTextContent('partial output')
    expect(commandCard).toHaveTextContent('退出码 2')
    expect(commandCard).toHaveTextContent('耗时 1.25 秒')

    act(() =>
      emitUpdate?.({
        id: 'other-execution-item',
        ...itemMetadata,
        executionId: 'execution-other',
        type: 'agent_message',
        status: 'completed',
        text: '其他 Step Execution 的输出',
      }),
    )
    expect(
      screen.queryByText('其他 Step Execution 的输出'),
    ).not.toBeInTheDocument()

    await user.click(
      screen.getByRole('button', { name: '关闭 Runtime Item 时间线' }),
    )
    await user.click(screen.getByRole('button', { name: '返回 Project 详情' }))
    expect(unsubscribe).toHaveBeenCalledOnce()
  })

  it('renders an Approval Gate as an actionable Run Board card', async () => {
    const user = userEvent.setup()
    const project = {
      id: 'project-1',
      name: 'demo',
      workspacePath: '/work/demo',
      workspaceAvailable: true,
      remote: null,
      currentBranch: 'main',
      head: 'abc123',
      defaultBranch: 'main',
      isGreenfield: false,
      dirty: false,
      dirtySummary: { staged: 0, unstaged: 0, untracked: 0, files: [] },
      updatedAt: '2026-08-14T00:00:00.000Z',
    }
    const definition = structuredClone(BUILT_IN_DEVELOPMENT_WORKFLOW)
    definition.phases[0].steps[0].approvalGate = '确认高风险写操作'
    const run = {
      id: 'run-approval',
      projectId: 'project-1',
      workspacePath: '/work/demo',
      idea: 'Approval Gate card',
      workflowId: definition.id,
      workflowVersion: definition.version,
      definition,
      status: 'waiting' as const,
      error: null,
      snapshot: {
        phaseIndex: 0,
        stepIndex: 0,
        currentStepExecutionId: 'execution-approval',
        pendingQuestion: null,
        pendingApproval: '确认高风险写操作',
        pendingQuestionDetails: null,
        pendingApprovalDetails: {
          approval: '确认高风险写操作',
          decision: null,
          continuation: {
            phaseIndex: 0,
            stepIndex: 0,
            executionId: 'execution-approval',
          },
        },
        blockedBy: null,
        nextAction: '等待用户批准当前 Approval Gate。',
      },
      stepExecutions: [
        {
          id: 'execution-approval',
          runId: 'run-approval',
          phaseId: 'discovery',
          stepId: 'discover',
          attempt: 1,
          status: 'waiting' as const,
          input: null,
          skill: null,
          error: null,
          output: null,
          startedAt: null,
          finishedAt: null,
        },
      ],
      events: [],
      logs: [],
      phaseContexts: [],
      decisionRecords: [],
      artifacts: [],
      createdAt: '2026-08-18T00:00:00.000Z',
      updatedAt: '2026-08-18T00:00:00.000Z',
    }
    window.appShell.listProjects = vi.fn().mockResolvedValue([project])
    window.appShell.listWorkflowRuns = vi.fn().mockResolvedValue([run])
    window.appShell.getWorkflowRun = vi.fn().mockResolvedValue(run)

    render(<App />)
    await user.click(await screen.findByRole('button', { name: /demo/ }))
    await user.click(
      await screen.findByRole('button', { name: /Approval Gate card/ }),
    )

    expect(
      screen.getByRole('article', { name: 'Approval Gate: 确认高风险写操作' }),
    ).toBeVisible()
    expect(screen.getByRole('button', { name: '批准并继续' })).toBeEnabled()
    expect(screen.getByRole('button', { name: '拒绝并停止' })).toBeEnabled()
  })

  it('shows Pull Request checks and keeps an unready Merge Gate disabled', async () => {
    const user = userEvent.setup()
    const project = {
      id: 'project-1',
      name: 'demo',
      workspacePath: '/work/demo',
      workspaceAvailable: true,
      remote: 'https://github.com/example/demo.git',
      currentBranch: 'main',
      head: 'abc123',
      defaultBranch: 'main',
      isGreenfield: false,
      dirty: false,
      dirtySummary: { staged: 0, unstaged: 0, untracked: 0, files: [] },
      updatedAt: '2026-08-24T00:00:00.000Z',
    }
    const definition = structuredClone(BUILT_IN_DEVELOPMENT_WORKFLOW)
    definition.phases = [
      {
        ...definition.phases[0],
        steps: [
          {
            id: 'delivery',
            name: '创建 PR',
            kind: 'tool',
            adapter: 'github.pull-request',
            approvalGate: 'PR 合并确认',
          },
        ],
      },
    ]
    const run = {
      id: 'run-pr',
      projectId: project.id,
      workspacePath: '/work/demo-agent-space-run-pr',
      remote: project.remote,
      idea: 'Deliver issue #12',
      workflowId: definition.id,
      workflowVersion: definition.version,
      baseCommit: 'abc123',
      branch: 'main/agent-space/run-pr',
      definition,
      status: 'waiting' as const,
      error: null,
      pullRequest: {
        number: 42,
        url: 'https://github.com/example/demo/pull/42',
        title: 'Deliver issue #12',
        headBranch: 'main/agent-space/run-pr',
        baseBranch: 'main',
        headCommit: 'def456',
        checks: [{ name: 'CI', status: 'IN_PROGRESS', conclusion: null }],
        reviews: [],
        mergeable: 'UNKNOWN',
        merged: false,
        mergedAt: null,
        draft: false,
        gate: {
          checksSatisfied: false,
          reviewsSatisfied: false,
          mergeabilitySatisfied: false,
          canMerge: false,
          reason: 'checks 尚未全部通过。等待 1 个 approved review。',
        },
        updatedAt: '2026-08-24T00:00:00.000Z',
      },
      snapshot: {
        phaseIndex: 0,
        stepIndex: 0,
        currentStepExecutionId: 'execution-pr',
        pendingQuestion: null,
        pendingApproval: 'PR 合并确认',
        pendingQuestionDetails: null,
        pendingApprovalDetails: {
          approval: 'PR 合并确认',
          decision: null,
          continuation: {
            phaseIndex: 0,
            stepIndex: 0,
            executionId: 'execution-pr',
          },
        },
        blockedBy: null,
        nextAction: '等待用户处理当前 Step。',
      },
      stepExecutions: [
        {
          id: 'execution-pr',
          runId: 'run-pr',
          phaseId: 'discovery',
          stepId: 'delivery',
          attempt: 1,
          status: 'waiting' as const,
          input: null,
          skill: null,
          error: null,
          output: null,
          startedAt: null,
          finishedAt: null,
        },
      ],
      events: [],
      logs: [],
      phaseContexts: [],
      decisionRecords: [],
      artifacts: [
        {
          id: 'artifact-pr',
          runId: 'run-pr',
          stepExecutionId: 'execution-pr',
          type: 'pull-request',
          name: 'PR #42',
          location: 'https://github.com/example/demo/pull/42',
          versionHash: 'def456',
          status: 'pending',
          createdAt: '2026-08-24T00:00:00.000Z',
        },
      ],
      createdAt: '2026-08-24T00:00:00.000Z',
      updatedAt: '2026-08-24T00:00:00.000Z',
    }
    window.appShell.listProjects = vi.fn().mockResolvedValue([project])
    window.appShell.listWorkflowRuns = vi.fn().mockResolvedValue([run])
    window.appShell.getWorkflowRun = vi.fn().mockResolvedValue(run)

    render(<App />)
    await user.click(await screen.findByRole('button', { name: /demo/ }))
    await user.click(
      await screen.findByRole('button', { name: /Deliver issue #12/ }),
    )

    expect(
      screen.getAllByText('https://github.com/example/demo/pull/42').length,
    ).toBeGreaterThan(0)
    expect(screen.getByText('CI: IN_PROGRESS')).toBeVisible()
    expect(screen.getByText('0 / 0')).toBeVisible()
    expect(screen.getByRole('button', { name: '批准并继续' })).toBeDisabled()
    expect(screen.getAllByText(/checks 尚未全部通过/).length).toBeGreaterThan(0)
  })

  it('does not offer Resume while a question is still waiting for an answer', async () => {
    const user = userEvent.setup()
    const project = {
      id: 'project-1',
      name: 'demo',
      workspacePath: '/work/demo',
      workspaceAvailable: true,
      remote: null,
      currentBranch: 'main',
      head: 'abc123',
      defaultBranch: 'main',
      isGreenfield: false,
      dirty: false,
      dirtySummary: { staged: 0, unstaged: 0, untracked: 0, files: [] },
      updatedAt: '2026-08-14T00:00:00.000Z',
    }
    const run = {
      id: 'run-waiting',
      projectId: 'project-1',
      workspacePath: '/work/demo',
      idea: 'Waiting for an answer',
      workflowId: BUILT_IN_DEVELOPMENT_WORKFLOW.id,
      workflowVersion: BUILT_IN_DEVELOPMENT_WORKFLOW.version,
      definition: BUILT_IN_DEVELOPMENT_WORKFLOW,
      status: 'waiting' as const,
      error: null,
      snapshot: {
        phaseIndex: 0,
        stepIndex: 0,
        currentStepExecutionId: 'execution-waiting',
        pendingQuestion: 'Which path?',
        pendingApproval: null,
        pendingQuestionDetails: {
          question: 'Which path?',
          answer: null,
          continuation: {
            phaseIndex: 0,
            stepIndex: 0,
            executionId: 'execution-waiting',
          },
        },
        pendingApprovalDetails: null,
        blockedBy: null,
        nextAction: '等待用户处理当前 Step。',
      },
      stepExecutions: [
        {
          id: 'execution-waiting',
          runId: 'run-waiting',
          phaseId: 'discovery',
          stepId: 'discover',
          attempt: 1,
          status: 'waiting' as const,
          input: null,
          skill: null,
          error: null,
          output: null,
          startedAt: null,
          finishedAt: null,
        },
      ],
      events: [],
      logs: [],
      phaseContexts: [],
      decisionRecords: [],
      artifacts: [],
      createdAt: '2026-08-18T00:00:00.000Z',
      updatedAt: '2026-08-18T00:00:00.000Z',
    }
    window.appShell.listProjects = vi.fn().mockResolvedValue([project])
    window.appShell.listWorkflowRuns = vi.fn().mockResolvedValue([run])
    window.appShell.getWorkflowRun = vi.fn().mockResolvedValue(run)

    render(<App />)
    await user.click(await screen.findByRole('button', { name: /demo/ }))
    await user.click(
      await screen.findByRole('button', { name: /Waiting for an answer/ }),
    )

    expect(
      screen
        .getAllByRole('button', { name: '继续' })
        .every((button) => (button as HTMLButtonElement).disabled),
    ).toBe(true)
  })
})
