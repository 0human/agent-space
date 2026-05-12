import { contextBridge, ipcRenderer } from 'electron'
import type { AgentSpaceAPI } from '../shared/api'
import { APP_GET_INFO_CHANNEL } from '../main/ipc/app'
import {
  RUNTIME_CREATE_CHANNEL,
  RUNTIME_DELETE_CHANNEL,
  RUNTIME_GET_CHANNEL,
  RUNTIME_IMPORT_COMMIT_CHANNEL,
  RUNTIME_IMPORT_PREVIEW_CHANNEL,
  RUNTIME_LIST_CHANNEL,
  RUNTIME_TEST_CHANNEL,
  RUNTIME_UPDATE_CHANNEL
} from '../main/ipc/runtime'

const agentSpace: AgentSpaceAPI = {
  app: {
    getInfo: () => ipcRenderer.invoke(APP_GET_INFO_CHANNEL)
  },
  runtimes: {
    list: (input) => ipcRenderer.invoke(RUNTIME_LIST_CHANNEL, input),
    get: (id) => ipcRenderer.invoke(RUNTIME_GET_CHANNEL, id),
    create: (input) => ipcRenderer.invoke(RUNTIME_CREATE_CHANNEL, input),
    update: (input) => ipcRenderer.invoke(RUNTIME_UPDATE_CHANNEL, input),
    delete: (input) => ipcRenderer.invoke(RUNTIME_DELETE_CHANNEL, input),
    test: (input) => ipcRenderer.invoke(RUNTIME_TEST_CHANNEL, input),
    importPreview: (input) => ipcRenderer.invoke(RUNTIME_IMPORT_PREVIEW_CHANNEL, input),
    importCommit: (input) => ipcRenderer.invoke(RUNTIME_IMPORT_COMMIT_CHANNEL, input)
  }
}

contextBridge.exposeInMainWorld('agentSpace', agentSpace)
