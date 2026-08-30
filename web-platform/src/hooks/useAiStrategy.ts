import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '../api/client'
import type {
  AiStrategyDetailDto,
  AiStrategySummaryDto,
  AiValidationResultDto,
  RunAiStrategyResponse,
  StrategyDomain,
} from '../api/types'
import { useAiGenerate } from '../state/AiGenerateContext'

export type AiGenerateState = 'idle' | 'generating' | 'done' | 'error'
export type AiSaveState = 'idle' | 'saving' | 'done' | 'error'

/**
 * Drives the whole AI Strategy tab: samples, generate, validate-as-you-edit,
 * save (creates a new version row — see AiStrategyRepository.createVersion),
 * and the "Strategy AI của tài khoản" table (GET /ai-strategy/mine).
 *
 * No business logic lives here beyond orchestrating these calls and holding
 * their results — the validation/version rules themselves live server-side
 * (docs/about-projects anti-pattern: business logic must not live in the
 * frontend).
 */
export function useAiStrategy() {
  const { job, state: pollState, error: enqueueError, enqueueGenerate } = useAiGenerate()

  const [samples, setSamples] = useState<string[]>([])
  const [prompt, setPrompt] = useState('')

  const [code, setCode] = useState('')
  const [providerName, setProviderName] = useState<string | null>(null)
  const [validation, setValidation] = useState<AiValidationResultDto | null>(null)
  const [validating, setValidating] = useState(false)

  const [saveName, setSaveName] = useState('')
  // Required before Save is enabled — see AiStrategyPage's domain select
  // and ai-strategy.dto.ts's saveStrategySchema (backend rejects a missing
  // domain; this mirrors that requirement for the UI's disabled state,
  // never as the actual enforcement).
  const [domain, setDomain] = useState<StrategyDomain | ''>('')
  const [saveState, setSaveState] = useState<AiSaveState>('idle')
  const [saveError, setSaveError] = useState<string | null>(null)
  const [savedDetail, setSavedDetail] = useState<AiStrategyDetailDto | null>(null)

  const [mine, setMine] = useState<AiStrategySummaryDto[]>([])
  const [mineLoading, setMineLoading] = useState(true)
  const [mineError, setMineError] = useState<string | null>(null)

  const [runState, setRunState] = useState<'idle' | 'running' | 'done' | 'error'>('idle')
  const [runError, setRunError] = useState<string | null>(null)
  const [runResult, setRunResult] = useState<RunAiStrategyResponse | null>(null)

  const refreshMine = useCallback(async () => {
    setMineLoading(true)
    setMineError(null)
    try {
      const rows = await apiFetch<AiStrategySummaryDto[]>('/ai-strategy/mine')
      setMine(rows)
    } catch (err) {
      setMineError(err instanceof Error ? err.message : 'Không tải được danh sách strategy AI.')
    } finally {
      setMineLoading(false)
    }
  }, [])

  useEffect(() => {
    apiFetch<{ samples: string[] }>('/ai-strategy/samples')
      .then((res) => setSamples(res.samples))
      .catch(() => setSamples([]))
    void refreshMine()
  }, [refreshMine])

  const setPromptBounded = useCallback((value: string) => {
    setPrompt(value.slice(0, 1000))
  }, [])

  const useSample = useCallback((sample: string) => {
    setPrompt(sample.slice(0, 1000))
  }, [])

  const clearPrompt = useCallback(() => {
    setPrompt('')
  }, [])

  const generateState: AiGenerateState =
    pollState === 'error' || job?.status === 'FAILED'
      ? 'error'
      : job?.status === 'RUNNING' || pollState === 'polling'
        ? 'generating'
        : job?.result
          ? 'done'
          : 'idle'

  const generateError = job?.status === 'FAILED' ? (job.error ?? enqueueError) : enqueueError

  const generate = useCallback(async () => {
    if (!prompt.trim() || generateState === 'generating') return
    setSaveState('idle')
    setSaveError(null)
    setSavedDetail(null)
    setRunState('idle')
    setRunResult(null)
    setCode('')
    setValidation(null)
    setProviderName(null)
    await enqueueGenerate(prompt.trim())
  }, [prompt, generateState, enqueueGenerate])

  // Hydrate from the workspace-scoped job. Deps are jobId + status only so a
  // later hand-edit is not overwritten by a late poll of the same completed job.
  // Remount (tab switch / refresh) starts with empty local code and re-applies.
  useEffect(() => {
    if (!job) return

    if (job.status === 'RUNNING') {
      setPromptBounded(job.prompt)
      return
    }

    if (job.status === 'COMPLETED' && job.result) {
      setPromptBounded(job.prompt)
      if (code === '') {
        setCode(job.result.code)
        setValidation(job.result.validation)
        setProviderName(job.result.providerName)
      }
    }
    // jobId + status + code — a late poll of the same COMPLETED job must not wipe a hand-edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- plan: hydrate key is jobId + status; code guards overwrite
  }, [job?.jobId, job?.status, code, setPromptBounded])

  // Re-validate whenever the code panel is hand-edited, so the checklist
  // never shows a stale result for code the user has since changed.
  const editCode = useCallback(async (nextCode: string) => {
    setCode(nextCode)
    setSaveState('idle')
    setSaveError(null)
    setSavedDetail(null)
    if (!nextCode.trim()) {
      setValidation(null)
      return
    }
    setValidating(true)
    try {
      const result = await apiFetch<AiValidationResultDto>('/ai-strategy/validate', {
        method: 'POST',
        body: JSON.stringify({ code: nextCode }),
      })
      setValidation(result)
    } catch (err) {
      setValidation({
        valid: false,
        checks: [{ key: 'parses', passed: false, message: err instanceof Error ? err.message : 'Validate thất bại.' }],
      })
    } finally {
      setValidating(false)
    }
  }, [])

  const save = useCallback(async () => {
    if (!saveName.trim() || !code.trim() || !domain || saveState === 'saving') return
    setSaveState('saving')
    setSaveError(null)
    try {
      const detail = await apiFetch<AiStrategyDetailDto>('/ai-strategy/save', {
        method: 'POST',
        body: JSON.stringify({ name: saveName.trim(), code, domain }),
      })
      setSavedDetail(detail)
      setSaveState('done')
      await refreshMine()
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Lưu strategy thất bại.')
      setSaveState('error')
    }
  }, [saveName, code, domain, saveState, refreshMine])

  const runSaved = useCallback(async (id: string, timeframe = '1h', limit = 200) => {
    setRunState('running')
    setRunError(null)
    try {
      const result = await apiFetch<RunAiStrategyResponse>(`/ai-strategy/${id}/run`, {
        method: 'POST',
        body: JSON.stringify({ timeframe, limit }),
      })
      setRunResult(result)
      setRunState('done')
    } catch (err) {
      setRunError(err instanceof Error ? err.message : 'Chạy strategy thất bại.')
      setRunState('error')
    }
  }, [])

  return {
    samples,
    prompt,
    setPrompt: setPromptBounded,
    useSample,
    clearPrompt,

    generateState,
    generateError,
    code,
    providerName,
    validation,
    validating,
    generate,
    editCode,

    saveName,
    setSaveName,
    domain,
    setDomain,
    saveState,
    saveError,
    savedDetail,
    save,

    mine,
    mineLoading,
    mineError,
    refreshMine,

    runState,
    runError,
    runResult,
    runSaved,
  }
}
