import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { Project } from '../../../../shared/project'
import type { WorkflowRun, WorkflowRunStatus } from '../../../../shared/workflow-run'
import { BUILT_IN_DEVELOPMENT_WORKFLOW } from '../../../../shared/workflow'
import { AppShellProvider } from '@renderer/app/app-shell-provider'
import { createAppShellApi } from '@renderer/test/app-shell-fake'
import { ProjectFeature } from '../projects/ProjectFeature'
import { WorkflowFeature } from '../workflows/WorkflowFeature'
import { RunSetupFeature } from './RunSetupFeature'

const project: Project = {
  id: 'project-1', name: 'demo', workspacePath: '/work/demo', workspaceAvailable: true,
  remote: null, currentBranch: 'main', head: 'abc123', defaultBranch: 'main', isGreenfield: false,
  dirty: false, dirtySummary: { staged: 0, unstaged: 0, untracked: 0, files: [] }, updatedAt: '2026-09-14T00:00:00Z',
}
const workflow = {
  definition: BUILT_IN_DEVELOPMENT_WORKFLOW, source: 'built-in' as const, path: null,
  validation: { valid: true, errors: [], warnings: [] }, canStart: true, skillManifests: [],
}
const run: WorkflowRun = {
  id: 'only-run', projectId: project.id, workspacePath: '/work/run', remote: null,
  idea: '唯一实例', workflowId: workflow.definition.id, workflowVersion: workflow.definition.version,
  workflowSource: { source: 'built-in', id: workflow.definition.id, version: workflow.definition.version, path: null },
  definition: workflow.definition, baseCommit: 'abc123', branch: 'run', status: 'completed', error: null,
  snapshot: { phaseIndex: 0, stepIndex: 0, currentStepExecutionId: null, pendingQuestion: null, pendingApproval: null,
    pendingQuestionDetails: null, pendingApprovalDetails: null, blockedBy: null, nextAction: '' },
  stepExecutions: [], events: [], logs: [], phaseContexts: [], decisionRecords: [], artifacts: [],
  createdAt: project.updatedAt, updatedAt: project.updatedAt,
}

