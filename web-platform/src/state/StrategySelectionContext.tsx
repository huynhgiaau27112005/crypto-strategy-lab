import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { apiFetch } from '../api/client'
import type { SearchStrategyType, StrategyCatalogItem, StrategyWeight } from '../api/types'

/**
 * A weight set is only sendable to `POST /strategy-search/experiments` if
 * it covers at least one "directional" domain (decides entry direction)
 * and one "confirmation" domain (confirms it) — artifacts/api-contract.md
 * §2: "search bắt buộc phải có ít nhất một strategy định hướng (MA hoặc
 * Support/Resistance) và một strategy xác nhận (RSI hoặc Bollinger)".
 * Expressed as domain sets (not hard-coded type names) so this stays
 * correct if the plugin registry grows within the same two domain roles.
 */
const DIRECTIONAL_DOMAINS = new Set(['TREND', 'STRUCTURE'])
// INFORMATION (News Sentiment) is deliberately in NEITHER set: it is a
// supplementary voice, so it can join a composite but can never be the
// thing that makes one valid on its own — mirrors the backend generator.
const CONFIRMATION_DOMAINS = new Set(['MOMENTUM', 'VOLATILITY'])

export interface StrategyWeightValidation {
  valid: boolean
  /** Human-readable, Vietnamese reasons for why the set is currently invalid — empty when valid. */
  reasons: string[]
}

interface StrategySelectionContextValue {
  strategies: StrategyCatalogItem[]
  loading: boolean
  error: string | null
  /** Whether each strategy type is included in Search — keyed by `type`. */
  selected: Record<string, boolean>
  /** Editable weight per strategy type, meaningful only while `selected[type]` is true. */
  weights: Record<string, number>
  toggleSelected: (type: SearchStrategyType) => void
  setWeight: (type: SearchStrategyType, weight: number) => void
  /** The exact shape `POST /strategy-search/experiments` expects for `strategyWeights` — selected strategies only. */
  strategyWeights: StrategyWeight[]
  /**
   * Re-fetches `GET /strategy-plugin/strategies`.
   *
   * The catalog used to load once on mount, so a strategy saved in the AI
   * Strategy tab did not appear under "Strategy do AI generate" until the
   * whole page was reloaded — the row existed server-side the entire time
   * (AiStrategyRepository.listLatestPerName returns it), the client simply
   * never asked again.
   */
  refreshStrategies: () => void
  validation: StrategyWeightValidation
  /**
   * True once the user has confirmed the current, valid selection via
   * `confirmSelection()`. Cleared automatically on the next edit so stale
   * "saved" state is never shown after a change. The Backtest tab reads
   * `strategyWeights` directly regardless of this flag; it exists purely
   * as the UI's "did I save this" affordance (mirrors the approved
   * prototype's save-set panel).
   */
  confirmed: boolean
  confirmSelection: () => void
}

const StrategySelectionContext = createContext<StrategySelectionContextValue | undefined>(undefined)

function computeValidation(
  strategyWeights: StrategyWeight[],
  strategies: StrategyCatalogItem[],
): StrategyWeightValidation {
  const reasons: string[] = []

  if (strategyWeights.length === 0) {
    return { valid: false, reasons: ['Chưa chọn strategy nào để đưa vào Search.'] }
  }

  // Điểm tổng hợp = Σ (trọng số × tín hiệu) / Σ trọng số — backend chia cho
  // tổng trọng số nên trọng số KHÔNG cần tổng bằng 1 (công thức tự chuẩn
  // hoá). Ràng buộc còn thực sự cần: mỗi trọng số là số hữu hạn, không âm
  // (âm sẽ đảo ngược tín hiệu của strategy đó — khái niệm không được hỗ
  // trợ), và không được tất cả bằng 0 (mẫu số của công thức sẽ bằng 0).
  const invalidWeights = strategyWeights.filter(
    (w) => !Number.isFinite(w.weight) || w.weight < 0,
  )
  if (invalidWeights.length > 0) {
    reasons.push(
      `Trọng số phải là số không âm (không hợp lệ: ${invalidWeights.map((w) => w.type).join(', ')}).`,
    )
  }

  const sum = strategyWeights.reduce((total, w) => total + w.weight, 0)
  if (sum === 0) {
    reasons.push('Tổng trọng số không được bằng 0.')
  }

  const byType = new Map(strategies.map((s) => [s.type, s]))
  const domains = new Set(strategyWeights.map((w) => byType.get(w.type)?.domain).filter(Boolean))
  const hasDirectional = [...domains].some((d) => d && DIRECTIONAL_DOMAINS.has(d))
  const hasConfirmation = [...domains].some((d) => d && CONFIRMATION_DOMAINS.has(d))
  if (!hasDirectional) {
    reasons.push('Cần ít nhất 1 strategy định hướng (domain TREND hoặc STRUCTURE — vd. MA, Support/Resistance).')
  }
  if (!hasConfirmation) {
    reasons.push('Cần ít nhất 1 strategy xác nhận (domain MOMENTUM hoặc VOLATILITY — vd. RSI, Bollinger).')
  }

  return { valid: reasons.length === 0, reasons }
}

