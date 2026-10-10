// «Оборона города» — игра за ПВО. Перед волной — расстановка комплексов на тактической карте за очки обороны
// (зоны поражения с «тенями» от зданий на высоте 300 м), волна ИИ-ударников (sim/raid.js), между волнами — итоги,
// докупка, переезд, продажа. Командир видит то, что видит сеть РЛС, и отдаёт приказы; в любой комплекс можно «сесть»
// оператором: круговой обзор (ИКО), назначение цели касанием, захват за реальное время станции, пуск, РЛС вкл/выкл,
// метод наведения; пушки — прицел с упреждением и огонь удержанием; ПЗРК — перекрестие и тон захвата ГСН.
// start(opts) — для обучения: { budget, waves, units: [[ключ, x, z, roof]], op: индекс комплекса, plan: false, wave(raid, rnd, n),
//   noEnd, hold (волна не кончается сама — урок подаёт цели), onTick(dt), on: { place, waveStart, waveEnd, designate, track, launch, planeDown, arm, radar } }.
/* global THREE */
import { CITY, mulberry32 } from './city.js?v=20261012d';
import { SAM, SAM_COST, SAM_TYPE, AG } from './arsenal.js?v=20261012d';
import { samClass, samCost, LIMIT1 } from './sim/online.js?v=20261012d';
import { clamp, D2R, angleBetween, fwdOf } from '../drone/sim/core.js?v=20261012d';
import { freeGround, buildingAt, roofOk, pickTargets } from './mission.js?v=20261012d';

export const WAVES = 6;
const WAVE_N = [3, 4, 6, 7, 9, 11];

