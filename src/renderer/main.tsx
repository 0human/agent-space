import React from 'react'
import ReactDOM from 'react-dom/client'
import { createHashRouter, RouterProvider } from 'react-router-dom'
import { AppShell } from './app/AppShell'
import { DashboardPage } from './features/dashboard/DashboardPage'
import { PermissionsPage } from './features/permissions/PermissionsPage'
import { ProjectsPage } from './features/projects/ProjectsPage'
import { AgentProfilesPage } from './features/profiles/AgentProfilesPage'
import { RuntimesPage } from './features/runtimes/RuntimesPage'
import { PlaceholderPage } from './features/shared/PlaceholderPage'
import { TeamsPage } from './features/teams/TeamsPage'
import './styles.css'

const router = createHashRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'projects', element: <ProjectsPage /> },
      { path: 'sessions', element: <PlaceholderPage title="Work Sessions" /> },
      { path: 'runtimes', element: <RuntimesPage /> },
      { path: 'profiles', element: <AgentProfilesPage /> },
      { path: 'permissions', element: <PermissionsPage /> },
      { path: 'teams', element: <TeamsPage /> },
      { path: 'settings', element: <PlaceholderPage title="Settings" /> }
    ]
  }
])

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
)
