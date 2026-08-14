(function (global) {
  global.CSLPanels = global.CSLPanels || {};

  function sentimentClass(sentiment) {
    if (sentiment === 'POSITIVE') return 'pos';
    if (sentiment === 'NEGATIVE') return 'neg';
    return 'neu';
  }

  function mount(root) {
    const news = (global.CSLMock && global.CSLMock.news) || [];
    const items = news
      .map(
        (n) => `
      <article class="news-item">
        <div class="news-item-title">
          <h3>${n.title}</h3>
          <a class="news-link" href="${n.url}" target="_blank" rel="noopener noreferrer" title="Mở ${n.source}" aria-label="Mở bài viết trên ${n.source}">
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path fill="currentColor" d="M6.5 3.5H3.75A1.75 1.75 0 0 0 2 5.25v7A1.75 1.75 0 0 0 3.75 14h7A1.75 1.75 0 0 0 12.5 12.25V9.5a.75.75 0 0 0-1.5 0v2.75a.25.25 0 0 1-.25.25h-7a.25.25 0 0 1-.25-.25v-7a.25.25 0 0 1 .25-.25H6.5a.75.75 0 0 0 0-1.5Zm3.22 0H14v4.28a.75.75 0 0 0 1.5 0V2.75A.75.75 0 0 0 14.75 2H8.72a.75.75 0 0 0 0 1.5Zm3.03.53L7.22 9.56a.75.75 0 1 0 1.06 1.06l5.47-5.47Z"/>
            </svg>
          </a>
        </div>
        <div class="news-meta">${n.source} · ${n.when} · <span class="badge ${sentimentClass(n.sentiment)}">${n.sentiment}</span></div>
      </article>`,
      )
      .join('');

    root.innerHTML = `
      <div class="news-panel">
        <div class="sentiment-block">
          <div class="sentiment-row">
            <span>Positive</span>
            <div class="track"><i class="pos"></i></div>
            <strong>42%</strong>
          </div>
          <div class="sentiment-row">
            <span>Neutral</span>
            <div class="track"><i class="neu"></i></div>
            <strong>38%</strong>
          </div>
          <div class="sentiment-row">
            <span>Negative</span>
            <div class="track"><i class="neg"></i></div>
            <strong>20%</strong>
          </div>
          <p style="margin: 1rem 0; font-size: 0.8rem; color: var(--text-muted)">
            Pipeline: Collect → Store → Analyze. Crawler không gắn cứng ML model.
          </p>
          <button type="button" class="btn-cta" id="enable-sentiment">Bật Sentiment Strategy</button>
        </div>
        <div class="news-list">${items}</div>
      </div>`;

    const btn = root.querySelector('#enable-sentiment');
    if (btn) {
      btn.addEventListener('click', () => {
        sessionStorage.setItem('csl-enable-sentiment', '1');
        global.dispatchEvent(
          new CustomEvent('csl-open-panel', { detail: { panel: 'lab', forceOpen: true } }),
        );
      });
    }
  }

  global.CSLPanels.news = {
    title: 'News',
    mount: mount,
  };
})(window);
