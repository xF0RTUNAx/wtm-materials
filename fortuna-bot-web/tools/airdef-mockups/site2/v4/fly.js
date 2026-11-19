// Запуск 3D поверх кадров. Сам three.js и модели грузятся только после загрузки страницы, пока человек смотрит на первый экран.
// Не грузим вообще: prefers-reduced-motion, режим экономии трафика, нет WebGL. Тогда остаются обычные кадры.
(function () {
  var html = document.documentElement;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  var c = navigator.connection;
  if (c && (c.saveData || /(^|-)2g$/.test(c.effectiveType || ''))) return;
  if (/[?&]3d=0/.test(location.search)) return;
  try {
    var t = document.createElement('canvas');
    if (!(t.getContext('webgl2') || t.getContext('webgl'))) return;
  } catch (e) { return; }
  function go() {
    import('./fly3d.js').then(function (m) { m.start(); }).catch(function (e) { html.classList.remove('fly-on'); console.warn('3D выключено:', e); });
  }
  html.classList.add('fly-on');
  var later = window.requestIdleCallback || function (f) { return setTimeout(f, 200); };
  if (document.readyState === 'complete') later(go); else addEventListener('load', function () { later(go); });
})();
