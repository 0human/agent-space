import type { SkillManifest } from './workflow'

export const SKILL_SOURCE_TYPES = ['local-directory', 'archive', 'npm', 'npx', 'git'] as const
export type SkillSourceType = typeof SKILL_SOURCE_TYPES[number] | (string & {})

export interface SkillSource {
  type: SkillSourceType
  value: string
}

export interface SkillPackageManifest {
  schemaVersion: 1
  name: string
  version: string
  skills: SkillManifest[]
}

export interface SkillPackageValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
}

export interface SkillInstallPreview {
  source: SkillSource
  manifest: SkillPackageManifest
  resolvedVersion: string
  contentHash: string
  lifecycleScriptsRisk: string[]
  warnings: string[]
}

export interface InstalledSkillRecord extends SkillInstallPreview {
  installedPath: string
  installedAt: string
}

export interface SkillPackageSummary {
  skills: string[]
  dependencies: string[]
  supportedRuntimes: string[]
  requiredPermissions: string[]
}

export function summarizeSkillPackage(manifest: SkillPackageManifest): SkillPackageSummary {
  return {
    skills: manifest.skills.map((skill) => `${skill.name}@${skill.version}`),
    dependencies: [...new Set(manifest.skills.flatMap((skill) => skill.dependencies).filter(Boolean))],
    supportedRuntimes: [...new Set(manifest.skills.flatMap((skill) => skill.supportedRuntimes))],
    requiredPermissions: [...new Set(manifest.skills.flatMap((skill) => skill.requiredPermissions))]
  }
}

export function parseSkillSource(value: string, type?: SkillSourceType): SkillSource {
  const input = value.trim()
  if (!input) throw new Error('Skill Source 不能为空。')
  if (type) {
    return { type, value: input }
  }
  if (/^(?:https?|ssh|git)\+?/.test(input) || input.startsWith('git@') || input.endsWith('.git')) return { type: 'git', value: input }
  if (/^(?:npm|npx):/.test(input)) return { type: input.startsWith('npx:') ? 'npx' : 'npm', value: input.slice(input.indexOf(':') + 1) }
  if (/\.(?:zip|tgz|tar(?:\.gz)?)$/i.test(input)) return { type: 'archive', value: input }
  return { type: 'local-directory', value: input }
}

function validRelativeEntry(entry: string): boolean {
  return Boolean(entry) && !entry.startsWith('/') && !entry.startsWith('\\') && !entry.split(/[\\/]/).includes('..')
}

export function normalizeSkillPackageManifest(value: unknown): SkillPackageManifest {
  const record = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  const rawSkills = Array.isArray(record.skills)
    ? record.skills
    : (typeof record.entry === 'string' ? [record] : [])
  const skills = rawSkills.map((candidate) => {
    const skill = candidate && typeof candidate === 'object' ? candidate as Record<string, unknown> : {}
    return {
      name: typeof skill.name === 'string' ? skill.name : '',
      version: typeof skill.version === 'string' ? skill.version : '',
      entry: typeof skill.entry === 'string' ? skill.entry : '',
      dependencies: Array.isArray(skill.dependencies) ? skill.dependencies.filter((item): item is string => typeof item === 'string') : [],
      supportedRuntimes: Array.isArray(skill.supportedRuntimes) ? skill.supportedRuntimes.filter((item): item is string => typeof item === 'string') : [],
      capabilities: Array.isArray(skill.capabilities) ? skill.capabilities.filter((item): item is string => typeof item === 'string') : [],
      requiredPermissions: Array.isArray(skill.requiredPermissions) ? skill.requiredPermissions.filter((item): item is string => typeof item === 'string') : []
    }
  })
  return {
    schemaVersion: 1,
    name: typeof record.name === 'string' ? record.name : '',
    version: typeof record.version === 'string' ? record.version : '',
    skills
  }
}

export function validateSkillPackageManifest(value: unknown, entryExists?: (entry: string) => boolean): SkillPackageValidationResult {
  const errors: string[] = []
  const warnings: string[] = []
  const record = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  if (record.schemaVersion !== 1) errors.push('Skill Package schemaVersion 必须为 1。')
  const manifest = normalizeSkillPackageManifest(value)
  if (!manifest.name) errors.push('Skill Package manifest 缺少 name。')
  if (!/^\d+\.\d+\.\d+$/.test(manifest.version)) errors.push('Skill Package version 必须使用 x.y.z 格式。')
  if (manifest.skills.length === 0) errors.push('Skill Package 至少需要一个 Skill。')
  const names = new Set<string>()
  for (const skill of manifest.skills) {
    const rawSkill = (Array.isArray(record.skills) ? record.skills.find((candidate) => candidate && typeof candidate === 'object' && (candidate as Record<string, unknown>).name === skill.name) : record) as Record<string, unknown> | undefined
    for (const field of ['dependencies', 'supportedRuntimes', 'capabilities', 'requiredPermissions']) {
      const value = rawSkill?.[field]
      if (value !== undefined && (!Array.isArray(value) || value.some((item) => typeof item !== 'string'))) errors.push(`Skill ${skill.name || '(unknown)'} 的 ${field} 必须是字符串数组。`)
    }
    if (!skill.name) errors.push('Skill manifest 缺少 name。')
    if (names.has(skill.name)) errors.push(`Skill ${skill.name} 重复声明。`)
    names.add(skill.name)
    if (!/^\d+\.\d+\.\d+$/.test(skill.version)) errors.push(`Skill ${skill.name || '(unknown)'} version 必须使用 x.y.z 格式。`)
    if (!validRelativeEntry(skill.entry)) errors.push(`Skill ${skill.name || '(unknown)'} entry 必须是安全的相对路径。`)
    if (entryExists && validRelativeEntry(skill.entry) && !entryExists(skill.entry)) errors.push(`Skill ${skill.name} entry 不存在：${skill.entry}。`)
    if (skill.supportedRuntimes.length === 0) errors.push(`Skill ${skill.name} 必须声明 supportedRuntimes。`)
    const invalidDependencies = skill.dependencies.filter((dependency) => !dependency)
    if (invalidDependencies.length > 0) errors.push(`Skill ${skill.name} dependencies 包含空值。`)
  }
  return { valid: errors.length === 0, errors, warnings }
}

export function detectLifecycleScriptsRisk(source: SkillSource, scripts: string[] = []): string[] {
  if (source.type !== 'npm' && source.type !== 'npx') return scripts
  const risk = ['npm/npx 来源可能执行 package lifecycle scripts；安装器使用 --ignore-scripts，不代表来源安全。']
  return [...risk, ...scripts]
}
