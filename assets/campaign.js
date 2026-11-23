// Campaign page: «Дерево / Список» switch and the client-side filter over the campaign's vehicles.
import { T, LANG, PFX, plural, roman, esc, norm } from './site.js';

const D = JSON.parse(document.getElementById('page-data').textContent);
const items = D.items.map((r) => ({ id: r[0], n: r[1], rank: r[2], kind: r[3], ru: r[4], en: r[5], art: r[6], key: norm(r[4]) + ' ' + norm(r[5]) }));
const form = document.getElementById('filters');
const fName = document.getElementById('f-name'), fNation = document.getElementById('f-nation');
const fRank = document.getElementById('f-rank'), fKind = document.getElementById('f-kind');
const fRev = document.getElementById('f-reviews');
const nations = document.getElementById('nations'), list = document.getElementById('vlist');
const heading = document.getElementById('h-view');
const viewBtns = [...document.querySelectorAll('[data-view]')];
const headings = { tree: heading.textContent, list: T('camp.vehicles') };
let view = 'tree';

function setView(v, push) {
  view = v;
  viewBtns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === v)));
  nations.hidden = v !== 'tree';
  list.hidden = v !== 'list';
  heading.textContent = headings[v];
  if (v === 'list') render();
  if (push) syncUrl();
}
function filtered() {
  const q = norm(fName.value);
  return items.filter((v) => (!q || v.key.includes(q)) && (!fNation.value || v.n === fNation.value) &&
    (!fRank.value || v.rank === +fRank.value) && (!fKind.value || v.kind === fKind.value) &&
    (!fRev || fRev.getAttribute('aria-pressed') !== 'true' || v.art));
}
function render() {
  const res = filtered();
  if (!res.length) {
    list.innerHTML = `<div class="empty"><h3>${esc(T('camp.nothing'))}</h3><p>${esc(T('camp.nothingText'))}</p><button class="btn" type="button" data-reset>${esc(T('camp.reset'))}</button></div>`;
    return;
  }
  const ranks = [...new Set(res.map((v) => v.rank))].sort((a, b) => a - b);
  list.innerHTML = `<p class="vlist__count">${esc(T('camp.found', { n: res.length }))}</p>` + ranks.map((r) => {
    const rv = res.filter((v) => v.rank === r);
    return `<section class="vgroup"><h3><b>${roman(r)}</b>${esc(T('tree.rankCount', { n: rv.length, unit: plural(T('n.vehicle'), rv.length) }))}</h3><div class="vgrid">` +
      rv.map((v) => {
        const name = LANG === 'ru' ? v.ru : v.en;
        const label = [name, T('rank.of', { r: roman(v.rank) }), T('nation.' + v.n), v.kind ? T('kind.' + v.kind) : ''].filter(Boolean).join(', ');
        return `<div class="vcell"><a class="tile" href="${PFX}/${D.campaign}/${v.n}/${v.id}/" aria-label="${esc(label)}"><img src="/img/tiles/${D.campaign}/${v.n}/${v.id}.webp" alt="" width="344" height="134" loading="lazy" decoding="async">` +
          (v.art ? `<span class="rev"><span>${esc(T('mark.review'))}</span></span>` : '') + `</a><span class="vcell__cap">${esc(name)} · ${esc(T('nation.' + v.n))}</span></div>`;
      }).join('') + '</div></section>';
  }).join('');
}
function syncUrl() {
  const u = new URL(location.href);
  const set = (k, v) => (v ? u.searchParams.set(k, v) : u.searchParams.delete(k));
  set('view', view === 'list' ? 'list' : '');
  set('name', fName.value.trim()); set('nation', fNation.value); set('rank', fRank.value); set('kind', fKind.value);
  set('reviews', fRev && fRev.getAttribute('aria-pressed') === 'true' ? '1' : '');
  history.replaceState(null, '', u);
}
function onFilter() { if (view !== 'list') setView('list'); else render(); syncUrl(); }

viewBtns.forEach((b) => b.addEventListener('click', () => setView(b.dataset.view, true)));
form.addEventListener('submit', (e) => e.preventDefault());
fName.addEventListener('input', onFilter);
[fNation, fRank, fKind].forEach((s) => s.addEventListener('change', onFilter));
if (fRev) fRev.addEventListener('click', () => { fRev.setAttribute('aria-pressed', String(fRev.getAttribute('aria-pressed') !== 'true')); onFilter(); });
list.addEventListener('click', (e) => {
  if (!e.target.closest('[data-reset]')) return;
  form.reset(); if (fRev) fRev.setAttribute('aria-pressed', 'false'); render(); syncUrl(); fName.focus();
});
document.querySelectorAll('[data-reviews]').forEach((a) => a.addEventListener('click', (e) => {
  if (!fRev) return;
  e.preventDefault(); fRev.setAttribute('aria-pressed', 'true'); onFilter(); form.scrollIntoView({ block: 'start' });
}));

// restore state from the address (also used by the «Все обзоры» link on the home page)
const P = new URLSearchParams(location.search);
fName.value = P.get('name') || '';
for (const [el, k] of [[fNation, 'nation'], [fRank, 'rank'], [fKind, 'kind']]) if (P.get(k) && [...el.options].some((o) => o.value === P.get(k))) el.value = P.get(k);
if (fRev && P.get('reviews') === '1') fRev.setAttribute('aria-pressed', 'true');
const anyFilter = fName.value || fNation.value || fRank.value || fKind.value || (fRev && P.get('reviews') === '1');
if (P.get('view') === 'list' || anyFilter) setView('list');