describe('Single Project Run navigation', () => {
  it.each<WorkflowRunStatus>(['running', 'completed', 'cancelled'])('opens the %s instance from the Project header even if the original Workspace is unavailable', async (status) => {
    const api = createAppShellApi()
    const existing = { ...run, status }
    api.getProjectWorkflowRun = vi.fn().mockResolvedValue(existing)
    const onNavigate = vi.fn()
    const unavailable = { ...project, workspaceAvailable: false }
    render(<AppShellProvider api={api}><ProjectFeature page={{ name: 'projectDetail', project: unavailable }} onNavigate={onNavigate} /></AppShellProvider>)
    const entry = screen.getByRole('button', { name: '查看运行实例' })
    await waitFor(() => expect(entry).toBeEnabled())
    fireEvent.click(entry)
    expect(onNavigate).toHaveBeenCalledWith({ name: 'run', project: unavailable, run: existing })
    expect(api.startWorkflowRun).not.toHaveBeenCalled()
    expect(screen.queryByText('Workflow Runs')).not.toBeInTheDocument()
  })

  it('keeps the previous Project Run out of a newly selected Project while loading or failing', async () => {
    const api = createAppShellApi()
    api.getProjectWorkflowRun = vi.fn().mockResolvedValueOnce(run).mockRejectedValue(new Error('offline'))
    const onNavigate = vi.fn()
    const view = render(<AppShellProvider api={api}><ProjectFeature page={{ name: 'projectDetail', project }} onNavigate={onNavigate} /></AppShellProvider>)
    await waitFor(() => expect(screen.getByRole('button', { name: '查看运行实例' })).toBeEnabled())
    view.rerender(<AppShellProvider api={api}><ProjectFeature page={{ name: 'projectDetail', project: { ...project, id: 'project-2' } }} onNavigate={onNavigate} /></AppShellProvider>)
    expect(screen.getByRole('button', { name: '查看运行实例' })).toBeDisabled()
    expect(screen.queryByText(run.idea)).not.toBeInTheDocument()
    expect(await screen.findByText('读取运行实例失败，正在重试。')).toBeVisible()
    expect(screen.queryByText('还没有 Workflow Run。')).not.toBeInTheDocument()
  })

  it.each(['invalid', 'unavailable'])('opens the existing Run when the current Workflow is %s', async (state) => {
    const api = createAppShellApi()
    api.getProjectWorkflowRun = vi.fn().mockResolvedValue(run)
    api.getWorkflow = state === 'invalid'
      ? vi.fn().mockResolvedValue({ ...workflow, canStart: false, validation: { valid: false, errors: ['无效 Workflow'], warnings: [] } })
      : vi.fn().mockRejectedValue(new Error('missing Workflow'))
    const onNavigate = vi.fn()
    render(<AppShellProvider api={api}><WorkflowFeature project={project} onNavigate={onNavigate} /></AppShellProvider>)
    fireEvent.click(await screen.findByRole('button', { name: '查看运行实例' }))
    expect(onNavigate).toHaveBeenCalledWith({ name: 'run', project, run })
    expect(screen.queryByRole('button', { name: '运行' })).not.toBeInTheDocument()
    expect(api.startWorkflowRun).not.toHaveBeenCalled()
  })

  it('redirects a stale creation page to the existing Run without checking or starting', async () => {
    const api = createAppShellApi()
    api.getProjectWorkflowRun = vi.fn().mockResolvedValue(run)
    const onNavigate = vi.fn()
    render(<AppShellProvider api={api}><RunSetupFeature project={project} workflow={workflow} onNavigate={onNavigate} /></AppShellProvider>)
    await waitFor(() => expect(onNavigate).toHaveBeenCalledWith({ name: 'run', project, run }))
    expect(api.preflightWorkflowRun).not.toHaveBeenCalled()
    expect(api.startWorkflowRun).not.toHaveBeenCalled()
  })

  it('blocks creation while the Project Run lookup is pending or unavailable', async () => {
    const api = createAppShellApi()
    let reject!: (error: Error) => void
    api.getProjectWorkflowRun = vi.fn(() => new Promise<WorkflowRun | null>((_resolve, fail) => { reject = fail }))
    render(<AppShellProvider api={api}><RunSetupFeature project={project} workflow={workflow} onNavigate={vi.fn()} /></AppShellProvider>)
    const input = screen.getByLabelText('想法')
    fireEvent.change(input, { target: { value: 'Do not create yet' } })
    fireEvent.submit(input.closest('form')!)
    expect(screen.getByRole('button', { name: '开始运行' })).toBeDisabled()
    await act(async () => { reject(new Error('offline')) })
    expect(await screen.findByText('读取运行实例失败，正在重试。')).toBeVisible()
    fireEvent.submit(input.closest('form')!)
    expect(api.preflightWorkflowRun).not.toHaveBeenCalled()
    expect(api.startWorkflowRun).not.toHaveBeenCalled()
  })

  it('opens the instance returned when another request wins the creation race', async () => {
    const api = createAppShellApi()
    api.preflightWorkflowRun = vi.fn().mockResolvedValue({ passed: true, checks: [], errors: [] })
    api.startWorkflowRun = vi.fn().mockResolvedValue({ ok: false, error: '该工程已有运行实例。', run })
    const onNavigate = vi.fn()
    render(<AppShellProvider api={api}><RunSetupFeature project={project} workflow={workflow} onNavigate={onNavigate} /></AppShellProvider>)
    const input = screen.getByLabelText('想法')
    await waitFor(() => expect(input).toBeEnabled())
    fireEvent.change(input, { target: { value: 'New idea' } })
    fireEvent.submit(input.closest('form')!)
    await waitFor(() => expect(onNavigate).toHaveBeenCalledWith({ name: 'run', project, run }))
    expect(api.startWorkflowRun).toHaveBeenCalledTimes(1)
  })
})
