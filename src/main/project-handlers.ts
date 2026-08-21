import { join, resolve } from 'node:path'

import { APP_SHELL_CHANNELS } from '../shared/app-shell'
import { zhCNMain as copy } from '../shared/i18n/zh-CN'
import type { GitHubProjectCloneResponse, OpenProjectResult, Project, ProjectImportResult } from '../shared/project'

interface ProjectService {
  list: (filePath: string) => Promise<Project[]>
  inspectDirectory: (workspacePath: string) => Promise<{ dirty: boolean }>
  importDirectory: (filePath: string, workspacePath: string) => Promise<Project>
  findById: (filePath: string, projectId: string) => Promise<Project | null>
  cloneGitHub?: (filePath: string, repositoryUrl: string, destinationPath: string) => Promise<Project>
}

interface ProjectHandlerDependencies {
  handle: (channel: string, listener: (...args: unknown[]) => unknown) => void
  dialog: {
    showOpenDialog: (options: { properties: ('openDirectory' | 'createDirectory')[]; title: string }) => Promise<{
      canceled: boolean
      filePaths: string[]
    }>
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
  openInIde: (path: string) => Promise<void>
  userDataPath: string
  service: ProjectService
}

export function registerProjectHandlers({
  handle,
  dialog,
  openInIde,
  userDataPath,
  service
}: ProjectHandlerDependencies): void {
  const filePath = join(userDataPath, 'projects.json')

  handle(APP_SHELL_CHANNELS.listProjects, () => service.list(filePath))

  handle(APP_SHELL_CHANNELS.importProject, async (): Promise<ProjectImportResult | null> => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory'],
      title: copy.projectImport.dialogTitle
    })
    const workspacePath = result.filePaths[0]
    if (result.canceled || !workspacePath) return null

    const workspace = await service.inspectDirectory(workspacePath)
    if (workspace.dirty) {
      const confirmation = await dialog.showMessageBox({
        type: 'warning',
        buttons: [copy.projectImport.continueAction, copy.projectImport.cancelAction],
        defaultId: 1,
        cancelId: 1,
        title: copy.projectImport.dirtyTitle,
        message: copy.projectImport.dirtyMessage,
        detail: copy.projectImport.dirtyDetail
      })
      if (confirmation.response !== 0) return null
    }

    const project = await service.importDirectory(filePath, workspacePath)
    return {
      project,
      warning: project.dirty
        ? copy.projectImport.dirtyWarning
        : null
    }
  })

  handle(APP_SHELL_CHANNELS.cloneGitHubProject, async (_event: unknown, value: unknown): Promise<GitHubProjectCloneResponse | null> => {
    const repositoryUrl = typeof value === 'string' ? value.trim() : ''
    if (!repositoryUrl) throw new Error('请输入 GitHub 仓库地址。')
    const destination = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory'],
      title: copy.projectImport.githubDestinationTitle
    })
    const parentPath = destination.filePaths[0]
    if (destination.canceled || !parentPath) return null
    const projectName = repositoryUrl.split(/[/:]/).pop()?.replace(/\.git$/i, '') || 'github-project'
    const destinationPath = resolve(parentPath, projectName)
    const transferNotice = {
      destination: repositoryUrl,
      data: copy.projectImport.githubData,
      permissions: copy.projectImport.githubPermissions,
      recovery: copy.projectImport.githubRecovery
    }
    const confirmation = await dialog.showMessageBox({
      type: 'warning',
      buttons: [copy.projectImport.githubContinueAction, copy.projectImport.cancelAction],
      defaultId: 1,
      cancelId: 1,
      title: copy.projectImport.githubNoticeTitle,
      message: `${copy.projectImport.githubNoticeMessage}\n\n${transferNotice.destination}`,
      detail: `${transferNotice.data}\n${transferNotice.permissions}\n${transferNotice.recovery}`
    })
    if (confirmation.response !== 0) return null
    if (!service.cloneGitHub) throw new Error('GitHub clone 不可用。')
    try {
      const project = await service.cloneGitHub(filePath, repositoryUrl, destinationPath)
      return { project, warning: project.dirty ? copy.projectImport.dirtyWarning : null, transferNotice }
    } catch (reason) {
      return {
        blocked: true,
        reason: reason instanceof Error ? reason.message : String(reason),
        transferNotice
      }
    }
  })

  handle(APP_SHELL_CHANNELS.openProjectInIde, async (_event: unknown, value: unknown): Promise<OpenProjectResult> => {
    const projectId = typeof value === 'string' ? value : ''
    const project = await service.findById(filePath, projectId)
    if (!project) return { ok: false, error: '找不到这个 Project。' }

    try {
      await openInIde(project.workspacePath)
      return { ok: true, error: null }
    } catch {
      return { ok: false, error: copy.projectOpen.error }
    }
  })
}
