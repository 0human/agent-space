// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest'

const exposeInMainWorld = vi.fn()
const invoke = vi.fn()

vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld },
  ipcRenderer: { invoke }
}))

describe('App Shell preload contract', () => {
  beforeEach(() => {
    vi.resetModules()
    exposeInMainWorld.mockReset()
    invoke.mockReset()
  })

  it('exposes only the controlled runtime information capability', async () => {
    invoke.mockResolvedValue({ platform: 'darwin', version: '0.1.0' })

    await import('./index')

    expect(exposeInMainWorld).toHaveBeenCalledOnce()
    expect(exposeInMainWorld).toHaveBeenCalledWith('appShell', expect.objectContaining({
      getRuntimeInfo: expect.any(Function),
      listProjects: expect.any(Function),
      importProject: expect.any(Function),
      openProjectInIde: expect.any(Function)
    }))

    const api = exposeInMainWorld.mock.calls[0][1]
    await expect(api.getRuntimeInfo()).resolves.toEqual({ platform: 'darwin', version: '0.1.0' })
    expect(invoke).toHaveBeenCalledWith('app-shell:get-runtime-info')

    await api.listProjects()
    await api.importProject()
    await api.openProjectInIde('project-1')
    await api.getWorkflow('project-1')
    await api.copyWorkflow('project-1')
    await api.reloadWorkflow('project-1')
    await api.preflightWorkflowRun('project-1', 'idea')
    await api.startWorkflowRun('project-1', 'idea')
    await api.listWorkflowRuns('project-1')
    await api.getWorkflowRun('run-1')
    await api.pauseWorkflowRun('run-1')
    await api.resumeWorkflowRun('run-1')
    await api.retryWorkflowStep('run-1')
    await api.cancelWorkflowRun('run-1')
    await api.openWorkflowFile('project-1')
    await api.previewSkillInstall({ type: 'local-directory', value: '/tmp/skill' })
    await api.installSkill({ type: 'local-directory', value: '/tmp/skill' })
    await api.listInstalledSkills()
    expect(invoke).toHaveBeenCalledWith('project:list')
    expect(invoke).toHaveBeenCalledWith('project:import')
    expect(invoke).toHaveBeenCalledWith('project:open-in-ide', 'project-1')
    expect(invoke).toHaveBeenCalledWith('workflow:get', 'project-1')
    expect(invoke).toHaveBeenCalledWith('workflow:copy', 'project-1')
    expect(invoke).toHaveBeenCalledWith('workflow:reload', 'project-1')
    expect(invoke).toHaveBeenCalledWith('workflow-run:preflight', 'project-1', 'idea')
    expect(invoke).toHaveBeenCalledWith('workflow:start-run', 'project-1', 'idea')
    expect(invoke).toHaveBeenCalledWith('workflow-run:list', 'project-1')
    expect(invoke).toHaveBeenCalledWith('workflow-run:get', 'run-1')
    expect(invoke).toHaveBeenCalledWith('workflow-run:pause', 'run-1')
    expect(invoke).toHaveBeenCalledWith('workflow-run:resume', 'run-1')
    expect(invoke).toHaveBeenCalledWith('workflow-run:retry-step', 'run-1')
    expect(invoke).toHaveBeenCalledWith('workflow-run:cancel', 'run-1')
    expect(invoke).toHaveBeenCalledWith('workflow:open-file', 'project-1')
    expect(invoke).toHaveBeenCalledWith('skill:preview-install', { type: 'local-directory', value: '/tmp/skill' })
    expect(invoke).toHaveBeenCalledWith('skill:install', { type: 'local-directory', value: '/tmp/skill' })
    expect(invoke).toHaveBeenCalledWith('skill:list-installed')
  })
})
