import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { BUILT_IN_DEVELOPMENT_WORKFLOW } from '../../../../shared/workflow'
import App from '../../App'
import { createAppShellApi } from '../../test/app-shell-fake'

describe('Project through the App seam', () => {
  beforeEach(() => {
    window.appShell = createAppShellApi()
  })

  it('starts at the Chinese Project empty state with direct work entries', () => {
    render(<App />)

    expect(
      screen.getByRole('heading', { name: '还没有 Project' }),
    ).toBeVisible()
    expect(
      screen.getByText('创建一个新的 Project，或恢复之前未完成的工作。'),
    ).toBeVisible()
    expect(screen.getByRole('button', { name: '创建 Project' })).toBeEnabled()
    expect(screen.getByRole('button', { name: '恢复工作' })).toBeEnabled()
  })

  it('closes the mobile Sidebar after navigating in a narrow window', async () => {
    const user = userEvent.setup()
    const originalWidth = window.innerWidth
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: 375,
    })

    try {
      render(<App />)
      await user.click(
        await screen.findByRole('button', { name: '切换导航栏' }),
      )
      expect(
        await screen.findByRole('navigation', { name: '主导航' }),
      ).toBeVisible()

      await user.click(screen.getByRole('button', { name: '设置' }))

      expect(screen.getByRole('heading', { name: '设置' })).toBeVisible()
      expect(
        screen.queryByRole('dialog', { name: '导航栏' }),
      ).not.toBeInTheDocument()
    } finally {
      Object.defineProperty(window, 'innerWidth', {
        configurable: true,
        value: originalWidth,
      })
    }
  })

  it('opens the create and resume work entries without requesting privileged access', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: '创建 Project' }))
    expect(screen.getByRole('heading', { name: '创建 Project' })).toBeVisible()

    await user.click(screen.getByRole('button', { name: '返回 Project 概览' }))
    await user.click(screen.getByRole('button', { name: '恢复工作' }))
    expect(screen.getByRole('heading', { name: '恢复工作' })).toBeVisible()
  })

  it('moves between Project Overview and settings through the primary navigation', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: '设置' }))

    expect(screen.getByRole('heading', { name: '设置' })).toBeVisible()
    expect(screen.getByRole('heading', { name: '运行环境' })).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'Project 概览' }))

    expect(
      screen.getByRole('heading', { name: '还没有 Project' }),
    ).toBeVisible()
  })

  it('shows imported Project version control state and opens its Workspace in an IDE', async () => {
    const user = userEvent.setup()
    const project = {
      id: 'project-1',
      name: 'demo',
      workspacePath: '/work/demo',
      workspaceAvailable: true,
      remote: 'git@github.com:example/demo.git',
      currentBranch: 'feature/import',
      head: '0123456789abcdef0123456789abcdef01234567',
      defaultBranch: 'main',
      isGreenfield: false,
      dirty: true,
      dirtySummary: {
        staged: 1,
        unstaged: 1,
        untracked: 1,
        files: ['a.ts', 'b.ts', 'notes.md'],
      },
      updatedAt: '2026-08-14T00:00:00.000Z',
    }
    window.appShell.importProject = vi.fn().mockResolvedValue({
      project,
      warning:
        '该 Workspace 有未提交修改。继续导入不会 stash、reset 或丢弃这些修改。',
    })

    render(<App />)
    await user.click(screen.getByRole('button', { name: '创建 Project' }))
    await user.click(
      screen.getByRole('button', { name: '选择 Workspace 目录' }),
    )

    expect(screen.getByRole('heading', { name: 'demo' })).toBeVisible()
    expect(screen.getByText('feature/import')).toBeVisible()
    expect(screen.getByRole('status')).toHaveTextContent('Dirty Workspace')
    expect(screen.getByText('staged 1')).toBeVisible()
    expect(screen.getByText('unstaged 1')).toBeVisible()
    expect(screen.getByText('untracked 1')).toBeVisible()
    expect(screen.getByRole('status')).toHaveTextContent(
      '继续导入不会 stash、reset 或丢弃这些修改。',
    )
    expect(screen.getByText('a.ts, b.ts, notes.md')).toBeVisible()

    await user.click(screen.getByRole('button', { name: '在外部 IDE 中打开' }))
    expect(window.appShell.openProjectInIde).toHaveBeenCalledWith('project-1')
  })

  it('clones a GitHub Project only after showing its transfer boundary', async () => {
    const user = userEvent.setup()
    const project = {
      id: 'github-project-1',
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
      updatedAt: '2026-08-14T00:00:00.000Z',
    }
    window.appShell.cloneGitHubProject = vi.fn().mockResolvedValue({
      project,
      warning: null,
      transferNotice: {
        destination: 'https://github.com/example/demo.git',
        data: '数据：仓库元数据和 Git 对象写入你选择的本地 Workspace。',
        permissions:
          '权限：使用系统 Git credential、gh 登录或操作系统凭据存储；Agent Space 不保存 token。',
        recovery:
          '断网恢复：Workspace 保留在本地；恢复网络后可继续 fetch，不会重复 clone。',
      },
    })

    render(<App />)
    await user.click(screen.getByRole('button', { name: '创建 Project' }))
    await user.type(
      screen.getByLabelText('GitHub 仓库地址'),
      'https://github.com/example/demo.git',
    )
    await user.click(screen.getByRole('button', { name: '选择目录并 clone' }))

    expect(window.appShell.cloneGitHubProject).toHaveBeenCalledWith(
      'https://github.com/example/demo.git',
    )
    expect(screen.getByRole('heading', { name: 'demo' })).toBeVisible()
    expect(screen.getByText('Data Transfer Notice')).toBeVisible()
    expect(
      screen.getByText(
        /External Destination: https:\/\/github.com\/example\/demo\.git/,
      ),
    ).toBeVisible()
  })

  it('restores a persisted Project in Project Overview after restart', async () => {
    const user = userEvent.setup()
    window.appShell.listProjects = vi.fn().mockResolvedValue([
      {
        id: 'project-1',
        name: 'demo',
        workspacePath: '/work/demo',
        workspaceAvailable: true,
        remote: 'git@github.com:example/demo.git',
        currentBranch: 'main',
        head: '0123456789abcdef0123456789abcdef01234567',
        defaultBranch: 'main',
        isGreenfield: false,
        dirty: false,
        dirtySummary: { staged: 0, unstaged: 0, untracked: 0, files: [] },
        updatedAt: '2026-08-14T00:00:00.000Z',
      },
    ])

    render(<App />)

    await user.click(await screen.findByRole('button', { name: /demo/ }))
    expect(screen.getByRole('heading', { name: 'demo' })).toBeVisible()
    expect(screen.getByText('git@github.com:example/demo.git')).toBeVisible()
    expect(screen.getByText('Clean Workspace')).toBeVisible()
  })

  it('shows an error when the Workspace cannot be opened externally', async () => {
    const user = userEvent.setup()
    window.appShell.listProjects = vi.fn().mockResolvedValue([
      {
        id: 'project-1',
        name: 'demo',
        workspacePath: '/work/demo',
        workspaceAvailable: true,
        remote: null,
        currentBranch: null,
        head: null,
        defaultBranch: null,
        isGreenfield: true,
        dirty: false,
        dirtySummary: { staged: 0, unstaged: 0, untracked: 0, files: [] },
        updatedAt: '2026-08-14T00:00:00.000Z',
      },
    ])
    window.appShell.openProjectInIde = vi
      .fn()
      .mockRejectedValue(new Error('没有可用的外部应用'))

    render(<App />)

    await user.click(await screen.findByRole('button', { name: /demo/ }))
    await user.click(screen.getByRole('button', { name: '在外部 IDE 中打开' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      '打开外部 IDE 失败。',
    )
  })

  it('shows an error when persisted Projects cannot be loaded', async () => {
    window.appShell.listProjects = vi
      .fn()
      .mockRejectedValue(new Error('Project 注册表格式无效'))

    render(<App />)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '读取 Project 失败。',
    )
  })

  it('shows when a persisted Workspace has been deleted', async () => {
    const user = userEvent.setup()
    window.appShell.listProjects = vi.fn().mockResolvedValue([
      {
        id: 'project-1',
        name: 'demo',
        workspacePath: '/work/demo',
        workspaceAvailable: false,
        remote: null,
        currentBranch: 'main',
        head: 'abc123',
        defaultBranch: 'main',
        isGreenfield: false,
        dirty: false,
        dirtySummary: { staged: 0, unstaged: 0, untracked: 0, files: [] },
        updatedAt: '2026-08-14T00:00:00.000Z',
      },
    ])

    render(<App />)

    expect(await screen.findByText('Workspace 已删除或不可访问')).toBeVisible()
    await user.click(screen.getByRole('button', { name: /demo/ }))
    expect(screen.getByRole('alert')).toHaveTextContent(
      '找不到这个 Workspace，路径可能已被移动或删除。',
    )
    expect(
      screen.getByRole('button', { name: '在外部 IDE 中打开' }),
    ).toBeDisabled()
  })

  it('shows a localized error when a Project cannot be imported', async () => {
    const user = userEvent.setup()
    window.appShell.importProject = vi
      .fn()
      .mockRejectedValue(new Error('EACCES'))

    render(<App />)

    await user.click(screen.getByRole('button', { name: '创建 Project' }))
    await user.click(
      screen.getByRole('button', { name: '选择 Workspace 目录' }),
    )
    expect(await screen.findByRole('alert')).toHaveTextContent(
      '导入 Project 失败。',
    )
  })

  it('shows parallel Run phase, blocker, recent Artifact, and Run ID in Project Overview', async () => {
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
      updatedAt: '2026-08-18T00:00:00.000Z',
    }
    const run = {
      id: 'run-parallel-1',
      projectId: project.id,
      workspacePath: '/work/demo-agent-space-run-parallel-1',
      remote: null,
      idea: 'Parallel implementation',
      workflowId: BUILT_IN_DEVELOPMENT_WORKFLOW.id,
      workflowVersion: BUILT_IN_DEVELOPMENT_WORKFLOW.version,
      baseCommit: 'abc123',
      branch: 'main/agent-space/run-parallel-1',
      definition: BUILT_IN_DEVELOPMENT_WORKFLOW,
      status: 'blocked' as const,
      error: 'Merge conflict detected.',
      snapshot: {
        phaseIndex: 3,
        stepIndex: 0,
        currentStepExecutionId: 'execution-1',
        pendingQuestion: null,
        pendingApproval: null,
        pendingQuestionDetails: null,
        pendingApprovalDetails: null,
        blockedBy: {
          phaseIndex: 3,
          stepIndex: 0,
          executionId: 'execution-1',
          reason: 'Merge conflict detected.',
        },
        nextAction: 'Workflow Run 已 blocked，需要处理阻塞原因。',
      },
      stepExecutions: [],
      events: [],
      logs: [],
      phaseContexts: [],
      decisionRecords: [],
      artifacts: [
        {
          id: 'artifact-1',
          runId: 'run-parallel-1',
          stepExecutionId: 'execution-1',
          type: 'review-report',
          name: 'review.md',
          location: '/work/demo-agent-space-run-parallel-1/review.md',
          versionHash: null,
          status: 'available',
          createdAt: '2026-08-18T00:00:00.000Z',
        },
      ],
      createdAt: '2026-08-18T00:00:00.000Z',
      updatedAt: '2026-08-18T00:00:00.000Z',
    }
    window.appShell.listProjects = vi.fn().mockResolvedValue([project])
    window.appShell.listWorkflowRuns = vi.fn().mockResolvedValue([run])

    render(<App />)
    await user.click(await screen.findByRole('button', { name: /demo/ }))

    expect(screen.getByText('Run ID: run-parallel-1')).toBeVisible()
    expect(screen.getByText('当前 Phase：实现')).toBeVisible()
    expect(screen.getByText('阻塞：Merge conflict detected.')).toBeVisible()
    expect(screen.getByText('最近 Artifact：review.md')).toBeVisible()
  })
})
