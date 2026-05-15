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
import {
  SESSION_ADD_MESSAGE_CHANNEL,
  SESSION_ARCHIVE_CHANNEL,
  SESSION_CREATE_CHANNEL,
  SESSION_CHANGED_CHANNEL,
  SESSION_GET_CHANNEL,
  SESSION_LIST_CHANNEL,
  SESSION_LIST_EVENTS_CHANNEL,
  SESSION_LIST_MESSAGES_CHANNEL,
  SESSION_LIST_RUNS_CHANNEL,
  SESSION_SEND_MESSAGE_CHANNEL,
  SESSION_STOP_RUN_CHANNEL,
  SESSION_UPDATE_CHANNEL
} from '../main/ipc/sessions'
import {
  PROJECT_ARCHIVE_CHANNEL,
  PROJECT_CREATE_CHANNEL,
  PROJECT_GET_CHANNEL,
  PROJECT_LIST_CHANNEL,
  PROJECT_UPDATE_CHANNEL
} from '../main/ipc/projects'
import {
  TEAM_CREATE_CHANNEL,
  TEAM_GET_CHANNEL,
  TEAM_LIST_CHANNEL,
  TEAM_UPDATE_CHANNEL
} from '../main/ipc/teams'

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
  },
  teams: {
    list: () => ipcRenderer.invoke(TEAM_LIST_CHANNEL),
    get: (id) => ipcRenderer.invoke(TEAM_GET_CHANNEL, id),
    create: (input) => ipcRenderer.invoke(TEAM_CREATE_CHANNEL, input),
    update: (input) => ipcRenderer.invoke(TEAM_UPDATE_CHANNEL, input)
  },
  projects: {
    list: (input) => ipcRenderer.invoke(PROJECT_LIST_CHANNEL, input),
    get: (id) => ipcRenderer.invoke(PROJECT_GET_CHANNEL, id),
    create: (input) => ipcRenderer.invoke(PROJECT_CREATE_CHANNEL, input),
    update: (input) => ipcRenderer.invoke(PROJECT_UPDATE_CHANNEL, input),
    archive: (input) => ipcRenderer.invoke(PROJECT_ARCHIVE_CHANNEL, input)
  },
  sessions: {
    list: (input) => ipcRenderer.invoke(SESSION_LIST_CHANNEL, input),
    get: (id) => ipcRenderer.invoke(SESSION_GET_CHANNEL, id),
    create: (input) => ipcRenderer.invoke(SESSION_CREATE_CHANNEL, input),
    update: (input) => ipcRenderer.invoke(SESSION_UPDATE_CHANNEL, input),
    archive: (input) => ipcRenderer.invoke(SESSION_ARCHIVE_CHANNEL, input),
    listMessages: (input) => ipcRenderer.invoke(SESSION_LIST_MESSAGES_CHANNEL, input),
    addMessage: (input) => ipcRenderer.invoke(SESSION_ADD_MESSAGE_CHANNEL, input),
    sendMessage: (input) => ipcRenderer.invoke(SESSION_SEND_MESSAGE_CHANNEL, input),
    stopRun: (input) => ipcRenderer.invoke(SESSION_STOP_RUN_CHANNEL, input),
    listRuns: (workSessionId) => ipcRenderer.invoke(SESSION_LIST_RUNS_CHANNEL, workSessionId),
    listEvents: (runId) => ipcRenderer.invoke(SESSION_LIST_EVENTS_CHANNEL, runId),
    onChanged: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, payload: unknown) => {
        callback(payload as Parameters<typeof callback>[0])
      }
      ipcRenderer.on(SESSION_CHANGED_CHANNEL, listener)
      return () => ipcRenderer.off(SESSION_CHANGED_CHANNEL, listener)
    }
  }
}

contextBridge.exposeInMainWorld('agentSpace', agentSpace)
