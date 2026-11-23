// Trophy opening simulator (port of the old trophy-sim.html, same mechanics).
// The top part is pure logic with no DOM access, so the build and the Deno test import it;
// the interface below runs only in the browser on the /trophy/ page.
'use strict';

// ---------------------------------------------------------------- data
// Items that can drop at most once per ×10 batch.
export const UNIQUE_IDS = ['title', 'camo', 'avatar', 'tank', 'prem_tank', 'jackpot', 'decorator'];
// Old code also excluded these from the white highlight (they are never unique, kept for parity).
const NO_HIGHLIGHT = ['booster', 'silver'];

const CDN = 'https://cdn.jsdelivr.net/gh/xF0RTUNAx/wtm-materials@pics/';
const mid = (f) => CDN + 'midtrophy/' + f;
const bigp = (f) => CDN + 'bigtrophy/' + f;

// Names come from the i18n files (key trophy.item.<id>); the order of items is the order of the inputs.
export const TROPHIES = {
  medium: {
    id: 'medium',
    items: [
      { id: 'booster', img: mid('10.PNG') },
      { id: 'gold', img: mid('11.PNG') },
      { id: 'bonds', img: mid('12.PNG') },
      { id: 'silver', img: mid('13.PNG') },
      { id: 'keys', img: mid('14.PNG') },
      { id: 'camo', img: mid('15.PNG') },
      { id: 'tank', img: mid('16.PNG') },
      { id: 'title', img: bigp('1.PNG') },
      { id: 'avatar', img: bigp('2.PNG') },
      { id: 'blueprint', img: bigp('5.PNG') },
      { id: 'jackpot', img: bigp('mainitem.PNG') },
      { id: 'decorator', img: bigp('decor.PNG') },
    ],
  },
  big: {
    id: 'big',
    items: [
      { id: 'avatar', img: bigp('2.PNG') },
      { id: 'title', img: bigp('1.PNG') },
      { id: 'keys', img: bigp('3.PNG') },
      { id: 'blueprint', img: bigp('5.PNG') },
      { id: 'prem_tank', img: bigp('6.PNG') },
      { id: 'gold', img: bigp('4.PNG') },
      { id: 'jackpot', img: bigp('mainitem.PNG') },
      { id: 'decorator', img: bigp('decor.PNG') },
    ],
  },
};

export const isUnique = (id) => UNIQUE_IDS.includes(id);
export const isHighlighted = (id) => isUnique(id) && !NO_HIGHLIGHT.includes(id);

// ---------------------------------------------------------------- pure logic
// Text of an input -> number (empty or garbage counts as 0, like the old parseFloat(x) || 0).
export const parseChance = (v) => parseFloat(v) || 0;

// Sum of the entered chances; a total from 96 to 104 % is accepted without a question.
export function checkTotal(values) {
  let total = 0;
  for (const v of values) total += parseChance(v);
  return { total, ok: total >= 96 && total <= 104, diff: 100 - total };
}

// One draw by cumulative ranges. `values` is parallel to `items`; ids in `excluded` that are unique count as 0.
// Returns the winning item or null when nothing can drop. `rand` returns [0, 1).
export function determineWinner(items, values, excluded = new Set(), rand = Math.random) {
  let currentTotal = 0;
  const ranges = [];
  items.forEach((item, index) => {
    let val = parseChance(values[index]);
    if (isUnique(item.id) && excluded.has(item.id)) val = 0;
    if (val > 0) {
      ranges.push({ item, min: currentTotal, max: currentTotal + val });
      currentTotal += val;
    }
  });
  if (currentTotal === 0 && ranges.length > 0) return null;
  const r = rand() * currentTotal;
  const winner = ranges.find((x) => r >= x.min && r < x.max);
  return winner ? winner.item : (ranges.length > 0 ? ranges[ranges.length - 1].item : null);
}

// A batch of draws (×10): every unique id drops at most once. A draw that finds nothing left is skipped,
// so the batch can be shorter than `count` when only unique items have a chance.
export function drawBatch(items, values, count, rand = Math.random) {
  const winners = [];
  const taken = new Set();
  for (let i = 0; i < count; i++) {
    const win = determineWinner(items, values, taken, rand);
    if (win) {
      winners.push(win);
      if (isUnique(win.id)) taken.add(win.id);
    }
  }
  return winners;
}

