/* 本地存档：所有进度只保存在当前浏览器 */
(function () {
  'use strict';

  var SAVE_KEY = 'mathKingdom.save.v1';
  var CUSTOM_KEY = 'mathKingdom.custom.v1';
  var VERSION = 1;
  var available = true;

  function createDefaultSave() {
    return {
      version: VERSION,
      nickname: '小勇士',
      coins: 30,
      hearts: 3,
      xp: 0,
      stars: {},
      skipped: {},
      unlockedMaps: ['forest'],
      current: null,
      wrongBook: [],
      inventory: { hint: 1, hourglass: 1, skip: 0 },
      stats: {
        attempts: 0,
        completed: 0,
        firstTry: 0,
        skipped: 0,
        totalMs: 0,
        byType: {},
        byDay: {}
      },
      settings: { sound: true, reduceMotion: false, speech: true },
      parent: { password: '8888' },
      hiddenIds: [],
      finaleSeen: false
    };
  }

  function isObject(v) {
    return v && typeof v === 'object' && !Array.isArray(v);
  }

  function mergeSave(raw) {
    var d = createDefaultSave();
    if (!isObject(raw)) return d;

    var s = {};
    var k;
    for (k in d) {
      if (Object.prototype.hasOwnProperty.call(d, k)) s[k] = d[k];
    }
    for (k in raw) {
      if (Object.prototype.hasOwnProperty.call(raw, k)) s[k] = raw[k];
    }

    s.version = VERSION;
    s.coins = Number.isFinite(Number(raw.coins)) ? Number(raw.coins) : d.coins;
    s.hearts = Math.min(3, Math.max(0, Number(raw.hearts) || d.hearts));
    s.xp = Math.max(0, Number(raw.xp) || 0);
    s.stars = isObject(raw.stars) ? raw.stars : {};
    s.skipped = isObject(raw.skipped) ? raw.skipped : {};
    s.unlockedMaps = Array.isArray(raw.unlockedMaps) && raw.unlockedMaps.length
      ? raw.unlockedMaps.slice()
      : ['forest'];
    if (s.unlockedMaps.indexOf('forest') < 0) s.unlockedMaps.unshift('forest');
    s.current = isObject(raw.current) ? raw.current : null;
    s.wrongBook = Array.isArray(raw.wrongBook) ? raw.wrongBook : [];
    s.hiddenIds = Array.isArray(raw.hiddenIds) ? raw.hiddenIds : [];

    s.inventory = Object.assign({}, d.inventory, isObject(raw.inventory) ? raw.inventory : {});
    s.inventory.hint = Math.max(0, Number(s.inventory.hint) || 0);
    s.inventory.hourglass = Math.max(0, Number(s.inventory.hourglass) || 0);
    s.inventory.skip = Math.max(0, Number(s.inventory.skip) || 0);

    s.settings = Object.assign({}, d.settings, isObject(raw.settings) ? raw.settings : {});
    s.parent = Object.assign({}, d.parent, isObject(raw.parent) ? raw.parent : {});
    if (!s.parent.password) s.parent.password = '8888';

    s.stats = Object.assign({}, d.stats, isObject(raw.stats) ? raw.stats : {});
    s.stats.attempts = Math.max(0, Number(s.stats.attempts) || 0);
    s.stats.completed = Math.max(0, Number(s.stats.completed) || 0);
    s.stats.firstTry = Math.max(0, Number(s.stats.firstTry) || 0);
    s.stats.skipped = Math.max(0, Number(s.stats.skipped) || 0);
    s.stats.totalMs = Math.max(0, Number(s.stats.totalMs) || 0);
    s.stats.byType = isObject(s.stats.byType) ? s.stats.byType : {};
    s.stats.byDay = isObject(s.stats.byDay) ? s.stats.byDay : {};

    s.finaleSeen = !!raw.finaleSeen;
    return s;
  }

  function read(key) {
    try {
      return window.localStorage.getItem(key);
    } catch (e) {
      available = false;
      return null;
    }
  }

  function write(key, value) {
    try {
      window.localStorage.setItem(key, value);
      return true;
    } catch (e) {
      available = false;
      return false;
    }
  }

  function loadSave() {
    var raw = read(SAVE_KEY);
    if (!raw) return createDefaultSave();
    try {
      return mergeSave(JSON.parse(raw));
    } catch (e) {
      return createDefaultSave();
    }
  }

  function saveSave(save) {
    write(SAVE_KEY, JSON.stringify(save));
  }

  function loadCustom() {
    var raw = read(CUSTOM_KEY);
    if (!raw) return [];
    try {
      var list = JSON.parse(raw);
      return Array.isArray(list) ? list.filter(isObject) : [];
    } catch (e) {
      return [];
    }
  }

  function saveCustom(list) {
    write(CUSTOM_KEY, JSON.stringify(Array.isArray(list) ? list : []));
  }

  function bundle(save, custom) {
    return {
      app: 'math-kingdom',
      version: VERSION,
      exportedAt: new Date().toISOString(),
      save: save,
      customQuestions: custom
    };
  }

  function parseBundle(data) {
    if (!isObject(data)) return null;
    if (!isObject(data.save) && !Array.isArray(data.customQuestions)) return null;
    return {
      save: isObject(data.save) ? mergeSave(data.save) : null,
      customQuestions: Array.isArray(data.customQuestions)
        ? data.customQuestions.filter(isObject)
        : null
    };
  }

  function isAvailable() {
    return available;
  }

  window.MK = window.MK || {};
  window.MK.storage = {
    createDefaultSave: createDefaultSave,
    normalizeSave: mergeSave,
    loadSave: loadSave,
    saveSave: saveSave,
    loadCustom: loadCustom,
    saveCustom: saveCustom,
    bundle: bundle,
    parseBundle: parseBundle,
    isAvailable: isAvailable
  };
})();
