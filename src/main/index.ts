import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { app, BrowserWindow, ipcMain } from 'electron'

import { createMainWindow, registerAppShellHandlers } from './app-shell'

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

app.whenReady().then(() => {
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
