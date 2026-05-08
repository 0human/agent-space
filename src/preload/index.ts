import { contextBridge, ipcRenderer } from 'electron'
import type { AgentSpaceAPI } from '../shared/api'
import { APP_GET_INFO_CHANNEL } from '../main/ipc/app'

const agentSpace: AgentSpaceAPI = {
  app: {
    getInfo: () => ipcRenderer.invoke(APP_GET_INFO_CHANNEL)
  }
}

contextBridge.exposeInMainWorld('agentSpace', agentSpace)
