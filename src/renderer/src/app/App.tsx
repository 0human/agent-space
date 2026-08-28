import { useEffect, useState } from 'react'

import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from '@renderer/components/ui/sidebar'
import { Toaster } from '@renderer/components/ui/sonner'
import { ProjectFeature } from '@renderer/features/projects/ProjectFeature'
import { SettingsFeature } from '@renderer/features/settings/SettingsFeature'
import { WorkflowRunFeature } from '@renderer/features/workflow-runs/WorkflowRunFeature'
import { WorkflowFeature } from '@renderer/features/workflows/WorkflowFeature'
import { zhCN } from '@renderer/i18n/zh-CN'

import { AppShellProvider } from './app-shell-provider'
import { AppSidebar } from './AppSidebar'
import type { AppPage } from './navigation'
import { isProjectPage } from './navigation'

export default function App(): React.JSX.Element {
  const [page, setPage] = useState<AppPage>({ name: 'projectOverview' })

  useEffect(() => {
    document.title = zhCN.app.name
  }, [])

  const content = isProjectPage(page) ? (
    <ProjectFeature page={page} onNavigate={setPage} />
  ) : page.name === 'workflow' ? (
    <WorkflowFeature project={page.project} onNavigate={setPage} />
  ) : page.name === 'run' ? (
    <WorkflowRunFeature
      project={page.project}
      initialRun={page.run}
      onNavigate={setPage}
    />
  ) : (
    <SettingsFeature />
  )

  return (
    <AppShellProvider api={window.appShell}>
      <SidebarProvider defaultOpen>
        <AppSidebar page={page} onNavigate={setPage} />
        <SidebarInset className="min-w-0 bg-background">
          <div className="sticky top-0 z-20 flex h-12 items-center border-b bg-background/95 px-4 backdrop-blur md:hidden">
            <SidebarTrigger label={zhCN.app.sidebarToggle} />
            <span className="ml-2 text-sm font-semibold">{zhCN.app.name}</span>
          </div>
          {content}
        </SidebarInset>
        <Toaster
          position="bottom-right"
          containerAriaLabel={zhCN.app.notifications}
          theme="light"
        />
      </SidebarProvider>
    </AppShellProvider>
  )
}
