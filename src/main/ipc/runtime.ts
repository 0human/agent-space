import { ipcMain } from 'electron'
import type {
  RuntimeCreateInput,
  RuntimeDeleteInput,
  RuntimeImportCommitInput,
  RuntimeImportPreviewInput,
  RuntimeListInput,
  RuntimeTestInput,
  RuntimeUpdateInput
} from '../../shared/api'
import type { RuntimeImportService, RuntimeService } from '../runtime'
import { ValidationError } from '../runtime'
import { fail, ok } from './result'

export const RUNTIME_LIST_CHANNEL = 'runtime:list'
export const RUNTIME_GET_CHANNEL = 'runtime:get'
export const RUNTIME_CREATE_CHANNEL = 'runtime:create'
export const RUNTIME_UPDATE_CHANNEL = 'runtime:update'
export const RUNTIME_DELETE_CHANNEL = 'runtime:delete'
export const RUNTIME_TEST_CHANNEL = 'runtime:test'
export const RUNTIME_IMPORT_PREVIEW_CHANNEL = 'runtime:importPreview'
export const RUNTIME_IMPORT_COMMIT_CHANNEL = 'runtime:importCommit'

function toRuntimeResult<T>(callback: () => T) {
  try {
    return ok(callback())
  } catch (error) {
    if (error instanceof ValidationError) {
      return fail('validation_error', error.message)
    }

    return fail(
      'runtime_error',
      error instanceof Error ? error.message : 'Runtime operation failed.'
    )
  }
}

export function registerRuntimeIpc(
  runtimeService: RuntimeService,
  runtimeImportService: RuntimeImportService
): void {
  ipcMain.handle(RUNTIME_LIST_CHANNEL, (_event, input?: RuntimeListInput) => {
    return toRuntimeResult(() => runtimeService.list(input))
  })

  ipcMain.handle(RUNTIME_GET_CHANNEL, (_event, id: string) => {
    return toRuntimeResult(() => runtimeService.get(id))
  })

  ipcMain.handle(RUNTIME_CREATE_CHANNEL, (_event, input: RuntimeCreateInput) => {
    return toRuntimeResult(() => runtimeService.create(input))
  })

  ipcMain.handle(RUNTIME_UPDATE_CHANNEL, (_event, input: RuntimeUpdateInput) => {
    return toRuntimeResult(() => runtimeService.update(input))
  })

  ipcMain.handle(RUNTIME_DELETE_CHANNEL, (_event, input: RuntimeDeleteInput) => {
    if (input.mode !== 'disable') {
      return fail('unsupported_operation', 'Hard delete is not available yet.')
    }

    return toRuntimeResult(() => runtimeService.disable(input.id))
  })

  ipcMain.handle(RUNTIME_TEST_CHANNEL, async (_event, input: RuntimeTestInput) => {
    try {
      return ok(await runtimeService.test(input))
    } catch (error) {
      if (error instanceof ValidationError) {
        return fail('validation_error', error.message)
      }

      return fail('runtime_error', error instanceof Error ? error.message : 'Runtime test failed.')
    }
  })

  ipcMain.handle(RUNTIME_IMPORT_PREVIEW_CHANNEL, (_event, input: RuntimeImportPreviewInput) => {
    return toRuntimeResult(() => runtimeImportService.preview(input))
  })

  ipcMain.handle(RUNTIME_IMPORT_COMMIT_CHANNEL, (_event, input: RuntimeImportCommitInput) => {
    return toRuntimeResult(() => runtimeImportService.commit(input))
  })
}
