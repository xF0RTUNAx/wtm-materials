// Кадры с интерфейсом игры - на языке сайта: файл <имя>.<язык>.webp; нет такого - английский, потом русский.
// В разметке у них data-lsrc="<имя>" (без адреса: грузится только кадр текущего языка); у кнопок галереи - data-lbase.
var L10N_ALL = ['ru', 'en', 'uk', 'de', 'es', 'fr'];
var LIMG = { 'online/hangar-rating': L10N_ALL, 'online/shop-camo': L10N_ALL, 'online/research': L10N_ALL, 'online/quests': L10N_ALL, '57-g-f35-hud': L10N_ALL };
function limg(base) {
  var have = LIMG[base] || ['ru'], l = window.SITE_I18N ? window.SITE_I18N.lang : 'ru';
  if (have.indexOf(l) < 0) l = have.indexOf('en') >= 0 ? 'en' : 'ru';
  return '../img/' + base + '.' + l + '.webp';
}
function relocalize() {
  document.querySelectorAll('[data-lbase]').forEach(function (b) { b.dataset.src = limg(b.dataset.lbase); });
  document.querySelectorAll('[data-lsrc]').forEach(function (el) { var u = limg(el.dataset.lsrc); if (el.getAttribute('src') !== u) el.setAttribute('src', u); });
}
relocalize();
document.addEventListener('site-lang', relocalize);

// галерея: ручное листание (кнопки, миниатюры, стрелки клавиатуры); без автопрокрутки
(function () {
  var g = document.querySelector('.gallery');
  if (!g) return;
  var main = g.querySelector('.g-main img'), cap = g.querySelector('.g-main figcaption');
  var thumbs = Array.prototype.slice.call(g.querySelectorAll('.g-thumbs button'));
  var cur = 0;
  function show(i) {
    cur = (i + thumbs.length) % thumbs.length;
    var t = thumbs[cur];
    if (t.dataset.lbase) main.dataset.lsrc = t.dataset.lbase; else delete main.dataset.lsrc;
    main.src = t.dataset.src; main.alt = t.dataset.cap; if (cap) cap.textContent = t.dataset.cap;
    thumbs.forEach(function (b, k) { b.setAttribute('aria-current', k === cur ? 'true' : 'false'); });
    t.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  thumbs.forEach(function (b, k) { b.addEventListener('click', function () { show(k); }); });
  g.querySelector('.g-prev').addEventListener('click', function () { show(cur - 1); });
  g.querySelector('.g-next').addEventListener('click', function () { show(cur + 1); });
  g.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowLeft') show(cur - 1);
    if (e.key === 'ArrowRight') show(cur + 1);
  });
})();

// документ: подсветка текущего раздела в оглавлении
(function () {
  var links = document.querySelectorAll('.toc a');
  if (!links.length || !('IntersectionObserver' in window)) return;
  var map = {};
  links.forEach(function (a) { map[a.getAttribute('href').slice(1)] = a; });
  var io = new IntersectionObserver(function (es) {
    es.forEach(function (e) {
      if (e.isIntersecting) {
        links.forEach(function (a) { a.classList.remove('on'); });
        var a = map[e.target.id]; if (a) a.classList.add('on');
      }
    });
  }, { rootMargin: '0px 0px -75% 0px' });
  document.querySelectorAll('.doc-body h2[id]').forEach(function (h) { io.observe(h); });
})();

// Движение страницы. Всё выключено при prefers-reduced-motion; на сенсорных экранах - без своей прокрутки и наклонов.
var REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
var FINE = matchMedia('(pointer: fine)').matches;
function clamp(x, a, b) { return Math.min(b, Math.max(a, x)); }

// мягкая прокрутка колесом с инерцией (своя, без библиотек): колесо задаёт цель, страница догоняет её плавно.
// Тачпад, клавиши, полоса прокрутки и якоря работают как обычно; якорные ссылки - тоже плавно.
(function () {
  if (REDUCED || !FINE) return;
  var target = scrollY, cur = scrollY, raf = 0, last = 0;
  function max() { return document.documentElement.scrollHeight - innerHeight; }
  function step(now) {
    var dt = Math.min(0.05, (now - last) / 1000); last = now;
    cur += (target - cur) * (1 - Math.exp(-dt * 9));
    if (Math.abs(target - cur) < 0.5) cur = target;
    scrollTo(0, cur);
    raf = cur !== target ? requestAnimationFrame(step) : 0;
  }
  function go() { if (!raf) { last = performance.now(); raf = requestAnimationFrame(step); } }
  addEventListener('wheel', function (e) {
    if (e.ctrlKey || e.defaultPrevented || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
    if (e.target.closest && e.target.closest('.g-thumbs')) return;
    e.preventDefault();
    if (!raf) { target = cur = scrollY; }
    var k = e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? innerHeight : 1;
    target = clamp(target + e.deltaY * k, 0, max());
    go();
  }, { passive: false });
  addEventListener('scroll', function () { if (!raf) target = cur = scrollY; }, { passive: true });
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href^="#"]');
    if (!a || a.getAttribute('href').length < 2) return;
    var t = document.querySelector(a.getAttribute('href'));
    if (!t) return;
    e.preventDefault();
    cur = scrollY; target = clamp(t.getBoundingClientRect().top + scrollY, 0, max());
    history.replaceState(null, '', a.getAttribute('href'));
    go();
  });
})();

