import { Navigate, Route, Routes } from 'react-router-dom'
import { RequireAuth } from './auth/AuthContext'
import AuthPage from './pages/AuthPage'
import LandingPage from './pages/LandingPage'
import PlaceholderPage from './pages/PlaceholderPage'
import RealtimePage from './pages/RealtimePage'
import WorkspaceLayout from './workspace/WorkspaceLayout'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/auth" element={<AuthPage />} />
      <Route
        path="/app"
        element={
          <RequireAuth>
            <WorkspaceLayout />
          </RequireAuth>
        }
      >
        <Route index element={<Navigate to="realtime" replace />} />
        <Route path="realtime" element={<RealtimePage />} />
        <Route path="strategy" element={<PlaceholderPage />} />
        <Route path="ai" element={<PlaceholderPage />} />
        <Route path="backtest" element={<PlaceholderPage />} />
        <Route path="leaderboard" element={<PlaceholderPage />} />
        <Route path="news" element={<PlaceholderPage />} />
        <Route path="*" element={<Navigate to="realtime" replace />} />
      </Route>
    </Routes>
  )
}
