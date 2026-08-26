import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import type { MarketInterval } from '../api/types'

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

interface ExperimentContextValue {
  experimentId: string | null
  setExperimentId: (id: string | null) => void
  /** The candidate currently drilled into in the Backtest tab's "02" section — set by the Leaderboard tab's "Xem kết quả backtest" action. */
  backtestCandidateId: string | null
  setBacktestCandidateId: (id: string | null) => void
  lastConfig: LastRunConfig | null
  setLastConfig: (config: LastRunConfig) => void
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
      leaderboardRev,
      bumpLeaderboard,
    }),
    [experimentId, backtestCandidateId, lastConfig, leaderboardRev, bumpLeaderboard],
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
