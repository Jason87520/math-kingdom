/* 页面渲染与闯关流程 */
(function () {
  'use strict';

  var screenEl = null;
  var modalRoot = null;
  var toastEl = null;

  var current = null;          // { question, mode, wrongCount, hintsShown }
  var lastResult = null;       // 结算页数据
  var reviewQueue = [];
  var reviewIndex = 0;
  var inputValue = '';
  var questionActive = false;
  var timer = { start: 0, paused: 0, hiddenAt: 0, manualPausedAt: 0 };
  var confirmCallback = null;
  var modalCleanup = null;
  var toastTimer = null;
  var hourglassTimer = null;

  /* ---------- 工具 ---------- */
  function esc(value) {
    return String(value === null || value === undefined ? '' : value).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function formatMs(ms) {
    var total = Math.round((Number(ms) || 0) / 1000);
    if (total < 60) return total + ' 秒';
    var m = Math.floor(total / 60);
    var s = total % 60;
    if (m < 60) return m + ' 分' + (s ? ' ' + s + ' 秒' : '');
    var h = Math.floor(m / 60);
    var mm = m % 60;
    return h + ' 小时' + (mm ? ' ' + mm + ' 分' : '');
  }

  function formatPercent(v) {
    if (v === null || v === undefined || !Number.isFinite(Number(v))) return '—';
    return Math.round(Number(v) * 100) + '%';
  }

  function typeLabel(type) {
    var m = MK.state.TYPE_META[type];
    return m ? m.label : type;
  }

  function typeEmoji(q) {
    if (q && q.type === 'classic') {
      if (q.subtype === 'chicken-rabbit') return '🐔';
      if (q.subtype === 'planting') return '🌳';
      if (q.subtype === 'travel') return '🚶';
      return '🧩';
    }
    var m = MK.state.TYPE_META[q && q.type];
    return m ? m.emoji : '✨';
  }

  function mapName(map) {
    var m = MK.state.MAP_INFO[map];
    return m ? m.name : map;
  }

  function mapEmoji(map) {
    var m = MK.state.MAP_INFO[map];
    return m ? m.emoji : '🗺️';
  }

  function starsHtml(n) {
    var out = '';
    for (var i = 0; i < 3; i += 1) {
      out += '<span class="star ' + (i < n ? 'on' : '') + '">★</span>';
    }
    return '<span class="star-row">' + out + '</span>';
  }

  function heartsHtml(n) {
    var out = '';
    for (var i = 0; i < 3; i += 1) {
      out += '<span class="heart ' + (i < n ? '' : 'lost') + '">❤️</span>';
    }
    return out;
  }

  function hud(opts) {
    opts = opts || {};
    var s = MK.state.getSave();
    var out = '<div class="hud">';
    if (!opts.noCoins) {
      out += '<span class="hud-chip">💰 <span>' + s.coins + '</span></span>';
    }
    if (!opts.noStars) {
      out += '<span class="hud-chip hud-stars">⭐ <span>' + MK.state.totalStars() + '</span></span>';
    }
    if (opts.hearts) {
      out += '<span class="hud-hearts" id="hud-hearts">' + heartsHtml(s.hearts) + '</span>';
    }
    out += '</div>';
    return out;
  }

  function levelNumber(q) {
    var qs = MK.state.getMapQuestions(q.map);
    for (var i = 0; i < qs.length; i += 1) {
      if (qs[i].id === q.id) return i + 1;
    }
    return 1;
  }

  function levelPathFor(map) {
    return 'level-' + map;
  }

  function setScreen(html, name) {
    questionActive = false;
    if (MK.audio && MK.audio.stopSpeak) MK.audio.stopSpeak();
    screenEl.innerHTML = html;
    screenEl.dataset.screen = name || '';
    screenEl.classList.remove('enter');
    void screenEl.offsetWidth;
    screenEl.classList.add('enter');
    try {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
      window.scrollTo(0, 0);
    }
  }

  function showToast(message) {
    if (!toastEl) return;
    toastEl.textContent = message;
    toastEl.classList.add('show');
    if (toastTimer) window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () {
      toastEl.classList.remove('show');
      toastTimer = null;
    }, 2300);
  }

  /* ---------- 弹窗 ---------- */
  function openModal(bodyHtml, opts) {
    opts = opts || {};
    var closable = opts.closable !== false;
    var backdropAction = closable ? ' data-action="modal-backdrop"' : '';
    modalRoot.innerHTML =
      '<div class="modal-backdrop"' + backdropAction + '>' +
        '<div class="modal" role="dialog" aria-modal="true">' +
          (closable ? '<button class="modal-close" data-action="close-modal" aria-label="关闭">✕</button>' : '') +
          bodyHtml +
        '</div>' +
      '</div>';
    document.body.classList.add('modal-open');
    modalCleanup = opts.onClose || null;
  }

  function closeModal() {
    modalRoot.innerHTML = '';
    document.body.classList.remove('modal-open');
    var fn = modalCleanup;
    modalCleanup = null;
    if (fn) fn();
  }

  function showConfirm(opts) {
    confirmCallback = opts.onConfirm || null;
    openModal(
      '<h3>' + esc(opts.title || '确定吗？') + '</h3>' +
      '<p>' + esc(opts.message || '') + '</p>' +
      '<div class="modal-actions">' +
        '<button class="btn btn-secondary" data-action="confirm-no">取消</button>' +
        '<button class="btn ' + (opts.danger ? 'btn-danger' : 'btn-primary') + '" data-action="confirm-yes">' +
          esc(opts.confirmText || '确定') +
        '</button>' +
      '</div>',
      {
        onClose: function () { confirmCallback = null; }
      }
    );
  }

  function openParentGate() {
    openModal(
      '<h3>家长 / 老师模式</h3>' +
      '<p>请输入密码。默认密码是 <b>8888</b>，进入后可以修改。</p>' +
      '<div class="field">' +
        '<label for="parent-password">密码</label>' +
        '<input class="input" id="parent-password" type="password" inputmode="numeric" autocomplete="off" placeholder="请输入密码">' +
      '</div>' +
      '<div class="modal-actions">' +
        '<button class="btn btn-secondary" data-action="close-modal">取消</button>' +
        '<button class="btn btn-primary" data-action="parent-login">进入</button>' +
      '</div>'
    );
    window.setTimeout(function () {
      var input = document.getElementById('parent-password');
      if (input) input.focus();
    }, 80);
  }

  /* ---------- 计时 ---------- */
  function startTimer() {
    timer = { start: Date.now(), paused: 0, hiddenAt: 0, manualPausedAt: 0 };
  }

  function resetTimer() {
    timer = { start: Date.now(), paused: 0, hiddenAt: 0, manualPausedAt: 0 };
  }

  function pauseTimer() {
    if (timer.start && !timer.manualPausedAt) timer.manualPausedAt = Date.now();
  }

  function resumeTimer() {
    if (timer.manualPausedAt) {
      timer.paused += Date.now() - timer.manualPausedAt;
      timer.manualPausedAt = 0;
    }
  }

  function elapsedMs() {
    if (!timer.start) return 0;
    var now = Date.now();
    var e = now - timer.start - timer.paused;
    if (timer.hiddenAt) e -= now - timer.hiddenAt;
    if (timer.manualPausedAt) e -= now - timer.manualPausedAt;
    return Math.max(0, e);
  }

  /* ---------- 首页 ---------- */
  function renderHome() {
    var s = MK.state.getSave();
    var lv = MK.state.levelInfo();
    var prog = MK.state.overallProgress();
    var hasProgress = MK.state.totalStars() > 0 || (Number(s.stats.attempts) || 0) > 0 ||
      Object.keys(s.skipped).length > 0;
    var finaleReady = MK.state.checkFinale();
    var storageOk = MK.storage.isAvailable();

    setScreen(
      '<div class="home">' +
        '<div class="home-sky">' +
          '<span class="cloud c1">☁️</span>' +
          '<span class="cloud c2">☁️</span>' +
          '<span class="cloud c3">☁️</span>' +
        '</div>' +
        '<div class="hero" aria-hidden="true">🧙</div>' +
        '<h1>数学王国探险</h1>' +
        '<p class="subtitle">帮助小英雄，打败糊涂魔王，找回数学王国的光！</p>' +

        '<div class="home-stats">' +
          '<span class="hud-chip">🏅 Lv.' + lv.level + ' ' + esc(lv.title) + '</span>' +
          '<span class="hud-chip">⭐ ' + MK.state.totalStars() + ' / ' + MK.state.maxStars() + '</span>' +
          '<span class="hud-chip">💰 ' + s.coins + '</span>' +
        '</div>' +

        '<div class="card card-gold" style="width:100%;max-width:420px;margin-bottom:16px">' +
          '<div class="row-between" style="margin-bottom:6px">' +
            '<span class="small bold">王国恢复进度</span>' +
            '<span class="small bold">' + prog.pct + '%</span>' +
          '</div>' +
          '<div class="progress"><span style="width:' + prog.pct + '%"></span></div>' +
          '<div class="small muted" style="margin-top:6px">已点亮 ' + prog.finished + ' / ' + prog.total + ' 关</div>' +
        '</div>' +

        (finaleReady
          ? '<button class="btn btn-summit btn-xl" data-action="show-finale" style="max-width:420px;margin-bottom:12px">🎉 观看王国大结局</button>'
          : '') +

        '<button class="btn btn-primary btn-xl" data-action="go-maps">' +
          (hasProgress ? '继续探险' : '开始探险') +
        '</button>' +

        '<div class="home-actions">' +
          '<button class="icon-btn" data-action="open-book">📖<span>魔法书</span></button>' +
          '<button class="icon-btn" data-action="open-shop">🛒<span>商店</span></button>' +
          '<button class="icon-btn" data-action="open-settings">⚙️<span>设置</span></button>' +
        '</div>' +

        '<button class="parent-link" data-action="open-parent">家长 / 老师</button>' +
        '<p class="save-note">' + (storageOk ? '进度会自动保存在本机浏览器' : '当前浏览器无法保存进度，关闭页面后会丢失') + '</p>' +
      '</div>',
      'home'
    );
  }

  /* ---------- 地图总览 ---------- */
  function renderMaps() {
    var prog = MK.state.overallProgress();
    var cards = MK.state.MAPS.map(function (map) {
      var info = MK.state.MAP_INFO[map];
      var p = MK.state.mapProgress(map);
      var unlocked = MK.state.isMapUnlocked(map);
      return '<button class="map-card ' + map + (unlocked ? '' : ' locked') + '" ' +
        (unlocked ? 'data-action="open-map"' : 'data-action="map-locked"') +
        ' data-map="' + map + '">' +
        (unlocked ? '' : '<span class="map-lock">🔒</span>') +
        '<span class="map-emoji">' + info.emoji + '</span>' +
        '<span class="map-info">' +
          '<h3>' + esc(info.name) + '</h3>' +
          '<p>' + esc(info.desc) + '</p>' +
          '<span class="progress ' + map + '"><span style="width:' + p.pct + '%"></span></span>' +
          '<small><span>' + p.finished + ' / ' + p.total + ' 关</span><span>' +
            (unlocked ? p.pct + '%' : '未解锁') +
          '</span></small>' +
        '</span>' +
      '</button>';
    }).join('');

    setScreen(
      '<div class="screen-pad">' +
        '<div class="topbar">' +
          '<button class="btn-icon" data-action="go-home" aria-label="返回首页">←</button>' +
          '<h2>选择地图</h2>' +
          hud() +
        '</div>' +
        '<div class="card card-soft center">' +
          '<div class="small muted">王国恢复进度</div>' +
          '<div class="bold" style="font-size:24px">' + prog.pct + '%</div>' +
          '<div class="progress" style="margin-top:8px"><span style="width:' + prog.pct + '%"></span></div>' +
        '</div>' +
        '<div class="map-list">' + cards + '</div>' +
        '<p class="small muted center">完成一张地图的全部关卡，下一张地图就会亮起来。</p>' +
      '</div>',
      'maps'
    );
  }

  /* ---------- 关卡路径 ---------- */
  function renderLevelPath(map) {
    if (!MK.state.MAP_INFO[map]) {
      renderMaps();
      return;
    }
    if (!MK.state.isMapUnlocked(map)) {
      showToast('先完成前一张地图，才能来这里哦。');
      renderMaps();
      return;
    }

    var info = MK.state.MAP_INFO[map];
    var qs = MK.state.getMapQuestions(map);
    var p = MK.state.mapProgress(map);
    var s = MK.state.getSave();
    var resumeId = s.current && s.current.inProgress ? s.current.levelId : null;
    var fallback = MK.state.firstUnfinishedLevel(map);
    var fallbackId = fallback ? fallback.id : null;

    var nodes = qs.map(function (q, index) {
      var unlocked = MK.state.isLevelUnlocked(map, index);
      var finished = MK.state.isFinished(q);
      var skipped = !!s.skipped[q.id];
      var best = Number(s.stars[q.id]) || 0;
      var isCurrent = !finished && unlocked &&
        (q.id === resumeId || (!resumeId && q.id === fallbackId));
      var isBoss = index === qs.length - 1;
      var cls = 'level-node' +
        (unlocked ? '' : ' locked') +
        (finished ? ' done' : '') +
        (isCurrent ? ' current' : '') +
        (isBoss ? ' boss' : '');
      var right = !unlocked
        ? '🔒'
        : (skipped && !best ? '⏭️' : starsHtml(best));
      return '<button class="' + cls + '" ' +
        (unlocked ? 'data-action="open-level"' : 'data-action="level-locked"') +
        ' data-id="' + esc(q.id) + '">' +
        '<span class="node-badge">' + (index + 1) + '</span>' +
        '<span class="node-main">' +
          '<strong>' + esc(q.title || typeLabel(q.type)) + (isBoss ? ' 👑' : '') + '</strong>' +
          '<small>' + typeLabel(q.type) + (isCurrent ? ' · 继续这里' : '') + '</small>' +
        '</span>' +
        '<span class="node-stars">' + right + '</span>' +
      '</button>';
    }).join('');

    setScreen(
      '<div class="screen-pad">' +
        '<div class="topbar">' +
          '<button class="btn-icon" data-action="go-maps" aria-label="返回地图总览">←</button>' +
          '<h2>' + info.emoji + ' ' + esc(info.name) + '</h2>' +
          hud() +
        '</div>' +
        '<div class="card card-soft">' +
          '<div class="row-between">' +
            '<span class="bold">' + p.finished + ' / ' + p.total + ' 关</span>' +
            '<span class="badge ' + map + '">' + p.pct + '%</span>' +
          '</div>' +
          '<div class="progress ' + map + '" style="margin-top:8px"><span style="width:' + p.pct + '%"></span></div>' +
        '</div>' +
        '<div class="level-path">' + nodes + '</div>' +
        '<p class="small muted center">' +
          (qs.length && p.finished === qs.length ? '这张地图已经全部点亮啦！' : '最后一关是守关谜题，答对就能解锁下一张地图。') +
        '</p>' +
      '</div>',
      levelPathFor(map)
    );
  }

  /* ---------- 情境故事 ---------- */
  function openLevel(id, opts) {
    opts = opts || {};
    var q = MK.state.getQuestion(id);
    if (!q) {
      showToast('这道题暂时找不到了。');
      return;
    }
    current = {
      question: q,
      mode: opts.mode || 'main',
      wrongCount: 0,
      hintsShown: 0
    };
    inputValue = '';
    if (current.mode === 'main') {
      MK.state.startLevel(q);
    }
    renderStory();
  }

  function renderStory() {
    if (!current) {
      renderMaps();
      return;
    }
    var q = current.question;
    var mapInfo = MK.state.MAP_INFO[q.map];
    var n = levelNumber(q);
    var total = MK.state.getMapQuestions(q.map).length;
    var modeBadge = current.mode === 'review'
      ? '<span class="badge coral">复习模式</span>'
      : '<span class="badge ' + q.map + '">' + esc(mapInfo.name) + '</span>';

    setScreen(
      '<div class="screen-pad">' +
        '<div class="topbar">' +
          '<button class="btn-icon" data-action="story-back" aria-label="返回">←</button>' +
          '<h2>第 ' + n + ' / ' + total + ' 关</h2>' +
          hud({ hearts: current.mode === 'main', noStars: true, noCoins: true }) +
        '</div>' +
        '<div class="story-card">' +
          '<div class="story-emoji">' + typeEmoji(q) + '</div>' +
          '<div class="row-between" style="margin-bottom:6px">' +
            modeBadge +
            '<button class="speak-btn" data-action="speak-scene">🔊 听一听</button>' +
          '</div>' +
          '<h2 class="story-title">' + esc(q.title || typeLabel(q.type)) + '</h2>' +
          '<p class="story-text">' + esc(q.scene) + '</p>' +
          (q.diagram ? '<div class="diagram-wrap">' + diagramSvg(q.diagram) + '</div>' : '') +
          '<p class="story-question-hint">先读懂故事，再去看问题。数学王国不着急，慢慢来。</p>' +
        '</div>' +
        '<div class="bottom-actions">' +
          '<button class="btn btn-primary btn-xl" data-action="start-question">我读懂了，开始答题</button>' +
        '</div>' +
      '</div>',
      'story'
    );
  }

  /* ---------- 答题 ---------- */
  function renderQuestion() {
    if (!current) {
      renderMaps();
      return;
    }
    var q = current.question;
    var at = q.answerType || 'number';
    var isChoice = at === 'choice';
    var n = levelNumber(q);
    var total = MK.state.getMapQuestions(q.map).length;
    var s = MK.state.getSave();
    inputValue = '';

    var choiceHtml = '';
    if (isChoice) {
      choiceHtml = '<div class="choice-list">' + (q.options || []).map(function (opt, i) {
        return '<button class="choice-btn" data-action="choice" data-value="' + esc(opt) + '">' +
          '<span class="choice-letter">' + String.fromCharCode(65 + i) + '</span>' + esc(opt) +
        '</button>';
      }).join('') + '</div>';
    } else {
      choiceHtml =
        '<div class="answer-area">' +
          '<div class="answer-display" id="answer-display">' +
            (at === 'equation' ? '<span class="x-prefix">x =</span>' : '') +
            '<span class="answer-value empty" id="answer-value">?</span>' +
            (q.unit ? '<span class="answer-unit">' + esc(q.unit) + '</span>' : '') +
          '</div>' +
          '<div class="row-between" style="margin-top:8px">' +
            '<button class="mini-link" data-action="clear-input">清空</button>' +
            '<span class="small muted">用下面的数字键盘输入</span>' +
          '</div>' +
          '<div class="keypad" style="margin-top:8px">' +
            ['7', '8', '9', '4', '5', '6', '1', '2', '3', '.', '0', 'back'].map(function (k) {
              var label = k === 'back' ? '⌫' : k;
              var cls = k === 'back' ? ' key-action' : (k === '.' ? ' key-dot' : '');
              return '<button class="key' + cls + '" data-action="key" data-key="' + k + '" ' +
                'aria-label="' + (k === 'back' ? '退格' : label) + '">' + label + '</button>';
            }).join('') +
          '</div>' +
          '<button class="btn btn-primary btn-xl" data-action="submit-answer" style="margin-top:10px">提交答案</button>' +
        '</div>';
    }

    var items = '<div class="items-row ' + (current.mode === 'review' ? 'two' : '') + '">' +
      '<button class="item-btn" data-action="use-hint">' +
        '<span class="item-emoji">💡</span><span>提示卡 <b data-item-count="hint">' + (s.inventory.hint || 0) + '</b></span>' +
      '</button>' +
      '<button class="item-btn" data-action="use-hourglass">' +
        '<span class="item-emoji">⏳</span><span>时光沙漏 <b data-item-count="hourglass">' + (s.inventory.hourglass || 0) + '</b></span>' +
      '</button>' +
      (current.mode === 'main'
        ? '<button class="item-btn" data-action="use-skip">' +
            '<span class="item-emoji">🚪</span><span>跳过卡 <b data-item-count="skip">' + (s.inventory.skip || 0) + '</b></span>' +
          '</button>'
        : '') +
    '</div>';

    var hintPanel = '<div class="hint-panel ' + (current.hintsShown > 0 ? 'show' : '') + '" id="hint-panel">' +
      hintListHtml(current.hintsShown) +
    '</div>';

    setScreen(
      '<div class="screen-pad">' +
        '<div class="topbar">' +
          '<button class="btn-icon" data-action="question-back" aria-label="返回">←</button>' +
          '<h2>第 ' + n + ' / ' + total + ' 关</h2>' +
          hud({ hearts: current.mode === 'main', noStars: true, noCoins: true }) +
        '</div>' +
        '<div class="question-card" id="question-card">' +
          '<div class="question-meta">' +
            '<span class="badge ' + q.map + '">' + typeLabel(q.type) + '</span>' +
            (current.mode === 'review' ? '<span class="badge coral">复习模式</span>' : '') +
            '<button class="mini-link" data-action="review-context">回顾题意</button>' +
            '<button class="mini-link" data-action="speak-question">🔊 听题</button>' +
          '</div>' +
          '<div class="question-text">' + esc(q.question) + '</div>' +
          (q.diagram ? '<div class="diagram-wrap">' + diagramSvg(q.diagram) + '</div>' : '') +
        '</div>' +
        '<div class="feedback" id="feedback"></div>' +
        hintPanel +
        choiceHtml +
        items +
      '</div>',
      'question'
    );

    questionActive = true;
    startTimer();
  }

  function hintListHtml(count) {
    if (!current || !current.question) return '';
    var hints = (current.question.hints || []).slice(0, Math.max(0, count));
    if (!hints.length) return '';
    return '<h4>小提示</h4><ol>' + hints.map(function (h) {
      return '<li>' + esc(h) + '</li>';
    }).join('') + '</ol>';
  }

  function updateHintPanel() {
    var panel = document.getElementById('hint-panel');
    if (!panel) return;
    if (!current || current.hintsShown <= 0) {
      panel.classList.remove('show');
      panel.innerHTML = '';
      return;
    }
    panel.innerHTML = hintListHtml(current.hintsShown);
    panel.classList.add('show');
  }

  function updateItemCounts() {
    var s = MK.state.getSave();
    var nodes = document.querySelectorAll('[data-item-count]');
    for (var i = 0; i < nodes.length; i += 1) {
      var key = nodes[i].getAttribute('data-item-count');
      nodes[i].textContent = String(s.inventory[key] || 0);
    }
  }

  function updateHearts() {
    var el = document.getElementById('hud-hearts');
    if (!el) return;
    var s = MK.state.getSave();
    el.innerHTML = heartsHtml(s.hearts);
  }

  function animateHeartLoss(remaining) {
    var wrap = document.getElementById('hud-hearts');
    if (!wrap) return;
    var hearts = wrap.querySelectorAll('.heart');
    var idx = remaining; // 剩余 2 颗时，第 3 颗（下标 2）熄灭
    if (hearts[idx]) MK.animations.heartLost(hearts[idx]);
  }

  function updateInputDisplay() {
    var valueEl = document.getElementById('answer-value');
    var wrap = document.getElementById('answer-display');
    if (!valueEl) return;
    valueEl.textContent = inputValue || '?';
    valueEl.classList.toggle('empty', !inputValue);
    if (wrap) wrap.classList.toggle('filled', !!inputValue);
  }

  function pressKey(key) {
    if (!current) return;
    var at = current.question.answerType || 'number';
    if (at === 'choice') return;

    if (key === 'back') {
      inputValue = inputValue.slice(0, -1);
    } else if (key === 'clear') {
      inputValue = '';
    } else if (key === '.') {
      if (inputValue.indexOf('.') < 0) inputValue = inputValue ? inputValue + '.' : '0.';
    } else if (/^[0-9]$/.test(key)) {
      if (inputValue.length < 8) inputValue += key;
    }
    updateInputDisplay();
    MK.audio.play('click');
  }

  function showFeedback(text) {
    var el = document.getElementById('feedback');
    if (!el) return;
    el.textContent = text;
    el.classList.add('show');
  }

  function randomEncourage() {
    var list = [
      '再想想，就差一点！',
      '别急，我们一起找第一步。',
      '这个想法很勇敢，我们换个角度试试。',
      '慢慢来，数学王国不着急。',
      '你已经很接近啦，再看看关键数字。'
    ];
    return list[Math.floor(Math.random() * list.length)];
  }

  function handleAnswer(correct) {
    if (!current) return;
    var q = current.question;
    var elapsed = elapsedMs();
    resetTimer();

    if (correct) {
      if (current.mode === 'review') {
        var purifyResult = MK.state.purify(q, { elapsedMs: elapsed });
        MK.audio.play('correct');
        current = null;
        showReviewResult(q, purifyResult);
      } else {
        var stars = Math.max(1, 3 - current.wrongCount);
        var result = MK.state.finishLevel(q, stars, {
          firstTry: current.wrongCount === 0,
          elapsedMs: elapsed
        });
        MK.audio.play('correct');
        current = null;
        showResult(q, result);
      }
      return;
    }

    /* 答错：不嘲笑，给提示，允许再试 */
    MK.state.addWrong(q.id);
    MK.state.recordAttempt(q, { wrong: true, elapsedMs: elapsed });
    current.wrongCount += 1;
    current.hintsShown = Math.min(
      (q.hints && q.hints.length) || 0,
      current.hintsShown + 1
    );

    inputValue = '';
    updateInputDisplay();
    updateHintPanel();
    MK.audio.play('wrong');

    var card = document.getElementById('question-card');
    MK.animations.shake(card);

    if (current.mode === 'review') {
      showFeedback(randomEncourage() + ' 看看下面的小提示，再试一次。');
    } else {
      var remaining = MK.state.loseHeart();
      animateHeartLoss(remaining);
      MK.audio.play('click');
      window.setTimeout(updateHearts, 560);
      if (remaining <= 0) {
        showFeedback('魔法能量用完啦。别怕，休息一下，我们回到本关开头。');
        window.setTimeout(showHeartEmpty, 700);
      } else {
        showFeedback(randomEncourage() + ' 看看下面的小提示，再试一次。');
      }
    }
  }

  function submitAnswer() {
    if (!current) return;
    var at = current.question.answerType || 'number';
    if (at === 'choice') return;
    if (!inputValue.trim()) {
      showToast('先输入一个答案吧。');
      return;
    }
    var value = Number(inputValue);
    if (!Number.isFinite(value)) {
      showToast('这个数字还不太对，再检查一下。');
      return;
    }
    var expected = Number(current.question.answer);
    var correct = Number.isFinite(expected) && Math.abs(value - expected) < 1e-6;
    handleAnswer(correct);
  }

  function submitChoice(value) {
    if (!current) return;
    var correct = String(value).trim() === String(current.question.answer).trim();
    handleAnswer(correct);
  }

  /* ---------- 爱心耗尽 ---------- */
  function showHeartEmpty() {
    if (!current) return;
    var q = current.question;
    openModal(
      '<h3>魔法能量用完啦</h3>' +
      '<p>这不是结束，只是休息一下。回到本关开头，爱心会重新充满。<br>要不要先看看这道题的思路？</p>' +
      '<div class="modal-actions">' +
        '<button class="btn btn-secondary" data-action="show-explain">看看讲解</button>' +
        '<button class="btn btn-primary" data-action="restart-level">重新开始本关</button>' +
      '</div>' +
      '<button class="btn btn-ghost" data-action="heart-map" style="width:100%;margin-top:10px">先回地图</button>',
      { closable: false }
    );
  }

  function showExplainModal() {
    if (!current) return;
    var q = current.question;
    openModal(
      '<h3>这道题的思路</h3>' +
      '<div class="explain-card"><p>' + esc(q.explain) + '</p></div>' +
      '<div class="modal-actions">' +
        '<button class="btn btn-secondary" data-action="heart-map">回地图</button>' +
        '<button class="btn btn-primary" data-action="restart-level">重新开始</button>' +
      '</div>'
    );
  }

  /* ---------- 结算 ---------- */
  function resultStarsHtml(count) {
    var out = '';
    for (var i = 0; i < 3; i += 1) {
      out += '<span class="star ' + (i < count ? 'on' : '') + '" data-star="' + i + '">★</span>';
    }
    return out;
  }

  function animateResultStars(count) {
    var stars = document.querySelectorAll('#result-stars .star');
    for (var i = 0; i < stars.length; i += 1) {
      if (i < count) {
        (function (idx) {
          window.setTimeout(function () {
            if (stars[idx]) MK.animations.popStar(stars[idx]);
            MK.audio.play('star');
          }, 260 + idx * 260);
        })(i);
      }
    }
    window.setTimeout(function () {
      var source = document.getElementById('result-stars');
      var target = document.querySelector('.hud-stars');
      if (count > 0) MK.animations.flyStars(count, source, target);
    }, 260 + count * 260 + 160);
  }

  function showResult(q, result) {
    lastResult = { question: q, data: result, mode: 'main' };
    var next = MK.state.nextLevelInMap(q);
    var newMap = result.newlyUnlocked && result.newlyUnlocked[0] ? result.newlyUnlocked[0] : null;
    var title;
    var sub;

    if (result.skipped) {
      title = '已跳过本关';
      sub = '跳过卡不获得星星。看完讲解，这个方法就归你啦。';
    } else if (result.first) {
      if (result.stars === 3) {
        title = '太棒了！三星通关！';
        sub = '一次答对，思路很清晰！';
      } else if (result.stars === 2) {
        title = '很好！二星通关！';
        sub = '再细心一点就满星啦。';
      } else {
        title = '过关啦！一星到手！';
        sub = '坚持到最后一刻，很了不起。';
      }
    } else {
      title = '又完成了一次！';
      sub = '这道题最高 ' + result.best + ' 星。重玩只刷新星级，不重复发奖励。';
    }

    var rewards = '';
    if (result.coins) rewards += '<span class="reward-chip">+ ' + result.coins + ' 💰</span>';
    if (result.xp) rewards += '<span class="reward-chip">+ ' + result.xp + ' 经验</span>';
    if (result.skipped) rewards += '<span class="reward-chip">0 ⭐</span>';
    if (!result.first) rewards += '<span class="reward-chip">重玩 · 不重复奖励</span>';

    var banners = '';
    if (result.leveledUp) {
      banners += '<div class="levelup-banner">升级啦！Lv.' + result.level + ' · ' + esc(MK.state.levelInfo().title) + '</div>';
    }
    if (newMap) {
      banners += '<div class="levelup-banner">🎉 新地图解锁：' + esc(mapName(newMap)) + '！</div>';
    }

    var primary;
    var secondary = '';
    if (result.finale) {
      primary = '<button class="btn btn-summit btn-xl" data-action="show-finale">🎉 观看大结局</button>';
      secondary = '<button class="btn btn-secondary" data-action="result-map">返回地图</button>';
    } else if (next) {
      primary = '<button class="btn btn-primary btn-xl" data-action="next-level">下一关</button>';
      secondary = '<button class="btn btn-secondary" data-action="result-map">返回地图</button>';
    } else if (newMap) {
      primary = '<button class="btn btn-primary btn-xl" data-action="go-new-map" data-map="' + newMap + '">去' + esc(mapName(newMap)) + '</button>';
      secondary = '<button class="btn btn-secondary" data-action="result-map">返回地图</button>';
    } else {
      primary = '<button class="btn btn-primary btn-xl" data-action="result-map">返回地图</button>';
    }

    setScreen(
      '<div class="screen-pad">' +
        '<div class="topbar">' +
          '<span style="width:48px"></span>' +
          '<h2>闯关结果</h2>' +
          hud() +
        '</div>' +
        '<div class="result-wrap">' +
          '<div class="result-stars" id="result-stars">' + resultStarsHtml(result.stars) + '</div>' +
          '<h2 class="result-title">' + esc(title) + '</h2>' +
          '<p class="result-sub">' + esc(sub) + '</p>' +
          (rewards ? '<div class="reward-row">' + rewards + '</div>' : '') +
          banners +
          '<div class="explain-card">' +
            '<h4>讲解：这道题的思路</h4>' +
            '<p>' + esc(q.explain) + '</p>' +
          '</div>' +
          '<div class="bottom-actions" style="width:100%">' + primary + secondary + '</div>' +
        '</div>' +
      '</div>',
      'result'
    );

    if (!result.skipped) animateResultStars(result.stars);
    if (result.stars === 3 || result.leveledUp) MK.animations.confetti(44);
    if (result.leveledUp) {
      window.setTimeout(function () { MK.audio.play('levelup'); }, 900);
    }
    if (newMap) {
      window.setTimeout(function () { MK.audio.play('unlock'); }, 700);
    }
  }

  function showReviewResult(q, result) {
    lastResult = { question: q, data: result, mode: 'review' };
    var hasMore = reviewIndex + 1 < reviewQueue.length;
    var rewards = '';
    if (result.coins) rewards += '<span class="reward-chip">+ ' + result.coins + ' 💰</span>';
    if (result.xp) rewards += '<span class="reward-chip">+ ' + result.xp + ' 经验</span>';

    var buttons = '';
    if (hasMore) {
      buttons += '<button class="btn btn-primary btn-xl" data-action="review-next">下一题</button>';
      buttons += '<button class="btn btn-secondary" data-action="review-done">返回魔法书</button>';
    } else {
      buttons += '<button class="btn btn-primary btn-xl" data-action="review-done">返回魔法书</button>';
    }

    setScreen(
      '<div class="screen-pad">' +
        '<div class="topbar">' +
          '<span style="width:48px"></span>' +
          '<h2>复习结果</h2>' +
          hud() +
        '</div>' +
        '<div class="result-wrap">' +
          '<div style="font-size:70px;line-height:1">✨📖✨</div>' +
          '<h2 class="result-title">净化成功！</h2>' +
          '<p class="result-sub">' +
            (result.existed ? '这道题从魔法书里消失啦，你真正学会了它。' : '这道题已经不在魔法书里了。') +
          '</p>' +
          (rewards ? '<div class="reward-row">' + rewards + '</div>' : '') +
          '<div class="explain-card">' +
            '<h4>再复习一次思路</h4>' +
            '<p>' + esc(q.explain) + '</p>' +
          '</div>' +
          '<div class="bottom-actions" style="width:100%">' + buttons + '</div>' +
        '</div>' +
      '</div>',
      'review-result'
    );

    if (result.leveledUp) {
      window.setTimeout(function () { MK.audio.play('levelup'); }, 800);
    }
    MK.animations.confetti(28);
  }

  /* ---------- 商店 ---------- */
  function renderShop() {
    var s = MK.state.getSave();
    var items = Object.keys(MK.state.SHOP).map(function (key) {
      var item = MK.state.SHOP[key];
      return '<div class="shop-item">' +
        '<div class="shop-emoji">' + item.emoji + '</div>' +
        '<div class="shop-info">' +
          '<h3>' + esc(item.name) + '</h3>' +
          '<p>' + esc(item.desc) + '</p>' +
        '</div>' +
        '<div class="shop-buy">' +
          '<button class="btn btn-primary" data-action="buy-item" data-item="' + key + '">' +
            item.price + ' 💰' +
          '</button>' +
          '<span class="owned">已有 ' + (s.inventory[key] || 0) + '</span>' +
        '</div>' +
      '</div>';
    }).join('');

    setScreen(
      '<div class="screen-pad">' +
        '<div class="topbar">' +
          '<button class="btn-icon" data-action="go-home" aria-label="返回首页">←</button>' +
          '<h2>魔法商店</h2>' +
          hud() +
        '</div>' +
        '<div class="card card-gold center">' +
          '<div class="small muted">我的金币</div>' +
          '<div class="bold" style="font-size:34px">💰 ' + s.coins + '</div>' +
        '</div>' +
        '<div class="shop-list">' + items + '</div>' +
        '<p class="small muted center">金币来自首次通关；重玩不会重复发金币。</p>' +
      '</div>',
      'shop'
    );
  }

  function buyItem(key) {
    var item = MK.state.SHOP[key];
    if (!item) return;
    var s = MK.state.getSave();
    if (s.coins < item.price) {
      showToast('金币还不够，去闯关赚金币吧！');
      return;
    }
    showConfirm({
      title: '购买' + item.name,
      message: '花 ' + item.price + ' 金币买 1 张' + item.name + '吗？',
      confirmText: '购买',
      onConfirm: function () {
        var res = MK.state.buyItem(key);
        if (res.ok) {
          MK.audio.play('buy');
          showToast('买到啦！');
          renderShop();
        } else {
          showToast('金币还不够，去闯关赚金币吧！');
        }
      }
    });
  }

  /* ---------- 魔法书 ---------- */
  function renderBook() {
    var entries = MK.state.getWrongEntries(false);
    var s = MK.state.getSave();
    var groups = {};
    entries.forEach(function (e) {
      var t = e.question.type;
      if (!groups[t]) groups[t] = [];
      groups[t].push(e);
    });

    var sections = Object.keys(MK.state.TYPE_META).filter(function (t) {
      return groups[t] && groups[t].length;
    }).map(function (t) {
      var items = groups[t].map(function (e) {
        return '<div class="book-item">' +
          '<div class="book-main">' +
            '<h4>' + esc(e.question.title || e.question.question) + '</h4>' +
            '<p>' + esc(e.question.question) + '</p>' +
          '</div>' +
          '<span class="wrong-count">错 ' + e.wrongCount + ' 次</span>' +
          '<button class="btn btn-primary btn-sm" data-action="review-one" data-id="' + esc(e.id) + '">复习</button>' +
        '</div>';
      }).join('');
      return '<div class="type-section">' +
        '<h3>' + MK.state.TYPE_META[t].emoji + ' ' + esc(MK.state.TYPE_META[t].label) + '</h3>' +
        '<div class="book-list">' + items + '</div>' +
      '</div>';
    }).join('');

    var body = entries.length
      ? '<div class="row-between" style="margin-bottom:4px">' +
          '<span class="small muted">答错的题会自动飞进这里，答对就净化。</span>' +
          '<button class="btn btn-primary btn-sm" data-action="start-review">全部复习</button>' +
        '</div>' + sections
      : '<div class="empty">' +
          '<span class="empty-emoji">📖✨</span>' +
          '<p class="bold">魔法书里还没有错题，真了不起！</p>' +
          '<p class="small muted">以后答错的题会自动飞进来，复习答对就能净化移除。</p>' +
        '</div>';

    setScreen(
      '<div class="screen-pad">' +
        '<div class="topbar">' +
          '<button class="btn-icon" data-action="go-home" aria-label="返回首页">←</button>' +
          '<h2>魔法书 · 错题本</h2>' +
          hud() +
        '</div>' +
        (entries.length ? '<div class="card card-soft"><div class="bold">还有 ' + entries.length + ' 道题等你净化</div><div class="small muted">复习模式不扣爱心、不限时。</div></div>' : '') +
        body +
      '</div>',
      'book'
    );
  }

  function startReview(ids) {
    var list = (Array.isArray(ids) ? ids : []).filter(function (id) {
      return !!MK.state.getQuestion(id);
    });
    if (!list.length) {
      showToast('魔法书里还没有可以复习的题目。');
      return;
    }
    reviewQueue = list;
    reviewIndex = 0;
    openLevel(list[0], { mode: 'review' });
  }

  function reviewNext() {
    reviewIndex += 1;
    while (reviewIndex < reviewQueue.length) {
      var q = MK.state.getQuestion(reviewQueue[reviewIndex]);
      if (q) {
        openLevel(q.id, { mode: 'review' });
        return;
      }
      reviewIndex += 1;
    }
    reviewQueue = [];
    reviewIndex = 0;
    renderBook();
  }

  /* ---------- 设置 ---------- */
  function applySettings() {
    var s = MK.state.getSave();
    document.body.classList.toggle('reduce-motion', !!s.settings.reduceMotion);
    MK.audio.setEnabled(!!s.settings.sound);
  }

  function renderSettings() {
    var s = MK.state.getSave();
    var storageOk = MK.storage.isAvailable();
    setScreen(
      '<div class="screen-pad">' +
        '<div class="topbar">' +
          '<button class="btn-icon" data-action="go-home" aria-label="返回首页">←</button>' +
          '<h2>设置</h2>' +
          hud() +
        '</div>' +
        '<div class="settings-list">' +
          '<div class="setting-row">' +
            '<div class="setting-main"><h4>音效</h4><p>答题、金币和升级的声音</p></div>' +
            '<button class="switch ' + (s.settings.sound ? 'on' : '') + '" data-action="toggle-sound" ' +
              'aria-label="音效开关" aria-pressed="' + (s.settings.sound ? 'true' : 'false') + '"></button>' +
          '</div>' +
          '<div class="setting-row">' +
            '<div class="setting-main"><h4>减少动画</h4><p>适合容易分心或希望更安静的孩子</p></div>' +
            '<button class="switch ' + (s.settings.reduceMotion ? 'on' : '') + '" data-action="toggle-motion" ' +
              'aria-label="动画开关" aria-pressed="' + (s.settings.reduceMotion ? 'true' : 'false') + '"></button>' +
          '</div>' +
        '</div>' +
        '<div class="card card-soft">' +
          '<div class="card-title">存档说明</div>' +
          '<p class="small muted">进度保存在当前浏览器里。清理浏览器数据、换浏览器或换设备后不会自动同步。</p>' +
          '<p class="small muted">需要备份时，请进入家长 / 老师模式，使用「导出存档」。</p>' +
          '<p class="small muted">存储状态：' + (storageOk ? '正常' : '不可用（关闭页面会丢失进度）') + '</p>' +
        '</div>' +
        '<button class="btn btn-secondary" data-action="open-parent">进入家长 / 老师模式</button>' +
        '<button class="btn btn-ghost" data-action="go-home">返回首页</button>' +
      '</div>',
      'settings'
    );
  }

  /* ---------- 大结局 ---------- */
  function renderFinale() {
    MK.state.markFinaleSeen();
    var s = MK.state.getSave();
    var lv = MK.state.levelInfo();
    MK.audio.play('levelup');
    MK.animations.confetti(70);

    setScreen(
      '<div class="finale">' +
        '<div class="finale-emoji">🧙✨🏰</div>' +
        '<h1>数学王国恢复了光彩！</h1>' +
        '<p>糊涂魔王把数学王国的路弄得乱七八糟，是你用小数、方程、面积、体积和应用题，把每一段路重新修好。' +
        '现在，王国的灯又亮了，钟声也响了。</p>' +
        '<div class="home-stats">' +
          '<span class="hud-chip">🏅 Lv.' + lv.level + ' ' + esc(lv.title) + '</span>' +
          '<span class="hud-chip">⭐ ' + MK.state.totalStars() + ' / ' + MK.state.maxStars() + '</span>' +
          '<span class="hud-chip">💰 ' + s.coins + '</span>' +
        '</div>' +
        '<p class="small muted">魔法书里还有 ' + MK.state.getWrongEntries(false).length + ' 道题可以继续净化。</p>' +
        '<button class="btn btn-primary btn-xl" data-action="finale-home" style="max-width:420px">回到首页</button>' +
      '</div>',
      'finale'
    );
  }

  /* ---------- 图形示意 ---------- */
  function diagramSvg(d) {
    if (!d || !d.shape) return '';
    var unit = esc(d.unit || '');
    function label(text, x, y, anchor) {
      return '<text x="' + x + '" y="' + y + '" text-anchor="' + (anchor || 'middle') + '">' +
        esc(text) + '</text>';
    }
    var open = '<svg viewBox="0 0 320 200" role="img" aria-label="图形示意图">';

    if (d.shape === 'parallelogram') {
      return open +
        '<polygon class="shape-fill" points="60,150 240,150 280,60 100,60"/>' +
        '<line class="shape-line" x1="170" y1="60" x2="170" y2="150"/>' +
        label('底 ' + d.base + ' ' + unit, 150, 178) +
        label('高 ' + d.height + ' ' + unit, 182, 112, 'start') +
        '</svg>';
    }
    if (d.shape === 'triangle') {
      var hLabel = d.height === '?' ? '高 ?' : '高 ' + d.height + ' ' + unit;
      return open +
        '<polygon class="shape-fill" points="70,150 250,150 160,50"/>' +
        '<line class="shape-line" x1="160" y1="50" x2="160" y2="150"/>' +
        label('底 ' + d.base + ' ' + unit, 160, 178) +
        label(hLabel, 172, 105, 'start') +
        '</svg>';
    }
    if (d.shape === 'trapezoid') {
      return open +
        '<polygon class="shape-fill" points="50,150 270,150 220,55 100,55"/>' +
        '<line class="shape-line" x1="160" y1="55" x2="160" y2="150"/>' +
        label('上底 ' + d.top + ' ' + unit, 160, 44) +
        label('下底 ' + d.bottom + ' ' + unit, 160, 178) +
        label('高 ' + d.height + ' ' + unit, 172, 108, 'start') +
        '</svg>';
    }
    if (d.shape === 'cube') {
      return open +
        '<polygon class="shape-fill" points="120,35 260,35 260,130 120,130" opacity="0.55"/>' +
        '<polygon class="shape-fill" points="80,70 220,70 220,165 80,165"/>' +
        '<line class="shape-line" x1="80" y1="70" x2="120" y2="35"/>' +
        '<line class="shape-line" x1="220" y1="70" x2="260" y2="35"/>' +
        '<line class="shape-line" x1="220" y1="165" x2="260" y2="130"/>' +
        label('棱长 ' + d.edge + ' ' + unit, 150, 190) +
        '</svg>';
    }
    if (d.shape === 'cuboid') {
      return open +
        '<polygon class="shape-fill" points="120,40 280,40 280,130 120,130" opacity="0.55"/>' +
        '<polygon class="shape-fill" points="70,75 230,75 230,165 70,165"/>' +
        '<line class="shape-line" x1="70" y1="75" x2="120" y2="40"/>' +
        '<line class="shape-line" x1="230" y1="75" x2="280" y2="40"/>' +
        '<line class="shape-line" x1="230" y1="165" x2="280" y2="130"/>' +
        label('长 ' + d.length + ' ' + unit, 150, 190) +
        label('宽 ' + d.width + ' ' + unit, 270, 28) +
        label('高 ' + d.height + ' ' + unit, 52, 128, 'end') +
        '</svg>';
    }
    if (d.shape === 'rectangle') {
      return open +
        '<rect class="shape-fill" x="70" y="55" width="180" height="100"/>' +
        label('长 ' + d.length + ' ' + unit, 160, 180) +
        label('宽 ' + d.width + ' ' + unit, 270, 110, 'start') +
        '</svg>';
    }
    return '';
  }

  /* ---------- 事件分发 ---------- */
  function handleAction(action, el, e) {
    if (action.indexOf('parent-') === 0 && action !== 'parent-login') {
      if (MK.parent) MK.parent.handleAction(action, el, e);
      return;
    }

    switch (action) {
      case 'go-home':
        renderHome();
        break;
      case 'go-maps':
        renderMaps();
        break;
      case 'open-map':
        renderLevelPath(el.dataset.map);
        break;
      case 'map-locked':
        showToast('先完成前一张地图，才能来这里哦。');
        break;
      case 'open-level':
        renderLevelPathForLevel(el.dataset.id);
        break;
      case 'level-locked':
        showToast('先完成上一关，路就会打开啦。');
        break;
      case 'start-question':
        renderQuestion();
        break;
      case 'story-back':
        if (current && current.mode === 'review') {
          renderBook();
        } else if (current) {
          MK.state.abandonLevel();
          renderLevelPath(current.question.map);
        } else {
          renderMaps();
        }
        break;
      case 'question-back':
        if (current && current.mode === 'review') {
          renderBook();
        } else if (current) {
          (function (q) {
            showConfirm({
              title: '离开本关？',
              message: '离开后，本关要重新开始。已经获得的金币和星星不会丢失。',
              confirmText: '离开',
              onConfirm: function () {
                MK.state.abandonLevel();
                renderLevelPath(q.map);
              }
            });
          })(current.question);
        } else {
          renderMaps();
        }
        break;
      case 'key':
        pressKey(el.dataset.key);
        break;
      case 'clear-input':
        inputValue = '';
        updateInputDisplay();
        break;
      case 'submit-answer':
        submitAnswer();
        break;
      case 'choice':
        submitChoice(el.dataset.value);
        break;
      case 'use-hint':
        useHintCard();
        break;
      case 'use-hourglass':
        useHourglass();
        break;
      case 'use-skip':
        useSkipCard();
        break;
      case 'speak-scene':
        if (current) {
          if (!MK.audio.speak(current.question.scene)) showToast('这个浏览器暂时不能朗读。');
        }
        break;
      case 'speak-question':
        if (current) {
          if (!MK.audio.speak(current.question.scene + '。' + current.question.question)) {
            showToast('这个浏览器暂时不能朗读。');
          }
        }
        break;
      case 'review-context':
        showReviewContext();
        break;
      case 'restart-level':
        if (current) {
          MK.state.restartLevel(current.question);
          current.wrongCount = 0;
          current.hintsShown = 0;
          closeModal();
          renderStory();
        }
        break;
      case 'show-explain':
        showExplainModal();
        break;
      case 'heart-map':
        if (current) {
          var map = current.question.map;
          MK.state.abandonLevel();
          closeModal();
          renderLevelPath(map);
        }
        break;
      case 'next-level':
        if (lastResult) {
          var next = MK.state.nextLevelInMap(lastResult.question);
          if (next) openLevel(next.id);
          else renderMaps();
        }
        break;
      case 'result-map':
        if (lastResult) renderLevelPath(lastResult.question.map);
        else renderMaps();
        break;
      case 'go-new-map':
        renderLevelPath(el.dataset.map);
        break;
      case 'show-finale':
        renderFinale();
        break;
      case 'finale-home':
        renderHome();
        break;
      case 'review-one':
        startReview([el.dataset.id]);
        break;
      case 'start-review':
        startReview(MK.state.getWrongEntries(false).map(function (w) { return w.id; }));
        break;
      case 'review-next':
        reviewNext();
        break;
      case 'review-done':
        reviewQueue = [];
        reviewIndex = 0;
        renderBook();
        break;
      case 'open-shop':
        renderShop();
        break;
      case 'buy-item':
        buyItem(el.dataset.item);
        break;
      case 'open-book':
        renderBook();
        break;
      case 'open-parent':
        if (MK.parent && MK.parent.authed) {
          MK.parent.renderScreen();
        } else {
          openParentGate();
        }
        break;
      case 'parent-login':
        (function () {
          var input = document.getElementById('parent-password');
          var pwd = input ? input.value.trim() : '';
          if (pwd === String(MK.state.getSave().parent.password)) {
            if (MK.parent) MK.parent.authed = true;
            closeModal();
            if (MK.parent) MK.parent.renderScreen();
          } else {
            showToast('密码不对，再试一次。');
            if (input) {
              input.value = '';
              input.focus();
            }
          }
        })();
        break;
      case 'open-settings':
        renderSettings();
        break;
      case 'toggle-sound':
        toggleQuickSetting('sound');
        break;
      case 'toggle-motion':
        toggleQuickSetting('reduceMotion');
        break;
      case 'modal-backdrop':
        if (e && e.target === el) closeModal();
        break;
      case 'close-modal':
        closeModal();
        break;
      case 'confirm-yes':
        (function () {
          var fn = confirmCallback;
          confirmCallback = null;
          closeModal();
          if (fn) fn();
        })();
        break;
      case 'confirm-no':
        closeModal();
        break;
      default:
        break;
    }
  }

  function renderLevelPathForLevel(id) {
    var q = MK.state.getQuestion(id);
    if (!q) {
      showToast('这个关卡暂时找不到。');
      return;
    }
    var qs = MK.state.getMapQuestions(q.map);
    var index = -1;
    for (var i = 0; i < qs.length; i += 1) {
      if (qs[i].id === id) { index = i; break; }
    }
    if (index < 0 || !MK.state.isLevelUnlocked(q.map, index)) {
      showToast('先完成上一关，路就会打开啦。');
      return;
    }
    openLevel(id);
  }

  function toggleQuickSetting(key) {
    var s = MK.state.getSave();
    MK.state.setSetting(key, !s.settings[key]);
    applySettings();
    renderSettings();
  }

  function useHintCard() {
    if (!current) return;
    var q = current.question;
    if (current.hintsShown >= (q.hints || []).length) {
      showToast('提示已经全部展开啦。');
      return;
    }
    var s = MK.state.getSave();
    if (!s.inventory.hint || s.inventory.hint <= 0) {
      showToast('提示卡不够了，可以去商店看看。');
      return;
    }
    MK.state.useItem('hint');
    current.hintsShown += 1;
    updateHintPanel();
    updateItemCounts();
    MK.audio.play('buy');
    showToast('提示卡用掉 1 张，不扣爱心。');
  }

  function useSkipCard() {
    if (!current || current.mode !== 'main') return;
    var s = MK.state.getSave();
    if (!s.inventory.skip || s.inventory.skip <= 0) {
      showToast('跳过卡不够了，可以去商店看看。');
      return;
    }
    (function (q) {
      showConfirm({
        title: '使用跳过卡？',
        message: '跳过本关不会获得星星，但会展示讲解，并解锁下一关。',
        confirmText: '跳过本关',
        onConfirm: function () {
          if (!MK.state.useItem('skip')) {
            showToast('跳过卡不够了。');
            return;
          }
          var elapsed = elapsedMs();
          var result = MK.state.finishLevel(q, 0, { skipped: true, elapsedMs: elapsed });
          current = null;
          showResult(q, result);
        }
      });
    })(current.question);
  }

  function useHourglass() {
    if (!current) return;
    var s = MK.state.getSave();
    if (!s.inventory.hourglass || s.inventory.hourglass <= 0) {
      showToast('时光沙漏不够了，可以去商店看看。');
      return;
    }
    MK.state.useItem('hourglass');
    updateItemCounts();
    openHourglass();
  }

  function openHourglass() {
    if (!current) return;
    var q = current.question;
    var remaining = 10;
    pauseTimer();

    openModal(
      '<div class="hourglass-overlay">' +
        '<div class="hourglass-emoji">⏳</div>' +
        '<p class="hourglass-scene">' + esc(q.scene) + '</p>' +
        '<p class="hourglass-question">' + esc(q.question) + '</p>' +
        '<div class="hourglass-timer" id="hourglass-timer">10</div>' +
        '<p class="small muted">时间到会自动收起，不扣爱心</p>' +
      '</div>',
      {
        onClose: function () {
          if (hourglassTimer) {
            window.clearInterval(hourglassTimer);
            hourglassTimer = null;
          }
          MK.audio.stopSpeak();
          resumeTimer();
        }
      }
    );

    MK.audio.speak(q.scene + '。' + q.question);
    hourglassTimer = window.setInterval(function () {
      remaining -= 1;
      var t = document.getElementById('hourglass-timer');
      if (t) t.textContent = String(remaining);
      if (remaining <= 0) {
        if (hourglassTimer) {
          window.clearInterval(hourglassTimer);
          hourglassTimer = null;
        }
        closeModal();
      }
    }, 1000);
  }

  function showReviewContext() {
    if (!current) return;
    var q = current.question;
    pauseTimer();
    openModal(
      '<h3>回顾题意</h3>' +
      '<div class="story-card" style="box-shadow:none;background:#fffdf7">' +
        '<p class="story-text">' + esc(q.scene) + '</p>' +
        (q.diagram ? '<div class="diagram-wrap">' + diagramSvg(q.diagram) + '</div>' : '') +
        '<p class="bold" style="margin-top:10px">' + esc(q.question) + '</p>' +
      '</div>' +
      '<div class="modal-actions"><button class="btn btn-primary" data-action="close-modal">看懂了</button></div>',
      { onClose: function () { resumeTimer(); } }
    );
  }

  function onKeyDown(e) {
    if (e.key === 'Enter' && e.target && e.target.id === 'parent-password') {
      e.preventDefault();
      handleAction('parent-login');
      return;
    }
    if (document.body.classList.contains('modal-open')) return;
    if (!questionActive || !current || screenEl.dataset.screen !== 'question') return;
    if (document.activeElement && /^(input|textarea|select)$/i.test(document.activeElement.tagName)) return;
    if ((current.question.answerType || 'number') === 'choice') return;

    if (/^[0-9]$/.test(e.key)) {
      e.preventDefault();
      pressKey(e.key);
    } else if (e.key === '.' || e.key === '。') {
      e.preventDefault();
      pressKey('.');
    } else if (e.key === 'Backspace') {
      e.preventDefault();
      pressKey('back');
    } else if (e.key === 'Enter') {
      e.preventDefault();
      submitAnswer();
    }
  }

  function onVisibilityChange() {
    if (document.hidden) {
      if (timer.start && !timer.hiddenAt) timer.hiddenAt = Date.now();
    } else if (timer.hiddenAt) {
      timer.paused += Date.now() - timer.hiddenAt;
      timer.hiddenAt = 0;
    }
  }

  function init() {
    screenEl = document.getElementById('screen');
    modalRoot = document.getElementById('modal-root');
    toastEl = document.getElementById('toast');
    applySettings();

    document.addEventListener('click', function (e) {
      var el = e.target.closest ? e.target.closest('[data-action]') : null;
      if (!el) return;
      handleAction(el.dataset.action, el, e);
    });
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('visibilitychange', onVisibilityChange);
  }

  window.MK = window.MK || {};
  window.MK.ui = {
    init: init,
    renderHome: renderHome,
    renderMaps: renderMaps,
    renderLevelPath: renderLevelPath,
    renderBook: renderBook,
    applySettings: applySettings,
    handleAction: handleAction,
    esc: esc,
    formatMs: formatMs,
    formatPercent: formatPercent,
    showToast: showToast,
    openModal: openModal,
    closeModal: closeModal,
    showConfirm: showConfirm
  };
})();
