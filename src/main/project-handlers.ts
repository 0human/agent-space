import { join } from 'node:path'

import { APP_SHELL_CHANNELS } from '../shared/app-shell'
import { zhCNMain as copy } from '../shared/i18n/zh-CN'
import type { OpenProjectResult, Project, ProjectImportResult } from '../shared/project'

interface ProjectService {
  list: (filePath: string) => Promise<Project[]>
  inspectDirectory: (workspacePath: string) => Promise<{ dirty: boolean }>
  importDirectory: (filePath: string, workspacePath: string) => Promise<Project>
  findById: (filePath: string, projectId: string) => Promise<Project | null>
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
  openPath: (path: string) => Promise<string>
  userDataPath: string
  service: ProjectService
}

export function registerProjectHandlers({
  handle,
  dialog,
  openPath,
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

  handle(APP_SHELL_CHANNELS.openProjectInIde, async (_event: unknown, value: unknown): Promise<OpenProjectResult> => {
    const projectId = typeof value === 'string' ? value : ''
    const project = await service.findById(filePath, projectId)
    if (!project) return { ok: false, error: '找不到这个 Project。' }

    const error = await openPath(project.workspacePath)
    return error ? { ok: false, error } : { ok: true, error: null }
  })
}
