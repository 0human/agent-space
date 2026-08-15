import { contextBridge, ipcRenderer } from 'electron'

import { APP_SHELL_CHANNELS, type AppShellApi } from '../shared/app-shell'

const appShellApi: AppShellApi = Object.freeze({
  getRuntimeInfo: () => ipcRenderer.invoke(APP_SHELL_CHANNELS.getRuntimeInfo),
  listProjects: () => ipcRenderer.invoke(APP_SHELL_CHANNELS.listProjects),
  importProject: () => ipcRenderer.invoke(APP_SHELL_CHANNELS.importProject),
  openProjectInIde: (projectId) => ipcRenderer.invoke(APP_SHELL_CHANNELS.openProjectInIde, projectId)
})

contextBridge.exposeInMainWorld('appShell', appShellApi)
