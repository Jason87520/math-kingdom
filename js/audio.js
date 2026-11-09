/* 音效与朗读：音效用 WebAudio 现场合成，不依赖音频文件 */
(function () {
  'use strict';

  var ctx = null;
  var enabled = true;

  function ensureContext() {
    if (ctx) {
      if (ctx.state === 'suspended' && ctx.resume) ctx.resume();
      return ctx;
    }
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try {
      ctx = new AC();
    } catch (e) {
      ctx = null;
    }
    if (ctx && ctx.state === 'suspended' && ctx.resume) ctx.resume();
    return ctx;
  }

  function tone(freq, duration, type, delay, volume) {
    if (!enabled) return;
    var c = ensureContext();
    if (!c) return;
    try {
      var t0 = c.currentTime + (delay || 0);
      var osc = c.createOscillator();
      var gain = c.createGain();
      osc.type = type || 'sine';
      osc.frequency.setValueAtTime(freq, t0);
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(volume || 0.12, t0 + 0.018);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
      osc.connect(gain);
      gain.connect(c.destination);
      osc.start(t0);
      osc.stop(t0 + duration + 0.05);
    } catch (e) {
      /* 忽略个别浏览器的音频限制 */
    }
  }

  function play(name) {
    if (!enabled) return;
    switch (name) {
      case 'correct':
        tone(523.25, 0.18, 'triangle', 0, 0.13);
        tone(659.25, 0.18, 'triangle', 0.09, 0.13);
        tone(783.99, 0.22, 'triangle', 0.18, 0.13);
        tone(1046.5, 0.32, 'triangle', 0.3, 0.11);
        break;
      case 'wrong':
        tone(220, 0.2, 'sine', 0, 0.09);
        tone(174.61, 0.28, 'sine', 0.14, 0.08);
        break;
      case 'coin':
        tone(987.77, 0.1, 'square', 0, 0.05);
        tone(1318.51, 0.16, 'square', 0.07, 0.045);
        break;
      case 'star':
        tone(1318.51, 0.14, 'triangle', 0, 0.08);
        tone(1567.98, 0.22, 'triangle', 0.09, 0.07);
        break;
      case 'buy':
        tone(659.25, 0.14, 'triangle', 0, 0.1);
        tone(880, 0.22, 'triangle', 0.1, 0.1);
        break;
      case 'levelup':
        tone(523.25, 0.16, 'triangle', 0, 0.12);
        tone(659.25, 0.16, 'triangle', 0.1, 0.12);
        tone(783.99, 0.16, 'triangle', 0.2, 0.12);
        tone(1046.5, 0.4, 'triangle', 0.32, 0.1);
        break;
      case 'unlock':
        tone(392, 0.18, 'sine', 0, 0.1);
        tone(523.25, 0.18, 'sine', 0.12, 0.1);
        tone(783.99, 0.35, 'sine', 0.24, 0.09);
        break;
      case 'click':
        tone(520, 0.05, 'sine', 0, 0.045);
        break;
      default:
        break;
    }
  }

  function speak(text) {
    if (!('speechSynthesis' in window) || !text) return false;
    try {
      window.speechSynthesis.cancel();
      var u = new SpeechSynthesisUtterance(String(text));
      u.lang = 'zh-CN';
      u.rate = 0.9;
      u.pitch = 1.05;
      window.speechSynthesis.speak(u);
      return true;
    } catch (e) {
      return false;
    }
  }

  function stopSpeak() {
    if ('speechSynthesis' in window) {
      try { window.speechSynthesis.cancel(); } catch (e) { /* ignore */ }
    }
  }

  function setEnabled(value) {
    enabled = !!value;
    if (!enabled) stopSpeak();
  }

  window.MK = window.MK || {};
  window.MK.audio = {
    play: play,
    speak: speak,
    stopSpeak: stopSpeak,
    setEnabled: setEnabled
  };
})();
