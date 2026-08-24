import { Link } from 'react-router-dom'
import BlueprintCorners from '../components/BlueprintCorners'
import HeroPanel from '../components/HeroPanel'

/**
 * The prototype has only one screen that shows this hero content — the
 * split login screen (hero + auth card side by side). It has no separate,
 * auth-free landing page. Routing `/` to a standalone marketing page and
 * `/auth` to the sign-in flow is a structural decision this task's routes
 * required that the prototype itself doesn't show a state for (see
 * docs/ui-prototype/CLAUDE.md rule 4) — resolved by reusing the same
 * <HeroPanel> full-bleed here, with sign-in/sign-up entry points added in
 * the same visual language, rather than inventing new hero content.
 */
export default function LandingPage() {
  return (
    <div className="landing-page">
      <HeroPanel />
      <nav className="landing-nav">
        <Link to="/auth" className="btn btn-secondary">
          Đăng nhập
        </Link>
        <Link to="/auth?mode=register" className="btn btn-primary blueprint">
          <BlueprintCorners />
          Đăng ký
        </Link>
      </nav>
    </div>
  )
}
