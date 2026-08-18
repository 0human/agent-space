import { join } from 'node:path'

import { APP_SHELL_CHANNELS } from '../shared/app-shell'
import { DEFAULT_PROJECT_PERMISSIONS, type Project } from '../shared/project'
import type { WorkflowView } from '../shared/workflow'
import type { WorkflowPreflightResult, WorkflowRunActionResult } from '../shared/workflow-run'
import type { WorkflowEngine } from './workflow-engine'

interface WorkflowService {
  getBuiltIn: () => Promise<WorkflowView>
  copyToProject: (workspacePath: string, grantedPermissions: string[]) => Promise<WorkflowView>
  loadProject: (workspacePath: string, grantedPermissions: string[]) => Promise<WorkflowView>
  startProjectRun: (workspacePath: string, grantedPermissions: string[]) => Promise<{ ok: boolean; error: string | null }>
}

interface WorkflowHandlerDependencies {
  handle: (channel: string, listener: (...args: unknown[]) => unknown) => void
  projectService: { findById: (filePath: string, projectId: string) => Promise<Project | null> }
  workflowService: WorkflowService
  workflowEngine?: WorkflowEngine
  userDataPath?: string
  openInIde?: (path: string) => Promise<void>
}

export function registerWorkflowHandlers({ handle, projectService, workflowService, workflowEngine, userDataPath = '', openInIde }: WorkflowHandlerDependencies): void {
  const findProject = async (projectId: unknown): Promise<Project | null> => {
    if (typeof projectId !== 'string' || !projectId) return null
    return projectService.findById(join(userDataPath, 'projects.json'), projectId)
  }
  const permissionsFor = (project: Project): string[] => project.permissionPolicy?.grantedPermissions ?? [...DEFAULT_PROJECT_PERMISSIONS]
  const loadForProject = async (project: Project): Promise<WorkflowView> => {
    try {
      return await workflowService.loadProject(project.workspacePath, permissionsFor(project))
    } catch (reason) {
      if (reason && typeof reason === 'object' && 'code' in reason && reason.code === 'ENOENT') return workflowService.getBuiltIn()
      throw reason
    }
  }

  handle(APP_SHELL_CHANNELS.getWorkflow, async (_event: unknown, projectId: unknown) => {
    const project = await findProject(projectId)
    if (!project) return workflowService.getBuiltIn()
    return loadForProject(project)
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
  handle(APP_SHELL_CHANNELS.preflightWorkflowRun, async (_event: unknown, projectId: unknown, idea: unknown): Promise<WorkflowPreflightResult> => {
    if (!workflowEngine) return { passed: false, checks: [], errors: ['Workflow Engine 不可用。'] }
    const project = await findProject(projectId)
    if (!project) return { passed: false, checks: [], errors: ['找不到这个 Project。'] }
    const workflow = await loadForProject(project)
    return workflowEngine.preflight({ project, workflow, idea: typeof idea === 'string' ? idea : '' })
  })
  handle(APP_SHELL_CHANNELS.startWorkflowRun, async (_event: unknown, projectId: unknown, idea: unknown): Promise<WorkflowRunActionResult> => {
    const project = await findProject(projectId)
    if (!project) return { ok: false, error: '找不到这个 Project。', run: null }
    if (!workflowEngine) {
      const result = await workflowService.startProjectRun(project.workspacePath, permissionsFor(project))
      return { ...result, run: null }
    }
    const workflow = await loadForProject(project)
    try {
      const run = await workflowEngine.startRun({ project, workflow, idea: typeof idea === 'string' ? idea : '' })
      return { ok: true, error: null, run }
    } catch (reason) {
      return { ok: false, error: reason instanceof Error ? reason.message : String(reason), run: null }
    }
  })
  handle(APP_SHELL_CHANNELS.listWorkflowRuns, async (_event: unknown, projectId: unknown) => {
    if (!workflowEngine || typeof projectId !== 'string') return []
    return workflowEngine.listRuns(projectId)
  })
  handle(APP_SHELL_CHANNELS.getWorkflowRun, async (_event: unknown, runId: unknown) => {
    if (!workflowEngine || typeof runId !== 'string') return null
    return workflowEngine.getRun(runId)
  })
  handle(APP_SHELL_CHANNELS.pauseWorkflowRun, async (_event: unknown, runId: unknown) => workflowEngine!.pauseRun(String(runId)))
  handle(APP_SHELL_CHANNELS.resumeWorkflowRun, async (_event: unknown, runId: unknown) => workflowEngine!.resumeRun(String(runId)))
  handle(APP_SHELL_CHANNELS.retryWorkflowStep, async (_event: unknown, runId: unknown) => workflowEngine!.retryStep(String(runId)))
  handle(APP_SHELL_CHANNELS.cancelWorkflowRun, async (_event: unknown, runId: unknown) => workflowEngine!.cancelRun(String(runId)))
  handle(APP_SHELL_CHANNELS.answerWorkflowQuestion, async (_event: unknown, runId: unknown, answer: unknown) => workflowEngine!.answerQuestion(String(runId), typeof answer === 'string' ? answer : ''))
  handle(APP_SHELL_CHANNELS.approveWorkflowApproval, async (_event: unknown, runId: unknown) => workflowEngine!.approve(String(runId)))
  handle(APP_SHELL_CHANNELS.rejectWorkflowApproval, async (_event: unknown, runId: unknown) => workflowEngine!.reject(String(runId)))
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
