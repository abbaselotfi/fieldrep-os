import { Navigate, Route, Routes } from 'react-router-dom'

import { AppShell } from './app/AppShell'
import { OfflineSyncProvider } from './offline/sync-react'
import { AiPage } from './pages/AiPage'
import { CalendarPage } from './pages/CalendarPage'
import { CustomersPage } from './pages/CustomersPage'
import { HomePage } from './pages/HomePage'
import { PlannerPage } from './pages/PlannerPage'
import { ReportsPage } from './pages/ReportsPage'
import { SettingsPage } from './pages/SettingsPage'
import { VisitPage } from './pages/VisitPage'

export function App() {
  return (
    <OfflineSyncProvider>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<HomePage />} />
          <Route path="calendar" element={<CalendarPage />} />
          <Route path="planner" element={<PlannerPage />} />
          <Route path="customers" element={<CustomersPage />} />
          <Route path="ai" element={<AiPage />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="visit/new" element={<VisitPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </OfflineSyncProvider>
  )
}
