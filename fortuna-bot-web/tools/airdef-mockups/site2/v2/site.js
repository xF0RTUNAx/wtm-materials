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
