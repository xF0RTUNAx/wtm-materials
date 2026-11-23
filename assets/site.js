// Common page behaviour: theme, "More" panel, vehicle search, home top bar.
const S = JSON.parse(document.getElementById('i18n').textContent);
export const T = (k, vars) => {
  let s = S[k] ?? k;
  if (vars && typeof s === 'string') s = s.replace(/\{(\w+)\}/g, (m, x) => (x in vars ? vars[x] : m));
  return s;
};
export const LANG = S.lang;
export const PFX = LANG === 'ru' ? '' : '/en';
export function plural(forms, n) {
  if (LANG !== 'ru') return n === 1 ? forms[0] : forms[1];
  const a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return forms[2];
  if (b > 1 && b < 5) return forms[1];
  return b === 1 ? forms[0] : forms[2];
}
const ROM = [[10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
export function roman(n) { let s = ''; for (const [v, r] of ROM) while (n >= v) { s += r; n -= v; } return s; }
export function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
export function norm(s) { return String(s).toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9]+/g, ''); }

// ---------- theme ----------
const root = document.documentElement;
function markTheme() {
  const cur = root.getAttribute('data-theme') || 'dark';
  document.querySelectorAll('[data-theme-set]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.themeSet === cur)));
}
document.querySelectorAll('[data-theme-set]').forEach((b) => b.addEventListener('click', () => {
  root.setAttribute('data-theme', b.dataset.themeSet);
  try { localStorage.setItem('wtm.theme', b.dataset.themeSet); } catch { /* private mode */ }
  markTheme();
  document.dispatchEvent(new CustomEvent('themechange'));
}));
markTheme();

// ---------- "More" panel (works without JS through :target) ----------
const menu = document.getElementById('menu');
let menuFrom = null;
function setMenu(open, from) {
  menu.classList.toggle('is-open', open);
  root.classList.toggle('menu-open', open);
  document.querySelectorAll('[data-menu]').forEach((a) => a.setAttribute('aria-expanded', String(open)));
  if (open) { menuFrom = from; menu.querySelector('.menu__head a').focus(); } else if (menuFrom) menuFrom.focus();
}
document.querySelectorAll('[data-menu]').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); setMenu(true, a); }));
menu.querySelectorAll('.menu__scrim, [data-menu-close]').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); setMenu(false); }));
menu.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') setMenu(false);
  if (e.key === 'Tab') { // keep focus inside the panel
    const f = [...menu.querySelectorAll('.menu__panel a, .menu__panel button')];
    if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
    else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
  }
});
if (location.hash === '#menu') { history.replaceState(null, '', location.pathname + location.search); setMenu(true, null); }

// ---------- home: the top bar lies on the art, then turns solid ----------
const homeBar = document.querySelector('.top--home');
if (homeBar) {
  const hero = document.querySelector('.hero');
  const upd = () => homeBar.classList.toggle('is-solid', window.scrollY > hero.offsetHeight - 60);
  window.addEventListener('scroll', upd, { passive: true }); upd();
}

// ---------- search ----------
let index = null, loading = null;
function loadIndex() {
  if (!loading) loading = fetch(`/data/search.${LANG}.json`).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then((rows) => { index = rows.map((r) => ({ id: r[0], c: r[1], n: r[2], rank: r[3], ru: r[4], en: r[5], kind: r[6], art: r[7], key: norm(r[4]) + ' ' + norm(r[5]) })); return index; });
  return loading;
}
const BACK = (document.getElementById('tpl-back') || { innerHTML: '' }).innerHTML; // Lucide icon rendered by the page
let box = null;
function buildSearch() {
  box = document.createElement('div');
  box.className = 'search'; box.id = 'search';
  box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-label', T('search.title'));
  box.innerHTML = `<div class="search__bar"><button class="top__back" type="button" data-close aria-label="${esc(T('search.close'))}">${BACK}</button>` +
    `<label class="sr" for="q">${esc(T('search.label'))}</label><input id="q" type="search" autocomplete="off" enterkeyhint="search" placeholder="${esc(T('search.placeholder'))}"></div>` +
    '<div class="search__hint" id="q-hint" aria-live="polite"></div><ul class="search__list" id="q-list"></ul>';
  document.body.appendChild(box);
  const input = box.querySelector('#q');
  input.addEventListener('input', render);
  box.querySelector('[data-close]').addEventListener('click', closeSearch);
  box.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSearch(); });
}
let from = null;
function openSearch(t, q) {
  if (!box) buildSearch();
  from = t;
  box.classList.add('is-open'); root.style.overflow = 'hidden';
  const input = box.querySelector('#q');
  if (q != null) input.value = q;
  input.focus();
  render();
  loadIndex().then(render, () => { box.querySelector('#q-hint').textContent = T('search.error'); });
}
function closeSearch() { box.classList.remove('is-open'); root.style.overflow = ''; if (from) from.focus(); }
function render() {
  const input = box.querySelector('#q'), hint = box.querySelector('#q-hint'), out = box.querySelector('#q-list');
  const q = norm(input.value);
  if (!index) { hint.textContent = T('search.loading'); out.innerHTML = ''; return; }
  if (!q) { hint.textContent = T('search.hint'); out.innerHTML = ''; return; }
  const res = index.filter((v) => v.key.includes(q))
    .sort((a, b) => (b.key.startsWith(q) - a.key.startsWith(q)) || (b.art - a.art) || a.rank - b.rank);
  if (!res.length) {
    hint.innerHTML = `<b>${esc(T('search.empty'))}</b>${esc(T('search.emptyText', { q: input.value.trim() }))}`;
    out.innerHTML = ''; return;
  }
  const max = 60;
  hint.textContent = T('search.found', { n: res.length }) + (res.length > max ? ' · ' + T('search.more', { n: max }) : '');
  out.innerHTML = res.slice(0, max).map((v) => {
    const name = LANG === 'ru' ? v.ru : v.en;
    return `<li><a href="${PFX}/${v.c}/${v.n}/${v.id}/"><span class="tile"><img src="/img/tiles/${v.c}/${v.n}/${v.id}.webp" alt="" width="344" height="134" loading="lazy"></span>` +
      `<span><span class="recent__name">${esc(name)}</span><span class="recent__meta"><b>${roman(v.rank)}</b> · ${esc(T('nation.' + v.n))} · ${esc(T('campaign.' + v.c + '.short'))}<br>` +
      (v.art ? `<span class="rv">${esc(T('mark.review'))}</span>` : `<span class="wipm">${esc(T('search.wip'))}</span>`) + '</span></span></a></li>';
  }).join('');
}
document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-search]');
  if (!t) return;
  e.preventDefault();
  openSearch(t);
});
// Tap to copy: any button with data-copy (clan id). The clipboard API needs https, so plain http pages fall back
// to a hidden field and execCommand.
document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-copy]');
  if (!b) return;
  const text = b.dataset.copy;
  let ok = false;
  try { await navigator.clipboard.writeText(text); ok = true; } catch {
    const ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;font-size:16px';
    document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, text.length);
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    ta.remove(); b.focus();
  }
  if (!ok) return;
  const note = b.querySelector('.copy__note');
  if (note) note.textContent = b.dataset.copied || '';
  b.classList.add('is-copied');
  clearTimeout(b._copyT);
  b._copyT = setTimeout(() => { b.classList.remove('is-copied'); if (note) note.textContent = ''; }, 1800);
});
const preQ = new URLSearchParams(location.search).get('q');
if (preQ !== null) openSearch(null, preQ);
