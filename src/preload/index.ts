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
  startWorkflowRun: (projectId) => ipcRenderer.invoke(APP_SHELL_CHANNELS.startWorkflowRun, projectId),
  openWorkflowFile: (projectId) => ipcRenderer.invoke(APP_SHELL_CHANNELS.openWorkflowFile, projectId)
})

contextBridge.exposeInMainWorld('appShell', appShellApi)
