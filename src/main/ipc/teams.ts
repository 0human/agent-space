import { ipcMain } from 'electron'
import type { TeamCreateInput, TeamUpdateInput } from '../../shared/api'
import type { TeamService } from '../teams/teamService'
import { ValidationError } from '../runtime'
import { fail, ok } from './result'

export const TEAM_LIST_CHANNEL = 'team:list'
export const TEAM_GET_CHANNEL = 'team:get'
export const TEAM_CREATE_CHANNEL = 'team:create'
export const TEAM_UPDATE_CHANNEL = 'team:update'

function toTeamResult<T>(callback: () => T) {
  try {
    return ok(callback())
  } catch (error) {
    if (error instanceof ValidationError) {
      return fail('validation_error', error.message)
    }
    return fail('team_error', error instanceof Error ? error.message : 'Team operation failed.')
  }
}

export function registerTeamIpc(teamService: TeamService): void {
  ipcMain.handle(TEAM_LIST_CHANNEL, () => toTeamResult(() => teamService.list()))
  ipcMain.handle(TEAM_GET_CHANNEL, (_event, id: string) => toTeamResult(() => teamService.get(id)))
  ipcMain.handle(TEAM_CREATE_CHANNEL, (_event, input: TeamCreateInput) =>
    toTeamResult(() => teamService.create(input))
  )
  ipcMain.handle(TEAM_UPDATE_CHANNEL, (_event, input: TeamUpdateInput) =>
    toTeamResult(() => teamService.update(input))
  )
}
