import { useNavigate } from 'react-router-dom'
import BlueprintCorners from '../components/BlueprintCorners'
import { useStrategySelection } from '../state/StrategySelectionContext'
import { useAiProvider } from '../hooks/useAiProvider'
import { useAiStrategy } from '../hooks/useAiStrategy'
import type { AiValidationCheckDto, StrategyDomain } from '../api/types'

const CHECK_LABEL: Record<AiValidationCheckDto['key'], string> = {
  parses: 'Cú pháp Python hợp lệ',
  contract: 'Đúng contract generate_signals(candles)',
  safety: 'An toàn tĩnh (không import/gọi nằm ngoài allowlist)',
  smoke: 'Smoke run trên dữ liệu mẫu',
}

// Required at save time so a saved AI strategy can be combined into
// Strategy Search (a candidate needs at least one directional + one
// confirmation domain — see artifacts/ai-strategy.md "Domain assignment").
// TREND/STRUCTURE decide entry direction, MOMENTUM/VOLATILITY confirm it.
const DOMAIN_OPTIONS: Array<{ value: StrategyDomain; label: string }> = [
  { value: 'TREND', label: 'TREND (định hướng)' },
  { value: 'STRUCTURE', label: 'STRUCTURE (định hướng)' },
  { value: 'MOMENTUM', label: 'MOMENTUM (xác nhận)' },
  { value: 'VOLATILITY', label: 'VOLATILITY (xác nhận)' },
]

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('vi-VN', { year: 'numeric', month: '2-digit', day: '2-digit' })
}

