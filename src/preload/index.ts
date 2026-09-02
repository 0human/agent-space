import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'

import { APP_SHELL_CHANNELS, type AppShellApi } from '../shared/app-shell'
import type { RuntimeItem } from '../shared/workflow-run'

const appShellApi: AppShellApi = Object.freeze({
  getRuntimeInfo: () => ipcRenderer.invoke(APP_SHELL_CHANNELS.getRuntimeInfo),
  listProjects: () => ipcRenderer.invoke(APP_SHELL_CHANNELS.listProjects),
  importProject: () => ipcRenderer.invoke(APP_SHELL_CHANNELS.importProject),
  cloneGitHubProject: (repositoryUrl) => ipcRenderer.invoke(APP_SHELL_CHANNELS.cloneGitHubProject, repositoryUrl),
  deleteProject: (projectId) => ipcRenderer.invoke(APP_SHELL_CHANNELS.deleteProject, projectId),
  openProjectInIde: (projectId) => ipcRenderer.invoke(APP_SHELL_CHANNELS.openProjectInIde, projectId),
  getWorkflow: (projectId) => ipcRenderer.invoke(APP_SHELL_CHANNELS.getWorkflow, projectId),
  copyWorkflow: (projectId) => ipcRenderer.invoke(APP_SHELL_CHANNELS.copyWorkflow, projectId),
  reloadWorkflow: (projectId) => ipcRenderer.invoke(APP_SHELL_CHANNELS.reloadWorkflow, projectId),
  preflightWorkflowRun: (projectId, idea) => ipcRenderer.invoke(APP_SHELL_CHANNELS.preflightWorkflowRun, projectId, idea),
  startWorkflowRun: (projectId, idea) => ipcRenderer.invoke(APP_SHELL_CHANNELS.startWorkflowRun, projectId, idea),
  listWorkflowRuns: (projectId) => ipcRenderer.invoke(APP_SHELL_CHANNELS.listWorkflowRuns, projectId),
  getWorkflowRun: (runId) => ipcRenderer.invoke(APP_SHELL_CHANNELS.getWorkflowRun, runId),
  listRuntimeItems: (executionId) => ipcRenderer.invoke(APP_SHELL_CHANNELS.listRuntimeItems, executionId),
  subscribeRuntimeItemUpdates: (listener) => {
    const ipcListener = (_event: IpcRendererEvent, item: RuntimeItem): void => listener(item)
    ipcRenderer.on(APP_SHELL_CHANNELS.runtimeItemUpdated, ipcListener)
    return () => ipcRenderer.removeListener(APP_SHELL_CHANNELS.runtimeItemUpdated, ipcListener)
  },
  pauseWorkflowRun: (runId) => ipcRenderer.invoke(APP_SHELL_CHANNELS.pauseWorkflowRun, runId),
  resumeWorkflowRun: (runId, guidance) => guidance === undefined
    ? ipcRenderer.invoke(APP_SHELL_CHANNELS.resumeWorkflowRun, runId)
    : ipcRenderer.invoke(APP_SHELL_CHANNELS.resumeWorkflowRun, runId, guidance),
  retryWorkflowStep: (runId, guidance) => guidance === undefined
    ? ipcRenderer.invoke(APP_SHELL_CHANNELS.retryWorkflowStep, runId)
    : ipcRenderer.invoke(APP_SHELL_CHANNELS.retryWorkflowStep, runId, guidance),
  cancelWorkflowRun: (runId) => ipcRenderer.invoke(APP_SHELL_CHANNELS.cancelWorkflowRun, runId),
  answerWorkflowQuestion: (runId, answer) => ipcRenderer.invoke(APP_SHELL_CHANNELS.answerWorkflowQuestion, runId, answer),
  approveWorkflowApproval: (runId) => ipcRenderer.invoke(APP_SHELL_CHANNELS.approveWorkflowApproval, runId),
  rejectWorkflowApproval: (runId) => ipcRenderer.invoke(APP_SHELL_CHANNELS.rejectWorkflowApproval, runId),
  openWorkflowFile: (projectId) => ipcRenderer.invoke(APP_SHELL_CHANNELS.openWorkflowFile, projectId),
  previewSkillInstall: (source) => ipcRenderer.invoke(APP_SHELL_CHANNELS.previewSkillInstall, source),
  installSkill: (source) => ipcRenderer.invoke(APP_SHELL_CHANNELS.installSkill, source),
  listInstalledSkills: () => ipcRenderer.invoke(APP_SHELL_CHANNELS.listInstalledSkills)
})

contextBridge.exposeInMainWorld('appShell', appShellApi)
