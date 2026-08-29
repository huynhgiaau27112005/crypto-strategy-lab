import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import type { MarketInterval, RankedCandidateSummary } from '../api/types'

/**
 * The applied config of the most recent `POST /strategy-search/experiments`
 * call — kept client-side only (the backend does not echo a config summary
 * back beyond what's persisted). `maxCandidates` is always the backend's
 * own default (100, artifacts/api-contract.md §2) because the approved
 * config form (docs/ui-prototype) has no field for it.
 */
export interface LastRunConfig {
  timeframe: MarketInterval
  startTime: string
  endTime: string
  topK: number
  maxCandidates: number
  strategyCount: number
  totalStrategyCount: number
  runSeq: number
}

/**
 * The Backtest tab's config FORM, lifted out of the page component.
 *
 * It used to be `useState` inside BacktestPage, so navigating to another
 * tab unmounted the page and threw the half-filled form away — the user
 * came back to defaults every time. It lives here, alongside the run it
 * produces, so the form survives tab switches for as long as the `/app`
 * route is mounted.
 *
 * Cost fields are strings because they are bound straight to inputs; they
 * are parsed once, at submit.
 */
export interface BacktestFormState {
  timeframe: MarketInterval
  fromDate: string
  toDate: string
  capital: string
  transactionCostPct: string
  slippageBps: string
  stopLossPct: string
  takeProfitPct: string
  topK: string
}

export const DEFAULT_BACKTEST_FORM: BacktestFormState = {
  timeframe: '5m',
  fromDate: '2026-08-07',
  toDate: '2026-08-24',
  capital: '1000',
  transactionCostPct: '0.08',
  slippageBps: '5',
  // Empty = disabled. Defaulting these to a number would silently change
  // what every run simulates.
  stopLossPct: '',
  takeProfitPct: '',
  topK: '8',
}

interface ExperimentContextValue {
  experimentId: string | null
  setExperimentId: (id: string | null) => void
  /** The candidate currently drilled into in the Backtest tab's "02" section — set by the Leaderboard tab's "Xem kết quả backtest" action. */
  backtestCandidateId: string | null
  setBacktestCandidateId: (id: string | null) => void
  lastConfig: LastRunConfig | null
  setLastConfig: (config: LastRunConfig) => void
  /**
   * Candidates regenerated from a parameter version the user saved, with
   * their placement among ALL candidates. The Leaderboard renders these in
   * their own section so a version that scored outside the Top-K is still
   * visible and comparable instead of silently disappearing.
   */
  myVersionCandidates: RankedCandidateSummary[]
  setMyVersionCandidates: (summaries: RankedCandidateSummary[]) => void
  /** The Backtest tab's config form — persisted across tab switches. */
  backtestForm: BacktestFormState
  setBacktestForm: (
    update: BacktestFormState | ((prev: BacktestFormState) => BacktestFormState),
  ) => void
  /**
   * Bumped whenever something outside the Leaderboard tab changes what the
   * Leaderboard should show — currently ParameterPanel's save-a-version
   * cascade, which adds regenerated candidates to the current experiment
   * from a different tab. LeaderboardPage folds this into its data-fetch
   * trigger so the new combo versions appear without a manual reload.
   */
  leaderboardRev: number
  bumpLeaderboard: () => void
}

const ExperimentContext = createContext<ExperimentContextValue | undefined>(undefined)

/**
 * Shares the current experiment run (id + applied config) and the
 * candidate currently drilled into, between the Backtest and Leaderboard
 * tabs — same live state, no second fetch, no backend endpoint to store
 * it. Scoped at the `/app` route (like StrategySelectionContext) so it
 * survives switching tabs.
 */
export function ExperimentProvider({ children }: { children: ReactNode }) {
  const [experimentId, setExperimentId] = useState<string | null>(null)
  const [backtestCandidateId, setBacktestCandidateId] = useState<string | null>(null)
  const [lastConfig, setLastConfig] = useState<LastRunConfig | null>(null)
  const [backtestForm, setBacktestForm] = useState<BacktestFormState>(DEFAULT_BACKTEST_FORM)
  const [myVersionCandidates, setMyVersionCandidates] = useState<RankedCandidateSummary[]>([])
  const [leaderboardRev, setLeaderboardRev] = useState(0)
  const bumpLeaderboard = useCallback(() => setLeaderboardRev((n) => n + 1), [])

  const value = useMemo<ExperimentContextValue>(
    () => ({
      experimentId,
      setExperimentId,
      backtestCandidateId,
      setBacktestCandidateId,
      lastConfig,
      setLastConfig,
      myVersionCandidates,
      setMyVersionCandidates,
      backtestForm,
      setBacktestForm,
      leaderboardRev,
      bumpLeaderboard,
    }),
    [
      experimentId,
      backtestCandidateId,
      lastConfig,
      backtestForm,
      myVersionCandidates,
      leaderboardRev,
      bumpLeaderboard,
    ],
  )

  return <ExperimentContext.Provider value={value}>{children}</ExperimentContext.Provider>
}

export function useExperimentContext(): ExperimentContextValue {
  const ctx = useContext(ExperimentContext)
  if (!ctx) {
    throw new Error('useExperimentContext must be used within an <ExperimentProvider>.')
  }
  return ctx
}