export default function AiStrategyPage() {
  const navigate = useNavigate()
  const ai = useAiStrategy()
  const provider = useAiProvider()

  const generating = ai.generateState === 'generating'
  const { refreshStrategies } = useStrategySelection()
  const saving = ai.saveState === 'saving'
  const canSave = !!ai.validation?.valid && ai.saveName.trim().length > 0 && !!ai.domain && !saving

  const aiStatus = generating
    ? 'Đang sinh…'
    : ai.generateState === 'error'
      ? 'Lỗi sinh strategy'
      : ai.code
        ? `Đã sinh${ai.providerName ? ` · provider ${ai.providerName}` : ''}`
        : 'Chưa sinh strategy'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* A missing/misnamed API key is otherwise invisible: the fallback
          provider returns canned but perfectly valid Python. */}
      {provider && !provider.live ? (
        <div className="ai-provider-warning blueprint">
          <BlueprintCorners />
          <strong>Đang dùng provider giả lập ({provider.name}).</strong> Code Python sinh ra là code
          mẫu cố định, KHÔNG gọi LLM thật — vì backend chưa đọc được API key nào. Đặt{' '}
          <code>OPENAI_API_KEY</code> hoặc <code>OPENROUTER_API_KEY</code> trong{' '}
          <code>service/.env</code> rồi khởi động lại API (xem <code>service/.env.example</code>).
        </div>
      ) : provider ? (
        <div className="text-muted mono" style={{ fontSize: 11 }}>
          LLM: {provider.name} · {provider.model} · key từ {provider.keySource}
        </div>
      ) : null}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-start' }}>
        {/* Left column: prompt + samples */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0, flex: '1 1 300px', maxWidth: 380 }}>
          <div className="blueprint" style={{ padding: 14 }}>
            <BlueprintCorners />
            <h4 style={{ fontSize: 16, margin: '0 0 2px' }}>Mô tả strategy</h4>
            <p className="text-muted" style={{ fontSize: 12, margin: '0 0 12px' }}>
              Viết bằng ngôn ngữ tự nhiên. AI sinh file Python riêng cho tài khoản của bạn.
            </p>
            <textarea
              className="input"
              rows={7}
              value={ai.prompt}
              onChange={(e) => ai.setPrompt(e.target.value)}
              style={{ fontSize: 13, lineHeight: 1.5 }}
            />
            <div
              className="text-muted mono"
              style={{ fontSize: 11, textAlign: 'right', marginTop: 4 }}
            >
              {ai.prompt.length} / 1000
            </div>
            {ai.generateError ? (
              <p className="text-muted" style={{ fontSize: 12, color: 'var(--color-down, #c0392b)' }}>
                {ai.generateError}
              </p>
            ) : null}
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button
                type="button"
                className="btn btn-primary blueprint"
                style={{ flex: 1, height: 40 }}
                disabled={!ai.prompt.trim() || generating}
                onClick={() => void ai.generate()}
              >
                <BlueprintCorners />
                {generating ? 'Đang sinh…' : 'Sinh strategy'}
              </button>
              <button type="button" className="btn btn-secondary" style={{ height: 40 }} onClick={ai.clearPrompt}>
                Xóa
              </button>
            </div>
          </div>

          <div className="blueprint" style={{ padding: 14 }}>
            <BlueprintCorners />
            <h4 style={{ fontSize: 16, margin: '0 0 8px' }}>Mẫu mô tả</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {ai.samples.length === 0 ? (
                <p className="text-muted" style={{ fontSize: 12 }}>
                  Đang tải mẫu…
                </p>
              ) : (
                ai.samples.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className="btn btn-secondary"
                    style={{
                      textAlign: 'left',
                      justifyContent: 'flex-start',
                      fontFamily: 'var(--font-body)',
                      fontSize: 12,
                      lineHeight: 1.4,
                      padding: '8px 10px',
                      height: 'auto',
                    }}
                    onClick={() => ai.useSample(s)}
                  >
                    {s}
                  </button>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Middle column: generated code */}
        <div className="blueprint" style={{ padding: '14px 16px', minWidth: 0, flex: '2 1 420px' }}>
          <BlueprintCorners />
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <h4 style={{ fontSize: 16, margin: 0 }}>Python strategy sinh ra</h4>
            <div style={{ flex: 1 }} />
            <span className="tag tag-outline">{aiStatus}</span>
          </div>
          {ai.code ? (
            <textarea
              className="input mono"
              value={ai.code}
              onChange={(e) => void ai.editCode(e.target.value)}
              spellCheck={false}
              style={{
                margin: 0,
                background: 'var(--color-accent-900)',
                color: '#dfe6ee',
                fontFamily: "'IBM Plex Mono', monospace",
                fontSize: 12.5,
                lineHeight: 1.65,
                padding: 16,
                minHeight: 420,
                maxHeight: 520,
                overflow: 'auto',
                whiteSpace: 'pre',
                resize: 'vertical',
                width: '100%',
                boxSizing: 'border-box',
                border: 'none',
              }}
            />
          ) : (
            <div
              className="text-muted"
              style={{
                background: 'var(--color-accent-900)',
                padding: 16,
                minHeight: 200,
                fontSize: 12.5,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              Chưa có strategy nào được sinh — nhập mô tả và bấm "Sinh strategy".
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ height: 36 }}
              disabled={!ai.code}
              onClick={() => {
                const blob = new Blob([ai.code], { type: 'text/x-python' })
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url
                a.download = `${ai.saveName.trim() || 'ai_strategy'}.py`
                a.click()
                URL.revokeObjectURL(url)
              }}
            >
              Tải file .py
            </button>
            <button type="button" className="btn btn-secondary" style={{ height: 36 }} onClick={() => navigate('/app/strategy')}>
              Xem trong Strategy Engine
            </button>
          </div>
        </div>

        {/* Right column: validation + save */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0, flex: '1 1 240px', maxWidth: 300 }}>
          <div className="blueprint" style={{ padding: 14 }}>
            <BlueprintCorners />
            <h4 style={{ fontSize: 16, margin: '0 0 10px' }}>Kiểm tra & validation</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {ai.validating ? (
                <p className="text-muted" style={{ fontSize: 12 }}>
                  Đang kiểm tra…
                </p>
              ) : !ai.validation ? (
                <p className="text-muted" style={{ fontSize: 12 }}>
                  Chưa có kết quả kiểm tra — sinh hoặc dán code để xem.
                </p>
              ) : (
                ai.validation.checks.map((c) => (
                  <div
                    key={c.key}
                    style={{
                      display: 'flex',
                      gap: 10,
                      alignItems: 'flex-start',
                      fontSize: 12,
                      paddingBottom: 8,
                      borderBottom: '1px solid color-mix(in srgb, var(--color-text) 8%, transparent)',
                    }}
                  >
                    <span style={{ color: c.passed ? 'var(--color-up, #2e8b57)' : 'var(--color-down, #c0392b)' }}>
                      {c.passed ? '✓' : '✗'}
                    </span>
                    <span>
                      <strong style={{ display: 'block', fontWeight: 500 }}>{CHECK_LABEL[c.key]}</strong>
                      <span className="text-muted">{c.message}</span>
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="blueprint" style={{ padding: 14 }}>
            <BlueprintCorners />
            <h4 style={{ fontSize: 16, margin: '0 0 10px' }}>Lưu vào thư viện</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div className="field">
                <label>Tên strategy</label>
                <input
                  className="input"
                  type="text"
                  placeholder="vd. RSI_BB_LONG_SL2_TP4"
                  value={ai.saveName}
                  onChange={(e) => ai.setSaveName(e.target.value)}
                />
              </div>
              <div className="field">
                <label>Version</label>
                <input className="input" type="text" value="Tự động khi lưu" disabled readOnly />
              </div>
              <div className="field">
                <label>Domain (bắt buộc để đưa vào Search)</label>
                <select
                  className="input"
                  value={ai.domain}
                  onChange={(e) => ai.setDomain(e.target.value as typeof ai.domain)}
                >
                  <option value="">— Chọn domain —</option>
                  {DOMAIN_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              {ai.saveError ? (
                <p className="text-muted" style={{ fontSize: 11, color: 'var(--color-down, #c0392b)' }}>
                  {ai.saveError}
                </p>
              ) : null}
              {ai.saveState === 'done' && ai.savedDetail ? (
                <p className="text-muted" style={{ fontSize: 11 }}>
                  Đã lưu "{ai.savedDetail.name}" v{ai.savedDetail.version}.
                </p>
              ) : null}
              <button
                type="button"
                className="btn btn-primary blueprint"
                style={{ height: 40 }}
                disabled={!canSave}
                onClick={() => {
                  // Refresh the shared strategy catalog after a successful
                  // save so the new strategy shows up under "Strategy do AI
                  // generate" on the Strategy Engine tab immediately,
                  // instead of only after a full page reload.
                  void ai.save().then(() => refreshStrategies())
                }}
              >
                <BlueprintCorners />
                {saving ? 'Đang lưu…' : 'Lưu strategy'}
              </button>
              <p className="text-muted" style={{ fontSize: 11, margin: 0, lineHeight: 1.5 }}>
                Strategy sau khi lưu sẽ xuất hiện ở nhóm "Strategy do AI generate" trong tab Strategy Engine,
                có thể tick chọn và gán trọng số như strategy hệ thống, rồi đưa vào sinh tổ hợp (Search).
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="blueprint" style={{ padding: '14px 16px' }}>
        <BlueprintCorners />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <h4 style={{ fontSize: 16, margin: 0 }}>Strategy AI của tài khoản</h4>
          <div style={{ flex: 1 }} />
          {ai.runError ? <span className="text-muted" style={{ fontSize: 12 }}>{ai.runError}</span> : null}
        </div>
        {ai.mineLoading ? (
          <p className="text-muted">Đang tải…</p>
        ) : ai.mineError ? (
          <p className="text-muted">Lỗi: {ai.mineError}</p>
        ) : ai.mine.length === 0 ? (
          <p className="text-muted" style={{ fontSize: 12 }}>
            Chưa có strategy nào do AI sinh cho tài khoản này.
          </p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Tên strategy</th>
                <th>Ngày tạo</th>
                <th>Version</th>
                <th>Domain</th>
                <th>Trạng thái</th>
                <th style={{ textAlign: 'right' }}>Hành động</th>
              </tr>
            </thead>
            <tbody>
              {ai.mine.map((s) => (
                <tr key={s.id}>
                  <td style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 13 }}>{s.name}</td>
                  <td style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 13 }}>{fmtDate(s.createdAt)}</td>
                  <td style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 13 }}>v{s.version}</td>
                  <td style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 13 }}>{s.domain ?? '—'}</td>
                  <td>
                    <span className={`tag ${s.isActive ? 'tag-accent' : 'tag-neutral'}`}>
                      {s.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      style={{ fontSize: 12 }}
                      disabled={ai.runState === 'running'}
                      onClick={() => void ai.runSaved(s.id)}
                    >
                      {ai.runState === 'running' ? 'Đang chạy…' : 'Chạy thử'}
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      style={{ fontSize: 12 }}
                      onClick={() => navigate('/app/strategy')}
                    >
                      Xem plugin
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {ai.runResult ? (
          <p className="text-muted mono" style={{ fontSize: 12, marginTop: 10 }}>
            Kết quả chạy thử: {ai.runResult.candleCount} nến →{' '}
            {ai.runResult.signals.filter((s) => s === 'BUY').length} BUY /{' '}
            {ai.runResult.signals.filter((s) => s === 'SELL').length} SELL /{' '}
            {ai.runResult.signals.filter((s) => s === 'HOLD').length} HOLD
          </p>
        ) : null}
      </div>
    </div>
  )
}
