import { app, BrowserWindow } from 'electron'
import { join } from 'node:path'
import { closeDatabase, initializeDatabase } from './db'
import { registerAgentProfileIpc } from './ipc/agentProfiles'
import { registerAppIpc } from './ipc/app'
import { registerPermissionIpc } from './ipc/permissions'
import { registerRuntimeIpc } from './ipc/runtime'
import { PermissionService } from './permissions/permissionService'
import { AgentProfileService } from './profiles/agentProfileService'
import {
  FileSecretService,
  NodeProcessRunner,
  RuntimeImportService,
  RuntimeService,
  RuntimeTester
} from './runtime'
import { recoverInterruptedRuns } from './services/startupRecovery'

const isDev = Boolean(process.env.ELECTRON_RENDERER_URL)

function createMainWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    title: 'AI Agent Workspace',
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
  })

  if (isDev && process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  const database = initializeDatabase()
  recoverInterruptedRuns(database.db)
  const permissionService = new PermissionService(database.db)
  permissionService.ensureRecommendedPolicySets()
  const agentProfileService = new AgentProfileService(database.db, permissionService)
  const runtimeService = new RuntimeService(
    database.db,
    new FileSecretService(join(app.getPath('userData'), 'secrets')),
    new RuntimeTester(new NodeProcessRunner())
  )
  registerAppIpc()
  registerPermissionIpc(permissionService)
  registerAgentProfileIpc(agentProfileService)
  registerRuntimeIpc(runtimeService, new RuntimeImportService(database.db, runtimeService))
  createMainWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  closeDatabase()
})
