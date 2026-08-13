(function (global) {
  const dockBody = document.getElementById('dock-body');
  const tabs = Array.from(document.querySelectorAll('[data-panel-tab]'));

  let active = null; // 'lab' | 'strategy' | 'news'

  function resizeChartsSoon() {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (global.CSLCharts && typeof global.CSLCharts.resizeAll === 'function') {
          global.CSLCharts.resizeAll();
        }
      });
    });
  }

  function setTabSelected(id) {
    tabs.forEach((tab) => {
      const on = tab.getAttribute('data-panel-tab') === id;
      tab.setAttribute('aria-selected', on ? 'true' : 'false');
    });
  }

  function openPanel(id) {
    const panels = global.CSLPanels || {};
    const panel = panels[id];
    if (!panel || !panel.mount) return;
    if (active === id) return;

    active = id;
    setTabSelected(id);
    if (dockBody) {
      dockBody.innerHTML = '';
      panel.mount(dockBody);
    }
    resizeChartsSoon();
  }

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      openPanel(tab.getAttribute('data-panel-tab'));
    });
  });

  global.addEventListener('csl-open-panel', (e) => {
    const detail = e.detail || {};
    if (!detail.panel) return;
    openPanel(detail.panel);
  });

  // Permanent right dock: always show Lab on load.
  openPanel('lab');
  resizeChartsSoon();

  global.CSLApp = {
    openPanel: openPanel,
    closeDock: function () {
      /* dock is permanent — keep API for callers */
    },
    getActivePanel: function () {
      return active;
    },
  };
})(window);
