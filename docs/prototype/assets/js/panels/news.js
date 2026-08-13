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
        <h3>${n.title}</h3>
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
          <button type="button" class="btn primary" id="enable-sentiment">Bật SentimentStrategy</button>
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
