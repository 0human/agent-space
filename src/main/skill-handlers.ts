import { APP_SHELL_CHANNELS } from '../shared/app-shell'
import { summarizeSkillPackage, type SkillInstallPreview, type SkillSource } from '../shared/skill-package'

interface SkillInstaller {
  preview: (source: SkillSource) => Promise<SkillInstallPreview>
  install: (source: SkillSource, options: { confirmed: boolean }) => Promise<unknown>
  listInstalled: () => Promise<unknown[]>
}

interface SkillHandlerDependencies {
  handle: (channel: string, listener: (...args: unknown[]) => unknown) => void
  dialog: {
    showMessageBox: (options: {
      type: 'warning'
      buttons: string[]
      defaultId: number
      cancelId: number
      title: string
      message: string
      detail: string
    }) => Promise<{ response: number }>
  }
  installer: SkillInstaller
  onInstalled?: () => Promise<void> | void
}

function sourceFrom(value: unknown): SkillSource {
  if (!value || typeof value !== 'object' || typeof (value as Record<string, unknown>).type !== 'string' || typeof (value as Record<string, unknown>).value !== 'string') throw new Error('Skill Source 格式无效。')
  return { type: (value as Record<string, unknown>).type as SkillSource['type'], value: (value as Record<string, unknown>).value as string }
}

function previewDetail(preview: SkillInstallPreview): string {
  const summary = summarizeSkillPackage(preview.manifest)
  const skills = summary.skills.join(', ')
  const dependencies = summary.dependencies.join(', ') || '无'
  const permissions = summary.requiredPermissions.join(', ') || '无'
  const runtimes = summary.supportedRuntimes.join(', ') || '无'
  const lifecycle = preview.lifecycleScriptsRisk.length > 0 ? preview.lifecycleScriptsRisk.join(' ') : '无'
  return [`来源：${preview.source.type} ${preview.source.value}`, `解析版本：${preview.resolvedVersion}`, `Skills：${skills}`, `依赖：${dependencies}`, `兼容 Runtime：${runtimes}`, `所需权限：${permissions}`, `生命周期脚本风险：${lifecycle}`, `内容 hash：${preview.contentHash}`].join('\n')
}

function needsNetworkNotice(source: SkillSource): boolean {
  return source.type === 'npm' || source.type === 'npx' || source.type === 'git'
}

async function showNetworkNotice(dialog: SkillHandlerDependencies['dialog'], source: SkillSource): Promise<boolean> {
  if (!needsNetworkNotice(source)) return true
  const result = await dialog.showMessageBox({
    type: 'warning',
    buttons: ['继续解析', '取消'],
    defaultId: 1,
    cancelId: 1,
    title: 'Data Transfer Notice',
    message: '即将从外部 Skill Source 获取 package；Agent Space 不对第三方来源做安全背书。',
    detail: [`External Destination：${source.value}`, '数据：Skill Package manifest、SKILL.md 和 package 内容；npm/npx 可能暴露 registry 请求 metadata。', '权限：network；安装器不会执行 package lifecycle scripts。', '断网恢复：取消当前解析；网络恢复后可重新 preview，已安装 Skill 不会被覆盖。'].join('\n')
  })
  return result.response === 0
}

export function registerSkillHandlers({ handle, dialog, installer, onInstalled }: SkillHandlerDependencies): void {
  handle(APP_SHELL_CHANNELS.previewSkillInstall, async (_event: unknown, value: unknown) => {
    const source = sourceFrom(value)
    if (!await showNetworkNotice(dialog, source)) throw new Error('Skill Source 网络传输未获确认。')
    return installer.preview(source)
  })
  handle(APP_SHELL_CHANNELS.listInstalledSkills, () => installer.listInstalled())
  handle(APP_SHELL_CHANNELS.installSkill, async (_event: unknown, value: unknown) => {
    const source = sourceFrom(value)
    if (!await showNetworkNotice(dialog, source)) return null
    const preview = await installer.preview(source)
    const confirmation = await dialog.showMessageBox({
      type: 'warning',
      buttons: ['确认安装', '取消'],
      defaultId: 1,
      cancelId: 1,
      title: '确认安装 Skill Package',
      message: '请确认 Skill Source 和权限风险；Agent Space 不对第三方来源做安全背书。',
      detail: previewDetail(preview)
    })
    if (confirmation.response !== 0) return null
    const installed = await installer.install(source, { confirmed: true })
    if (installed) await onInstalled?.()
    return installed
  })
}