// localStorage format "wtm-sim-<mode>": JSON object { itemId: "text of the input" }.
export const storageKey = (mode) => 'wtm-sim-' + mode;
export const serializeChances = (ids, texts) => JSON.stringify(Object.fromEntries(ids.map((id, i) => [id, texts[i]])));
// Returns one text per id; an id missing in the saved data (or an empty saved value) stays empty.
export function restoreChances(ids, json) {
  let data = null;
  try { data = json ? JSON.parse(json) : null; } catch { data = null; }
  return ids.map((id) => (data && data[id] ? String(data[id]) : ''));
}

// Safe arithmetic for the calculator: numbers (decimal point or comma), + - * / , a postfix %
// (percent = divide by 100), unary + and -, parentheses. Throws on anything else.
export function calcEval(src) {
  const s = String(src).trim().replace(/×/g, '*').replace(/÷/g, '/').replace(/[−–—]/g, '-');
  if (!s || s.length > 500) throw new Error('empty or too long');
  let i = 0;
  const fail = () => { throw new Error('syntax'); };
  function expr() {
    let v = term();
    while (s[i] === '+' || s[i] === '-') { const op = s[i++]; const r = term(); v = op === '+' ? v + r : v - r; }
    return v;
  }
  function term() {
    let v = unary();
    while (s[i] === '*' || s[i] === '/') { const op = s[i++]; const r = unary(); v = op === '*' ? v * r : v / r; }
    return v;
  }
  function unary() {
    if (s[i] === '-') { i++; return -unary(); }
    if (s[i] === '+') { i++; return unary(); }
    return postfix();
  }
  function postfix() {
    let v = primary();
    while (s[i] === '%') { i++; v /= 100; }
    return v;
  }
  function primary() {
    if (s[i] === '(') {
      i++;
      const v = expr();
      if (s[i] !== ')') fail();
      i++;
      return v;
    }
    const m = /^(\d+[.,]?\d*|[.,]\d+)/.exec(s.slice(i));
    if (!m) fail();
    i += m[0].length;
    return parseFloat(m[0].replace(',', '.'));
  }
  const v = expr();
  if (i !== s.length || !Number.isFinite(v)) fail();
  return v;
}
// What the calculator shows after "=": rounded to 4 decimals, no trailing zeros (as the old page did).
export const calcFormat = (v) => String(parseFloat(v.toFixed(4)));

// ---- scale to 100 %
// Proportional scaling of the entered values to a total of exactly 100.00 (two decimals);
// the rounding remainder goes to the largest value. Entries that are empty, zero or negative stay empty.
// Returns one text per input, or null when there is nothing to scale.
export function normalizeTo100(texts) {
  const vals = texts.map((v) => Math.max(parseChance(v), 0));
  const total = vals.reduce((a, b) => a + b, 0);
  if (!(total > 0)) return null;
  const cents = vals.map((v) => Math.round((v / total) * 10000)); // hundredths of a percent
  const rest = 10000 - cents.reduce((a, b) => a + b, 0);
  if (rest !== 0) {
    let k = 0;
    vals.forEach((v, i) => { if (v > vals[k]) k = i; });
    cents[k] += rest;
  }
  return cents.map((c) => (c > 0 ? (c / 100).toFixed(2) : ''));
}

