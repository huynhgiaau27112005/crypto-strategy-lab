/**
 * The dark "CRYPTO STRATEGY LAB" hero panel from the prototype's login
 * screen (docs/ui-prototype/.../Crypto Strategy Lab.dc.html, lines 38-68).
 * Reused as-is on both the landing page and the left column of /auth so
 * the two screens share one visual identity instead of drifting apart.
 * Every Vietnamese string below is copied verbatim from the prototype.
 */
export default function HeroPanel() {
  return (
    <div className="hero-panel">
      <div className="hero-brand">
        <div className="hero-logo">CSL</div>
        <div className="hero-wordmark">
          CRYPTO
          <br />
          STRATEGY LAB
        </div>
      </div>

      <div className="hero-copy">
        <div className="hero-kicker">Đồ án kiến trúc phần mềm</div>
        <h1 className="hero-title">
          Phân tích, kết hợp và đánh giá chiến lược giao dịch BTC
        </h1>
        <p className="hero-desc">
          Chart realtime đa khung thời gian, strategy dạng plugin, tổng hợp tín hiệu bằng
          weighted voting, backtest có phí và slippage, xếp hạng tổ hợp bằng Domain-guide
          Random Search.
        </p>
      </div>

      <div className="hero-stats">
        <div className="hero-stat">
          <div className="hero-stat-value">BTC</div>
          <div className="hero-stat-label">Coin duy nhất trong phạm vi</div>
        </div>
        <div className="hero-stat">
          <div className="hero-stat-value">4</div>
          <div className="hero-stat-label">Khung thời gian / màn hình</div>
        </div>
        <div className="hero-stat">
          <div className="hero-stat-value">7 + AI</div>
          <div className="hero-stat-label">Strategy plugin</div>
        </div>
        <div className="hero-stat">
          <div className="hero-stat-value">1</div>
          <div className="hero-stat-label">Domain-guide Random Search</div>
        </div>
      </div>
    </div>
  )
}
