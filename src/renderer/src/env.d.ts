import type { AppShellApi } from '../../shared/app-shell'

declare global {
  interface Window {
    appShell: AppShellApi
  }
}

export {}
