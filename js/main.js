/* 启动入口 */
(function () {
  'use strict';

  function boot() {
    if (!window.MK || !MK.state || !MK.ui || !MK.parent) {
      var screen = document.getElementById('screen');
      if (screen) {
        screen.innerHTML = '<div class="screen-pad"><div class="card card-soft center">' +
          '<p class="bold">游戏文件没有加载完整。</p>' +
          '<p class="small muted">请确认 js 文件夹里的脚本都在，然后刷新页面。</p>' +
        '</div></div>';
      }
      return;
    }

    MK.state.init();
    MK.ui.init();
    MK.parent.init();
    MK.ui.applySettings();
    MK.ui.renderHome();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
