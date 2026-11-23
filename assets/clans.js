// «Реклама кланов»: photo gallery (no library) and an optional live list from clansEndpoint.
import { esc, plural } from './site.js';
import { visibleClans, clanCard } from './clans-render.js';

const D = JSON.parse(document.getElementById('page-data').textContent);
let clans = D.clans;
const S = { ...D.S, esc, articles: (n) => plural(D.S.articlesForms, n) };
const box = document.getElementById('clans-list');

if (D.endpoint) {
  fetch(D.endpoint, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : Promise.reject(r.status))).then((j) => {
    const list = Array.isArray(j) ? j : j.clans;
    if (!Array.isArray(list) || !list.length) return;
    clans = list;
    box.innerHTML = visibleClans(list, D.min).map((c) => clanCard(c, S, D.I)).join('');
  }).catch(() => { /* keep the built-in list */ });
}

const dlg = document.getElementById('gallery');
const img = document.getElementById('gallery-img');
const posEl = document.getElementById('gallery-pos');
let photos = [], i = 0, from = null;
function show() {
  img.src = photos[i];
  posEl.textContent = photos.length > 1 ? `${i + 1} / ${photos.length}` : '';
  dlg.querySelectorAll('[data-g="prev"],[data-g="next"]').forEach((b) => { b.hidden = photos.length < 2; });
}
box.addEventListener('click', (e) => {
  const a = e.target.closest('[data-gallery]');
  if (!a || !dlg.showModal) return;
  e.preventDefault();
  const c = clans.find((x) => String(x.id) === a.dataset.gallery);
  photos = (c && c.photos) || [a.getAttribute('href')];
  i = +a.dataset.i || 0; from = a;
  show(); dlg.showModal();
});
dlg.addEventListener('click', (e) => {
  const b = e.target.closest('[data-g]');
  if (!b) { if (e.target === dlg) dlg.close(); return; }
  if (b.dataset.g === 'close') dlg.close();
  if (b.dataset.g === 'next') { i = (i + 1) % photos.length; show(); }
  if (b.dataset.g === 'prev') { i = (i - 1 + photos.length) % photos.length; show(); }
});
dlg.addEventListener('close', () => { if (from) from.focus(); });
dlg.addEventListener('keydown', (e) => {
  if (photos.length < 2) return;
  if (e.key === 'ArrowRight') { i = (i + 1) % photos.length; show(); }
  if (e.key === 'ArrowLeft') { i = (i - 1 + photos.length) % photos.length; show(); }
});
