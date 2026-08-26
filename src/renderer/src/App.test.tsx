import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import App from './App'
import { BUILT_IN_DEVELOPMENT_WORKFLOW, BUILT_IN_SKILL_MANIFESTS } from '../../shared/workflow'
import type { RuntimeItemProjectionUpdate } from '../../shared/workflow-run'

describe('Desktop Shell navigation', () => {
  beforeEach(() => {
    window.appShell = {
      getRuntimeInfo: vi.fn().mockResolvedValue({ platform: 'darwin', version: '0.1.0' }),
      listProjects: vi.fn().mockResolvedValue([]),
      importProject: vi.fn().mockResolvedValue(null),
      cloneGitHubProject: vi.fn().mockResolvedValue(null),
      openProjectInIde: vi.fn().mockResolvedValue({ ok: true, error: null }),
      getWorkflow: vi.fn().mockResolvedValue({
        definition: BUILT_IN_DEVELOPMENT_WORKFLOW,
        source: 'built-in',
        path: null,
        validation: { valid: true, errors: [], warnings: [] },
        canStart: true,
        skillManifests: BUILT_IN_SKILL_MANIFESTS
      }),
      copyWorkflow: vi.fn(),
      reloadWorkflow: vi.fn(),
      preflightWorkflowRun: vi.fn(),
      startWorkflowRun: vi.fn(),
      listWorkflowRuns: vi.fn().mockResolvedValue([]),
      getWorkflowRun: vi.fn(),
      listRuntimeItems: vi.fn().mockResolvedValue([]),
      subscribeRuntimeItemUpdates: vi.fn().mockReturnValue(() => undefined),
      pauseWorkflowRun: vi.fn(),
      resumeWorkflowRun: vi.fn(),
      retryWorkflowStep: vi.fn(),
      cancelWorkflowRun: vi.fn(),
      answerWorkflowQuestion: vi.fn(),
      approveWorkflowApproval: vi.fn(),
      rejectWorkflowApproval: vi.fn(),
      openWorkflowFile: vi.fn().mockResolvedValue({ ok: true, error: null }),
      previewSkillInstall: vi.fn(),
      installSkill: vi.fn(),
      listInstalledSkills: vi.fn().mockResolvedValue([])
    }
  })

  it('starts at the Chinese Project empty state with direct work entries', () => {
    render(<App />)

    expect(screen.getByRole('heading', { name: '还没有 Project' })).toBeVisible()
    expect(screen.getByText('创建一个新的 Project，或恢复之前未完成的工作。')).toBeVisible()
    expect(screen.getByRole('button', { name: '创建 Project' })).toBeEnabled()
    expect(screen.getByRole('button', { name: '恢复工作' })).toBeEnabled()
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

    expect(screen.getByRole('heading', { name: '还没有 Project' })).toBeVisible()
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
      dirtySummary: { staged: 1, unstaged: 1, untracked: 1, files: ['a.ts', 'b.ts', 'notes.md'] },
      updatedAt: '2026-08-14T00:00:00.000Z'
    }
    window.appShell.importProject = vi.fn().mockResolvedValue({
      project,
      warning: '该 Workspace 有未提交修改。继续导入不会 stash、reset 或丢弃这些修改。'
    })

    render(<App />)
    await user.click(screen.getByRole('button', { name: '创建 Project' }))
    await user.click(screen.getByRole('button', { name: '选择 Workspace 目录' }))

    expect(screen.getByRole('heading', { name: 'demo' })).toBeVisible()
    expect(screen.getByText('feature/import')).toBeVisible()
    expect(screen.getByRole('status')).toHaveTextContent('Dirty Workspace')
    expect(screen.getByText('staged 1')).toBeVisible()
    expect(screen.getByText('unstaged 1')).toBeVisible()
    expect(screen.getByText('untracked 1')).toBeVisible()
    expect(screen.getByRole('status')).toHaveTextContent('继续导入不会 stash、reset 或丢弃这些修改。')
    expect(screen.getByText('a.ts, b.ts, notes.md')).toBeVisible()

    await user.click(screen.getByRole('button', { name: '在外部 IDE 中打开' }))
    expect(window.appShell.openProjectInIde).toHaveBeenCalledWith('project-1')
  })

  it('clones a GitHub Project only after showing its transfer boundary', async () => {
    const user = userEvent.setup()
    const project = {
      id: 'github-project-1', name: 'demo', workspacePath: '/work/demo', workspaceAvailable: true,
      remote: 'https://github.com/example/demo.git', currentBranch: 'main', head: 'abc123', defaultBranch: 'main',
      isGreenfield: false, dirty: false, dirtySummary: { staged: 0, unstaged: 0, untracked: 0, files: [] }, updatedAt: '2026-08-14T00:00:00.000Z'
    }
    window.appShell.cloneGitHubProject = vi.fn().mockResolvedValue({
      project,
      warning: null,
      transferNotice: {
        destination: 'https://github.com/example/demo.git',
        data: '数据：仓库元数据和 Git 对象写入你选择的本地 Workspace。',
        permissions: '权限：使用系统 Git credential、gh 登录或操作系统凭据存储；Agent Space 不保存 token。',
        recovery: '断网恢复：Workspace 保留在本地；恢复网络后可继续 fetch，不会重复 clone。'
      }
    })

    render(<App />)
    await user.click(screen.getByRole('button', { name: '创建 Project' }))
    await user.type(screen.getByLabelText('GitHub 仓库地址'), 'https://github.com/example/demo.git')
    await user.click(screen.getByRole('button', { name: '选择目录并 clone' }))

    expect(window.appShell.cloneGitHubProject).toHaveBeenCalledWith('https://github.com/example/demo.git')
    expect(screen.getByRole('heading', { name: 'demo' })).toBeVisible()
    expect(screen.getByText('Data Transfer Notice')).toBeVisible()
    expect(screen.getByText(/External Destination: https:\/\/github.com\/example\/demo\.git/)).toBeVisible()
  })

  it('restores a persisted Project in Project Overview after restart', async () => {
    const user = userEvent.setup()
    window.appShell.listProjects = vi.fn().mockResolvedValue([{
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
      updatedAt: '2026-08-14T00:00:00.000Z'
    }])

    render(<App />)

    await user.click(await screen.findByRole('button', { name: /demo/ }))
    expect(screen.getByRole('heading', { name: 'demo' })).toBeVisible()
    expect(screen.getByText('git@github.com:example/demo.git')).toBeVisible()
    expect(screen.getByText('Clean Workspace')).toBeVisible()
  })

  it('shows an error when the Workspace cannot be opened externally', async () => {
    const user = userEvent.setup()
    window.appShell.listProjects = vi.fn().mockResolvedValue([{
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
      updatedAt: '2026-08-14T00:00:00.000Z'
    }])
    window.appShell.openProjectInIde = vi.fn().mockRejectedValue(new Error('没有可用的外部应用'))

    render(<App />)

    await user.click(await screen.findByRole('button', { name: /demo/ }))
    await user.click(screen.getByRole('button', { name: '在外部 IDE 中打开' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('打开外部 IDE 失败。')
  })

  it('shows an error when persisted Projects cannot be loaded', async () => {
    window.appShell.listProjects = vi.fn().mockRejectedValue(new Error('Project 注册表格式无效'))

    render(<App />)

    expect(await screen.findByRole('alert')).toHaveTextContent('读取 Project 失败。')
  })

  it('shows when a persisted Workspace has been deleted', async () => {
    const user = userEvent.setup()
    window.appShell.listProjects = vi.fn().mockResolvedValue([{
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
      updatedAt: '2026-08-14T00:00:00.000Z'
    }])

    render(<App />)

    expect(await screen.findByText('Workspace 已删除或不可访问')).toBeVisible()
    await user.click(screen.getByRole('button', { name: /demo/ }))
    expect(screen.getByRole('alert')).toHaveTextContent('找不到这个 Workspace，路径可能已被移动或删除。')
    expect(screen.getByRole('button', { name: '在外部 IDE 中打开' })).toBeDisabled()
  })

  it('shows a localized error when a Project cannot be imported', async () => {
    const user = userEvent.setup()
    window.appShell.importProject = vi.fn().mockRejectedValue(new Error('EACCES'))

    render(<App />)

    await user.click(screen.getByRole('button', { name: '创建 Project' }))
    await user.click(screen.getByRole('button', { name: '选择 Workspace 目录' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('导入 Project 失败。')
  })

  it('shows the read-only Development Workflow structure for a Project', async () => {
    const user = userEvent.setup()
    window.appShell.listProjects = vi.fn().mockResolvedValue([{
      id: 'project-1', name: 'demo', workspacePath: '/work/demo', workspaceAvailable: true,
      remote: null, currentBranch: 'main', head: 'abc123', defaultBranch: 'main',
      isGreenfield: false, dirty: false,
      dirtySummary: { staged: 0, unstaged: 0, untracked: 0, files: [] },
      updatedAt: '2026-08-14T00:00:00.000Z'
    }])

    render(<App />)
    await user.click(await screen.findByRole('button', { name: /demo/ }))
    await user.click(screen.getByRole('button', { name: '查看 Workflow' }))

    expect(await screen.findByRole('heading', { name: '软件交付 Workflow' })).toBeVisible()
    expect(screen.getByText('想法与探索')).toBeVisible()
    expect(screen.getByText('实现')).toBeVisible()
    expect(screen.getByText('PR 合并确认')).toBeVisible()
    expect(screen.getAllByText('grill-with-docs@1.0.0')).toHaveLength(2)
    expect(screen.getByRole('heading', { name: '机器可读 Skill Manifest' })).toBeVisible()
    expect(screen.getByText('skills/grill-with-docs/SKILL.md')).toBeVisible()
    expect(screen.getByText('内置 Workflow 只读')).toBeVisible()
    expect(screen.getByRole('button', { name: '复制为 Project Workflow' })).toBeEnabled()
    expect(screen.getByRole('button', { name: '直接运行内置 Workflow' })).toBeEnabled()
    expect(screen.getByRole('button', { name: '启动新 Run' })).toBeDisabled()
  })

  it('copies, reloads, validates, and blocks an invalid Project Workflow', async () => {
    const user = userEvent.setup()
    const project = {
      id: 'project-1', name: 'demo', workspacePath: '/work/demo', workspaceAvailable: true,
      remote: null, currentBranch: 'main', head: 'abc123', defaultBranch: 'main',
      isGreenfield: false, dirty: false,
      dirtySummary: { staged: 0, unstaged: 0, untracked: 0, files: [] },
      updatedAt: '2026-08-14T00:00:00.000Z'
    }
    window.appShell.listProjects = vi.fn().mockResolvedValue([project])
    window.appShell.copyWorkflow = vi.fn().mockResolvedValue({
      definition: {
        ...BUILT_IN_DEVELOPMENT_WORKFLOW,
        name: 'Project Workflow',
        derivedFrom: { id: 'development-workflow', version: '1.0.0' }
      },
      source: 'project', path: '/work/demo/.agent-space/workflow.json',
      validation: { valid: true, errors: [], warnings: [] }, canStart: true, skillManifests: []
    })
    window.appShell.reloadWorkflow = vi.fn().mockResolvedValue({
      definition: { ...BUILT_IN_DEVELOPMENT_WORKFLOW, name: 'Edited Workflow' },
      source: 'project', path: '/work/demo/.agent-space/workflow.json',
      validation: { valid: false, errors: ['缺少 Skill research。'], warnings: [] }, canStart: false, skillManifests: []
    })

    render(<App />)
    await user.click(await screen.findByRole('button', { name: /demo/ }))
    await user.click(screen.getByRole('button', { name: '查看 Workflow' }))
    await user.click(await screen.findByRole('button', { name: '复制为 Project Workflow' }))

    expect(await screen.findByText('/work/demo/.agent-space/workflow.json')).toBeVisible()
    expect(screen.getByText('来源：Development Workflow@1.0.0')).toBeVisible()

    await user.click(screen.getByRole('button', { name: '重新加载并校验' }))
    expect(await screen.findByRole('heading', { name: 'Edited Workflow' })).toBeVisible()
    expect(screen.getByRole('alert')).toHaveTextContent('缺少 Skill research。')
    expect(screen.getByRole('button', { name: '启动新 Run' })).toBeDisabled()
  })

  it('requires a successful Preflight before creating a Run Board', async () => {
    const user = userEvent.setup()
    const project = {
      id: 'project-1', name: 'demo', workspacePath: '/work/demo', workspaceAvailable: true,
      remote: null, currentBranch: 'main', head: 'abc123', defaultBranch: 'main',
      isGreenfield: false, dirty: false,
      dirtySummary: { staged: 0, unstaged: 0, untracked: 0, files: [] },
      updatedAt: '2026-08-14T00:00:00.000Z'
    }
    const definition = { ...BUILT_IN_DEVELOPMENT_WORKFLOW, derivedFrom: { id: 'development-workflow', version: '1.0.0' } }
    const run = {
      id: 'run-1', projectId: 'project-1', workspacePath: '/work/demo', idea: 'Build durable runs',
      workflowId: definition.id, workflowVersion: definition.version, definition, status: 'running' as const,
      error: null, snapshot: { phaseIndex: 0, stepIndex: 0, currentStepExecutionId: 'execution-1', pendingQuestion: null, pendingApproval: null, nextAction: '等待 Runtime 完成当前 Step。' },
      stepExecutions: [{ id: 'execution-1', runId: 'run-1', phaseId: 'discovery', stepId: 'discover', attempt: 1, status: 'running' as const, error: null, output: null, startedAt: null, finishedAt: null }],
      events: [], artifacts: [], createdAt: '2026-08-18T00:00:00.000Z', updatedAt: '2026-08-18T00:00:00.000Z'
    }
    window.appShell.listProjects = vi.fn().mockResolvedValue([project])
    window.appShell.getWorkflow = vi.fn().mockResolvedValue({ definition, source: 'project', path: '/work/demo/.agent-space/workflow.json', validation: { valid: true, errors: [], warnings: [] }, canStart: true, skillManifests: [] })
    window.appShell.preflightWorkflowRun = vi.fn().mockResolvedValue({ passed: true, checks: ['Idea 已填写。'], errors: [] })
    window.appShell.startWorkflowRun = vi.fn().mockResolvedValue({ ok: true, error: null, run })
    window.appShell.getWorkflowRun = vi.fn().mockResolvedValue(run)

    render(<App />)
    await user.click(await screen.findByRole('button', { name: /demo/ }))
    await user.click(screen.getByRole('button', { name: '查看 Workflow' }))
    await user.type(await screen.findByLabelText('Idea'), 'Build durable runs')
    expect(screen.getByRole('button', { name: '启动新 Run' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: '运行 Preflight' }))
    expect(await screen.findByText('Idea 已填写。')).toBeVisible()
    await user.click(screen.getByRole('button', { name: '启动新 Run' }))
    expect(await screen.findByRole('heading', { name: 'Build durable runs' })).toBeVisible()
    expect(screen.getAllByText('运行中').length).toBeGreaterThan(0)
    expect(window.appShell.startWorkflowRun).toHaveBeenCalledWith('project-1', 'Build durable runs')
  })

  it('runs a valid built-in Workflow after Preflight without copying it', async () => {
    const user = userEvent.setup()
    const project = {
      id: 'project-1', name: 'demo', workspacePath: '/work/demo', workspaceAvailable: true,
      remote: null, currentBranch: 'main', head: 'abc123', defaultBranch: 'main',
      isGreenfield: false, dirty: false,
      dirtySummary: { staged: 0, unstaged: 0, untracked: 0, files: [] }, updatedAt: '2026-08-14T00:00:00.000Z'
    }
    const run = {
      id: 'run-built-in', projectId: project.id, workspacePath: project.workspacePath, idea: 'Run built-in',
      workflowId: BUILT_IN_DEVELOPMENT_WORKFLOW.id, workflowVersion: BUILT_IN_DEVELOPMENT_WORKFLOW.version,
      workflowSource: { source: 'built-in' as const, id: BUILT_IN_DEVELOPMENT_WORKFLOW.id, version: BUILT_IN_DEVELOPMENT_WORKFLOW.version, path: null },
      definition: BUILT_IN_DEVELOPMENT_WORKFLOW, status: 'running' as const, error: null,
      snapshot: { phaseIndex: 0, stepIndex: 0, currentStepExecutionId: 'execution-built-in', pendingQuestion: null, pendingApproval: null, pendingQuestionDetails: null, pendingApprovalDetails: null, blockedBy: null, nextAction: '等待 Runtime 完成当前 Step。' },
      stepExecutions: [], events: [], artifacts: [], phaseContexts: [], decisionRecords: [], logs: [], createdAt: '2026-08-24T00:00:00.000Z', updatedAt: '2026-08-24T00:00:00.000Z'
    }
    window.appShell.listProjects = vi.fn().mockResolvedValue([project])
    window.appShell.getWorkflow = vi.fn().mockResolvedValue({ definition: BUILT_IN_DEVELOPMENT_WORKFLOW, source: 'built-in', path: null, validation: { valid: true, errors: [], warnings: [] }, canStart: true, skillManifests: BUILT_IN_SKILL_MANIFESTS })
    window.appShell.preflightWorkflowRun = vi.fn().mockResolvedValue({ passed: true, checks: ['Workflow Validation 通过。'], errors: [] })
    window.appShell.startWorkflowRun = vi.fn().mockResolvedValue({ ok: true, error: null, run })
    window.appShell.getWorkflowRun = vi.fn().mockResolvedValue(run)

    render(<App />)
    await user.click(await screen.findByRole('button', { name: /demo/ }))
    await user.click(screen.getByRole('button', { name: '查看 Workflow' }))
    await user.type(await screen.findByLabelText('Idea'), 'Run built-in')
    await user.click(screen.getByRole('button', { name: '运行 Preflight' }))
    await user.click(await screen.findByRole('button', { name: '启动新 Run' }))

    expect(window.appShell.copyWorkflow).not.toHaveBeenCalled()
    expect(window.appShell.startWorkflowRun).toHaveBeenCalledWith(project.id, 'Run built-in')
    expect(screen.getByText('来源快照：内置 Workflow@1.0.0')).toBeVisible()
  })

  it('shows parallel Run phase, blocker, recent Artifact, and Run ID in Project Overview', async () => {
    const user = userEvent.setup()
    const project = {
      id: 'project-1', name: 'demo', workspacePath: '/work/demo', workspaceAvailable: true,
      remote: null, currentBranch: 'main', head: 'abc123', defaultBranch: 'main', isGreenfield: false,
      dirty: false, dirtySummary: { staged: 0, unstaged: 0, untracked: 0, files: [] },
      updatedAt: '2026-08-18T00:00:00.000Z'
    }
    const run = {
      id: 'run-parallel-1', projectId: project.id, workspacePath: '/work/demo-agent-space-run-parallel-1',
      remote: null, idea: 'Parallel implementation', workflowId: BUILT_IN_DEVELOPMENT_WORKFLOW.id,
      workflowVersion: BUILT_IN_DEVELOPMENT_WORKFLOW.version, baseCommit: 'abc123', branch: 'main/agent-space/run-parallel-1',
      definition: BUILT_IN_DEVELOPMENT_WORKFLOW, status: 'blocked' as const, error: 'Merge conflict detected.',
      snapshot: {
        phaseIndex: 3, stepIndex: 0, currentStepExecutionId: 'execution-1', pendingQuestion: null,
        pendingApproval: null, pendingQuestionDetails: null, pendingApprovalDetails: null,
        blockedBy: { phaseIndex: 3, stepIndex: 0, executionId: 'execution-1', reason: 'Merge conflict detected.' },
        nextAction: 'Workflow Run 已 blocked，需要处理阻塞原因。'
      },
      stepExecutions: [], events: [], logs: [], phaseContexts: [], decisionRecords: [],
      artifacts: [{ id: 'artifact-1', runId: 'run-parallel-1', stepExecutionId: 'execution-1', type: 'review-report', name: 'review.md', location: '/work/demo-agent-space-run-parallel-1/review.md', versionHash: null, status: 'available', createdAt: '2026-08-18T00:00:00.000Z' }],
      createdAt: '2026-08-18T00:00:00.000Z', updatedAt: '2026-08-18T00:00:00.000Z'
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

  it('shows persisted context, decisions, logs, blockers, and allowed operations for a Step card', async () => {
    const user = userEvent.setup()
    const project = {
      id: 'project-1', name: 'demo', workspacePath: '/work/demo', workspaceAvailable: true,
      remote: null, currentBranch: 'main', head: 'abc123', defaultBranch: 'main',
      isGreenfield: false, dirty: false,
      dirtySummary: { staged: 0, unstaged: 0, untracked: 0, files: [] },
      updatedAt: '2026-08-14T00:00:00.000Z'
    }
    const run = {
      id: 'run-1', projectId: 'project-1', workspacePath: '/work/demo',
      idea: '这是一个用于验证窄窗口不会重叠的非常长的中文 Workflow Run 标题',
      workflowId: BUILT_IN_DEVELOPMENT_WORKFLOW.id, workflowVersion: BUILT_IN_DEVELOPMENT_WORKFLOW.version,
      definition: BUILT_IN_DEVELOPMENT_WORKFLOW, status: 'blocked' as const,
      error: 'Merge conflict detected.',
      snapshot: {
        phaseIndex: 0, stepIndex: 0, currentStepExecutionId: 'execution-1',
        pendingQuestion: null, pendingApproval: null, pendingQuestionDetails: null, pendingApprovalDetails: null,
        blockedBy: { phaseIndex: 0, stepIndex: 0, executionId: 'execution-1', reason: 'Merge conflict detected.' },
        nextAction: 'Workflow Run 已 blocked，需要处理阻塞原因。'
      },
      stepExecutions: [{
        id: 'execution-1', runId: 'run-1', phaseId: 'discovery', stepId: 'discover', attempt: 1,
        status: 'blocked' as const, input: { idea: '测试' }, skill: { name: 'grill-with-docs', version: '1.0.0' },
        error: 'Merge conflict detected.', output: null, startedAt: '2026-08-18T00:00:00.000Z', finishedAt: null
      }],
      events: [],
      logs: [{ id: 1, runId: 'run-1', executionId: 'execution-1', type: 'text_delta', message: '已读取当前领域文档。', data: { type: 'text_delta' }, createdAt: '2026-08-18T00:00:00.000Z' }],
      phaseContexts: [{ id: 'context-1', runId: 'run-1', phaseId: 'discovery', content: '用户确认目标是建立可恢复的 Run Board。', updatedAt: '2026-08-18T00:00:00.000Z' }],
      decisionRecords: [{
        id: 'decision-1', runId: 'run-1', phaseId: 'discovery', stepId: 'discover', executionId: 'execution-1', source: 'runtime-question' as const,
        question: '优先保证什么？', answer: '优先保证可恢复性。', continuation: { phaseIndex: 0, stepIndex: 0, executionId: 'execution-1' }, createdAt: '2026-08-18T00:00:00.000Z'
      }],
      artifacts: [], createdAt: '2026-08-18T00:00:00.000Z', updatedAt: '2026-08-18T00:00:00.000Z'
    }
    window.appShell.listProjects = vi.fn().mockResolvedValue([project])
    window.appShell.listWorkflowRuns = vi.fn().mockResolvedValue([run])
    window.appShell.getWorkflowRun = vi.fn().mockResolvedValue(run)

    render(<App />)
    await user.click(await screen.findByRole('button', { name: /demo/ }))
    await user.click(await screen.findByRole('button', { name: /这是一个用于验证窄窗口/ }))
    await user.click(screen.getByRole('button', { name: /澄清 Idea/ }))

    expect(screen.getByText('用户确认目标是建立可恢复的 Run Board。')).toBeVisible()
    expect(screen.getByText('优先保证什么？')).toBeVisible()
    expect(screen.getByText('优先保证可恢复性。')).toBeVisible()
    expect(screen.getByText('已读取当前领域文档。')).toBeVisible()
    expect(screen.getAllByText('Merge conflict detected.').length).toBeGreaterThan(0)
    expect(screen.getByText('resolving-merge-conflicts')).toBeVisible()
    expect(screen.getByText('Human Step：确认冲突解决结果后继续 Run')).toBeVisible()
    expect(screen.getByRole('heading', { name: '可用操作' })).toBeVisible()
    expect(screen.getAllByRole('button', { name: '继续' }).at(-1)).toBeEnabled()
    expect(screen.getAllByRole('button', { name: '取消 Run' }).at(-1)).toBeEnabled()
  })

  it('keeps live Item cards stable and renders authoritative Agent and command completion', async () => {
    const user = userEvent.setup()
    const project = {
      id: 'project-live', name: 'live-demo', workspacePath: '/work/live-demo', workspaceAvailable: true,
      remote: null, currentBranch: 'main', head: 'abc123', defaultBranch: 'main', isGreenfield: false, dirty: false,
      dirtySummary: { staged: 0, unstaged: 0, untracked: 0, files: [] }, updatedAt: '2026-08-26T00:00:00.000Z'
    }
    const step = BUILT_IN_DEVELOPMENT_WORKFLOW.phases[0].steps[0]
    const run = {
      id: 'run-live', projectId: project.id, workspacePath: project.workspacePath, remote: null, idea: 'Observe live Runtime Items',
      workflowId: BUILT_IN_DEVELOPMENT_WORKFLOW.id, workflowVersion: BUILT_IN_DEVELOPMENT_WORKFLOW.version,
      workflowSource: { source: 'built-in' as const, id: BUILT_IN_DEVELOPMENT_WORKFLOW.id, version: BUILT_IN_DEVELOPMENT_WORKFLOW.version, path: null },
      definition: BUILT_IN_DEVELOPMENT_WORKFLOW, status: 'running' as const, error: null,
      snapshot: { phaseIndex: 0, stepIndex: 0, currentStepExecutionId: 'execution-live', pendingQuestion: null, pendingApproval: null, pendingQuestionDetails: null, pendingApprovalDetails: null, blockedBy: null, nextAction: '等待 Runtime 完成当前 Step。' },
      stepExecutions: [{ id: 'execution-live', runId: 'run-live', phaseId: BUILT_IN_DEVELOPMENT_WORKFLOW.phases[0].id, stepId: step.id, attempt: 1, status: 'running' as const, input: null, skill: step.skill ?? null, error: null, output: null, startedAt: '2026-08-26T00:00:00.000Z', finishedAt: null }],
      events: [], logs: [], phaseContexts: [], decisionRecords: [], artifacts: [], createdAt: '2026-08-26T00:00:00.000Z', updatedAt: '2026-08-26T00:00:00.000Z'
    }
    let emitUpdate: ((update: RuntimeItemProjectionUpdate) => void) | undefined
    window.appShell.listProjects = vi.fn().mockResolvedValue([project])
    window.appShell.listWorkflowRuns = vi.fn().mockResolvedValue([run])
    window.appShell.getWorkflowRun = vi.fn().mockResolvedValue(run)
    window.appShell.listRuntimeItems = vi.fn().mockResolvedValue([{
      id: 'agent-1', runId: run.id, executionId: 'execution-live', type: 'agent_message', status: 'in_progress', text: 'Initial draft'
    }])
    window.appShell.subscribeRuntimeItemUpdates = vi.fn((listener) => {
      emitUpdate = listener
      return () => undefined
    })

    render(<App />)
    await user.click(await screen.findByRole('button', { name: /live-demo/ }))
    await user.click(await screen.findByRole('button', { name: /Observe live Runtime Items/ }))
    await user.click(screen.getByRole('button', { name: new RegExp(step.name) }))

    const agentCard = await screen.findByRole('article', { name: 'Agent 消息' })
    expect(agentCard).toHaveTextContent('Initial draft')

    act(() => emitUpdate?.({
      runId: run.id, executionId: 'execution-live',
      item: { id: 'agent-1', runId: run.id, executionId: 'execution-live', type: 'agent_message', status: 'in_progress', text: 'Draft answer' }
    }))
    expect(screen.getByRole('article', { name: 'Agent 消息' })).toBe(agentCard)
    act(() => emitUpdate?.({
      runId: run.id, executionId: 'execution-live',
      item: { id: 'agent-1', runId: run.id, executionId: 'execution-live', type: 'agent_message', status: 'completed', text: 'Final answer' }
    }))
    expect(screen.getByRole('article', { name: 'Agent 消息' })).toBe(agentCard)
    expect(agentCard).toHaveTextContent('Final answer')
    expect(agentCard).not.toHaveTextContent('Draft answer')

    act(() => emitUpdate?.({
      runId: run.id, executionId: 'execution-live',
      item: { id: 'command-1', runId: run.id, executionId: 'execution-live', type: 'command', status: 'in_progress', command: 'pnpm test', cwd: '/work/live-demo', output: 'partial output', exitCode: null, durationMs: null }
    }))
    const commandCard = screen.getByRole('article', { name: '命令执行：pnpm test' })
    expect(commandCard).toHaveTextContent('partial output')
    act(() => emitUpdate?.({
      runId: run.id, executionId: 'execution-live',
      item: { id: 'command-1', runId: run.id, executionId: 'execution-live', type: 'command', status: 'failed', command: 'pnpm test', cwd: '/work/live-demo', output: 'authoritative output', exitCode: 2, durationMs: 1250 }
    }))
    expect(screen.getByRole('article', { name: '命令执行：pnpm test' })).toBe(commandCard)
    expect(commandCard).toHaveTextContent('authoritative output')
    expect(commandCard).not.toHaveTextContent('partial output')
    expect(commandCard).toHaveTextContent('退出码 2')
    expect(commandCard).toHaveTextContent('耗时 1.25 秒')
  })

  it('renders an Approval Gate as an actionable Run Board card', async () => {
    const user = userEvent.setup()
    const project = {
      id: 'project-1', name: 'demo', workspacePath: '/work/demo', workspaceAvailable: true,
      remote: null, currentBranch: 'main', head: 'abc123', defaultBranch: 'main', isGreenfield: false, dirty: false,
      dirtySummary: { staged: 0, unstaged: 0, untracked: 0, files: [] }, updatedAt: '2026-08-14T00:00:00.000Z'
    }
    const definition = structuredClone(BUILT_IN_DEVELOPMENT_WORKFLOW)
    definition.phases[0].steps[0].approvalGate = '确认高风险写操作'
    const run = {
      id: 'run-approval', projectId: 'project-1', workspacePath: '/work/demo', idea: 'Approval Gate card',
      workflowId: definition.id, workflowVersion: definition.version, definition, status: 'waiting' as const, error: null,
      snapshot: {
        phaseIndex: 0, stepIndex: 0, currentStepExecutionId: 'execution-approval', pendingQuestion: null,
        pendingApproval: '确认高风险写操作', pendingQuestionDetails: null,
        pendingApprovalDetails: { approval: '确认高风险写操作', decision: null, continuation: { phaseIndex: 0, stepIndex: 0, executionId: 'execution-approval' } },
        blockedBy: null, nextAction: '等待用户批准当前 Approval Gate。'
      },
      stepExecutions: [{ id: 'execution-approval', runId: 'run-approval', phaseId: 'discovery', stepId: 'discover', attempt: 1, status: 'waiting' as const, input: null, skill: null, error: null, output: null, startedAt: null, finishedAt: null }],
      events: [], logs: [], phaseContexts: [], decisionRecords: [], artifacts: [], createdAt: '2026-08-18T00:00:00.000Z', updatedAt: '2026-08-18T00:00:00.000Z'
    }
    window.appShell.listProjects = vi.fn().mockResolvedValue([project])
    window.appShell.listWorkflowRuns = vi.fn().mockResolvedValue([run])
    window.appShell.getWorkflowRun = vi.fn().mockResolvedValue(run)

    render(<App />)
    await user.click(await screen.findByRole('button', { name: /demo/ }))
    await user.click(await screen.findByRole('button', { name: /Approval Gate card/ }))

    expect(screen.getByRole('article', { name: 'Approval Gate: 确认高风险写操作' })).toBeVisible()
    expect(screen.getByRole('button', { name: '批准并继续' })).toBeEnabled()
    expect(screen.getByRole('button', { name: '拒绝并停止' })).toBeEnabled()
  })

  it('shows Pull Request checks and keeps an unready Merge Gate disabled', async () => {
    const user = userEvent.setup()
    const project = {
      id: 'project-1', name: 'demo', workspacePath: '/work/demo', workspaceAvailable: true,
      remote: 'https://github.com/example/demo.git', currentBranch: 'main', head: 'abc123', defaultBranch: 'main', isGreenfield: false, dirty: false,
      dirtySummary: { staged: 0, unstaged: 0, untracked: 0, files: [] }, updatedAt: '2026-08-24T00:00:00.000Z'
    }
    const definition = structuredClone(BUILT_IN_DEVELOPMENT_WORKFLOW)
    definition.phases = [{ ...definition.phases[0], steps: [{ id: 'delivery', name: '创建 PR', kind: 'tool', adapter: 'github.pull-request', approvalGate: 'PR 合并确认' }] }]
    const run = {
      id: 'run-pr', projectId: project.id, workspacePath: '/work/demo-agent-space-run-pr', remote: project.remote, idea: 'Deliver issue #12', workflowId: definition.id,
      workflowVersion: definition.version, baseCommit: 'abc123', branch: 'main/agent-space/run-pr', definition, status: 'waiting' as const, error: null,
      pullRequest: {
        number: 42, url: 'https://github.com/example/demo/pull/42', title: 'Deliver issue #12', headBranch: 'main/agent-space/run-pr', baseBranch: 'main', headCommit: 'def456',
        checks: [{ name: 'CI', status: 'IN_PROGRESS', conclusion: null }], reviews: [], mergeable: 'UNKNOWN', merged: false, mergedAt: null, draft: false,
        gate: { checksSatisfied: false, reviewsSatisfied: false, mergeabilitySatisfied: false, canMerge: false, reason: 'checks 尚未全部通过。等待 1 个 approved review。' }, updatedAt: '2026-08-24T00:00:00.000Z'
      },
      snapshot: {
        phaseIndex: 0, stepIndex: 0, currentStepExecutionId: 'execution-pr', pendingQuestion: null, pendingApproval: 'PR 合并确认', pendingQuestionDetails: null,
        pendingApprovalDetails: { approval: 'PR 合并确认', decision: null, continuation: { phaseIndex: 0, stepIndex: 0, executionId: 'execution-pr' } }, blockedBy: null, nextAction: '等待用户处理当前 Step。'
      },
      stepExecutions: [{ id: 'execution-pr', runId: 'run-pr', phaseId: 'discovery', stepId: 'delivery', attempt: 1, status: 'waiting' as const, input: null, skill: null, error: null, output: null, startedAt: null, finishedAt: null }],
      events: [], logs: [], phaseContexts: [], decisionRecords: [], artifacts: [{ id: 'artifact-pr', runId: 'run-pr', stepExecutionId: 'execution-pr', type: 'pull-request', name: 'PR #42', location: 'https://github.com/example/demo/pull/42', versionHash: 'def456', status: 'pending', createdAt: '2026-08-24T00:00:00.000Z' }],
      createdAt: '2026-08-24T00:00:00.000Z', updatedAt: '2026-08-24T00:00:00.000Z'
    }
    window.appShell.listProjects = vi.fn().mockResolvedValue([project])
    window.appShell.listWorkflowRuns = vi.fn().mockResolvedValue([run])
    window.appShell.getWorkflowRun = vi.fn().mockResolvedValue(run)

    render(<App />)
    await user.click(await screen.findByRole('button', { name: /demo/ }))
    await user.click(await screen.findByRole('button', { name: /Deliver issue #12/ }))

    expect(screen.getAllByText('https://github.com/example/demo/pull/42').length).toBeGreaterThan(0)
    expect(screen.getByText('CI: IN_PROGRESS')).toBeVisible()
    expect(screen.getByText('0 / 0')).toBeVisible()
    expect(screen.getByRole('button', { name: '批准并继续' })).toBeDisabled()
    expect(screen.getAllByText(/checks 尚未全部通过/).length).toBeGreaterThan(0)
  })

  it('does not offer Resume while a question is still waiting for an answer', async () => {
    const user = userEvent.setup()
    const project = {
      id: 'project-1', name: 'demo', workspacePath: '/work/demo', workspaceAvailable: true,
      remote: null, currentBranch: 'main', head: 'abc123', defaultBranch: 'main', isGreenfield: false, dirty: false,
      dirtySummary: { staged: 0, unstaged: 0, untracked: 0, files: [] }, updatedAt: '2026-08-14T00:00:00.000Z'
    }
    const run = {
      id: 'run-waiting', projectId: 'project-1', workspacePath: '/work/demo', idea: 'Waiting for an answer',
      workflowId: BUILT_IN_DEVELOPMENT_WORKFLOW.id, workflowVersion: BUILT_IN_DEVELOPMENT_WORKFLOW.version,
      definition: BUILT_IN_DEVELOPMENT_WORKFLOW, status: 'waiting' as const, error: null,
      snapshot: {
        phaseIndex: 0, stepIndex: 0, currentStepExecutionId: 'execution-waiting', pendingQuestion: 'Which path?', pendingApproval: null,
        pendingQuestionDetails: { question: 'Which path?', answer: null, continuation: { phaseIndex: 0, stepIndex: 0, executionId: 'execution-waiting' } },
        pendingApprovalDetails: null, blockedBy: null, nextAction: '等待用户处理当前 Step。'
      },
      stepExecutions: [{ id: 'execution-waiting', runId: 'run-waiting', phaseId: 'discovery', stepId: 'discover', attempt: 1, status: 'waiting' as const, input: null, skill: null, error: null, output: null, startedAt: null, finishedAt: null }],
      events: [], logs: [], phaseContexts: [], decisionRecords: [], artifacts: [], createdAt: '2026-08-18T00:00:00.000Z', updatedAt: '2026-08-18T00:00:00.000Z'
    }
    window.appShell.listProjects = vi.fn().mockResolvedValue([project])
    window.appShell.listWorkflowRuns = vi.fn().mockResolvedValue([run])
    window.appShell.getWorkflowRun = vi.fn().mockResolvedValue(run)

    render(<App />)
    await user.click(await screen.findByRole('button', { name: /demo/ }))
    await user.click(await screen.findByRole('button', { name: /Waiting for an answer/ }))

    expect(screen.getAllByRole('button', { name: '继续' }).every((button) => (button as HTMLButtonElement).disabled)).toBe(true)
  })
})
