// @vitest-environment node

import { describe, expect, it } from 'vitest'

import { detectLifecycleScriptsRisk, normalizeSkillPackageManifest, parseSkillSource, validateSkillPackageManifest } from './skill-package'

const skill = {
  name: 'sample',
  version: '1.2.3',
  entry: 'skills/sample/SKILL.md',
  dependencies: [],
  supportedRuntimes: ['codex'],
  capabilities: ['question'],
  requiredPermissions: ['workspace.read']
}

describe('Skill Package contract', () => {
  it('parses all supported source forms without changing the user supplied location', () => {
    expect(parseSkillSource('/tmp/package')).toEqual({ type: 'local-directory', value: '/tmp/package' })
    expect(parseSkillSource('/tmp/package.zip')).toEqual({ type: 'archive', value: '/tmp/package.zip' })
    expect(parseSkillSource('npm:@scope/sample@1.2.3')).toEqual({ type: 'npm', value: '@scope/sample@1.2.3' })
    expect(parseSkillSource('npx:sample@1.2.3')).toEqual({ type: 'npx', value: 'sample@1.2.3' })
    expect(parseSkillSource('https://github.com/example/sample.git')).toEqual({ type: 'git', value: 'https://github.com/example/sample.git' })
  })

  it('normalizes a package manifest and validates its Skill entries against the package tree', () => {
    const manifest = normalizeSkillPackageManifest({ name: 'sample-package', version: '1.2.3', skills: [skill] })
    expect(manifest).toMatchObject({ schemaVersion: 1, name: 'sample-package', skills: [skill] })
    expect(validateSkillPackageManifest(manifest, (entry) => entry === skill.entry)).toEqual({ valid: true, errors: [], warnings: [] })
  })

  it('rejects unsafe entries and malformed metadata instead of accepting a partial package', () => {
    const result = validateSkillPackageManifest({ name: 'bad', version: 'latest', skills: [{ ...skill, entry: '../SKILL.md', supportedRuntimes: [] }] })
    expect(result.valid).toBe(false)
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.stringContaining('version'),
      expect.stringContaining('安全'),
      expect.stringContaining('supportedRuntimes')
    ]))
    expect(validateSkillPackageManifest({ schemaVersion: 1, name: 'bad', version: '1.0.0', skills: [{ ...skill, dependencies: ['ok', 42] }] })).toMatchObject({ valid: false, errors: [expect.stringContaining('dependencies')] })
  })

  it('accepts a custom source type when a matching installer is registered', () => {
    expect(parseSkillSource('registry://example/skill', 'custom-registry')).toEqual({ type: 'custom-registry', value: 'registry://example/skill' })
  })

  it('makes npm lifecycle execution risk visible while keeping local and Git sources explicit', () => {
    expect(detectLifecycleScriptsRisk({ type: 'npm', value: 'sample' })).toEqual([expect.stringContaining('lifecycle scripts')])
    expect(detectLifecycleScriptsRisk({ type: 'git', value: 'https://example.test/repo.git' })).toEqual([])
  })
})
