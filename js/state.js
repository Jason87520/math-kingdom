/* 游戏状态与规则：金币、爱心、星星、经验、解锁、错题、统计 */
(function () {
  'use strict';

  var MAPS = ['forest', 'valley', 'summit'];

  var MAP_INFO = {
    forest: {
      name: '新手林',
      emoji: '🌲',
      desc: '阳光、树影和刚刚开始的冒险',
      theme: 'forest'
    },
    valley: {
      name: '进阶谷',
      emoji: '🏞️',
      desc: '山谷里的风会帮你思考',
      theme: 'valley'
    },
    summit: {
      name: '智慧峰',
      emoji: '🏔️',
      desc: '云雾之上，糊涂魔王的城堡',
      theme: 'summit'
    }
  };

  var TYPE_META = {
    decimal: { label: '小数四则', emoji: '🛒' },
    equation: { label: '简易方程', emoji: '⚖️' },
    factors: { label: '因数与倍数', emoji: '🧮' },
    area: { label: '多边形面积', emoji: '📐' },
    solid: { label: '长方体与正方体', emoji: '📦' },
    classic: { label: '经典应用题', emoji: '🧩' }
  };

  var SHOP = {
    hint: {
      key: 'hint',
      name: '提示卡',
      emoji: '💡',
      price: 20,
      desc: '答题时直接看一步提示，不扣爱心'
    },
    hourglass: {
      key: 'hourglass',
      name: '时光沙漏',
      emoji: '⏳',
      price: 15,
      desc: '10 秒大字题意回顾 + 朗读关键句，不扣爱心'
    },
    skip: {
      key: 'skip',
      name: '跳过卡',
      emoji: '🚪',
      price: 60,
      desc: '跳过本关：0 星，展示讲解，解锁下一关'
    }
  };

  var save = null;
  var custom = [];

  function isObject(v) {
    return v && typeof v === 'object' && !Array.isArray(v);
  }

  function persist() {
    MK.storage.saveSave(save);
  }

  function init() {
    save = MK.storage.loadSave();
    custom = sanitizeCustom(MK.storage.loadCustom());
    if (!isObject(save)) save = MK.storage.createDefaultSave();
    if (!(save.hearts >= 1 && save.hearts <= 3)) save.hearts = 3;
    reconcileUnlocks();
    persist();
  }

  function getSave() {
    return save;
  }

  function getAllQuestions() {
    var builtin = Array.isArray(window.QUESTION_BANK) ? window.QUESTION_BANK : [];
    var ids = {};
    builtin.forEach(function (q) {
      if (q && q.id) ids[q.id] = true;
    });
    var extra = custom.filter(function (q) {
      return q && q.id && !ids[q.id];
    });
    return builtin.concat(extra);
  }

  function getQuestions() {
    return getAllQuestions().filter(function (q) {
      return save.hiddenIds.indexOf(q.id) < 0;
    });
  }

  function getQuestion(id) {
    return getQuestions().filter(function (q) { return q.id === id; })[0] || null;
  }

  function getQuestionAny(id) {
    return getAllQuestions().filter(function (q) { return q.id === id; })[0] || null;
  }

  function getMapQuestions(map) {
    return getQuestions().filter(function (q) { return q.map === map; });
  }

  function getCustomQuestions() {
    return custom.slice();
  }

  /* 只接受结构完整、编号不重复、不与内置题冲突的自定义题 */
  function sanitizeCustom(list) {
    var seen = {};
    var builtin = {};
    (Array.isArray(window.QUESTION_BANK) ? window.QUESTION_BANK : []).forEach(function (q) {
      if (q && q.id) builtin[q.id] = true;
    });
    return (Array.isArray(list) ? list : []).filter(function (q) {
      if (!isObject(q) || !q.id || seen[q.id] || builtin[q.id]) return false;
      if (validateQuestion(q).length > 0) return false;
      seen[q.id] = true;
      return true;
    });
  }

  function setCustomQuestions(list) {
    custom = sanitizeCustom(list);
    MK.storage.saveCustom(custom);
    reconcileUnlocks();
  }

  function isFinished(q) {
    if (!q) return false;
    return Number(save.stars[q.id]) > 0 || !!save.skipped[q.id];
  }

  function isMapUnlocked(map) {
    return save.unlockedMaps.indexOf(map) >= 0;
  }

  function isLevelUnlocked(map, index) {
    if (!isMapUnlocked(map)) return false;
    if (index <= 0) return true;
    var qs = getMapQuestions(map);
    return isFinished(qs[index - 1]);
  }

  function mapProgress(map) {
    var qs = getMapQuestions(map);
    var finished = qs.filter(isFinished).length;
    return {
      finished: finished,
      total: qs.length,
      pct: qs.length ? Math.round((finished / qs.length) * 100) : 0
    };
  }

  function overallProgress() {
    var qs = getQuestions();
    var finished = qs.filter(isFinished).length;
    return {
      finished: finished,
      total: qs.length,
      pct: qs.length ? Math.round((finished / qs.length) * 100) : 0
    };
  }

  /* 前一张地图 100% 时解锁下一张；返回是否有新地图被解锁 */
  function reconcileUnlocks() {
    var changed = false;
    for (var i = 0; i < MAPS.length - 1; i += 1) {
      var p = mapProgress(MAPS[i]);
      var next = MAPS[i + 1];
      if (p.total > 0 && p.finished === p.total && save.unlockedMaps.indexOf(next) < 0) {
        save.unlockedMaps.push(next);
        changed = true;
      }
    }
    if (changed) persist();
    return changed;
  }

  function totalStars() {
    return Object.keys(save.stars).reduce(function (sum, id) {
      return sum + (Number(save.stars[id]) || 0);
    }, 0);
  }

  function maxStars() {
    return getQuestions().length * 3;
  }

  function levelTitle(level) {
    if (level <= 3) return '见习探险家';
    if (level <= 6) return '森林行者';
    if (level <= 9) return '山谷向导';
    if (level <= 12) return '智慧勇者';
    return '王国守护者';
  }

  function levelInfo() {
    var xp = Math.max(0, Number(save.xp) || 0);
    var level = Math.floor(xp / 100) + 1;
    return {
      level: level,
      xp: xp,
      cur: xp % 100,
      need: 100,
      title: levelTitle(level)
    };
  }

  function nextLevelInMap(q) {
    if (!q) return null;
    var qs = getMapQuestions(q.map);
    for (var i = 0; i < qs.length; i += 1) {
      if (qs[i].id === q.id) return qs[i + 1] || null;
    }
    return null;
  }

  function firstUnfinishedLevel(map) {
    var qs = getMapQuestions(map);
    for (var i = 0; i < qs.length; i += 1) {
      if (!isFinished(qs[i])) return qs[i];
    }
    return null;
  }

  function startLevel(q) {
    var resuming = save.current &&
      save.current.levelId === q.id &&
      !!save.current.inProgress;
    if (!resuming) {
      save.hearts = 3;
      save.current = { map: q.map, levelId: q.id, inProgress: true };
    } else if (!(save.hearts > 0)) {
      save.hearts = 3;
    }
    persist();
    return save.hearts;
  }

  function loseHeart() {
    save.hearts = Math.max(0, (Number(save.hearts) || 0) - 1);
    persist();
    return save.hearts;
  }

  function restartLevel(q) {
    save.hearts = 3;
    save.current = { map: q.map, levelId: q.id, inProgress: true };
    persist();
  }

  function abandonLevel() {
    if (save.current) save.current.inProgress = false;
    save.hearts = 3;
    persist();
  }

  function useItem(key) {
    if (!save.inventory[key] || save.inventory[key] <= 0) return false;
    save.inventory[key] -= 1;
    persist();
    return true;
  }

  function buyItem(key) {
    var item = SHOP[key];
    if (!item) return { ok: false, reason: 'unknown' };
    if (save.coins < item.price) return { ok: false, reason: 'coins' };
    save.coins -= item.price;
    save.inventory[key] = (Number(save.inventory[key]) || 0) + 1;
    persist();
    return { ok: true, item: item };
  }

  function addWrong(id) {
    var entry = null;
    for (var i = 0; i < save.wrongBook.length; i += 1) {
      if (save.wrongBook[i].id === id) {
        entry = save.wrongBook[i];
        break;
      }
    }
    var now = Date.now();
    if (entry) {
      entry.wrongCount = (Number(entry.wrongCount) || 1) + 1;
      entry.lastWrongAt = now;
    } else {
      save.wrongBook.push({ id: id, wrongCount: 1, addedAt: now, lastWrongAt: now });
    }
    persist();
  }

  function removeWrong(id) {
    save.wrongBook = save.wrongBook.filter(function (w) { return w.id !== id; });
    persist();
  }

  function getWrongEntries(includeMissing) {
    var list = save.wrongBook.map(function (w) {
      var q = includeMissing ? getQuestionAny(w.id) : getQuestion(w.id);
      return {
        id: w.id,
        wrongCount: Number(w.wrongCount) || 1,
        addedAt: w.addedAt || 0,
        lastWrongAt: w.lastWrongAt || 0,
        question: q
      };
    });
    if (includeMissing) return list;
    return list.filter(function (w) { return !!w.question; });
  }

  function dayKey(date) {
    var d = date || new Date();
    var m = d.getMonth() + 1;
    var day = d.getDate();
    return d.getFullYear() + '-' + (m < 10 ? '0' + m : m) + '-' + (day < 10 ? '0' + day : day);
  }

  function ensureTypeStats(type) {
    if (!save.stats.byType[type]) {
      save.stats.byType[type] = {
        attempts: 0,
        wrong: 0,
        completed: 0,
        firstTry: 0,
        skipped: 0,
        stars: 0,
        timeMs: 0
      };
    }
    return save.stats.byType[type];
  }

  function ensureDayStats(key) {
    if (!save.stats.byDay[key]) {
      save.stats.byDay[key] = { attempts: 0, correct: 0, skipped: 0, timeMs: 0 };
    }
    return save.stats.byDay[key];
  }

  /* 记录一次作答/跳过；现在会把时间、错误次数和首次正确率记进统计 */
  function recordAttempt(q, opts) {
    opts = opts || {};
    var elapsed = Math.min(Math.max(0, Number(opts.elapsedMs) || 0), 15 * 60 * 1000);
    var type = q.type || 'classic';
    var ts = ensureTypeStats(type);
    var day = ensureDayStats(dayKey(new Date()));

    save.stats.attempts = (Number(save.stats.attempts) || 0) + 1;
    save.stats.totalMs = (Number(save.stats.totalMs) || 0) + elapsed;

    ts.attempts += 1;
    ts.timeMs += elapsed;
    day.attempts += 1;
    day.timeMs += elapsed;

    if (opts.wrong) ts.wrong += 1;
    if (opts.skipped) {
      ts.skipped += 1;
      save.stats.skipped = (Number(save.stats.skipped) || 0) + 1;
      day.skipped += 1;
    }
    if (opts.correct) day.correct += 1;

    if (opts.correct && opts.firstCompletion) {
      ts.completed += 1;
      ts.stars += Number(opts.stars) || 0;
      if (opts.firstTry) ts.firstTry += 1;
      save.stats.completed = (Number(save.stats.completed) || 0) + 1;
      if (opts.firstTry) save.stats.firstTry = (Number(save.stats.firstTry) || 0) + 1;
    }

    persist();
  }

  function checkFinale() {
    var p = mapProgress('summit');
    return p.total > 0 && p.finished === p.total && !save.finaleSeen;
  }

  function markFinaleSeen() {
    save.finaleSeen = true;
    persist();
  }

  /*
   * 完成一关。
   * stars: 本次获得的星（0 表示跳过）
   * opts: { skipped, firstTry, elapsedMs }
   */
  function finishLevel(q, stars, opts) {
    opts = opts || {};
    var wasFinished = isFinished(q);
    var prevBest = Number(save.stars[q.id]) || 0;
    var first = !wasFinished;
    var earnedStars = opts.skipped ? 0 : Math.max(1, Math.min(3, Number(stars) || 1));
    var coins = 0;
    var xp = 0;
    var leveledUp = false;
    var levelBefore = levelInfo().level;

    if (opts.skipped) {
      if (!prevBest) save.skipped[q.id] = true;
      recordAttempt(q, {
        skipped: true,
        correct: false,
        firstCompletion: first,
        firstTry: false,
        stars: 0,
        elapsedMs: opts.elapsedMs
      });
    } else {
      save.stars[q.id] = Math.max(prevBest, earnedStars);
      if (save.skipped[q.id]) delete save.skipped[q.id];

      if (first) {
        coins = 10 + 5 * earnedStars;
        xp = 15 + 10 * earnedStars;
        save.coins += coins;
        save.xp += xp;
        recordAttempt(q, {
          correct: true,
          firstCompletion: true,
          firstTry: !!opts.firstTry,
          stars: earnedStars,
          elapsedMs: opts.elapsedMs
        });
      } else {
        recordAttempt(q, {
          correct: true,
          firstCompletion: false,
          firstTry: false,
          stars: earnedStars,
          elapsedMs: opts.elapsedMs
        });
      }
      leveledUp = levelInfo().level > levelBefore;
    }

    var next = nextLevelInMap(q);
    save.current = next ? { map: next.map, levelId: next.id, inProgress: false } : null;
    save.hearts = 3;

    var beforeUnlocked = save.unlockedMaps.slice();
    reconcileUnlocks();
    var newlyUnlocked = save.unlockedMaps.filter(function (m) {
      return beforeUnlocked.indexOf(m) < 0;
    });

    persist();

    return {
      first: first,
      prevBest: prevBest,
      best: Number(save.stars[q.id]) || 0,
      stars: earnedStars,
      coins: coins,
      xp: xp,
      leveledUp: leveledUp,
      level: levelInfo().level,
      newlyUnlocked: newlyUnlocked,
      finale: checkFinale(),
      skipped: !!opts.skipped
    };
  }

  /* 复习模式答对：净化错题，给少量奖励 */
  function purify(q, opts) {
    opts = opts || {};
    var existed = save.wrongBook.some(function (w) { return w.id === q.id; });
    var levelBefore = levelInfo().level;

    save.wrongBook = save.wrongBook.filter(function (w) { return w.id !== q.id; });
    var coins = existed ? 10 : 0;
    var xp = existed ? 15 : 0;
    save.coins += coins;
    save.xp += xp;

    recordAttempt(q, {
      correct: true,
      firstCompletion: false,
      firstTry: false,
      stars: 0,
      elapsedMs: opts.elapsedMs
    });

    persist();

    return {
      existed: existed,
      coins: coins,
      xp: xp,
      leveledUp: levelInfo().level > levelBefore,
      level: levelInfo().level
    };
  }

  function setHidden(id, hidden) {
    var idx = save.hiddenIds.indexOf(id);
    if (hidden && idx < 0) save.hiddenIds.push(id);
    if (!hidden && idx >= 0) save.hiddenIds.splice(idx, 1);
    reconcileUnlocks();
    persist();
  }

  function setPassword(password) {
    save.parent.password = String(password || '8888');
    persist();
  }

  function setSetting(key, value) {
    save.settings[key] = value;
    persist();
  }

  function replaceSave(newSave) {
    save = MK.storage.normalizeSave
      ? MK.storage.normalizeSave(newSave)
      : MK.storage.createDefaultSave();
    reconcileUnlocks();
    persist();
  }

  function replaceCustom(list) {
    setCustomQuestions(list);
    persist();
  }

  function resetProgress() {
    var password = save.parent.password;
    var hidden = save.hiddenIds.slice();
    var settings = JSON.parse(JSON.stringify(save.settings));
    save = MK.storage.createDefaultSave();
    save.parent.password = password;
    save.hiddenIds = hidden;
    save.settings = settings;
    persist();
    reconcileUnlocks();
  }

  function firstTryRate() {
    var completed = Number(save.stats.completed) || 0;
    return completed ? (Number(save.stats.firstTry) || 0) / completed : null;
  }

  function averageMs() {
    var attempts = Number(save.stats.attempts) || 0;
    return attempts ? (Number(save.stats.totalMs) || 0) / attempts : null;
  }

  function typeOverview() {
    return Object.keys(TYPE_META).map(function (type) {
      var ts = save.stats.byType[type] || {};
      var completed = Number(ts.completed) || 0;
      return {
        type: type,
        label: TYPE_META[type].label,
        attempts: Number(ts.attempts) || 0,
        wrong: Number(ts.wrong) || 0,
        completed: completed,
        firstTry: Number(ts.firstTry) || 0,
        firstTryRate: completed ? (Number(ts.firstTry) || 0) / completed : null,
        skipped: Number(ts.skipped) || 0,
        stars: Number(ts.stars) || 0,
        timeMs: Number(ts.timeMs) || 0
      };
    });
  }

  function recentDays(count) {
    var n = count || 7;
    var out = [];
    var now = new Date();
    for (var i = n - 1; i >= 0; i -= 1) {
      var d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      var key = dayKey(d);
      var st = save.stats.byDay[key] || {};
      out.push({
        key: key,
        label: (d.getMonth() + 1) + '/' + d.getDate(),
        attempts: Number(st.attempts) || 0,
        correct: Number(st.correct) || 0,
        skipped: Number(st.skipped) || 0,
        timeMs: Number(st.timeMs) || 0
      });
    }
    return out;
  }

  function validateQuestion(q) {
    var errors = [];
    if (!isObject(q)) return ['题目数据格式不正确'];
    if (!q.id || typeof q.id !== 'string') errors.push('缺少 id');
    if (!MAP_INFO[q.map]) errors.push('地图必须是 forest / valley / summit');
    if (!TYPE_META[q.type]) errors.push('知识点类型不正确');
    if (!q.scene || !String(q.scene).trim()) errors.push('缺少情境故事');
    if (!q.question || !String(q.question).trim()) errors.push('缺少问题');
    if (q.unit === undefined || q.unit === null) errors.push('缺少单位（选择题可以留空字符串）');
    if (!Array.isArray(q.hints) || q.hints.filter(function (h) { return h && String(h).trim(); }).length < 2) {
      errors.push('至少需要 2 条分步提示');
    }
    if (!q.explain || !String(q.explain).trim()) errors.push('缺少讲解');

    var type = q.answerType || 'number';
    if (type === 'choice') {
      if (!Array.isArray(q.options) || q.options.length < 2) {
        errors.push('选择题至少需要 2 个选项');
      } else if (q.options.indexOf(q.answer) < 0) {
        errors.push('选择题答案必须在选项中');
      }
    } else if (type === 'number' || type === 'equation') {
      if (q.answer === '' || q.answer === null || q.answer === undefined || !Number.isFinite(Number(q.answer))) {
        errors.push('数值题的答案是数字');
      }
    } else {
      errors.push('answerType 只能是 number / equation / choice');
    }
    return errors;
  }

  window.MK = window.MK || {};
  window.MK.state = {
    MAPS: MAPS,
    MAP_INFO: MAP_INFO,
    TYPE_META: TYPE_META,
    SHOP: SHOP,
    init: init,
    getSave: getSave,
    getAllQuestions: getAllQuestions,
    getQuestions: getQuestions,
    getQuestion: getQuestion,
    getQuestionAny: getQuestionAny,
    getMapQuestions: getMapQuestions,
    getCustomQuestions: getCustomQuestions,
    setCustomQuestions: setCustomQuestions,
    sanitizeCustom: sanitizeCustom,
    isFinished: isFinished,
    isMapUnlocked: isMapUnlocked,
    isLevelUnlocked: isLevelUnlocked,
    mapProgress: mapProgress,
    overallProgress: overallProgress,
    reconcileUnlocks: reconcileUnlocks,
    totalStars: totalStars,
    maxStars: maxStars,
    levelInfo: levelInfo,
    nextLevelInMap: nextLevelInMap,
    firstUnfinishedLevel: firstUnfinishedLevel,
    startLevel: startLevel,
    loseHeart: loseHeart,
    restartLevel: restartLevel,
    abandonLevel: abandonLevel,
    useItem: useItem,
    buyItem: buyItem,
    addWrong: addWrong,
    removeWrong: removeWrong,
    getWrongEntries: getWrongEntries,
    recordAttempt: recordAttempt,
    finishLevel: finishLevel,
    purify: purify,
    checkFinale: checkFinale,
    markFinaleSeen: markFinaleSeen,
    setHidden: setHidden,
    setPassword: setPassword,
    setSetting: setSetting,
    replaceSave: replaceSave,
    replaceCustom: replaceCustom,
    resetProgress: resetProgress,
    firstTryRate: firstTryRate,
    averageMs: averageMs,
    typeOverview: typeOverview,
    recentDays: recentDays,
    validateQuestion: validateQuestion
  };
})();
