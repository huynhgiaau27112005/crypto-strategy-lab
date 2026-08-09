(function () {
  const STORAGE_KEY = 'csl-theme';
  const EXCHANGE_KEY = 'csl-exchange';
  const PAIR_KEY = 'csl-pair';
  const root = document.documentElement;

  function applyTheme(theme) {
    const next = theme === 'light' ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    localStorage.setItem(STORAGE_KEY, next);
    document.querySelectorAll('[data-theme-label]').forEach((el) => {
      el.textContent = next === 'dark' ? 'Dark' : 'Light';
    });
    window.dispatchEvent(
      new CustomEvent('csl-theme-change', { detail: { theme: next } }),
    );
  }

  const saved = localStorage.getItem(STORAGE_KEY);
  applyTheme(saved === 'light' ? 'light' : 'dark');

  document.querySelectorAll('[data-theme-toggle]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const current = root.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
      applyTheme(current === 'dark' ? 'light' : 'dark');
    });
  });

  const file = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
  document.querySelectorAll('.workspace-nav a[data-nav]').forEach((link) => {
    const target = (link.getAttribute('data-nav') || '').toLowerCase();
    if (target && target === file) link.classList.add('active');
  });

  const exchange = localStorage.getItem(EXCHANGE_KEY) || 'binance';
  const pair = localStorage.getItem(PAIR_KEY) || 'BTCUSDT';
  document.querySelectorAll('[data-exchange]').forEach((el) => {
    el.value = exchange;
    el.addEventListener('change', () => {
      localStorage.setItem(EXCHANGE_KEY, el.value);
      window.dispatchEvent(
        new CustomEvent('csl-market-change', {
          detail: { exchange: el.value, pair: localStorage.getItem(PAIR_KEY) || 'BTCUSDT' },
        }),
      );
    });
  });
  document.querySelectorAll('[data-pair]').forEach((el) => {
    el.value = pair;
    el.addEventListener('change', () => {
      localStorage.setItem(PAIR_KEY, el.value);
      document.querySelectorAll('[data-pair-label]').forEach((label) => {
        label.textContent = el.value;
      });
      window.dispatchEvent(
        new CustomEvent('csl-market-change', {
          detail: {
            exchange: localStorage.getItem(EXCHANGE_KEY) || 'binance',
            pair: el.value,
          },
        }),
      );
    });
  });
  document.querySelectorAll('[data-pair-label]').forEach((label) => {
    label.textContent = pair;
  });
})();
