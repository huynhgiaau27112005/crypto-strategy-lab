import { Navigate, Route, Routes } from 'react-router-dom'
import { RequireAuth } from './auth/AuthContext'
import AiStrategyPage from './pages/AiStrategyPage'
import AuthPage from './pages/AuthPage'
import BacktestPage from './pages/BacktestPage'
import LandingPage from './pages/LandingPage'
import LeaderboardPage from './pages/LeaderboardPage'
import NewsPage from './pages/NewsPage'
import RealtimePage from './pages/RealtimePage'
import StrategyEnginePage from './pages/StrategyEnginePage'
import { ExperimentProvider } from './state/ExperimentContext'
import { NewsCrawlProvider } from './state/NewsCrawlContext'
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
              {/* Shared across the Backtest and Leaderboard tabs: the current
                  experiment run (id + applied config) and the candidate
                  currently drilled into — same live state, no second fetch. */}
              <ExperimentProvider>
                {/* Mounted at the route, not inside NewsPage: a running crawl
                    must survive switching tabs. Owning the poll here is what
                    keeps the button on "Đang crawl" until the user stops it
                    (or the worker finishes), instead of resetting every time
                    the News tab unmounts. */}
                <NewsCrawlProvider>
                  <WorkspaceLayout />
                </NewsCrawlProvider>
              </ExperimentProvider>
            </StrategySelectionProvider>
          </RequireAuth>
        }
      >
        <Route index element={<Navigate to="realtime" replace />} />
        <Route path="realtime" element={<RealtimePage />} />
        <Route path="strategy" element={<StrategyEnginePage />} />
        <Route path="ai" element={<AiStrategyPage />} />
        <Route path="backtest" element={<BacktestPage />} />
        <Route path="leaderboard" element={<LeaderboardPage />} />
        <Route path="news" element={<NewsPage />} />
        <Route path="*" element={<Navigate to="realtime" replace />} />
      </Route>
    </Routes>
  )
}
