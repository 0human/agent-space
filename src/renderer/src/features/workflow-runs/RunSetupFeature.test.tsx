import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { Project } from '../../../../shared/project'
import type { WorkflowView } from '../../../../shared/workflow'
import type { WorkflowPreflightResult } from '../../../../shared/workflow-run'
import { BUILT_IN_DEVELOPMENT_WORKFLOW } from '../../../../shared/workflow'
import { AppShellProvider } from '@renderer/app/app-shell-provider'
import { createAppShellApi } from '@renderer/test/app-shell-fake'
import { RunSetupFeature } from './RunSetupFeature'

const project: Project = {
  id: 'project-1', name: 'demo', workspacePath: '/work/demo', workspaceAvailable: true,
  remote: null, currentBranch: 'main', head: 'abc123', defaultBranch: 'main', isGreenfield: false,
  dirty: false, dirtySummary: { staged: 0, unstaged: 0, untracked: 0, files: [] }, updatedAt: '2026-09-14T00:00:00Z',
}
const workflow: WorkflowView = {
  definition: BUILT_IN_DEVELOPMENT_WORKFLOW, source: 'built-in', path: null,
  validation: { valid: true, errors: [], warnings: [] }, canStart: true, skillManifests: [],
}

describe('Preparing a new Run', () => {
  it('ignores duplicate submissions and retains the Idea when starting fails', async () => {
    const api = createAppShellApi()
    let finish!: (result: WorkflowPreflightResult) => void
    api.preflightWorkflowRun = vi.fn(() => new Promise<WorkflowPreflightResult>((resolve) => { finish = resolve }))
    api.startWorkflowRun = vi.fn().mockRejectedValue(new Error('运行环境已变化，请重试。'))
    const onNavigate = vi.fn()
    render(<AppShellProvider api={api}><RunSetupFeature project={project} workflow={workflow} onNavigate={onNavigate} /></AppShellProvider>)
    const input = screen.getByLabelText('想法')
    await waitFor(() => expect(input).toBeEnabled())
    fireEvent.change(input, { target: { value: '  做一个计算器  ' } })
    fireEvent.submit(input.closest('form')!)
    fireEvent.submit(input.closest('form')!)
    expect(api.preflightWorkflowRun).toHaveBeenCalledTimes(1)
    expect(api.preflightWorkflowRun).toHaveBeenCalledWith(project.id, '做一个计算器')
    expect(input).toBeDisabled()
    expect(api.startWorkflowRun).not.toHaveBeenCalled()
    await act(async () => { finish({ passed: true, checks: [], errors: [] }) })
    expect(api.startWorkflowRun).toHaveBeenCalledTimes(1)
    expect(await screen.findByText('运行环境已变化，请重试。')).toBeVisible()
    expect(input).toHaveValue('  做一个计算器  ')
    expect(input).toBeEnabled()
    expect(onNavigate).not.toHaveBeenCalled()
  })

  it('does not create a Run if the user leaves while checks are pending', async () => {
    const api = createAppShellApi()
    let finish!: (result: WorkflowPreflightResult) => void
    api.preflightWorkflowRun = vi.fn(() => new Promise<WorkflowPreflightResult>((resolve) => { finish = resolve }))
    const { unmount } = render(<AppShellProvider api={api}><RunSetupFeature project={project} workflow={workflow} onNavigate={vi.fn()} /></AppShellProvider>)
    const input = screen.getByLabelText('想法')
    await waitFor(() => expect(input).toBeEnabled())
    fireEvent.change(input, { target: { value: '做一个计算器' } })
    fireEvent.submit(input.closest('form')!)
    unmount()
    await act(async () => { finish({ passed: true, checks: [], errors: [] }) })
    expect(api.startWorkflowRun).not.toHaveBeenCalled()
  })
})
