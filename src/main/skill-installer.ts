import { execFile as execFileCallback } from 'node:child_process'
import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import { access, cp, mkdir, mkdtemp, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { extname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { promisify } from 'node:util'

import type { SkillManifest } from '../shared/workflow'
import {
  detectLifecycleScriptsRisk,
  normalizeSkillPackageManifest,
  type InstalledSkillRecord,
  type SkillInstallPreview,
  type SkillPackageManifest,
  type SkillSource,
  type SkillSourceType,
  validateSkillPackageManifest
} from '../shared/skill-package'

const execFile = promisify(execFileCallback)

export interface ResolvedSkillPackage {
  rootPath: string
  manifest: SkillPackageManifest
  resolvedVersion?: string
  lifecycleScripts?: string[]
  cleanup?: () => Promise<void>
}

export interface SkillSourceInstaller {
  type: SkillSourceType
  resolve: (source: SkillSource) => Promise<ResolvedSkillPackage>
}

export interface SkillInstallerDependencies {
  rootPath: string
  now?: () => string
  readInstalled?: () => Promise<InstalledSkillRecord[]>
  writeInstalled?: (records: InstalledSkillRecord[]) => Promise<void>
  installers?: SkillSourceInstaller[]
  readFile?: (path: string, encoding: 'utf8') => Promise<string>
  copyDirectory?: (source: string, destination: string) => Promise<void>
  contentHash?: (path: string) => Promise<string>
  makeDirectory?: (path: string, options: { recursive: true }) => Promise<void>
  rename?: (source: string, destination: string) => Promise<void>
  remove?: (path: string) => Promise<void>
}

export interface SkillInstallOptions {
  confirmed?: boolean
  confirm?: (preview: SkillInstallPreview) => Promise<boolean> | boolean
}

async function findPackageRoot(rootPath: string): Promise<string> {
  const direct = join(rootPath, 'skill-manifest.json')
  try {
    await access(direct, constants.R_OK)
    return rootPath
  } catch {
    const entries = await readdir(rootPath, { withFileTypes: true })
    const directories = entries.filter((entry) => entry.isDirectory() && !entry.name.startsWith('.')).map((entry) => join(rootPath, entry.name))
    for (const directory of directories) {
      try {
        await access(join(directory, 'skill-manifest.json'), constants.R_OK)
        return directory
      } catch {
        // Continue looking for the package root in a single top-level folder.
      }
    }
    throw new Error('Skill Package 缺少 skill-manifest.json。')
  }
}

async function readManifest(rootPath: string, read: (path: string, encoding: 'utf8') => Promise<string>): Promise<SkillPackageManifest> {
  let raw: unknown
  try {
    raw = JSON.parse(await read(join(rootPath, 'skill-manifest.json'), 'utf8'))
  } catch (error) {
    throw new Error(`无法读取 Skill Package manifest：${error instanceof Error ? error.message : String(error)}`)
  }
  const validation = validateSkillPackageManifest(raw, (entry) => {
    const entryPath = resolve(rootPath, entry)
    const packageRootResolved = resolve(rootPath)
    const entryRelative = relative(packageRootResolved, entryPath)
    return !isAbsolute(entryRelative) && entryRelative !== '..' && !entryRelative.startsWith(`..${sep}`)
  })
  if (!validation.valid) throw new Error(`Skill Package 校验失败：${validation.errors.join(' ')}`)
  const manifest = normalizeSkillPackageManifest(raw)
  for (const skill of manifest.skills) {
    try {
      const entryPath = resolve(rootPath, skill.entry)
      const entryStat = await stat(entryPath)
      if (!entryStat.isFile()) throw new Error('不是文件')
    } catch {
      throw new Error(`Skill ${skill.name} entry 不存在：${skill.entry}。`)
    }
  }
  return manifest
}

async function contentHash(rootPath: string): Promise<string> {
  const hash = createHash('sha256')
  const visit = async (directory: string): Promise<void> => {
    const entries = (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))
    for (const entry of entries) {
      if (entry.name === '.git' || entry.name === 'node_modules') continue
      const path = join(directory, entry.name)
      const name = relative(rootPath, path).replaceAll('\\', '/')
      hash.update(name)
      if (entry.isSymbolicLink()) throw new Error(`Skill Package 不允许 symbolic link：${name}。`)
      if (entry.isDirectory()) await visit(path)
      else hash.update(await readFile(path))
    }
  }
  await visit(rootPath)
  return hash.digest('hex')
}

async function extractArchive(archive: string, destination: string): Promise<void> {
  const listingCommand = extname(archive).toLowerCase() === '.zip' ? 'unzip' : 'tar'
  try {
    if (listingCommand === 'unzip') {
      const listed = await execFile('unzip', ['-Z1', archive], { encoding: 'utf8' })
      assertSafeArchiveEntries(listed.stdout.split(/\r?\n/).filter(Boolean))
      await execFile('unzip', ['-q', archive, '-d', destination], { encoding: 'utf8' })
    } else {
      const listed = await execFile('tar', ['-tf', archive], { encoding: 'utf8' })
      assertSafeArchiveEntries(listed.stdout.split(/\r?\n/).filter(Boolean))
      await execFile('tar', ['-xf', archive, '-C', destination, '--no-same-owner', '--no-same-permissions'], { encoding: 'utf8' })
    }
  } catch (error) {
    throw new Error(`无法解压 Skill Package：${error instanceof Error ? error.message : String(error)}`)
  }
}

function assertSafeArchiveEntries(entries: string[]): void {
  if (entries.some((entry) => entry.startsWith('/') || entry.startsWith('\\') || entry.split(/[\\/]/).includes('..'))) throw new Error('Skill Package archive 包含不安全路径。')
}

async function resolvedDirectory(directory: string, lifecycleScripts: string[] = []): Promise<ResolvedSkillPackage> {
  const rootPath = await findPackageRoot(directory)
  const manifest = await readManifest(rootPath, (path, encoding) => readFile(path, encoding))
  return { rootPath, manifest, resolvedVersion: manifest.version, lifecycleScripts, cleanup: async () => undefined }
}

export function createDefaultSkillInstallers(): SkillSourceInstaller[] {
  return [
    {
      type: 'local-directory',
      resolve: async (source) => resolvedDirectory(source.value)
    },
    {
      type: 'archive',
      resolve: async (source) => {
        const directory = await mkdtemp(join(tmpdir(), 'agent-space-skill-archive-'))
        try {
          await extractArchive(source.value, directory)
          const result = await resolvedDirectory(directory)
          return { ...result, cleanup: () => rm(directory, { recursive: true, force: true }) }
        } catch (error) {
          await rm(directory, { recursive: true, force: true }).catch(() => undefined)
          throw error
        }
      }
    },
    ...(['npm', 'npx'] as const).map((type): SkillSourceInstaller => ({
      type,
      resolve: async (source) => {
        const directory = await mkdtemp(join(tmpdir(), 'agent-space-skill-npm-'))
        try {
          const packageName = source.value.replace(/^npx:/, '').replace(/^npm:/, '')
          const packed = await execFile('npm', ['pack', packageName, '--ignore-scripts', '--json', '--pack-destination', directory], { encoding: 'utf8' })
          const jsonStart = packed.stdout.indexOf('[')
          const metadata = JSON.parse(jsonStart >= 0 ? packed.stdout.slice(jsonStart) : packed.stdout) as Array<{ filename?: string; version?: string }>
          const filename = metadata[0]?.filename
          if (!filename) throw new Error('npm pack 没有返回 tarball。')
          await extractArchive(join(directory, filename), directory)
          const result = await resolvedDirectory(directory)
          return { ...result, resolvedVersion: metadata[0]?.version ?? result.manifest.version, cleanup: () => rm(directory, { recursive: true, force: true }) }
        } catch (error) {
          await rm(directory, { recursive: true, force: true }).catch(() => undefined)
          throw new Error(`无法解析 ${type} Skill Source：${error instanceof Error ? error.message : String(error)}`)
        }
      }
    })),
    {
      type: 'git',
      resolve: async (source) => {
        const directory = await mkdtemp(join(tmpdir(), 'agent-space-skill-git-'))
        try {
          await execFile('git', ['clone', '--depth', '1', source.value, directory], { encoding: 'utf8' })
          const revision = await execFile('git', ['-C', directory, 'rev-parse', 'HEAD'], { encoding: 'utf8' })
          const result = await resolvedDirectory(directory)
          return { ...result, resolvedVersion: `${result.manifest.version}+${revision.stdout.trim().slice(0, 12)}`, cleanup: () => rm(directory, { recursive: true, force: true }) }
        } catch (error) {
          await rm(directory, { recursive: true, force: true }).catch(() => undefined)
          throw new Error(`无法解析 Git Skill Source：${error instanceof Error ? error.message : String(error)}`)
        }
      }
    }
  ]
}

export function createSkillInstaller(dependencies: SkillInstallerDependencies) {
  const now = dependencies.now ?? (() => new Date().toISOString())
  const read = dependencies.readFile ?? ((path, encoding: 'utf8') => readFile(path, encoding))
  const makeDirectory = dependencies.makeDirectory ?? ((path, options: { recursive: true }) => mkdir(path, options))
  const copyDirectory = dependencies.copyDirectory ?? ((source, destination) => cp(source, destination, { recursive: true }))
  const move = dependencies.rename ?? rename
  const remove = dependencies.remove ?? ((path) => rm(path, { recursive: true, force: true }))
  const hash = dependencies.contentHash ?? contentHash
  const metadataPath = join(dependencies.rootPath, 'installed-skills.json')
  const packageDirectory = join(dependencies.rootPath, 'packages')
  const installers = new Map((dependencies.installers ?? createDefaultSkillInstallers()).map((installer) => [installer.type, installer]))
  let records: InstalledSkillRecord[] | null = null

  const load = async (): Promise<InstalledSkillRecord[]> => {
    if (records) return records
    if (dependencies.readInstalled) records = await dependencies.readInstalled()
    else {
      try {
        records = JSON.parse(await read(metadataPath, 'utf8')) as InstalledSkillRecord[]
      } catch {
        records = []
      }
    }
    return records
  }

  const persist = async (): Promise<void> => {
    const current = await load()
    if (dependencies.writeInstalled) return dependencies.writeInstalled(current)
    await makeDirectory(dependencies.rootPath, { recursive: true })
    const temporary = `${metadataPath}.tmp-${Date.now()}`
    try {
      await writeFile(temporary, JSON.stringify(current, null, 2), 'utf8')
      await move(temporary, metadataPath)
    } catch (error) {
      await remove(temporary).catch(() => undefined)
      throw error
    }
  }

  const resolveSource = async (source: SkillSource): Promise<{ preview: SkillInstallPreview; packagePath: string; cleanup: () => Promise<void> }> => {
    const installer = installers.get(source.type)
    if (!installer) throw new Error(`没有可用的 Skill Source installer：${source.type}。`)
    const resolved = await installer.resolve(source)
    const preview: SkillInstallPreview = {
      source,
      manifest: resolved.manifest,
      resolvedVersion: resolved.resolvedVersion ?? resolved.manifest.version,
      contentHash: await hash(resolved.rootPath),
      lifecycleScriptsRisk: detectLifecycleScriptsRisk(source, resolved.lifecycleScripts ?? []),
      warnings: []
    }
    return { preview, packagePath: resolved.rootPath, cleanup: resolved.cleanup ?? (async () => undefined) }
  }

  return {
    async preview(source: SkillSource): Promise<SkillInstallPreview> {
      const resolved = await resolveSource(source)
      await resolved.cleanup()
      return resolved.preview
    },

    async install(source: SkillSource, options: SkillInstallOptions = {}): Promise<InstalledSkillRecord | null> {
      const resolved = await resolveSource(source)
      try {
        const confirmed = options.confirmed === true || (options.confirm ? await options.confirm(resolved.preview) : false)
        if (!confirmed) return null
        const current = await load()
        const existing = current.find((record) => record.manifest.name === resolved.preview.manifest.name && record.resolvedVersion === resolved.preview.resolvedVersion && record.contentHash === resolved.preview.contentHash)
        if (existing) return existing
        await makeDirectory(packageDirectory, { recursive: true })
        const safeName = `${resolved.preview.manifest.name}@${resolved.preview.resolvedVersion}`.replace(/[^a-zA-Z0-9._@+-]/g, '_')
        const finalPath = join(packageDirectory, `${safeName}-${resolved.preview.contentHash.slice(0, 12)}`)
        const stagingPath = `${finalPath}.staging-${Date.now()}`
        try {
          await copyDirectory(resolved.packagePath, stagingPath)
        } catch (error) {
          await remove(stagingPath).catch(() => undefined)
          throw error
        }
        try {
          await move(stagingPath, finalPath)
        } catch (error) {
          await remove(stagingPath).catch(() => undefined)
          throw error
        }
        const record: InstalledSkillRecord = { ...resolved.preview, installedPath: finalPath, installedAt: now() }
        current.push(record)
        try {
          await persist()
        } catch (error) {
          current.splice(current.indexOf(record), 1)
          await remove(finalPath).catch(() => undefined)
          throw error
        }
        records = current
        return record
      } finally {
        await resolved.cleanup().catch(() => undefined)
      }
    },

    async listInstalled(): Promise<InstalledSkillRecord[]> {
      return structuredClone(await load())
    },

    async getManifests(): Promise<SkillManifest[]> {
      const installed = await load()
      return installed.flatMap((record) => record.manifest.skills)
    },

    async find(name: string, version: string): Promise<InstalledSkillRecord | null> {
      return (await load()).find((record) => record.manifest.skills.some((skill) => skill.name === name && skill.version === version)) ?? null
    }
  }
}
