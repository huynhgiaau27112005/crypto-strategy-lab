import { NavLink, Route, Routes } from 'react-router-dom'
import DashboardPage from './pages/DashboardPage'
import StrategiesPage from './pages/StrategiesPage'
import SearchPage from './pages/SearchPage'
import LeaderboardPage from './pages/LeaderboardPage'
import StrategyDetailPage from './pages/StrategyDetailPage'
import NewsPage from './pages/NewsPage'
import './App.css'

const navItems = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/strategies', label: 'Strategies' },
  { to: '/search', label: 'Search' },
  { to: '/leaderboard', label: 'Leaderboard' },
  { to: '/news', label: 'News' },
] as const

export default function App() {
  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand">Crypto Strategy Lab</div>
        <nav className="app-nav">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={'end' in item ? item.end : false}
              className={({ isActive }) => (isActive ? 'active' : undefined)}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/strategies" element={<StrategiesPage />} />
        <Route path="/search" element={<SearchPage />} />
        <Route path="/leaderboard" element={<LeaderboardPage />} />
        <Route path="/strategy/:id" element={<StrategyDetailPage />} />
        <Route path="/news" element={<NewsPage />} />
      </Routes>
    </div>
  )
}
