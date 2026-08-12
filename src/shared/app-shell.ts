export interface RuntimeInfo {
  platform: NodeJS.Platform
  version: string
}

export const APP_SHELL_CHANNELS = {
  getRuntimeInfo: 'app-shell:get-runtime-info'
} as const

export interface AppShellApi {
  getRuntimeInfo: () => Promise<RuntimeInfo>
}
