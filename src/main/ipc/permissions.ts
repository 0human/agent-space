import { ipcMain } from 'electron'
import type {
  PermissionPolicyBindingInput,
  PermissionPolicySetCreateInput,
  PermissionPolicySetUpdateInput,
  PermissionResolvePreviewInput
} from '../../shared/api'
import type { PermissionService } from '../permissions/permissionService'
import { ValidationError } from '../runtime'
import { fail, ok } from './result'

export const PERMISSION_LIST_POLICY_SETS_CHANNEL = 'permission:listPolicySets'
export const PERMISSION_GET_POLICY_SET_CHANNEL = 'permission:getPolicySet'
export const PERMISSION_CREATE_POLICY_SET_CHANNEL = 'permission:createPolicySet'
export const PERMISSION_UPDATE_POLICY_SET_CHANNEL = 'permission:updatePolicySet'
export const PERMISSION_BIND_POLICY_SET_CHANNEL = 'permission:bindPolicySet'
export const PERMISSION_RESOLVE_PREVIEW_CHANNEL = 'permission:resolvePreview'

function toPermissionResult<T>(callback: () => T) {
  try {
    return ok(callback())
  } catch (error) {
    if (error instanceof ValidationError) {
      return fail('validation_error', error.message)
    }

    return fail(
      'permission_error',
      error instanceof Error ? error.message : 'Permission operation failed.'
    )
  }
}

export function registerPermissionIpc(permissionService: PermissionService): void {
  ipcMain.handle(PERMISSION_LIST_POLICY_SETS_CHANNEL, () => {
    return toPermissionResult(() => permissionService.listPolicySets())
  })

  ipcMain.handle(PERMISSION_GET_POLICY_SET_CHANNEL, (_event, id: string) => {
    return toPermissionResult(() => permissionService.getPolicySet(id))
  })

  ipcMain.handle(
    PERMISSION_CREATE_POLICY_SET_CHANNEL,
    (_event, input: PermissionPolicySetCreateInput) => {
      return toPermissionResult(() => permissionService.createPolicySet(input))
    }
  )

  ipcMain.handle(
    PERMISSION_UPDATE_POLICY_SET_CHANNEL,
    (_event, input: PermissionPolicySetUpdateInput) => {
      return toPermissionResult(() => permissionService.updatePolicySet(input))
    }
  )

  ipcMain.handle(
    PERMISSION_BIND_POLICY_SET_CHANNEL,
    (_event, input: PermissionPolicyBindingInput) => {
      return toPermissionResult(() => permissionService.bindPolicySet(input))
    }
  )

  ipcMain.handle(
    PERMISSION_RESOLVE_PREVIEW_CHANNEL,
    (_event, input: PermissionResolvePreviewInput) => {
      return toPermissionResult(() => permissionService.resolvePreview(input))
    }
  )
}
