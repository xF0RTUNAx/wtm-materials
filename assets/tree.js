// Tree page: re-lays the tree for the real screen width, «Вся ветка» fit mode, jumps between the
// research part and the vehicles outside the lines, rank pin, scroll aids.
import { roman } from './site.js';
import { layoutTree } from './tree-layout.js';

const dataEl = document.getElementById('page-data');
const pin = document.getElementById('rankpin');
const tools = document.querySelector('.tools');

if (dataEl) {
  const T = JSON.parse(dataEl.textContent);
  const host = document.getElementById('tree');
  const scroll = document.getElementById('tree-scroll');
  const wrap = document.getElementById('tree-wrap');
  const hint = document.getElementById('tree-hint');
  const tiles = {};
  host.querySelectorAll('.tile[data-id]').forEach((a) => { tiles[a.dataset.id] = a; });
  const rankEls = [...host.querySelectorAll('.tree__rank')];
  const sep = document.getElementById('tree-sep');
  const headSide = document.getElementById('th-side');
  const svg = host.querySelector('.tree__svg');
  const fitBtn = document.querySelector('[data-fit]');
  const jumps = [...document.querySelectorAll('[data-jump]')];
  let fit = new URLSearchParams(location.search).get('fit') === '1';
  let L = null, lastW = 0;

  const availW = () => {
    const cs = getComputedStyle(scroll);
    return scroll.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  };
  function draw() {
    L = layoutTree(T, { fit, avail: availW() });
    host.classList.toggle('is-fit', fit);
    host.style.width = L.width + 'px';
    host.style.height = L.height + 'px';
    for (const id in tiles) {
      const p = L.pos[id], a = tiles[id];
      a.style.left = p.x + 'px'; a.style.top = p.y + 'px'; a.style.width = L.W + 'px';
    }
    L.ranks.forEach((r, i) => { const el = rankEls[i]; el.style.top = r.y + 'px'; el.style.height = r.h + 'px'; el.style.width = L.width + 'px'; });
    if (sep && L.side) { sep.style.left = L.side.sep + 'px'; sep.style.height = L.height + 'px'; headSide.style.left = L.side.x0 + 'px'; }
    svg.setAttribute('width', L.width); svg.setAttribute('height', L.height);
    svg.innerHTML = L.paths.map((d) => `<path class="h" d="${d}"/><path d="${d}"/>`).join('');
    scroll.style.overflowX = fit ? 'hidden' : 'auto';
    if (fitBtn) fitBtn.setAttribute('aria-pressed', String(fit));
    jumps.forEach((b) => { b.disabled = fit; });
    edges();
    updPin();
  }
  // Open on the research part with no tile cut at the left edge.
  function startLeft() {
    const first = T.vehicles.filter((v) => v.kind === 'tree');
    const r0 = Math.min(...first.map((v) => v.rank));
    const p = first.filter((v) => v.rank === r0).map((v) => L.pos[v.id]).sort((a, b) => a.x - b.x)[0];
    if (!p || p.x + L.W <= scroll.clientWidth) return 0;
    return Math.max(0, p.x - L.G / 2);
  }
  function edges() {
    host.style.setProperty('--sx', scroll.scrollLeft + 'px');
    if (L && L.side) host.style.setProperty('--sepx', Math.max(0, L.side.sep - 110) + 'px');
    wrap.classList.toggle('more', scroll.scrollWidth - scroll.clientWidth - scroll.scrollLeft > 4);
    hint.hidden = fit || scroll.scrollWidth <= scroll.clientWidth + 4;
    if (L && L.side) {
      const inSide = scroll.scrollLeft + scroll.clientWidth / 2 > L.side.sep;
      jumps.forEach((b) => b.setAttribute('aria-pressed', String((b.dataset.jump === 'side') === inSide)));
    }
  }
  function updPin() {
    const line = tools.getBoundingClientRect().bottom + 10;
    const top = host.getBoundingClientRect().top;
    let cur = L.ranks[0].rank;
    for (const r of L.ranks) if (top + r.y <= line) cur = r.rank;
    pin.textContent = roman(cur);
  }
  if (fitBtn) fitBtn.addEventListener('click', () => {
    fit = !fit;
    const u = new URL(location.href);
    if (fit) u.searchParams.set('fit', '1'); else u.searchParams.delete('fit');
    history.replaceState(null, '', u);
    draw();
    if (!fit) scroll.scrollLeft = startLeft();
  });
  jumps.forEach((b) => b.addEventListener('click', () => {
    const left = b.dataset.jump === 'side' ? L.side.sep - 2 : startLeft();
    scroll.scrollTo({ left, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }));
  scroll.addEventListener('scroll', edges, { passive: true });
  window.addEventListener('scroll', updPin, { passive: true });
  let rt;
  window.addEventListener('resize', () => {
    clearTimeout(rt);
    rt = setTimeout(() => { if (scroll.clientWidth !== lastW) { lastW = scroll.clientWidth; draw(); } }, 120);
  });
  lastW = scroll.clientWidth;
  draw();
  if (!fit) { scroll.scrollLeft = startLeft(); edges(); }
} else {
  // plain rank grid (tabs without research lines)
  const groups = [...document.querySelectorAll('.tg')];
  const upd = () => {
    const line = tools.getBoundingClientRect().bottom + 10;
    let cur = groups[0] && groups[0].dataset.rank;
    for (const g of groups) if (g.getBoundingClientRect().top <= line) cur = g.dataset.rank;
    if (cur) pin.textContent = roman(+cur);
  };
  window.addEventListener('scroll', upd, { passive: true }); upd();
}
