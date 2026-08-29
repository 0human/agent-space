import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  BUILT_IN_DEVELOPMENT_WORKFLOW,
  BUILT_IN_SKILL_MANIFESTS,
} from '../../../../shared/workflow'
import App from '../../App'
import { createAppShellApi } from '../../test/app-shell-fake'

describe('Workflow through the App seam', () => {
  beforeEach(() => {
    window.appShell = createAppShellApi()
  })

  it('shows the read-only Development Workflow structure for a Project', async () => {
    const user = userEvent.setup()
    window.appShell.listProjects = vi.fn().mockResolvedValue([
      {
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
      },
    ])

    render(<App />)
    await user.click(await screen.findByRole('button', { name: /demo/ }))
    await user.click(screen.getByRole('button', { name: '查看 Workflow' }))

    expect(
      await screen.findByRole('heading', { name: '软件交付 Workflow' }),
    ).toBeVisible()
    expect(screen.getByText('想法与探索')).toBeVisible()
    expect(screen.getByText('实现')).toBeVisible()
    expect(screen.getByText('PR 合并确认')).toBeVisible()
    expect(screen.getAllByText('grill-with-docs@1.0.0')).toHaveLength(2)
    expect(
      screen.getByRole('heading', { name: '机器可读 Skill Manifest' }),
    ).toBeVisible()
    expect(screen.getByText('skills/grill-with-docs/SKILL.md')).toBeVisible()
    expect(screen.getByText('内置 Workflow 只读')).toBeVisible()
    expect(
      screen.getByRole('button', { name: '复制为 Project Workflow' }),
    ).toBeEnabled()
    expect(
      screen.getByRole('button', { name: '直接运行内置 Workflow' }),
    ).toBeEnabled()
    expect(screen.getByRole('button', { name: '启动新 Run' })).toBeDisabled()
  })

  it('copies, reloads, validates, and blocks an invalid Project Workflow', async () => {
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
    window.appShell.listProjects = vi.fn().mockResolvedValue([project])
    window.appShell.copyWorkflow = vi.fn().mockResolvedValue({
      definition: {
        ...BUILT_IN_DEVELOPMENT_WORKFLOW,
        name: 'Project Workflow',
        derivedFrom: { id: 'development-workflow', version: '1.0.0' },
      },
      source: 'project',
      path: '/work/demo/.agent-space/workflow.json',
      validation: { valid: true, errors: [], warnings: [] },
      canStart: true,
      skillManifests: [],
    })
    window.appShell.reloadWorkflow = vi.fn().mockResolvedValue({
      definition: { ...BUILT_IN_DEVELOPMENT_WORKFLOW, name: 'Edited Workflow' },
      source: 'project',
      path: '/work/demo/.agent-space/workflow.json',
      validation: {
        valid: false,
        errors: ['缺少 Skill research。'],
        warnings: [],
      },
      canStart: false,
      skillManifests: [],
    })

    render(<App />)
    await user.click(await screen.findByRole('button', { name: /demo/ }))
    await user.click(screen.getByRole('button', { name: '查看 Workflow' }))
    await user.click(
      await screen.findByRole('button', { name: '复制为 Project Workflow' }),
    )

    expect(
      await screen.findByText('/work/demo/.agent-space/workflow.json'),
    ).toBeVisible()
    expect(screen.getByText('来源：Development Workflow@1.0.0')).toBeVisible()

    await user.click(screen.getByRole('button', { name: '重新加载并校验' }))
    expect(
      await screen.findByRole('heading', { name: 'Edited Workflow' }),
    ).toBeVisible()
    expect(screen.getByRole('alert')).toHaveTextContent('缺少 Skill research。')
    expect(screen.getByRole('button', { name: '启动新 Run' })).toBeDisabled()
  })

  it('requires a successful Preflight before creating a Run Board', async () => {
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
    const definition = {
      ...BUILT_IN_DEVELOPMENT_WORKFLOW,
      derivedFrom: { id: 'development-workflow', version: '1.0.0' },
    }
    const run = {
      id: 'run-1',
      projectId: 'project-1',
      workspacePath: '/work/demo',
      idea: 'Build durable runs',
      workflowId: definition.id,
      workflowVersion: definition.version,
      definition,
      status: 'running' as const,
      error: null,
      snapshot: {
        phaseIndex: 0,
        stepIndex: 0,
        currentStepExecutionId: 'execution-1',
        pendingQuestion: null,
        pendingApproval: null,
        nextAction: '等待 Runtime 完成当前 Step。',
      },
      stepExecutions: [
        {
          id: 'execution-1',
          runId: 'run-1',
          phaseId: 'discovery',
          stepId: 'discover',
          attempt: 1,
          status: 'running' as const,
          error: null,
          output: null,
          startedAt: null,
          finishedAt: null,
        },
      ],
      events: [],
      artifacts: [],
      createdAt: '2026-08-18T00:00:00.000Z',
      updatedAt: '2026-08-18T00:00:00.000Z',
    }
    window.appShell.listProjects = vi.fn().mockResolvedValue([project])
    window.appShell.getWorkflow = vi.fn().mockResolvedValue({
      definition,
      source: 'project',
      path: '/work/demo/.agent-space/workflow.json',
      validation: { valid: true, errors: [], warnings: [] },
      canStart: true,
      skillManifests: [],
    })
    window.appShell.preflightWorkflowRun = vi.fn().mockResolvedValue({
      passed: true,
      checks: ['Idea 已填写。'],
      errors: [],
    })
    window.appShell.startWorkflowRun = vi
      .fn()
      .mockResolvedValue({ ok: true, error: null, run })
    window.appShell.getWorkflowRun = vi.fn().mockResolvedValue(run)

    render(<App />)
    await user.click(await screen.findByRole('button', { name: /demo/ }))
    await user.click(screen.getByRole('button', { name: '查看 Workflow' }))
    await user.type(await screen.findByLabelText('Idea'), 'Build durable runs')
    expect(screen.getByRole('button', { name: '启动新 Run' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: '运行 Preflight' }))
    expect(await screen.findByText('Idea 已填写。')).toBeVisible()
    await user.click(screen.getByRole('button', { name: '启动新 Run' }))
    expect(
      await screen.findByRole('heading', { name: 'Build durable runs' }),
    ).toBeVisible()
    expect(screen.getAllByText('运行中').length).toBeGreaterThan(0)
    expect(window.appShell.startWorkflowRun).toHaveBeenCalledWith(
      'project-1',
      'Build durable runs',
    )
  })

  it('runs a valid built-in Workflow after Preflight without copying it', async () => {
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
      id: 'run-built-in',
      projectId: project.id,
      workspacePath: project.workspacePath,
      idea: 'Run built-in',
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
        currentStepExecutionId: 'execution-built-in',
        pendingQuestion: null,
        pendingApproval: null,
        pendingQuestionDetails: null,
        pendingApprovalDetails: null,
        blockedBy: null,
        nextAction: '等待 Runtime 完成当前 Step。',
      },
      stepExecutions: [],
      events: [],
      artifacts: [],
      phaseContexts: [],
      decisionRecords: [],
      logs: [],
      createdAt: '2026-08-24T00:00:00.000Z',
      updatedAt: '2026-08-24T00:00:00.000Z',
    }
    window.appShell.listProjects = vi.fn().mockResolvedValue([project])
    window.appShell.getWorkflow = vi.fn().mockResolvedValue({
      definition: BUILT_IN_DEVELOPMENT_WORKFLOW,
      source: 'built-in',
      path: null,
      validation: { valid: true, errors: [], warnings: [] },
      canStart: true,
      skillManifests: BUILT_IN_SKILL_MANIFESTS,
    })
    window.appShell.preflightWorkflowRun = vi.fn().mockResolvedValue({
      passed: true,
      checks: ['Workflow Validation 通过。'],
      errors: [],
    })
    window.appShell.startWorkflowRun = vi
      .fn()
      .mockResolvedValue({ ok: true, error: null, run })
    window.appShell.getWorkflowRun = vi.fn().mockResolvedValue(run)

    render(<App />)
    await user.click(await screen.findByRole('button', { name: /demo/ }))
    await user.click(screen.getByRole('button', { name: '查看 Workflow' }))
    await user.type(await screen.findByLabelText('Idea'), 'Run built-in')
    await user.click(screen.getByRole('button', { name: '运行 Preflight' }))
    await user.click(await screen.findByRole('button', { name: '启动新 Run' }))

    expect(window.appShell.copyWorkflow).not.toHaveBeenCalled()
    expect(window.appShell.startWorkflowRun).toHaveBeenCalledWith(
      project.id,
      'Run built-in',
    )
    expect(screen.getByText('来源快照：内置 Workflow@1.0.0')).toBeVisible()
  })
})
