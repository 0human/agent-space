import { contextBridge, ipcRenderer } from 'electron'

import { APP_SHELL_CHANNELS, type AppShellApi } from '../shared/app-shell'

const appShellApi: AppShellApi = Object.freeze({
  getRuntimeInfo: () => ipcRenderer.invoke(APP_SHELL_CHANNELS.getRuntimeInfo),
  listProjects: () => ipcRenderer.invoke(APP_SHELL_CHANNELS.listProjects),
  importProject: () => ipcRenderer.invoke(APP_SHELL_CHANNELS.importProject),
  openProjectInIde: (projectId) => ipcRenderer.invoke(APP_SHELL_CHANNELS.openProjectInIde, projectId),
  getWorkflow: (projectId) => ipcRenderer.invoke(APP_SHELL_CHANNELS.getWorkflow, projectId),
  copyWorkflow: (projectId) => ipcRenderer.invoke(APP_SHELL_CHANNELS.copyWorkflow, projectId),
  reloadWorkflow: (projectId) => ipcRenderer.invoke(APP_SHELL_CHANNELS.reloadWorkflow, projectId),
  preflightWorkflowRun: (projectId, idea) => ipcRenderer.invoke(APP_SHELL_CHANNELS.preflightWorkflowRun, projectId, idea),
  startWorkflowRun: (projectId, idea) => ipcRenderer.invoke(APP_SHELL_CHANNELS.startWorkflowRun, projectId, idea),
  listWorkflowRuns: (projectId) => ipcRenderer.invoke(APP_SHELL_CHANNELS.listWorkflowRuns, projectId),
  getWorkflowRun: (runId) => ipcRenderer.invoke(APP_SHELL_CHANNELS.getWorkflowRun, runId),
  pauseWorkflowRun: (runId) => ipcRenderer.invoke(APP_SHELL_CHANNELS.pauseWorkflowRun, runId),
  resumeWorkflowRun: (runId) => ipcRenderer.invoke(APP_SHELL_CHANNELS.resumeWorkflowRun, runId),
  retryWorkflowStep: (runId) => ipcRenderer.invoke(APP_SHELL_CHANNELS.retryWorkflowStep, runId),
  cancelWorkflowRun: (runId) => ipcRenderer.invoke(APP_SHELL_CHANNELS.cancelWorkflowRun, runId),
  answerWorkflowQuestion: (runId, answer) => ipcRenderer.invoke(APP_SHELL_CHANNELS.answerWorkflowQuestion, runId, answer),
  approveWorkflowApproval: (runId) => ipcRenderer.invoke(APP_SHELL_CHANNELS.approveWorkflowApproval, runId),
  rejectWorkflowApproval: (runId) => ipcRenderer.invoke(APP_SHELL_CHANNELS.rejectWorkflowApproval, runId),
  openWorkflowFile: (projectId) => ipcRenderer.invoke(APP_SHELL_CHANNELS.openWorkflowFile, projectId)
})

contextBridge.exposeInMainWorld('appShell', appShellApi)
