import { ipcMain } from 'electron'
import type {
  MessageCreateInput,
  MessageListInput,
  SessionSendMessageInput,
  SessionStopRunInput,
  WorkSessionArchiveInput,
  WorkSessionCreateInput,
  WorkSessionListInput,
  WorkSessionUpdateInput
} from '../../shared/api'
import type { SessionService } from '../sessions/sessionService'
import { ValidationError } from '../runtime'
import { fail, ok } from './result'

export const SESSION_LIST_CHANNEL = 'session:list'
export const SESSION_GET_CHANNEL = 'session:get'
export const SESSION_CREATE_CHANNEL = 'session:create'
export const SESSION_UPDATE_CHANNEL = 'session:update'
export const SESSION_ARCHIVE_CHANNEL = 'session:archive'
export const SESSION_LIST_MESSAGES_CHANNEL = 'session:listMessages'
export const SESSION_ADD_MESSAGE_CHANNEL = 'session:addMessage'
export const SESSION_SEND_MESSAGE_CHANNEL = 'session:sendMessage'
export const SESSION_STOP_RUN_CHANNEL = 'session:stopRun'
export const SESSION_LIST_RUNS_CHANNEL = 'session:listRuns'
export const SESSION_LIST_EVENTS_CHANNEL = 'session:listEvents'

function toSessionResult<T>(callback: () => T) {
  try {
    return ok(callback())
  } catch (error) {
    if (error instanceof ValidationError) {
      return fail('validation_error', error.message)
    }
    return fail(
      'session_error',
      error instanceof Error ? error.message : 'Session operation failed.'
    )
  }
}

export function registerSessionIpc(sessionService: SessionService): void {
  ipcMain.handle(SESSION_LIST_CHANNEL, (_event, input?: WorkSessionListInput) =>
    toSessionResult(() => sessionService.list(input))
  )
  ipcMain.handle(SESSION_GET_CHANNEL, (_event, id: string) =>
    toSessionResult(() => sessionService.get(id))
  )
  ipcMain.handle(SESSION_CREATE_CHANNEL, (_event, input: WorkSessionCreateInput) =>
    toSessionResult(() => sessionService.create(input))
  )
  ipcMain.handle(SESSION_UPDATE_CHANNEL, (_event, input: WorkSessionUpdateInput) =>
    toSessionResult(() => sessionService.update(input))
  )
  ipcMain.handle(SESSION_ARCHIVE_CHANNEL, (_event, input: WorkSessionArchiveInput) =>
    toSessionResult(() => sessionService.archive(input))
  )
  ipcMain.handle(SESSION_LIST_MESSAGES_CHANNEL, (_event, input: MessageListInput) =>
    toSessionResult(() => sessionService.listMessages(input))
  )
  ipcMain.handle(SESSION_ADD_MESSAGE_CHANNEL, (_event, input: MessageCreateInput) =>
    toSessionResult(() => sessionService.addMessage(input))
  )
  ipcMain.handle(SESSION_SEND_MESSAGE_CHANNEL, (_event, input: SessionSendMessageInput) =>
    toSessionResult(() => sessionService.sendMessage(input))
  )
  ipcMain.handle(SESSION_STOP_RUN_CHANNEL, (_event, input: SessionStopRunInput) =>
    toSessionResult(() => sessionService.stopRun(input))
  )
  ipcMain.handle(SESSION_LIST_RUNS_CHANNEL, (_event, workSessionId: string) =>
    toSessionResult(() => sessionService.listRuns(workSessionId))
  )
  ipcMain.handle(SESSION_LIST_EVENTS_CHANNEL, (_event, runId: string) =>
    toSessionResult(() => sessionService.listEvents(runId))
  )
}
