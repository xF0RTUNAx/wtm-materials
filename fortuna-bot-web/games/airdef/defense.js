// «Оборона города» — игра за ПВО. Перед волной — расстановка комплексов на тактической карте за очки обороны
// (зоны поражения с «тенями» от зданий на высоте 300 м), волна ИИ-ударников (sim/raid.js), между волнами — итоги,
// докупка, переезд, продажа. Командир видит то, что видит сеть РЛС, и отдаёт приказы; в любой комплекс можно «сесть»
// оператором: круговой обзор (ИКО), назначение цели касанием, захват за реальное время станции, пуск, РЛС вкл/выкл,
// метод наведения; пушки — прицел с упреждением и огонь удержанием; ПЗРК — перекрестие и тон захвата ГСН.
// Отдельный режим «Мульти-волна» (start({ multi: 'def' | 'atk' })): за ПВО — расстановка под одну волну ракет, дронов и
// баллистики; за удар — состав удара за очки угрозы, цели, время прихода и доля по ПВО на карте, затем — смотреть удар
// (камера за ракетой, ускорение времени), ПВО — ИИ. Пуск баллистики объявляется (как от системы предупреждения о пуске).
// start(opts) — для обучения: { budget, waves, units: [[ключ, x, z, roof]], op: индекс комплекса, plan: false, wave(raid, rnd, n),
//   noEnd, hold (волна не кончается сама — урок подаёт цели), onTick(dt), on: { place, waveStart, waveEnd, designate, track, launch, planeDown, arm, radar } }.
/* global THREE */
import { tr, trIf } from './i18n.js?v=20261027b';
import { trFmt } from './i18n-fmt.js?v=20261027b';
import { CITY, mulberry32 } from './city.js?v=20261027b';
import { weaponHasModel } from './models.js?v=20261027b';
import { LNCH, lnchToWorld } from './launchers.js?v=20261027b';
import { ico, iconize, capsHtml, tgtRowHtml, tgtLabel, tgtChoices } from './icons.js?v=20261027b';
import { SAM, SAM_COST, SAM_TYPE, AG, MULTI, CARRIERS, THREAT, COMBINED, DEFENSE, multiBudget, multiItems, threatOf } from './arsenal.js?v=20261027b';
import { samClass, samCost, samCostFor, LIMIT1 } from './sim/online.js?v=20261027b';
import { TEAM_NAME, TBM_RULE, TBM_EXCL, tbmOf, tbmCheck, sumN } from './sim/online-multi.js?v=20261027b';
const esc = (x) => String(x ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
import { clamp, D2R, angleBetween, fwdOf } from '../drone/sim/core.js?v=20261027b';
import { TGT_CATS } from './sim/strike.js?v=20261027b';
import { freeGround, buildingAt, roofOk, pickTargets, placeDefense } from './mission.js?v=20261027b';
import { createCombined, combinedOk, COMBINED_NAME, levelIn, levelOfPlan, levelOfSams, samKnown, planDefaults, unitCfg, carrierOf, CARRIER_WAIT, LAUNCH_R, LIM_ON } from './sim/combined.js?v=20261027b';

export const WAVES = 6;
const WAVE_N = [3, 4, 6, 7, 9, 11];

export function createDefense(C) {
  const { $, city, camera, snd, IS_TOUCH } = C;
  C.WAVES = WAVES;
  const V3 = () => new THREE.Vector3();
  const st = { phase: 'plan', wave: 0, waves: WAVES, budget: 0, score: 0, value0: 1, downs: 0, leaked: 0, lostUnits: 0, placing: null, draft: null, sel: null, moving: false,
    view: 'map', op: null, opts: {}, waveDowns: 0, waveLeak: 0, waveLost: [], over: false, rnd: Math.random, msg: '', msgT: 0, net: null, ready: false,
    multi: null, defSide: null, plan: null, flash: new Map(), watch: null, timeK: 1, mres: null, cue: null, watchNextAt: null, edKey: null };
  const dside = () => st.defSide || C.setup.side; // сторона ПВО (в «Мульти-волне» за удар — противник)
  const attSide = () => (dside() === 'east' ? 'west' : 'east');
  const atk = () => st.multi === 'atk';
  // цена комплекса: в онлайне ведущая ПВО платит за дальние больше (sim/online.js LEAD_K)
  const costOf = (k) => (st.net ? samCostFor(k, st.net.room && st.net.room.lead) : samCost(k));
  // прокачка: в «Реализме» (одиночном и онлайн) — только купленное в «Исследованиях»; аркада и уроки — всё
  const realMode = () => !(st.opts || {}).allow && !(st.opts || {}).items && (st.net ? !!(st.net.room && st.net.room.mode === 'real') : C.setup.diff === 'real');
  const lockedSam = (k) => realMode() && C.progress && C.progress.ready() && !C.progress.samOk(k);
  const lockedStrike = (k) => realMode() && C.progress && C.progress.ready() && !C.progress.strikeOk(k);
  const LOCK_SAY = tr('В «Реализме» — только купленное в «Исследованиях»');
  // скрытый уровень ИИ в «Мульти-волне» (правила — sim/combined.js): уроки держат эпоху урока; иначе ИИ-ПВО выбирается по плану игрока-атакующего,
  // ИИ-волна — по комплексам, доступным игроку-ПВО (в «Реализме» купленным); игроку уровень не показывается
  const lesson = () => (st.opts || {}).lastGame === 'training';
  const aiDefLevel = () => levelIn(DEFENSE[dside()], lesson() ? C.setup.era : levelOfPlan(attSide(), st.plan ? st.plan.n : {}));
  const aiWaveLevel = () => levelIn(COMBINED[attSide()], lesson() ? C.setup.era : levelOfSams(dside(), Object.keys(SAM).filter((k) => !lockedSam(k))));
  const aiComp = () => COMBINED[attSide()][aiWaveLevel()] || [];
  function placeAiDef() { const p = st.aiPlace; if (!p) return; st.aiPlace = null; placeDefense(C.S, city, st.rnd, dside(), aiDefLevel(), p.near, p.kn ? p.kn.density : 1, p.kn || {}); C.syncUnits(); }
  const seen = new Map(); // самолёт → время, когда его последний раз видела сеть ПВО
  const tm = $('tmap'), tx = tm.getContext('2d');
  const view = { cx: 500, cz: -300, k: 0.05 }; // центр карты (м) и масштаб (px на м)
  const say = (t, s = 2.6) => { st.msg = t; st.msgT = s; };
  const on = (k, ...a) => { const f = st.opts.on && st.opts.on[k]; if (f) f(...a); };

  // ═════════════ Тактическая карта ═════════════
  const w2s = (x, z) => [C.VW / 2 + (x - view.cx) * view.k, C.VH / 2 + (z - view.cz) * view.k];
  const s2w = (px, py) => [view.cx + (px - C.VW / 2) / view.k, view.cz + (py - C.VH / 2) / view.k];
  function fit() { view.cx = 500; view.cz = -300; view.k = Math.max(60, Math.min(C.VW - (IS_TOUCH ? 250 : 300), C.VH)) / 22000; } // узкое окно — не меньше 60 px
  // присваивание размера очищает холст — только если размер правда другой (иначе динамическое разрешение 3D-кадра «моргало» картой)
  function sizeMap() { const k = Math.min(2, devicePixelRatio || 1), w = Math.round(C.VW * k), h = Math.round(C.VH * k); if (tm.width !== w || tm.height !== h) { tm.width = w; tm.height = h; } }
  // «тень» зоны: на высоте 300 м над землёй по 72 направлениям — докуда антенна (или глаз расчёта) видит без перерыва
  // (для ещё не поставленного — covAt: место размещения или переноса; n направлений, m шагов по дальности)
  function covAt(S, x0, z0, eye, n = 72, m = 40) {
    const R = S.rmax, pts = [], h = 300;
    for (let i = 0; i < n; i++) {
      const a = i / n * Math.PI * 2, dx = Math.sin(a), dz = Math.cos(a);
      let d = R;
      for (let s = 1; s <= m; s++) {
        const r = R * s / m, x = x0 + dx * r, z = z0 + dz * r, y = city.groundH(x, z) + Math.min(h, S.hmax);
        if (!city.los(eye.x, eye.y, eye.z, x, y, z, 15)) { d = R * (s - 1) / m; break; }
      }
      pts.push([x0 + dx * Math.max(d, S.rmin), z0 + dz * Math.max(d, S.rmin)]);
    }
    return pts;
  }
  function coverage(u) { u.cov = covAt(u.S, u.pos.x, u.pos.z, u.ant); }
  // антенна (или глаз расчёта) на месте x, z — как у addUnit: земля или крыша + мачта
  const eyeAt = (S, x, z, roof) => ({ x, z, y: (roof ? city.topAt(x, z) : city.groundH(x, z)) + (S.radar ? S.radar.mast : 2) });
  function drawCov(pts, fill, stroke) { tx.fillStyle = fill; tx.strokeStyle = stroke; tx.lineWidth = 1.5; tx.beginPath(); pts.forEach(([x, z], i) => { const [a, b] = w2s(x, z); if (i) tx.lineTo(a, b); else tx.moveTo(a, b); }); tx.closePath(); tx.fill(); tx.stroke(); }
  // мышь (ПК) в размещении и переносе: тень зоны — под курсором, грубее и не чаще ~7 раз в секунду
  const hov = { x: 1e9, z: 1e9, t: 0, cov: null, ok: false };
  const unitColor = (u) => (u.dead ? '#555' : u.track ? (C.S.sams.some((m) => !m.dead && m.unit === u) || u.gunOn ? '#ff4d4d' : '#fde047') : u.S.radar && u.emit ? '#4ade80' : u.S.radar ? '#94a3b8' : '#86efac');
  function drawMap(t) {
    navStep();
    const k = Math.min(2, devicePixelRatio || 1); tx.setTransform(k, 0, 0, k, 0, 0);
    tx.fillStyle = '#10140f'; tx.fillRect(0, 0, C.VW, C.VH);
    const base = C.menu.mapBase(1600), [x0, y0] = w2s(-CITY.HALF, -CITY.HALF), sz = 2 * CITY.HALF * view.k;
    tx.globalAlpha = 0.85; tx.drawImage(base, x0, y0, sz, sz); tx.globalAlpha = 1;
    tx.font = '600 11px "Golos Text", -apple-system, Segoe UI, sans-serif'; tx.textAlign = 'center';
    // объекты города с прочностью
    for (const o of C.S.objects) {
      if (o.key === 'bridge' && view.k < 0.06 && !st.targets?.includes(o)) continue;
      const [px, py] = w2s(o.x, o.z), tgt = st.targets && st.targets.includes(o) && (st.phase === 'wave' || atk());
      tx.fillStyle = o.dead ? '#444' : tgt ? '#f87171' : '#fbbf24';
      tx.beginPath(); tx.moveTo(px, py - 6); tx.lineTo(px + 6, py); tx.lineTo(px, py + 6); tx.lineTo(px - 6, py); tx.closePath(); tx.fill();
      tx.fillStyle = 'rgba(0,0,0,.5)'; tx.fillRect(px - 16, py + 8, 32, 4); tx.fillStyle = o.dead ? '#444' : '#4ade80'; tx.fillRect(px - 16, py + 8, 32 * Math.max(0, o.hp / o.hpMax), 4);
      if (view.k > 0.045 || (atk() && st.phase === 'plan' && !o.noTarget)) { tx.fillStyle = '#fff'; tx.strokeStyle = 'rgba(0,0,0,.75)'; tx.lineWidth = 3; tx.strokeText(o.name, px, py - 9); tx.fillText(o.name, px, py - 9); }
    }
    // зоны: выбранный комплекс — тень зоны, у остальных — тонкий круг
    const arcade = C.MODE().markers;
    if (atk()) { drawAlloc(); drawRoutes(); drawEnemy(); drawOwn(); drawMsg(); return; }
    for (const u of C.S.units) {
      if (u.dead) continue;
      const [px, py] = w2s(u.pos.x, u.pos.z);
      if (u === st.sel) {
        if (!u.cov) coverage(u);
        const was = st.moving && st.phase === 'plan' && (st.draft || ptr.over); // перенос: нынешняя зона — серой, новая — зелёной
        drawCov(u.cov, was ? 'rgba(148,163,184,.08)' : 'rgba(74,222,128,.13)', was ? 'rgba(148,163,184,.55)' : 'rgba(74,222,128,.75)');
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
      if (st.net && !mine(u) && !u.dead) { // союзник: его комплексы — голубой ободок, тот, за пультом которого он сейчас, — пульсирует с именем
        const al = allyName(u.owner);
        if (u.manual) { const a = 0.55 + 0.45 * Math.sin(performance.now() / 220); tx.strokeStyle = `rgba(56,189,248,${a})`; tx.lineWidth = 3; tx.beginPath(); tx.arc(px, py, 16, 0, 7); tx.stroke(); tx.fillStyle = '#7dd3fc'; tx.fillText(tr('{0} — за пультом', [al]), px, py - 20); }
        else { tx.strokeStyle = 'rgba(56,189,248,.55)'; tx.lineWidth = 1.5; tx.beginPath(); tx.arc(px, py, 12, 0, 7); tx.stroke(); }
      }
      tx.fillStyle = '#e2e8f0'; tx.fillText(u.S.rwr || u.S.short, px, py + 18);
      if (u.reloadT > 0) { tx.fillStyle = '#fdba74'; tx.fillText(tr('{0}с', [Math.ceil(u.reloadT)]), px + 18, py - 4); }
    }
    // цели, которые видит сеть ПВО (Аркада — все)
    if (C.raid) for (const a of C.raid.planes) {
      if (a.dead || a.out || a.phase === 'wait') continue;
      const ts = seen.get(a); if (!arcade && (!ts || C.t - ts > 4)) continue;
      const [px, py] = w2s(a.pos.x, a.pos.z), stale = !arcade && C.t - ts > 1;
      tx.save(); tx.translate(px, py); tx.rotate(-a.yaw); tx.fillStyle = stale ? 'rgba(248,113,113,.5)' : '#f87171';
      tx.beginPath(); tx.moveTo(0, -9); tx.lineTo(6, 7); tx.lineTo(-6, 7); tx.closePath(); tx.fill(); tx.restore();
      tx.fillStyle = '#fecaca'; tx.fillText(`${Math.round((a.pos.y - city.groundH(a.pos.x, a.pos.z)) / 10) * 10}`, px, py - 12);
    }
    // онлайн: «нужна помощь» союзников — метка на карте (8 с)
    if (st.net && C.netHelps && C.drawWarn) for (const h of C.netHelps()) { if (!h.p) continue; const [hx, hy] = w2s(h.p[0], h.p[1]); C.drawWarn(tx, hx, hy, 12); tx.fillStyle = '#fde047'; tx.strokeStyle = 'rgba(0,0,0,.8)'; tx.lineWidth = 3; tx.font = '700 11px "Golos Text", -apple-system, Segoe UI, sans-serif'; tx.strokeText(tr('{0}: помощь', [h.name]), hx, hy - 18); tx.fillText(tr('{0}: помощь', [h.name]), hx, hy - 18); } // союзник просит помощи — знак у места
    tx.font = '600 11px "Golos Text", -apple-system, Segoe UI, sans-serif';
    // ракеты: свои — белые, чужое оружие — оранжевое
    for (const m of C.S.sams) { if (m.dead) continue; const [px, py] = w2s(m.pos.x, m.pos.z); tx.fillStyle = '#fff'; tx.fillRect(px - 1.5, py - 1.5, 3, 3); }
    for (const w of C.S.wpns) {
      if (w.dead) continue;
      // удар: в реализме на карте — только то, что видит сеть РЛС (ложные цели неотличимы); баллистика — ромб, дрон — точка.
      // Баллистику ведёт система предупреждения о ракетном нападении — видна весь полёт, с районом падения
      if (w.ev && w.W.kind === 'tbm') { drawTbm(w, arcade); continue; }
      if (w.ev && !arcade) { const ts = seen.get(w); if (!ts || C.t - ts > 3) continue; }
      const [px, py] = w2s(w.pos.x, w.pos.z);
      tx.fillStyle = w.W.recon ? '#93c5fd' : w.W.uav ? '#fde047' : w.W.kind === 'arm' ? '#f472b6' : w.W.kind === 'cruise' ? '#facc15' : w.intercepted ? '#888' : '#fb923c';
      const r = w.W.uav ? 1.5 : 2; tx.fillRect(px - r, py - r, r * 2, r * 2);
    }
    // постановка: «призрак» под пальцем
    if ((st.placing || st.moving) && ptr.over) {
      const S = st.placing ? SAM[st.placing] : st.sel.S, [wx, wz] = s2w(ptr.x, ptr.y), ok = placeOk(S, wx, wz);
      const now = performance.now();
      if (Math.hypot(wx - hov.x, wz - hov.z) * view.k > 4 && now - hov.t > 140) { hov.x = wx; hov.z = wz; hov.t = now; hov.ok = ok; hov.cov = ok ? covAt(S, wx, wz, eyeAt(S, wx, wz, buildingAt(city, wx, wz) >= 0), 48, 28) : null; }
      if (hov.cov && hov.ok) drawCov(hov.cov, 'rgba(74,222,128,.10)', 'rgba(74,222,128,.55)');
      tx.strokeStyle = ok ? 'rgba(74,222,128,.9)' : 'rgba(248,113,113,.9)'; tx.lineWidth = 1.5; tx.setLineDash([4, 4]);
      tx.beginPath(); tx.arc(ptr.x, ptr.y, S.rmax * view.k, 0, 7); tx.stroke(); tx.setLineDash([]);
      tx.fillStyle = ok ? '#4ade80' : '#f87171'; tx.beginPath(); tx.arc(ptr.x, ptr.y, 6, 0, 7); tx.fill();
    }
    // выбранное место (до «Подтвердить»): зона и метка; при переносе — линия от комплекса
    if (st.draft && st.phase === 'plan' && (st.placing || (st.moving && st.sel))) {
      const S = st.placing ? SAM[st.placing] : st.sel.S, [dx, dy] = w2s(st.draft.x, st.draft.z);
      if (!st.draft.cov) st.draft.cov = covAt(S, st.draft.x, st.draft.z, eyeAt(S, st.draft.x, st.draft.z, st.draft.roof)); // что будет перекрыто с нового места
      drawCov(st.draft.cov, 'rgba(74,222,128,.16)', 'rgba(74,222,128,.85)');
      if (st.moving) { const [ux, uy] = w2s(st.sel.pos.x, st.sel.pos.z); tx.strokeStyle = 'rgba(253,230,138,.85)'; tx.lineWidth = 1.5; tx.setLineDash([3, 4]); tx.beginPath(); tx.moveTo(ux, uy); tx.lineTo(dx, dy); tx.stroke(); }
      tx.strokeStyle = 'rgba(253,230,138,.95)'; tx.lineWidth = 2; tx.setLineDash([6, 4]); tx.beginPath(); tx.arc(dx, dy, Math.max(10, S.rmax * view.k), 0, 7); tx.stroke(); tx.setLineDash([]);
      tx.fillStyle = 'rgba(253,230,138,.95)'; tx.beginPath(); tx.arc(dx, dy, 7, 0, 7); tx.fill(); tx.strokeStyle = 'rgba(0,0,0,.7)'; tx.lineWidth = 1.5; tx.stroke();
      tx.font = '700 12px "Golos Text", -apple-system, Segoe UI, sans-serif'; tx.textAlign = 'center'; tx.lineWidth = 3; tx.strokeText(S.short, dx, dy - 12); tx.fillText(S.short, dx, dy - 12); tx.textAlign = 'left';
      placeOkAt(dx, dy);
    } else placeOkAt(null);
    drawMsg();
  }
  function drawMsg() {
    if (st.alertT > 0) { // воздушная тревога: красная плашка вверху по центру
      tx.font = '800 18px "Golos Text", -apple-system, Segoe UI, sans-serif'; tx.textAlign = 'center'; const w = tx.measureText(st.alert).width + 28, y = (IS_TOUCH ? 52 : 64);
      tx.fillStyle = `rgba(185,28,28,${0.75 + 0.2 * Math.sin(performance.now() / 300)})`; tx.fillRect(C.VW / 2 - w / 2, y - 22, w, 32); tx.fillStyle = '#fff'; tx.fillText(st.alert, C.VW / 2, y); tx.textAlign = 'left';
    }
    if (st.msgT > 0) { tx.font = '700 14px "Golos Text", -apple-system, Segoe UI, sans-serif'; tx.fillStyle = '#fde68a'; tx.strokeStyle = 'rgba(0,0,0,.8)'; tx.lineWidth = 4; const yy = C.VH - (IS_TOUCH ? 16 : 30), xx = ($('mapNav').getBoundingClientRect().right || 0) + 12; tx.textAlign = 'left'; tx.strokeText(st.msg, xx, yy); tx.fillText(st.msg, xx, yy); } // правее панели перемещения
  }
  // баллистическая цель: ромб, высота, до падения; район падения — в аркаде точно, в реализме — круг ±1,5 км (оценка СПРН)
  function drawTbmDot(w, px, py, left) { tx.fillStyle = '#ef4444'; tx.beginPath(); tx.moveTo(px, py - 7); tx.lineTo(px + 6, py); tx.lineTo(px, py + 7); tx.lineTo(px - 6, py); tx.closePath(); tx.fill(); }
  function drawTbm(w, arcade) {
    const [px, py] = w2s(w.pos.x, w.pos.z), left = Math.max(0, Math.ceil(w.T - w.t));
    if (!w.decoy || arcade || atk()) {
      if (!w.est && !w.aim) return drawTbmDot(w, px, py, left); // онлайн: точки падения ещё нет
      if (!w.est) { const a = st.rnd() * 6.28, r = arcade || atk() ? 0 : st.rnd() * 900; w.est = [w.aim.x + Math.cos(a) * r, w.aim.z + Math.sin(a) * r]; }
      const [ix, iy] = w2s(w.est[0], w.est[1]), rr = arcade || atk() ? 6 : Math.max(8, 1500 * view.k);
      tx.strokeStyle = 'rgba(239,68,68,.75)'; tx.setLineDash([4, 4]); tx.lineWidth = 1.5; tx.beginPath(); tx.arc(ix, iy, rr, 0, 7); tx.stroke(); tx.setLineDash([]);
      tx.strokeStyle = 'rgba(239,68,68,.35)'; tx.beginPath(); tx.moveTo(px, py); tx.lineTo(ix, iy); tx.stroke();
    }
    tx.fillStyle = w.decoy && (arcade || atk()) ? '#9ca3af' : '#ef4444'; tx.beginPath(); tx.moveTo(px, py - 7); tx.lineTo(px + 6, py); tx.lineTo(px, py + 7); tx.lineTo(px - 6, py); tx.closePath(); tx.fill();
    tx.fillStyle = '#fecaca'; tx.fillText(tr('{0} км · {1} с', [Math.round(w.pos.y / 1000), left]), px, py - 11);
  }
  // за удар: комплексы противника — какие известны (аркада — все; в реализме — дальние и средние по разведке до удара,
  // засечённые разведчиком и выдавшие себя пуском); свои ракеты, дроны и носители — все
  function drawEnemy() {
    const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 180);
    for (const u of C.S.units) {
      if (!samKnown(u) && !u.dead) continue;
      const [px, py] = w2s(u.pos.x, u.pos.z);
      if (!u.dead && u.S.radar && u.emit) { tx.strokeStyle = `rgba(250,204,21,${0.35 + 0.5 * pulse})`; tx.lineWidth = 2; tx.beginPath(); tx.arc(px, py, 13 + 4 * pulse, 0, 7); tx.stroke(); tx.fillStyle = '#fde047'; tx.fillText(tr('РЛС'), px + 22, py - 6); } // излучает
      const fl = st.flash.get(u); if (fl && C.t - fl < 3 && C.t >= fl) { tx.strokeStyle = '#fff'; tx.lineWidth = 2.5; tx.beginPath(); tx.arc(px, py, 10 + (C.t - fl) * 12, 0, 7); tx.stroke(); tx.fillStyle = '#fff'; tx.fillText(tr('Пуск'), px, py - 16); } // пуск ЗУР
      if (!u.dead && u.S.type !== 'jammer') { tx.strokeStyle = 'rgba(248,113,113,.35)'; tx.lineWidth = 1; tx.setLineDash([5, 5]); tx.beginPath(); tx.arc(px, py, u.S.rmax * view.k, 0, 7); tx.stroke(); tx.setLineDash([]); }
      tx.fillStyle = u.dead ? '#555' : u.S.abm ? '#f43f5e' : '#f87171'; tx.strokeStyle = 'rgba(0,0,0,.6)'; tx.lineWidth = 1.5;
      tx.beginPath(); if (u.S.type === 'guns') tx.rect(px - 6, py - 6, 12, 12); else if (u.S.hp <= 15) tx.arc(px, py, 5, 0, 7); else { tx.moveTo(px, py - 8); tx.lineTo(px + 7, py + 6); tx.lineTo(px - 7, py + 6); tx.closePath(); }
      tx.fill(); tx.stroke();
      if (u.dead) { tx.strokeStyle = '#fff'; tx.beginPath(); tx.moveTo(px - 6, py - 6); tx.lineTo(px + 6, py + 6); tx.moveTo(px + 6, py - 6); tx.lineTo(px - 6, py + 6); tx.stroke(); }
      tx.fillStyle = '#fecaca'; tx.fillText(u.S.rwr || u.S.short, px, py + 18);
    }
  }
  // маршруты плана удара: от края района через точки к целям (у каждого типа — свой цвет)
  const RCOL = ['#38bdf8', '#a78bfa', '#34d399', '#fb923c', '#f472b6', '#facc15', '#60a5fa'];
  // границы для типа, который правим: откуда входят / пускают (дроны — край района, носители — рубеж за краем,
  // баллистика — район пусковых), где можно ставить точки маршрута (внутри района)
  function drawBounds() {
    if (!st.edKey) return;
    const W = AG[st.edKey], via = (multiItems(attSide()).find(([q]) => q === st.edKey) || [])[1], [cx, cy] = w2s(0, 0);
    const ring = (R, col, dash, label, ang = -0.6) => { tx.strokeStyle = col; tx.lineWidth = 2; tx.setLineDash(dash); tx.beginPath(); tx.arc(cx, cy, R * view.k, 0, 7); tx.stroke(); tx.setLineDash([]);
      if (label) { const [lx, ly] = w2s(Math.sin(ang) * R, -Math.cos(ang) * R); tx.textAlign = Math.sin(ang) > 0 ? 'right' : 'left'; /* у левого / правого края — кольца там видны */ tx.font = '700 12px "Golos Text", -apple-system, Segoe UI, sans-serif'; tx.fillStyle = col; tx.strokeStyle = 'rgba(0,0,0,.8)'; tx.lineWidth = 3; tx.strokeText(label, lx + (Math.sin(ang) > 0 ? -8 : 8), ly - 6); tx.fillText(label, lx + (Math.sin(ang) > 0 ? -8 : 8), ly - 6); tx.textAlign = 'center'; } };
    if (W.kind === 'tbm') { ring(CITY.HALF - 3800, 'rgba(248,113,113,.8)', [6, 6], tr('район пусковых'), 1.45); ring(CITY.HALF - 2600, 'rgba(248,113,113,.5)', [6, 6], ''); return; }
    ring(CITY.HALF - 300, 'rgba(255,255,255,.85)', [5, 5], tr('точки маршрута — внутри'), -1.62);
    if (W.uav) ring(CITY.HALF - 500, 'rgba(56,189,248,.9)', [10, 6], tr('вход дронов — край района'), -1.45);
    else ring(LAUNCH_R, 'rgba(251,146,60,.95)', [10, 6], tr('рубеж пуска: {0}', [via ? CARRIERS[via].name : tr('носитель')]), 1.62);
  }
  // наряд на карте: от края (у дронов — край района, у носителей — рубеж пуска) к цели — линия «тип ×N · пуск»
  // (у единиц со своим маршрутом — его рисует drawRoutes); у целей — кружок прогноза «×N ≈ 85 %»
  function drawAlloc() {
    if (!st.plan) return;
    const items = multiItems(attSide()), D = planDefaults(planComp(), st.targets, st.plan.cfg, st.net ? LIM_ON : undefined), ev = st.phase === 'wave' && C.ev;
    const posOf = (key) => { if (key[0] === 'o') { const o = C.S.objects.find((q) => q.id === +key.slice(1)); return o && [o.x, o.z]; } if (key[0] === 'u') { const u = C.S.units.find((q) => q.id === +key.slice(1)); return u && [u.pos.x, u.pos.z]; } return null; };
    tx.font = '700 11.5px "Golos Text", -apple-system, Segoe UI, sans-serif'; tx.textAlign = 'center';
    // по целям: какие типы туда идут без своего маршрута (одна линия на цель — с края района, столбик подписей «тип ×N · пуск»)
    const byT = {};
    for (const [k] of items) {
      const W = AG[k], n = st.plan.n[k] || 0; if (!n) continue; // баллистика — тоже в подписи (летит с пусковых по дуге)
      for (let i = 0; i < n; i++) { if (ev && ev.unitInfo(k, i).launched) continue; const u = unitCfg(st.plan.cfg, k, i); if (u.pts && W.kind !== 'tbm') continue; const t = tkeyOf(k, i); if (!t || t === 'sam') continue;
        const g = ((byT[t] = byT[t] || {})[k] = byT[t][k] || { n: 0, t: Infinity, ix: [] }); g.n++; g.ix.push(i); g.t = Math.min(g.t, ev ? ev.unitInfo(k, i).t : D[k] ? D[k].units[i].t : 0); }
    }
    for (const [key, grp] of Object.entries(byT)) {
      const p = posOf(key); if (!p) continue;
      const b = Math.atan2(p[0], p[1]), [ax, ay] = w2s(Math.sin(b) * LAUNCH_R, Math.cos(b) * LAUNCH_R), [bx, by] = w2s(p[0], p[1]), cur = st.tsel === key;
      tx.globalAlpha = cur || !st.tsel ? 0.9 : 0.35; tx.strokeStyle = '#e2e8f0'; tx.lineWidth = cur ? 3 : 1.8; tx.setLineDash([12, 6]); tx.beginPath(); tx.moveTo(ax, ay); tx.lineTo(bx, by); tx.stroke(); tx.setLineDash([]);
      const rows = Object.entries(grp).sort((q, r) => q[1].t - r[1].t), mx = ax + (bx - ax) * 0.55, my = ay + (by - ay) * 0.55 - (rows.length - 1) * 7;
      rows.forEach(([k, g], j) => { const lab = tr('{0} {1} · пуск {2}{3}', [AG[k].short, numTxt(g.ix), fmtT(g.t), AG[k].kind === 'tbm' ? tr(' · баллистика') : '']) /* номера — те же, что в карточке цели */, col = AG[k].kind === 'tbm' ? '#f87171' : RCOL[items.findIndex(([q]) => q === k) % RCOL.length]; // баллистика — красным
        tx.strokeStyle = 'rgba(0,0,0,.85)'; tx.lineWidth = 3; tx.strokeText(lab, mx, my + j * 14); tx.fillStyle = col; tx.fillText(lab, mx, my + j * 14); });
      tx.globalAlpha = 1;
    }
    for (const key of tKeys()) { // кружок прогноза у цели
      if (key[0] !== 'o') continue; const f = forecast(key), p = posOf(key); if (!f || !p) continue;
      const [x, y] = w2s(p[0], p[1]), cnt = planComp().reduce((s0, [k]) => s0 + idxOf(k, key).length, 0);
      tx.strokeStyle = fcCol(f.k); tx.lineWidth = st.tsel === key ? 4 : 2.5; tx.beginPath(); tx.arc(x, y, 15, 0, 7); tx.stroke();
      const lab = `×${cnt} · ≈ ${Math.round(f.k * 100)} %`; tx.strokeStyle = 'rgba(0,0,0,.85)'; tx.lineWidth = 3; tx.strokeText(lab, x, y + 30); tx.fillStyle = fcCol(f.k); tx.fillText(lab, x, y + 30);
    }
    if (st.tsel && st.tsel[0] === 'u') { const p = posOf(st.tsel); if (p) { const [x, y] = w2s(p[0], p[1]); tx.strokeStyle = '#fff'; tx.lineWidth = 3; tx.beginPath(); tx.arc(x, y, 18, 0, 7); tx.stroke(); } }
  }
  function drawRoutes() {
    if (!st.plan) return;
    drawBounds();
    const items = multiItems(attSide());
    const D = planDefaults(planComp(), st.targets, st.plan.cfg, st.net ? LIM_ON : undefined), ev = st.phase === 'wave' && C.ev;
    const when = (k, i) => { // время пуска для подписи: тип — первая единица; единица — своё (в бою — из расписания, пущенная — «пущена»)
      if (i >= 0 && ev) { const f = ev.unitInfo(k, i); if (f.launched) return tr('пущена'); return tr('пуск ') + fmtT(f.t); }
      const d = D[k]; if (!d) return ''; return tr('пуск ') + fmtT(i >= 0 ? d.units[i].t : d.t);
    };
    for (const [k, r] of Object.entries(st.plan.cfg)) {
      const col = RCOL[items.findIndex(([kk]) => kk === k) % RCOL.length], n = st.plan.n[k] || 0;
      // одинаковый маршрут у нескольких единиц (правка «все здесь») — одна линия, подпись «Калибр 1, 2»
      const lines = [[r.pts, r.alt, null, -1, []]], same = {};
      (r.units || []).forEach((u, i) => { if (!(u && u.pts && u.pts.length && i < n) || (ev && ev.unitInfo(k, i).launched)) return; const a = u.alt !== undefined ? u.alt : r.alt, key = JSON.stringify([u.pts, a]);
        if (same[key]) same[key][4].push(i); else lines.push((same[key] = [u.pts, a, u, i, [i]])); });
      for (const [pts0, alt, u, i, ix] of lines) {
        if (!pts0 || !pts0.length) continue;
        const cur = st.edKey === k && (st.edUnit === null ? i < 0 || (edGrp() || []).includes(i) : ix.includes(st.edUnit)), b = Math.atan2(pts0[0][0], pts0[0][1]);
        const pts = [[Math.sin(b) * CITY.HALF, Math.cos(b) * CITY.HALF], ...pts0];
        tx.strokeStyle = col; tx.globalAlpha = st.edKey && !cur ? 0.55 : 1; tx.lineWidth = cur ? 3 : i < 0 ? 2 : 1.5; tx.setLineDash(i < 0 ? [] : [8, 4]); tx.beginPath();
        pts.forEach(([x, z], j) => { const [a, c] = w2s(x, z); if (j) tx.lineTo(a, c); else tx.moveTo(a, c); }); tx.stroke();
        // пунктир — к целям единиц этого маршрута (у типа — у кого нет своего маршрута)
        const keys = new Set(i >= 0 ? ix.map((j) => tkeyOf(k, j)) : Array.from({ length: n }, (_, j) => j).filter((j) => !(r.units && r.units[j] && r.units[j].pts && r.units[j].pts.length)).map((j) => tkeyOf(k, j)));
        tx.setLineDash([3, 5]); const [lx, lz] = w2s(...pts[pts.length - 1]), tg = C.S.objects.filter((o) => keys.has('o' + o.id)).concat(keys.has(null) ? st.targets : []);
        for (const o of tg) { const [a, c] = w2s(o.x, o.z); tx.beginPath(); tx.moveTo(lx, lz); tx.lineTo(a, c); tx.stroke(); }
        tx.setLineDash([]);
        pts0.forEach(([x, z], j) => { const [a, c] = w2s(x, z); tx.fillStyle = col; tx.beginPath(); tx.arc(a, c, cur ? 7 : 5, 0, 7); tx.fill(); tx.fillStyle = '#0b1218'; tx.fillText(String(j + 1), a, c + 4); });
        const [ax, az] = w2s(...pts0[0]), lab = (i >= 0 ? `${AG[k].short} ${numTxt(ix)}` : AG[k].short) + ` · ${alt ? (alt >= 1000 ? alt / 1000 + tr(' км') : alt + tr(' м')) : tr('своя высота')} · ${when(k, i)}`;
        tx.font = '700 11.5px "Golos Text", -apple-system, Segoe UI, sans-serif'; tx.strokeStyle = 'rgba(0,0,0,.8)'; tx.lineWidth = 3; tx.strokeText(lab, ax, az - 12); tx.fillStyle = col; tx.fillText(lab, ax, az - 12);
        tx.globalAlpha = 1;
      }
    }
  }
  // онлайн «Мульти-волна» за атаку: что запустили союзники (своё — синее и жёлтое, союзников — фиолетовое)
  const ally = (o) => !!(st.net && st.net.isAlly && st.net.isAlly(o));
  function drawOwn() {
    for (const m of C.S.sams) { if (m.dead) continue; const [px, py] = w2s(m.pos.x, m.pos.z); tx.fillStyle = '#f87171'; tx.fillRect(px - 1.5, py - 1.5, 3, 3); } // зенитные ракеты противника
    if (C.raid) for (const a of C.raid.planes) {
      if (a.dead || a.out || a.phase === 'wait') continue;
      const [px, py] = w2s(a.pos.x, a.pos.z);
      const al = ally(a); // онлайн: носитель союзника — фиолетовый, с его ником
      tx.save(); tx.translate(px, py); tx.rotate(-a.yaw); tx.fillStyle = al ? '#a78bfa' : '#60a5fa'; tx.beginPath(); tx.moveTo(0, -10); tx.lineTo(7, 8); tx.lineTo(-7, 8); tx.closePath(); tx.fill(); tx.restore();
      tx.fillStyle = al ? '#ddd6fe' : '#bfdbfe'; tx.fillText(al ? `${allyName(a.ownerPid || a.owner)} · ${a.carrierName || ''}` : a.carrierName || '', px, py - 13);
    }
    for (const w of C.S.wpns) {
      if (w.dead) continue;
      if (w.ev && w.W.kind === 'tbm') { drawTbm(w, true); continue; }
      const [px, py] = w2s(w.pos.x, w.pos.z);
      tx.fillStyle = w === st.watch ? '#fff' : ally(w) ? (w.W.uav ? '#e9d5ff' : '#c084fc') : w.W.recon ? '#93c5fd' : w.decoy ? '#cbd5e1' : w.W.uav ? '#fde047' : '#38bdf8';
      const r = w === st.watch ? 4 : w.W.uav ? 1.8 : 2.5; tx.fillRect(px - r, py - r, r * 2, r * 2);
    }
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
  tm.addEventListener('contextmenu', (e) => { e.preventDefault(); if (st.phase === 'plan' && (st.placing || st.moving)) cancelDraft(); }); // ПК: правая кнопка — отмена размещения / переноса
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
    if (!st.pick && atk() && st.phase === 'wave' && st.edKey && AG[st.edKey].kind !== 'tbm') { // бой идёт, окно типа открыто — точка маршрута
      const r = scopeCfg(); if (!r.pts) r.pts = [];
      if (r.pts.length >= 3) { say(tr('Не больше 3 точек маршрута')); snd.deny(); return; }
      if (Math.hypot(wx, wz) > CITY.HALF - 300) { say(tr('Точка — внутри района')); snd.deny(); return; }
      const np = [...r.pts, [wx, wz]]; if (st.edUnit === null && !edGrp()) r.pts = np; else scopeSet((q) => { q.pts = np.map((p) => [...p]); }); snd.click(); afterEdit(); return;
    }
    if (st.multi && st.phase === 'wave' && !st.pick) { // касание своей ракеты / носителя (за ПВО — видимой цели) — смотреть за ней
      let best = null, bd = IS_TOUCH ? 24 : 14;
      for (const o of watchList()) { const [x, y] = w2s(o.pos.x, o.pos.z), d = Math.hypot(x - px, y - py); if (d < bd) { bd = d; best = o; } }
      if (best) { watch(best); return; }
    }
    if (!st.pick && atk() && st.phase === 'plan' && st.edKey && AG[st.edKey].kind !== 'tbm') { // правка маршрута: точка по касанию (до 3)
      const r = scopeCfg(); if (!r.pts) r.pts = [];
      if (r.pts.length >= 3) { say(tr('Не больше 3 точек маршрута — «Сбросить», чтобы начать заново')); snd.deny(); return; }
      if (Math.hypot(wx, wz) > CITY.HALF - 300) { say(tr('Точка — внутри района')); snd.deny(); return; }
      const np = [...r.pts, [wx, wz]]; if (st.edUnit === null && !edGrp()) r.pts = np; else scopeSet((q) => { q.pts = np.map((p) => [...p]); }); snd.click(); afterEdit(); return;
    }
    if (atk()) { // цель под пальцем: объект или засечённый ЗРК → смена цели единицы (st.pick) или карточка наряда
      let best = null, bd = IS_TOUCH ? 26 : 16;
      for (const o of C.S.objects) { if (o.dead || o.noTarget) continue; const [x, y] = w2s(o.x, o.z), d = Math.hypot(x - px, y - py); if (d < bd) { bd = d; best = 'o' + o.id; } }
      for (const u of C.S.units) { if (u.dead || !samKnown(u) || !u.S.radar) continue; const [x, y] = w2s(u.pos.x, u.pos.z), d = Math.hypot(x - px, y - py); if (d < bd) { bd = d; best = 'u' + u.id; } }
      if (st.pick) { if (!best) { say(tr('Коснитесь цели: объект или засечённый ЗРК')); snd.deny(); return; } setTkey(st.pick.k, st.pick.i, best); st.pick = null; st.tsel = best; say(`${uName(st.edKey, st.edUnit)} → «${tName(best)}»`, 2); snd.click(); afterEdit(); return; } // окно — уже новой цели
      st.tsel = best; if (best) st.edKey = null; snd.click(); renderSide(); return;
    }
    // размещение и перенос: каждое касание — новое место («призрак» с зоной), купить или переехать — «Подтвердить»
    if (st.phase === 'plan' && (st.placing || st.moving)) {
      if (st.moving && !st.draft) { const o = unitAt(px, py); if (o && o !== st.sel) { st.sel = o; st.moving = mine(o); snd.click(); renderSide(); return; } } // место ещё не выбрано — касание другого комплекса выбирает его
      const S = st.placing ? SAM[st.placing] : st.sel.S;
      if (!placeOk(S, wx, wz)) { say(S.hp <= 15 ? tr('Здесь нельзя: нужна земля или плоская крыша') : city.kind === 'winter' ? tr('Здесь нельзя: крутой склон, постройка или край карты') : tr('Здесь нельзя: дом, река или край карты')); snd.deny(); return; }
      st.draft = { x: wx, z: wz, roof: buildingAt(city, wx, wz) >= 0 }; snd.click(); renderSide(); return;
    }
    // выбор комплекса под пальцем; в расстановке свой — сразу перенос (место — касанием карты, затем «Подтвердить»)
    const best = unitAt(px, py);
    st.sel = best; st.placing = null; st.draft = null; st.moving = !!(best && st.phase === 'plan' && mine(best)); if (best) snd.click(); renderSide();
  }
  function unitAt(px, py) {
    let best = null, bd = IS_TOUCH ? 26 : 16;
    for (const u of C.S.units) { if (u.dead) continue; const [x, y] = w2s(u.pos.x, u.pos.z), d = Math.hypot(x - px, y - py); if (d < bd) { bd = d; best = u; } }
    return best;
  }
  // «Подтвердить»: покупка на выбранном месте или переезд; «Отмена» — без покупки / комплекс остаётся где был
  function confirmDraft() {
    const d = st.draft; if (!d) { say(tr('Сначала коснитесь карты — место')); snd.deny(); return; }
    if (st.moving && st.sel) {
      if (st.net) st.net.move(st.sel.id, d.x, d.z, d.roof); // онлайн: переезд проверяет и делает сервер
      else { C.S.moveUnit(st.sel, d.x, d.z, d.roof); st.sel.cov = null; C.syncUnits(); }
      st.moving = false; st.draft = null; snd.click(); renderSide(); return;
    }
    const k = st.placing; if (!k) return;
    const cost = st.net ? costOf(k) : SAM_COST[k], lim = netLeft(k);
    if (cost > st.budget) { say(tr('Не хватает очков обороны')); snd.deny(); return; }
    if (lim !== null && lim <= 0) { say(tr('Лимит первой волны для этого класса')); snd.deny(); return; }
    if (st.net) st.net.buyUnit(k, d.x, d.z, d.roof); // онлайн: комплекс придёт событием
    else { st.budget -= cost; const u = C.S.addUnit(k, d.x, d.z, { roof: d.roof, skill: 0.75, yaw: st.rnd() * 6.28 }); u.paid = cost; C.syncUnits(); st.sel = u; on('place', u); }
    st.placing = null; st.draft = null; snd.click(); renderSide();
  }
  // ✓ / ✕ рядом с выбранным местом (Mark 2026-10-25: «чтобы не приходилось каждый раз подниматься и искать кнопку „Подтвердить“»):
  // поверх карты справа от метки (у правой панели — слева), за меткой при сдвиге и масштабе; «Подтвердить» / «Отмена» в панели — как были
  const plOk = document.createElement('div'); plOk.id = 'plOk'; plOk.hidden = true;
  plOk.innerHTML = `<button class="ok" data-a="pok" title="${tr('Подтвердить')}">${ico('ok')}</button><button class="no" data-a="pno" title="${tr('Отмена')}">${ico('close')}</button>`;
  document.body.appendChild(plOk);
  plOk.addEventListener('pointerdown', (e) => e.stopPropagation());
  plOk.onclick = (e) => { const b = e.target.closest('button'); if (!b) return; e.stopPropagation(); if (b.dataset.a === 'pok') confirmDraft(); else cancelDraft(); };
  function placeOkAt(x, y) {
    if (x === null) { if (!plOk.hidden) plOk.hidden = true; return; }
    const side = $('dside'), r = side && side.offsetParent ? side.getBoundingClientRect() : null, W = 2 * 44 + 8, right = r && r.left > C.VW / 2 ? r.left : C.VW;
    const left = x + 16 + W < right - 8 ? x + 16 : x - 16 - W, top = Math.min(Math.max(y - 22, 8), C.VH - 52);
    plOk.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`; if (plOk.hidden) plOk.hidden = false;
  }
  function cancelDraft() { if (st.moving) st.sel = null; st.placing = null; st.moving = false; st.draft = null; snd.click(); renderSide(); }
  // карточка размещения / выбранного своего комплекса в расстановке
  function placeCard() {
    if (!st.placing) return '';
    const S = SAM[st.placing], c = costOf(st.placing);
    return `<div class="dcard on"><div class="nm"><b>${tr('{0} — размещение', [S.name])}</b><span>${st.draft ? tr('место выбрано — коснитесь карты, чтобы сдвинуть') : tr('коснитесь карты — место')}${S.hp <= 15 ? tr(' · можно на плоскую крышу') : ''}${IS_TOUCH ? '' : tr(' · Enter — подтвердить, Esc или правая кнопка — отмена')}</span></div><span class="pr">${c}</span></div>
      <div class="dact"><button class="btn" data-a="pok" ${st.draft ? '' : 'disabled'}>${tr('Подтвердить −{0}', [c])}</button><button class="btn alt" data-a="pno">${tr('Отмена')}</button></div>`;
  }
  // фильтр целей комплекса (Mark 2026-10-25): k — вид из строки «Цели»; 'all' — все. Выключить все виды нельзя (последний остаётся).
  // Онлайн: тот же путь, что «Огонь по команде» — команда серверу (t: 'tgt', c — список включённых видов; пустой — все), сервер проверяет сам
  function setTgtCat(u, k) {
    const mode = st.multi ? 'multi' : 'def', ch = tgtChoices(u.S, mode).map((q) => q.k); if (!ch.length) return;
    let cur = new Set(u.tgt ? ch.filter((q) => u.tgt.has(q)) : ch);
    if (k === 'all') cur = new Set(ch);
    else if (!ch.includes(k)) return;
    else if (!cur.has(k)) cur.add(k);
    else if (cur.size > 1) cur.delete(k);
    else { say(tr('Хотя бы один вид целей должен остаться')); snd.deny(); return; }
    // виды, которых нет среди кнопок (в «Обороне» — дроны, крылатые и ложные цели её последней волны), не выключаются: фильтр — только то, что игрок видит (ревью)
    const all = cur.size === ch.length, list = [...cur, ...TGT_CATS.filter((q) => !ch.includes(q))]; C.S.setTgt(u, all ? null : list);
    if (st.net) st.net.send({ t: 'tgt', id: u.id, c: all ? [] : list });
  }
  const moveBtns = (u) => (st.moving ? `${st.draft ? `<button class="btn" data-a="pok">${tr('Подтвердить перенос')}</button>` : ''}<button class="btn alt" data-a="pno">${st.draft ? tr('Отмена') : tr('Не переносить')}</button>` : `<button class="btn alt" data-a="move">${tr('Переместить')}</button>`);
  const moveHint = () => (st.moving ? `<p class="hint">${tr('{0} Зелёная тень — что будет перекрыто на 300 м, серая — нынешняя зона.{1}', [st.draft ? tr('Новое место выбрано — «Подтвердить перенос» или коснитесь карты ещё раз.') : IS_TOUCH ? tr('Коснитесь карты — новое место комплекса.') : tr('Наведите мышь — тень зоны с нового места, щелчок — выбрать место.'), IS_TOUCH ? '' : tr(' Enter — подтвердить, Esc или правая кнопка — отмена.')])}</p>` : '');

  // ═════════════ Боковая панель ═════════════
  const side = $('dside');
  // плановое обновление панели (раз в полсекунды) пропускаем, пока палец/кнопка мыши на ней (иначе нажатие «теряется»);
  // перерисовка после самого нажатия — всегда. Отпустили где угодно (в том числе мимо панели) — блокировка снята
  let sideHold = false, sideHtml = '';
  const holdOn = () => { sideHold = true; }, holdOff = () => { setTimeout(() => { sideHold = false; }, 60); };
  side.addEventListener('pointerdown', holdOn); addEventListener('pointerup', holdOff, true); addEventListener('pointercancel', holdOff, true);
  const setSide = (h) => { if (h !== sideHtml) { sideHtml = h; side.innerHTML = h; } };
  function unitStatus(u) {
    if (u.dead) return tr('уничтожен');
    if (u.S.type === 'jammer') return tr('подавляет спутниковую навигацию в радиусе {0} км', [(u.S.jamR / 1000).toFixed(0)]);
    const a = [];
    if (u.S.radar) a.push(u.emit ? tr('РЛС излучает') : u.ambush ? tr('засада: РЛС молчит') : tr('РЛС выключена'));
    if (u.track) a.push(`<b style="color:#fde047">${tr('захват цели')}</b>`);
    if (u.S.type !== 'guns') a.push(u.reloadT > 0 ? tr('перезарядка {0} с', [Math.ceil(u.reloadT)]) : tr('ракет {0}/{1}', [u.ammo, u.S.ammo]));
    if (u.hold) a.push(tr('огонь по команде'));
    const tl = tgtLabel(u, st.multi ? 'multi' : 'def'); if (tl) a.push(tl);
    return a.join(' · ');
  }
  // онлайн: мои комплексы, лимит первой волны по классам, сторона ПВО и эпоха — из боя
  const mine = (u) => !st.net || u.owner === (st.net.me && st.net.me.id);
  const allyName = (id) => { const p = st.net && st.net.room && (st.net.room.players || []).find((q) => q.id === id); return p ? `${p.name}${p.bot ? tr(' (бот)') : ''}` : tr('союзник'); };
  const CLS_NAME = { top: tr('дальний'), mid: tr('средний'), near: tr('ближний') };
  function netLeft(k) { // сколько ещё можно купить этого класса на первой волне (null — без лимита)
    if (!st.net || st.multi || st.wave !== 1) return null; const cls = samClass(k); if (cls === 'near') return null;
    return LIMIT1[cls] - C.S.units.filter((u) => mine(u) && !u.dead && samClass(u.key) === cls).length;
  }
  function renderNet() {
    const S = C.S, N = st.net, B = N.battle; let h = '';
    const left = N.room && N.room.left !== null ? tr(' · {0} с', [N.room.left]) : '';
    if (st.phase === 'plan') {
      h += `<h3>${tr('Расстановка · волна {0}/{1}{2}', [st.wave, st.waves, left])}</h3><div>${tr('Очки обороны: <b style="color:#fde68a">{0}</b>', [st.budget])}</div>`;
      if (st.wave === 1) h += `<p class="hint">${tr('Первая волна: не больше 1 дальнего и 1 среднего комплекса, ближние — за очки.')}</p>`;
      if (st.sel && !st.sel.dead && mine(st.sel)) {
        const u = st.sel;
        h += `<div class="dcard on"><div class="nm"><b>${u.S.name}${capsHtml(u.S, 'def')}</b><span>${tr('{0} · до {1} км', [SAM_TYPE[u.S.type], (u.S.rmax / 1000).toFixed(1)])}</span></div></div>${tgtRowHtml(u, 'def')}
          <div class="dact">${moveBtns(u)}<button class="btn alt" data-a="sell">${tr('Продать +{0}', [Math.round(samCost(u.key) * 0.7)])}</button>${st.moving ? '' : `<button class="btn alt" data-a="desel">${tr('Готово')}</button>`}</div>${moveHint()}`;
      } else if (st.sel && !st.sel.dead) h += `<div class="dcard"><div class="nm"><b>${st.sel.S.name}</b><span>${tr('союзника')}</span></div></div>`;
      h += placeCard() + `<div class="cat-h">${tr('Купить')}</div>`;
      const side = B.sideAir === 'east' ? 'west' : 'east';
      for (const [k, s] of Object.entries(SAM)) {
        if (s.side !== side || s.era > B.era) continue;
        const c = costOf(k), lim = netLeft(k), lk = lockedSam(k), no = c > st.budget || (lim !== null && lim <= 0) || lk;
        h += `<div class="dcard ${st.placing === k ? 'on' : ''} ${no ? 'no' : ''}" data-buy="${k}"><div class="nm"><b>${lk ? ico('lock') + ' ' : ''}${s.short}${capsHtml(s, 'def')}</b><span>${tr('{0} · {1} · {2} км{3}', [CLS_NAME[samClass(k)], SAM_TYPE[s.type], (s.rmax / 1000).toFixed(1), lim !== null ? tr(' · можно ещё {0}', [Math.max(0, lim)]) : ''])}</span></div><span class="pr">${c}</span></div>`;
      }
      h += `<p class="hint">${st.placing ? (IS_TOUCH ? tr('Касайтесь карты, пока место не устроит, затем «Подтвердить». Зелёная тень — зона комплекса на высоте 300 м, просветы — то, что закрывают дома. «Отмена» — не покупать.') : tr('Ведите мышь по карте: зелёная тень — зона комплекса на высоте 300 м, просветы — то, что закрывают дома. Щелчок выбирает место (можно менять), затем «Подтвердить» или Enter. «Отмена», Esc или правая кнопка — не покупать.')) : tr('Выберите комплекс в каталоге и коснитесь карты. Коснитесь своего комплекса: перенос (новое место и «Подтвердить») или продажа.')}</p>`;
      h += `<button class="btn ${st.ready ? 'alt' : ''}" data-a="ready">${st.ready ? ico('ok', 'ii') + tr('Готов (снять)') : tr('Готов')}</button>`;
    } else if (st.phase === 'wave') {
      const air = C.raid.planes.filter((a) => !a.dead && !a.out && a.role !== 'decoy').length;
      h += `<h3>${tr('Волна {0}/{1}{2}', [st.wave, st.waves, left])}</h3><div>${tr('В воздухе: <b>{0}</b> · объекты целы <b>{1}%</b>', [air, Math.round((1 - (B.valueK || 0)) * 100)])}</div>`;
      if (st.sel && !st.sel.dead && mine(st.sel)) {
        const u = st.sel;
        h += `<div class="dcard on"><div class="nm"><b>${u.S.name}${capsHtml(u.S, 'def')}</b><span>${unitStatus(u)}</span></div></div>${tgtRowHtml(u, 'def')}<div class="dact">
          ${u.S.type === 'jammer' ? '' : `<button class="btn" data-a="op">${tr('Управлять')}</button>`}
          ${u.S.radar ? `<button class="btn alt" data-a="emit">${u.emit ? tr('РЛС: выключить') : tr('РЛС: включить')}</button>` : ''}<button class="btn alt" data-a="desel">${tr('Снять выбор')}</button></div>`;
      } else h += `<p class="hint">${tr('Коснитесь своего комплекса: «Управлять» — сесть оператором. Остальными стреляют расчёты. Красные треугольники — цели, которые видит сеть РЛС.')}</p>`;
      h += `<button class="btn alt" data-a="help">${tr('Мне нужна помощь!')}</button>`;
    } else if (st.phase === 'debrief') {
      const r = st.netRes || {};
      h += `<h3>${tr('Волна {0} — итоги', [st.wave])}</h3><div class="stats" style="margin:6px 0"><div class="stt"><b>${r.downs ?? '–'}</b><span>${tr('сбито')}</span></div><div class="stt"><b>${r.unitKills ?? '–'}</b><span>${tr('потеряно ЗРК')}</span></div>
        <div class="stt"><b>${Math.round((1 - (r.totalK || 0)) * 100)}%</b><span>${tr('объекты целы')}</span></div></div><p class="hint">${r.last ? tr('Бой окончен — итоги…') : tr('Скоро расстановка следующей волны.')}</p>`;
    }
    side.innerHTML = h;
  }
  // ── «Мульти-волна» за удар: состав за очки угрозы; у каждого типа — свой маршрут, высота, время пуска и цели ──
  const planCost = () => Object.entries(st.plan.n).reduce((s, [k, n]) => s + (THREAT[k] ?? 3) * n, 0);
  function planComp() { // [[ключ, n, эшелон, носитель]] для sim/combined.js
    const out = [[attSide() === 'east' ? 'scout_e' : 'scout', 1, 1]];
    for (const [k, via] of multiItems(attSide())) { const n = st.plan.n[k] || 0; if (n) out.push([k, n, AG[k].uav ? 1 : AG[k].kind === 'tbm' ? 3 : 2, via || undefined]); }
    return out;
  }
  // правка плана: в бою — сразу в удар (ещё не пущенным единицам)
  function afterEdit() { if (st.phase === 'wave' && C.ev) C.ev.applyPlan(st.plan.cfg); if (st.net && atk()) st.net.sendPlan(st.plan); renderSide(); } // онлайн: план целиком — серверу
  const cfgOf = (k) => (st.plan.cfg[k] = st.plan.cfg[k] || { pts: [], alt: null, t: null, sam: false, tgt: null, units: [] });
  // что правим: тип целиком (st.edUnit === null) или одну единицу (её настройка — поверх общей)
  const scopeCfg = () => { const c = cfgOf(st.edKey); if (st.edUnit === null) { const g = edGrp(); return g ? (c.units[g[0]] = c.units[g[0]] || {}) : c; } return (c.units[st.edUnit] = c.units[st.edUnit] || {}); };
  // группа: единицы этого типа на выбранной цели (ещё не пущенные) — «Все здесь»; null — окно открыто не из карточки цели
  const edGrp = () => (st.tsel && st.edKey ? idxOf(st.edKey, st.tsel).filter((i) => !launchedU(st.edKey, i)) : null);
  function scopeSet(fn) { const c = cfgOf(st.edKey), g = st.edUnit !== null ? [st.edUnit] : edGrp(); if (!g) { fn(c); return; } for (const i of g) fn((c.units[i] = c.units[i] || {})); }
  // номера единиц: «Калибр 1, 2», «Shahed-136 1–4» — сквозные по типу, те же на карте и в карточках целей
  const numTxt = (idx) => { const r = []; for (let j = 0; j < idx.length; j++) { let e = j; while (e + 1 < idx.length && idx[e + 1] === idx[e] + 1) e++; r.push(e - j >= 2 ? `${idx[j] + 1}–${idx[e] + 1}` : e > j ? `${idx[j] + 1}, ${idx[e] + 1}` : `${idx[j] + 1}`); j = e; } return r.join(', '); };
  const uName = (k, i) => `${AG[k].short} ${i + 1}`;
  const fmtT = (t) => (t >= 60 ? `${Math.floor(t / 60)}:${String(Math.round(t % 60)).padStart(2, '0')}` : tr('{0} с', [Math.round(t)]));
  const segH = (a, cur, items) => `<div class="seg">${items.map(([v, l]) => `<button data-a="${a}" data-v="${v}" class="${String(v) === String(cur) ? 'on' : ''}">${l}</button>`).join('')}</div>`;
  const ALTS = [['', tr('своя')], [300, tr('300 м')], [3000, tr('3 км')]], STEPS = [-30, -15, -5, 5, 15, 30];
  // ── наряд на цели: у каждой единицы своя цель — объект ('o' + id), «ПВО противника» ('sam': засечённые к моменту пуска)
  // или конкретный засечённый ЗРК ('u' + id); без цели (null) — поровну по целям. Покупка и назначение — одно действие («+» в карточке цели)
  const tkeyOf = (k, i) => { const u = unitCfg(st.plan.cfg, k, i); return u.sam ? (u.sid != null ? 'u' + u.sid : 'sam') : u.tgt != null ? 'o' + u.tgt : null; };
  function setTkey(k, i, key) { const u = (cfgOf(k).units[i] = cfgOf(k).units[i] || {}); u.sam = !!key && key[0] !== 'o'; u.sid = key && key[0] === 'u' ? +key.slice(1) : undefined; u.tgt = key && key[0] === 'o' ? +key.slice(1) : undefined; }
  const launchedU = (k, i) => st.phase === 'wave' && C.ev && C.ev.unitInfo(k, i).launched;
  const idxOf = (k, key) => { const out = []; for (let i = 0; i < (st.plan.n[k] || 0); i++) if (tkeyOf(k, i) === key) out.push(i); return out; };
  const tgtObjs = () => { const ids = new Set(); for (const [k] of planComp()) for (let i = 0; i < (st.plan.n[k] || 0); i++) { const t = tkeyOf(k, i); if (t && t[0] === 'o') ids.add(+t.slice(1)); } return C.S.objects.filter((o) => ids.has(o.id)); };
  const tName = (key) => { if (key === 'sam') return tr('ПВО противника'); const o = key[0] === 'o' ? C.S.objects.find((q) => q.id === +key.slice(1)) : null; if (o) return o.name; const u = C.S.units.find((q) => q.id === +key.slice(1)); return u ? tr('{0} (засечён)', [u.S.short]) : '?'; };
  // прогноз: ожидаемый урон наряда (боевая часть × доля долетевших) против оставшейся прочности объекта
  const pSurv = (W) => (W.decoyMun || !W.dmg ? 0 : W.uav ? 0.45 : W.kind === 'tbm' ? (W.man ? 0.9 : 0.85) : (W.rcs ?? 1) <= 0.06 ? 0.7 : 0.6);
  function forecast(key) {
    const o = key[0] === 'o' ? C.S.objects.find((q) => q.id === +key.slice(1)) : null; if (!o) return null;
    let E = 0; for (const [k] of planComp()) for (const i of idxOf(k, key)) if (!launchedU(k, i)) E += (AG[k].dmg || 0) * 0.9 * pSurv(AG[k]);
    return { o, k: o.dead ? 1 : Math.min(1, E / Math.max(1, o.hp)), over: E / Math.max(1, o.hp), hp: o.hp, hpMax: o.hpMax };
  }
  const fcCol = (f) => (f >= 1 ? '#4ade80' : f >= 0.75 ? '#fde047' : '#f87171');
  // «+»: свободная (без цели) единица этого типа — на цель; нет — купить (в бою — заказ, улетит через 30 с); «−»: снять (до боя — вернуть очки)
  // баллистика: правило на волну / на атакующую команду (online-multi.js tbmCheck) с учётом взятого союзниками
  function tbmRoom(add) { const al = st.net && st.net.room && st.net.room.allies, n = al ? al.length : 1, me = st.net && st.net.me && st.net.me.id;
    const other = al ? sumN(...al.filter((p) => p.id !== me).map((p) => p.tbn || {})) : {}, mine = {};
    for (const [k, v] of Object.entries(st.plan.n)) if (AG[k] && AG[k].kind === 'tbm') mine[k] = v;
    if (add) mine[add] = (mine[add] || 0) + 1;
    const all = sumN(other, mine); return { rule: TBM_RULE(n), other: tbmOf(other), used: tbmOf(all), kinzhal: all.kinzhal || 0, iskander: all.iskander || 0, arrw: all.arrw || 0, deny: add ? tbmCheck(all, n) : null }; }
  function addTo(key, k) {
    if (lockedStrike(k)) { say(LOCK_SAY); snd.deny(); return false; }
    const free = idxOf(k, null).filter((i) => !launchedU(k, i));
    if (free.length) { setTkey(k, free[0], key); return true; }
    if (AG[k].kind === 'tbm') { const b = tbmRoom(k); if (b.deny) { say(`${b.deny} ${st.net ? tr('на команду') : tr('на волну')}${b.other ? tr(' (у союзников уже {0})', [b.other]) : ''}`, 3); snd.deny(); return false; } }
    if (planCost() + (THREAT[k] ?? 3) > st.budget) { say(tr('Не хватает очков угрозы')); snd.deny(); return false; }
    const i = st.plan.n[k] = (st.plan.n[k] || 0) + 1; setTkey(k, i - 1, key);
    if (st.phase === 'wave') { st.addQ[k] = (st.addQ[k] || 0) + 1; st.addT = 1.5; }
    return true;
  }
  function removeFrom(key, k) {
    const idx = idxOf(k, key).filter((i) => !launchedU(k, i)); if (!idx.length) return false;
    const j = idx[idx.length - 1];
    if (st.phase === 'wave') { setTkey(k, j, null); return true; } // в бою — без цели (пойдёт поровну); очки уже потрачены
    const c = cfgOf(k); if (j < c.units.length) c.units.splice(j, 1); st.plan.n[k]--; return true;
  }
  function spread() { // без цели — поровну по целям наряда (нет целей — по выбранным по умолчанию); ложные цели — на ПВО
    const T = tgtObjs().length ? tgtObjs() : st.targets; let r = 0;
    for (const [k] of planComp()) for (const i of idxOf(k, null)) { if (launchedU(k, i)) continue; setTkey(k, i, AG[k].decoyMun ? 'sam' : 'o' + T[r++ % T.length].id); }
  }
  const tKeys = () => { // цели наряда по порядку: объекты, «ПВО», конкретные ЗРК
    const ks = new Set(); for (const [k] of planComp()) for (let i = 0; i < (st.plan.n[k] || 0); i++) { const t = tkeyOf(k, i); if (t) ks.add(t); }
    return [...ks].sort((a, b) => (a[0] === 'o' ? 0 : a === 'sam' ? 1 : 2) - (b[0] === 'o' ? 0 : b === 'sam' ? 1 : 2));
  };
  const allocTxt = (key) => planComp().filter(([k]) => !AG[k].recon).map(([k]) => [k, idxOf(k, key)]).filter(([, ix]) => ix.length).map(([k, ix]) => `${AG[k].short} ${numTxt(ix)}`).join(' · ');
  function targetRows() {
    let h = `<div class="cat-h">${tr('Цели — коснитесь объекта на карте')}</div>`;
    for (const key of [...tKeys().filter((q) => q !== 'sam'), 'sam']) {
      const f = forecast(key), a = allocTxt(key);
      h += `<div class="dcard ${a ? 'on' : ''}" data-a="tsel" data-v="${key}"><div class="nm"><b>${tName(key)}${f ? ` · <span style="color:${fcCol(f.k)}">≈ ${Math.round(f.k * 100)} %${f.over >= 1.5 ? tr(' (запас ×{0})', [f.over.toFixed(1).replace('.', ',')]) : ''}</span>` : ''}</b><span>${a || (key === 'sam' ? tr('ничего — коснитесь, чтобы назначить') : tr('наряд пуст'))}</span></div><span class="pr">›</span></div>`;
    }
    const free = planComp().filter(([k]) => !AG[k].recon).map(([k]) => [k, idxOf(k, null).filter((i) => !launchedU(k, i)).length]).filter(([, n]) => n);
    if (free.length) h += `<div class="dcard" style="border-color:#f59e0b"><div class="nm"><b>${tr('Без цели')}</b><span>${tr('{0} — пойдут поровну по целям', [free.map(([k, n]) => `${AG[k].short} ×${n}`).join(', ')])}</span></div><button class="btn alt mini2" data-a="spread">${tr('Раздать поровну')}</button></div>`;
    return h;
  }
  // карточка цели: прочность и прогноз, по каждому типу — сколько здесь, «−» / «+»
  function renderTgtCard() {
    const key = st.tsel, f = forecast(key), left = st.budget - planCost(), wave = st.phase === 'wave', DD = planDefaults(planComp(), st.targets, st.plan.cfg, st.net ? LIM_ON : undefined);
    const tb = tbmRoom();
    let h = `<h3>${tr('Наряд на «{0}»', [tName(key)])}</h3><div>${tr('Очки угрозы: <b style="color:#fde68a">{0}</b> · баллистика <b>{1}/{2}</b>{3}{4}', [left, tb.used, tb.rule[TBM_EXCL.find((k) => tb[k])] ?? tb.rule.total, tb.kinzhal ? tr(' («Кинжал» — без другой)') : tb.iskander ? tr(' («Искандер» — без другой)') : tb.arrw ? tr(' (ARRW — без другой)') : tr(' («Кинжал», «Искандер» и ARRW — только без другой)'), st.net ? tr(' на команду') : ''])}</div>`;
    if (f) h += `<div style="margin:6px 0"><div style="height:8px;border-radius:4px;background:rgba(255,255,255,.12);overflow:hidden"><div style="height:100%;width:${Math.round(100 * f.hp / f.hpMax)}%;background:#94a3b8"></div></div>
      <div style="margin-top:4px">${tr('Прочность {0}/{1} · наряд разрушит', [Math.round(f.hp), f.hpMax])} <b style="color:${fcCol(f.k)}">≈ ${Math.round(f.k * 100)} %</b>${f.over >= 1.5 ? tr(' · запас ×{0} — часть можно перенести на другие цели', [f.over.toFixed(1).replace('.', ',')]) : ''}</div><p class="hint">${tr('Оценка: часть собьют (дроны чаще, баллистику реже), ложные цели урона не наносят.{0}', [f.k < 1 ? tr(' Мало — добавьте ещё.') : ''])}</p></div>`;
    else if (key === 'sam') h += `<p class="hint">${tr('Где ПВО, заранее неизвестно. Назначенные сюда бьют по комплексам, засечённым к моменту пуска (разведчик, излучение РЛС, пуски ЗУР); если таких нет, то по целям наряда. По комплексам, которых разведчик не видел, баллистика промахивается сильнее. Ложные цели лучше назначать сюда: ПВО тратит на них ракеты.')}</p>`;
    else h += `<p class="hint">${tr('Засечённый комплекс ПВО: назначенные сюда бьют именно по нему (уничтожен — по другим засечённым).')}</p>`;
    for (const [k, via] of multiItems(attSide()).filter(([q]) => !st.opts.items || st.opts.items.has(q) || idxOf(q, key).length)) { // урок — только нужные типы
      const W = AG[k], here = idxOf(k, key), done = here.filter((i) => launchedU(k, i)).length, free = idxOf(k, null).filter((i) => !launchedU(k, i)).length, c = THREAT[k] ?? 3, tbFull = W.kind === 'tbm' && !free && !!tbmRoom(k).deny;
      h += `<div class="dcard ${here.length ? 'on' : ''} ${lockedStrike(k) ? 'no' : ''}"><div class="nm"><b>${lockedStrike(k) ? ico('lock') + ' ' : ''}${W.short} ×${here.length}</b><span>${via ? CARRIERS[via].name : W.kind === 'tbm' ? tr('пусковая') : tr('своим ходом')}${W.decoyMun ? tr(' · ложная') : ''}${done ? tr(' · пущено {0}', [done]) : ''}${free ? tr(' · без цели: {0}', [free]) : ''}</span></div>
        <span class="pr">${free ? '' : c}</span><button class="btn alt mini" data-a="tdec" data-k="${k}">−</button><button class="btn alt mini ${(!free && c > left) || tbFull ? 'no' : ''}" data-a="tinc" data-k="${k}">+</button></div>`;
      if (here.length) { // единицы на этой цели: номер и время пуска; касание — её маршрут, высота, время
        const D = DD[k], tOf = (i) => (wave && C.ev ? C.ev.unitInfo(k, i).t : D ? D.units[i].t : 0);
        h += `<div class="useg">${here.map((i) => launchedU(k, i) ? `<span class="uchip done">${uName(k, i)} ${ico('ok', 'ii')}</span>` : `<button class="uchip" data-a="ued" data-k="${k}" data-i="${i}">${uName(k, i)} · ${fmtT(tOf(i))}${unitCfg(st.plan.cfg, k, i).pts ? tr(' · м') : ''}</button>`).join('')}${here.length - done > 1 ? `<button class="uchip all" data-a="ged" data-k="${k}">${ico('cog', 'ii')}${tr('все {0}', [here.length - done])}</button>` : ''}</div>`;
      }
    }
    h += `<p class="hint">${iconize(tr('«+» берёт единицу без цели, а если её нет, покупает новую ({0}). «−» — {1}. Коснитесь единицы: маршрут, высота и время пуска («м» — свой маршрут). «⚙ все» — те же настройки для всех единиц этого типа здесь.', [wave ? tr('в бою — пуск через 30 с после заказа') : tr('за очки угрозы'), wave ? tr('снять с цели (ещё не пущенную)') : tr('убрать и вернуть очки')]))}</p>
      <div class="dact"><button class="btn" data-a="tclose">${tr('Готово')}</button></div>`;
    setSide(h);
  }
  // окно правки (из карточки цели): «Все здесь» — единицы этого типа на этой цели, или одна единица («Калибр 3»);
  // маршрут (точки на карте) и высота — у крылатых и дронов; время пуска; смена цели единицы
  function renderTypeEd() {
    const k = st.edKey, W = AG[k], tb = W.kind === 'tbm', n = st.plan.n[k] || 0, via = (multiItems(attSide()).find(([q]) => q === k) || [])[1];
    const wave = st.phase === 'wave' && C.ev, info = (i) => (wave ? C.ev.unitInfo(k, i) : { launched: false });
    const all = st.tsel ? idxOf(k, st.tsel) : Array.from({ length: n }, (_, i) => i), grp = all.filter((i) => !info(i).launched);
    if (st.edUnit !== null && (st.edUnit >= n || (st.tsel && !all.includes(st.edUnit)))) st.edUnit = null;
    if (st.edUnit === null && !grp.length) { st.edKey = null; renderSide(); return; }
    const D = planDefaults(planComp(), st.targets, st.plan.cfg, st.net ? LIM_ON : undefined)[k] || { units: [], tmin: 0, tmax: 600, dt: 2 }, c = cfgOf(k), one = st.edUnit !== null;
    const i0 = one ? st.edUnit : grp[0], u = unitCfg(st.plan.cfg, k, i0), sc = scopeCfg();
    const tOf = (i) => (wave && !info(i).launched ? info(i).t : D.units[i] ? D.units[i].t : 0), arrOf = (i) => (D.units[i] ? D.units[i].arrive : 0);
    const ts = (one ? [i0] : grp).map(tOf), t0 = Math.min(...ts), t1 = Math.max(...ts);
    let h = `<h3>${one ? uName(k, i0) : `${W.short} ${numTxt(grp)}`}${st.tsel ? ` → «${tName(st.tsel)}»` : ''}${wave ? tr(' · бой идёт') : ''}</h3>`;
    if (all.length > 1) h += segH('unit', one ? st.edUnit : -1, [[-1, tr('Все здесь ({0})', [grp.length])], ...all.map((i) => [i, `${i + 1}${info(i).launched ? ico('ok', 'ii') : c.units[i] && (c.units[i].pts || c.units[i].t != null || c.units[i].alt != null) ? '•' : ''}`])]);
    if (one && info(i0).launched) { setSide(h + `<p class="hint">${iconize(tr('{0} уже пущена — её не изменить. «✓» — пущенные.', [uName(k, i0)]))}</p><div class="dact"><button class="btn" data-a="rdone">${tr('Готово')}</button></div>`); return; }
    if (wave) h += `<p class="hint">${tr('Бой идёт: можно менять только то, что ещё не пущено. Время — не раньше «сейчас» и прилёта носителя на рубеж.')}</p>`;
    if (!one && grp.length > 1) h += `<p class="hint">${tr('Настройки — сразу для {0} единиц ({1} {2}). Одну — во вкладке с её номером («•» — есть свои).', [grp.length, W.short, numTxt(grp)])}</p>`;
    else if (one && via) h += `<p class="hint">${tr('{0} · носитель {1}', [uName(k, i0), carrierOf(n, via, i0) + 1])}</p>`;
    if (!tb) h += `<div class="cat-h">${tr('Маршрут')}</div><p class="hint">${tr('{0}. Точки маршрута ставьте внутри района (белый круг): касайтесь карты, до 3 точек, от края к цели. Точек: <b>{1}</b>. Без маршрута ракета идёт прямо к цели со своей стороны.', [W.uav ? tr('Дроны входят с края района (голубой круг)') : tr('Ракеты пускаются с рубежа {0} за краем района (оранжевый круг)', [via ? CARRIERS[via].name : tr('носителя')]), sc.pts ? sc.pts.length : u.pts ? u.pts.length : 0])}</p>
      <div class="cat-h">${tr('Высота полёта')}</div>${segH('alt', sc.alt ?? '', ALTS)}
      <p class="hint">${tr('Своя — {0} м{1}: РЛС видят поздно, но над городом работают пушки и ПЗРК. 3 км: дальние ЗРК видят издалека, зато пушки и ПЗРК не достают.', [W.alt, W.uav ? '' : tr(', огибая дома')])}</p>`;
    h += `<div class="cat-h">${tr('Время пуска')}</div><div>${tr('Пуск: <b style="color:#fde68a">{0}</b> от начала боя{1}', [t0 === t1 ? fmtT(t0) : `${fmtT(t0)}–${fmtT(t1)}`, wave ? '' : ` ${tr('· у цели ≈ <b>{0}</b>', [fmtT(Math.max(...(one ? [i0] : grp).map(arrOf)))])}`])}</div>
      <div class="seg">${STEPS.map((d) => `<button data-a="tstep" data-v="${d}">${tr('{0}{1} с', [d > 0 ? '+' : '−', Math.abs(d)])}</button>`).join('')}${wave ? `<button data-a="now">${tr('Пуск сейчас')}</button>` : ''}</div>
      <p class="hint">${tb ? tr('Баллистике ждать не страшно: пусковая за городом, пуск — в любой момент до 15 мин.') : W.uav ? tr('Дроны можно выпустить в любой момент до 10 мин.') : tr('Носителю нужно {0}, чтобы долететь до рубежа пуска. Долго ходить у района он не может: пуск не позже {1}, а между первым и последним пуском — не больше {2}.', [fmtT(D.tmin), fmtT(D.tmax), fmtT(CARRIER_WAIT)])}${!one && grp.length > 1 ? tr(' Сдвиг — для всех сразу, порядок сохраняется.') : ''}</p>`;
    if (one) h += `<div class="cat-h">${tr('Цель')}</div><div>${tkeyOf(k, i0) ? `«${tName(tkeyOf(k, i0))}»` : tr('без цели (поровну по целям)')}</div><div class="dact"><button class="btn alt" data-a="repick">${tr('Перенести на другую цель')}</button></div>${st.pick ? `<p class="hint">${tr('<b>Коснитесь новой цели на карте</b> (объект или засечённый ЗРК) или «ПВО противника»:')} <button class="btn alt mini2" data-a="pickSam">${tr('ПВО противника')}</button></p>` : ''}`;
    h += `<div class="dact">${tb ? '' : `<button class="btn alt" data-a="rclear">${tr('Сбросить маршрут')}</button>`}${one && all.length > 1 ? `<button class="btn alt" data-a="ureset">${tr('Как у всех здесь')}</button>` : ''}<button class="btn" data-a="rdone">${tr('Готово')}</button></div>`;
    setSide(h);
  }
  function renderAtkPlan() {
    { const T = tgtObjs(); if (T.length) st.targets = T; } // цели плана — те, на которые есть наряд
    if (st.edKey) return renderTypeEd();
    if (st.tsel) return renderTgtCard();
    const left = st.budget - planCost(), sk = attSide() === 'east' ? 'scout_e' : 'scout';
    let h = `<h3>${tr('План волны{0}', [st.net ? tr(' · раунд {0}/{1}{2}', [st.net.battle.round, st.net.battle.rounds, st.net.room && st.net.room.left != null ? tr(' · {0} с', [st.net.room.left]) : '']) : ''])}</h3><div>${tr('Очки угрозы: <b style="color:#fde68a">{0}</b> из {1}', [left, st.budget])}</div>`;
    h += `<div class="dcard"><div class="nm"><b>${AG[sk].short} ×1</b><span>${tr('разведчик: без боевой части, бесплатно. Засекает ПВО, летит сам с начала боя')}</span></div></div>`;
    h += targetRows();
    h += `<p class="hint">${tr('{0}коснитесь объекта на карте, откроется его наряд: «+» покупает единицу сразу на эту цель, там же у каждой единицы маршрут, высота и время пуска. Номера единиц («Калибр 3») те же на карте. Где ПВО противника, заранее неизвестно.', [planCost() ? '' : `<b>${tr('Соберите волну сами:')}</b> `])}</p>
      ${st.net ? netAllies() + `<button class="btn ${st.ready ? 'alt' : ''}" data-a="ready">${st.ready ? ico('ok', 'ii') + tr('Готов (снять)') : tr('Готов')}</button><p class="hint">${tr('Волна стартует, когда все готовы или кончится время подготовки. Пустой план — волны от вас не будет.')}</p>`
        : `<button class="btn" data-a="go" ${planCost() > 0 && left >= 0 && tKeys().length ? '' : 'disabled'}>${tr('Пуск')}</button>`}`;
    setSide(h);
  }
  function multiDefHint() {
    const comp = st.opts.comp || aiComp(), tbm = comp.filter(([k]) => AG[k].kind === 'tbm'), abm = Object.entries(SAM).filter(([k, s]) => s.abm && s.side === dside() && !lockedSam(k));
    return `<p class="hint">${tr('Ожидается: {0}.', [comp.filter(([k]) => !AG[k].recon).map(([k, n, , v]) => `${AG[k].short} ×${n}${v ? ` (${CARRIERS[v].name})` : ''}`).join(', ')])}</p>` +
      (tbm.length ? `<p class="hint">${abm.length ? tr('<b>Баллистика</b> приходит последней. Её сбивают только {0}, и только на снижении, в своей зоне. Сохраните им ракеты: не тратьте их на дроны и ложные цели.', [abm.map(([, s]) => s.short).join(', ')])
        : tr('<b>Баллистика</b> приходит последней. Сбить её нечем: сбивайте крылатые ракеты и носители, пока они не дошли.')}</p>` : ''); // у востока II эпохи против Lance противоракетных комплексов нет
  }
  function tbmPanel() { // в волне: летящая баллистика и кто её может перехватить
    const tb = C.S.wpns.filter((w) => w.ev && !w.dead && w.W.kind === 'tbm' && (!w.decoy || C.MODE().markers));
    if (!tb.length) return '';
    const abm = C.S.units.filter((u) => !u.dead && u.S.abm);
    return `<div class="dcard on" style="border-color:#ef4444"><div class="nm"><b style="color:#fca5a5">${tr('Баллистика: {0}', [tb.length])}</b><span>${tr('до падения {0} с · сбить можно только на снижении', [Math.min(...tb.map((w) => Math.ceil(w.T - w.t)))])}</span></div></div>` +
      (atk() ? '' : `<p class="hint">${abm.length ? abm.map((u) => `${u.S.short}: ${!u.emit ? tr('РЛС выключена!') : u.reloadT > 0 ? tr('перезарядка {0} с', [Math.ceil(u.reloadT)]) : tr('ракет {0}', [u.ammo])}`).join(' · ') : tr('Противоракетных комплексов нет — баллистику не сбить.')}</p>`);
  }
  function watchBtns() { return `<div class="dact"><button class="btn alt" data-a="watch">${tr('Смотреть')}${ico('tri', 'ii')}</button>${st.net ? '' : `<button class="btn alt" data-a="speed">${ico('speed', 'ii')}${tr('Время ×{0}', [st.timeK === 1 ? 4 : 1])}</button>`}</div>`; }
  function renderSide() {
    const S = C.S; if (!S) return;
    if (st.net && st.multi && st.phase === 'debrief') return renderNetRes();
    if (st.net && st.multi === 'def') return renderNetDef();
    if (st.net && !st.multi) return renderNet();
    if (atk() && st.phase === 'plan') return renderAtkPlan();
    let h = '';
    if (atk() && st.phase === 'wave' && st.edKey) return renderTypeEd();
    if (atk() && st.phase === 'wave' && st.tsel) return renderTgtCard();
    if (atk() && st.phase === 'wave') {
      const ev = C.ev, r = st.mres;
      h += `<h3>${tr('Волна идёт')}</h3><div>${tr('Пущено <b>{0}</b> · сбито <b>{1}</b> · попаданий <b>{2}</b>', [r.launched, r.down, r.hits])}</div><div>${tr('Цели разрушены на <b>{0}%</b>', [Math.round((1 - targetsValue()) * 100)])}</div>`;
      if (ev) for (const a of ev.carriers) h += `<div class="dcard"><div class="nm"><b>${a.carrierName}</b><span>${a.dead ? tr('сбит') : a.out ? tr('ушёл') : a.phase === 'wait' ? tr('на подлёте к рубежу пуска') : a.salvo.length ? tr('пуск: осталось {0}', [a.salvo.length]) : tr('уходит')}</span></div></div>`;
      if (ev) h += `<div class="cat-h">${tr('Наряд (можно менять) · очки угрозы: {0}', [st.budget - planCost()])}</div>` + targetRows() + `<p class="hint">${tr('Коснитесь цели (объекта или засечённого ЗРК): откроется её наряд. Можно докупить и перенацелить; у ещё не пущенных единиц — время («Пуск сейчас»), маршрут, высота.')}</p>`;
      h += tbmPanel() + watchBtns() + `<p class="hint">${tr('«Ход волны» слева: что летит, что будет и когда. «Смотреть» и «Ждать» — камера к событию. Коснитесь ракеты или носителя на карте, камера пойдёт за ним. Синие — ваши')}` + (st.net ? tr(', фиолетовые — союзников') : '') + `${tr(', красные — засечённые комплексы ПВО (жёлтый круг — РЛС излучает, «Пуск» — стреляет).')}</p>`;
      setSide(h); return;
    }
    if (st.phase === 'plan') {
      h += `<h3>${tr('Расстановка · {0}', [st.multi ? tr('Мульти-волна') : tr('волна {0}/{1}', [st.wave + 1, st.waves])])}</h3><div>${tr('Очки обороны: <b style="color:#fde68a">{0}</b>', [st.budget])}</div>`;
      if (st.multi) h += multiDefHint();
      if (st.sel && !st.sel.dead) {
        const u = st.sel;
        h += `<div class="dcard on"><div class="nm"><b>${u.S.name}${capsHtml(u.S, st.multi ? 'multi' : 'def')}</b><span>${tr('{0} · до {1} км · {2}', [SAM_TYPE[u.S.type], (u.S.rmax / 1000).toFixed(1), unitStatus(u)])}</span></div></div>${tgtRowHtml(u, st.multi ? 'multi' : 'def')}
          <div class="dact">${moveBtns(u)}<button class="btn alt" data-a="sell">${tr('Продать +{0}', [Math.round((u.paid || SAM_COST[u.key]) * 0.7)])}</button>
          ${u.S.radar && u.S.type !== 'guns' ? `<button class="btn alt" data-a="amb">${u.ambush ? tr('Засада: вкл') : tr('Засада: выкл')}</button>` : ''}${st.moving ? '' : `<button class="btn alt" data-a="desel">${tr('Готово')}</button>`}</div>${moveHint()}`;
      }
      h += placeCard() + `<div class="cat-h">${tr('Купить')}</div>`;
      const al = st.opts.allow, cat = Object.entries(SAM);
      if (al) cat.sort(([a], [b]) => al.has(b) - al.has(a)); // урок: нужное — сверху
      for (const [k, s] of cat) {
        if (s.side !== dside() || (!st.multi && s.era > C.setup.era)) continue; // «Мульти-волна» — все комплексы своей стороны (замки «Реализма» — lockedSam ниже); «Оборона» — по эпохе (ревью)
        const c = SAM_COST[k], shut = st.opts.allow && !st.opts.allow.has(k), lk = lockedSam(k); // урок: покупать только то, о чём он
        h += `<div class="dcard ${st.placing === k ? 'on' : ''} ${c > st.budget || shut || lk ? 'no' : ''}" data-buy="${k}"><div class="nm"><b>${lk ? ico('lock') + ' ' : ''}${s.short}${capsHtml(s, st.multi ? 'multi' : 'def')}</b><span>${shut ? tr('не в этом уроке') : tr('{0} · {1} км / {2} км', [SAM_TYPE[s.type], (s.rmax / 1000).toFixed(1), (s.hmax / 1000).toFixed(1)])}</span></div><span class="pr">${c}</span></div>`;
      }
      h += `<p class="hint">${st.placing ? (IS_TOUCH ? tr('Касайтесь карты, пока место не устроит, затем «Подтвердить». Зелёная тень — зона комплекса на высоте 300 м, просветы — то, что закрывают дома. «Отмена» — не покупать.') : tr('Ведите мышь по карте: зелёная тень — зона комплекса на высоте 300 м, просветы — то, что закрывают дома. Щелчок выбирает место (можно менять), затем «Подтвердить» или Enter. «Отмена», Esc или правая кнопка — не покупать.')) : tr('Выберите комплекс в каталоге и коснитесь карты. Коснитесь своего комплекса: тень его зоны на высоте 300 м, перенос (новое место и «Подтвердить») или продажа.')}</p>`;
      h += `<button class="btn" data-a="go" ${S.units.filter((u) => !u.dead).length ? '' : 'disabled'}>${tr('В бой — {0}', [st.multi ? tr('Мульти-волна') : tr('волна {0}', [st.wave + 1])])}</button>`;
    } else if (st.phase === 'wave') {
      const air = C.raid.planes.filter((a) => !a.dead && !a.out).length + C.S.wpns.filter((w) => w.ev && !w.dead && (C.MODE().markers || seen.has(w))).length; // и ракеты / дроны Мульти-волны, которые видит сеть
      h += `<h3>${tr('Волна {0}/{1}', [st.wave, st.waves])}</h3><div>${tr('В воздухе: <b>{0}</b> · сбито: <b>{1}</b>', [air, st.waveDowns])}</div>`;
      if (st.sel && !st.sel.dead) {
        const u = st.sel;
        h += `<div class="dcard on"><div class="nm"><b>${u.S.name}${capsHtml(u.S, st.multi ? 'multi' : 'def')}</b><span>${unitStatus(u)}</span></div></div>${tgtRowHtml(u, st.multi ? 'multi' : 'def')}<div class="dact">
          ${u.S.type === 'jammer' ? '' : `<button class="btn" data-a="op">${tr('Управлять')}</button>`}
          ${u.S.radar ? `<button class="btn alt" data-a="emit">${u.emit ? tr('РЛС: выключить') : tr('РЛС: включить')}</button>` : ''}
          ${u.S.type === 'jammer' ? '' : `<button class="btn alt" data-a="hold">${u.hold ? tr('Огонь: свободный') : tr('Огонь: по команде')}</button>`}<button class="btn alt" data-a="desel">${tr('Снять выбор')}</button></div>`;
      } else h += `<p class="hint">${tr('Коснитесь комплекса: приказы и «Управлять» — сесть оператором. Красные треугольники — цели, которые видит сеть РЛС (высота над землёй, м).')}</p>`;
      if (C.ev) h += tbmPanel() + watchBtns();
    } else if (st.phase === 'debrief') {
      const r = st.res;
      h += `<h3>${tr('Волна {0} отбита', [st.wave])}</h3><div class="stats" style="margin:6px 0"><div class="stt"><b>${r.downs}</b><span>${tr('сбито')}</span></div><div class="stt"><b>${r.leak}</b><span>${tr('ушли')}</span></div>
        <div class="stt"><b>${r.lost}</b><span>${tr('потеряно ЗРК')}</span></div><div class="stt"><b>${Math.round(r.value * 100)}%</b><span>${tr('объекты целы')}</span></div></div>
        <div>${tr('+{0} очков обороны · всего очков {1}', [r.reward, st.score])}</div><button class="btn" data-a="next">${tr('К расстановке — волна {0}', [st.wave + 1])}</button>`;
    }
    setSide(h);
  }
  side.onclick = (e) => {
    const b = e.target.closest('[data-a]'), buy = e.target.closest('[data-buy]');
    if (b && (b.dataset.a === 'pok' || b.dataset.a === 'pno')) { if (b.dataset.a === 'pok') confirmDraft(); else cancelDraft(); return; }
    if (buy && lockedSam(buy.dataset.buy)) { say(LOCK_SAY); snd.deny(); return; }
    if (buy && st.net) { const k = buy.dataset.buy, lim = netLeft(k); if (costOf(k) > st.budget || (lim !== null && lim <= 0)) { say(lim !== null && lim <= 0 ? tr('Лимит первой волны для этого класса') : tr('Не хватает очков обороны')); snd.deny(); } else { st.placing = st.placing === k ? null : k; st.sel = null; st.moving = false; st.draft = null; snd.click(); } renderSide(); return; }
    if (b && st.net && !(st.multi === 'atk' && b.dataset.a !== 'ready')) {
      const u = st.sel, a = b.dataset.a;
      if (a === 'ready') { st.ready = !st.ready; st.net.ready(st.ready); }
      else if (a === 'desel') { st.sel = null; st.moving = false; st.draft = null; }
      else if (a === 'move' && u && mine(u)) { st.moving = !st.moving; st.draft = null; }
      else if (a === 'sell' && u && mine(u)) { st.net.sell(u.id); st.sel = null; }
      else if (a === 'emit' && u && mine(u)) C.S.setEmit(u, !u.emit);
      else if (a === 'op' && u && mine(u)) enterOp(u);
      else if (a === 'help') { const q = st.op && !st.op.dead ? st.op : u && !u.dead && mine(u) ? u : C.S.units.find((x) => !x.dead && mine(x)); if (C.askHelp) C.askHelp(q ? [q.pos.x, q.pos.z] : [view.cx, view.cz]); } // метка — у своего комплекса (за пультом, выбранного или любого), иначе — центр карты
      else if (a === 'hold' && u && mine(u)) { u.hold = !u.hold; st.net.send({ t: 'hold', id: u.id, on: u.hold }); }
      else if ((a === 'tg' || a === 'tgall') && u && mine(u)) setTgtCat(u, a === 'tg' ? b.dataset.k : 'all');
      snd.click(); renderSide(); return;
    }
    if (buy && st.opts.allow && !st.opts.allow.has(buy.dataset.buy)) { say(tr('В этом уроке — {0}', [[...st.opts.allow].filter((k) => SAM[k] && SAM[k].side === C.setup.side).map((k) => `«${SAM[k].short}»`).join(tr(' или '))]), 3); snd.deny(); return; }
    if (buy) { const k = buy.dataset.buy; if (SAM_COST[k] > st.budget) { say(tr('Не хватает очков обороны')); snd.deny(); } else { st.placing = st.placing === k ? null : k; st.sel = null; st.moving = false; st.draft = null; snd.click(); } renderSide(); return; }
    if (!b) return;
    const u = st.sel, a = b.dataset.a;
    if (a === 'winc') { // докупка во время волны: копится 1,5 с (пачка — на одном носителе), потом — в расписание
      const k = b.dataset.k; if (lockedStrike(k)) { say(LOCK_SAY); snd.deny(); return; } if (planCost() + (THREAT[k] ?? 3) > st.budget) { say(tr('Не хватает очков угрозы')); snd.deny(); return; }
      st.plan.n[k] = (st.plan.n[k] || 0) + 1; st.addQ[k] = (st.addQ[k] || 0) + 1; st.addT = 1.5; snd.click(); renderSide(); return;
    }
    if (a === 'inc' || a === 'dec') { // состав удара
      const k = b.dataset.k, n = st.plan.n[k] || 0;
      if (a === 'inc' && lockedStrike(k)) { say(LOCK_SAY); snd.deny(); return; }
      if (a === 'inc' && planCost() + (THREAT[k] ?? 3) > st.budget) { say(tr('Не хватает очков угрозы')); snd.deny(); return; }
      st.plan.n[k] = Math.max(0, n + (a === 'inc' ? 1 : -1)); snd.click(); renderSide(); return;
    }
    if (a === 'ed') { st.edKey = b.dataset.k; st.edUnit = null; st.tsel = null; st.pick = null; cfgOf(st.edKey); snd.click(); renderSide(); return; }
    if (a === 'ued' || a === 'ged') { st.edKey = b.dataset.k; st.edUnit = a === 'ued' ? +b.dataset.i : null; st.pick = null; cfgOf(st.edKey); snd.click(); renderSide(); return; } // из карточки цели: единица / все этого типа здесь
    if (a === 'tsel') { st.tsel = b.dataset.v; st.edKey = null; snd.click(); renderSide(); return; }
    if (a === 'tclose') { st.tsel = null; snd.click(); renderSide(); return; }
    if (a === 'tinc' || a === 'tdec') { const k = b.dataset.k, ok = a === 'tinc' ? addTo(st.tsel, k) : removeFrom(st.tsel, k); if (ok) { snd.click(); afterEdit(); } else if (a === 'tdec') snd.deny(); return; }
    if (a === 'spread') { spread(); snd.click(); afterEdit(); return; }
    if (a === 'repick') { st.pick = { k: st.edKey, i: st.edUnit }; say(tr('Коснитесь новой цели на карте или «ПВО противника»'), 3); snd.click(); renderSide(); return; }
    if (a === 'pickSam' && st.pick) { setTkey(st.pick.k, st.pick.i, 'sam'); st.pick = null; st.tsel = 'sam'; snd.click(); afterEdit(); return; }
    if (a === 'unit') { st.edUnit = +b.dataset.v < 0 ? null : +b.dataset.v; snd.click(); renderSide(); return; }
    if (a === 'alt') { const v = b.dataset.v ? +b.dataset.v : null; scopeSet((q) => { q.alt = v; }); snd.click(); afterEdit(); return; }
    if (a === 'tgt') { // цель: все / объект / ПВО; у единицы «как у всех» — снять своё
      const sc = scopeCfg(), v = b.dataset.v, inherit = v === 'auto' && st.edUnit !== null;
      sc.sam = inherit ? undefined : v === 'sam'; sc.tgt = inherit ? undefined : v[0] === 'o' ? +v.slice(1) : null; snd.click(); afterEdit(); return;
    }
    if (a === 'ureset') { const c = cfgOf(st.edKey), o = c.units[st.edUnit] || {}; c.units[st.edUnit] = { sam: o.sam, sid: o.sid, tgt: o.tgt }; snd.click(); afterEdit(); return; } // цель остаётся — сброс маршрута, высоты, времени
    if (a === 'now') { // «Пуск сейчас»: единица — как только может (носитель — когда долетит до рубежа); тип — все ещё не пущенные
      const k = st.edKey, n = st.plan.n[k], c = cfgOf(k), ev = C.ev; if (!ev) return;
      const idx = st.edUnit !== null ? [st.edUnit] : edGrp() || Array.from({ length: n }, (_, i) => i);
      let j = 0; for (const i of idx) { const f = ev.unitInfo(k, i); if (f.launched) continue; c.units[i] = c.units[i] || {}; c.units[i].t = Math.ceil(f.earliest + j++ * (AG[k].kind === 'tbm' ? 3 : 2)); }
      afterEdit(); snd.click(); say(tr('Пуск — как только сможет'), 2); return;
    }
    if (a === 'tstep') { // время пуска: от текущего, в пределах типа; у носителя — окно его пусков не шире CARRIER_WAIT
      const k = st.edKey, D = planDefaults(planComp(), st.targets, st.plan.cfg, st.net ? LIM_ON : undefined)[k]; if (!D) return;
      const d = +b.dataset.v, n = st.plan.n[k], via = (multiItems(attSide()).find(([q]) => q === k) || [])[1];
      const grp = st.edUnit === null && edGrp();
      if (grp) { // все этого типа на цели: общий сдвиг (порядок сохраняется) — насколько позволяет самая стеснённая единица
        const mv = new Set(grp), L = [];
        for (const i of grp) {
          let lo = D.tmin, hi = D.tmax, cur = D.units[i].t;
          if (st.phase === 'wave' && C.ev) { const f = C.ev.unitInfo(k, i); if (f.launched) continue; lo = Math.max(lo, Math.ceil(f.earliest)); cur = Math.round(f.t); }
          if (via && CARRIERS[via]) { const j = carrierOf(n, via, i), oth = D.units.filter((q, m) => !mv.has(m) && q.carrier === j).map((q) => q.t); if (oth.length) { lo = Math.max(lo, Math.max(...oth) - CARRIER_WAIT); hi = Math.min(hi, Math.min(...oth) + CARRIER_WAIT); } }
          L.push([i, lo, hi, cur]);
        }
        let dd = d; for (const [, lo, hi, cur] of L) dd = d > 0 ? Math.min(dd, hi - cur) : Math.max(dd, lo - cur);
        if (!L.length || (d > 0 ? dd <= 0 : dd >= 0)) { say(d > 0 ? tr('Позже нельзя: носитель не ждёт, а у дронов и баллистики — свой предел') : tr('Раньше нельзя'), 3); snd.deny(); return; }
        const c = cfgOf(k); for (const [i, , , cur] of L) (c.units[i] = c.units[i] || {}).t = cur + dd;
        snd.click(); afterEdit(); return;
      }
      let lo = D.tmin, hi = D.tmax, why = '';
      if (st.phase === 'wave' && C.ev) { const f = st.edUnit !== null ? C.ev.unitInfo(k, st.edUnit) : null; lo = Math.max(lo, Math.ceil(f && !f.launched ? f.earliest : C.ev.t + 1)); if (f && !f.launched) D.units[st.edUnit].t = Math.round(f.t); }
      if (st.edUnit !== null && via && CARRIERS[via]) { // остальные ракеты этого носителя
        const j = carrierOf(n, via, st.edUnit), oth = D.units.filter((q, i) => i !== st.edUnit && q.carrier === j).map((q) => q.t);
        if (oth.length) { lo = Math.max(lo, Math.max(...oth) - CARRIER_WAIT); hi = Math.min(hi, Math.min(...oth) + CARRIER_WAIT); why = tr(' — носитель не ждёт у района больше {0}', [fmtT(CARRIER_WAIT)]); }
      }
      const cur = st.edUnit === null ? D.tType : D.units[st.edUnit].t, t = Math.min(hi, Math.max(lo, cur + d));
      if (t === cur) { say(d > 0 ? tr('Позже нельзя: не позже {0}{1}', [fmtT(hi), hi < D.tmax ? why : '']) : tr('Раньше нельзя: не раньше {0}{1}', [fmtT(lo), lo > D.tmin ? why : '']), 3); snd.deny(); return; }
      scopeCfg().t = t; snd.click(); afterEdit(); return;
    }
    if (a === 'rclear') { if (st.edUnit === null && !edGrp()) scopeCfg().pts = []; else scopeSet((q) => { q.pts = undefined; }); snd.click(); afterEdit(); return; }
    if (a === 'rdone') { st.edKey = null; st.pick = null; snd.click(); renderSide(); return; }
    if (a === 'watch') { watch(null); return; }
    if (a === 'speed') { st.timeK = st.timeK === 1 ? 4 : 1; snd.click(); renderSide(); return; }
    if (a === 'go') startWave();
    else if (a === 'next') { st.phase = 'plan'; renderSide(); }
    else if (a === 'desel') { st.sel = null; st.moving = false; st.draft = null; }
    else if (a === 'move') { st.moving = !st.moving; st.draft = null; }
    else if (a === 'sell' && u) { st.budget += Math.round((u.paid || SAM_COST[u.key]) * 0.7); C.S.removeUnit(u); C.syncUnits(); st.sel = null; }
    else if (a === 'amb' && u) { u.ambush = !u.ambush; u.emit = !u.ambush; }
    else if (a === 'emit' && u) { C.S.setEmit(u, !u.emit); on('radar', u); }
    else if (a === 'hold' && u) u.hold = !u.hold;
    else if ((a === 'tg' || a === 'tgall') && u) setTgtCat(u, a === 'tg' ? b.dataset.k : 'all');
    else if (a === 'op' && u) enterOp(u);
    snd.click(); renderSide();
  };

  // ═════════════ Волны ═════════════
  const cityValue = () => C.S.objects.reduce((s, o) => s + (o.dead || o.noTarget ? 0 : o.value * Math.max(0, o.hp / o.hpMax)), 0) / st.value0;
  function startWave() {
    st.phase = 'wave'; st.wave++; C.bev('', st.multi ? tr('волна пошла') : tr('волна {0}', [st.wave])); st.placing = null; st.moving = false; st.draft = null; st.waveDowns = 0; st.waveLeak = 0; st.waveLost = [];
    const alive = C.S.objects.filter((o) => !o.dead && !o.noTarget); // цели волн — только военные объекты
    if (!atk()) st.targets = st.opts.tkeys ? alive.filter((o) => st.opts.tkeys.includes(o.key)) : pickTargets({ objects: alive }, st.rnd, st.wave > 3 || st.multi ? 3 : 2, [...new Set(alive.map((o) => o.key))]); // урок — свои цели
    st.tv0 = st.targets.reduce((s, o) => s + o.value * Math.max(0, o.hp / o.hpMax), 0) || 1;
    st.mres = { launched: 0, down: 0, hits: 0, carriers: 0 }; st.timeK = 1; st.sirenC = st.sirenT = false;
    document.body.classList.toggle('evon', atk()); if (atk()) { evOpen = !IS_TOUCH; document.body.classList.toggle('evopen', evOpen); }
    // последняя волна — «Мульти-волна» (если у атакующей стороны в этой эпохе есть чем: arsenal.js COMBINED)
    const att = attSide();
    C.ev = null;
    if (atk()) { st.tsel = null; st.edKey = null; st.pick = null; const T = tgtObjs().filter((o) => !o.dead); if (T.length) st.targets = T; placeAiDef(); } // цели — из наряда; ИИ-ПВО — по уровню наряда
    if (st.multi || (!st.opts.wave && !st.net && C.setup.cs !== false && st.wave === st.waves && combinedOk(att, C.setup.era))) {
      const o = atk() ? { comp: planComp(), plan: st.plan.cfg } : st.opts.comp ? { comp: st.opts.comp } : {}; // opts.comp — свой состав удара (урок)
      C.ev = createCombined(C.S, city, st.rnd, { side: att, era: st.multi && !atk() ? aiWaveLevel() : C.setup.era, raid: C.raid, ...o }); C.ev.start(st.targets);
      if (C.evReady) C.evReady(C.ev); // модели ракет, дронов и пусковых — загрузить
    } else if (st.opts.wave) st.opts.wave(C.raid, st.rnd, st.wave, st.targets);
    else { const kn = C.diff ? C.diff.knobs('defense', C.setup.diff) : null; C.raid.spawnWave(Math.max(2, Math.round(WAVE_N[Math.min(st.wave, WAVE_N.length) - 1] * (kn ? kn.wave : 1))), st.wave, st.targets); } // сложность: размер волны
    for (const u of C.S.units) u.cov = null;
    snd.alarm();
    say(atk() ? tr('Волна пошла: разведчик над городом, остальное — по вашему расписанию («Ход волны» слева). Цели: {0}', [st.targets.map((o) => o.name).join(', ')]) : C.ev ? tr('Волна {0}: {1} — разведка и дроны, затем крылатые ракеты, в конце баллистика. Цели: {2}', [st.wave, COMBINED_NAME.toLowerCase(), st.targets.map((o) => o.name).join(', ')]) : tr('Волна {0}: цели — {1}', [st.wave, st.targets.map((o) => o.name).join(', ')]), 6);
    on('waveStart', st.wave); renderSide();
  }
  // ценность целей удара, что осталась (0…1)
  const targetsValue = () => st.targets.reduce((s, o) => s + o.value * Math.max(0, o.dead ? 0 : o.hp / o.hpMax), 0) / (st.tv0 || 1);
  function endWave() {
    if (st.view === 'op') leaveOp();
    if (st.view === 'watch') unwatch();
    document.body.classList.remove('evon', 'evopen');
    if (st.multi) return finishMulti();
    C.ev = null;
    if (st.waveDowns) C.bev('g', tr('сбито {0}', [st.waveDowns])); // за волну — одной меткой
    const value = cityValue(), reward = 250 + 60 * st.waveDowns + 120 * st.wave;
    const lost = C.S.units.filter((u) => u.dead);
    for (const u of lost) C.S.removeUnit(u);
    C.syncUnits();
    for (const u of C.S.units) { u.ammo = u.S.ammo; u.reloadT = 0; u.track = null; u.desig = null; } // перезарядка между волнами
    st.budget += reward; st.lostUnits += lost.length;
    st.score += Math.round((st.waveDowns * 150 + value * 300) * (C.setup.diff === 'real' ? 1.5 : 1));
    st.res = { downs: st.waveDowns, leak: st.waveLeak, lost: lost.length, value, reward };
    on('waveEnd', st.wave, st.res);
    if (value <= 0.25) return finish(tr('Потеряно 75 % ценности военных объектов и больше'), false);
    if (st.wave >= st.waves) return finish(tr('Все {0} волн отбиты', [st.waves]), true);
    st.phase = 'debrief'; st.sel = null; renderSide(); snd.good();
  }
  // «Мульти-волна»: итог по целям удара — разрушено половина ценности и больше — удар удался, иначе — ПВО отстояла
  // прокачка: комплексы, на которых играли, и заказанные удары → airdef-solo (длительность меряет сервер)
  const usedSams = () => (C.progress ? C.progress.usedSams(C.S.units.filter((u) => u.S && u.S.side === dside()).map((u) => u.key)) : []);
  const usedStrikes = () => (C.progress && st.plan ? C.progress.usedStrikes(Object.keys(st.plan.n || {}).filter((k) => st.plan.n[k] > 0)) : []);
  const claim = (ev, used) => { if (C.progress) setTimeout(() => C.progress.runClaim(ev, used), 950); };
  function finishMulti() {
    if (st.over) return; st.over = true; C.ev = null;
    const dmg = 1 - targetsValue(), r = st.mres, real = C.setup.diff === 'real' ? 1.5 : 1;
    C.bev(dmg >= 0.5 ? (atk() ? 'g' : 'r') : (atk() ? 'r' : 'g'), tr('разрушено {0} %', [Math.round(dmg * 100)])); // итог удара — последняя метка
    st.dmg = dmg; st.win = atk() ? dmg >= 0.5 : dmg < 0.5; // урок (noEnd) — читает итог сам
    if (st.opts.noEnd) return;
    if (atk()) {
      const win = dmg >= 0.5, score = Math.round((dmg * 1000 + st.lostUnits * 60) * real);
      C.showEnd({ title: win ? tr('Волна прорвалась') : tr('Волна отражена'), reason: tr('Цели разрушены на {0} % (нужно 50 %)', [Math.round(dmg * 100)]), win,
        stats: [[r.launched, tr('пущено')], [r.down, tr('сбито ПВО')], [`${Math.round(dmg * 100)}%`, tr('цели разрушены')], [score, tr('очков')]],
        note: tr('Уничтожено комплексов ПВО: {0}. Носителей потеряно: {1}. {2}', [st.lostUnits, r.carriers, real > 1 ? tr('Реализм — очки ×1,5.') : '']) });
      C.menu.record('multi', score, {}); claim({ mwObj: Math.round(dmg * 50), mwSam: st.lostUnits, win }, usedStrikes()); return;
    }
    st.lostUnits = C.S.units.filter((u) => u.dead).length;
    const win = dmg < 0.5, score = Math.round(((1 - dmg) * 1000 + st.downs * 40) * real);
    C.showEnd({ title: win ? tr('Волна отражена') : tr('Волна прорвалась'), reason: tr('Цели разрушены на {0} % (поражение — от 50 %)', [Math.round(dmg * 100)]), win,
      stats: [[st.downs, tr('сбито')], [`${Math.round((1 - dmg) * 100)}%`, tr('цели целы')], [st.lostUnits, tr('потеряно ЗРК')], [score, tr('очков')]],
      note: real > 1 ? tr('Реализм — очки ×1,5.') : '' });
    C.menu.record('multi', score, {}); claim({ mwInt: st.downs * 3, win }, usedSams()); // перехват: ≈ 3 очка угрозы на цель
  }
  function finish(why, win) {
    if (st.over) return; st.over = true; st.win = win;
    if (st.view === 'op') leaveOp();
    if (st.opts.noEnd) return;
    C.bev(win === true ? 'g' : win === false ? 'r' : '', win === true ? tr('город отстоял') : win === false ? tr('оборона прорвана') : tr('бой завершён'));
    C.showEnd({ title: win ? tr('Город отстоял') : win === false ? tr('Оборона прорвана') : tr('Бой завершён'), reason: why, win,
      stats: [[st.downs, tr('самолётов сбито')], [`${st.wave}/${st.waves}`, tr('волн')], [`${Math.round(cityValue() * 100)}%`, tr('объекты целы')], [st.score, tr('очков')]],
      note: tr('Потеряно комплексов: {0}. {1}', [st.lostUnits, C.setup.diff === 'real' ? tr('Реализм — очки ×1,5.') : '']) });
    C.menu.record('defense', st.score, { waves: win ? st.waves : st.wave - 1 });
    const held = win ? st.waves : st.wave - 1; claim({ downs: st.downs, waves: Array.from({ length: Math.max(0, held) }, (_, i) => i + 1), win: !!win }, usedSams());
  }

  // ═════════════ Оператор ═════════════
  const ppi = $('ppi'), pc = ppi.getContext('2d');
  const op = { yaw: 0, pitch: 0.1, fov: 60, dragging: null, msg: '', msgT: 0, follow: true, fireHeld: false,
    cam: 'op', oy: 0, op: 0.3, od: 1, orbit: false, R: 12, m: null, mEnd: 0, mLast: new THREE.Vector3() }; // камеры: оператор / снаружи / за ракетой
  const CAMS = { op: tr('вид оператора'), ext: tr('снаружи — пусковая от третьего лица'), chase: tr('за ракетой') };
  // у ПЗРК вида снаружи нет (модели стрелка нет): оператор ↔ за ракетой
  const manpads = (u) => !!(u && u.S.type === 'ir' && u.S.hp <= 15);
  // «БИНОКЛЬ»: только при захвате — камера с сильным увеличением прямо на захваченную цель (видно, какой стороной она к вам
  // и как маневрирует — важно для тепловой ГСН). Захват сорвался или цель сменилась — сам выключается, нужен новый захват
  function binoToggle() {
    const u = st.op; if (!u) return;
    if (op.bino) { binoOff(tr('Бинокль выключен')); snd.click(); return; }
    if (!u.track || u.track.dead) { opSay(tr('Бинокль — только когда цель захвачена')); snd.deny(); return; }
    op.bino = true; op.binoT = u.track; op.binoCam = op.cam; op.cam = 'op'; op.bf = 0; op.bDir = null; $('opBino').classList.add('on'); $('opCam').classList.remove('on'); snd.click(); on('bino', u);
  }
  function binoOff(msg) { if (!op.bino) return; op.bino = false; op.cam = op.binoCam || 'op'; $('opBino').classList.remove('on'); $('opCam').classList.toggle('on', op.cam !== 'op'); if (msg) opSay(msg); }
  const binoLen = (a) => (a.W ? (a.W.vis ? a.W.vis.L : 5) : a.M ? a.M.L : a.len || 17);
  function cycleCam() { const LF = st.op && LNCH[st.op.key]; if (LF && LF.fp) { opSay(tr('У этой установки — только вид оператора')); snd.deny(); return; } if (op.bino) binoOff(); op.cam = op.cam === 'op' ? (manpads(st.op) ? 'chase' : 'ext') : op.cam === 'ext' ? 'chase' : 'op'; op.orbit = false; op.od = 1; opSay(tr('Камера: ') + CAMS[op.cam]); snd.click(); $('opCam').classList.toggle('on', op.cam !== 'op'); }
  const DIR = V3(), TMP = V3(), LEAD = V3(), EYE = V3();
  function enterOp(u) {
    if (st.op) leaveOp();
    st.op = u; st.view = 'op'; C.S.setManual(u, true); op.camInit = false; obs.clear(); op.bino = false; $('opBino').classList.remove('on');
    const t = nearestTarget(u);
    TMP.copy(t ? t.pos : C.S.objects[0] ? new THREE.Vector3(C.S.objects[0].x, 400, C.S.objects[0].z) : TMP.set(0, 400, 0)).sub(u.pos);
    op.yaw = Math.atan2(-TMP.x, -TMP.z); op.pitch = clamp(Math.atan2(TMP.y, Math.hypot(TMP.x, TMP.z)), 0.02, 1.2); op.fov = u.S.hp <= 15 ? 40 : 55; op.follow = true;
    // размер машины (вместе с пусковыми) — для камеры «снаружи»
    const g = C.unitMeshes.get(u.id); op.R = g ? Math.max(4, new THREE.Box3().setFromObject(g).getSize(TMP).length() * 0.5) : 12; op.m = null; op.orbit = false;
    document.body.classList.remove('dmap'); document.body.classList.add('oper');
    $('opMethod').style.display = u.S.type === 'command' ? 'flex' : 'none';
    $('opRadar').style.display = u.S.radar ? 'flex' : 'none';
    $('opFire').title = u.S.type === 'guns' ? tr('Огонь') : tr('Пуск'); ofb.s = ''; ofb.cool = 0; ofb.ammo = u.ammo;
    on('op', u); snd.click();
  }
  function leaveOp() {
    const u = st.op; if (u) { C.S.setManual(u, false); u.gunFire = false; }
    binoOff(); st.op = null; st.view = 'map'; op.fireHeld = false;
    document.body.classList.remove('oper'); document.body.classList.add('dmap');
    C.setFov(62); renderSide();
  }
  // цели оператора: самолёты (и ложные цели), а у «Тора», «Панциря», PAC-3 — ещё и летящее оружие
  // цели оператора: самолёты; «Тор» / «Панцирь» — и летящее оружие; удар (ev): крылатые и дроны — любому ЗРК, баллистика — противоракетным
  const opT = (u) => {
    if (!u) return C.raid.alive();
    const ev = C.S.wpns.filter((w) => !w.dead && w.ev && w.t > 1.5 && (w.W.kind !== 'tbm' || (u.S.abm && w.vel.y < 0)));
    return u.S.antiMun ? [...C.raid.alive(), ...C.S.wpns.filter((w) => !w.dead && w.t > 1.5 && w.W.kind !== 'decoy' && !w.ev), ...ev] : [...C.raid.alive(), ...ev];
  };
  // класс отметки по траектории, скорости и ЭПР: «Аркада» — сразу, «Реализм» — после ~2,5 с наблюдения (до этого «?»).
  // Ложная цель для РЛС — самолёт (в этом её смысл); летящее оружие вообще видят только комплексы с antiMun
  const obs = new Map(); // цель → секунд под наблюдением оператора
  const CLS = { bomb: tr('Бомба'), lgb: tr('Бомба'), tvb: tr('Бомба'), gps: tr('Бомба'), agm: tr('УР'), arm: tr('ПРР'), cruise: tr('КР') };
  const clsOf = (a) => (a.isMun ? CLS[a.W.kind] || tr('Оружие') : tr('Самолёт'));
  const clsKnown = (a) => C.MODE().markers || (obs.get(a) || 0) > 2.5;
  function nearestTarget(u) { let b = null, bd = 1e12; for (const a of opT(st.op)) { const d = a.pos.distanceToSquared(u.pos); if (d < bd) { bd = d; b = a; } } return b; }
  // кого видит этот комплекс (РЛС — если излучает; иначе глаз/оптика)
  const sees = (u, a) => (u.S.radar && u.emit && C.S.radarSees(u, a)) || C.S.eyesSee(u, a);
  function cycleTarget() {
    const u = st.op; if (!u) return;
    const list = opT(st.op).filter((a) => sees(u, a)).sort((a, b) => a.pos.distanceTo(u.pos) - b.pos.distanceTo(u.pos));
    if (!list.length) { opSay(tr('Нет целей в обзоре')); return; }
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
    if (why) { opSay(why); snd.deny(); } else { opSay(tr('ПУСК!')); on('launch', u); }
  }
  // касание и перетаскивание в 3D-виде: тянуть — поворот, касание отметки цели — назначить
  {
    const d = $('opDrag'); let drag = null;
    d.addEventListener('pointerdown', (e) => { drag = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: 0 }; d.setPointerCapture(e.pointerId); });
    d.addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.moved += Math.abs(dx) + Math.abs(dy); drag.x = e.clientX; drag.y = e.clientY;
      if (drag.moved > 6) {
        if (op.bino) return; // в бинокль — взгляд держит цель
        if (op.cam !== 'op') { const k = 0.006 * C.sens.look; if (!op.orbit) { op.orbit = true; op.oy = op.camYaw; } op.oy -= dx * k; op.op = clamp(op.op + dy * k, -1.35, 1.3); op.follow = false; return; } // снаружи — облёт камерой (ниже земли не опускается — взгляд поднимается)
        const k = op.fov * D2R / C.VH * C.sens.look; op.yaw -= dx * k; op.pitch = clamp(op.pitch - dy * k, -0.15, 1.5); op.follow = false; // палец вправо — взгляд вправо, вверх — вверх (как в шутерах)
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
      if (best) designate(best); else opSay(tr('Коснитесь отметки цели'));
    });
    const btn = (id, fn) => $(id).addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); fn(); });
    btn('opMap', () => leaveOp());
    btn('opAuto', () => C.setAuto(!C.auto));
    btn('opCam', () => cycleCam());
    btn('opBino', () => binoToggle());
    btn('opRadar', () => { const u = st.op; if (u && u.S.radar) { C.S.setEmit(u, !u.emit); snd.click(); on('radar', u); } });
    btn('opMethod', () => { const u = st.op; if (u) { u.method = u.method === 'half' ? '3t' : 'half'; snd.click(); opSay(u.method === 'half' ? tr('Метод: половинное спрямление') : tr('Метод: три точки')); } });
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
  // кнопка «ПУСК» оператора: «3/4» — ракет в пакете; по часовой — красным выдержка между пусками, зелёным — готово, жёлтым — набор
  // захвата; после последней ракеты — тускло-жёлтая перезарядка и вместо ракет — секунды. Онлайн выдержки в снимке нет — считаем сами
  const ofb = { s: '', cool: 0, ammo: 0, t: 0 };
  function opFireBtn(u, dt) {
    const b = $('opFire'), S = u.S, guns = S.type === 'guns';
    if (u.ammo < ofb.ammo - 0.5 && !guns) ofb.cool = 1.6; ofb.ammo = u.ammo; if (ofb.cool > 0) ofb.cool -= dt;
    if ((ofb.t -= dt) > 0) return; ofb.t = 0.08;
    if (u.reloadT > (u.reload0 || 0)) u.reload0 = u.reloadT; // онлайн: полное время — по наибольшему увиденному
    const cool = Math.max(u.cool || 0, ofb.cool), acq = (S.radar ? S.radar.acq : 2) * (C.MODE().reactK || 1);
    let p, c, txt;
    if (u.reloadT > 0) { p = 1 - u.reloadT / Math.max(1, u.reload0 || u.reloadT); c = 'rgba(232,176,74,.32)'; txt = tr('{0}с', [Math.ceil(u.reloadT)]); }
    else {
      txt = guns ? `${Math.round(100 * u.ammo / S.ammo)}%` : `${Math.round(u.ammo)}/${S.ammo}`;
      if (cool > 0 && !guns) { p = 1 - cool / 1.6; c = 'rgba(239,68,68,.6)'; }
      else if (u.desig && !u.track && !u.desig.dead) { p = clamp(u.seeT / acq, 0, 1); c = 'rgba(250,204,21,.6)'; }
      else { p = 1; c = 'rgba(74,222,128,.5)'; }
    }
    const key = `${txt}|${Math.round(p * 60)}|${c}`; if (key === ofb.s) return; ofb.s = key;
    b.innerHTML = `<span>${ico('fire')}<em>${txt}</em></span>`; if (b.style.setProperty) { b.style.setProperty('--fb', `${Math.round(p * 360)}deg`); b.style.setProperty('--fc', c); }
  }
  function opHud(dt, t) {
    const u = st.op, hx = C.hx, VW = C.VW, VH = C.VH, S = u.S;
    if (u.dead) { opSay(tr('Комплекс уничтожен')); leaveOp(); return; }
    hx.lineWidth = 1.5; hx.font = '600 11px "Golos Text", -apple-system, Segoe UI, sans-serif'; hx.textAlign = 'center';
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
      if (a === u.track) hx.fillText(tr('Захват'), p[0], p[1] - s - 5);
      const name = known ? clsOf(a) : '?', key = a === u.track || a === u.desig; // назначенная — всегда своей подписью
      const g = !key && labs.find((q) => !q.key && q.name === name && Math.hypot(q.x - p[0], q.y - p[1]) < 28);
      if (g) g.n++; else labs.push({ a, name, key, x: p[0], y: p[1], s, col, n: 1 });
    }
    for (const q of labs) { hx.fillStyle = q.col; hx.fillText(tr('{0}{1} · {2} км · {3} м', [q.name, q.n > 1 ? ' ×' + q.n : '', (q.a.pos.distanceTo(u.pos) / 1000).toFixed(1), Math.round(q.a.pos.y - city.groundH(q.a.pos.x, q.a.pos.z))]), q.x, q.y + q.s + 12); }
    // пушка: кружок упреждения для цели в секторе ствола
    if (S.type === 'guns' && u.gunTgt) {
      C.S.gunLead(u, u.gunTgt, LEAD); const p = C.proj(LEAD);
      if (p) { hx.strokeStyle = '#fde047'; hx.beginPath(); hx.arc(p[0], p[1], 9, 0, 7); hx.stroke(); hx.beginPath(); hx.arc(p[0], p[1], 1.5, 0, 7); hx.fill(); }
    }
    // онлайн: комплекс, за пультом которого союзник, — метка с именем
    if (st.net) for (const q of C.S.units) {
      if (q === u || q.dead || mine(q) || !q.manual) continue;
      const p = C.proj(TMP.copy(q.pos).setY(q.pos.y + 7)); if (!p) continue;
      hx.strokeStyle = '#38bdf8'; hx.fillStyle = '#7dd3fc'; hx.beginPath(); hx.moveTo(p[0], p[1] + 8); hx.lineTo(p[0] - 7, p[1] - 4); hx.lineTo(p[0] + 7, p[1] - 4); hx.closePath(); hx.stroke();
      hx.fillText(tr('{0} · {1} · {2} км', [allyName(q.owner), q.S.short, (q.pos.distanceTo(u.pos) / 1000).toFixed(1)]), p[0], p[1] - 10);
    }
    // свои ракеты
    for (const m of C.S.sams) { if (m.dead || m.unit !== u) continue; const p = C.proj(m.pos); if (p) { hx.fillStyle = '#fff'; hx.beginPath(); hx.arc(p[0], p[1], 3, 0, 7); hx.fill(); } }
    // ПРР летит в этот комплекс — предупреждение
    const arm = C.S.wpns.find((w) => !w.dead && w.W.kind === 'arm' && w.target === u);
    // строка состояния
    const trk = u.track || u.desig, d = trk ? trk.pos.distanceTo(u.pos) : 0, h = trk ? trk.pos.y - city.groundH(trk.pos.x, trk.pos.z) : 0;
    const zone = !trk ? '' : trk.W && trk.W.kind === 'tbm' && C.S.inZone(u, trk) && (d > S.rmax || h > S.hmax) ? tr('Пуск в упреждение') : d > S.rmax ? tr('Далеко') : d < S.rmin ? tr('Близко') : h > S.hmax ? tr('Высоко') : h < S.hmin ? tr('Низко') : tr('В зоне');
    // название со значками «что сбивает» — только при смене комплекса (ревью 2026-10-25: разбор SVG каждый кадр — нагрев), строка состояния — каждый кадр
    const oi = $('opInfo'); if (oi._S !== S || oi._m !== st.multi || !oi.lastChild) { oi._S = S; oi._m = st.multi; oi.innerHTML = `<div class="oc"><b>${S.name}</b>${capsHtml(S, st.multi ? 'multi' : 'def')} · ${SAM_TYPE[S.type]}</div><div class="ot"></div>`; }
    oi.lastChild.innerHTML = `${clock()}${C.auto ? `${tr('<b style="color:#86efac">Авто</b> ·')} ` : ''}${unitStatus(u)}${S.type === 'command' ? tr(' · метод: {0}', [u.method === 'half' ? tr('половинное спрямление') : tr('три точки')]) : ''}` +
      (trk ? tr('<br>цель: {0} км, {1} м — <b>{2}</b>{3}', [(d / 1000).toFixed(1), Math.round(h), zone, !u.track && u.desig ? tr(' · захват {0}%', [Math.round(clamp(u.seeT / ((S.radar ? S.radar.acq : 2) * (C.MODE().reactK || 1)), 0, 1) * 100)]) : '']) : S.type === 'ir' ? tr('<br>наведите перекрестие на самолёт — ГСН «зарычит» и захватит') : S.type === 'guns' ? tr('<br>ведите ствол в жёлтый кружок упреждения и держите «Огонь»') : tr('<br>коснитесь отметки цели на экране или на круговом обзоре'))
      + (arm ? `<br><span class="st">${ico('hazard', 'ii')}${tr('ПРР ЛЕТИТ В ВАС — выключите РЛС!')}</span>` : '') + (op.msgT > 0 ? `<br><span class="st">${op.msg}</span>` : '');
    $('opRadar').classList.toggle('on', !!u.emit); $('opRadar').title = u.emit ? tr('РЛС включена — выключить') : tr('РЛС выключена — включить'); // иконка закрашена — излучает
    opFireBtn(u, dt);
    $('opBino').classList.toggle('off', !op.bino && !(u.track && !u.track.dead)); // без захвата — недоступен
    if (op.bino && u.track) { // ракурс и манёвр цели
      const tg = u.track, v = tg.vel && tg.vel.lengthSq() > 1 ? TMP.copy(tg.vel).normalize() : tg.dir ? TMP.copy(tg.dir) : null;
      let asp = '', man = '';
      if (v) {
        const c = v.dot(LEAD.copy(u.pos).sub(tg.pos).normalize());
        asp = c > 0.7 ? tr('идёт на вас — нос к вам') : c < -0.7 ? tr('уходит — хвост к вам') : tr('проходит боком');
        const yaw = Math.atan2(v.x, v.z); if (op.bDir !== null && op.bDir !== undefined && dt > 0) { let dy = yaw - op.bDir; while (dy > Math.PI) dy -= 2 * Math.PI; while (dy < -Math.PI) dy += 2 * Math.PI; op.bTurn = (op.bTurn || 0) * 0.9 + (dy / dt) * 0.1; } op.bDir = yaw;
        man = Math.abs(op.bTurn || 0) > 0.12 ? tr(' · разворот') : v.y > 0.25 ? tr(' · набирает высоту') : v.y < -0.25 ? tr(' · снижается') : '';
      }
      hx.font = '700 13px "Golos Text", -apple-system, Segoe UI, sans-serif'; hx.textAlign = 'center'; hx.fillStyle = '#fde68a'; hx.shadowColor = 'rgba(0,0,0,.85)'; hx.shadowBlur = 4;
      hx.fillText(tr('Бинокль ×{0} · {1}{2}', [Math.max(2, Math.round(55 / (op.bf || 55))), asp, man]), VW / 2, Math.max(60, VH * 0.14)); hx.shadowBlur = 0;
    }
    $('opMethod').textContent = u.method === 'half' ? tr('Метод ½') : tr('Метод 3Т');
    if (arm && !op.armWarned) { op.armWarned = true; snd.alarm(); on('arm', u, arm); } else if (!arm) op.armWarned = false;
    drawPpi(t);
    // звук: тон ГСН у ИК, тон захвата
    if (S.type === 'ir') snd.growl(u.seek ? (u.track ? 0.05 : 0.03) : 0, u.track ? 900 : 420 + (u.seek || 0) * 200); // онлайн у комплекса нет seek (не в снимке) — было NaN и ошибка звука
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
      if (inAir < 1 && (AO.launchT += dt) > 0.6) { const why = C.S.launch(u); if (!why) { opSay(tr('Авто: пуск')); on('launch', u); } AO.launchT = why ? 0.3 : 0; }
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
    const LNe = LNCH[u.key]; if (LNe && LNe.eye) { const L0 = LNe.L[0]; lnchToWorld({ ...u, lel: 0 }, L0, [LNe.eye[0] - L0.cp[0], LNe.eye[1] - L0.cp[1], LNe.eye[2] - L0.cp[2]], EYE); } // eye — точка оператора в башне (Phalanx): вид от установки, поворачивается с ней
    if (op.bino) {
      const tg = u.track;
      if (!tg || tg.dead || tg !== op.binoT) binoOff(tr('Захват потерян — бинокль выключен, нужен новый захват'));
      else { // цель — примерно четверть высоты кадра; поле зрения меняем ступенями (смена — пересчёт кадра)
        const d = Math.max(60, tg.pos.distanceTo(EYE)), f = clamp(2 * Math.atan(binoLen(tg) * 2.2 / d) / D2R, 0.3, 14);
        if (!op.bf || Math.abs(f - op.bf) / op.bf > 0.12) op.bf = f;
        camera.position.copy(EYE); camera.up.set(0, 1, 0); camera.lookAt(tg.pos); C.setFov(op.bf); return;
      }
    }
    if (op.cam !== 'op' && !(LNe && LNe.fp)) { extCamera(dt, u); return; }
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

  // ═════════════ «Мульти-волна»: лента событий удара ═════════════
  // слева выдвигается список: разведка, дроны, носители (вылет / к рубежу / пуск), пусковые (через сколько пуск), ракеты в полёте
  // с высотой, скоростью и временем до цели. «Смотреть» — камера сразу; «Ждать» — время ×4 до события, за 4 с — камера к нему
  const evp = $('evPanel'), evBtn = $('evBtn');
  let evOpen = false, evHold = false, evHtml = '', evList = [];
  evBtn.onclick = () => { evOpen = !evOpen; document.body.classList.toggle('evopen', evOpen); renderEv(true); snd.click(); };
  evp.addEventListener('pointerdown', () => { evHold = true; }); const evUp = () => setTimeout(() => { evHold = false; }, 60);
  addEventListener('pointerup', evUp, true); addEventListener('pointercancel', evUp, true);
  function renderEv(force) {
    if (!evOpen || !C.ev || (evHold && !force)) return;
    evList = C.ev.events(); let h = `<h3>${tr('Ход волны')}</h3>`, g = null;
    evList.forEach((e, i) => {
      const gk = e.ally ? `${e.ally}·${e.g}` : e.g;
      if (gk !== g) { g = gk; h += e.ally ? `<div class="cat-h ally">${tr('Союзник {0} · {1}', [esc(e.ally), trIf(e.g)])}</div>` : `<div class="cat-h">${trIf(e.g)}</div>`; }
      const eta = e.eta !== null && e.eta > 0 ? tr(' · через {0} с', [Math.ceil(e.eta)]) : '', cue = st.cue && st.cue.obj === e.cue, inT = e.eta !== null && e.eta > 0.5 ? tr('через {0} с', [Math.ceil(e.eta)]) : tr('вот-вот');
      const es = trFmt(e.sub), sub = es.includes('{eta}') ? es.replace('{eta}', inT) : es + (e.g === 'Носители' || e.g === 'Пусковые' ? '' : eta); // {eta} — время считаем здесь: не уходит в минус и не отстаёт
      h += `<div class="evr${e.obj && e.obj === st.watch ? ' on' : ''}"><div class="nm"><b>${trFmt(e.label)}</b><span>${sub}</span></div>
        ${e.obj && canWatch(e.obj) ? `<button class="btn alt mini2" data-i="${i}" data-a="see">${tr('Смотреть')}</button>` : ''}${e.cue && e.eta > 6 ? `<button class="btn alt mini2 ${cue ? 'on' : ''}" data-i="${i}" data-a="wait">${cue ? tr('Ждём…') : tr('Ждать')}</button>` : ''}</div>`;
    });
    if (st.cue) h += `<p class="hint">${tr('Ждём события: время ×4, за 4 с — камера к нему.')}</p>`;
    if (h !== evHtml) { evHtml = h; evp.innerHTML = h; }
  }
  evp.onclick = (e) => {
    const b = e.target.closest('[data-a]'); if (!b) return;
    const ev = evList[+b.dataset.i]; if (!ev) return;
    if (b.dataset.a === 'see' && ev.obj) { st.cue = null; watch(ev.obj); }
    else if (b.dataset.a === 'wait' && ev.cue) { st.cue = { obj: ev.cue, at: C.ev.t + ev.eta - 4 }; st.timeK = 4; say(tr('Ждём события — время ×4'), 2); snd.click(); }
    renderEv(true);
  };
  // ═════════════ «Мульти-волна»: камера за ракетой, хуки удара ═════════════
  // кого можно смотреть: за удар — свои ракеты, дроны, носители; за ПВО — то, что видит сеть, и баллистику
  function watchList() {
    const ev = C.S.wpns.filter((w) => w.ev && !w.dead && canWatch(w) && (atk() || C.MODE().markers || w.W.kind === 'tbm' || seen.has(w)));
    ev.sort((a, b) => (b.W.kind === 'tbm') - (a.W.kind === 'tbm') || a.id - b.id); // баллистика — первой
    const car = C.ev ? C.ev.carriers.filter((a) => !a.dead && !a.out && a.phase !== 'wait') : [];
    return [...ev, ...car];
  }
  // камера — только к оружию с готовой моделью (процедурную фигуру вблизи не показываем); носители и пусковые — всегда
  const canWatch = (o) => !o || !o.isMun || !o.W || weaponHasModel(o.key, o.W);
  function watch(o) {
    if (o && !canWatch(o)) { say(tr('Для этого оружия нет модели — следите по карте')); snd.deny(); return; }
    const L = watchList(); if (!L.length) { say(tr('Сейчас в воздухе смотреть не на что')); snd.deny(); return; }
    if (!o) { const i = L.indexOf(st.watch); o = L[(i + 1) % L.length]; }
    st.watch = o; st.watchEnd = 0; st.view = 'watch'; WCAM.init = false; WCAM.at = null; document.body.classList.remove('dmap'); document.body.classList.add('watch'); snd.click();
  }
  function unwatch() { st.watch = null; st.view = 'map'; document.body.classList.remove('watch'); document.body.classList.add('dmap'); renderSide(); }
  C.watchNext = () => watch(null); C.watchMap = () => unwatch(); C.watchSpeed = () => { st.timeK = st.timeK === 1 ? 4 : 1; };
  const WCAM = { init: false, off: V3(), look: V3() }, WD = V3(), WP = V3(), WS = V3();
  function watchCamera(dt) {
    const o = st.watch; if (!o) return;
    C.setFov(55);
    const L = o.len || (o.isLauncher ? 13 : o.W ? o.W.vis.L : 40), back = L * 2.2 + (o.W || o.isLauncher ? 10 : 30);
    if (o.vel && o.vel.lengthSq() > 1) WD.copy(o.vel); else WD.set(-Math.sin(o.yaw || 0), 0, -Math.cos(o.yaw || 0)); WD.normalize();
    // сзади, сбоку и чуть сверху — ракета видна сбоку, а не точкой с хвоста (на отвесном пикировании «бок» — по востоку)
    WS.set(-WD.z, 0, WD.x); if (WS.lengthSq() < 0.04) WS.set(1, 0, 0); WS.normalize();
    WP.copy(WD).multiplyScalar(-back).addScaledVector(WS, L * 1.3 + (o.W ? 3 : 10)); WP.y += L * 0.4 + (o.W ? 3 : o.isLauncher ? 6 : 12);
    // смещения камеры и точки взгляда — относительно цели (баллистика на спуске — 2 км/с, иначе камера отстаёт на километры)
    if (!WCAM.init) { WCAM.init = true; WCAM.off.copy(WP); WCAM.look.copy(WD).multiplyScalar(L * 2); }
    if (!o.dead && !o.out) { WCAM.off.lerp(WP, 1 - Math.exp(-dt * 2.5)); WCAM.look.lerp(TMP.copy(WD).multiplyScalar(L * 2), 1 - Math.exp(-dt * 6)); WCAM.at = o.pos; }
    camera.position.copy(WCAM.at || o.pos).add(WCAM.off);
    camera.position.y = Math.max(camera.position.y, city.topAt(camera.position.x, camera.position.z) + 2);
    camera.up.set(0, 1, 0); camera.lookAt(TMP.copy(WCAM.at || o.pos).add(WCAM.look));
  }
  function watchHud() {
    const o = st.watch; if (!o) return;
    if (o.isLauncher) { const ev = C.ev && C.ev.events().find((e) => e.obj === o); $('wInfo').textContent = `${trFmt(o.name)} · ${ev ? trFmt(ev.sub).replace('{eta}', ev.eta > 0.5 ? tr('через {0} с', [Math.ceil(ev.eta)]) : tr('вот-вот')) : ''}`; setWSpeed(); return; }
    const name = o.W ? `${o.W.short}${o.decoy && (atk() || C.MODE().markers) ? tr(' (ложная)') : ''}` : o.carrierName, h = Math.round(o.pos.y - city.groundH(o.pos.x, o.pos.z));
    const sp = Math.round((o.vel ? o.vel.length() : o.speed || 0) * 3.6), left = o.W && o.W.kind === 'tbm' ? tr(' · до падения {0} с', [Math.max(0, Math.ceil(o.T - o.t))]) : o.isMun && o.ev && o.aim && !o.W.recon ? tr(' · до цели {0} с', [Math.ceil(C.S.etaOf(o).t)]) : '';
    $('wInfo').textContent = tr('{0}{1} · высота {2} · {3} км/ч{4}{5}', [name, o.salvo && o.salvo.length && !o.inbound ? tr(' · пуск {0}/{1}', [o.n0 - o.salvo.length, o.n0]) : '', h > 9999 ? (h / 1000).toFixed(0) + tr(' км') : h + tr(' м'), sp, left, o.dead ? tr(' · поражена') : '']);
    setWSpeed();
  }
  function setWSpeed() { const k = st.timeK === 1 ? 4 : 1, e = $('wSpeed'); if (e._k !== k) { e._k = k; e.innerHTML = `${ico('speed', 'ii')}×${k}`; e.title = tr('Время ×{0}', [k]); } } // значок «перемотки» (Mark 2026-10-25)
  // за ПВО: сирена воздушной тревоги — когда пошли крылатые ракеты и ещё раз — когда пуск баллистики (раз за волну).
  // Аркада: плашка «Угроза …», сирена при баллистике доигрывает; реализм: без плашек, баллистика во время тревоги — сирена заново
  function siren(w) {
    if (!w.ev || w.decoy || w.W.uav || w.W.recon) return;
    // «Кинжал» и ARRW — своя тревога (и в реализме: о пуске с носителя объявляют отдельно), каждый пуск
    if (w.W.kind === 'tbm' && w.W.air) {
      snd.siren('tbm', true); st.sirenT = true;
      st.alert = (w.key === 'arrw' ? tr('Пуск ARRW с B-52H — у цели через ≈ {0} с', [Math.max(10, Math.round((w.T || 70) / 10) * 10)]) : tr('Пуск «Кинжала» с МиГ-31К — у цели через ≈ {0} с', [Math.max(10, Math.round((w.T || 70) / 10) * 10)])); st.alertTb = true; st.alertT = Math.max(st.alertT || 0, 8);
      return;
    }
    const tb = w.W.kind === 'tbm', arc = C.MODE().markers; if (tb ? st.sirenT : st.sirenC) return;
    if (tb) st.sirenT = true; else st.sirenC = true;
    if (!arc) { snd.siren(tb ? 'tbm' : 'cruise', tb); return; }
    const left = snd.siren(tb ? 'tbm' : 'cruise') || 6; // сирена уже звучит — доигрывает, меняется только надпись
    if (tb || !(st.alertT > 0 && st.alertTb)) { st.alert = tb ? tr('Угроза баллистических ракет') : tr('Угроза крылатых ракет'); st.alertTb = tb; } // баллистику крылатые не перебивают
    st.alertT = Math.max(st.alertT || 0, 6, left); // плашка — пока звучит сирена
  }
  function followLaunch(w) { if (w.launcher && st.watch === w.launcher && !w.decoy) st.watchNextAt = { w, at: C.t + 1.5 }; }
  // предупреждение о пуске баллистики (за ПВО): тревога, сколько до падения
  function tbmAlert(w) {
    if (!w || !w.ev || w.W.kind !== 'tbm' || w.decoy) return;
    say(tr('Пуск баллистической ракеты «{0}»! До падения ≈ {1} с — готовьте {2}', [w.W.short, Math.round(w.T), Object.values(SAM).some((s) => s.abm && s.side === dside()) ? tr('противоракетные ЗРК') : tr('укрытие')]), 5); snd.alarm();
  }
  function atkHooks() {
    return {
      aiDmgK: 1,
      planeDown(a) { if (a.role === 'carrier') { st.mres.carriers++; say(tr('Сбит носитель {0}{1}', [a.carrierName, a.salvo.length ? tr(' — не пущено ракет: {0}', [a.salvo.length]) : '']), 4); snd.alarm(); } },
      wpnRelease(w) { followLaunch(w); if (w.ev && !w.decoy && !w.W.recon) C.bev('y', w.W.kind === 'tbm' ? tr('баллистика') : tr('пуск волны'), w.W.kind === 'tbm' ? 'tbm' : 'launch', 1e9); if (w.ev && !w.W.recon && !w.decoy && w.W.kind !== 'tbm') st.mres.launched++; if (w.ev && w.W.kind === 'tbm' && !w.decoy) { st.mres.launched++; say(tr('Пуск: {0}, до цели ≈ {1} с', [w.W.short, Math.round(w.T)]), 3); } },
      wpnEnd(w, res) { if (!w.ev) return; if (res.intercepted) { if (!w.decoy) { st.mres.down++; C.bev('r', tr('перехваты'), 'icp', 12); } say(tr('ПВО сбила: {0}{1}', [w.W.short, w.decoy ? tr(' (ложная цель)') : '']), 2); } else if (res.objects.length || res.units.length) { st.mres.hits++; C.bev('g', tr('попадание'), 'hit', 10); } },
      objectDestroyed(o) { say(tr('Цель поражена: {0}', [o.name]), 3); C.bev('g', o.name); snd.good(); },
      unitDestroyed(u) { st.lostUnits++; say(tr('Уничтожен комплекс ПВО: {0}', [u.S.short]), 3); C.bev('g', tr('{0} уничтожен', [u.S.short])); snd.good(); },
    };
  }
  function defHooks() {
    return {
      aiDmgK: C.setup.diff === 'arcade' ? 1.25 : 1,
      planeDown(a) { if (a.role === 'decoy') { say(tr('Сбита ложная цель — ракеты потрачены впустую'), 2); return; } st.downs++; st.waveDowns++; say(tr('Сбит {0}!', [a.role === 'carrier' ? tr('носитель {0}{1}', [a.carrierName, a.salvo.length ? tr(' — не пущено ракет: {0}', [a.salvo.length]) : '']) : a.role === 'sead' ? tr('охотник за РЛС') : tr('ударник')]), 3); snd.good(); on('planeDown', a); },
      wpnEnd(w, res) { if (res.intercepted) { say(tr('Перехвачено: {0}{1}', [w.W.short, w.decoy ? tr(' (ложная цель)') : '']), 2); if (w.ev && !w.decoy && !w.W.recon) { st.downs++; st.waveDowns++; if (st.multi) C.bev('g', tr('перехваты'), 'icp', 12); } } },
      planeOut(a) { st.leaked++; st.waveLeak++; },
      objectDestroyed(o) { say(tr('Разрушен: {0}', [o.name]), 3); C.bev('r', tr('разрушен {0}', [o.name])); snd.alarm(); },
      unitDestroyed(u) { say(tr('Потерян комплекс: {0}', [u.S.short]), 3); C.bev('r', tr('потерян {0}', [u.S.short])); },
      wpnRelease(w) { if (w.W.kind === 'arm' && w.target) on('armLaunch', w); if (w.ev && w.W.kind === 'tbm' && !w.decoy) C.bev('y', tr('баллистика'), 'tbm' + st.wave, 1e9); tbmAlert(w); followLaunch(w); siren(w); },
    };
  }
  // ═════════════ Режим ═════════════
  function start(opts = {}) {
    st.opts = opts; st.aiPlace = null; C.ended = false; C.lastGame = opts.lastGame || 'defense';
    st.rnd = mulberry32((Date.now() & 0xffffff) ^ 0x2468);
    st.multi = opts.multi || null; st.defSide = null; st.flash = new Map(); st.watch = null; st.timeK = 1; st.cue = null; st.watchNextAt = null; st.edKey = null; st.edUnit = null; st.addQ = {}; st.addT = 0; st.alertT = 0;
    if (st.multi) { st.defSide = st.multi === 'atk' ? (C.setup.side === 'east' ? 'west' : 'east') : C.setup.side; opts.waves = 1; }
    C.newBattle({ defSide: dside(), era: C.setup.era, rnd: st.rnd, game: st.multi ? 'multi' : null });
    C.hooks = atk() ? atkHooks() : defHooks();
    const b0 = st.multi === 'atk' ? multiBudget() : st.multi ? Math.round(MULTI.sam * (C.setup.diff === 'arcade' ? 1.2 : 1)) : null;
    Object.assign(st, { phase: 'plan', wave: 0, waves: opts.waves || WAVES, budget: opts.budget ?? b0 ?? (C.setup.diff === 'arcade' ? 1200 : 1000), score: 0, downs: 0, leaked: 0, lostUnits: 0, placing: null, draft: null, sel: null, moving: false, view: 'map', op: null, over: false, win: null, targets: [] });
    st.value0 = C.S.objects.reduce((s, o) => s + (o.noTarget ? 0 : o.value), 0);
    for (const [k, x, z, roof] of opts.units || []) { const u = C.S.addUnit(k, x, z, { roof, skill: 0.75 }); u.paid = SAM_COST[k]; }
    if (atk()) { // ПВО противника — ИИ, как в «Вылете»; где она — заранее неизвестно (засекают разведчик, излучение РЛС, пуски)
      const kn = C.diff && !st.opts.prep ? C.diff.knobs('multi_atk', C.setup.diff) : null; // сложность ИИ-ПВО (не в уроке)
      st.targets = pickTargets(C.S, st.rnd, 3); st.aiPlace = { near: st.targets, kn };
      if (lesson()) placeAiDef(); // урок: ИИ-ПВО сразу, эпохи урока; иначе её ставит startWave — по плану игрока (aiDefLevel), планируя, он её всё равно не видит
      st.plan = { n: {}, cfg: {} }; st.edKey = null; st.tsel = null; st.pick = null; // готового состава нет: игрок сам собирает наряд под каждую цель
    }
    if (opts.prep) opts.prep(st, api); // урок: свои цели, готовый наряд, ИИ-ПВО
    if (st.multi && C.evPreload) C.evPreload(opts.comp || (atk() ? [[attSide() === 'east' ? 'scout_e' : 'scout', 1, 1]] : aiComp())); // модели — заранее (разведчик вылетает сразу)
    C.syncUnits(); seen.clear();
    document.body.classList.add('defense', 'dmap');
    document.body.classList.toggle('matk', atk());
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
      planeDown(a) { if (a.role === 'decoy') { say(tr('Сбита ложная цель'), 2); return; } say(tr('Самолёт сбит!'), 2); snd.good(); },
      wpnEnd(w, res) { if (res.intercepted) say(tr('Перехвачено: {0}', [w.W.short]), 2); },
      objectDestroyed(o) { say(tr('Разрушен: {0}', [o.name]), 3); snd.alarm(); },
      unitDestroyed(u) { say(tr('Потерян комплекс: {0}', [u.S.short]), 3); },
    };
    Object.assign(st, { phase: 'plan', wave: N.battle.wave || 1, waves: N.battle.waves, budget: 0, score: 0, downs: 0, leaked: 0, lostUnits: 0, placing: null, draft: null, sel: null, moving: false, view: 'map', op: null, over: false, ready: false, netRes: null });
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
    const ph = s === 'plan' ? 'plan' : s === 'play' ? 'wave' : s === 'debrief' || s === 'end' ? 'debrief' : st.phase;
    if (ph !== st.phase) {
      if (st.view === 'op' && ph !== 'wave') leaveOp();
      if (st.view === 'watch' && ph !== 'wave') unwatch();
      st.phase = ph; st.placing = null; st.moving = false; st.draft = null;
      if (ph === 'wave' && st.multi) netWaveStart();
      else if (ph === 'wave') { snd.alarm(); say(tr('Волна {0}: налёт!', [st.wave]), 3); }
      if (ph !== 'wave') document.body.classList.remove('evon', 'evopen');
      for (const u of C.S.units) u.cov = null;
    }
    if (st.multi) chatSync();
    if (st.view === 'map') renderSide();
  }
  // ═════════════ Онлайн «Мульти-волны» ═════════════
  // раунд: зеркало боя (net.js) — новое; роль — атака (план волны, как «За волну») или ПВО (расстановка, бой, пульт)
  function startNetMulti(N) {
    if (st.op) leaveOp(); if (st.view === 'watch') unwatch();
    const B = N.battle, role = N.myRole();
    st.net = N; st.multi = role; st.defSide = B.atk === 'east' ? 'west' : 'east'; st.opts = { noEnd: true }; C.ended = false; C.lastGame = 'online';
    if (!st.setupSave) st.setupSave = { era: C.setup.era, diff: C.setup.diff }; C.setup.era = B.era; C.setup.diff = B.mode === 'real' ? 'real' : 'arcade'; // эпоха и режим — матча (после боя — свои)
    st.rnd = mulberry32((Date.now() & 0xffffff) ^ 0x1357);
    C.hooks = role === 'atk' ? atkHooks() : defHooks();
    Object.assign(st, { phase: 'plan', wave: 1, waves: 1, budget: 0, score: 0, downs: 0, waveDowns: 0, leaked: 0, waveLeak: 0, lostUnits: 0, placing: null, draft: null, sel: null, moving: false, view: 'map', op: null, over: false, win: null, ready: false, netRes: null,
      watch: null, timeK: 1, cue: null, watchNextAt: null, edKey: null, edUnit: null, tsel: null, pick: null, addQ: {}, addT: 0, alertT: 0, sirenC: false, sirenT: false, flash: new Map(), mres: { launched: 0, down: 0, hits: 0, carriers: 0 }, targets: [] });
    st.plan = N.battle && N.battle.myPlan ? N.battle.myPlan : { n: {}, cfg: {} }; // переподключение: свой план — от сервера (иначе первая правка затёрла бы его пустым)
    st.value0 = C.S.objects.reduce((q, o) => q + (o.noTarget ? 0 : o.value), 0) || 1;
    C.ev = N.ev;
    C.syncUnits(); seen.clear();
    document.body.classList.add('defense', 'dmap'); document.body.classList.toggle('matk', role === 'atk'); document.body.classList.remove('evon', 'evopen');
    sizeMap(); fit(); netSync();
    say(role === 'atk' ? tr('Раунд {0}: ваша команда собирает волну — коснитесь целей на карте', [B.round]) : tr('Раунд {0}: вы — ПВО. Ставьте комплексы: что и куда полетит, неизвестно', [B.round]), 5);
  }
  function netWaveStart() {
    const military = C.S.objects.filter((o) => !o.noTarget && !o.dead);
    if (atk()) { st.tsel = null; st.edKey = null; st.pick = null; const T = tgtObjs().filter((o) => !o.dead); st.targets = T.length ? T : military; evOpen = !IS_TOUCH; document.body.classList.add('evon'); document.body.classList.toggle('evopen', evOpen); }
    else st.targets = military;
    st.tv0 = st.targets.reduce((q, o) => q + o.value * Math.max(0, o.hp / o.hpMax), 0) || 1;
    st.mres = { launched: 0, down: 0, hits: 0, carriers: 0 }; st.sirenC = st.sirenT = false;
    snd.alarm(); say(atk() ? tr('Волна пошла: разведчик над городом, остальное — по вашему расписанию («Ход волны» слева)') : tr('Волна пошла! Красные треугольники — что видит ваша сеть РЛС'), 5);
  }
  // союзники по атаке: сколько очков потратили и куда бьют (сводка сервера)
  function netAllies() {
    const N = st.net, al = (N.room && N.room.allies || []).filter((p) => p.id !== (N.me && N.me.id));
    if (!al.length) return '';
    return `<div class="cat-h">${tr('Союзники')}</div>` + al.map((p) => `<div class="dcard"><div class="nm"><b>${tr('{0} · {1} очк.', [esc(p.name), p.cost])}</b><span>${Object.entries(p.tg).map(([k, t]) => `${k === 'free' ? tr('без цели') : tName(k)}: ${t}`).join(' · ') || tr('ещё собирает')}</span></div></div>`).join('');
  }
  function renderNetDef() {
    const N = st.net, B = N.battle; let h = '';
    const left = N.room && N.room.left != null ? tr(' · {0} с', [N.room.left]) : '', who = TEAM_NAME[B.atk];
    if (st.phase === 'plan') {
      h += `<h3>${tr('Раунд {0}/{1} · расстановка ПВО{2}', [B.round, B.rounds, left])}</h3><div>${tr('Очки обороны: <b style="color:#fde68a">{0}</b>', [st.budget])}</div>
        <p class="hint">${tr('Волну собирает {0}: дроны, крылатые ракеты, баллистика. Что и по каким объектам, неизвестно. Пушки и ПЗРК ставьте у объектов, противоракетные — у самых ценных.', [who])}</p>`;
      if (st.sel && !st.sel.dead && mine(st.sel)) { const u = st.sel; h += `<div class="dcard on"><div class="nm"><b>${u.S.name}${capsHtml(u.S, 'multi')}</b><span>${tr('{0} · до {1} км', [SAM_TYPE[u.S.type], (u.S.rmax / 1000).toFixed(1)])}</span></div></div>${tgtRowHtml(u, 'multi')}<div class="dact">${moveBtns(u)}<button class="btn alt" data-a="sell">${tr('Продать +{0}', [Math.round(samCost(u.key) * 0.7)])}</button>${st.moving ? '' : `<button class="btn alt" data-a="desel">${tr('Готово')}</button>`}</div>${moveHint()}`; }
      else if (st.sel && !st.sel.dead) h += `<div class="dcard"><div class="nm"><b>${st.sel.S.name}</b><span>${tr('союзника')}</span></div></div>`;
      h += placeCard() + `<div class="cat-h">${tr('Купить')}</div>`;
      for (const [k, sm] of Object.entries(SAM)) { if (sm.side !== dside()) continue; /* без эпохи: все комплексы своей стороны (сервер проверяет, что куплено — samIds) */ const c = costOf(k), lk = lockedSam(k); h += `<div class="dcard ${st.placing === k ? 'on' : ''} ${c > st.budget || lk ? 'no' : ''}" data-buy="${k}"><div class="nm"><b>${sm.short}${capsHtml(sm, 'multi')}</b><span>${tr('{0} · {1} км{2}', [SAM_TYPE[sm.type], (sm.rmax / 1000).toFixed(1), sm.abm ? tr(' · сбивает баллистику') : ''])}</span></div><span class="pr">${c}</span></div>`; }
      h += `<button class="btn ${st.ready ? 'alt' : ''}" data-a="ready">${st.ready ? ico('ok', 'ii') + tr('Готов (снять)') : tr('Готов')}</button>`;
    } else if (st.phase === 'wave') {
      h += `<h3>${tr('Раунд {0}/{1} · оборона', [B.round, B.rounds])}</h3><div>${tr('Разрушено: <b>{0}%</b> ценности объектов', [Math.round(100 * (B.V || 0) / (B.v0 || 1))])}</div>`;
      if (st.sel && !st.sel.dead && mine(st.sel)) { const u = st.sel; h += `<div class="dcard on"><div class="nm"><b>${u.S.name}${capsHtml(u.S, 'multi')}</b><span>${unitStatus(u)}</span></div></div>${tgtRowHtml(u, 'multi')}<div class="dact">${u.S.type === 'jammer' ? '' : `<button class="btn" data-a="op">${tr('Управлять')}</button>`}${u.S.radar ? `<button class="btn alt" data-a="emit">${u.emit ? tr('РЛС: выключить') : tr('РЛС: включить')}</button>` : ''}${u.S.type === 'jammer' ? '' : `<button class="btn alt" data-a="hold">${u.hold ? tr('Огонь: свободный') : tr('Огонь: по команде')}</button>`}<button class="btn alt" data-a="desel">${tr('Снять выбор')}</button></div>`; }
      else h += `<p class="hint">${tr('Коснитесь своего комплекса: «Управлять» — сесть оператором, «Огонь: по команде» — беречь ракеты. Остальными стреляют расчёты.')}</p>`;
      h += tbmPanel() + watchBtns() + `<button class="btn alt" data-a="help">${tr('Нужна помощь — метка союзникам')}</button>`;
    }
    side.innerHTML = h;
  }
  // итоги раунда (и боя): кто сколько разрушил
  function renderNetRes() {
    const N = st.net, B = N.battle, r = st.netRes || B.res || {}, sc = r.scores || B.scores || { east: 0, west: 0 }, v0 = r.v0 || B.v0 || 1;
    side.innerHTML = `<h3>${tr('Раунд {0} — итоги', [r.round || B.round])}</h3><div>${tr('{0} в атаке: разрушено <b>{1}%</b> ценности', [TEAM_NAME[r.atk || B.atk], Math.round(100 * (r.k || 0))])}</div>
      <div class="stats" style="margin:6px 0"><div class="stt"><b>${Math.round(100 * sc.east / v0)}%</b><span>${tr('Восток')}</span></div><div class="stt"><b>${Math.round(100 * sc.west / v0)}%</b><span>${tr('Запад')}</span></div><div class="stt"><b>${r.downs ?? '–'}</b><span>${tr('сбито ПВО')}</span></div></div>
      <p class="hint">${r.last ? tr('Бой окончен — итоги…') : tr('Следующий раунд — стороны меняются: кто атаковал, теперь обороняется.')}</p>`;
  }
  // чат команды на подготовке: отдельное окно (не перерисовывается с панелью); касание имени — заглушить
  let chatEl = null;
  function chatSync() {
    const N = st.net, on = !!(N && st.multi && st.phase === 'plan' && document.body.classList.contains('defense'));
    if (!chatEl) {
      chatEl = document.createElement('div'); chatEl.id = 'netChat';
      chatEl.innerHTML = `<div class="log"></div><form class="row"><input maxlength="120" placeholder="${tr('Сообщение команде')}" enterkeyhint="send"><button>${ico('send')}</button></form>`;
      document.body.appendChild(chatEl);
      chatEl.querySelector('form').onsubmit = (e) => { e.preventDefault(); const i = chatEl.querySelector('input'), t = i.value.trim(); if (t && st.net) { st.net.say(t); i.value = ''; } };
      chatEl.querySelector('.log').onclick = (e) => { const b = e.target.closest('[data-mute]'); if (!b || !st.net) return; const id = +b.dataset.mute; if (st.net.me && id === st.net.me.id) return; st.net.mutes.add(id); st.net.chat = st.net.chat.filter((m) => m.id !== id); say(tr('Игрок заглушён — его сообщений больше не видно'), 2); chatSync(); };
    }
    chatEl.style.display = on ? 'block' : 'none'; if (!on) return;
    const me = N.me && N.me.id;
    chatEl.querySelector('.log').innerHTML = N.chat.slice(-7).map((m) => `<div><b data-mute="${m.id}" class="${m.id === me ? 'me' : ''}">${esc(m.name)}</b>: ${esc(m.text)}</div>`).join('') || `<div class="dim">${tr('Чат команды — договоритесь, кто что бьёт или прикрывает. Касание имени — заглушить.')}</div>`;
  }
  function stop() {
    if (st.op) leaveOp();
    st.net = null; if (chatEl) chatEl.style.display = 'none';
    if (st.setupSave) { C.setup.era = st.setupSave.era; C.setup.diff = st.setupSave.diff; st.setupSave = null; }
    for (const c of ['defense', 'dmap', 'oper', 'watch', 'matk', 'evon', 'evopen']) document.body.classList.remove(c);
    evOpen = false; evHtml = ''; sideHtml = '';
    st.watch = null; st.timeK = 1;
    side.innerHTML = ''; $('dtop').innerHTML = ''; snd.growl(0, 400);
  }
  let sideT = 0;
  function update(dt) {
    if (st.msgT > 0) st.msgT -= dt; if (op.msgT > 0) op.msgT -= dt; if (st.alertT > 0) st.alertT -= dt;
    if (st.phase !== 'wave' || st.over) return;
    // сеть ПВО: кого видит хоть одна РЛС или расчёт
    if (C.ev) for (const w of C.S.wpns) if (w.ev && !w.dead) for (const u of C.S.units) { if (!u.dead && ((u.S.radar && u.emit && (u.track === w || C.S.radarSees(u, w))) || (!u.S.radar && C.S.eyesSee(u, w)))) { seen.set(w, C.t); break; } }
    for (const a of C.raid.alive()) for (const u of C.S.units) { if (!u.dead && ((u.S.radar && u.emit && u.track === a) || (u.S.radar && u.emit && a.pos.distanceTo(u.pos) < u.S.radar.range && C.S.radarSees(u, a)) || (!u.S.radar && C.S.eyesSee(u, a)))) { seen.set(a, C.t); break; } }
    if (st.op && st.op.S.type === 'guns') st.op.gunFire = op.fireHeld || (op.keys && op.keys.has('Space'));
    if (st.op && C.auto) autoOp(dt);
    if (C.ev) C.ev.step(dt);
    if (st.addT > 0 && (st.addT -= dt) <= 0 && C.ev) { // докупленные — в расписание: по умолчанию пуск через 30 с
      for (const [k, add] of Object.entries(st.addQ)) {
        if (!add) continue; const c = cfgOf(k), n = st.plan.n[k], via = (multiItems(attSide()).find(([q]) => q === k) || [])[1];
        for (let i = n - add; i < n; i++) { c.units[i] = c.units[i] || {}; if (c.units[i].t == null) c.units[i].t = Math.ceil(C.ev.t + 30 + (i - n + add) * 2); }
        C.ev.extend(k, add, via, st.plan.cfg); say(tr('Заказано: {0} ×{1}', [AG[k].short, add]), 2);
      }
      st.addQ = {}; if (st.net && atk()) st.net.sendPlan(st.plan); renderSide();
    }
    for (const m of C.S.sams) if (!m.flashed) { m.flashed = true; if (m.unit) st.flash.set(m.unit, C.t); } // пуск ЗУР — вспышка у комплекса на карте
    if (st.watchNextAt && C.t >= st.watchNextAt.at) { const w = st.watchNextAt.w; st.watchNextAt = null; if (!w.dead) watch(w); } // пусковая выстрелила — камера за её ракетой
    if (st.cue && C.ev && C.ev.t >= st.cue.at) { const o = st.cue.obj; st.cue = null; st.timeK = 1; if (o && !o.dead && !o.out) watch(o); renderEv(true); } // «ждать» — событие наступает
    if (st.watch && (st.watch.dead || st.watch.out)) { st.watchEnd = st.watchEnd || C.t; if (C.t - st.watchEnd > 2.5) { st.watchEnd = 0; const nx = watchList()[0]; if (nx) watch(nx); else unwatch(); } }
    // ИИ вертолёта (sim/raid.js) на «Туманной топи» иногда зависает: в заходе — висит, не видя цель из-за рельефа; в отходе — ходит кругами у гребня котловины.
    // Волна не должна висеть вечно: вертолёт живёт дольше 600 с — уходит (отход), в отходе дольше 300 с — считается ушедшим
    for (const a of C.raid.planes) if (a.heli && !a.dead && !a.out && a.phase !== 'wait') {
      a.hT = (a.hT || 0) + dt;
      if (a.phase === 'egress') { if ((a.egT = (a.egT || 0) + dt) > 300) a.out = true; } else if (a.hT > 600) a.phase = 'egress';
    }
    const busy = C.raid.planes.some((a) => !a.dead && !a.out) || C.S.wpns.some((w) => !w.dead && !(w.ev && w.W.recon)) || (C.ev && C.ev.pending()); // разведчик мульти-волны волну не держит
    if (!busy && !st.net && !st.opts.hold) endWave(); // онлайн: конец волны решает сервер; уроки (hold) — сами подают цели
    if (st.opts.onTick) st.opts.onTick(dt);
    if ((sideT -= dt) <= 0) { sideT = 0.5; if (st.view === 'map' && !sideHold) renderSide(); renderEv(); }
  }
  // часы волны: с начала боя (мульти-волна — и за удар, и за оборону; видны и на карте, и в 3D, и за пультом)
  const clock = () => { if (!st.multi || st.phase !== 'wave' || !C.ev) return ''; const t = Math.max(0, C.ev.t); return `<b>${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}</b> · `; };
  function hud(dt, t) {
    if (st.net && st.multi) { const N = st.net, B = N.battle, left = N.room && N.room.left != null ? ` ${tr('· <b>{0} с</b>', [N.room.left])}` : '', rr = tr('Раунд {0}/{1}', [B.round, B.rounds]);
      $('dtop').innerHTML = st.phase === 'plan' ? tr('{0} · {1}{2} · очки <b>{3}</b>', [rr, atk() ? tr('план волны') : tr('расстановка ПВО'), left, atk() ? st.budget - planCost() : st.budget])
        : st.phase === 'wave' ? tr('{0}{1} · {2} · разрушено <b>{3}%</b>{4}', ['', rr, atk() ? tr('ваша волна') : tr('оборона'), Math.round(100 * (B.V || 0) / (B.v0 || 1)), B.k > 1 ? ` ${tr('· <b>время ×3</b>')}` : '']) : tr('{0} · итоги', [rr]);
    } else if (st.net) { const N = st.net, left = N.room && N.room.left !== null ? tr(' · {0} с', [N.room.left]) : '';
      $('dtop').innerHTML = st.phase === 'plan' ? tr('Расстановка · волна {0}/{1}{2} · очки <b>{3}</b>', [st.wave, st.waves, left, st.budget]) : tr('Волна <b>{0}/{1}</b>{2} · объекты целы <b>{3}%</b>', [st.wave, st.waves, left, Math.round((1 - ((N.battle && N.battle.valueK) || 0)) * 100)]); }
    else if (atk()) $('dtop').innerHTML = st.phase === 'plan' ? tr('План волны · очки угрозы <b>{0}</b>', [st.budget - planCost()]) : tr('{0}Волна · цели разрушены <b>{1}%</b>{2}', [clock(), Math.round((1 - targetsValue()) * 100), st.timeK > 1 ? tr(' · время ×{0}', [st.timeK]) : '']);
    else if (st.multi && st.phase === 'wave') $('dtop').innerHTML = tr('{0}Мульти-волна · сбито <b>{1}</b> · цели целы <b>{2}%</b>{3}', [clock(), st.downs, Math.round(targetsValue() * 100), st.timeK > 1 ? tr(' · время ×{0}', [st.timeK]) : '']);
    else $('dtop').innerHTML = st.phase === 'plan' ? tr('Расстановка · очки обороны <b>{0}</b>', [st.budget]) :
      tr('Волна <b>{0}/{1}</b> · сбито <b>{2}</b> · объекты целы <b>{3}%</b> · очки {4}', [st.wave, st.waves, st.downs, Math.round(cityValue() * 100), st.score]);
    if (st.view === 'op' && st.op) opHud(dt, t); else if (st.view === 'watch') watchHud(); else drawMap(t);
    if (st.view !== 'map' && st.alertT > 0) { const x = C.hx; x.font = '800 18px "Golos Text", -apple-system, Segoe UI, sans-serif'; x.textAlign = 'center'; const w = x.measureText(st.alert).width + 28, y = IS_TOUCH ? 52 : 64; // плашка тревоги — и в 3D
      x.fillStyle = `rgba(185,28,28,${0.75 + 0.2 * Math.sin(performance.now() / 300)})`; x.fillRect(C.VW / 2 - w / 2, y - 22, w, 32); x.fillStyle = '#fff'; x.fillText(st.alert, C.VW / 2, y); x.textAlign = 'left'; }
  }
  function onKey(e, down) {
    if (st.view !== 'op' && down && st.phase === 'plan' && st.draft && (e.code === 'Enter' || e.code === 'NumpadEnter')) { confirmDraft(); return; }
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
    else if (e.code === 'KeyB') binoToggle();
    else if (e.code === 'KeyZ') op.fov = op.fov > 30 ? 20 : op.fov > 12 ? 8 : 55;
  }
  const api = {
    startNetMulti, chatSync, st, sim: true, confirmDraft, cancelDraft, onEsc: () => { if (st.view !== 'op' && st.phase === 'plan' && (st.placing || st.moving)) { cancelDraft(); return true; } return false; }, tapAt: (x, z) => { const [px, py] = w2s(x, z); mapTap(px, py); }, /* tapAt — касание карты в точке мира (проверки) */ forecast: (key) => forecast(key), idxOf: (k, key) => idxOf(k, key), tkeyOf: (k, i) => tkeyOf(k, i), setTkey: (k, i, key) => setTkey(k, i, key), start, stop, update, hud, onKey, enterOp, leaveOp, startWave, designate, renderSide, startNet, netSync,
    setNetRes(r) { st.netRes = r; renderSide(); },
    camera(dt) { if (st.view === 'op' && st.op) opCamera(dt); else if (st.view === 'watch') watchCamera(dt); else { camera.position.set(view.cx, 9000, view.cz + 1); camera.lookAt(view.cx, 0, view.cz); } },
    focus: () => (st.op ? st.op.pos : st.watch ? st.watch.pos : camera.position),
    skip3D: () => st.view !== 'op' && st.view !== 'watch',
    fps60: true, // оборона и «Мульти-волна» (одиночные и онлайн) — предел кадров как во всей игре (Mark 2026-10-25), без 30 к/с для 3D
    near: () => (st.view === 'watch' ? 1 : 0),
    timeK: () => (st.phase === 'wave' && !st.over && !st.net ? st.timeK : 1),
    resize() { sizeMap(); },
    finish: (why) => finish(why, null),
    pauseHelp: () => (IS_TOUCH ? tr('Карта: тянуть — сдвиг, щипок — масштаб, касание — выбор. Оператор: тянуть — поворот, касание отметки или ИКО — назначить цель. «Кам.» — вид снаружи и за ракетой (тянуть — облёт).')
      : tr('Карта: тянуть — сдвиг, колесо — масштаб, щелчок — выбор и постановка, Пробел — начать волну.<br>Оператор: тянуть мышью или стрелки/WASD — поворот, колесо или Z — увеличение, щелчок по отметке — цель, Tab — следующая цель,<br>Пробел/F — пуск (у пушек — держать), E — РЛС, M — метод, V — камера (оператор / снаружи / за ракетой), Q — на карту, Esc — пауза.')),
  };
  return api;
}
