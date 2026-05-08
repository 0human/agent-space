export type ApiResult<T> =
  | {
      ok: true
      data: T
    }
  | {
      ok: false
      error: ApiError
    }

export interface ApiError {
  code: string
  message: string
  details?: Record<string, unknown>
  recoverable?: boolean
}

export interface AppInfo {
  appVersion: string
  platform: NodeJS.Platform
  databaseReady: boolean
}

export interface AppAPI {
  getInfo: () => Promise<ApiResult<AppInfo>>
}

export interface AgentSpaceAPI {
  app: AppAPI
}
