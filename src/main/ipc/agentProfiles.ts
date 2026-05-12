import { ipcMain } from 'electron'
import type { AgentProfileCreateInput, AgentProfileUpdateInput } from '../../shared/api'
import type { AgentProfileService } from '../profiles/agentProfileService'
import { ValidationError } from '../runtime'
import { fail, ok } from './result'

export const AGENT_PROFILE_LIST_CHANNEL = 'agentProfile:list'
export const AGENT_PROFILE_GET_CHANNEL = 'agentProfile:get'
export const AGENT_PROFILE_CREATE_CHANNEL = 'agentProfile:create'
export const AGENT_PROFILE_UPDATE_CHANNEL = 'agentProfile:update'

function toAgentProfileResult<T>(callback: () => T) {
  try {
    return ok(callback())
  } catch (error) {
    if (error instanceof ValidationError) {
      return fail('validation_error', error.message)
    }

    return fail(
      'agent_profile_error',
      error instanceof Error ? error.message : 'Agent Profile operation failed.'
    )
  }
}

export function registerAgentProfileIpc(agentProfileService: AgentProfileService): void {
  ipcMain.handle(AGENT_PROFILE_LIST_CHANNEL, () => {
    return toAgentProfileResult(() => agentProfileService.list())
  })

  ipcMain.handle(AGENT_PROFILE_GET_CHANNEL, (_event, id: string) => {
    return toAgentProfileResult(() => agentProfileService.get(id))
  })

  ipcMain.handle(AGENT_PROFILE_CREATE_CHANNEL, (_event, input: AgentProfileCreateInput) => {
    return toAgentProfileResult(() => agentProfileService.create(input))
  })

  ipcMain.handle(AGENT_PROFILE_UPDATE_CHANNEL, (_event, input: AgentProfileUpdateInput) => {
    return toAgentProfileResult(() => agentProfileService.update(input))
  })
}
