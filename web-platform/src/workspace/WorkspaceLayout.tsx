import { Outlet, useLocation } from 'react-router-dom'
import NavRail from './NavRail'
import { PAGE_META, routeIdFromPath } from './navConfig'
import { useMarketSocket } from '../hooks/useMarketSocket'
import { MARKET_SYMBOL } from '../lib/marketScope'

function fmtPrice(v: string | number): string {
  return Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/**
 * The authenticated workspace shell: left nav rail + per-route header,
 * both present on every `/app/*` tab. Nested tab content renders through
 * `<Outlet>` (see App.tsx for the route tree).
 */
export default function WorkspaceLayout() {
  const location = useLocation()
  const routeId = routeIdFromPath(location.pathname)
  const meta = PAGE_META[routeId]

  // Present on every tab (not just Realtime), per the approved prototype's
  // header — its own hook instance, own fetch, own socket subscription.
  // It never shares state with any <ChartPane> the Realtime tab renders.
  const { candles } = useMarketSocket('1m')
  const lastPrice = candles.length > 0 ? fmtPrice(candles[candles.length - 1].close) : '—'

  return (
    <div className="workspace">
      <NavRail />
      <main className="workspace-main">
        <header className="workspace-header">
          <div className="workspace-header-text">
            <h1 className="workspace-title">{meta.title}</h1>
            <p className="text-muted workspace-sub">{meta.sub}</p>
          </div>
          <div className="workspace-header-meta">
            <div className="meta-pill">
              <span className="meta-pill-dot" />
              Nguồn dữ liệu: Binance API + WebSocket
            </div>
            <div className="meta-pill mono">
              {MARKET_SYMBOL} · <span className="text-up">{lastPrice}</span>
            </div>
          </div>
        </header>
        <Outlet />
      </main>
    </div>
  )
}