// кадры: первый экран уезжает медленнее страницы и чуть темнеет; кадры в рамках сдвигаются внутри рамки (параллакс)
// и проявляются при подходе - рамка раскрывается от краёв, без резкого стыка с тёмным фоном
(function () {
  if (REDUCED) return;
  var hero = document.querySelector('.hero-par');
  var items = Array.prototype.slice.call(document.querySelectorAll('[data-par]'));
  var reveals = Array.prototype.slice.call(document.querySelectorAll('.reveal'));
  var K = 0.05, queued = false;
  function run() {
    queued = false;
    var vh = innerHeight, y = scrollY;
    if (hero && y < vh * 1.3) { hero.style.transform = 'translate3d(0,' + (y * 0.22).toFixed(1) + 'px,0)'; hero.style.opacity = (1 - 0.45 * clamp(y / vh, 0, 1)).toFixed(3); }
    for (var i = 0; i < reveals.length; i++) {
      var f = reveals[i], r = f.getBoundingClientRect();
      if (r.bottom < -50 || r.top > vh + 50) continue;
      var e = clamp((vh - r.top) / (vh * 0.6), 0, 1); e = e * e * (3 - 2 * e);
      var wide = f.classList.contains('frame-wide') || f.classList.contains('frame-closing');
      var sx = (1 - e) * (wide ? 6 : 4), st = (1 - e) * (wide ? 8 : 6);
      f.style.clipPath = e >= 1 ? '' : 'inset(' + st.toFixed(2) + '% ' + sx.toFixed(2) + '% 0 ' + sx.toFixed(2) + '%)';
      f.dataset.e = e.toFixed(3);
    }
    for (var j = 0; j < items.length; j++) {
      var im = items[j], p = im.parentNode, q = p.getBoundingClientRect();
      if (q.bottom < -50 || q.top > vh + 50) continue;
      var off = (q.top + q.height / 2 - vh / 2) * K;
      var sc = 1 + 2 * (vh / 2 + q.height / 2) * K / q.height; // запас, чтобы край кадра не показывался
      var ee = p.dataset.e ? +p.dataset.e : 1;
      im.style.transform = 'translate3d(0,' + off.toFixed(1) + 'px,0) scale(' + (sc * (1 + 0.05 * (1 - ee))).toFixed(4) + ')';
    }
  }
  function q() { if (!queued) { queued = true; requestAnimationFrame(run); } }
  addEventListener('scroll', q, { passive: true });
  addEventListener('resize', q);
  run();
})();

// кадры боя и галереи чуть наклоняются за курсором, по ним проходит мягкий блик
(function () {
  if (REDUCED || !FINE) return;
  document.querySelectorAll('.tilt').forEach(function (el) {
    var img = el.querySelector('img');
    el.addEventListener('pointermove', function (e) {
      var r = img.getBoundingClientRect();
      var x = clamp((e.clientX - r.left) / r.width, 0, 1), y = clamp((e.clientY - r.top) / r.height, 0, 1);
      el.style.setProperty('--ry', ((x - 0.5) * 4).toFixed(2) + 'deg');
      el.style.setProperty('--rx', ((0.5 - y) * 3).toFixed(2) + 'deg');
      el.style.setProperty('--gx', (x * 100).toFixed(1) + '%');
      el.style.setProperty('--gy', (y * 100).toFixed(1) + '%');
      el.classList.add('on');
    });
    el.addEventListener('pointerleave', function () { el.style.setProperty('--rx', '0deg'); el.style.setProperty('--ry', '0deg'); el.classList.remove('on'); });
  });
})();

// кнопка «Играть» мягко тянется к курсору
(function () {
  if (REDUCED || !FINE) return;
  document.querySelectorAll('.play').forEach(function (b) {
    var s = b.querySelector('span');
    b.addEventListener('pointermove', function (e) {
      var r = b.getBoundingClientRect(), dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
      b.style.transform = 'translate(' + clamp(dx * 0.12, -6, 6).toFixed(1) + 'px,' + clamp(dy * 0.2, -4, 4).toFixed(1) + 'px)';
      if (s) s.style.transform = 'translate(' + clamp(dx * 0.05, -3, 3).toFixed(1) + 'px,' + clamp(dy * 0.08, -2, 2).toFixed(1) + 'px)';
    });
    b.addEventListener('pointerleave', function () { b.style.transform = ''; if (s) s.style.transform = ''; });
  });
})();

