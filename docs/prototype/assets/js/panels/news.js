(function (global) {
  global.CSLPanels = global.CSLPanels || {};
  global.CSLPanels.news = {
    title: 'News',
    mount: function (root) {
      root.innerHTML = '<p class="panel-placeholder">News panel</p>';
    },
  };
})(window);
