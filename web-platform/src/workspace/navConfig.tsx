import type { ReactNode } from 'react'
import { MARKET_SYMBOL } from '../lib/marketScope'

/**
 * Nav rail items and per-route header copy — ported verbatim from the
 * approved prototype's `NAV` / `PAGE_META` constants (see
 * docs/ui-prototype/.../Crypto Strategy Lab.dc.html) so labels, order, and
 * icon glyphs stay identical to the binding UI.
 */
export type RouteId = 'realtime' | 'strategy' | 'ai' | 'backtest' | 'leaderboard' | 'news'

export interface NavItem {
  id: RouteId
  path: string
  label: string
  icon: ReactNode
}

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  )
}

export const NAV_ITEMS: NavItem[] = [
  {
    id: 'realtime',
    path: '/app/realtime',
    label: 'Realtime',
    icon: (
      <Icon>
        <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
      </Icon>
    ),
  },
  {
    id: 'strategy',
    path: '/app/strategy',
    label: 'Strategy Engine',
    icon: (
      <Icon>
        <circle cx={6} cy={6} r={2.5} />
        <circle cx={6} cy={18} r={2.5} />
        <circle cx={18} cy={12} r={2.5} />
        <path d="M8.5 7.2 15.6 10.9M8.5 16.8 15.6 13.1" />
      </Icon>
    ),
  },
  {
    id: 'ai',
    path: '/app/ai',
    label: 'AI Strategy',
    icon: (
      <Icon>
        <path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6z" />
        <path d="M18 16l.8 2.2L21 19l-2.2.8L18 22l-.8-2.2L15 19l2.2-.8z" />
      </Icon>
    ),
  },
  {
    id: 'backtest',
    path: '/app/backtest',
    label: 'Backtest',
    icon: (
      <Icon>
        <path d="M3 3v18h18" />
        <path d="M7 15v3M12 9v9M17 12v6" />
      </Icon>
    ),
  },
  {
    id: 'leaderboard',
    path: '/app/leaderboard',
    label: 'Leaderboard',
    icon: (
      <Icon>
        <path d="M8 21h8M12 17v4" />
        <path d="M7 4h10v5a5 5 0 0 1-10 0z" />
        <path d="M7 5H4v2a3 3 0 0 0 3 3M17 5h3v2a3 3 0 0 1-3 3" />
      </Icon>
    ),
  },
  {
    id: 'news',
    path: '/app/news',
    label: 'News & Sentiment',
    icon: (
      <Icon>
        <rect x={3} y={4} width={18} height={16} />
        <path d="M7 8h7M7 12h10M7 16h6" />
      </Icon>
    ),
  },
]

export const PAGE_META: Record<RouteId, { title: string; sub: string }> = {
  realtime: {
    title: 'Realtime chart BTC đa khung thời gian',
    sub: `Theo dõi tối đa 4 khung thời gian của ${MARKET_SYMBOL} trên một màn hình`,
  },
  strategy: {
    title: 'Strategy Engine',
    sub: 'Strategy đơn của hệ thống và của AI, trọng số và tín hiệu tổng hợp',
  },
  ai: {
    title: 'AI Strategy — Prompt sang Python',
    sub: 'Mô tả ý tưởng, AI sinh strategy Python riêng cho tài khoản của bạn',
  },
  backtest: {
    title: 'Backtest & Search',
    sub: 'Cấu hình để sinh Leaderboard, và xem chi tiết kết quả của một candidate',
  },
  leaderboard: {
    title: 'Leaderboard tổ hợp strategy',
    sub: 'Xếp hạng các version tổ hợp sinh bởi Domain-guide Random Search',
  },
  news: {
    title: 'News & Sentiment',
    sub: 'Crawl tin tức BTC và phân loại sentiment bằng model NLP',
  },
}

export function routeIdFromPath(pathname: string): RouteId {
  const segment = pathname.split('/')[2] as RouteId | undefined
  return segment && segment in PAGE_META ? segment : 'realtime'
}
