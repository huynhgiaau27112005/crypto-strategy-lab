(function (global) {
  const frame = document.getElementById('app-frame');
  const dock = document.getElementById('right-dock');
  const dockTitle = document.getElementById('dock-title');
  const dockBody = document.getElementById('dock-body');
  const dockClose = document.getElementById('dock-close');
  const buttons = Array.from(document.querySelectorAll('[data-panel-btn]'));

  let active = null; // 'lab' | 'strategy' | 'news' | null

  function setRailPressed(id) {
    buttons.forEach((btn) => {
      const on = btn.getAttribute('data-panel-btn') === id;
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }

  function closeDock() {
    active = null;
    setRailPressed(null);
    if (dock) dock.hidden = true;
    if (frame) frame.dataset.dock = 'closed';
    if (dockBody) dockBody.innerHTML = '';
  }

  function openPanel(id, opts) {
    const forceOpen = opts && opts.forceOpen;
    const panels = global.CSLPanels || {};
    const panel = panels[id];
    if (!panel || !panel.mount) return;

    if (active === id && !forceOpen) {
      closeDock();
      return;
    }

    active = id;
    setRailPressed(id);
    if (dock) dock.hidden = false;
    if (frame) frame.dataset.dock = 'open';
    if (dockTitle) dockTitle.textContent = panel.title || id;
    if (dockBody) {
      dockBody.innerHTML = '';
      panel.mount(dockBody);
    }
  }

  buttons.forEach((btn) => {
    btn.addEventListener('click', () => {
      openPanel(btn.getAttribute('data-panel-btn'));
    });
  });
  if (dockClose) dockClose.addEventListener('click', closeDock);

  global.addEventListener('csl-open-panel', (e) => {
    const detail = e.detail || {};
    if (!detail.panel) return;
    openPanel(detail.panel, { forceOpen: !!detail.forceOpen });
  });

  global.CSLApp = {
    openPanel: openPanel,
    closeDock: closeDock,
    getActivePanel: function () {
      return active;
    },
  };
})(window);
