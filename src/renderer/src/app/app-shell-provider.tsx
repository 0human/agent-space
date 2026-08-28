import { createContext, useContext } from 'react'

import type { AppShellApi } from '../../../shared/app-shell'

const AppShellContext = createContext<AppShellApi | null>(null)

export function AppShellProvider({
  api,
  children,
}: {
  api: AppShellApi
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <AppShellContext.Provider value={api}>{children}</AppShellContext.Provider>
  )
}

export function useAppShell(): AppShellApi {
  const api = useContext(AppShellContext)
  if (!api) throw new Error('AppShellProvider is required')
  return api
}
