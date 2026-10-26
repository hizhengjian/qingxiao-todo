/* Android-only UI. The web app does not expose launcher controls. */
(() => {
  if (!native || typeof Native.widgetSettings !== 'function') return;
  const baseSettings = settings;
  settings = function () {
    baseSettings();
    const body = $('panel').querySelector('.panel-body');
    body.querySelector('strong').textContent = '轻效 Todo · ' + Native.appVersion();
    const row = document.createElement('div');
    row.className = 'settings-row';
    row.innerHTML = '<button onclick="Native.widgetSettings()">▦ 四象限桌面小组件</button><small>在手机桌面查看待办，支持滚动、点开事项与快速新增。</small>';
    body.children[0].after(row);
  };
  window.openWidgetTarget = function (q, add, id) {
    if (!$('overlay').hidden) document.activeElement?.blur();
    if (dirty && !confirm('放弃未保存的修改，打开桌面事项？')) return;
    // A pending textarea change must not mark the closed editor dirty again.
    $('panel').oninput = null;
    $('panel').onchange = null;
    closePanel(true);
    // The background sync job may have updated local records while this page was paused.
    load();
    go('matrix');
    if (q >= 0 && q < 4) expandQuadrant(q);
    if (add) editItem(null, q >= 0 && q < 4 ? q : 1);
    else if (id) {
      const item = db.items.find(t => t.id === id && !t.deleted && !t.purged);
      if (item) { treeLocate(id); treeExpanded.add(id); render(); }
      else toast('这条事项已删除，已显示最新四象限');
    }
  };
})();
