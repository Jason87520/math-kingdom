/* 家长 / 老师模式：统计、错题、题库、存档 */
(function () {
  'use strict';

  var authed = false;
  var tab = 'overview';
  var filterMap = 'all';
  var editor = null; // { mode: 'new' } | { mode: 'edit', id }

  function esc(value) {
    return MK.ui.esc(value);
  }

  function setScreen(html, name) {
    var el = document.getElementById('screen');
    if (!el) return;
    if (MK.audio && MK.audio.stopSpeak) MK.audio.stopSpeak();
    el.innerHTML = html;
    el.dataset.screen = name || 'parent';
    el.classList.remove('enter');
    void el.offsetWidth;
    el.classList.add('enter');
    window.scrollTo(0, 0);
  }

  function formatDate(ts) {
    if (!ts) return '—';
    var d = new Date(ts);
    return (d.getMonth() + 1) + '月' + d.getDate() + '日';
  }

  function answerText(q) {
    if (!q) return '—';
    var a = q.answer;
    return String(a) + (q.unit ? ' ' + q.unit : '');
  }

  function tabsHtml() {
    var list = [
      { key: 'overview', label: '📊 总览' },
      { key: 'wrong', label: '📖 错题' },
      { key: 'questions', label: '🧩 题库' },
      { key: 'settings', label: '⚙️ 设置' }
    ];
    return '<div class="tabs">' + list.map(function (t) {
      return '<button class="tab ' + (tab === t.key ? 'active' : '') + '" data-action="parent-tab" data-tab="' + t.key + '">' +
        t.label +
      '</button>';
    }).join('') + '</div>';
  }

  function headHtml() {
    return '<div class="parent-head">' +
      '<div style="flex:1;min-width:0">' +
        '<h2>家长 / 老师模式</h2>' +
        '<p class="parent-sub">统计与题库只保存在本机浏览器</p>' +
      '</div>' +
      '<button class="btn btn-secondary btn-sm" data-action="parent-exit">退出</button>' +
    '</div>';
  }

  function renderScreen() {
    if (!authed) {
      MK.ui.renderHome();
      return;
    }
    var panel;
    if (editor) panel = renderEditor();
    else if (tab === 'overview') panel = renderOverview();
    else if (tab === 'wrong') panel = renderWrongPanel();
    else if (tab === 'questions') panel = renderQuestionPanel();
    else panel = renderSettingsPanel();

    setScreen(
      '<div class="screen-pad">' +
        headHtml() +
        (editor ? '' : tabsHtml()) +
        '<div class="parent-panel">' + panel + '</div>' +
      '</div>',
      'parent'
    );
  }

  /* ---------- 总览 ---------- */
  function renderOverview() {
    var s = MK.state.getSave();
    var prog = MK.state.overallProgress();
    var lv = MK.state.levelInfo();
    var avg = MK.state.averageMs();
    var rate = MK.state.firstTryRate();
    var types = MK.state.typeOverview();
    var days = MK.state.recentDays(7);
    var wrong = MK.state.getWrongEntries(false).length;

    var cards = [
      { value: prog.finished + ' / ' + prog.total, label: '已点亮关卡' },
      { value: String(s.stats.attempts || 0), label: '总作答次数' },
      { value: MK.ui.formatPercent(rate), label: '首次答对率' },
      { value: avg === null ? '—' : MK.ui.formatMs(avg), label: '平均每题用时' },
      { value: MK.ui.formatMs(s.stats.totalMs), label: '累计学习时间' },
      { value: String(wrong), label: '错题本待净化' },
      { value: 'Lv.' + lv.level, label: '等级 · ' + lv.title },
      { value: String(s.coins), label: '金币' }
    ];

    var typeRows = types.map(function (t) {
      return '<tr>' +
        '<td>' + esc(t.label) + '</td>' +
        '<td class="num">' + t.attempts + '</td>' +
        '<td class="num">' + t.wrong + '</td>' +
        '<td class="num">' + MK.ui.formatPercent(t.firstTryRate) + '</td>' +
        '<td class="num">' + t.completed + '</td>' +
        '<td class="num">' + (t.attempts ? MK.ui.formatMs(t.timeMs / t.attempts) : '—') + '</td>' +
      '</tr>';
    }).join('');

    var maxAttempts = 1;
    days.forEach(function (d) { if (d.attempts > maxAttempts) maxAttempts = d.attempts; });
    var chart = days.map(function (d) {
      var h = d.attempts ? Math.max(5, Math.round((d.attempts / maxAttempts) * 80)) : 2;
      return '<div class="chart-col" title="' + d.label + '：' + d.attempts + ' 次">' +
        '<span class="small muted">' + (d.attempts || '') + '</span>' +
        '<div class="chart-bar" style="height:' + h + 'px"></div>' +
        '<span class="chart-label">' + d.label + '</span>' +
      '</div>';
    }).join('');

    return '<div class="stat-grid">' + cards.map(function (c) {
      return '<div class="stat-card">' +
        '<div class="stat-value">' + esc(c.value) + '</div>' +
        '<div class="stat-label">' + esc(c.label) + '</div>' +
      '</div>';
    }).join('') + '</div>' +

    '<div class="card card-soft">' +
      '<div class="card-title">最近 7 天作答</div>' +
      (s.stats.attempts ? '<div class="chart">' + chart + '</div>' : '<p class="small muted">还没有作答记录。</p>') +
    '</div>' +

    '<div class="card card-soft" style="overflow:auto">' +
      '<div class="card-title">各知识点表现</div>' +
      '<table class="data-table">' +
        '<thead><tr><th>知识点</th><th class="num">作答</th><th class="num">答错</th>' +
          '<th class="num">首次答对率</th><th class="num">完成</th><th class="num">平均用时</th></tr></thead>' +
        '<tbody>' + typeRows + '</tbody>' +
      '</table>' +
      '<p class="small muted" style="margin-top:8px">首次答对率只统计首次通关，重玩和复习不会把数据变漂亮。</p>' +
    '</div>';
  }

  /* ---------- 错题本 ---------- */
  function renderWrongPanel() {
    var entries = MK.state.getWrongEntries(true);
    if (!entries.length) {
      return '<div class="empty">' +
        '<span class="empty-emoji">📖✨</span>' +
        '<p class="bold">错题本目前是空的。</p>' +
        '<p class="small muted">孩子答错后，题目会自动记录在这里。</p>' +
      '</div>';
    }

    var rows = entries.map(function (w) {
      var q = w.question;
      if (!q) {
        return '<div class="q-row">' +
          '<div class="q-main">' +
            '<h4>题目已删除或被隐藏</h4>' +
            '<p>编号：' + esc(w.id) + ' · 错 ' + w.wrongCount + ' 次 · 最近 ' + formatDate(w.lastWrongAt) + '</p>' +
          '</div>' +
          '<div class="q-actions">' +
            '<button class="btn btn-danger btn-sm" data-action="parent-delete-wrong" data-id="' + esc(w.id) + '">移除</button>' +
          '</div>' +
        '</div>';
      }
      return '<div class="q-row">' +
        '<div class="q-main">' +
          '<h4>' + esc(q.title || q.question) + '</h4>' +
          '<p>' + esc(MK.state.MAP_INFO[q.map].name) + ' · ' + esc(MK.state.TYPE_META[q.type].label) +
            ' · 错 ' + w.wrongCount + ' 次 · 最近 ' + formatDate(w.lastWrongAt) + '</p>' +
          '<details style="margin-top:6px">' +
            '<summary class="small muted">查看答案与讲解</summary>' +
            '<p class="small" style="margin-top:6px"><b>答案：</b>' + esc(answerText(q)) + '</p>' +
            '<p class="small"><b>讲解：</b>' + esc(q.explain) + '</p>' +
          '</details>' +
        '</div>' +
        '<div class="q-actions">' +
          '<button class="btn btn-danger btn-sm" data-action="parent-delete-wrong" data-id="' + esc(w.id) + '">移除</button>' +
        '</div>' +
      '</div>';
    }).join('');

    return '<p class="parent-sub">共 ' + entries.length + ' 道。移除错题不会改变星星和金币。</p>' +
      '<div class="scroll-list">' + rows + '</div>';
  }

  /* ---------- 题库管理 ---------- */
  function renderQuestionPanel() {
    var all = MK.state.getAllQuestions();
    var customIds = {};
    MK.state.getCustomQuestions().forEach(function (q) { customIds[q.id] = true; });
    var s = MK.state.getSave();
    var hidden = {};
    s.hiddenIds.forEach(function (id) { hidden[id] = true; });

    var list = all.filter(function (q) {
      return filterMap === 'all' || q.map === filterMap;
    });

    var filterOptions = '<option value="all"' + (filterMap === 'all' ? ' selected' : '') + '>全部地图</option>' +
      MK.state.MAPS.map(function (map) {
        return '<option value="' + map + '"' + (filterMap === map ? ' selected' : '') + '>' +
          esc(MK.state.MAP_INFO[map].name) +
        '</option>';
      }).join('');

    var rows = list.map(function (q) {
      var isCustom = !!customIds[q.id];
      var isHidden = !!hidden[q.id];
      return '<div class="q-row">' +
        '<div class="q-main">' +
          '<h4>' + esc(q.title || q.question) + '</h4>' +
          '<p>' + esc(MK.state.MAP_INFO[q.map].name) + ' · ' + esc(MK.state.TYPE_META[q.type].label) +
            ' · ' + esc(q.id) + '</p>' +
          '<p>答案：' + esc(answerText(q)) +
            (isCustom ? ' · <span class="badge forest">自定义</span>' : '') +
            (isHidden ? ' · <span class="hidden-flag">已隐藏</span>' : '') +
          '</p>' +
        '</div>' +
        '<div class="q-actions">' +
          '<button class="btn btn-secondary btn-sm" data-action="parent-toggle-hide" data-id="' + esc(q.id) + '">' +
            (isHidden ? '显示' : '隐藏') +
          '</button>' +
          (isCustom
            ? '<button class="btn btn-primary btn-sm" data-action="parent-edit-question" data-id="' + esc(q.id) + '">编辑</button>' +
              '<button class="btn btn-danger btn-sm" data-action="parent-delete-question" data-id="' + esc(q.id) + '">删除</button>'
            : '') +
        '</div>' +
      '</div>';
    }).join('');

    return '<div class="row-between">' +
        '<div><div class="bold">题库共 ' + all.length + ' 道</div>' +
          '<div class="small muted">本页显示 ' + list.length + ' 道</div></div>' +
        '<button class="btn btn-primary btn-sm" data-action="parent-new-question">＋ 新增题目</button>' +
      '</div>' +
      '<div class="field">' +
        '<label for="parent-map-filter">按地图筛选</label>' +
        '<select class="select" id="parent-map-filter">' + filterOptions + '</select>' +
      '</div>' +
      '<p class="small muted">隐藏题目会改变关卡数量和地图解锁判断，请谨慎操作。内置题不能直接编辑，可以隐藏或新增自定义题。</p>' +
      (rows ? '<div class="scroll-list">' + rows + '</div>' : '<div class="empty"><p>这个地图还没有题目。</p></div>');
  }

  /* ---------- 题目编辑器 ---------- */
  function renderEditor() {
    var isEdit = editor.mode === 'edit';
    var q = null;
    if (isEdit) {
      q = MK.state.getCustomQuestions().filter(function (x) { return x.id === editor.id; })[0] || null;
      if (!q) {
        editor = null;
        tab = 'questions';
        return renderQuestionPanel();
      }
    }

    var mapValue = q ? q.map : (filterMap === 'all' ? 'forest' : filterMap);
    var typeValue = q ? q.type : 'decimal';
    var answerType = q ? (q.answerType || 'number') : 'number';
    var title = q ? (q.title || '') : '';
    var scene = q ? q.scene : '';
    var question = q ? q.question : '';
    var answer = q ? q.answer : '';
    var unit = q ? (q.unit || '') : '';
    var options = q && Array.isArray(q.options) ? q.options.join('\n') : '';
    var hints = q && Array.isArray(q.hints) ? q.hints.join('\n') : '';
    var explain = q ? q.explain : '';

    var mapOptions = MK.state.MAPS.map(function (map) {
      return '<option value="' + map + '"' + (map === mapValue ? ' selected' : '') + '>' +
        esc(MK.state.MAP_INFO[map].name) +
      '</option>';
    }).join('');

    var typeOptions = Object.keys(MK.state.TYPE_META).map(function (type) {
      return '<option value="' + type + '"' + (type === typeValue ? ' selected' : '') + '>' +
        esc(MK.state.TYPE_META[type].label) +
      '</option>';
    }).join('');

    return '<div class="row-between">' +
        '<div><div class="bold" style="font-size:19px">' + (isEdit ? '编辑自定义题目' : '新增自定义题目') + '</div>' +
          '<div class="small muted">' + (isEdit ? '编号：' + esc(q.id) : '保存后会自动生成编号') + '</div></div>' +
        '<button class="btn btn-secondary btn-sm" data-action="parent-cancel-editor">返回</button>' +
      '</div>' +
      '<form id="parent-question-form" data-id="' + (q ? esc(q.id) : '') + '">' +
        '<div class="field"><label for="pq-map">地图</label><select class="select" id="pq-map">' + mapOptions + '</select></div>' +
        '<div class="field"><label for="pq-type">知识点</label><select class="select" id="pq-type">' + typeOptions + '</select></div>' +
        '<div class="field"><label for="pq-title">标题</label>' +
          '<input class="input" id="pq-title" maxlength="40" placeholder="例如：分披萨" value="' + esc(title) + '">' +
        '</div>' +
        '<div class="field"><label for="pq-scene">情境故事</label>' +
          '<textarea class="textarea" id="pq-scene" rows="4" placeholder="用孩子能读懂的话写一个小故事">' + esc(scene) + '</textarea>' +
        '</div>' +
        '<div class="field"><label for="pq-question">问题</label>' +
          '<textarea class="textarea" id="pq-question" rows="3" placeholder="要问孩子什么？">' + esc(question) + '</textarea>' +
        '</div>' +
        '<div class="field"><label for="pq-answer-type">答案输入方式</label>' +
          '<select class="select" id="pq-answer-type">' +
            '<option value="number"' + (answerType === 'number' ? ' selected' : '') + '>数字键盘</option>' +
            '<option value="equation"' + (answerType === 'equation' ? ' selected' : '') + '>方程 x =</option>' +
            '<option value="choice"' + (answerType === 'choice' ? ' selected' : '') + '>选择题</option>' +
          '</select>' +
        '</div>' +
        '<div class="field"><label for="pq-answer">答案</label>' +
          '<input class="input" id="pq-answer" placeholder="数值题填数字；选择题填选项原文" value="' + esc(answer) + '">' +
        '</div>' +
        '<div class="field"><label for="pq-unit">单位</label>' +
          '<input class="input" id="pq-unit" placeholder="如：元、厘米、分钟；没有可留空" value="' + esc(unit) + '">' +
        '</div>' +
        '<div class="field"><label for="pq-options">选项（仅选择题，一行一个）</label>' +
          '<textarea class="textarea" id="pq-options" rows="4" placeholder="例如：&#10;12 分钟&#10;30 分钟&#10;60 分钟">' + esc(options) + '</textarea>' +
        '</div>' +
        '<div class="field"><label for="pq-hints">分步提示（至少 2 条，一行一条）</label>' +
          '<textarea class="textarea" id="pq-hints" rows="4" placeholder="先问一个小问题&#10;再引导下一步">' + esc(hints) + '</textarea>' +
        '</div>' +
        '<div class="field"><label for="pq-explain">讲解</label>' +
          '<textarea class="textarea" id="pq-explain" rows="4" placeholder="用孩子能懂的语言讲清楚">' + esc(explain) + '</textarea>' +
        '</div>' +
        '<p class="small muted">自定义题会排在所属地图最后，不显示图形配图。保存后可在题库里隐藏或删除。</p>' +
        '<div class="modal-actions" style="justify-content:flex-end">' +
          '<button type="button" class="btn btn-secondary" data-action="parent-cancel-editor">取消</button>' +
          '<button type="submit" class="btn btn-primary">保存题目</button>' +
        '</div>' +
      '</form>';
  }

  function splitLines(text) {
    return String(text || '').split(/\r?\n/).map(function (line) {
      return line.trim();
    }).filter(function (line) { return !!line; });
  }

  function fieldValue(id) {
    var el = document.getElementById(id);
    return el ? String(el.value || '').trim() : '';
  }

  function newQuestionId() {
    var existing = {};
    MK.state.getAllQuestions().forEach(function (q) { existing[q.id] = true; });
    var base = 'custom-' + Date.now().toString(36);
    var id = base;
    var n = 1;
    while (existing[id]) {
      id = base + '-' + n;
      n += 1;
    }
    return id;
  }

  function handleEditorSubmit(form) {
    var editId = form.getAttribute('data-id') || '';
    var existing = editId
      ? MK.state.getCustomQuestions().filter(function (q) { return q.id === editId; })[0]
      : null;

    var answerType = fieldValue('pq-answer-type') || 'number';
    var answerRaw = fieldValue('pq-answer');
    var answer;
    if (answerType === 'choice') answer = answerRaw;
    else answer = answerRaw === '' ? '' : Number(answerRaw);

    var hints = splitLines(fieldValue('pq-hints'));
    if (hints.length < 2) {
      MK.ui.showToast('至少写 2 条分步提示，一行一条。');
      return;
    }

    var q = {
      id: existing ? existing.id : newQuestionId(),
      map: fieldValue('pq-map') || 'forest',
      type: fieldValue('pq-type') || 'decimal',
      title: fieldValue('pq-title') || '自定义题目',
      scene: fieldValue('pq-scene'),
      question: fieldValue('pq-question'),
      answer: answer,
      unit: fieldValue('pq-unit'),
      answerType: answerType,
      options: answerType === 'choice' ? splitLines(fieldValue('pq-options')) : undefined,
      hints: hints,
      explain: fieldValue('pq-explain')
    };

    var errors = MK.state.validateQuestion(q);
    if (answerType === 'choice' && q.options.length < 2) {
      errors.push('选择题至少需要 2 个选项，一行一个');
    }
    if (errors.length) {
      MK.ui.showToast(errors[0]);
      return;
    }

    var list = MK.state.getCustomQuestions();
    if (existing) {
      list = list.map(function (item) { return item.id === existing.id ? q : item; });
    } else {
      list.push(q);
    }
    MK.state.setCustomQuestions(list);

    MK.ui.showToast(existing ? '题目已保存。' : '题目已添加。');
    editor = null;
    tab = 'questions';
    renderScreen();
  }

  function handlePasswordSubmit(form) {
    var p1 = form.querySelector('#new-password');
    var p2 = form.querySelector('#new-password2');
    var a = p1 ? String(p1.value || '').trim() : '';
    var b = p2 ? String(p2.value || '').trim() : '';
    if (a.length < 4) {
      MK.ui.showToast('密码至少 4 位。');
      return;
    }
    if (a !== b) {
      MK.ui.showToast('两次输入的密码不一样。');
      return;
    }
    MK.state.setPassword(a);
    MK.ui.showToast('家长密码已修改。');
    form.reset();
  }

  /* ---------- 设置与存档 ---------- */
  function renderSettingsPanel() {
    var s = MK.state.getSave();
    return '<div class="card card-soft">' +
        '<div class="card-title">存档备份</div>' +
        '<p class="small muted">导出会把进度和自定义题库保存成一个 JSON 文件。换设备时可以先导出，再在新设备导入。</p>' +
        '<div class="modal-actions" style="justify-content:flex-start;flex-wrap:wrap">' +
          '<button class="btn btn-primary" data-action="parent-export">导出存档</button>' +
          '<button class="btn btn-secondary" data-action="parent-import">导入存档</button>' +
        '</div>' +
        '<input type="file" id="parent-import-file" accept="application/json,.json" hidden>' +
      '</div>' +

      '<div class="card card-soft">' +
        '<div class="card-title">修改家长密码</div>' +
        '<form id="parent-password-form">' +
          '<div class="field"><label for="new-password">新密码（至少 4 位）</label>' +
            '<input class="input" id="new-password" type="password" autocomplete="new-password" placeholder="输入新密码">' +
          '</div>' +
          '<div class="field"><label for="new-password2">再输一次</label>' +
            '<input class="input" id="new-password2" type="password" autocomplete="new-password" placeholder="再输一次">' +
          '</div>' +
          '<button type="submit" class="btn btn-primary">保存新密码</button>' +
        '</form>' +
      '</div>' +

      '<div class="card card-soft">' +
        '<div class="card-title">其他信息</div>' +
        '<p class="small muted">当前密码长度：' + String(s.parent.password || '').length + ' 位</p>' +
        '<p class="small muted">存档版本：v' + s.version + '</p>' +
        '<p class="small muted">存储状态：' + (MK.storage.isAvailable() ? '正常' : '不可用') + '</p>' +
      '</div>' +

      '<div class="card card-soft">' +
        '<div class="card-title">重置进度</div>' +
        '<p class="small muted">清空金币、星星、错题、等级和地图进度。自定义题库、设置和家长密码会保留。建议先导出备份。</p>' +
        '<button class="btn btn-danger" data-action="parent-reset">重置全部进度</button>' +
      '</div>';
  }

  function exportSave() {
    var data = MK.storage.bundle(MK.state.getSave(), MK.state.getCustomQuestions());
    var text = JSON.stringify(data, null, 2);
    var blob = new Blob([text], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var d = new Date();
    var name = 'math-kingdom-backup-' + d.getFullYear() + '-' +
      (d.getMonth() + 1 < 10 ? '0' : '') + (d.getMonth() + 1) + '-' +
      (d.getDate() < 10 ? '0' : '') + d.getDate() + '.json';
    var a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    window.setTimeout(function () {
      if (a.parentNode) a.parentNode.removeChild(a);
      URL.revokeObjectURL(url);
    }, 600);
    MK.ui.showToast('存档已导出。');
  }

  function handleImportFile(input) {
    var file = input.files && input.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      var data;
      try {
        data = JSON.parse(String(reader.result || ''));
      } catch (e) {
        MK.ui.showToast('这个文件不是有效的 JSON。');
        input.value = '';
        return;
      }
      var bundle = MK.storage.parseBundle(data);
      if (!bundle) {
        MK.ui.showToast('文件里没有找到可导入的存档。');
        input.value = '';
        return;
      }
      var validCustom = bundle.customQuestions
        ? MK.state.sanitizeCustom(bundle.customQuestions)
        : null;
      var skippedCustom = validCustom ? bundle.customQuestions.length - validCustom.length : 0;
      var parts = [];
      if (bundle.save) parts.push('游戏进度');
      if (validCustom) {
        parts.push(validCustom.length + ' 道自定义题' +
          (skippedCustom ? '（跳过 ' + skippedCustom + ' 道格式不正确的）' : ''));
      }
      MK.ui.showConfirm({
        title: '导入这份存档？',
        message: '将用文件里的' + (parts.join('和') || '数据') + '覆盖当前数据。建议先取消并导出当前存档。',
        confirmText: '导入',
        danger: true,
        onConfirm: function () {
          if (bundle.save) MK.state.replaceSave(bundle.save);
          if (validCustom) MK.state.replaceCustom(validCustom);
          MK.ui.applySettings();
          MK.ui.showToast('导入成功。');
          renderScreen();
        }
      });
      input.value = '';
    };
    reader.onerror = function () {
      MK.ui.showToast('读取文件失败，请再试一次。');
      input.value = '';
    };
    reader.readAsText(file);
  }

  /* ---------- 操作 ---------- */
  function handleAction(action, el) {
    switch (action) {
      case 'parent-tab':
        tab = el.dataset.tab || 'overview';
        editor = null;
        renderScreen();
        break;

      case 'parent-exit':
        authed = false;
        editor = null;
        MK.ui.renderHome();
        break;

      case 'parent-toggle-hide':
        (function () {
          var id = el.dataset.id;
          var hidden = MK.state.getSave().hiddenIds.indexOf(id) >= 0;
          if (hidden) {
            MK.state.setHidden(id, false);
            MK.ui.showToast('题目已显示。');
            renderScreen();
            return;
          }
          MK.ui.showConfirm({
            title: '隐藏这道题？',
            message: '隐藏后，它会从孩子的关卡中消失，并可能改变地图完成度和解锁判断。',
            confirmText: '隐藏',
            onConfirm: function () {
              MK.state.setHidden(id, true);
              MK.ui.showToast('题目已隐藏。');
              renderScreen();
            }
          });
        })();
        break;

      case 'parent-delete-wrong':
        (function () {
          var id = el.dataset.id;
          MK.ui.showConfirm({
            title: '移除这道错题？',
            message: '只会从错题本移除，不会改变星星、金币或题目本身。',
            confirmText: '移除',
            danger: true,
            onConfirm: function () {
              MK.state.removeWrong(id);
              MK.ui.showToast('错题已移除。');
              renderScreen();
            }
          });
        })();
        break;

      case 'parent-new-question':
        editor = { mode: 'new' };
        renderScreen();
        break;

      case 'parent-edit-question':
        (function () {
          var id = el.dataset.id;
          var found = MK.state.getCustomQuestions().filter(function (q) { return q.id === id; })[0];
          if (!found) {
            MK.ui.showToast('只有自定义题目可以编辑。');
            return;
          }
          editor = { mode: 'edit', id: id };
          renderScreen();
        })();
        break;

      case 'parent-delete-question':
        (function () {
          var id = el.dataset.id;
          var found = MK.state.getCustomQuestions().filter(function (q) { return q.id === id; })[0];
          if (!found) {
            MK.ui.showToast('没有找到这道自定义题。');
            return;
          }
          MK.ui.showConfirm({
            title: '删除这道自定义题？',
            message: '删除后不能恢复。错题本里的记录会显示为“题目已删除”，可以再单独移除。',
            confirmText: '删除',
            danger: true,
            onConfirm: function () {
              MK.state.setHidden(id, false);
              var list = MK.state.getCustomQuestions().filter(function (q) { return q.id !== id; });
              MK.state.setCustomQuestions(list);
              MK.ui.showToast('自定义题已删除。');
              renderScreen();
            }
          });
        })();
        break;

      case 'parent-cancel-editor':
        editor = null;
        tab = 'questions';
        renderScreen();
        break;

      case 'parent-export':
        exportSave();
        break;

      case 'parent-import':
        (function () {
          var input = document.getElementById('parent-import-file');
          if (input) input.click();
        })();
        break;

      case 'parent-reset':
        MK.ui.showConfirm({
          title: '重置全部进度？',
          message: '金币、星星、错题、等级和地图进度都会清空。自定义题库、设置和密码会保留。这个操作不能撤销。',
          confirmText: '重置进度',
          danger: true,
          onConfirm: function () {
            MK.state.resetProgress();
            MK.ui.applySettings();
            MK.ui.showToast('进度已重置。');
            renderScreen();
          }
        });
        break;

      default:
        break;
    }
  }

  function init() {
    document.addEventListener('change', function (e) {
      if (!e.target) return;
      if (e.target.id === 'parent-map-filter') {
        filterMap = e.target.value || 'all';
        renderScreen();
      } else if (e.target.id === 'parent-import-file') {
        handleImportFile(e.target);
      }
    });

    document.addEventListener('submit', function (e) {
      if (!e.target) return;
      if (e.target.id === 'parent-question-form') {
        e.preventDefault();
        handleEditorSubmit(e.target);
      } else if (e.target.id === 'parent-password-form') {
        e.preventDefault();
        handlePasswordSubmit(e.target);
      }
    });
  }

  window.MK = window.MK || {};
  var api = {
    init: init,
    renderScreen: renderScreen,
    handleAction: handleAction
  };
  Object.defineProperty(api, 'authed', {
    get: function () { return authed; },
    set: function (value) { authed = !!value; },
    enumerable: true
  });
  window.MK.parent = api;
})();