export function createDefense(C) {
  const { $, city, camera, snd, IS_TOUCH } = C;
  C.WAVES = WAVES;
  const V3 = () => new THREE.Vector3();
  const st = { phase: 'plan', wave: 0, waves: WAVES, budget: 0, score: 0, value0: 1, downs: 0, leaked: 0, lostUnits: 0, placing: null, sel: null, moving: false,
    view: 'map', op: null, opts: {}, waveDowns: 0, waveLeak: 0, waveLost: [], over: false, rnd: Math.random, msg: '', msgT: 0, net: null, ready: false };
  const seen = new Map(); // самолёт → время, когда его последний раз видела сеть ПВО
  const tm = $('tmap'), tx = tm.getContext('2d');
  const view = { cx: 500, cz: -300, k: 0.05 }; // центр карты (м) и масштаб (px на м)
  const say = (t, s = 2.6) => { st.msg = t; st.msgT = s; };
  const on = (k, ...a) => { const f = st.opts.on && st.opts.on[k]; if (f) f(...a); };

  // ═════════════ Тактическая карта ═════════════
  const w2s = (x, z) => [C.VW / 2 + (x - view.cx) * view.k, C.VH / 2 + (z - view.cz) * view.k];
  const s2w = (px, py) => [view.cx + (px - C.VW / 2) / view.k, view.cz + (py - C.VH / 2) / view.k];
  function fit() { view.cx = 500; view.cz = -300; view.k = Math.min(C.VW - (IS_TOUCH ? 250 : 300), C.VH) / 22000; }
  // присваивание размера очищает холст — только если размер правда другой (иначе динамическое разрешение 3D-кадра «моргало» картой)
  function sizeMap() { const k = Math.min(2, devicePixelRatio || 1), w = Math.round(C.VW * k), h = Math.round(C.VH * k); if (tm.width !== w || tm.height !== h) { tm.width = w; tm.height = h; } }
  // «тень» зоны: на высоте 300 м над землёй по 72 направлениям — докуда антенна (или глаз расчёта) видит без перерыва
  function coverage(u) {
    const S = u.S, R = S.rmax, pts = [], eye = u.ant, h = 300;
    for (let i = 0; i < 72; i++) {
      const a = i / 72 * Math.PI * 2, dx = Math.sin(a), dz = Math.cos(a);
      let d = R;
      for (let s = 1; s <= 40; s++) {
        const r = R * s / 40, x = u.pos.x + dx * r, z = u.pos.z + dz * r, y = city.groundH(x, z) + Math.min(h, S.hmax);
        if (!city.los(eye.x, eye.y, eye.z, x, y, z, 15)) { d = R * (s - 1) / 40; break; }
      }
      pts.push([u.pos.x + dx * Math.max(d, S.rmin), u.pos.z + dz * Math.max(d, S.rmin)]);
    }
    u.cov = pts;
  }
  const unitColor = (u) => (u.dead ? '#555' : u.track ? (C.S.sams.some((m) => !m.dead && m.unit === u) || u.gunOn ? '#ff4d4d' : '#fde047') : u.S.radar && u.emit ? '#4ade80' : u.S.radar ? '#94a3b8' : '#86efac');
  function drawMap(t) {
    navStep();
    const k = Math.min(2, devicePixelRatio || 1); tx.setTransform(k, 0, 0, k, 0, 0);
    tx.fillStyle = '#0b1218'; tx.fillRect(0, 0, C.VW, C.VH);
    const base = C.menu.mapBase(1600), [x0, y0] = w2s(-CITY.HALF, -CITY.HALF), sz = 2 * CITY.HALF * view.k;
    tx.globalAlpha = 0.85; tx.drawImage(base, x0, y0, sz, sz); tx.globalAlpha = 1;
    tx.font = '600 11px -apple-system, Segoe UI, sans-serif'; tx.textAlign = 'center';
    // объекты города с прочностью
    for (const o of C.S.objects) {
      if (o.key === 'bridge' && view.k < 0.06 && !st.targets?.includes(o)) continue;
      const [px, py] = w2s(o.x, o.z), tgt = st.targets && st.targets.includes(o) && st.phase === 'wave';
      tx.fillStyle = o.dead ? '#444' : tgt ? '#f87171' : '#fbbf24';
      tx.beginPath(); tx.moveTo(px, py - 6); tx.lineTo(px + 6, py); tx.lineTo(px, py + 6); tx.lineTo(px - 6, py); tx.closePath(); tx.fill();
      tx.fillStyle = 'rgba(0,0,0,.5)'; tx.fillRect(px - 16, py + 8, 32, 4); tx.fillStyle = o.dead ? '#444' : '#4ade80'; tx.fillRect(px - 16, py + 8, 32 * Math.max(0, o.hp / o.hpMax), 4);
      if (view.k > 0.045) { tx.fillStyle = '#fff'; tx.strokeStyle = 'rgba(0,0,0,.75)'; tx.lineWidth = 3; tx.strokeText(o.name, px, py - 9); tx.fillText(o.name, px, py - 9); }
    }
    // зоны: выбранный комплекс — тень зоны, у остальных — тонкий круг
    for (const u of C.S.units) {
      if (u.dead) continue;
      const [px, py] = w2s(u.pos.x, u.pos.z);
      if (u === st.sel) {
        if (!u.cov) coverage(u);
        tx.fillStyle = 'rgba(74,222,128,.13)'; tx.strokeStyle = 'rgba(74,222,128,.75)'; tx.lineWidth = 1.5;
        tx.beginPath(); u.cov.forEach(([x, z], i) => { const [a, b] = w2s(x, z); if (i) tx.lineTo(a, b); else tx.moveTo(a, b); }); tx.closePath(); tx.fill(); tx.stroke();
        tx.setLineDash([5, 5]); tx.strokeStyle = 'rgba(255,255,255,.4)'; tx.beginPath(); tx.arc(px, py, u.S.rmax * view.k, 0, 7); tx.stroke(); tx.setLineDash([]);
      } else if (u.S.type === 'jammer') { tx.fillStyle = 'rgba(56,189,248,.08)'; tx.strokeStyle = 'rgba(56,189,248,.5)'; tx.setLineDash([3, 5]); tx.beginPath(); tx.arc(px, py, u.S.jamR * view.k, 0, 7); tx.fill(); tx.stroke(); tx.setLineDash([]); }
      else { tx.strokeStyle = 'rgba(148,163,184,.22)'; tx.lineWidth = 1; tx.beginPath(); tx.arc(px, py, u.S.rmax * view.k, 0, 7); tx.stroke(); }
    }
    for (const u of C.S.units) {
      const [px, py] = w2s(u.pos.x, u.pos.z), col = unitColor(u);
      tx.fillStyle = col; tx.strokeStyle = u === st.sel ? '#fff' : 'rgba(0,0,0,.6)'; tx.lineWidth = u === st.sel ? 2.5 : 1.5;
      tx.beginPath(); if (u.S.type === 'guns') tx.rect(px - 6, py - 6, 12, 12); else if (u.S.hp <= 15) tx.arc(px, py, 5, 0, 7); else { tx.moveTo(px, py - 8); tx.lineTo(px + 7, py + 6); tx.lineTo(px - 7, py + 6); tx.closePath(); }
      tx.fill(); tx.stroke();
      if (u.dead) { tx.strokeStyle = '#ef4444'; tx.beginPath(); tx.moveTo(px - 6, py - 6); tx.lineTo(px + 6, py + 6); tx.moveTo(px + 6, py - 6); tx.lineTo(px - 6, py + 6); tx.stroke(); }
      if (u.manual) { tx.strokeStyle = '#fb923c'; tx.beginPath(); tx.arc(px, py, 11, 0, 7); tx.stroke(); }
      tx.fillStyle = '#e2e8f0'; tx.fillText(u.S.rwr || u.S.short, px, py + 18);
      if (u.reloadT > 0) { tx.fillStyle = '#fdba74'; tx.fillText(`${Math.ceil(u.reloadT)}с`, px + 18, py - 4); }
    }
    // цели, которые видит сеть ПВО (Аркада — все)
    const arcade = C.MODE().markers;
    if (C.raid) for (const a of C.raid.planes) {
      if (a.dead || a.out || a.phase === 'wait') continue;
      const ts = seen.get(a); if (!arcade && (!ts || C.t - ts > 4)) continue;
      const [px, py] = w2s(a.pos.x, a.pos.z), stale = !arcade && C.t - ts > 1;
      tx.save(); tx.translate(px, py); tx.rotate(-a.yaw); tx.fillStyle = stale ? 'rgba(248,113,113,.5)' : '#f87171';
      tx.beginPath(); tx.moveTo(0, -9); tx.lineTo(6, 7); tx.lineTo(-6, 7); tx.closePath(); tx.fill(); tx.restore();
      tx.fillStyle = '#fecaca'; tx.fillText(`${Math.round((a.pos.y - city.groundH(a.pos.x, a.pos.z)) / 10) * 10}`, px, py - 12);
    }
    // ракеты: свои — белые, чужое оружие — оранжевое
    for (const m of C.S.sams) { if (m.dead) continue; const [px, py] = w2s(m.pos.x, m.pos.z); tx.fillStyle = '#fff'; tx.fillRect(px - 1.5, py - 1.5, 3, 3); }
    for (const w of C.S.wpns) { if (w.dead) continue; const [px, py] = w2s(w.pos.x, w.pos.z); tx.fillStyle = w.W.kind === 'arm' ? '#f472b6' : w.W.kind === 'cruise' ? '#facc15' : w.intercepted ? '#888' : '#fb923c'; tx.fillRect(px - 2, py - 2, 4, 4); }
    // постановка: «призрак» под пальцем
    if ((st.placing || st.moving) && ptr.over) {
      const S = st.placing ? SAM[st.placing] : st.sel.S, [wx, wz] = s2w(ptr.x, ptr.y), ok = placeOk(S, wx, wz);
      tx.strokeStyle = ok ? 'rgba(74,222,128,.9)' : 'rgba(248,113,113,.9)'; tx.lineWidth = 1.5; tx.setLineDash([4, 4]);
      tx.beginPath(); tx.arc(ptr.x, ptr.y, S.rmax * view.k, 0, 7); tx.stroke(); tx.setLineDash([]);
      tx.fillStyle = ok ? '#4ade80' : '#f87171'; tx.beginPath(); tx.arc(ptr.x, ptr.y, 6, 0, 7); tx.fill();
    }
    if (st.msgT > 0) { tx.font = '700 14px -apple-system, Segoe UI, sans-serif'; tx.fillStyle = '#fde68a'; tx.strokeStyle = 'rgba(0,0,0,.8)'; tx.lineWidth = 4; const yy = C.VH - (IS_TOUCH ? 16 : 30), xx = ($('mapNav').getBoundingClientRect().right || 0) + 12; tx.textAlign = 'left'; tx.strokeText(st.msg, xx, yy); tx.fillText(st.msg, xx, yy); } // правее панели перемещения
  }
  // где можно поставить: ПЗРК — земля или подходящая крыша, остальные — свободная земля
  function placeOk(S, x, z) {
    if (Math.abs(x) > CITY.HALF - 1500 || Math.abs(z) > CITY.HALF - 1500) return false;
    const i = buildingAt(city, x, z);
    if (i >= 0) return S.hp <= 15 && roofOk(city, i);
    return freeGround(city, x, z, S.hp <= 15 ? 3 : 9);
  }
  // ── указатель: тянуть — сдвиг, колесо/щипок — масштаб, касание — действие ──
  const ptr = { x: 0, y: 0, over: false, down: null, pts: new Map(), pinch: null };
  tm.addEventListener('pointermove', (e) => {
    ptr.x = e.clientX; ptr.y = e.clientY; ptr.over = true;
    if (!ptr.pts.has(e.pointerId)) return;
    const p0 = ptr.pts.get(e.pointerId); ptr.pts.set(e.pointerId, [e.clientX, e.clientY]);
    if (ptr.pts.size === 2 && ptr.pinch) {
      const [a, b] = [...ptr.pts.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      zoomAt(ptr.pinch.k * d / ptr.pinch.d / view.k, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2); return;
    }
    const dx = e.clientX - p0[0], dy = e.clientY - p0[1];
    if (ptr.down) ptr.down.moved += Math.abs(dx) + Math.abs(dy);
    if (ptr.down && ptr.down.moved > 8) { view.cx -= dx / view.k; view.cz -= dy / view.k; }
  });
  tm.addEventListener('pointerdown', (e) => {
    tm.setPointerCapture(e.pointerId); ptr.pts.set(e.pointerId, [e.clientX, e.clientY]); ptr.x = e.clientX; ptr.y = e.clientY;
    if (ptr.pts.size === 2) { const [a, b] = [...ptr.pts.values()]; ptr.pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]) || 1, k: view.k }; ptr.down = null; return; }
    ptr.down = { x: e.clientX, y: e.clientY, moved: 0 };
  });
  const up = (e) => {
    ptr.pts.delete(e.pointerId); if (ptr.pts.size < 2) ptr.pinch = null;
    if (ptr.down && ptr.down.moved < 8 && e.type === 'pointerup') mapTap(e.clientX, e.clientY);
    if (!ptr.pts.size) ptr.down = null;
    if (e.pointerType !== 'mouse') ptr.over = false;
  };
  tm.addEventListener('pointerup', up); tm.addEventListener('pointercancel', up);
  tm.addEventListener('pointerleave', () => { ptr.over = false; });
  tm.addEventListener('wheel', (e) => { zoomAt(e.deltaY < 0 ? 1.2 : 1 / 1.2, e.clientX, e.clientY); e.preventDefault(); }, { passive: false });
  // ── панель перемещения: джойстик (сдвиг тем быстрее, чем дальше палец от центра — у центра точно и медленно),
  // ползунок масштаба (−/+), «вся карта». Масштаб — логарифмический: 0 — весь город, 100 — отдельные дома.
  const nav = { x: 0, y: 0, id: null, last: 0 }, KMIN = 0.012, KMAX = 0.6;
  const zv = (k) => 100 * Math.log(k / KMIN) / Math.log(KMAX / KMIN), vz = (v) => KMIN * Math.pow(KMAX / KMIN, v / 100);
  { const pad = $('mnPad'), knob = $('mnKnob');
    const place = () => { knob.style.transform = `translate(${nav.x * 30}px, ${nav.y * 30}px)`; };
    const move = (e) => { const r = pad.getBoundingClientRect(); let x = (e.clientX - r.left - r.width / 2) / 30, y = (e.clientY - r.top - r.height / 2) / 30; const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; } nav.x = x; nav.y = y; place(); };
    pad.addEventListener('pointerdown', (e) => { nav.id = e.pointerId; pad.setPointerCapture(e.pointerId); nav.last = performance.now(); move(e); e.preventDefault(); });
    pad.addEventListener('pointermove', (e) => { if (e.pointerId === nav.id) move(e); });
    const end = (e) => { if (e.pointerId !== nav.id) return; nav.id = null; nav.x = nav.y = 0; place(); };
    pad.addEventListener('pointerup', end); pad.addEventListener('pointercancel', end);
    $('mnZ').addEventListener('input', (e) => zoomAt(vz(+e.target.value) / view.k, C.VW / 2, C.VH / 2));
    $('mnIn').addEventListener('click', () => zoomAt(1.35, C.VW / 2, C.VH / 2)); $('mnOut').addEventListener('click', () => zoomAt(1 / 1.35, C.VW / 2, C.VH / 2));
    $('mnFit').addEventListener('click', () => fit()); }
  function navStep() { // раз в кадр карты
    const now = performance.now(), dt = Math.min(0.05, (now - (nav.lastT || now)) / 1000); nav.lastT = now;
    if (nav.id !== null) { const sp = 0.9 * C.VW / view.k, l = Math.hypot(nav.x, nav.y), g = l * l; if (l > 0.02) { view.cx += nav.x / l * g * sp * dt; view.cz += nav.y / l * g * sp * dt; } }
    const z = $('mnZ'); if (document.activeElement !== z) z.value = zv(view.k).toFixed(1);
  }
  function zoomAt(f, px, py) {
    const [wx, wz] = s2w(px, py); view.k = clamp(view.k * f, 0.012, 0.6);
    view.cx = wx - (px - C.VW / 2) / view.k; view.cz = wz - (py - C.VH / 2) / view.k;
  }
  function mapTap(px, py) {
    const [wx, wz] = s2w(px, py);
    if (st.phase === 'plan' && (st.placing || st.moving)) {
      const S = st.placing ? SAM[st.placing] : st.sel.S;
      if (!placeOk(S, wx, wz)) { say(S.hp <= 15 ? 'Здесь нельзя: нужна земля или плоская крыша' : 'Здесь нельзя: дом, река или край карты'); snd.deny(); return; }
      const roof = buildingAt(city, wx, wz) >= 0;
      if (st.net) { // онлайн: покупку и переезд проверяет и делает сервер (комплекс придёт событием)
        if (st.moving) { st.net.move(st.sel.id, wx, wz, roof); st.moving = false; }
        else { if (samCost(st.placing) > st.budget) { say('Не хватает очков обороны'); snd.deny(); return; } st.net.buyUnit(st.placing, wx, wz, roof); }
        snd.click(); renderSide(); return;
      }
      if (st.moving) { C.S.moveUnit(st.sel, wx, wz, roof); st.sel.cov = null; st.moving = false; C.syncUnits(); snd.click(); renderSide(); return; }
      const cost = SAM_COST[st.placing];
      if (cost > st.budget) { say('Не хватает очков обороны'); snd.deny(); return; }
      st.budget -= cost;
      const u = C.S.addUnit(st.placing, wx, wz, { roof, skill: 0.75, yaw: st.rnd() * 6.28 });
      u.paid = cost; C.syncUnits(); st.sel = u; snd.click(); on('place', u);
      if (SAM_COST[st.placing] > st.budget) st.placing = null;
      renderSide(); return;
    }
    // выбор комплекса под пальцем
    let best = null, bd = IS_TOUCH ? 26 : 16;
    for (const u of C.S.units) { const [x, y] = w2s(u.pos.x, u.pos.z), d = Math.hypot(x - px, y - py); if (d < bd) { bd = d; best = u; } }
    st.sel = best; st.placing = null; if (best) snd.click(); renderSide();
  }

  // ═════════════ Боковая панель ═════════════
  const side = $('dside');
  function unitStatus(u) {
    if (u.dead) return 'уничтожен';
    if (u.S.type === 'jammer') return `подавляет спутниковую навигацию в радиусе ${(u.S.jamR / 1000).toFixed(0)} км`;
    const a = [];
    if (u.S.radar) a.push(u.emit ? 'РЛС излучает' : u.ambush ? 'засада: РЛС молчит' : 'РЛС выключена');
    if (u.track) a.push('<b style="color:#fde047">захват цели</b>');
    if (u.S.type !== 'guns') a.push(u.reloadT > 0 ? `перезарядка ${Math.ceil(u.reloadT)} с` : `ракет ${u.ammo}/${u.S.ammo}`);
    if (u.hold) a.push('огонь по команде');
    return a.join(' · ');
  }
  // онлайн: мои комплексы, лимит первой волны по классам, сторона ПВО и эпоха — из боя
  const mine = (u) => !st.net || u.owner === (st.net.me && st.net.me.id);
  const CLS_NAME = { top: 'дальний', mid: 'средний', near: 'ближний' };
  function netLeft(k) { // сколько ещё можно купить этого класса на первой волне (null — без лимита)
    if (!st.net || st.wave !== 1) return null; const cls = samClass(k); if (cls === 'near') return null;
    return LIMIT1[cls] - C.S.units.filter((u) => mine(u) && !u.dead && samClass(u.key) === cls).length;
  }
  function renderNet() {
    const S = C.S, N = st.net, B = N.battle; let h = '';
    const left = N.room && N.room.left !== null ? ` · ${N.room.left} с` : '';
    if (st.phase === 'plan') {
      h += `<h3>Расстановка · волна ${st.wave}/${st.waves}${left}</h3><div>Очки обороны: <b style="color:#fde68a">${st.budget}</b></div>`;
      if (st.wave === 1) h += '<p class="hint">Первая волна: не больше 1 дальнего и 2 средних комплексов, ближние — за очки.</p>';
      if (st.sel && !st.sel.dead && mine(st.sel)) {
        const u = st.sel;
        h += `<div class="dcard on"><div class="nm"><b>${u.S.name}</b><span>${SAM_TYPE[u.S.type]} · до ${(u.S.rmax / 1000).toFixed(1)} км</span></div></div>
          <div class="dact"><button class="btn alt" data-a="move">${st.moving ? 'Куда? Коснитесь карты' : 'Переместить'}</button><button class="btn alt" data-a="sell">Продать +${Math.round(samCost(u.key) * 0.7)}</button><button class="btn alt" data-a="desel">Готово</button></div>`;
      } else if (st.sel && !st.sel.dead) h += `<div class="dcard"><div class="nm"><b>${st.sel.S.name}</b><span>союзника</span></div></div>`;
      h += '<div class="cat-h">Купить</div>';
      const side = B.sideAir === 'east' ? 'west' : 'east';
      for (const [k, s] of Object.entries(SAM)) {
        if (s.side !== side || s.era > B.era) continue;
        const c = samCost(k), lim = netLeft(k), no = c > st.budget || (lim !== null && lim <= 0);
        h += `<div class="dcard ${st.placing === k ? 'on' : ''} ${no ? 'no' : ''}" data-buy="${k}"><div class="nm"><b>${s.short}</b><span>${CLS_NAME[samClass(k)]} · ${SAM_TYPE[s.type]} · ${(s.rmax / 1000).toFixed(1)} км${lim !== null ? ` · можно ещё ${Math.max(0, lim)}` : ''}</span></div><span class="pr">${c}</span></div>`;
      }
      h += `<p class="hint">${st.placing ? 'Коснитесь карты, чтобы поставить. ПЗРК можно на плоские крыши.' : 'Выберите комплекс и коснитесь карты. Свои комплексы можно переставить и продать.'}</p>`;
      h += `<button class="btn ${st.ready ? 'alt' : ''}" data-a="ready">${st.ready ? 'Готов ✓ (снять)' : 'ГОТОВ'}</button>`;
    } else if (st.phase === 'wave') {
      const air = C.raid.planes.filter((a) => !a.dead && !a.out && a.role !== 'decoy').length;
      h += `<h3>Волна ${st.wave}/${st.waves}${left}</h3><div>В воздухе: <b>${air}</b> · объекты целы <b>${Math.round((1 - (B.valueK || 0)) * 100)}%</b></div>`;
      if (st.sel && !st.sel.dead && mine(st.sel)) {
        const u = st.sel;
        h += `<div class="dcard on"><div class="nm"><b>${u.S.name}</b><span>${unitStatus(u)}</span></div></div><div class="dact">
          ${u.S.type === 'jammer' ? '' : '<button class="btn" data-a="op">Управлять</button>'}
          ${u.S.radar ? `<button class="btn alt" data-a="emit">${u.emit ? 'РЛС: выключить' : 'РЛС: включить'}</button>` : ''}<button class="btn alt" data-a="desel">Снять выбор</button></div>`;
      } else h += '<p class="hint">Коснитесь своего комплекса: «Управлять» — сесть оператором. Остальными стреляют расчёты. Красные треугольники — цели, которые видит сеть РЛС.</p>';
      h += '<button class="btn alt" data-a="help">Мне нужна помощь!</button>';
    } else if (st.phase === 'debrief') {
      const r = st.netRes || {};
      h += `<h3>Волна ${st.wave} — итоги</h3><div class="stats" style="margin:6px 0"><div class="stt"><b>${r.downs ?? '–'}</b><span>сбито</span></div><div class="stt"><b>${r.unitKills ?? '–'}</b><span>потеряно ЗРК</span></div>
        <div class="stt"><b>${Math.round((1 - (r.totalK || 0)) * 100)}%</b><span>объекты целы</span></div></div><p class="hint">${r.last ? 'Бой окончен — итоги…' : 'Скоро расстановка следующей волны.'}</p>`;
    }
    side.innerHTML = h;
  }
  function renderSide() {
    const S = C.S; if (!S) return;
    if (st.net) return renderNet();
    let h = '';
    if (st.phase === 'plan') {
      h += `<h3>Расстановка · волна ${st.wave + 1}/${st.waves}</h3><div>Очки обороны: <b style="color:#fde68a">${st.budget}</b></div>`;
      if (st.sel && !st.sel.dead) {
        const u = st.sel;
        h += `<div class="dcard on"><div class="nm"><b>${u.S.name}</b><span>${SAM_TYPE[u.S.type]} · до ${(u.S.rmax / 1000).toFixed(1)} км · ${unitStatus(u)}</span></div></div>
          <div class="dact"><button class="btn alt" data-a="move">${st.moving ? 'Куда? Коснитесь карты' : 'Переместить'}</button><button class="btn alt" data-a="sell">Продать +${Math.round((u.paid || SAM_COST[u.key]) * 0.7)}</button>
          ${u.S.radar && u.S.type !== 'guns' ? `<button class="btn alt" data-a="amb">${u.ambush ? 'Засада: вкл' : 'Засада: выкл'}</button>` : ''}<button class="btn alt" data-a="desel">Готово</button></div>`;
      }
      h += '<div class="cat-h">Купить</div>';
      const al = st.opts.allow, cat = Object.entries(SAM);
      if (al) cat.sort(([a], [b]) => al.has(b) - al.has(a)); // урок: нужное — сверху
      for (const [k, s] of cat) {
        if (s.side !== C.setup.side || s.era > C.setup.era) continue;
        const c = SAM_COST[k], shut = st.opts.allow && !st.opts.allow.has(k); // урок: покупать только то, о чём он
        h += `<div class="dcard ${st.placing === k ? 'on' : ''} ${c > st.budget || shut ? 'no' : ''}" data-buy="${k}"><div class="nm"><b>${s.short}</b><span>${shut ? 'не в этом уроке' : `${SAM_TYPE[s.type]} · ${(s.rmax / 1000).toFixed(1)} км / ${(s.hmax / 1000).toFixed(1)} км`}</span></div><span class="pr">${c}</span></div>`;
      }
      h += `<p class="hint">${st.placing ? 'Коснитесь карты, чтобы поставить. ПЗРК можно на плоские крыши.' : 'Выберите комплекс и коснитесь карты. Коснитесь своего комплекса — тень его зоны на высоте 300 м и приказы.'}</p>`;
      h += `<button class="btn" data-a="go" ${S.units.filter((u) => !u.dead).length ? '' : 'disabled'}>В БОЙ — волна ${st.wave + 1}</button>`;
    } else if (st.phase === 'wave') {
      const air = C.raid.planes.filter((a) => !a.dead && !a.out).length;
      h += `<h3>Волна ${st.wave}/${st.waves}</h3><div>В воздухе: <b>${air}</b> · сбито: <b>${st.waveDowns}</b></div>`;
      if (st.sel && !st.sel.dead) {
        const u = st.sel;
        h += `<div class="dcard on"><div class="nm"><b>${u.S.name}</b><span>${unitStatus(u)}</span></div></div><div class="dact">
          ${u.S.type === 'jammer' ? '' : '<button class="btn" data-a="op">Управлять</button>'}
          ${u.S.radar ? `<button class="btn alt" data-a="emit">${u.emit ? 'РЛС: выключить' : 'РЛС: включить'}</button>` : ''}
          ${u.S.type === 'jammer' ? '' : `<button class="btn alt" data-a="hold">${u.hold ? 'Огонь: свободный' : 'Огонь: по команде'}</button>`}<button class="btn alt" data-a="desel">Снять выбор</button></div>`;
      } else h += '<p class="hint">Коснитесь комплекса: приказы и «Управлять» — сесть оператором. Красные треугольники — цели, которые видит сеть РЛС (высота над землёй, м).</p>';
    } else if (st.phase === 'debrief') {
      const r = st.res;
      h += `<h3>Волна ${st.wave} отбита</h3><div class="stats" style="margin:6px 0"><div class="stt"><b>${r.downs}</b><span>сбито</span></div><div class="stt"><b>${r.leak}</b><span>ушли</span></div>
        <div class="stt"><b>${r.lost}</b><span>потеряно ЗРК</span></div><div class="stt"><b>${Math.round(r.value * 100)}%</b><span>объекты целы</span></div></div>
        <div>+${r.reward} очков обороны · всего очков ${st.score}</div><button class="btn" data-a="next">К расстановке — волна ${st.wave + 1}</button>`;
    }
    side.innerHTML = h;
  }
  side.onclick = (e) => {
    const b = e.target.closest('[data-a]'), buy = e.target.closest('[data-buy]');
    if (buy && st.net) { const k = buy.dataset.buy, lim = netLeft(k); if (samCost(k) > st.budget || (lim !== null && lim <= 0)) { say(lim !== null && lim <= 0 ? 'Лимит первой волны для этого класса' : 'Не хватает очков обороны'); snd.deny(); } else { st.placing = st.placing === k ? null : k; st.sel = null; st.moving = false; snd.click(); } renderSide(); return; }
    if (b && st.net) {
      const u = st.sel, a = b.dataset.a;
      if (a === 'ready') { st.ready = !st.ready; st.net.ready(st.ready); }
      else if (a === 'desel') { st.sel = null; st.moving = false; }
      else if (a === 'move' && u && mine(u)) st.moving = !st.moving;
      else if (a === 'sell' && u && mine(u)) { st.net.sell(u.id); st.sel = null; }
      else if (a === 'emit' && u && mine(u)) C.S.setEmit(u, !u.emit);
      else if (a === 'op' && u && mine(u)) enterOp(u);
      else if (a === 'help') { st.net.help(); say('Союзникам: «Мне нужна помощь!»', 2); }
      snd.click(); renderSide(); return;
    }
    if (buy && st.opts.allow && !st.opts.allow.has(buy.dataset.buy)) { say(`В этом уроке — ${[...st.opts.allow].filter((k) => SAM[k] && SAM[k].side === C.setup.side).map((k) => `«${SAM[k].short}»`).join(' или ')}`, 3); snd.deny(); return; }
    if (buy) { const k = buy.dataset.buy; if (SAM_COST[k] > st.budget) { say('Не хватает очков обороны'); snd.deny(); } else { st.placing = st.placing === k ? null : k; st.sel = null; st.moving = false; snd.click(); } renderSide(); return; }
    if (!b) return;
    const u = st.sel, a = b.dataset.a;
    if (a === 'go') startWave();
    else if (a === 'next') { st.phase = 'plan'; renderSide(); }
    else if (a === 'desel') { st.sel = null; st.moving = false; }
    else if (a === 'move') st.moving = !st.moving;
    else if (a === 'sell' && u) { st.budget += Math.round((u.paid || SAM_COST[u.key]) * 0.7); C.S.removeUnit(u); C.syncUnits(); st.sel = null; }
    else if (a === 'amb' && u) { u.ambush = !u.ambush; u.emit = !u.ambush; }
    else if (a === 'emit' && u) { C.S.setEmit(u, !u.emit); on('radar', u); }
    else if (a === 'hold' && u) u.hold = !u.hold;
    else if (a === 'op' && u) enterOp(u);
    snd.click(); renderSide();
  };

  // ═════════════ Волны ═════════════
  const cityValue = () => C.S.objects.reduce((s, o) => s + (o.dead || o.noTarget ? 0 : o.value * Math.max(0, o.hp / o.hpMax)), 0) / st.value0;
  function startWave() {
    st.phase = 'wave'; st.wave++; st.placing = null; st.moving = false; st.waveDowns = 0; st.waveLeak = 0; st.waveLost = [];
    const alive = C.S.objects.filter((o) => !o.dead && !o.noTarget); // цели волн — только военные объекты
    st.targets = pickTargets({ objects: alive }, st.rnd, st.wave > 3 ? 3 : 2, [...new Set(alive.map((o) => o.key))]);
    if (st.opts.wave) st.opts.wave(C.raid, st.rnd, st.wave, st.targets);
    else C.raid.spawnWave(WAVE_N[Math.min(st.wave, WAVE_N.length) - 1], st.wave, st.targets);
    for (const u of C.S.units) u.cov = null;
    snd.alarm(); say(`Волна ${st.wave}: цели — ${st.targets.map((o) => o.name).join(', ')}`, 4);
    on('waveStart', st.wave); renderSide();
  }
  function endWave() {
    if (st.view === 'op') leaveOp();
    const value = cityValue(), reward = 250 + 60 * st.waveDowns + 120 * st.wave;
    const lost = C.S.units.filter((u) => u.dead);
    for (const u of lost) C.S.removeUnit(u);
    C.syncUnits();
    for (const u of C.S.units) { u.ammo = u.S.ammo; u.reloadT = 0; u.track = null; u.desig = null; } // перезарядка между волнами
    st.budget += reward; st.lostUnits += lost.length;
    st.score += Math.round((st.waveDowns * 150 + value * 300) * (C.setup.diff === 'real' ? 1.5 : 1));
    st.res = { downs: st.waveDowns, leak: st.waveLeak, lost: lost.length, value, reward };
    on('waveEnd', st.wave, st.res);
    if (value <= 0.25) return finish('Потеряно 75 % ценности военных объектов и больше', false);
    if (st.wave >= st.waves) return finish(`Все ${st.waves} волн отбиты`, true);
    st.phase = 'debrief'; st.sel = null; renderSide(); snd.good();
  }
  function finish(why, win) {
    if (st.over) return; st.over = true; st.win = win;
    if (st.view === 'op') leaveOp();
    if (st.opts.noEnd) return;
    C.showEnd({ title: win ? 'Город отстоял' : win === false ? 'Оборона прорвана' : 'Бой завершён', reason: why, win,
      stats: [[st.downs, 'самолётов сбито'], [`${st.wave}/${st.waves}`, 'волн'], [`${Math.round(cityValue() * 100)}%`, 'объекты целы'], [st.score, 'очков']],
      note: `Потеряно комплексов: ${st.lostUnits}. ${C.setup.diff === 'real' ? 'Реализм — очки ×1,5.' : ''}` });
    C.menu.record('defense', st.score, { waves: win ? st.waves : st.wave - 1 });
  }

  // ═════════════ Оператор ═════════════
  const ppi = $('ppi'), pc = ppi.getContext('2d');
  const op = { yaw: 0, pitch: 0.1, fov: 60, dragging: null, msg: '', msgT: 0, follow: true, fireHeld: false,
    cam: 'op', oy: 0, op: 0.3, od: 1, orbit: false, R: 12, m: null, mEnd: 0, mLast: new THREE.Vector3() }; // камеры: оператор / снаружи / за ракетой
  const CAMS = { op: 'вид оператора', ext: 'снаружи — пусковая от третьего лица', chase: 'за ракетой' };
  // у ПЗРК вида снаружи нет (модели стрелка нет): оператор ↔ за ракетой
  const manpads = (u) => !!(u && u.S.type === 'ir' && u.S.hp <= 15);
  function cycleCam() { op.cam = op.cam === 'op' ? (manpads(st.op) ? 'chase' : 'ext') : op.cam === 'ext' ? 'chase' : 'op'; op.orbit = false; op.od = 1; opSay('Камера: ' + CAMS[op.cam]); snd.click(); $('opCam').classList.toggle('on', op.cam !== 'op'); }
  const DIR = V3(), TMP = V3(), LEAD = V3(), EYE = V3();
  function enterOp(u) {
    if (st.op) leaveOp();
    st.op = u; st.view = 'op'; C.S.setManual(u, true); op.camInit = false; obs.clear();
    const t = nearestTarget(u);
    TMP.copy(t ? t.pos : C.S.objects[0] ? new THREE.Vector3(C.S.objects[0].x, 400, C.S.objects[0].z) : TMP.set(0, 400, 0)).sub(u.pos);
    op.yaw = Math.atan2(-TMP.x, -TMP.z); op.pitch = clamp(Math.atan2(TMP.y, Math.hypot(TMP.x, TMP.z)), 0.02, 1.2); op.fov = u.S.hp <= 15 ? 40 : 55; op.follow = true;
    // размер машины (вместе с пусковыми) — для камеры «снаружи»
    const g = C.unitMeshes.get(u.id); op.R = g ? Math.max(4, new THREE.Box3().setFromObject(g).getSize(TMP).length() * 0.5) : 12; op.m = null; op.orbit = false;
    document.body.classList.remove('dmap'); document.body.classList.add('oper');
    $('opMethod').style.display = u.S.type === 'command' ? 'flex' : 'none';
    $('opRadar').style.display = u.S.radar ? 'flex' : 'none';
    $('opFire').textContent = u.S.type === 'guns' ? 'ОГОНЬ' : 'ПУСК';
    on('op', u); snd.click();
  }
  function leaveOp() {
    const u = st.op; if (u) { C.S.setManual(u, false); u.gunFire = false; }
    st.op = null; st.view = 'map'; op.fireHeld = false;
    document.body.classList.remove('oper'); document.body.classList.add('dmap');
    C.setFov(62); renderSide();
  }
  // цели оператора: самолёты (и ложные цели), а у «Тора», «Панциря», PAC-3 — ещё и летящее оружие
  const opT = (u) => (u && u.S.antiMun ? [...C.raid.alive(), ...C.S.wpns.filter((w) => !w.dead && w.t > 1.5 && w.W.kind !== 'decoy')] : C.raid.alive());
  // класс отметки по траектории, скорости и ЭПР: «Аркада» — сразу, «Реализм» — после ~2,5 с наблюдения (до этого «?»).
  // Ложная цель для РЛС — самолёт (в этом её смысл); летящее оружие вообще видят только комплексы с antiMun
  const obs = new Map(); // цель → секунд под наблюдением оператора
  const CLS = { bomb: 'БОМБА', lgb: 'БОМБА', tvb: 'БОМБА', gps: 'БОМБА', agm: 'УР', arm: 'ПРР', cruise: 'КР' };
  const clsOf = (a) => (a.isMun ? CLS[a.W.kind] || 'ОРУЖИЕ' : 'САМОЛЁТ');
  const clsKnown = (a) => C.MODE().markers || (obs.get(a) || 0) > 2.5;
  function nearestTarget(u) { let b = null, bd = 1e12; for (const a of opT(st.op)) { const d = a.pos.distanceToSquared(u.pos); if (d < bd) { bd = d; b = a; } } return b; }
  // кого видит этот комплекс (РЛС — если излучает; иначе глаз/оптика)
  const sees = (u, a) => (u.S.radar && u.emit && C.S.radarSees(u, a)) || C.S.eyesSee(u, a);
  function cycleTarget() {
    const u = st.op; if (!u) return;
    const list = opT(st.op).filter((a) => sees(u, a)).sort((a, b) => a.pos.distanceTo(u.pos) - b.pos.distanceTo(u.pos));
    if (!list.length) { opSay('Нет целей в обзоре'); return; }
    const i = list.indexOf(u.desig); designate(list[(i + 1) % list.length]);
  }
  function designate(a) {
    const u = st.op; if (!u || u.S.type === 'ir' || u.S.type === 'guns') { if (u && a) { aimAt(a); } return; }
    C.S.designate(u, a); op.follow = true; snd.click(); on('designate', u, a);
  }
  function aimAt(a) { TMP.copy(a.pos).sub(st.op.pos); op.yaw = Math.atan2(-TMP.x, -TMP.z); op.pitch = Math.atan2(TMP.y, Math.hypot(TMP.x, TMP.z)); }
  function opSay(t) { op.msg = t; op.msgT = 2.4; }
  function opFire(down) {
    const u = st.op; if (!u) return;
    if (u.S.type === 'guns') { op.fireHeld = down; u.gunFire = down; return; }
    if (!down) return;
    const why = C.S.launch(u);
    if (why) { opSay(why); snd.deny(); } else { opSay('ПУСК!'); on('launch', u); }
  }
  // касание и перетаскивание в 3D-виде: тянуть — поворот, касание отметки цели — назначить
  {
    const d = $('opDrag'); let drag = null;
    d.addEventListener('pointerdown', (e) => { drag = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: 0 }; d.setPointerCapture(e.pointerId); });
    d.addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.moved += Math.abs(dx) + Math.abs(dy); drag.x = e.clientX; drag.y = e.clientY;
      if (drag.moved > 6) {
        if (op.cam !== 'op') { const k = 0.006 * C.sens.look; if (!op.orbit) { op.orbit = true; op.oy = op.camYaw; } op.oy -= dx * k; op.op = clamp(op.op + dy * k, -1.35, 1.3); op.follow = false; return; } // снаружи — облёт камерой (ниже земли не опускается — взгляд поднимается)
        const k = op.fov * D2R / C.VH * C.sens.look; op.yaw += dx * k; op.pitch = clamp(op.pitch + dy * k, -0.15, 1.5); op.follow = false;
      }
    });
    const end = (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      if (drag.moved < 6 && st.op) { // касание: ближайшая отметка цели на экране
        let best = null, bd = 50;
        for (const a of opT(st.op)) { const p = C.proj(a.pos); if (!p) continue; const dd = Math.hypot(p[0] - e.clientX, p[1] - e.clientY); if (dd < bd) { bd = dd; best = a; } }
        if (best) designate(best);
      }
      drag = null;
    };
    d.addEventListener('pointerup', end); d.addEventListener('pointercancel', end);
    d.addEventListener('wheel', (e) => { if (op.cam !== 'op') op.od = clamp(op.od * (e.deltaY > 0 ? 1.15 : 1 / 1.15), 0.4, 4); else op.fov = clamp(op.fov * (e.deltaY > 0 ? 1.15 : 1 / 1.15), 6, 70); e.preventDefault(); }, { passive: false });
    ppi.addEventListener('pointerdown', (e) => { // касание ИКО — ближайшая отметка
      e.stopPropagation(); const u = st.op; if (!u) return;
      const r = ppi.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2, R = ppiRange(u);
      let best = null, bd = 30;
      for (const a of opT(st.op)) {
        if (!sees(u, a)) continue;
        const dx = (a.pos.x - u.pos.x) / R * r.width / 2, dz = (a.pos.z - u.pos.z) / R * r.width / 2, dd = Math.hypot(cx + dx - e.clientX, cy + dz - e.clientY);
        if (dd < bd) { bd = dd; best = a; }
      }
      if (best) designate(best); else opSay('Коснитесь отметки цели');
    });
    const btn = (id, fn) => $(id).addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); fn(); });
    btn('opMap', () => leaveOp());
    btn('opAuto', () => C.setAuto(!C.auto));
    btn('opCam', () => cycleCam());
    btn('opRadar', () => { const u = st.op; if (u && u.S.radar) { C.S.setEmit(u, !u.emit); snd.click(); on('radar', u); } });
    btn('opMethod', () => { const u = st.op; if (u) { u.method = u.method === 'half' ? '3t' : 'half'; snd.click(); opSay(u.method === 'half' ? 'Метод: половинное спрямление' : 'Метод: три точки'); } });
    $('opFire').addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); opFire(true); });
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) $('opFire').addEventListener(ev, () => opFire(false));
  }
  const ppiRange = (u) => (u.S.radar ? Math.min(u.S.radar.range, Math.max(u.S.rmax * 1.6, 8000)) : u.S.optical || 7000);
  function drawPpi(t) {
    const u = st.op, W = ppi.width, c = W / 2, R = ppiRange(u), k = (c - 6) / R;
    pc.clearRect(0, 0, W, W);
    pc.fillStyle = 'rgba(0,22,10,.78)'; pc.beginPath(); pc.arc(c, c, c - 2, 0, 7); pc.fill();
    pc.strokeStyle = 'rgba(120,255,160,.3)'; pc.lineWidth = 2;
    for (let r = 2000; r < R; r += R > 20000 ? 10000 : 2000) { pc.beginPath(); pc.arc(c, c, r * k, 0, 7); pc.stroke(); }
    pc.strokeStyle = 'rgba(253,224,71,.55)'; pc.setLineDash([6, 6]); pc.beginPath(); pc.arc(c, c, u.S.rmax * k, 0, 7); pc.stroke(); pc.setLineDash([]); // зона поражения
    // сектор взгляда
    pc.strokeStyle = 'rgba(255,255,255,.35)'; const a1 = -op.yaw - Math.PI / 2;
    pc.beginPath(); pc.moveTo(c, c); pc.lineTo(c + Math.cos(a1 - op.fov * D2R / 2) * (c - 4), c + Math.sin(a1 - op.fov * D2R / 2) * (c - 4)); pc.moveTo(c, c); pc.lineTo(c + Math.cos(a1 + op.fov * D2R / 2) * (c - 4), c + Math.sin(a1 + op.fov * D2R / 2) * (c - 4)); pc.stroke();
    if (u.S.radar && u.emit) { const sw = t * 2.4; pc.strokeStyle = 'rgba(120,255,160,.75)'; pc.beginPath(); pc.moveTo(c, c); pc.lineTo(c + Math.cos(sw) * (c - 4), c + Math.sin(sw) * (c - 4)); pc.stroke(); }
    for (const a of opT(st.op)) {
      if (!sees(u, a)) continue;
      const x = c + (a.pos.x - u.pos.x) * k, y = c + (a.pos.z - u.pos.z) * k;
      if (Math.hypot(x - c, y - c) > c - 4) continue;
      const mun = a.isMun && clsKnown(a), rr = a === u.desig || a === u.track ? 7 : 5;
      pc.fillStyle = a === u.track ? '#ff4d4d' : a === u.desig ? '#fde047' : mun ? '#fb923c' : '#9fffb8';
      pc.beginPath(); if (mun) { pc.moveTo(x, y - rr); pc.lineTo(x + rr, y); pc.lineTo(x, y + rr); pc.lineTo(x - rr, y); pc.closePath(); } else pc.arc(x, y, a.isMun ? 3.5 : rr, 0, 7); pc.fill(); // оружие — ромбом (пока не опознано — маленькая точка)
      if (a === u.desig && !u.track) { pc.strokeStyle = '#fde047'; pc.lineWidth = 3; pc.beginPath(); pc.arc(x, y, 12, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * clamp(u.seeT / (u.S.radar ? u.S.radar.acq * (C.MODE().reactK || 1) : 2), 0, 1)); pc.stroke(); }
    }
    // помехи: «строб» по пеленгу на самолёт со станцией помех, пока РЛС его не «прожгла»
    if (u.S.radar && u.emit) for (const a of C.raid.alive()) {
      if (!a.jam || sees(u, a) || a.pos.distanceTo(u.pos) > u.S.radar.range * 1.3) continue;
      const ang = Math.atan2(a.pos.z - u.pos.z, a.pos.x - u.pos.x); pc.strokeStyle = 'rgba(120,255,160,.35)'; pc.lineWidth = 6;
      pc.beginPath(); pc.moveTo(c, c); pc.lineTo(c + Math.cos(ang) * (c - 4), c + Math.sin(ang) * (c - 4)); pc.stroke(); pc.lineWidth = 2;
    }
    for (const m of C.S.sams) { if (m.dead || m.unit !== u) continue; pc.fillStyle = '#fff'; pc.fillRect(c + (m.pos.x - u.pos.x) * k - 2, c + (m.pos.z - u.pos.z) * k - 2, 4, 4); }
    pc.fillStyle = '#9fffb8'; pc.beginPath(); pc.arc(c, c, 4, 0, 7); pc.fill();
  }
  function opHud(dt, t) {
    const u = st.op, hx = C.hx, VW = C.VW, VH = C.VH, S = u.S;
    if (u.dead) { opSay('Комплекс уничтожен'); leaveOp(); return; }
    hx.lineWidth = 1.5; hx.font = '600 11px -apple-system, Segoe UI, sans-serif'; hx.textAlign = 'center';
    // перекрестие (в виде оператора и снаружи, когда наводят камерой)
    if (op.cam === 'op' || op.extAim) hx.strokeStyle = 'rgba(255,255,255,.75)'; else hx.strokeStyle = 'rgba(0,0,0,0)'; hx.beginPath(); hx.moveTo(VW / 2 - 22, VH / 2); hx.lineTo(VW / 2 - 6, VH / 2); hx.moveTo(VW / 2 + 6, VH / 2); hx.lineTo(VW / 2 + 22, VH / 2); hx.moveTo(VW / 2, VH / 2 - 22); hx.lineTo(VW / 2, VH / 2 - 6); hx.moveTo(VW / 2, VH / 2 + 6); hx.lineTo(VW / 2, VH / 2 + 22); hx.stroke();
    if (S.type === 'ir' && op.cam === 'op') { hx.strokeStyle = u.track ? '#ff4d4d' : u.seek > 0 ? '#fde047' : 'rgba(255,255,255,.5)'; hx.beginPath(); hx.arc(VW / 2, VH / 2, 3.5 * D2R / (op.fov * D2R) * VH, 0, 7); hx.stroke(); }
    // отметки целей; кучные (ближе 28 пикс. на экране) — одна подпись с числом: «БОМБА ×3»
    const labs = [];
    for (const a of opT(st.op)) {
      const vis = sees(u, a); if (vis) obs.set(a, (obs.get(a) || 0) + dt); if (obs.size > 400) obs.clear();
      const p = C.proj(a.pos); if (!p) continue;
      if (!vis && !C.MODE().markers) continue;
      const known = clsKnown(a), mun = a.isMun && known;
      const col = a === u.track ? '#ff4d4d' : a === u.desig ? '#fde047' : mun ? '#fb923c' : vis ? '#9fffb8' : 'rgba(159,255,184,.4)';
      hx.strokeStyle = col; hx.fillStyle = col;
      const s = a === u.track ? 16 : a.isMun ? 8 : 11; hx.strokeRect(p[0] - s, p[1] - s, s * 2, s * 2);
      if (a === u.track) hx.fillText('ЗАХВАТ', p[0], p[1] - s - 5);
      const name = known ? clsOf(a) : '?', key = a === u.track || a === u.desig; // назначенная — всегда своей подписью
      const g = !key && labs.find((q) => !q.key && q.name === name && Math.hypot(q.x - p[0], q.y - p[1]) < 28);
      if (g) g.n++; else labs.push({ a, name, key, x: p[0], y: p[1], s, col, n: 1 });
    }
    for (const q of labs) { hx.fillStyle = q.col; hx.fillText(`${q.name}${q.n > 1 ? ' ×' + q.n : ''} · ${(q.a.pos.distanceTo(u.pos) / 1000).toFixed(1)} км · ${Math.round(q.a.pos.y - city.groundH(q.a.pos.x, q.a.pos.z))} м`, q.x, q.y + q.s + 12); }
    // пушка: кружок упреждения для цели в секторе ствола
    if (S.type === 'guns' && u.gunTgt) {
      C.S.gunLead(u, u.gunTgt, LEAD); const p = C.proj(LEAD);
      if (p) { hx.strokeStyle = '#fde047'; hx.beginPath(); hx.arc(p[0], p[1], 9, 0, 7); hx.stroke(); hx.beginPath(); hx.arc(p[0], p[1], 1.5, 0, 7); hx.fill(); }
    }
    // свои ракеты
    for (const m of C.S.sams) { if (m.dead || m.unit !== u) continue; const p = C.proj(m.pos); if (p) { hx.fillStyle = '#fff'; hx.beginPath(); hx.arc(p[0], p[1], 3, 0, 7); hx.fill(); } }
    // ПРР летит в этот комплекс — предупреждение
    const arm = C.S.wpns.find((w) => !w.dead && w.W.kind === 'arm' && w.target === u);
    // строка состояния
    const tr = u.track || u.desig, d = tr ? tr.pos.distanceTo(u.pos) : 0, h = tr ? tr.pos.y - city.groundH(tr.pos.x, tr.pos.z) : 0;
    const zone = !tr ? '' : d > S.rmax ? 'ДАЛЕКО' : d < S.rmin ? 'БЛИЗКО' : h > S.hmax ? 'ВЫСОКО' : h < S.hmin ? 'НИЗКО' : 'В ЗОНЕ';
    $('opInfo').innerHTML = `${C.auto ? '<b style="color:#86efac">АВТО</b> · ' : ''}<b>${S.name}</b> · ${SAM_TYPE[S.type]}<br>${unitStatus(u)}${S.type === 'command' ? ` · метод: ${u.method === 'half' ? 'половинное спрямление' : 'три точки'}` : ''}` +
      (tr ? `<br>цель: ${(d / 1000).toFixed(1)} км, ${Math.round(h)} м — <b>${zone}</b>${!u.track && u.desig ? ` · захват ${Math.round(clamp(u.seeT / ((S.radar ? S.radar.acq : 2) * (C.MODE().reactK || 1)), 0, 1) * 100)}%` : ''}` : S.type === 'ir' ? '<br>наведите перекрестие на самолёт — ГСН «зарычит» и захватит' : S.type === 'guns' ? '<br>ведите ствол в жёлтый кружок упреждения и держите «ОГОНЬ»' : '<br>коснитесь отметки цели на экране или на круговом обзоре')
      + (arm ? '<br><span class="st">⚠ ПРР ЛЕТИТ В ВАС — выключите РЛС!</span>' : '') + (op.msgT > 0 ? `<br><span class="st">${op.msg}</span>` : '');
    $('opRadar').textContent = u.emit ? 'РЛС ВКЛ' : 'РЛС ВЫКЛ'; $('opRadar').classList.toggle('off', !u.emit);
    $('opMethod').textContent = u.method === 'half' ? 'МЕТОД ½' : 'МЕТОД 3Т';
    if (arm && !op.armWarned) { op.armWarned = true; snd.alarm(); on('arm', u, arm); } else if (!arm) op.armWarned = false;
    drawPpi(t);
    // звук: тон ГСН у ИК, тон захвата
    if (S.type === 'ir') snd.growl(u.seek ? (u.track ? 0.05 : 0.03) : 0, u.track ? 900 : 420 + u.seek * 200);
    if (u.track !== op.lastTrack) { if (u.track) snd.lock(); op.lastTrack = u.track; }
  }
  // «АВТО» оператора: цель — ближайшая видимая; пуск в зоне (по одной ракете, с задержкой реакции); пушка и ПЗРК — расчёт
  // сам доворачивает прицел с запаздыванием и дрожанием, огонь — когда ствол около точки упреждения
  const AO = { t: 0, launchT: 0 };
  function autoOp(dt) {
    const u = st.op, S = u.S; if (!u || u.dead) return;
    const vis = opT(st.op).filter((a) => sees(u, a) && a.pos.distanceTo(u.pos) < S.rmax * 1.3).sort((a, b) => a.pos.distanceTo(u.pos) - b.pos.distanceTo(u.pos));
    const tgt = vis[0];
    if (S.type === 'guns' || S.type === 'ir') {
      if (!tgt) { if (S.type === 'guns') { u.gunFire = false; op.fireHeld = false; } return; }
      const aimP = S.type === 'guns' ? (C.S.gunLead(u, tgt, LEAD), LEAD) : tgt.pos;
      TMP.copy(aimP).sub(u.pos); const wy = Math.atan2(-TMP.x, -TMP.z), wp = Math.atan2(TMP.y, Math.hypot(TMP.x, TMP.z));
      let dy = wy - op.yaw; while (dy > Math.PI) dy -= 2 * Math.PI; while (dy < -Math.PI) dy += 2 * Math.PI;
      const rate = 1.4 * dt, jit = 0.004 * Math.sin(C.t * 7.3);
      op.yaw += clamp(dy, -rate, rate) + jit; op.pitch += clamp(wp - op.pitch, -rate, rate) + jit * 0.7; op.follow = false;
      const err = Math.hypot(dy, wp - op.pitch);
      if (S.type === 'guns') { const fire = err < 0.02 && tgt.pos.distanceTo(u.pos) < S.rmax * 0.95; u.gunFire = fire; op.fireHeld = fire; }
      else if (u.track && (AO.launchT += dt) > 0.5) { if (!C.S.launch(u)) on('launch', u); AO.launchT = 0; }
      return;
    }
    if (tgt && (!u.desig || u.desig.dead || !vis.includes(u.desig))) designate(tgt);
    if (u.track) {
      const inAir = C.S.sams.filter((m) => !m.dead && m.unit === u && m.target === u.track).length;
      if (inAir < 1 && (AO.launchT += dt) > 0.6) { const why = C.S.launch(u); if (!why) { opSay('АВТО: пуск'); on('launch', u); } AO.launchT = why ? 0.3 : 0; }
    } else AO.launchT = 0;
  }
  function opCamera(dt) {
    const u = st.op;
    // радарные: камера ведёт сопровождаемую цель, пока игрок сам не повернул
    const t = u.track || (u.S.type === 'guns' ? u.gunTgt : null);
    if (op.follow && t && u.S.type !== 'guns') {
      TMP.copy(t.pos).sub(u.pos); const wy = Math.atan2(-TMP.x, -TMP.z), wp = Math.atan2(TMP.y, Math.hypot(TMP.x, TMP.z));
      let dy = wy - op.yaw; while (dy > Math.PI) dy -= 2 * Math.PI; while (dy < -Math.PI) dy += 2 * Math.PI;
      op.yaw += dy * Math.min(1, dt * 4); op.pitch += (wp - op.pitch) * Math.min(1, dt * 4);
    }
    const keys = op.keys || new Set(), r = op.fov * D2R * 0.9 * dt * C.sens.look;
    if (keys.has('ArrowLeft') || keys.has('KeyA')) { op.yaw += r; op.follow = false; } if (keys.has('ArrowRight') || keys.has('KeyD')) { op.yaw -= r; op.follow = false; }
    if (keys.has('ArrowUp') || keys.has('KeyW')) { op.pitch = clamp(op.pitch + r, -0.15, 1.5); op.follow = false; } if (keys.has('ArrowDown') || keys.has('KeyS')) { op.pitch = clamp(op.pitch - r, -0.15, 1.5); op.follow = false; }
    DIR.set(-Math.sin(op.yaw) * Math.cos(op.pitch), Math.sin(op.pitch), -Math.cos(op.yaw) * Math.cos(op.pitch));
    u.aimDir.copy(DIR);
    EYE.copy(u.pos); EYE.y += u.S.hp <= 15 ? 1.7 : 3.2;
    if (op.cam !== 'op') { extCamera(dt, u); return; }
    camera.position.copy(EYE); camera.up.set(0, 1, 0); camera.lookAt(TMP.copy(EYE).add(DIR));
    C.setFov(op.fov);
  }
  // ── камера «снаружи»: машина от третьего лица на ¾ сзади (по направлению на цель), видно, как разворачивается пусковая
  // и уходит ракета — выброс, запуск двигателя, разворот на цель; «за ракетой» — после старта камера летит за своей ракетой
  // до подрыва и пару секунд смотрит на разрыв. Тянуть по экрану — облёт, колесо — ближе/дальше.
  const CP = V3(), CL = V3(), CS = V3(), LS = V3(), OFF = V3();
  function extCamera(dt, u) {
    C.setFov(58);
    // своя ракета в полёте — самая свежая
    let m = null; for (const q of C.S.sams) if (!q.dead && q.unit === u && (!m || q.id > m.id)) m = q;
    if (m) { op.m = m; op.mLast.copy(m.pos); } else if (op.m) { op.mEnd = op.mEnd || C.t; if (C.t - op.mEnd > 2.5) { op.m = null; op.mEnd = 0; } }
    const R = op.R * op.od, base = CL.copy(u.pos); base.y += op.R * 0.25;
    const chase = op.cam === 'chase' && op.m;
    let follow = null;
    if (chase && !op.m.dead && op.m.t > (op.m.ign || 0) + 1.6) {
      // за ракетой: сзади-сверху, взгляд — на цель (или вперёд по курсу)
      const mm = op.m, back = mm.M.L * 3 + 14;
      CP.copy(mm.pos).addScaledVector(mm.dir, -back); CP.y += mm.M.L * 0.5 + 3;
      LS.copy(mm.target && !mm.target.dead ? mm.target.pos : TMP.copy(mm.pos).addScaledVector(mm.dir, 300));
      LS.lerp(TMP.copy(mm.pos).addScaledVector(mm.dir, 60), 0.6);
      follow = mm;
    } else if (chase && op.m.dead) {
      // подрыв: камера остановилась, смотрит на место разрыва
      CP.copy(camera.position); LS.copy(op.mLast);
    } else if (manpads(u)) {
      // ПЗРК: своей ракеты в воздухе нет — вид стрелка
      CP.copy(EYE); LS.copy(EYE).add(DIR);
    } else {
      // облёт вокруг машины: по умолчанию — на ¾ сзади относительно направления на цель
      const tgt = u.track || u.desig;
      const brg = tgt ? Math.atan2(-(tgt.pos.x - u.pos.x), -(tgt.pos.z - u.pos.z)) : op.yaw;
      op.camYaw = op.orbit ? op.oy : brg + 0.55;
      // угол камеры ниже 0,04 рад — камера остаётся над землёй, а взгляд поднимается вверх (можно смотреть в зенит)
      const el = op.orbit ? op.op : 0.28, elC = Math.max(el, 0.04), up = Math.max(0, 0.04 - el), dist = R * 1.7 + 6;
      CP.set(u.pos.x + Math.sin(op.camYaw) * Math.cos(elC) * dist, u.pos.y + Math.sin(elC) * dist + 2, u.pos.z + Math.cos(op.camYaw) * Math.cos(elC) * dist);
      // взгляд: на машину, чуть в сторону цели; ракета на старте — камера провожает её вверх
      LS.copy(base).addScaledVector(TMP.set(-Math.sin(brg), 0, -Math.cos(brg)), op.orbit ? 0 : R * 0.5);
      if (up > 0) { const dx = LS.x - CP.x, dz = LS.z - CP.z, h = Math.hypot(dx, dz) || 1, L = Math.max(30, LS.distanceTo(CP)), p = Math.min(1.45, Math.atan2(LS.y - CP.y, h) + up);
        LS.set(CP.x + dx / h * Math.cos(p) * L, CP.y + Math.sin(p) * L, CP.z + dz / h * Math.cos(p) * L); }
      if (op.m && !op.m.dead && op.m.t < 5) LS.lerp(op.m.pos, clamp(op.m.t / 3, 0, 0.75));
      op.extAim = op.orbit; // облёт рукой — наведение по камере (перекрестие в центре экрана)
    }
    CP.y = Math.max(CP.y, city.topAt(CP.x, CP.z) + 2);
    const first = !op.camInit; op.camInit = true;
    if (follow) {
      // за ракетой сглаживаем смещение относительно неё (иначе камера отстаёт на сотни метров)
      if (op.fol !== follow) { op.fol = follow; OFF.copy(camera.position).sub(follow.pos); if (OFF.length() > 400) OFF.setLength(400); }
      OFF.lerp(TMP.copy(CP).sub(follow.pos), 1 - Math.exp(-dt * 2.5)); camera.position.copy(follow.pos).add(OFF);
      CS.lerp(LS, 1 - Math.exp(-dt * 6)); camera.up.set(0, 1, 0); camera.lookAt(CS); return;
    }
    op.fol = null;
    if (first || camera.position.distanceTo(CP) > 600) { camera.position.copy(CP); CS.copy(LS); }
    else { camera.position.lerp(CP, 1 - Math.exp(-dt * (chase ? 8 : 4))); CS.lerp(LS, 1 - Math.exp(-dt * 6)); }
    camera.up.set(0, 1, 0); camera.lookAt(CS);
    // наведение «от третьего лица»: ствол / пусковая — по направлению камеры (через центр экрана)
    if (op.extAim && !chase && !manpads(u)) { camera.getWorldDirection(TMP); op.yaw = Math.atan2(-TMP.x, -TMP.z); op.pitch = clamp(Math.asin(clamp(TMP.y, -1, 1)), -0.15, 1.5); }
  }

  // ═════════════ Режим ═════════════
  function start(opts = {}) {
    st.opts = opts; C.ended = false; C.lastGame = opts.lastGame || 'defense';
    st.rnd = mulberry32((Date.now() & 0xffffff) ^ 0x2468);
    C.newBattle({ defSide: C.setup.side, era: C.setup.era, rnd: st.rnd });
    C.hooks = {
      aiDmgK: C.setup.diff === 'arcade' ? 1.25 : 1,
      planeDown(a) { if (a.role === 'decoy') { say('Сбита ложная цель — ракеты потрачены впустую', 2); return; } st.downs++; st.waveDowns++; say(`Сбит ${a.role === 'sead' ? 'охотник за РЛС' : 'ударник'}!`, 2); snd.good(); on('planeDown', a); },
      wpnEnd(w, res) { if (res.intercepted) say(`Перехвачено: ${w.W.short}`, 2); },
      planeOut(a) { st.leaked++; st.waveLeak++; },
      objectDestroyed(o) { say(`Разрушен: ${o.name}`, 3); snd.alarm(); },
      unitDestroyed(u) { say(`Потерян комплекс: ${u.S.short}`, 3); },
      wpnRelease(w) { if (w.W.kind === 'arm' && w.target) on('armLaunch', w); },
    };
    Object.assign(st, { phase: 'plan', wave: 0, waves: opts.waves || WAVES, budget: opts.budget ?? (C.setup.diff === 'arcade' ? 1200 : 1000), score: 0, downs: 0, leaked: 0, lostUnits: 0, placing: null, sel: null, moving: false, view: 'map', op: null, over: false, win: null, targets: [] });
    st.value0 = C.S.objects.reduce((s, o) => s + (o.noTarget ? 0 : o.value), 0);
    for (const [k, x, z, roof] of opts.units || []) { const u = C.S.addUnit(k, x, z, { roof, skill: 0.75 }); u.paid = SAM_COST[k]; }
    C.syncUnits(); seen.clear();
    document.body.classList.add('defense', 'dmap');
    sizeMap(); fit();
    if (opts.focus) { view.cx = opts.focus[0]; view.cz = opts.focus[1]; view.k = opts.focus[2] || 0.12; }
    renderSide();
    if (opts.plan === false) startWave();
    if (opts.op !== undefined && C.S.units[opts.op]) enterOp(C.S.units[opts.op]);
  }
  // ═════════════ Онлайн ═════════════
  // зеркало боя уже собрано (net.js); фазы, бюджет и «Готов» — от сервера (netSync на каждое обновление комнаты)
  function startNet(N) {
    st.net = N; st.opts = { noEnd: true }; C.ended = false; C.lastGame = 'online';
    C.hooks = {
      planeDown(a) { if (a.role === 'decoy') { say('Сбита ложная цель', 2); return; } say('Самолёт сбит!', 2); snd.good(); },
      wpnEnd(w, res) { if (res.intercepted) say(`Перехвачено: ${w.W.short}`, 2); },
      objectDestroyed(o) { say(`Разрушен: ${o.name}`, 3); snd.alarm(); },
      unitDestroyed(u) { say(`Потерян комплекс: ${u.S.short}`, 3); },
    };
    Object.assign(st, { phase: 'plan', wave: N.battle.wave || 1, waves: N.battle.waves, budget: 0, score: 0, downs: 0, leaked: 0, lostUnits: 0, placing: null, sel: null, moving: false, view: 'map', op: null, over: false, ready: false, netRes: null });
    st.targets = N.battle.targets.map((id) => C.S.objects.find((o) => o.id === id)).filter(Boolean);
    st.value0 = st.targets.reduce((s, o) => s + o.value, 0) || 1;
    C.syncUnits(); seen.clear();
    document.body.classList.add('defense', 'dmap');
    sizeMap(); fit(); netSync();
  }
  function netSync() {
    const N = st.net; if (!N) return;
    const p = N.myPlayer(), s = N.room ? N.room.state : null;
    st.budget = p ? p.budget || 0 : 0; st.ready = !!(p && p.ready); st.wave = N.battle ? N.battle.wave || st.wave : st.wave;
    const ph = s === 'plan' ? 'plan' : s === 'play' ? 'wave' : s === 'debrief' ? 'debrief' : st.phase;
    if (ph !== st.phase) {
      if (st.view === 'op' && ph !== 'wave') leaveOp();
      st.phase = ph; st.placing = null; st.moving = false;
      if (ph === 'wave') { snd.alarm(); say(`Волна ${st.wave}: налёт!`, 3); }
      for (const u of C.S.units) u.cov = null;
    }
    if (st.view === 'map') renderSide();
  }
  function stop() {
    if (st.op) leaveOp();
    st.net = null;
    for (const c of ['defense', 'dmap', 'oper']) document.body.classList.remove(c);
    side.innerHTML = ''; $('dtop').innerHTML = ''; snd.growl(0, 400);
  }
  let sideT = 0;
  function update(dt) {
    if (st.msgT > 0) st.msgT -= dt; if (op.msgT > 0) op.msgT -= dt;
    if (st.phase !== 'wave' || st.over) return;
    // сеть ПВО: кого видит хоть одна РЛС или расчёт
    for (const a of C.raid.alive()) for (const u of C.S.units) { if (!u.dead && ((u.S.radar && u.emit && u.track === a) || (u.S.radar && u.emit && a.pos.distanceTo(u.pos) < u.S.radar.range && C.S.radarSees(u, a)) || (!u.S.radar && C.S.eyesSee(u, a)))) { seen.set(a, C.t); break; } }
    if (st.op && st.op.S.type === 'guns') st.op.gunFire = op.fireHeld || (op.keys && op.keys.has('Space'));
    if (st.op && C.auto) autoOp(dt);
    const busy = C.raid.planes.some((a) => !a.dead && !a.out) || C.S.wpns.length > 0;
    if (!busy && !st.net && !st.opts.hold) endWave(); // онлайн: конец волны решает сервер; уроки (hold) — сами подают цели
    if (st.opts.onTick) st.opts.onTick(dt);
    if ((sideT -= dt) <= 0) { sideT = 0.5; if (st.view === 'map') renderSide(); }
  }
  function hud(dt, t) {
    if (st.net) { const N = st.net, left = N.room && N.room.left !== null ? ` · ${N.room.left} с` : '';
      $('dtop').innerHTML = st.phase === 'plan' ? `Расстановка · волна ${st.wave}/${st.waves}${left} · очки <b>${st.budget}</b>` : `Волна <b>${st.wave}/${st.waves}</b>${left} · объекты целы <b>${Math.round((1 - ((N.battle && N.battle.valueK) || 0)) * 100)}%</b>`; }
    else $('dtop').innerHTML = st.phase === 'plan' ? `Расстановка · очки обороны <b>${st.budget}</b>` :
      `Волна <b>${st.wave}/${st.waves}</b> · сбито <b>${st.downs}</b> · объекты целы <b>${Math.round(cityValue() * 100)}%</b> · очки ${st.score}`;
    if (st.view === 'op' && st.op) opHud(dt, t); else drawMap(t);
  }
  function onKey(e, down) {
    if (st.view !== 'op') { if (down && e.code === 'Space' && st.phase === 'plan') { if (st.net) { st.ready = !st.ready; st.net.ready(st.ready); renderSide(); } else startWave(); } return; }
    op.keys = op.keys || new Set();
    if (!down) { op.keys.delete(e.code); if (e.code === 'Space' || e.code === 'KeyF') opFire(false); return; }
    if (e.repeat) return;
    op.keys.add(e.code);
    if (e.code === 'Space' || e.code === 'KeyF') { opFire(true); e.preventDefault(); }
    else if (e.code === 'KeyE' && st.op.S.radar) { C.S.setEmit(st.op, !st.op.emit); snd.click(); on('radar', st.op); }
    else if (e.code === 'Tab') { cycleTarget(); e.preventDefault(); }
    else if (e.code === 'KeyM' && st.op.S.type === 'command') st.op.method = st.op.method === 'half' ? '3t' : 'half';
    else if (e.code === 'KeyQ' || e.code === 'Backspace') leaveOp();
    else if (e.code === 'KeyT') C.setAuto(!C.auto);
    else if (e.code === 'KeyV') cycleCam();
    else if (e.code === 'KeyZ') op.fov = op.fov > 30 ? 20 : op.fov > 12 ? 8 : 55;
  }
  const api = {
    st, sim: true, start, stop, update, hud, onKey, enterOp, leaveOp, startWave, designate, renderSide, startNet, netSync,
    setNetRes(r) { st.netRes = r; renderSide(); },
    camera(dt) { if (st.view === 'op' && st.op) opCamera(dt); else { camera.position.set(view.cx, 9000, view.cz + 1); camera.lookAt(view.cx, 0, view.cz); } },
    focus: () => (st.op ? st.op.pos : camera.position),
    skip3D: () => st.view !== 'op',
    resize() { sizeMap(); },
    finish: (why) => finish(why, null),
    pauseHelp: () => (IS_TOUCH ? 'Карта: тянуть — сдвиг, щипок — масштаб, касание — выбор. Оператор: тянуть — поворот, касание отметки или ИКО — назначить цель. «КАМ.» — вид снаружи и за ракетой (тянуть — облёт).'
      : 'Карта: тянуть — сдвиг, колесо — масштаб, щелчок — выбор и постановка, Пробел — начать волну.<br>Оператор: тянуть мышью или стрелки/WASD — поворот, колесо или Z — увеличение, щелчок по отметке — цель, Tab — следующая цель,<br>Пробел/F — пуск (у пушек — держать), E — РЛС, M — метод, V — камера (оператор / снаружи / за ракетой), Q — на карту, Esc — пауза.'),
  };
  return api;
}
