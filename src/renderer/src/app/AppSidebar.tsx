import { FolderKanban, Settings, Workflow } from 'lucide-react'

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from '@renderer/components/ui/sidebar'
import { zhCN } from '@renderer/i18n/zh-CN'

import type { AppPage } from './navigation'

export function AppSidebar({
  page,
  onNavigate,
}: {
  page: AppPage
  onNavigate: (page: AppPage) => void
}): React.JSX.Element {
  const { setOpenMobile } = useSidebar()
  const settingsActive = page.name === 'settings'
  const navigate = (nextPage: AppPage): void => {
    setOpenMobile(false)
    onNavigate(nextPage)
  }

  return (
    <Sidebar
      collapsible="icon"
      className="border-sidebar-border bg-sidebar text-sidebar-foreground"
      mobileTitle={zhCN.app.sidebarTitle}
      mobileDescription={zhCN.app.sidebarDescription}
      mobileCloseLabel={zhCN.app.sidebarClose}
    >
      <SidebarHeader className="px-3 py-5">
        <div className="flex items-center gap-3 overflow-hidden px-1 text-sm font-semibold">
          <span
            className="grid size-8 shrink-0 place-items-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground"
            aria-hidden="true"
          >
            <Workflow className="size-4" />
          </span>
          <span className="group-data-[collapsible=icon]:hidden">
            {zhCN.app.name}
          </span>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <nav aria-label={zhCN.app.primaryNavigation}>
          <SidebarGroup>
            <SidebarGroupLabel>{zhCN.app.workspace}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    type="button"
                    tooltip={zhCN.navigation.projectOverview}
                    isActive={!settingsActive}
                    aria-current={!settingsActive ? 'page' : undefined}
                    onClick={() => navigate({ name: 'projectOverview' })}
                  >
                    <FolderKanban aria-hidden="true" />
                    <span>{zhCN.navigation.projectOverview}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    type="button"
                    tooltip={zhCN.navigation.settings}
                    isActive={settingsActive}
                    aria-current={settingsActive ? 'page' : undefined}
                    onClick={() => navigate({ name: 'settings' })}
                  >
                    <Settings aria-hidden="true" />
                    <span>{zhCN.navigation.settings}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </nav>
      </SidebarContent>
      <SidebarFooter className="px-3 py-4">
        <div className="flex items-center gap-2 overflow-hidden px-2 text-xs text-sidebar-foreground/65">
          <span
            className="size-2 shrink-0 rounded-full bg-primary ring-4 ring-primary/10"
            aria-hidden="true"
          />
          <span className="group-data-[collapsible=icon]:hidden">
            {zhCN.app.localMode}
          </span>
        </div>
      </SidebarFooter>
      <SidebarRail label={zhCN.app.sidebarToggle} />
    </Sidebar>
  )
}
