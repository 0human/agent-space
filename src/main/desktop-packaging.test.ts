// @vitest-environment node

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('Desktop packaging contract', () => {
  it('builds installable targets for every supported desktop platform', () => {
    const config = readFileSync(resolve(process.cwd(), 'electron-builder.yml'), 'utf8')

    expect(config).toContain('mac:')
    expect(config).toContain('    - dmg')
    expect(config).toContain('linux:')
    expect(config).toContain('    - AppImage')
    expect(config).toContain('win:')
    expect(config).toContain('    - nsis')
  })

  it('ships the versioned built-in Skill Package outside the asar bundle', () => {
    const config = readFileSync(resolve(process.cwd(), 'electron-builder.yml'), 'utf8')

    expect(config).toContain('extraResources:')
    expect(config).toContain('  - from: .agents')
    expect(config).toContain('    to: .agents')
  })
})
