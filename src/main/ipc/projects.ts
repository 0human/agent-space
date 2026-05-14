import { ipcMain } from 'electron'
import type {
  ProjectArchiveInput,
  ProjectCreateInput,
  ProjectListInput,
  ProjectUpdateInput
} from '../../shared/api'
import type { ProjectService } from '../projects/projectService'
import { ValidationError } from '../runtime'
import { fail, ok } from './result'

export const PROJECT_LIST_CHANNEL = 'project:list'
export const PROJECT_GET_CHANNEL = 'project:get'
export const PROJECT_CREATE_CHANNEL = 'project:create'
export const PROJECT_UPDATE_CHANNEL = 'project:update'
export const PROJECT_ARCHIVE_CHANNEL = 'project:archive'

function toProjectResult<T>(callback: () => T) {
  try {
    return ok(callback())
  } catch (error) {
    if (error instanceof ValidationError) {
      return fail('validation_error', error.message)
    }
    return fail(
      'project_error',
      error instanceof Error ? error.message : 'Project operation failed.'
    )
  }
}

export function registerProjectIpc(projectService: ProjectService): void {
  ipcMain.handle(PROJECT_LIST_CHANNEL, (_event, input?: ProjectListInput) =>
    toProjectResult(() => projectService.list(input))
  )
  ipcMain.handle(PROJECT_GET_CHANNEL, (_event, id: string) =>
    toProjectResult(() => projectService.get(id))
  )
  ipcMain.handle(PROJECT_CREATE_CHANNEL, (_event, input: ProjectCreateInput) =>
    toProjectResult(() => projectService.create(input))
  )
  ipcMain.handle(PROJECT_UPDATE_CHANNEL, (_event, input: ProjectUpdateInput) =>
    toProjectResult(() => projectService.update(input))
  )
  ipcMain.handle(PROJECT_ARCHIVE_CHANNEL, (_event, input: ProjectArchiveInput) =>
    toProjectResult(() => projectService.archive(input))
  )
}
