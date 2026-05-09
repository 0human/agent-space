import { app, ipcMain } from 'electron'
import type { ApiResult, AppInfo } from '../../shared/api'
import { getDatabaseHandle } from '../db'

const APP_GET_INFO_CHANNEL = 'app:getInfo'

export function registerAppIpc(): void {
  ipcMain.handle(APP_GET_INFO_CHANNEL, async (): Promise<ApiResult<AppInfo>> => {
    return {
      ok: true,
      data: {
        appVersion: app.getVersion(),
        platform: process.platform,
        databaseReady: true,
        databasePath: getDatabaseHandle().path
      }
    }
  })
}

export { APP_GET_INFO_CHANNEL }