// «Онлайн»: миниатюра плавно меняется местами с большим снимком. Кадр задаётся ключом data-k: снимок или петля-видео
// («Кристаллы» - сцена витрины, играет только пока видна; при prefers-reduced-motion - постер). Подписи и alt - из i18n.js
(function () {
  var st = document.querySelector('.ol-stage');
  if (!st) return;
  var MEDIA = {
    hangar: { img: 'online/hangar-rating' }, camo: { img: 'online/shop-camo' }, research: { img: 'online/research' },
    quests: { img: 'online/quests' }, gems: { poster: '../img/online/shop-gems.webp', webm: '../video/gems-loop.webm', mp4: '../video/gems-loop.mp4' },
  };
  var t = function (k) { return window.SITE_I18N ? window.SITE_I18N.t(k) : k; };
  var io = !REDUCED && 'IntersectionObserver' in window ? new IntersectionObserver(function (es) {
    es.forEach(function (e) { var v = e.target; if (e.isIntersecting) { var p = v.play(); if (p && p.catch) p.catch(function () {}); } else v.pause(); });
  }, { threshold: 0.1 }) : null;
  function watch(v) { if (io) io.observe(v); }
  function unwatch(v) { if (io) io.unobserve(v); v.pause(); }
  function mk(k, big) { // элемент кадра по ключу
    var M = MEDIA[k], el;
    if (M.img) { el = document.createElement('img'); el.dataset.lsrc = M.img; el.src = limg(M.img); el.width = 1920; el.height = 1080; if (!big) el.loading = 'lazy'; }
    else {
      el = document.createElement('video'); el.muted = true; el.loop = true; el.playsInline = true; el.setAttribute('playsinline', ''); el.preload = 'metadata'; el.poster = M.poster;
      el.innerHTML = '<source src="' + M.webm + '" type="video/webm"><source src="' + M.mp4 + '" type="video/mp4">';
      watch(el);
    }
    el.dataset.k = k;
    if (big) { el.setAttribute('data-i-alt', 'ol_' + k + '_alt'); el.alt = t('ol_' + k + '_alt'); if (el.tagName === 'VIDEO') el.setAttribute('aria-label', t('ol_' + k + '_alt')); }
    else { el.alt = ''; el.setAttribute('aria-hidden', 'true'); }
    return el;
  }
  document.querySelectorAll('.ol-thumbs video').forEach(watch);
  document.querySelectorAll('.ol-thumbs button').forEach(function (b) {
    b.addEventListener('click', function () {
      var cur = st.querySelector('.on'), k = b.dataset.k, lab = b.querySelector('span');
      var next = mk(k, true);
      st.appendChild(next);
      var swap = function () {
        requestAnimationFrame(function () { next.classList.add('on'); if (cur) cur.classList.remove('on'); });
        setTimeout(function () { if (cur && cur.parentNode) { if (cur.tagName === 'VIDEO') unwatch(cur); cur.remove(); } }, 900);
        if (cur) { // в миниатюру уходит то, что было крупно
          var old = b.querySelector('img, video'); if (old.tagName === 'VIDEO') unwatch(old);
          b.replaceChild(mk(cur.dataset.k, false), old);
          b.dataset.k = cur.dataset.k;
          lab.setAttribute('data-i', 'ol_' + cur.dataset.k); lab.innerHTML = t('ol_' + cur.dataset.k);
        }
      };
      if (next.tagName === 'VIDEO' || next.complete) swap(); else next.onload = swap;
    });
  });
})();

// ролики: играют, только пока видны; при prefers-reduced-motion - стоят на постере, с кнопками
(function () {
  var vids = Array.prototype.slice.call(document.querySelectorAll('.clip video'));
  if (!vids.length) return;
  if (REDUCED || !('IntersectionObserver' in window)) { vids.forEach(function (v) { v.controls = true; v.preload = 'metadata'; }); return; }
  var io = new IntersectionObserver(function (es) {
    es.forEach(function (e) {
      var v = e.target;
      if (e.isIntersecting) { if (v.preload === 'none') v.preload = 'auto'; var p = v.play(); if (p && p.catch) p.catch(function () {}); } else v.pause();
    });
  }, { rootMargin: '200px 0px', threshold: 0.15 });
  vids.forEach(function (v) { io.observe(v); });
})();
