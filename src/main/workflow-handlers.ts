import { join } from 'node:path'

import { APP_SHELL_CHANNELS } from '../shared/app-shell'
import { DEFAULT_PROJECT_PERMISSIONS, type Project } from '../shared/project'
import type { WorkflowStartResult, WorkflowView } from '../shared/workflow'

interface WorkflowService {
  getBuiltIn: () => Promise<WorkflowView>
  copyToProject: (workspacePath: string, grantedPermissions: string[]) => Promise<WorkflowView>
  loadProject: (workspacePath: string, grantedPermissions: string[]) => Promise<WorkflowView>
  startProjectRun: (workspacePath: string, grantedPermissions: string[]) => Promise<WorkflowStartResult>
}

interface WorkflowHandlerDependencies {
  handle: (channel: string, listener: (...args: unknown[]) => unknown) => void
  projectService: { findById: (filePath: string, projectId: string) => Promise<Project | null> }
  workflowService: WorkflowService
  userDataPath?: string
  openInIde?: (path: string) => Promise<void>
}

export function registerWorkflowHandlers({ handle, projectService, workflowService, userDataPath = '', openInIde }: WorkflowHandlerDependencies): void {
  const findProject = async (projectId: unknown): Promise<Project | null> => {
    if (typeof projectId !== 'string' || !projectId) return null
    return projectService.findById(join(userDataPath, 'projects.json'), projectId)
  }
  const permissionsFor = (project: Project): string[] => project.permissionPolicy?.grantedPermissions ?? [...DEFAULT_PROJECT_PERMISSIONS]

  handle(APP_SHELL_CHANNELS.getWorkflow, async (_event: unknown, projectId: unknown) => {
    const project = await findProject(projectId)
    if (!project) return workflowService.getBuiltIn()
    try {
      return await workflowService.loadProject(project.workspacePath, permissionsFor(project))
    } catch (reason) {
      if (reason && typeof reason === 'object' && 'code' in reason && reason.code === 'ENOENT') {
        return workflowService.getBuiltIn()
      }
      throw reason
    }
  })
  handle(APP_SHELL_CHANNELS.copyWorkflow, async (_event: unknown, projectId: unknown) => {
    const project = await findProject(projectId)
    if (!project) return null
    return workflowService.copyToProject(project.workspacePath, permissionsFor(project))
  })
  handle(APP_SHELL_CHANNELS.reloadWorkflow, async (_event: unknown, projectId: unknown) => {
    const project = await findProject(projectId)
    if (!project) return null
    return workflowService.loadProject(project.workspacePath, permissionsFor(project))
  })
  handle(APP_SHELL_CHANNELS.startWorkflowRun, async (_event: unknown, projectId: unknown) => {
    const project = await findProject(projectId)
    if (!project) return { ok: false, error: '找不到这个 Project。' }
    return workflowService.startProjectRun(project.workspacePath, permissionsFor(project))
  })
  handle(APP_SHELL_CHANNELS.openWorkflowFile, async (_event: unknown, projectId: unknown) => {
    const project = await findProject(projectId)
    if (!project) return { ok: false, error: '找不到这个 Project。' }
    if (!openInIde) return { ok: false, error: '没有找到可用的外部 IDE。' }
    try {
      await openInIde(join(project.workspacePath, '.agent-space', 'workflow.json'))
      return { ok: true, error: null }
    } catch {
      return { ok: false, error: '没有找到可用的外部 IDE。' }
    }
  })
}
