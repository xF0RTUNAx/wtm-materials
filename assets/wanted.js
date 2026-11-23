// «Нужны статьи»: vehicles without an article, minus the ones another author has already taken in the bot.
import { LANG, PFX, plural, roman, esc, norm } from './site.js';

const D = JSON.parse(document.getElementById('page-data').textContent);
const S = D.S;
const T = (k, vars) => String(S[k]).replace(/\{(\w+)\}/g, (_, n) => (vars && n in vars ? vars[n] : ''));
const items = D.items.map((r) => ({ id: r[0], c: r[1], n: r[2], rank: r[3], kind: r[4], ru: r[5], en: r[6], key: r[7] || `${r[1]}/${r[2]}/${r[0]}`, q: norm(r[5]) + ' ' + norm(r[6]) }));
const form = document.getElementById('filters');
const fName = document.getElementById('f-name'), fNation = document.getElementById('f-nation'), fRank = document.getElementById('f-rank');
const campBtns = [...form.querySelectorAll('[data-camp]')];
const list = document.getElementById('vlist');
const nationOpts = [...fNation.options].slice(1).map((o) => o.cloneNode(true));
let camp = '';
let taken = new Set();

function setCamp(c) {
  camp = c;
  campBtns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.camp === c)));
  // only the nations of the chosen campaign stay in the list
  const keep = fNation.value;
  const allowed = new Set(S['nation:' + c] || []);
  while (fNation.options.length > 1) fNation.remove(1);
  for (const o of nationOpts) if (allowed.has(o.value)) fNation.add(o.cloneNode(true));
  fNation.value = allowed.has(keep) ? keep : '';
}
function filtered() {
  const q = norm(fName.value);
  return items.filter((v) => v.c === camp && !taken.has(v.key) && (!q || v.q.includes(q)) && (!fNation.value || v.n === fNation.value) && (!fRank.value || v.rank === +fRank.value));
}
function render() {
  const res = filtered();
  const head = `<p class="vlist__count">${esc(T('wanted.count', { n: res.length, unit: plural(S['n.vehicle'], res.length) }))}</p>`;
  if (!res.length) {
    list.innerHTML = head + `<div class="empty"><h3>${esc(T('camp.nothing'))}</h3><p>${esc(T('camp.nothingText'))}</p><button class="btn" type="button" data-reset>${esc(T('camp.reset'))}</button></div>`;
    return;
  }
  const ranks = [...new Set(res.map((v) => v.rank))].sort((a, b) => b - a);
  list.innerHTML = head + ranks.map((r) => {
    const rv = res.filter((v) => v.rank === r);
    return `<section class="vgroup"><h3><b>${roman(r)}</b>${esc(T('tree.rankCount', { n: rv.length, unit: plural(S['n.vehicle'], rv.length) }))}</h3><div class="vgrid">` +
      rv.map((v) => {
        const name = LANG === 'ru' ? v.ru : v.en;
        const nation = S['nation.' + v.n];
        const label = [name, T('rank.of', { r: roman(v.rank) }), nation, v.kind ? S['kind.' + v.kind] : ''].filter(Boolean).join(', ');
        return `<div class="vcell"><a class="tile" href="${PFX}/${v.c}/${v.n}/${v.id}/" aria-label="${esc(label)}"><img src="/img/tiles/${v.c}/${v.n}/${v.id}.webp" alt="" width="344" height="134" loading="lazy" decoding="async"></a><span class="vcell__cap">${esc(name)} · ${esc(nation)}</span></div>`;
      }).join('') + '</div></section>';
  }).join('');
}
function syncUrl() {
  const u = new URL(location.href);
  const set = (k, v) => (v ? u.searchParams.set(k, v) : u.searchParams.delete(k));
  set('campaign', camp); set('name', fName.value.trim()); set('nation', fNation.value); set('rank', fRank.value);
  history.replaceState(null, '', u);
}
const update = () => { render(); syncUrl(); };

campBtns.forEach((b) => b.addEventListener('click', () => { setCamp(b.dataset.camp); update(); }));
form.addEventListener('submit', (e) => e.preventDefault());
fName.addEventListener('input', update);
[fNation, fRank].forEach((s) => s.addEventListener('change', update));
list.addEventListener('click', (e) => {
  if (!e.target.closest('[data-reset]')) return;
  fName.value = ''; fNation.value = ''; fRank.value = ''; update(); fName.focus();
});

// state from the address; tanks first, because the published reviews so far are about tanks
const P = new URLSearchParams(location.search);
const first = D.camps;
setCamp(first.includes(P.get('campaign')) ? P.get('campaign') : first.includes('tanks') ? 'tanks' : first[0]);
fName.value = P.get('name') || '';
if (P.get('nation') && [...fNation.options].some((o) => o.value === P.get('nation'))) fNation.value = P.get('nation');
if (P.get('rank') && [...fRank.options].some((o) => o.value === P.get('rank'))) fRank.value = P.get('rank');
render();

if (D.claims) {
  fetch(D.claims).then((r) => (r.ok ? r.json() : Promise.reject(r.status))).then((j) => {
    if (!j || !Array.isArray(j.keys)) return;
    taken = new Set(j.keys.filter((k) => typeof k === 'string'));
    render();
  }).catch(() => { /* the full list stays */ });
}
