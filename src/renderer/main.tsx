import React from 'react'
import ReactDOM from 'react-dom/client'
import { createHashRouter, RouterProvider } from 'react-router-dom'
import { AppShell } from './app/AppShell'
import { DashboardPage } from './features/dashboard/DashboardPage'
import { PlaceholderPage } from './features/shared/PlaceholderPage'
import './styles.css'

const router = createHashRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'projects', element: <PlaceholderPage title="Projects" /> },
      { path: 'sessions', element: <PlaceholderPage title="Work Sessions" /> },
      { path: 'runtimes', element: <PlaceholderPage title="Runtimes" /> },
      { path: 'profiles', element: <PlaceholderPage title="Agent Profiles" /> },
      { path: 'permissions', element: <PlaceholderPage title="Permissions" /> },
      { path: 'teams', element: <PlaceholderPage title="Teams" /> },
      { path: 'settings', element: <PlaceholderPage title="Settings" /> }
    ]
  }
])

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
)
