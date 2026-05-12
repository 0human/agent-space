import { contextBridge, ipcRenderer } from 'electron'
import type { AgentSpaceAPI } from '../shared/api'
import {
  AGENT_PROFILE_CREATE_CHANNEL,
  AGENT_PROFILE_GET_CHANNEL,
  AGENT_PROFILE_LIST_CHANNEL,
  AGENT_PROFILE_UPDATE_CHANNEL
} from '../main/ipc/agentProfiles'
import { APP_GET_INFO_CHANNEL } from '../main/ipc/app'
import {
  PERMISSION_BIND_POLICY_SET_CHANNEL,
  PERMISSION_CREATE_POLICY_SET_CHANNEL,
  PERMISSION_GET_POLICY_SET_CHANNEL,
  PERMISSION_LIST_POLICY_SETS_CHANNEL,
  PERMISSION_RESOLVE_PREVIEW_CHANNEL,
  PERMISSION_UPDATE_POLICY_SET_CHANNEL
} from '../main/ipc/permissions'
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
  },
  permissions: {
    listPolicySets: () => ipcRenderer.invoke(PERMISSION_LIST_POLICY_SETS_CHANNEL),
    getPolicySet: (id) => ipcRenderer.invoke(PERMISSION_GET_POLICY_SET_CHANNEL, id),
    createPolicySet: (input) => ipcRenderer.invoke(PERMISSION_CREATE_POLICY_SET_CHANNEL, input),
    updatePolicySet: (input) => ipcRenderer.invoke(PERMISSION_UPDATE_POLICY_SET_CHANNEL, input),
    bindPolicySet: (input) => ipcRenderer.invoke(PERMISSION_BIND_POLICY_SET_CHANNEL, input),
    resolvePreview: (input) => ipcRenderer.invoke(PERMISSION_RESOLVE_PREVIEW_CHANNEL, input)
  },
  agentProfiles: {
    list: () => ipcRenderer.invoke(AGENT_PROFILE_LIST_CHANNEL),
    get: (id) => ipcRenderer.invoke(AGENT_PROFILE_GET_CHANNEL, id),
    create: (input) => ipcRenderer.invoke(AGENT_PROFILE_CREATE_CHANNEL, input),
    update: (input) => ipcRenderer.invoke(AGENT_PROFILE_UPDATE_CHANNEL, input)
  }
}

contextBridge.exposeInMainWorld('agentSpace', agentSpace)
