import { Navigate, Route, Routes } from 'react-router-dom'
import { RequireAuth } from './auth/AuthContext'
import AuthPage from './pages/AuthPage'
import LandingPage from './pages/LandingPage'
import PlaceholderPage from './pages/PlaceholderPage'
import RealtimePage from './pages/RealtimePage'
import StrategyEnginePage from './pages/StrategyEnginePage'
import { StrategySelectionProvider } from './state/StrategySelectionContext'
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
            {/* Shared across every /app/* tab: the Strategy Engine tab edits the
                selection/weights here, a later Backtest tab reads them for
                POST /strategy-search/experiments — same live state, no
                second fetch, no backend endpoint to store it. */}
            <StrategySelectionProvider>
              <WorkspaceLayout />
            </StrategySelectionProvider>
          </RequireAuth>
        }
      >
        <Route index element={<Navigate to="realtime" replace />} />
        <Route path="realtime" element={<RealtimePage />} />
        <Route path="strategy" element={<StrategyEnginePage />} />
        <Route path="ai" element={<PlaceholderPage />} />
        <Route path="backtest" element={<PlaceholderPage />} />
        <Route path="leaderboard" element={<PlaceholderPage />} />
        <Route path="news" element={<PlaceholderPage />} />
        <Route path="*" element={<Navigate to="realtime" replace />} />
      </Route>
    </Routes>
  )
}
