// Документы: язык (?lang → выбор в игре → язык устройства; нет перевода - английский), тема (кнопка; по умолчанию - как в системе),
// шапка с логотипом, строкой документов и выбором языка, оглавление из h2 (на компьютере сбоку, на телефоне свёрнуто)
(function () {
  var D = document.documentElement;
  var CODES = ['en', 'ru', 'uk', 'de', 'es', 'fr'], NAMES = { en: 'English', ru: 'Русский', uk: 'Українська', de: 'Deutsch', es: 'Español', fr: 'Français' };
  var has = {}; document.querySelectorAll('section[data-lang]').forEach(function (s) { has[s.dataset.lang] = 1; });
  var q = null; try { q = new URLSearchParams(location.search).get('lang'); } catch (_) {}
  var s = null; try { s = localStorage.getItem('fortuna_airdef_lang'); } catch (_) {}
  var n = ((navigator.languages && navigator.languages[0]) || navigator.language || '').slice(0, 2).toLowerCase();
  if (/^(be|kk|ky|uz|tg|tk|hy|az)$/.test(n)) n = 'ru';
  var L = [q, s, n].filter(function (x) { return x && has[x]; })[0] || (has.en ? 'en' : 'ru');
  D.lang = L;
  var sec = null; document.querySelectorAll('section[data-lang]').forEach(function (x) { var on = x.dataset.lang === L; x.classList.toggle('on', on); if (on) sec = x; });
  var T = { toc: { ru: 'Содержание', en: 'Contents', uk: 'Зміст', de: 'Inhalt', es: 'Contenido', fr: 'Sommaire' },
    docs: { ru: ['Конфиденциальность', 'Правила', 'Удаление аккаунта', 'Поддержка'], en: ['Privacy', 'Terms', 'Account deletion', 'Support'], uk: ['Конфіденційність', 'Правила', 'Видалення акаунта', 'Підтримка'], de: ['Datenschutz', 'Nutzungsbedingungen', 'Konto löschen', 'Support'], es: ['Privacidad', 'Condiciones', 'Eliminar la cuenta', 'Soporte'], fr: ['Confidentialité', 'Conditions', 'Supprimer le compte', 'Support'] },
    theme: { ru: 'Тёмная или светлая тема', en: 'Dark or light theme', uk: 'Темна або світла тема', de: 'Dunkles oder helles Design', es: 'Tema oscuro o claro', fr: 'Thème sombre ou clair' },
    lang: { ru: 'Язык', en: 'Language', uk: 'Мова', de: 'Sprache', es: 'Idioma', fr: 'Langue' } };
  var PAGES = ['privacy.html', 'terms.html', 'account-deletion.html', 'support.html'], here = location.pathname.split('/').pop() || 'privacy.html';
  var h1 = sec && sec.querySelector('h1'); if (h1) document.title = h1.textContent + ' · Air Superiority';
  // тема: выбор посетителя (localStorage) или системная
  var TK = 'fortuna_legal_theme', th = null; try { th = localStorage.getItem(TK); } catch (_) {}
  var sys = window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  function setTheme(t) { D.dataset.theme = t; }
  setTheme(th || sys);
  var MOON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>';
  var SUN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
  // шапка
  var top = document.querySelector('.top');
  if (top) {
    top.innerHTML = '<a class="brand" href="../airdef.html" aria-label="Air Superiority"></a><nav class="docs">' + PAGES.map(function (p, i) { return '<a href="' + p + '?lang=' + L + '"' + (p === here ? ' aria-current="page"' : '') + '>' + T.docs[L][i] + '</a>'; }).join('') + '</nav>' +
      '<div class="tools"><label class="lang"><span class="vh">' + T.lang[L] + '</span><select>' + CODES.filter(function (c) { return has[c]; }).map(function (c) { return '<option value="' + c + '"' + (c === L ? ' selected' : '') + '>' + NAMES[c] + '</option>'; }).join('') + '</select></label>' +
      '<button class="theme" type="button" aria-label="' + T.theme[L] + '" title="' + T.theme[L] + '"></button></div>';
    top.querySelector('select').addEventListener('change', function (e) { try { localStorage.setItem('fortuna_airdef_lang', e.target.value); } catch (_) {} location.search = '?lang=' + e.target.value; });
    var tb = top.querySelector('.theme'), paint = function () { tb.innerHTML = D.dataset.theme === 'dark' ? SUN : MOON; };
    paint(); tb.addEventListener('click', function () { var t = D.dataset.theme === 'dark' ? 'light' : 'dark'; setTheme(t); try { localStorage.setItem(TK, t); } catch (_) {} paint(); });
  }
  // ссылки на соседние документы внутри текста - на том же языке
  document.querySelectorAll('section[data-lang] a[href$=".html"]').forEach(function (a) { var h = a.getAttribute('href'); if (PAGES.indexOf(h) >= 0) a.href = h + '?lang=' + L; });
  // оглавление
  var hs = sec ? [].slice.call(sec.querySelectorAll('h2')) : []; hs.forEach(function (h, i) { h.id = 's' + (i + 1); });
  var toc = document.querySelector('.toc');
  if (toc && hs.length > 2) {
    var items = '<ol>' + hs.map(function (h) { return '<li><a href="#' + h.id + '">' + h.textContent.replace(/^\d+\.\s*/, '') + '</a></li>'; }).join('') + '</ol>';
    toc.innerHTML = window.matchMedia && matchMedia('(max-width: 900px)').matches ? '<details><summary class="toc-h">' + T.toc[L] + '</summary>' + items + '</details>' : '<p class="toc-h">' + T.toc[L] + '</p>' + items;
    var links = [].slice.call(toc.querySelectorAll('a'));
    if ('IntersectionObserver' in window) { var io = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) links.forEach(function (a) { a.classList.toggle('on', a.getAttribute('href') === '#' + e.target.id); }); }); }, { rootMargin: '0px 0px -75% 0px' }); hs.forEach(function (h) { io.observe(h); }); }
  } else if (toc) toc.remove();
  var f = document.querySelector('footer'); if (f) f.innerHTML = '<span>© 2026 Air Superiority</span><a href="mailto:support@airsuperiorityonline.com">support@airsuperiorityonline.com</a>';
})();
