import type { BrowserWindowConstructorOptions } from 'electron'

import { APP_SHELL_CHANNELS, type RuntimeInfo } from '../shared/app-shell'

interface BrowserWindowLike {
  loadFile: (path: string) => Promise<void> | void
  loadURL: (url: string) => Promise<void> | void
  on: (event: 'ready-to-show', listener: () => void) => void
  show: () => void
}

interface MainWindowDependencies {
  createWindow: (options: BrowserWindowConstructorOptions) => BrowserWindowLike
  preloadPath: string
  rendererUrl?: string
  rendererFile?: string
}

interface AppShellHandlerDependencies {
  handle: (channel: string, listener: () => RuntimeInfo | Promise<RuntimeInfo>) => void
  getVersion: () => string
  platform: NodeJS.Platform
}

export function createMainWindow({
  createWindow,
  preloadPath,
  rendererUrl,
  rendererFile
}: MainWindowDependencies): BrowserWindowLike {
  const mainWindow = createWindow({
    width: 1120,
    height: 760,
    minWidth: 360,
    minHeight: 560,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#f5f6f3',
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow.show())

  if (rendererUrl) {
    void mainWindow.loadURL(rendererUrl)
  } else if (rendererFile) {
    void mainWindow.loadFile(rendererFile)
  } else {
    throw new Error('A renderer URL or file is required')
  }

  return mainWindow
}

export function registerAppShellHandlers({
  handle,
  getVersion,
  platform
}: AppShellHandlerDependencies): void {
  handle(APP_SHELL_CHANNELS.getRuntimeInfo, async () => ({
    platform,
    version: getVersion()
  }))
}
