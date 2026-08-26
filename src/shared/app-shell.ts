import type { GitHubProjectCloneResponse, OpenProjectResult, Project, ProjectImportResult } from './project'
import type { WorkflowView } from './workflow'
import type { RuntimeItem, RuntimeItemProjectionUpdate, WorkflowPreflightResult, WorkflowRun, WorkflowRunActionResult } from './workflow-run'
import type { InstalledSkillRecord, SkillInstallPreview, SkillSource } from './skill-package'

export interface RuntimeInfo {
  platform: NodeJS.Platform
  version: string
}

export const APP_SHELL_CHANNELS = {
  getRuntimeInfo: 'app-shell:get-runtime-info',
  listProjects: 'project:list',
  importProject: 'project:import',
  cloneGitHubProject: 'project:clone-github',
  openProjectInIde: 'project:open-in-ide',
  getWorkflow: 'workflow:get',
  copyWorkflow: 'workflow:copy',
  reloadWorkflow: 'workflow:reload',
  preflightWorkflowRun: 'workflow-run:preflight',
  startWorkflowRun: 'workflow:start-run',
  listWorkflowRuns: 'workflow-run:list',
  getWorkflowRun: 'workflow-run:get',
  listRuntimeItems: 'runtime-item:list',
  runtimeItemUpdated: 'runtime-item:updated',
  pauseWorkflowRun: 'workflow-run:pause',
  resumeWorkflowRun: 'workflow-run:resume',
  retryWorkflowStep: 'workflow-run:retry-step',
  cancelWorkflowRun: 'workflow-run:cancel',
  answerWorkflowQuestion: 'workflow-run:answer-question',
  approveWorkflowApproval: 'workflow-run:approve',
  rejectWorkflowApproval: 'workflow-run:reject',
  openWorkflowFile: 'workflow:open-file',
  previewSkillInstall: 'skill:preview-install',
  installSkill: 'skill:install',
  listInstalledSkills: 'skill:list-installed'
} as const

export interface AppShellApi {
  getRuntimeInfo: () => Promise<RuntimeInfo>
  listProjects: () => Promise<Project[]>
  importProject: () => Promise<ProjectImportResult | null>
  cloneGitHubProject: (repositoryUrl: string) => Promise<GitHubProjectCloneResponse | null>
  openProjectInIde: (projectId: string) => Promise<OpenProjectResult>
  getWorkflow: (projectId: string) => Promise<WorkflowView>
  copyWorkflow: (projectId: string) => Promise<WorkflowView | null>
  reloadWorkflow: (projectId: string) => Promise<WorkflowView | null>
  preflightWorkflowRun: (projectId: string, idea: string) => Promise<WorkflowPreflightResult>
  startWorkflowRun: (projectId: string, idea: string) => Promise<WorkflowRunActionResult>
  listWorkflowRuns: (projectId: string) => Promise<WorkflowRun[]>
  getWorkflowRun: (runId: string) => Promise<WorkflowRun | null>
  listRuntimeItems: (executionId: string) => Promise<RuntimeItem[]>
  subscribeRuntimeItemUpdates: (listener: (update: RuntimeItemProjectionUpdate) => void) => () => void
  pauseWorkflowRun: (runId: string) => Promise<WorkflowRun>
  resumeWorkflowRun: (runId: string) => Promise<WorkflowRun>
  retryWorkflowStep: (runId: string) => Promise<WorkflowRun>
  cancelWorkflowRun: (runId: string) => Promise<WorkflowRun>
  answerWorkflowQuestion: (runId: string, answer: string) => Promise<WorkflowRun>
  approveWorkflowApproval: (runId: string) => Promise<WorkflowRun>
  rejectWorkflowApproval: (runId: string) => Promise<WorkflowRun>
  openWorkflowFile: (projectId: string) => Promise<OpenProjectResult>
  previewSkillInstall: (source: SkillSource) => Promise<SkillInstallPreview>
  installSkill: (source: SkillSource) => Promise<InstalledSkillRecord | null>
  listInstalledSkills: () => Promise<InstalledSkillRecord[]>
}
