import { Route, Routes } from 'react-router-dom'
import { RequireAuth } from './auth/AuthContext'
import AuthPage from './pages/AuthPage'
import LandingPage from './pages/LandingPage'
import WorkspacePage from './pages/WorkspacePage'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/auth" element={<AuthPage />} />
      <Route
        path="/app/*"
        element={
          <RequireAuth>
            <WorkspacePage />
          </RequireAuth>
        }
      />
    </Routes>
  )
}