/**
 * Owns the strategy catalog (`GET /strategy-plugin/strategies`) plus the
 * user's current Search selection + weights, so the Strategy Engine tab
 * and a later Backtest tab (`strategyWeights` -> `POST
 * /strategy-search/experiments`) read the same live state without a
 * second fetch or a backend endpoint to store it — this is pure client
 * app state, never persisted server-side.
 */
export function StrategySelectionProvider({ children }: { children: ReactNode }) {
  const [strategies, setStrategies] = useState<StrategyCatalogItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const [weights, setWeights] = useState<Record<string, number>>({})
  const [confirmed, setConfirmed] = useState(false)
  const [catalogRev, setCatalogRev] = useState(0)
  const refreshStrategies = useCallback(() => setCatalogRev((n) => n + 1), [])

  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()

    setLoading(true)
    setError(null)

    apiFetch<StrategyCatalogItem[]>('/strategy-plugin/strategies', { signal: controller.signal })
      .then((catalog) => {
        if (cancelled) return
        setStrategies(catalog)
        // Default: every strategy included, equal weight — mirrors the
        // backend's own default when `strategyWeights` is omitted
        // (artifacts/api-contract.md §2: "chia đều").
        // Default only what is NEW. A refresh (e.g. after saving an AI
        // strategy) must not silently reset ticks and weights the user has
        // already adjusted — it should just make the new strategy appear,
        // selected, alongside them.
        const equalWeight = catalog.length > 0 ? 1 / catalog.length : 0
        setSelected((prev) => {
          const next = { ...prev }
          for (const item of catalog) if (!(item.type in next)) next[item.type] = true
          return next
        })
        setWeights((prev) => {
          const next = { ...prev }
          for (const item of catalog) if (!(item.type in next)) next[item.type] = equalWeight
          return next
        })
      })
      .catch((err: unknown) => {
        if (cancelled || controller.signal.aborted) return
        setError(err instanceof Error ? err.message : 'Không tải được danh sách strategy.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
      controller.abort()
    }
    // Re-runs when refreshStrategies() bumps catalogRev — e.g. right after
    // the AI Strategy tab saves a new strategy.
  }, [catalogRev])

  const toggleSelected = useCallback((type: SearchStrategyType) => {
    setSelected((prev) => ({ ...prev, [type]: !prev[type] }))
    setConfirmed(false)
  }, [])

  const setWeight = useCallback((type: SearchStrategyType, weight: number) => {
    setWeights((prev) => ({ ...prev, [type]: weight }))
    setConfirmed(false)
  }, [])

  const strategyWeights = useMemo<StrategyWeight[]>(
    () =>
      strategies
        .filter((s) => selected[s.type])
        .map((s) => ({ type: s.type, weight: weights[s.type] ?? 0 })),
    [strategies, selected, weights],
  )

  const validation = useMemo(() => computeValidation(strategyWeights, strategies), [strategyWeights, strategies])

  const confirmSelection = useCallback(() => {
    if (validation.valid) setConfirmed(true)
  }, [validation.valid])

  const value = useMemo<StrategySelectionContextValue>(
    () => ({
      strategies,
      loading,
      error,
      selected,
      weights,
      toggleSelected,
      setWeight,
      strategyWeights,
      refreshStrategies,
      validation,
      confirmed,
      confirmSelection,
    }),
    [strategies, loading, error, selected, weights, toggleSelected, setWeight, strategyWeights, refreshStrategies, validation, confirmed, confirmSelection],
  )

  return <StrategySelectionContext.Provider value={value}>{children}</StrategySelectionContext.Provider>
}

export function useStrategySelection(): StrategySelectionContextValue {
  const ctx = useContext(StrategySelectionContext)
  if (!ctx) {
    throw new Error('useStrategySelection must be used within a <StrategySelectionProvider>.')
  }
  return ctx
}
