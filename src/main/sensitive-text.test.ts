// @vitest-environment node

import { describe, expect, it } from 'vitest'

import { sanitizeSensitivePath, sanitizeSensitiveText, sanitizeSensitiveValue } from './sensitive-text'

describe('sensitive text sanitization', () => {
  it('redacts credentials in text and JSON-shaped values', () => {
    const text = '{"token":"json-secret","clientSecret":"client-secret","clientApiKey":"client-api-secret","OPENAI_API_KEY":"openai-secret","HOME":"/private/home","idempotencyKey":"stable-event-key"}'

    expect(sanitizeSensitiveText(text)).toBe('{"token":"<redacted>","clientSecret":"<redacted>","clientApiKey":"<redacted>","OPENAI_API_KEY":"<redacted>","HOME":"<redacted>","idempotencyKey":"stable-event-key"}')
    expect(sanitizeSensitiveText(text)).not.toMatch(/json-secret|client-secret|client-api-secret|openai-secret|\/private\/home/)
  })

  it('redacts nested values using their field names and sensitive paths', () => {
    expect(sanitizeSensitiveValue({
      token: 'nested-secret',
      details: { clientSecret: 'client-secret' },
      environment: { OPENAI_API_KEY: 'openai-secret' },
      idempotencyKey: 'stable-event-key',
      allowedPaths: ['/work/project/.env.local', '/work/project/src/index.ts']
    })).toEqual({
      token: '<redacted>',
      details: { clientSecret: '<redacted>' },
      environment: { OPENAI_API_KEY: '<redacted>' },
      idempotencyKey: 'stable-event-key',
      allowedPaths: ['<redacted path>', '/work/project/src/index.ts']
    })
  })

  it('redacts credential files while preserving ordinary and HTTP paths', () => {
    expect(sanitizeSensitivePath('/work/project/.ssh/id_rsa')).toBe('<redacted path>')
    expect(sanitizeSensitivePath('file:///work/project/.env')).toBe('<redacted path>')
    expect(sanitizeSensitivePath('https://github.com/example/project/issues/42')).toBe('https://github.com/example/project/issues/42')
    expect(sanitizeSensitivePath('/work/project/src/index.ts')).toBe('/work/project/src/index.ts')
  })
})
