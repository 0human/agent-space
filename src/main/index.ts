import { execFile as execFileCallback } from 'node:child_process'
import { mkdir, readFile, readdir, rename, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { app, BrowserWindow, dialog, ipcMain } from 'electron'

import { createMainWindow, registerAppShellHandlers } from './app-shell'
import { registerProjectHandlers } from './project-handlers'
import { createDefaultGitExecutor, createProjectService } from './project-service'
import { createDefaultIdeLauncher } from './ide-launcher'
import { registerWorkflowHandlers } from './workflow-handlers'
import { registerSkillHandlers } from './skill-handlers'
import { createSkillInstaller } from './skill-installer'
import { createWorkflowService } from './workflow-service'
import { createWorkflowEngine } from './workflow-engine'
import type { WorkflowEngine } from './workflow-engine'
import { createCodexRuntimeAdapter } from './codex-runtime'
import { createCodexItemProjection } from './codex-item-projection'
import { publishRuntimeItemUpdate, registerRuntimeItemHandlers } from './runtime-item-ipc'
import { createRunWorkspaceManager } from './run-workspace'
import { createDefaultGitHubExecutor, createGitDeliveryManager } from './git-delivery'
import { BUILT_IN_SKILL_MANIFESTS, type SkillManifest } from '../shared/workflow'

const currentDirectory = fileURLToPath(new URL('.', import.meta.url))
const execFile = promisify(execFileCallback)

function builtInSkillPackagePath(): string {
  return app.isPackaged ? join(process.resourcesPath, '.agents') : join(currentDirectory, '../../.agents')
}

function openMainWindow(): BrowserWindow {
  const mainWindow = createMainWindow({
    createWindow: (options) => new BrowserWindow(options),
    preloadPath: join(currentDirectory, '../preload/index.js'),
    rendererUrl: process.env.ELECTRON_RENDERER_URL,
    rendererFile: join(currentDirectory, '../renderer/index.html')
  }) as BrowserWindow

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

  mainWindow.webContents.on('will-navigate', (event) => event.preventDefault())

  if (process.env.AGENT_SPACE_STARTUP_SMOKE === '1') {
    mainWindow.webContents.once('did-finish-load', async () => {
      try {
        const emptyStateRendered = await mainWindow.webContents.executeJavaScript(`
          new Promise((resolve) => {
            let attempts = 0
            const inspect = () => {
              const heading = document.querySelector('#project-overview-title')
              if (heading?.textContent === '还没有 Project') return resolve(true)
              if (attempts++ >= 120) return resolve(false)
              requestAnimationFrame(inspect)
            }
            inspect()
          })
        `)

        if (!emptyStateRendered) {
          throw new Error('Project empty state did not render')
        }

        process.stdout.write('AGENT_SPACE_APP_READY\n')
        app.quit()
      } catch (error) {
        process.stderr.write(`Desktop Shell startup failed: ${String(error)}\n`)
        app.exit(1)
      }
    })
  }

  return mainWindow
}

registerAppShellHandlers({
  handle: (channel, listener) => ipcMain.handle(channel, listener),
  getVersion: () => app.getVersion(),
  platform: process.platform
})

let workflowEngine: WorkflowEngine
const projectService = createProjectService({
  readFile,
  writeFile,
  rename,
  unlink,
  mkdir: async (path, options) => {
    await mkdir(path, options)
  },
  readDirectory: async (path) => readdir(path),
  execGit: createDefaultGitExecutor(),
  cloneGitHub: async (repositoryUrl, destinationPath) => {
    await execFile('git', ['clone', repositoryUrl, destinationPath], { encoding: 'utf8' })
  },
  fetchGitHub: async (workspacePath) => {
    await execFile('git', ['-C', workspacePath, 'fetch', '--prune', 'origin'], { encoding: 'utf8' })
  },
  hasActiveWorkflowRuns: async (projectId) => {
    const runs = await workflowEngine.listRuns(projectId)
    return runs.some((run) => ['running', 'paused', 'waiting', 'blocked'].includes(run.status))
  }
})
const openInIde = createDefaultIdeLauncher()
const skillInstaller = createSkillInstaller({ rootPath: join(app.getPath('userData'), 'skill-packages') })
let availableSkillManifests: SkillManifest[] = [...BUILT_IN_SKILL_MANIFESTS]
const installedSkillPaths = new Map<string, string>()
const refreshInstalledSkills = async (): Promise<void> => {
  const records = await skillInstaller.listInstalled()
  availableSkillManifests = [...BUILT_IN_SKILL_MANIFESTS, ...records.flatMap((record) => record.manifest.skills)]
  installedSkillPaths.clear()
  for (const record of records) for (const manifest of record.manifest.skills) installedSkillPaths.set(`${manifest.name}@${manifest.version}`, record.installedPath)
}
const runtimeItemProjection = createCodexItemProjection({
  publish: (update) => publishRuntimeItemUpdate(BrowserWindow.getAllWindows(), update),
  onIgnoredItem: (item) => {
    console.warn('[agent-space] Ignored Runtime Item', item)
  }
})
registerRuntimeItemHandlers({
  handle: (channel, listener) => ipcMain.handle(channel, listener),
  projection: runtimeItemProjection
})
workflowEngine = createWorkflowEngine({
  databasePath: join(app.getPath('userData'), 'workflow-runs.sqlite'),
  runtime: createCodexRuntimeAdapter({
    skillManifests: BUILT_IN_SKILL_MANIFESTS,
    getSkillManifests: () => availableSkillManifests,
    skillPackagePath: builtInSkillPackagePath(),
    resolveSkillPackagePath: (manifest) => installedSkillPaths.get(`${manifest.name}@${manifest.version}`) ?? builtInSkillPackagePath(),
    itemProjection: runtimeItemProjection
  }),
  runWorkspaceManager: createRunWorkspaceManager({ execGit: createDefaultGitExecutor() }),
  gitDeliveryManager: createGitDeliveryManager({ execGit: createDefaultGitExecutor(), execGitHub: createDefaultGitHubExecutor() })
})

registerProjectHandlers({
  handle: (channel, listener) => ipcMain.handle(channel, listener),
  dialog: {
    showOpenDialog: (options) => dialog.showOpenDialog(options),
    showMessageBox: (options) => dialog.showMessageBox(options)
  },
  openInIde,
  userDataPath: app.getPath('userData'),
  service: projectService
})

registerWorkflowHandlers({
  handle: (channel, listener) => ipcMain.handle(channel, listener),
  userDataPath: app.getPath('userData'),
  projectService,
  workflowEngine,
  openInIde,
  workflowService: createWorkflowService({
    readFile,
    writeFile,
    mkdir: async (path, options) => {
      await mkdir(path, options)
    },
    manifests: BUILT_IN_SKILL_MANIFESTS,
    getManifests: () => availableSkillManifests
  })
})

registerSkillHandlers({
  handle: (channel, listener) => ipcMain.handle(channel, listener),
  installer: skillInstaller,
  dialog: { showMessageBox: (options) => dialog.showMessageBox(options) },
  onInstalled: refreshInstalledSkills
})

app.whenReady().then(async () => {
  await refreshInstalledSkills()
  void workflowEngine.recover()
  openMainWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      openMainWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  void workflowEngine.close()
})
