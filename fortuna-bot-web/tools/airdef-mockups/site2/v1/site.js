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
    main.src = t.dataset.src; main.alt = t.dataset.cap; cap.textContent = t.dataset.cap;
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
