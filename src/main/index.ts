import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { app, BrowserWindow, dialog, ipcMain } from 'electron'

import { createMainWindow, registerAppShellHandlers } from './app-shell'
import { registerProjectHandlers } from './project-handlers'
import { createDefaultGitExecutor, createProjectService } from './project-service'
import { createDefaultIdeLauncher } from './ide-launcher'
import { registerWorkflowHandlers } from './workflow-handlers'
import { createWorkflowService } from './workflow-service'
import { createWorkflowEngine } from './workflow-engine'
import { createCodexRuntimeAdapter } from './codex-runtime'
import { createRunWorkspaceManager } from './run-workspace'
import { BUILT_IN_SKILL_MANIFESTS } from '../shared/workflow'

const currentDirectory = fileURLToPath(new URL('.', import.meta.url))

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

const projectService = createProjectService({
  readFile,
  writeFile,
  mkdir: async (path, options) => {
    await mkdir(path, options)
  },
  readDirectory: async (path) => readdir(path),
  execGit: createDefaultGitExecutor()
})
const openInIde = createDefaultIdeLauncher()
const workflowEngine = createWorkflowEngine({
  databasePath: join(app.getPath('userData'), 'workflow-runs.sqlite'),
  runtime: createCodexRuntimeAdapter({
    skillManifests: BUILT_IN_SKILL_MANIFESTS,
    skillPackagePath: join(currentDirectory, '../../.agents')
  }),
  runWorkspaceManager: createRunWorkspaceManager({ execGit: createDefaultGitExecutor() })
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
    manifests: BUILT_IN_SKILL_MANIFESTS
  })
})

app.whenReady().then(() => {
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
