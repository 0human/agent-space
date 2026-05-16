import { describe, expect, it } from 'vitest'
import { ValidationError } from '../runtime'
import { toSessionResult } from './sessions'

describe('toSessionResult', () => {
  it('unwraps async service results before returning ApiResult data', async () => {
    const result = await toSessionResult(async () => ({
      id: 'run-1',
      status: 'running'
    }))

    expect(result).toEqual({
      ok: true,
      data: {
        id: 'run-1',
        status: 'running'
      }
    })
  })

  it('maps async validation errors to ApiResult errors', async () => {
    const result = await toSessionResult(async () => {
      throw new ValidationError('Runtime not configured.')
    })

    expect(result).toEqual(
      expect.objectContaining({
        ok: false,
        error: expect.objectContaining({
          code: 'validation_error',
          message: 'Runtime not configured.'
        })
      })
    )
  })
})
