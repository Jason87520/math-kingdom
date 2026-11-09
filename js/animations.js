/* 小动画：星星飞行、彩纸、金币、爱心 */
(function () {
  'use strict';

  function reduced() {
    if (document.body && document.body.classList.contains('reduce-motion')) return true;
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  function rectOf(el) {
    if (el && el.getBoundingClientRect) return el.getBoundingClientRect();
    return null;
  }

  function animate(el, frames, options) {
    if (el.animate) {
      var anim = el.animate(frames, options);
      return anim;
    }
    return null;
  }

  function removeAfter(el, ms) {
    window.setTimeout(function () {
      if (el && el.parentNode) el.parentNode.removeChild(el);
    }, ms);
  }

  function flyStars(count, sourceEl, targetEl) {
    if (reduced()) return;
    var n = Math.max(1, Number(count) || 1);
    var s = rectOf(sourceEl) || {
      left: window.innerWidth / 2 - 20,
      top: window.innerHeight / 2,
      width: 40,
      height: 40
    };
    var t = rectOf(targetEl) || {
      left: window.innerWidth - 70,
      top: 20,
      width: 30,
      height: 30
    };
    var startX = s.left + s.width / 2 - 15;
    var startY = s.top + s.height / 2 - 15;
    var endX = t.left + t.width / 2 - 15;
    var endY = t.top + t.height / 2 - 15;

    for (var i = 0; i < n; i += 1) {
      var star = document.createElement('span');
      star.className = 'flying-star';
      star.textContent = '⭐';
      star.style.left = startX + 'px';
      star.style.top = startY + 'px';
      document.body.appendChild(star);
      var dx = endX - startX + (Math.random() * 30 - 15);
      var dy = endY - startY + (Math.random() * 24 - 12);
      var anim = animate(star, [
        { transform: 'translate(0, 0) scale(0.6) rotate(-15deg)', opacity: 0 },
        { transform: 'translate(' + dx * 0.55 + 'px,' + (dy * 0.55 - 34) + 'px) scale(1.3) rotate(8deg)', opacity: 1, offset: 0.55 },
        { transform: 'translate(' + dx + 'px,' + dy + 'px) scale(0.7) rotate(20deg)', opacity: 0.25 }
      ], {
        duration: 760,
        delay: i * 90,
        easing: 'cubic-bezier(0.2, 0.8, 0.3, 1)',
        fill: 'forwards'
      });
      if (anim) {
        anim.onfinish = function (node) {
          return function () { removeAfter(node, 0); };
        }(star);
        removeAfter(star, 760 + i * 90 + 200);
      } else {
        removeAfter(star, 200 + i * 90);
      }
    }
  }

  function confetti(count) {
    if (reduced()) return;
    var n = Math.max(8, Number(count) || 40);
    var colors = ['#F5B301', '#FF6B8A', '#3A7BD5', '#2E7D5B', '#6C4AB6', '#FFD54A'];
    for (var i = 0; i < n; i += 1) {
      var piece = document.createElement('div');
      piece.className = 'confetti-piece';
      piece.style.background = colors[i % colors.length];
      piece.style.left = (Math.random() * 100) + 'vw';
      piece.style.top = '-20px';
      piece.style.transform = 'rotate(' + (Math.random() * 360) + 'deg)';
      document.body.appendChild(piece);
      var drift = Math.random() * 160 - 80;
      var duration = 1200 + Math.random() * 1300;
      var anim = animate(piece, [
        { transform: 'translate(0, 0) rotate(0deg)', opacity: 1 },
        { transform: 'translate(' + drift + 'px,' + (window.innerHeight + 80) + 'px) rotate(' + (Math.random() * 720 - 360) + 'deg)', opacity: 0.15 }
      ], {
        duration: duration,
        delay: Math.random() * 350,
        easing: 'cubic-bezier(0.15, 0.6, 0.4, 1)',
        fill: 'forwards'
      });
      if (!anim) {
        removeAfter(piece, 300);
      } else {
        removeAfter(piece, duration + 800);
      }
    }
  }

  function coinBurst(sourceEl, count) {
    if (reduced()) return;
    var s = rectOf(sourceEl) || { left: window.innerWidth / 2, top: window.innerHeight / 2, width: 40, height: 40 };
    var n = Math.max(1, Number(count) || 1);
    for (var i = 0; i < n; i += 1) {
      var c = document.createElement('span');
      c.className = 'coin-fly';
      c.textContent = '💰';
      c.style.left = (s.left + s.width / 2) + 'px';
      c.style.top = (s.top + s.height / 2) + 'px';
      document.body.appendChild(c);
      var dx = Math.random() * 160 - 80;
      var dy = -80 - Math.random() * 100;
      var anim = animate(c, [
        { transform: 'translate(0,0) scale(0.5)', opacity: 1 },
        { transform: 'translate(' + dx + 'px,' + dy + 'px) scale(1.2)', opacity: 0 },
        { transform: 'translate(' + dx + 'px,' + (dy + 70) + 'px) scale(0.8)', opacity: 0 }
      ], {
        duration: 800 + Math.random() * 350,
        delay: i * 45,
        easing: 'ease-out',
        fill: 'forwards'
      });
      if (!anim) removeAfter(c, 250);
      else removeAfter(c, 1400);
    }
  }

  function heartLost(heartEl) {
    if (!heartEl) return;
    heartEl.classList.remove('beat');
    heartEl.classList.add('losing');
    window.setTimeout(function () {
      heartEl.classList.remove('losing');
      heartEl.classList.add('lost');
    }, 520);
  }

  function popStar(starEl) {
    if (!starEl) return;
    starEl.classList.add('on', 'pop');
    window.setTimeout(function () { starEl.classList.remove('pop'); }, 600);
  }

  function shake(el) {
    if (!el || reduced()) return;
    el.classList.remove('shake');
    void el.offsetWidth;
    el.classList.add('shake');
    window.setTimeout(function () { el.classList.remove('shake'); }, 450);
  }

  function purifyFlash(el) {
    if (!el) return;
    el.classList.add('purify-flash');
    window.setTimeout(function () { el.classList.remove('purify-flash'); }, 850);
  }

  window.MK = window.MK || {};
  window.MK.animations = {
    flyStars: flyStars,
    confetti: confetti,
    coinBurst: coinBurst,
    heartLost: heartLost,
    popStar: popStar,
    shake: shake,
    purifyFlash: purifyFlash,
    reduced: reduced
  };
})();
