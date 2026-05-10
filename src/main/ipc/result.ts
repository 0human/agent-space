import type { ApiResult } from '../../shared/api'

export function ok<T>(data: T): ApiResult<T> {
  return {
    ok: true,
    data
  }
}

export function fail<T = never>(
  code: string,
  message: string,
  details?: Record<string, unknown>
): ApiResult<T> {
  return {
    ok: false,
    error: {
      code,
      message,
      details,
      recoverable: true
    }
  }
}

export function toApiResult<T>(callback: () => T): ApiResult<T> {
  try {
    return ok(callback())
  } catch (error) {
    return fail(
      'internal_error',
      error instanceof Error ? error.message : 'Unexpected internal error.',
      error instanceof Error ? { name: error.name } : undefined
    )
  }
}
