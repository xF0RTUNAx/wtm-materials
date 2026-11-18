// Язык документа: ?lang=… → выбор в игре (localStorage fortuna_airdef_lang) → язык устройства; разделов на языке нет - английский
(function () {
  var CODES = ['en', 'ru', 'uk', 'de', 'es', 'fr'], NAMES = { en: 'English', ru: 'Русский', uk: 'Українська', de: 'Deutsch', es: 'Español', fr: 'Français' };
  var has = {}; document.querySelectorAll('section[data-lang]').forEach(function (s) { has[s.dataset.lang] = 1; });
  var q = null; try { q = new URLSearchParams(location.search).get('lang'); } catch (_) {}
  var s = null; try { s = localStorage.getItem('fortuna_airdef_lang'); } catch (_) {}
  var n = ((navigator.languages && navigator.languages[0]) || navigator.language || '').slice(0, 2).toLowerCase();
  if (/^(be|kk|ky|uz|tg|tk|hy|az)$/.test(n)) n = 'ru';
  var L = [q, s, n].filter(function (x) { return x && has[x]; })[0] || (has.en ? 'en' : 'ru');
  document.documentElement.lang = L;
  document.querySelectorAll('section[data-lang]').forEach(function (x) { x.classList.toggle('on', x.dataset.lang === L); });
  var t = document.querySelector('section[data-lang].on h1'); if (t) document.title = t.textContent + ' · Air Superiority';
  var FT = { ru: ['Конфиденциальность', 'Правила', 'Удаление аккаунта', 'Поддержка', 'Игра'], uk: ['Конфіденційність', 'Правила', 'Видалення акаунта', 'Підтримка', 'Гра'],
    de: ['Datenschutz', 'Nutzungsbedingungen', 'Konto löschen', 'Support', 'Spiel'], es: ['Privacidad', 'Condiciones', 'Eliminar la cuenta', 'Soporte', 'Juego'],
    fr: ['Confidentialité', 'Conditions', 'Supprimer le compte', 'Assistance', 'Jeu'], en: ['Privacy', 'Terms', 'Account deletion', 'Support', 'Air Superiority'] };
  var PAGES = ['privacy.html', 'terms.html', 'account-deletion.html', 'support.html', '../airdef.html'];
  document.querySelectorAll('footer a, a.brand').forEach(function (a) { var i = PAGES.indexOf(a.getAttribute('href')); if (i >= 0 && !a.classList.contains('brand')) a.textContent = (FT[L] || FT.en)[i]; if (i >= 0 && i < 4) a.href = PAGES[i] + '?lang=' + L; });
  document.querySelectorAll('section[data-lang] a[href$=".html"]').forEach(function (a) { var h = a.getAttribute('href'); if (PAGES.indexOf(h) >= 0 && PAGES.indexOf(h) < 4) a.href = h + '?lang=' + L; });
  var nav = document.querySelector('nav.langs');
  if (nav) nav.innerHTML = CODES.filter(function (c) { return has[c]; }).map(function (c) { return '<a href="?lang=' + c + '" class="' + (c === L ? 'on' : '') + '" lang="' + c + '">' + NAMES[c] + '</a>'; }).join('');
})();
