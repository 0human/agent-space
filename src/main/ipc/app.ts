import { app, ipcMain } from 'electron'
import type { AppInfo } from '../../shared/api'
import { getDatabaseHandle } from '../db'
import { ok } from './result'

const APP_GET_INFO_CHANNEL = 'app:getInfo'

export function registerAppIpc(): void {
  ipcMain.handle(APP_GET_INFO_CHANNEL, () => {
    return ok<AppInfo>({
      appVersion: app.getVersion(),
      platform: process.platform,
      databaseReady: true,
      databasePath: getDatabaseHandle().path
    })
  })
}

export { APP_GET_INFO_CHANNEL }
