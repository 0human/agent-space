import type { OpenProjectResult, Project, ProjectImportResult } from './project'
import type { WorkflowStartResult, WorkflowView } from './workflow'

export interface RuntimeInfo {
  platform: NodeJS.Platform
  version: string
}

export const APP_SHELL_CHANNELS = {
  getRuntimeInfo: 'app-shell:get-runtime-info',
  listProjects: 'project:list',
  importProject: 'project:import',
  openProjectInIde: 'project:open-in-ide',
  getWorkflow: 'workflow:get',
  copyWorkflow: 'workflow:copy',
  reloadWorkflow: 'workflow:reload',
  startWorkflowRun: 'workflow:start-run'
} as const

export interface AppShellApi {
  getRuntimeInfo: () => Promise<RuntimeInfo>
  listProjects: () => Promise<Project[]>
  importProject: () => Promise<ProjectImportResult | null>
  openProjectInIde: (projectId: string) => Promise<OpenProjectResult>
  getWorkflow: (projectId: string) => Promise<WorkflowView>
  copyWorkflow: (projectId: string) => Promise<WorkflowView | null>
  reloadWorkflow: (projectId: string) => Promise<WorkflowView | null>
  startWorkflowRun: (projectId: string) => Promise<WorkflowStartResult>
}
