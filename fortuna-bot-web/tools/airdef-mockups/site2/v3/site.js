// полосы техники: ручное листание кнопками (без автопрокрутки)
document.querySelectorAll('.strip-sec').forEach(function (sec) {
  var strip = sec.querySelector('.strip');
  sec.querySelectorAll('.strip-nav button').forEach(function (b) {
    b.addEventListener('click', function () {
      var li = strip.querySelector('li');
      var step = li ? li.getBoundingClientRect().width + 16 : strip.clientWidth * 0.8;
      strip.scrollBy({ left: step * Number(b.dataset.dir), behavior: 'smooth' });
    });
  });
});
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
