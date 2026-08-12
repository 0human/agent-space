import { contextBridge, ipcRenderer } from 'electron'

import { APP_SHELL_CHANNELS, type AppShellApi } from '../shared/app-shell'

const appShellApi: AppShellApi = Object.freeze({
  getRuntimeInfo: () => ipcRenderer.invoke(APP_SHELL_CHANNELS.getRuntimeInfo)
})

contextBridge.exposeInMainWorld('appShell', appShellApi)