// ---- share link: "#m=<mode>&c=<v1>,<v2>,..." (one value per item, empty = no chance)
export function encodeShare(mode, texts) {
  const c = texts.map((v) => { const n = parseChance(v); return n > 0 ? String(+n.toFixed(2)) : ''; }).join(',');
  return `m=${mode}&c=${c}`;
}
// Returns { mode, values } or null for anything that is not exactly what encodeShare makes.
export function decodeShare(hash) {
  const h = String(hash || '').replace(/^#/, '');
  if (!h || h.length > 600) return null;
  let m = null, c = null;
  for (const part of h.split('&')) {
    const eq = part.indexOf('=');
    if (eq < 0) return null;
    const k = part.slice(0, eq), v = part.slice(eq + 1);
    if (k === 'm' && m === null) m = v;
    else if (k === 'c' && c === null) c = v;
    else return null;
  }
  if (m === null || c === null || !Object.hasOwn(TROPHIES, m)) return null;
  const parts = c.split(',');
  if (parts.length !== TROPHIES[m].items.length) return null;
  const values = [];
  for (const p of parts) {
    if (p === '') { values.push(''); continue; }
    if (!/^\d{1,3}(\.\d{1,2})?$/.test(p)) return null;
    const n = parseFloat(p);
    if (!(n >= 0 && n <= 100)) return null;
    values.push(String(n));
  }
  return { mode: m, values };
}

// ---- fast series: every opening is one draw, made in batches of ten with the same uniqueness rule
export function fastSeries(items, values, openings, rand = Math.random) {
  const winners = [];
  const counts = {};
  for (let done = 0; done < openings; done += 10) {
    for (const w of drawBatch(items, values, Math.min(10, openings - done), rand)) {
      winners.push(w);
      counts[w.id] = (counts[w.id] || 0) + 1;
    }
  }
  return { winners, counts, draws: winners.length };
}

// ---- statistics per trophy, key "wtm-sim-stats-<mode>": { openings, since, counts: { id: n } }
// "openings" counts draws (a x10 opening adds ten); "since" is the draws since the last jackpot.
export const statsKey = (mode) => 'wtm-sim-stats-' + mode;
export const emptyStats = () => ({ openings: 0, since: 0, counts: {} });
export function addToStats(stats, winners) {
  const s = { openings: stats.openings, since: stats.since, counts: { ...stats.counts } };
  for (const w of winners) {
    s.openings++;
    s.counts[w.id] = (s.counts[w.id] || 0) + 1;
    s.since = w.id === 'jackpot' ? 0 : s.since + 1;
  }
  return s;
}
export function parseStats(json, ids) {
  const out = emptyStats();
  let d = null;
  try { d = json ? JSON.parse(json) : null; } catch { d = null; }
  const int = (x) => Number.isInteger(x) && x >= 0 && x < 1e9;
  if (!d || typeof d !== 'object' || !int(d.openings) || !int(d.since) || !d.counts || typeof d.counts !== 'object') return out;
  let sum = 0;
  for (const id of ids) {
    const n = d.counts[id];
    if (n === undefined) continue;
    if (!int(n)) return emptyStats();
    out.counts[id] = n; sum += n;
  }
  if (sum > d.openings) return emptyStats();
  out.openings = d.openings; out.since = Math.min(d.since, d.openings);
  return out;
}
export function statRows(items, stats, values) {
  return items.map((it, i) => ({
    id: it.id, count: stats.counts[it.id] || 0,
    share: stats.openings ? ((stats.counts[it.id] || 0) / stats.openings) * 100 : 0,
    chance: Math.max(parseChance(values[i]), 0),
  }));
}
// Price of one opening: a plain number (any unit), empty when not entered.
export const priceKey = 'wtm-sim-price';
export function parsePrice(text) {
  const n = parseFloat(text);
  return Number.isFinite(n) && n >= 0 ? n : null;
}
export const spentText = (openings, price) => String(+(openings * price).toFixed(2));

const fmt = (str, vars) => str.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));

// ---------------------------------------------------------------- interface (browser only)
function initUi() {
  const root = document.getElementById('trophy');
  if (!root) return;
  const data = JSON.parse(document.getElementById('page-data').textContent);
  const L = data.S;
  const names = data.names;
  const $ = (id) => document.getElementById(id);
  const el = {
    choose: $('tr-choose'), settings: $('tr-settings'), spin: $('tr-spin'), result: $('tr-result'),
    modeTitle: $('tr-mode-title'), items: $('tr-items'), total: $('tr-total'), totalText: $('tr-total-text'),
    state: $('tr-state'), diff: $('tr-diff'), msg: $('tr-msg'),
    status: $('tr-h-spin'), track: $('tr-track'), strip: $('tr-strip'),
    liveWrap: $('tr-live-wrap'), live: $('tr-live'), skip: $('tr-skip'),
    resultHead: $('tr-h-result'), single: $('tr-single'), singleImg: $('tr-single-img'), singleName: $('tr-single-name'),
    multi: $('tr-multi'), series: $('tr-series'), seriesBody: $('tr-series-body'),
    again: $('tr-again'), announce: $('tr-announce'),
    calc: $('tr-calc'), calcScreen: $('tr-calc-screen'), calcBtn: $('tr-calc-open'),
    shareField: $('tr-share-field'), noAnim: $('tr-noanim'),
    stats: $('tr-stats'), statsTitle: $('tr-stats-title'), statsInfo: $('tr-stats-info'), statsBody: $('tr-stats-body'),
    statsTable: $('tr-stats-table'), statsEmpty: $('tr-stats-empty'), price: $('tr-price'),
    spinVol: $('tr-vol-spin'), winVol: $('tr-vol-win'), spinOut: $('tr-vol-spin-out'), winOut: $('tr-vol-win-out'),
  };
  const reduced = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* storage blocked */ } },
    del(k) { try { localStorage.removeItem(k); } catch { /* storage blocked */ } },
  };

  // ---- state (all of it here; the old page used implicit globals)
  const st = {
    mode: null, run: 0, grid: 0, skipping: false, singleWinner: null, lastCount: 1,
    spinTimer: null, spinResolve: null, curSpin: null, useFirst: true, unlocked: false,
    stats: emptyStats(), noAnim: store.get('wtm-sim-noanim') === '1', statsOpened: false,
  };
  // result at once: the switch, or the system setting
  const instant = () => st.noAnim || reduced();

  // ---- sound
  let spinVolume = parseFloat(store.get('wtm_spin_vol'));
  if (isNaN(spinVolume)) spinVolume = 0.4;
  let winVolume = parseFloat(store.get('wtm_win_vol'));
  if (isNaN(winVolume)) winVolume = 0.15;
  const base = root.dataset.audio;
  const winSound = new Audio(base + 'win_sound.mp3');
  winSound.volume = winVolume;
  winSound.preload = 'auto';
  const spinA = new Audio(base + 'spin_sound.mp3');
  spinA.preload = 'auto';
  const spinB = new Audio(base + 'spin_sound.mp3');
  spinB.preload = 'auto';

  // iOS only plays sound after a touch: play every sound once, muted, on the first touch or click.
  function unlockAudio() {
    if (st.unlocked) return;
    const unlock = (audio) => {
      audio.muted = true;
      const p = audio.play();
      if (p !== undefined) p.then(() => { audio.pause(); audio.currentTime = 0; audio.muted = false; }).catch(() => {});
    };
    unlock(winSound); unlock(spinA); unlock(spinB);
    st.unlocked = true;
  }
  ['touchstart', 'click'].forEach((evt) => document.addEventListener(evt, unlockAudio, { once: true }));

  function fadeAudio(audio, ms = 400) {
    if (!audio) return;
    let vol = audio.volume;
    const steps = Math.floor(ms / 40) || 1;
    const stepAmount = vol / steps;
    const timer = setInterval(() => {
      vol -= stepAmount;
      if (vol <= 0.05) { audio.pause(); audio.currentTime = 0; clearInterval(timer); } else audio.volume = vol;
    }, 40);
  }
  function playSpinSound() {
    const next = st.useFirst ? spinA : spinB;
    const old = st.useFirst ? spinB : spinA;
    st.useFirst = !st.useFirst;
    if (!old.paused) fadeAudio(old, 300);
    next.playbackRate = 1.0;
    next.volume = spinVolume;
    next.currentTime = 0;
    const p = next.play();
    if (p !== undefined) p.catch(() => {});
    st.curSpin = next;
  }
  function playWin() {
    winSound.volume = winVolume;
    winSound.currentTime = 0;
    const p = winSound.play();
    if (p !== undefined) p.catch(() => {});
  }

  // volume sliders
  const pct = (v) => Math.round(v * 100) + '%';
  el.spinVol.value = spinVolume; el.winVol.value = winVolume;
  el.spinOut.textContent = pct(spinVolume); el.winOut.textContent = pct(winVolume);
  el.spinVol.addEventListener('input', (e) => {
    spinVolume = parseFloat(e.target.value);
    store.set('wtm_spin_vol', spinVolume);
    el.spinOut.textContent = pct(spinVolume);
    if (st.curSpin) st.curSpin.volume = spinVolume;
  });
  el.winVol.addEventListener('input', (e) => {
    winVolume = parseFloat(e.target.value);
    winSound.volume = winVolume;
    store.set('wtm_win_vol', winVolume);
    el.winOut.textContent = pct(winVolume);
  });

  // ---- screens
  const screens = { choose: el.choose, settings: el.settings, spin: el.spin, result: el.result };
  function show(name, move = true) {
    for (const [k, node] of Object.entries(screens)) node.hidden = k !== name;
    el.stats.hidden = name === 'choose' || !st.mode;
    if (!move) return;
    const head = screens[name].querySelector('.tr-h');
    screens[name].scrollIntoView({ block: 'start', behavior: 'instant' });
    if (head) head.focus({ preventScroll: true });
  }
  const items = () => TROPHIES[st.mode].items;
  const inputs = () => [...el.items.querySelectorAll('input')];
  const values = () => inputs().map((i) => i.value);
  const say = (text) => { el.msg.textContent = ''; setTimeout(() => { el.msg.textContent = text; }, 40); };

  function pic(src, cls, alt) {
    const box = document.createElement('span');
    box.className = 'tr-pic' + (cls ? ' ' + cls : '');
    const img = document.createElement('img');
    img.src = src; img.alt = alt || ''; img.decoding = 'async';
    box.appendChild(img);
    return box;
  }

  // ---- chances screen
  function setupTrophy(mode) {
    st.mode = mode;
    el.modeTitle.textContent = L.title[mode];
    el.items.textContent = '';
    el.msg.textContent = '';
    el.shareField.hidden = true;
    items().forEach((item) => {
      const li = document.createElement('li');
      li.className = 'tr-item';
      const box = pic(item.img, '', '');
      const lab = document.createElement('label');
      lab.htmlFor = 'tr-in-' + item.id;
      lab.textContent = names[item.id];
      const hint = document.createElement('span');
      hint.className = 'sr';
      hint.textContent = ' (' + L.chanceUnit + ')';
      lab.appendChild(hint);
      const field = document.createElement('span');
      field.className = 'tr-field';
      const inp = document.createElement('input');
      inp.type = 'number'; inp.id = 'tr-in-' + item.id; inp.dataset.itemId = item.id;
      inp.step = '0.01'; inp.min = '0'; inp.max = '100'; inp.placeholder = '0.00';
      inp.inputMode = 'decimal';
      const unit = document.createElement('span');
      unit.className = 'tr-unit'; unit.setAttribute('aria-hidden', 'true'); unit.textContent = '%';
      field.append(inp, unit);
      li.append(box, lab, field);
      el.items.appendChild(li);
    });
    loadProbabilities(mode);
    st.stats = parseStats(store.get(statsKey(mode)), items().map((i) => i.id));
    renderStats();
    show('settings');
  }
  function saveProbabilities(mode) {
    store.set(storageKey(mode), serializeChances(items().map((i) => i.id), values()));
  }
  function loadProbabilities(mode) {
    const texts = restoreChances(items().map((i) => i.id), store.get(storageKey(mode)));
    inputs().forEach((inp, i) => { if (texts[i]) inp.value = texts[i]; });
    updateTotal();
  }
  function updateTotal() {
    const { total, ok, diff } = checkTotal(values());
    el.totalText.textContent = fmt(L.total, { n: total.toFixed(2) });
    el.total.classList.toggle('is-ok', ok);
    el.total.classList.toggle('is-bad', !ok);
    el.state.textContent = ok ? L.stateOk : (diff > 0 ? L.stateLow : L.stateHigh);
    el.diff.hidden = ok;
    if (!ok) el.diff.textContent = diff > 0 ? fmt(L.left, { n: diff.toFixed(2) }) : fmt(L.over, { n: Math.abs(diff).toFixed(2) });
    return ok;
  }
  function setValues(texts) {
    inputs().forEach((inp, i) => { inp.value = texts[i] || ''; });
    updateTotal();
    saveProbabilities(st.mode);
    renderStats();
  }
  el.items.addEventListener('input', (e) => {
    if (e.target.tagName === 'INPUT') { updateTotal(); saveProbabilities(st.mode); renderStats(); }
  });
  function clearProbabilities() {
    if (!confirm(L.confirmClear)) return;
    inputs().forEach((i) => { i.value = ''; });
    store.del(storageKey(st.mode));
    updateTotal();
    renderStats();
  }
  function normalize() {
    const out = normalizeTo100(values());
    if (!out) { say(L.normalizeEmpty); return; }
    setValues(out);
    say(L.normalized);
  }
  async function share() {
    const link = location.origin + location.pathname + '#' + encodeShare(st.mode, values());
    try {
      await navigator.clipboard.writeText(link);
      el.shareField.hidden = true;
      say(L.shared);
    } catch {
      el.shareField.hidden = false;
      const f = el.shareField.querySelector('input');
      f.value = link; f.focus(); f.select();
      say(L.shareManual);
    }
  }
  // opening a shared link: fill the fields, ask before replacing saved values
  function applyShared() {
    const sh = decodeShare(location.hash);
    if (!sh) return;
    setupTrophy(sh.mode);
    const same = values().every((v, i) => parseChance(v) === parseChance(sh.values[i]));
    const hasSaved = values().some((v) => v !== '');
    if (same || !hasSaved || confirm(fmt(L.confirmShared, { trophy: L.title[sh.mode] }))) setValues(sh.values);
    try { history.replaceState(null, '', location.pathname + location.search); } catch { /* ignore */ }
  }

  // ---- statistics
  const f2 = (n) => n.toFixed(2) + '%';
  function fillTable(body, rows) {
    body.textContent = '';
    rows.forEach((r) => {
      const tr = document.createElement('tr');
      const th = document.createElement('th');
      th.scope = 'row'; th.textContent = names[r.id];
      tr.appendChild(th);
      [String(r.count), f2(r.share), f2(r.chance)].forEach((v) => {
        const td = document.createElement('td');
        td.className = 'num'; td.textContent = v;
        tr.appendChild(td);
      });
      body.appendChild(tr);
    });
  }
  function renderStats() {
    if (!st.mode) return;
    el.statsTitle.textContent = fmt(L.statsOf, { trophy: L.title[st.mode] });
    const s = st.stats;
    const price = parsePrice(el.price.value);
    const info = [fmt(L.openings, { n: s.openings }), fmt(L.sinceJackpot, { n: s.since })];
    if (price !== null) info.push(fmt(L.spent, { n: spentText(s.openings, price) }));
    el.statsInfo.textContent = '';
    info.forEach((x) => { const sp = document.createElement('span'); sp.textContent = x; el.statsInfo.appendChild(sp); });
    el.statsEmpty.hidden = s.openings > 0;
    el.statsTable.hidden = s.openings === 0;
    fillTable(el.statsBody, statRows(items(), s, values()));
  }
  function recordStats(winners) {
    st.stats = addToStats(st.stats, winners);
    store.set(statsKey(st.mode), JSON.stringify(st.stats));
    renderStats();
  }
  function resetStats() {
    if (!confirm(fmt(L.confirmStats, { trophy: L.title[st.mode] }))) return;
    st.stats = emptyStats();
    store.del(statsKey(st.mode));
    renderStats();
  }
  el.price.value = store.get(priceKey) || '';
  el.price.addEventListener('input', () => {
    if (el.price.value === '') store.del(priceKey); else store.set(priceKey, el.price.value);
    renderStats();
  });
  // on a wide screen the table starts open, on a phone it stays folded
  function openStatsOnce() {
    if (st.statsOpened) return;
    st.statsOpened = true;
    if (window.matchMedia('(min-width: 900px)').matches) el.stats.open = true;
  }

  // ---- animation switch
  function paintNoAnim() { el.noAnim.setAttribute('aria-pressed', String(st.noAnim)); }
  paintNoAnim();
  function toggleNoAnim() {
    st.noAnim = !st.noAnim;
    if (st.noAnim) store.set('wtm-sim-noanim', '1'); else store.del('wtm-sim-noanim');
    paintNoAnim();
  }

  // ---- opening
  const winner = (excluded) => determineWinner(items(), values(), excluded);

  function startOpening(count) {
    if (!updateTotal() && !confirm(L.confirmRange)) return;
    if (!winner()) { alert(L.errNoItems); return; }
    unlockAudio();
    st.run++; st.grid++;
    st.skipping = false;
    st.lastCount = count;
    el.live.textContent = '';
    el.track.textContent = '';
    if (count >= 100) { runSeries(count); return; }
    show('spin');

    if (count === 1) {
      el.liveWrap.hidden = true;
      el.status.textContent = L.opening;
      st.singleWinner = winner();
      if (instant()) { showResultSingle(st.singleWinner); return; }
      el.skip.hidden = false;
      runSpin(st.singleWinner, false);
    } else {
      el.liveWrap.hidden = false;
      const winners = drawBatch(items(), values(), count);
      if (instant()) { showResultMultiple(winners, true); return; }
      el.skip.hidden = false;
      runSequence(winners, st.run);
    }
  }

  async function runSequence(winners, run) {
    for (let i = 0; i < winners.length; i++) {
      if (st.skipping || run !== st.run) break;
      el.status.textContent = fmt(L.openingN, { i: i + 1, n: winners.length });
      await new Promise((resolve) => runSpin(winners[i], true, resolve));
      if (run !== st.run) return;
      if (!st.skipping) {
        addLiveItem(winners[i]);
        await new Promise((r) => setTimeout(r, 500));
        if (run !== st.run) return;
      }
    }
    if (run !== st.run) return;
    if (st.skipping) {
      for (let j = el.live.children.length; j < winners.length; j++) addLiveItem(winners[j]);
    }
    showResultMultiple(winners, st.skipping);
  }

  function itemCell(item, cls) {
    const li = document.createElement('li');
    li.className = 'tr-cell' + cls;
    li.appendChild(pic(item.img, '', names[item.id]));
    return li;
  }
  function highlightClass(item) {
    if (item.id === 'jackpot') return ' is-jackpot';
    return isHighlighted(item.id) ? ' is-unique' : '';
  }
  function addLiveItem(item) { el.live.appendChild(itemCell(item, highlightClass(item))); }

  function skipAnimation() {
    st.skipping = true;
    fadeAudio(st.curSpin, 300);
    if (st.spinTimer) clearTimeout(st.spinTimer);
    el.track.style.transition = 'none';
    if (el.liveWrap.hidden) {
      showResultSingle(st.singleWinner);
    } else if (st.spinResolve) {
      const r = st.spinResolve;
      st.spinResolve = null;
      r();
    }
  }

  // The strip moves with transform only. The marker stays in the centre; after the stop the
  // winning card eases to the exact centre and gets a frame.
  function runSpin(winnerItem, fast, callback) {
    const run = st.run;
    const track = el.track;
    track.textContent = '';
    track.style.transition = 'none';
    track.style.transform = 'translate3d(0,0,0)';
    void track.offsetHeight;
    st.spinResolve = callback || null;
    playSpinSound();

    const WINNER_AT = 60, TOTAL = 90;
    const list = items();
    for (let i = 0; i < TOTAL; i++) {
      const item = i === WINNER_AT ? winnerItem : list[Math.floor(Math.random() * list.length)];
      const card = document.createElement('div');
      card.className = 'tr-card' + (item.id === 'jackpot' ? ' is-jackpot' : '');
      if (i === WINNER_AT) card.id = 'tr-winner-card';
      const img = document.createElement('img');
      img.src = item.img; img.alt = ''; img.decoding = 'async';
      card.appendChild(img);
      track.appendChild(card);
    }

    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (run !== st.run) return;
      if (st.skipping && fast && callback) { fadeAudio(st.curSpin, 200); callback(); return; }
      const wrapperWidth = el.strip.offsetWidth;
      const winnerCard = $('tr-winner-card');
      const cardWidth = winnerCard.offsetWidth;
      const exact = winnerCard.offsetLeft + cardWidth / 2 - wrapperWidth / 2;
      const slide = exact + (Math.random() - 0.5) * (cardWidth * 0.5); // random offset inside the card
      const duration = fast ? 2.5 : 6.5;
      track.style.transition = `transform ${duration}s cubic-bezier(0.12, 0.8, 0.3, 1)`;
      track.style.transform = `translate3d(-${slide}px,0,0)`;

      if (fast) setTimeout(() => { if (!st.skipping && run === st.run) fadeAudio(st.curSpin, 400); }, duration * 1000 - 200);

      const settle = fast ? 150 : 250;
      st.spinTimer = setTimeout(() => {
        if (run !== st.run) return;
        if (!fast && st.curSpin) fadeAudio(st.curSpin, 500);
        track.style.transition = `transform ${settle}ms ease-out`;
        track.style.transform = `translate3d(-${exact}px,0,0)`;
        winnerCard.classList.add('is-win');
        st.spinTimer = setTimeout(() => {
          if (run !== st.run) return;
          if (fast) { if (callback) callback(); } else showResultSingle(winnerItem);
        }, fast ? settle : settle + 150);
      }, duration * 1000);
    }));
  }

  // ---- results
  function announce(text) {
    el.announce.textContent = '';
    setTimeout(() => { el.announce.textContent = text; }, 60);
  }
  function buzz(list) {
    if (reduced() || !navigator.vibrate || !list.some((i) => isHighlighted(i.id))) return;
    try { navigator.vibrate(40); } catch { /* not allowed */ }
  }
  function countText(list) {
    const counts = new Map();
    list.forEach((it) => counts.set(it.id, (counts.get(it.id) || 0) + 1));
    return [...counts].map(([id, n]) => names[id] + (n > 1 ? ' ×' + n : '')).join(', ');
  }
  function showResultSingle(item) {
    st.run++; // stops everything still scheduled for this opening
    fadeAudio(st.curSpin, 200);
    playWin();
    recordStats([item]);
    el.resultHead.textContent = L.congrats;
    el.single.hidden = false; el.multi.hidden = true; el.series.hidden = true;
    el.singleImg.src = item.img;
    el.singleImg.alt = names[item.id];
    el.singleName.textContent = names[item.id];
    el.single.className = 'tr-single' + highlightClass(item);
    show('result');
    announce(fmt(L.announceOne, { name: names[item.id] }));
    buzz([item]);
  }
  function showResultMultiple(list, immediately) {
    st.run++;
    const g = ++st.grid;
    fadeAudio(st.curSpin, 200);
    playWin();
    recordStats(list);
    el.resultHead.textContent = L.congrats;
    el.single.hidden = true; el.multi.hidden = false; el.series.hidden = true;
    el.multi.textContent = '';
    const add = (item) => {
      const li = document.createElement('li');
      li.className = 'tr-res' + highlightClass(item);
      const name = document.createElement('span');
      name.className = 'tr-res__name';
      name.textContent = names[item.id];
      li.append(pic(item.img, '', ''), name);
      el.multi.appendChild(li);
    };
    // card by card, in the true order
    list.forEach((item, i) => {
      if (immediately || reduced() || st.noAnim) add(item);
      else setTimeout(() => { if (g === st.grid) add(item); }, i * 60);
    });
    show('result');
    announce(fmt(L.announceMany, { n: list.length, list: countText(list) }));
    buzz(list);
  }
  // fast series: computed at once with the same draw function, summary table instead of cards
  function runSeries(count) {
    const res = fastSeries(items(), values(), count);
    playWin();
    recordStats(res.winners);
    el.resultHead.textContent = count >= 1000 ? L.seriesTitle1000 : L.seriesTitle100;
    el.single.hidden = true; el.multi.hidden = true; el.series.hidden = false;
    const rows = items().map((it, i) => ({
      id: it.id, count: res.counts[it.id] || 0,
      share: res.draws ? ((res.counts[it.id] || 0) / res.draws) * 100 : 0,
      chance: Math.max(parseChance(values()[i]), 0),
    }));
    fillTable(el.seriesBody, rows);
    show('result');
    announce(fmt(L.announceSeries, { list: countText(res.winners) }));
  }
  function goBackToSettings() {
    st.run++; st.grid++;
    st.skipping = false;
    show('settings');
  }

  // ---- calculator (a floating, non-modal panel: the chance fields stay usable)
  function toggleCalc(force) {
    const open = typeof force === 'boolean' ? force : !el.calc.open;
    if (open && !el.calc.open) { el.calc.show(); el.calcScreen.focus(); } else if (!open && el.calc.open) el.calc.close();
    el.calcBtn.setAttribute('aria-expanded', String(el.calc.open));
  }
  const screenVal = () => el.calcScreen.value;
  function calcAppend(v) { el.calcScreen.value += v; }
  function calcResult() {
    try { el.calcScreen.value = calcFormat(calcEval(screenVal())); } catch { el.calcScreen.value = L.calcError; }
  }
  el.calc.addEventListener('click', (e) => {
    const b = e.target.closest('[data-k]');
    if (!b) return;
    const k = b.dataset.k;
    if (el.calcScreen.value === L.calcError) el.calcScreen.value = '';
    if (k === 'clear') el.calcScreen.value = '';
    else if (k === 'back') el.calcScreen.value = screenVal().slice(0, -1);
    else if (k === 'eq') calcResult();
    else if (k === 'close') toggleCalc(false);
    else calcAppend(k);
  });
  el.calcScreen.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'Escape') { e.stopPropagation(); toggleCalc(false); el.calcBtn.focus(); return; }
    const k = e.key;
    const handled = /^[0-9+\-*/%.()]$/.test(k) || [',', 'Enter', '=', 'Backspace', 'Delete'].includes(k);
    if (!handled) return;
    e.preventDefault();
    if (el.calcScreen.value === L.calcError) el.calcScreen.value = '';
    if (/^[0-9+\-*/%.()]$/.test(k)) calcAppend(k);
    else if (k === ',') calcAppend('.');
    else if (k === 'Enter' || k === '=') calcResult();
    else if (k === 'Backspace') el.calcScreen.value = screenVal().slice(0, -1);
    else if (k === 'Delete') el.calcScreen.value = '';
  });
  el.calc.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && e.target !== el.calcScreen) { e.stopPropagation(); toggleCalc(false); el.calcBtn.focus(); }
  });

  // ---- wiring
  root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const act = b.dataset.act;
    if (act === 'pick') setupTrophy(b.dataset.mode);
    else if (act === 'menu') show('choose');
    else if (act === 'open' || act === 'series') startOpening(parseInt(b.dataset.count, 10));
    else if (act === 'again') startOpening(st.lastCount);
    else if (act === 'settings') goBackToSettings();
    else if (act === 'clear') clearProbabilities();
    else if (act === 'normalize') normalize();
    else if (act === 'share') share();
    else if (act === 'calc') toggleCalc();
    else if (act === 'skip') skipAnimation();
    else if (act === 'noanim') toggleNoAnim();
    else if (act === 'statsreset') resetStats();
  });
  // Esc closes the result window
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !el.result.hidden && !el.calc.open) goBackToSettings();
  });
  el.stats.addEventListener('toggle', () => { st.statsOpened = true; });
  openStatsOnce();
  show('choose', false);
  applyShared();
}

if (typeof document !== 'undefined') initUi();
