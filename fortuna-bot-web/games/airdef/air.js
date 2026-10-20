// Вылет за самолёт: «Изделие» с ударной подвеской против ИИ-ПВО города. Прицельный контейнер (окно ТВ/ИК, захват точки,
// лазер), прицел точки падения, СПО и датчик пуска, метки целей, итоги. start(opts) — опции для обучения:
// { items, pod, targets: [ключи], defense(S, rnd), invuln, spawn: {x,y,z,yaw}, noEnd, onTick(dt) }.
/* global THREE */
import { CITY, ZONE_NAME, mulberry32, riverX } from './city.js?v=20261022k';
import { strikerGeo, attachFlames } from './units-render.js?v=20261022k';
import { planeModel, classOf, weaponMesh, podModel, weaponHasModel, planeMeta, spinProps, wantWeapon } from './models.js?v=20261022k';
import { ico } from './icons.js?v=20261022k';
import { applyLayout } from './layout.js?v=20261022k';
import { clamp, makeCraft, pilotStep, fwdOf, D2R, angleBetween } from '../drone/sim/core.js?v=20261022k';
import { DRONE } from '../drone/sim/modes.js?v=20261022k';
import { AG, SAM, ERAS, LOADOUTS, loadoutsOf, loadoutRole } from './arsenal.js?v=20261022k';
import { predictBomb } from './sim/strike.js?v=20261022k';
import { flightModel, loadOf } from './sim/flight.js?v=20261022k';
import { initDamage, hitZones, dmgUnpack, burnRate, hullState, dmgBrief } from './sim/damage.js?v=20261022k';
import { planeDamageVis } from './plane-damage.js?v=20261022k';
import { placeDefense, pickTargets } from './mission.js?v=20261022k';
import { ZONE, newZone, zoneStep } from './sim/online.js?v=20261022k';

export function createAir(C) {
  const { $, city, scene, camera, renderer, snd, IS_TOUCH, P, W } = C;
  const NIGHT = C.NIGHT;
  const V3 = () => new THREE.Vector3();
  const craft = makeCraft({ ...DRONE, gmax: 12, wCap: 0.95, agil: 9, vStall: 60, bleed: 0.6, speed: 230, thr: 0.85 });
  craft.rcs = 5; craft.hp = 100;
  const game = { targets: [], score: 0, kills: 0, done: false, over: false, t: 0, opts: {} };
  const loadout = [];
  let sel = 0, hasPod = false, flashT = 0, laserSpot = null;
  const home = new THREE.Vector3(); let homeT = 0, homeLeft = 1; // точка вылета (пополнение в «Реализме») и время над ней

  // ── модель самолёта и подвеска ──
  // самолёт игрока: многоцелевой ударный самолёт стороны атакующих (как в превью меню), подвеска — на его пилонах
  const ship = new THREE.Group(); ship.rotation.order = 'YXZ';
  const shipMat = new THREE.MeshPhongMaterial({ vertexColors: true, specular: 0x666666, shininess: 55 });
  let shipModel = null, shipSide = null, shipCls = null, shipName = null, shipReal = false, shipInternal = false, flames = null, stations = [], podPos = new THREE.Vector3(0, -1.6, -3.5);
  // cls — ударный (бомбы) или ракетный: Су-30 / F/A-18 или МиГ-29 / F-16
  function buildShip(side, cls = 'strike', name = null) {
    // готовая модель (models.js), если загрузилась, иначе — процедурная
    const pm = planeModel(side, cls, name);
    // shipReal — стоит именно модель подвески (пока она грузится — подходящая из загруженных, потом заменяется)
    const exact = !!pm && (!name || pm.name === name);
    if (shipSide === side && shipCls === cls && shipName === name && (shipReal || !pm || (!exact && shipModel && shipModel.userData.pm === pm.name))) return;
    if (shipModel) ship.remove(shipModel);
    shipSide = side; shipCls = cls; shipName = name; shipReal = exact; shipInternal = !!(pm && pm.internal);
    if (pm) {
      shipModel = pm.obj; shipModel.userData.pm = pm.name; stations = pm.stations; podPos = pm.pod; // pod: null — встроенная прицельная система
      shipModel.traverse((o) => { if (o.isMesh && !o.userData.glass) o.castShadow = !!P.shadows; });
      flames = attachFlames(shipModel, pm.nozzles, pm.nr / 0.45, true, pm.dry);
      craft.dmgVis = planeDamageVis(scene, shipModel, pm.name, planeMeta(pm.name), () => C.fx); craft.dmgVis.sync(craft); // зоны повреждений: отрыв частей, дым
    } else {
      craft.dmgVis = null;
      const sg = strikerGeo(side, true); stations = sg.stations; podPos = new THREE.Vector3(0, -1.6, -3.5);
      shipModel = new THREE.Group(); const m = new THREE.Mesh(sg.geo, shipMat); m.castShadow = !!P.shadows; shipModel.add(m);
      flames = attachFlames(shipModel, sg.nozzles, sg.nr / 0.45, true);
    }
    ship.add(shipModel);
  }
  ship.visible = false; scene.add(ship);
  const pylonMeshes = [];
  function buildPylons() {
    for (const m of pylonMeshes) ship.remove(m);
    pylonMeshes.length = 0;
    for (const l of loadout) for (const st of l.st) {
      const m = weaponMesh(l.key, AG[l.key], C.weaponGeo, C.mats.wMat); const p = stations[st], W0 = AG[l.key].vis; m.position.set(p.x, p.y - (W0.hang ?? W0.r) - 0.05, p.z); // hang — у ракет с гондолой под корпусом
      m.userData.st = st; m.visible = !shipInternal; ship.add(m); pylonMeshes.push(m); // во внутренних отсеках — не видно
    }
    if (hasPod && podPos) { const m = podModel() || new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 2.4, 10).rotateX(Math.PI / 2), new THREE.MeshPhongMaterial({ color: 0x5a636c })); m.position.copy(podPos); ship.add(m); pylonMeshes.push(m); } // LITENING или цилиндр
  }
  function hurt(dmg, by, from = null) {
    if (craft.dead || game.over || game.net) return; // онлайн: урон и сбитие — от сервера (netHit / netDown)
    if (game.opts.invuln) { if (!game.opts.photo) { flashT = 0.3; snd.hit(); } return; }
    const d = dmg * C.MODE().dmgTaken;
    craft.hp -= d; flashT = 0.35; snd.hit();
    dmgEvents(hitZones(craft, d, from), by);
    if (craft.hp <= 0) { craft.hp = 0; craft.dead = true; C.fx.explosion(craft.pos, 30, 'air'); snd.planeKill(0); finish(`Сбит: ${by}`, false); }
  }
  // повреждения зон (sim/damage.js): что случилось — словами и звуком, отлетевшее — с самолёта (plane-damage.js)
  const ZNAME = { consL: 'Оторвало законцовку левого крыла — тянет влево, держите ручку', consR: 'Оторвало законцовку правого крыла — тянет вправо, держите ручку', tailL: 'Разбит хвост слева — управление хуже, уводит', tailR: 'Разбит хвост справа — управление хуже, уводит', tailAll: 'Хвост разрушен — самолёт неуправляем!', fire: 'Пожар на борту!' };
  function dmgEvents(ev, by) {
    if (craft.dmgVis) craft.dmgVis.sync(craft);
    // с оторванной консолью уходят и подвески на ней
    for (const z of ev) if ((z === 'consL' || z === 'consR') && craft.dmgVis) {
      const cx = craft.dmgVis.P.consX, sg = z === 'consL' ? -1 : 1;
      // пилоны на оторванной консоли выбывают до конца вылета: ни пуска, ни перезарядки в воздухе, ни пополнения в зоне
      for (const l of loadout) for (const st of l.st0.slice()) { const p = stations[st]; if (!p || p.x * sg <= cx * 0.92) continue;
        l.st0.splice(l.st0.indexOf(st), 1); l.n0 = l.st0.length; const k = l.st.indexOf(st); if (k >= 0) { l.st.splice(k, 1); l.n--; }
        l.res = Math.min(l.res, l.n0 * Math.max(0, homeLeft)); const m = pylonMeshes.find((q) => q.userData.st === st); if (m) m.visible = false; }
      updLoad(); if (!usable(loadout[sel])) nextWeapon();
      if (game.net) game.net.send({ t: 'lost', k: loadout.map((l) => [l.key, l.n, l.n0]) }); // и серверу: сколько осталось и сколько теперь пилонов
    }
    if (ev.length) { const e2 = ev.includes('tailAll') ? ev.filter((e) => e !== 'tailL' && e !== 'tailR') : ev; say(e2.map((e) => ZNAME[e]).filter(Boolean).join(' · '), 4); snd.alarm(); return; }
    const D = craft.dz; if (!D || !by) return; // без источника (пожар раз в секунду) — молча
    const bad = [D.wingL < 0.6 && 'левое крыло', D.wingR < 0.6 && 'правое крыло', D.tail < 0.6 && 'хвост', D.eng.some((e) => e < 0.6) && (D.eng.length > 1 ? (D.eng[0] < 0.6 && D.eng[1] < 0.6 ? 'оба двигателя' : D.eng[0] < 0.6 ? 'левый двигатель' : 'правый двигатель') : 'двигатель'), D.fuel < 0.7 && 'бак — течь'].filter(Boolean);
    if (bad.length) say(`Попадание${by ? `: ${by}` : ''} · повреждено: ${bad.join(', ')}`, 2.5);
  }

  // ═════════════ Прицельный контейнер ═════════════
  // Ищет и захватывает сам — одинаково на всех устройствах. Цель — ближайшая впереди из целей задания (затем — замеченные
  // комплексы ПВО); «ЦЕЛЬ» / R — следующая. Захват — через POD_ACQ с, пока цель в POD_R, самолёт не ниже POD_H над землёй,
  // её не закрывают дома и корпус. Захваченная точка держится до поражения цели или смены цели. Окно — только картинка
  // (тап — увеличение), открывается «ТВ» в панели оружия (G).
  const ZOOMS = [24, 10, 4, 1.6];
  const POD_R = [1000, 18000], POD_H = 400, POD_ACQ = 1;
  const pod = { show: false, dir: new THREE.Vector3(0, -0.5, -1).normalize(), zi: 1, lock: null, lockName: '', laserMan: null, laser: false, masked: false, pos: V3(), rect: { x: 0, y: 0, w: 0, h: 0 },
    tgt: null, acq: 0, why: '', chkT: 0, pickT: 0 };
  const podCam = new THREE.PerspectiveCamera(10, 4 / 3, 5, 40000); podCam.layers.enable(4); podCam.layers.enable(5); // и облака с дымом (слои половинного разрешения)
  // «Контейнер 30 к/с» (C.P.podHalf): сцена в окно контейнера — через кадр, в свою текстуру; на экран она кладётся каждый кадр
  // одним прямоугольником (второй проход сцены — самый дорогой после основного; настоящие ТВ-каналы и так 25–30 к/с)
  // на сенсорных окно рисуется в своей текстуре в 65% разрешения (картинка «ТВ» и так зернистая) — и при «каждый кадр»
  const POD_K = IS_TOUCH ? 0.9 : 1;
  const podRT = C.P.podHalf || IS_TOUCH ? new THREE.WebGLRenderTarget(1, 1, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter }) : null;
  let podQS = null, podQC = null, podN = 0;
  if (podRT) {
    podRT.texture.encoding = THREE.sRGBEncoding;
    podQS = new THREE.Scene(); podQC = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const q = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({ map: podRT.texture, toneMapped: false, depthTest: false, depthWrite: false }));
    q.frustumCulled = false; podQS.add(q);
  }
  const shipQ = new THREE.Quaternion(), invQ = new THREE.Quaternion(), E = new THREE.Euler(0, 0, 0, 'YXZ');
  // окно: на сенсорных — небольшое, вверху справа (над кнопками, левее паузы и звука); на ПК — справа внизу
  function layoutPod() {
    const VW = C.VW, VH = C.VH;
    let w = IS_TOUCH ? Math.min(VW * 0.27, 230) : Math.min(VW * 0.3, 380), h = w * 0.75;
    // телефон: вровень с рядом паузы и звука (он уже под кнопками Telegram и панелью состояния) и левее него
    const rr = ['pause', 'mute', 'plBtn'].map((id) => ($(id).getBoundingClientRect ? $(id).getBoundingClientRect() : null)).filter((r) => r && r.width);
    const pb = rr.length ? { width: 1, left: Math.min(...rr.map((r) => r.left)), top: Math.min(...rr.map((r) => r.top)) } : { width: 0, top: 6 };
    const y = IS_TOUCH ? Math.max(6, pb.top) : VH - h - 180;
    if (IS_TOUCH) { // не ниже верха кнопок справа («КАРТА», «АВТО»)
      let lim = VH; for (const id of ['tMap', 'tAuto', 'tHelp']) { const r = $(id).getBoundingClientRect ? $(id).getBoundingClientRect() : null; if (r && r.height) lim = Math.min(lim, r.top); }
      h = Math.max(90, Math.min(h, lim - y - 6)); w = h / 0.75;
    }
    const x = IS_TOUCH ? (pb.width ? pb.left - w - 8 : VW - w - 58) : VW - w - 14;
    Object.assign(pod.rect, { x, y, w, h });
    const b = $('podBox'); b.style.left = x + 'px'; b.style.top = y + 'px'; b.style.width = w + 'px'; b.style.height = h + 'px';
  }
  // цели контейнера: цели задания, затем замеченные комплексы ПВО (метки на экране)
  const tgtName = (t) => (t.S ? t.S.rwr || t.S.short : t.name);
  const tgtPos = (t, out) => (t.S ? out.copy(t.pos) : out.set(t.x, city.topAt(t.x, t.z), t.z));
  function podCands() {
    const M = C.MODE(), out = game.targets.filter((o) => !o.dead);
    for (const u of C.S.units) if (!u.dead && (u.known || (M.markers && u.S.radar && u.emit))) out.push(u);
    return out;
  }
  const TP = V3();
  function podAhead(t) { fwdOf(craft, LQ); tgtPos(t, TP); return angleBetween(LQ, TP.sub(craft.pos)); }
  function podPick() { // ближайшая впереди (в 70° от носа): сначала цели задания
    let best = null, bs = 1e12;
    for (const t of podCands()) { if (podAhead(t) > 70 * D2R) continue; const s = TP.length() + (t.S ? 1e6 : 0); if (s < bs) { bs = s; best = t; } }
    return best;
  }
  function podSet(t) { pod.tgt = t; pod.lock = null; pod.lockName = t ? tgtName(t) : ''; pod.acq = 0; pod.why = ''; pod.chkT = 0; }
  // «ЦЕЛЬ» / R: следующая по направлению от носа (слева направо)
  function podNext() {
    if (!hasPod) { say('Нет прицельного контейнера — цели для бомб по координатам выбираются сами'); snd.deny(); return; }
    const L = podCands(); if (!L.length) { say('Нет целей'); snd.deny(); return; }
    fwdOf(craft, LQ); const yaw0 = Math.atan2(-LQ.x, -LQ.z);
    const brg = (t) => { tgtPos(t, TP); let b = Math.atan2(-(TP.x - craft.pos.x), -(TP.z - craft.pos.z)) - yaw0; while (b > Math.PI) b -= 2 * Math.PI; while (b < -Math.PI) b += 2 * Math.PI; return -b; };
    L.sort((a, b) => brg(a) - brg(b));
    podSet(L[(L.indexOf(pod.tgt) + 1) % L.length]); snd.click();
    say(`Цель: ${pod.lockName}`, 1.4);
  }
  const LP = V3(), LQ = V3(), PAT = V3();
  function updatePod(dt) {
    pod.pos.copy(craft.pos); pod.pos.y -= 1.5;
    if (!hasPod || craft.dead) { pod.laser = false; laserSpot = null; return; }
    if (pod.tgt && pod.tgt.dead) { podSet(null); }
    if (!pod.tgt && (pod.pickT -= dt) <= 0) { pod.pickT = 0.5; const t = podPick(); if (t) podSet(t); }
    if (pod.lock) pod.dir.copy(pod.lock).sub(pod.pos).normalize();
    else if (pod.tgt) pod.dir.copy(tgtPos(pod.tgt, TP)).sub(pod.pos).normalize();
    else { fwdOf(craft, pod.dir); pod.dir.y -= 0.45; pod.dir.normalize(); }
    invQ.copy(shipQ).invert(); LQ.copy(pod.dir).applyQuaternion(invQ);
    const el = Math.asin(clamp(LQ.y, -1, 1)), az = Math.atan2(LQ.x, -LQ.z);
    pod.masked = el > 0.17 || Math.abs(az) > 2.8;
    // захват: условия проверяются 10 раз в секунду; выполнены POD_ACQ с подряд — точка захвачена
    if (pod.tgt && !pod.lock && (pod.chkT -= dt) <= 0) {
      pod.chkT = 0.1; tgtPos(pod.tgt, TP);
      const d = pod.pos.distanceTo(TP), h = craft.pos.y - city.groundH(craft.pos.x, craft.pos.z);
      pod.why = d > POD_R[1] ? `далеко — ближе ${POD_R[1] / 1000} км` : d < POD_R[0] ? 'слишком близко' : h < POD_H ? `низко — выше ${POD_H} м` : pod.masked ? 'закрыта корпусом' :
        !city.los(pod.pos.x, pod.pos.y, pod.pos.z, TP.x, TP.y + 2, TP.z, 4) ? 'закрыта домами' : '';
      if (pod.why) pod.acq = 0;
      else if ((pod.acq += 0.1) >= POD_ACQ) { pod.lock = TP.clone(); pod.acq = 0; snd.lock(); }
    }
    const need = C.S.wpns.some((w) => w.owner === craft && (w.W.kind === 'lgb' || w.W.seeker === 'laser'));
    const want = pod.laserMan !== null ? pod.laserMan : need;
    const was = pod.laser;
    pod.laser = !!(hasPod && want && pod.lock && !pod.masked && !craft.dead && pod.pos.distanceTo(pod.lock) < 25000
      && city.los(pod.pos.x, pod.pos.y, pod.pos.z, pod.lock.x, pod.lock.y, pod.lock.z, 3));
    if (pod.laser !== was) snd.laser(pod.laser);
    laserSpot = pod.laser ? pod.lock : null;
  }
  function renderPod() {
    if (!pod.show || !hasPod || craft.dead || game.over) { podN = 0; return; }
    const r = pod.rect, VH = C.VH;
    if (podRT) {
      const pr = renderer.getPixelRatio() * POD_K, pw = Math.max(1, Math.round(r.w * pr)), ph = Math.max(1, Math.round(r.h * pr));
      if (podRT.width !== pw || podRT.height !== ph) { podRT.setSize(pw, ph); podN = 0; }
      if (!C.P.podHalf || (podN++ & 1) === 0) drawPod(podRT, null);
      renderer.setRenderTarget(null); renderer.setScissorTest(true); renderer.setScissor(r.x, VH - r.y - r.h, r.w, r.h); renderer.setViewport(r.x, VH - r.y - r.h, r.w, r.h);
      renderer.autoClear = false; renderer.render(podQS, podQC);
      renderer.autoClear = true; renderer.setScissorTest(false); renderer.setViewport(0, 0, C.VW, VH);
      return;
    }
    drawPod(null, r);
  }
  function drawPod(target, r) {
    const VH = C.VH;
    podCam.fov = ZOOMS[pod.zi]; podCam.aspect = pod.rect.w / Math.max(1, pod.rect.h); podCam.updateProjectionMatrix();
    podCam.position.copy(pod.pos); podCam.up.set(0, 1, 0); podCam.lookAt(LQ.copy(pod.pos).add(pod.dir));
    const au = renderer.shadowMap.autoUpdate, sv = ship.visible;
    renderer.shadowMap.autoUpdate = false; ship.visible = false;
    // ночью — тепловизор: дымка для ИК прозрачнее, сцена подсвечена равномерно (иначе ночной туман и темнота «съедают» всё)
    const ir = NIGHT >= 0.5, fog = scene.fog, H = C.G.hemi, ex = renderer.toneMappingExposure, keep = ir && { fd: fog.density, fc: fog.color.clone(), hi: H.intensity, hc: H.color.clone(), hg: H.groundColor.clone() };
    if (ir) { fog.density *= 0.35; fog.color.setRGB(0.1, 0.1, 0.1); H.intensity = 1.7; H.color.setRGB(0.75, 0.75, 0.75); H.groundColor.setRGB(0.45, 0.45, 0.45); renderer.toneMappingExposure = ex * 1.6; }
    renderer.setRenderTarget(target); renderer.toneMapping = THREE.ACESFilmicToneMapping;
    if (r) { renderer.setScissorTest(true); renderer.setScissor(r.x, VH - r.y - r.h, r.w, r.h); renderer.setViewport(r.x, VH - r.y - r.h, r.w, r.h); }
    // точка взгляда контейнера (пересечение с землёй) — вокруг неё дома и техника подробно, только на время кадра окна
    const gy = C.city.groundH(pod.pos.x, pod.pos.z), tt = pod.dir.y < -0.02 ? Math.min(30000, (pod.pos.y - gy) / -pod.dir.y) : 6000;
    const back = C.podPass ? C.podPass(podCam, PAT.copy(pod.pos).addScaledVector(pod.dir, tt), target ? target.height : r.h * renderer.getPixelRatio()) : null;
    renderer.autoClear = false; renderer.clear(); renderer.render(scene, podCam); if (back) back();
    renderer.autoClear = true; renderer.setScissorTest(false); if (r) renderer.setViewport(0, 0, C.VW, VH);
    renderer.toneMapping = C.sceneTM; renderer.shadowMap.autoUpdate = au; ship.visible = sv;
    if (ir) { fog.density = keep.fd; fog.color.copy(keep.fc); H.intensity = keep.hi; H.color.copy(keep.hc); H.groundColor.copy(keep.hg); renderer.toneMappingExposure = ex; }
  }

  // ═════════════ Оружие ═════════════
  const usable = (l) => l && l.n > 0 && AG[l.key].kind !== 'ecm'; // станция помех не сбрасывается — работает весь вылет
  const curW = () => (usable(loadout[sel]) ? loadout[sel] : null);
  function nextWeapon() { for (let i = 1; i <= loadout.length; i++) { const k = (sel + i) % loadout.length; if (usable(loadout[k])) { sel = k; snd.click(); break; } } }
  // координаты для спутникового оружия и крылатых ракет: захват контейнера или ближайшая цель задания впереди
  const CO = V3();
  function coordAim(maxR) {
    if (pod.lock) return pod.lock;
    fwdOf(craft, LQ); let best = null, bd = maxR;
    for (const o of game.targets) { if (o.dead) continue; CO.set(o.x, city.topAt(o.x, o.z), o.z); const d = CO.distanceTo(craft.pos); if (d < bd && angleBetween(LQ, TMP0.copy(CO).sub(craft.pos)) < 80 * D2R) { bd = d; best = o; } }
    return best ? CO.set(best.x, city.topAt(best.x, best.z), best.z) : null;
  }
  const TMP0 = V3();
  let msgText = '', msgT = 0;
  // короткое — в строку прицела в панели, длинное (задание, итоги попаданий) — по центру экрана, панель не раздувается
  function say(t, s = 2.2) { if (t.length > 42) { C.say(t, s); msgT = 0; } else { msgText = t; msgT = s; } }
  function armTarget(Wp) {
    let best = null, ba = 1e9; const f = fwdOf(craft, V3());
    for (const e of C.S.rwr(craft)) { const a = angleBetween(f, LP.copy(e.u.ant).sub(craft.pos)); if (a < Wp.fov * D2R && e.d < Wp.rmax * 1.1 && a < ba) { ba = a; best = e.u; } }
    return best;
  }
  const BOMBK = new Set(['bomb', 'lgb', 'tvb', 'gps']), UPQ = V3();
  // самолёт «почти ровно»: верх смотрит вверх (крен и тангаж вместе — не больше 60° от вертикали)
  const levelOk = () => UPQ.set(0, 1, 0).applyQuaternion(craft.q || shipQ).y > 0.5;
  let fireAt = 0; // онлайн: не чаще раза в 0,3 с (сервер принимает сброс с запасом на 2 подряд — бомба не пропадёт с пилона зря)
  function fire() {
    const l = curW(); if (!l || game.over || craft.dead) return;
    if (game.net) { const now = performance.now(); if (now - fireAt < 300) return; fireAt = now; }
    const Wp = AG[l.key], opts = {};
    const no = (t) => { say(t); snd.deny(); };
    if (Wp.tv) {
      if (!pod.lock) return no('Нужен захват контейнером (ТВ-ГСН)');
      if (NIGHT >= 0.5) return no('Ночь: ТВ-головка не видит цель');
      if (angleBetween(craft.vel, LP.copy(pod.lock).sub(craft.pos)) > (Wp.kind === 'tvb' ? 50 : Wp.fov) * D2R) return no('Цель вне поля ГСН — доверните на неё');
      if (craft.pos.distanceTo(pod.lock) > Wp.rmax * 1.25) return no('Далеко для ГСН');
      opts.aim = pod.lock;
    } else if (Wp.kind === 'arm') {
      const u = armTarget(Wp); if (!u) return no('Нет включённой РЛС впереди в поле ГСН');
      opts.target = u;
    } else if (Wp.kind === 'agm' && Wp.seeker === 'laser' && !pod.lock) return no('Нужен захват контейнером (лазер)');
    else if (Wp.kind === 'gps' || Wp.kind === 'cruise') {
      const a = coordAim(Wp.rmax * 1.2); if (!a) return no('Нет координат: захватите точку контейнером или доверните на цель задания');
      opts.aim = a;
    } else if (Wp.kind === 'decoy') opts.aim = coordAim(30000);
    // бомбу с держателя не сбросить при крене больше 60° или вверх ногами (отделится в самолёт); ракеты сходят с направляющих в любом положении
    if (BOMBK.has(Wp.kind) && !levelOk()) return no('Сброс невозможен: крен больше 60° или самолёт перевёрнут');
    const st = l.st.pop(); l.n--;
    const m = pylonMeshes.find((q) => q.userData.st === st); if (m) m.visible = false;
    C.S.release(craft, l.key, opts);
    updLoad();
    if (C.hooks.trainFire) C.hooks.trainFire(l.key);
    if (l.n <= 0) nextWeapon();
  }
  // ловушки — одной кнопкой (одинаково на всех устройствах): пачка ЛТЦ и диполей разом
  function cm() {
    if (game.over || craft.dead) return;
    const f = craft.cmFlare > 0, c = craft.cmChaff > 0;
    if (!f && !c) { say('Ловушки кончились', 1.2); return; }
    if (f) craft.cmFlare--; if (c) craft.cmChaff--;
    if (game.net) C.S.dropCM(craft, 'both'); // онлайн: одна команда серверу
    else { if (f) C.S.dropCM(craft, 'flare'); if (c) C.S.dropCM(craft, 'chaff'); }
  }

  // ═════════════ «АВТО» — помощь в бою ═════════════
  // Как в «Летке»: не бесполезна, но и не идеальна. Бомба уходит, когда точка падения на цели или «В ЗОНЕ», ТВ-ракета —
  // в зоне, ПРР — по включённой РЛС впереди (захват контейнером — сам, у всех). Выбор оружия — первое, для которого
  // условие выполнено, с задержкой реакции. Пилотирование и уклонение — ваши.
  const AU = { relT: 0, cd: 0 };
  const PT = V3();
  function autoReady(l) {
    const Wp = AG[l.key];
    if (Wp.kind === 'arm') return !!armTarget(Wp);
    if (Wp.kind === 'ecm') return false;
    if (Wp.kind === 'cruise' || Wp.kind === 'decoy') { const a = coordAim(Wp.kind === 'cruise' ? 22000 : 16000); return !!a && craft.pos.distanceTo(a) > 5000; }
    if (Wp.kind === 'gps') { const a = coordAim(Wp.rmax * 1.2); if (!a) return false; const t = predictBomb(city, Wp, craft.pos, craft.vel, a, PT); return t > 0 && PT.distanceTo(a) < 20; }
    if (Wp.kind === 'bomb') {
      if (predictBomb(city, Wp, craft.pos, craft.vel, null, PT) < 0) return false;
      return game.targets.some((o) => !o.dead && Math.abs(PT.x - o.x) < o.w / 2 + Wp.blast * 0.3 && Math.abs(PT.z - o.z) < o.d / 2 + Wp.blast * 0.3);
    }
    if (!pod.lock || C.S.wpns.some((w) => w.owner === craft && !w.dead && w.W.kind !== 'arm')) return false; // по одной на точку
    const d = craft.pos.distanceTo(pod.lock);
    if (Wp.kind === 'lgb' || Wp.kind === 'tvb') { const t = predictBomb(city, Wp, craft.pos, craft.vel, pod.lock, PT); return t > 0 && PT.distanceTo(pod.lock) < Math.max(12, Wp.blast * 0.4) && (!Wp.tv || NIGHT < 0.5); }
    return d < Wp.rmax * 0.85 && angleBetween(craft.vel, LQ.copy(pod.lock).sub(craft.pos)) < Wp.fov * 0.8 * D2R && (!Wp.tv || NIGHT < 0.5);
  }
  function autoAssist(dt) {
    AU.acc = (AU.acc || 0) + dt; if (AU.acc < 0.1) return; dt = AU.acc; AU.acc = 0; // 10 раз в секунду хватает
    AU.cd -= dt;
    if (AU.cd > 0) return;
    const i = loadout.findIndex((l) => l.n > 0 && autoReady(l));
    if (i < 0) { AU.relT = 0; return; }
    AU.relT += dt;
    if (AU.relT < (AG[loadout[i].key].kind === 'arm' ? 0.9 : 0.25) + Math.random() * 0.04 * 10) return; // реакция «расчёта»
    sel = i; fire(); AU.relT = 0; AU.cd = AG[loadout[i].key].kind === 'bomb' ? 0.35 : 1.6;
  }

  // ═════════════ Управление ═════════════
  const keys = new Set();
  let camMode = 0, abWas = false, fuelWarn = 0, thrI = 2;
  // газ ступенями, после 100 % — форсаж (одна кнопка «ГАЗ» на всех устройствах; на ПК — W/S по ступеням)
  const THR_STEPS = [0.4, 0.6, 0.8, 1, 1], AB_I = 4;
  function setThr(i) { thrI = clamp(i, 0, AB_I); craft.thr = THR_STEPS[thrI]; snd.click(); }
  function thrStep() { setThr(thrI === AB_I ? 0 : thrI + 1); }
  function onKey(e, down) {
    if (!down) { keys.delete(e.code); return; }
    if (e.repeat) return;
    keys.add(e.code);
    switch (e.code) {
      case 'Space': case 'KeyF': fire(); e.preventDefault(); break;
      case 'KeyQ': case 'Tab': nextWeapon(); e.preventDefault(); break;
      case 'KeyB': if (game.net && craft.dead) { spec.i++; spec.init = false; } break;
      case 'KeyR': podNext(); break;
      case 'KeyG': podView(); break;
      case 'KeyW': setThr(thrI + 1); break;
      case 'KeyS': setThr(thrI - 1); break;
      case 'ShiftLeft': case 'ShiftRight': setThr(thrI === AB_I ? 3 : AB_I); break;
      case 'KeyZ': pod.zi = (pod.zi + 1) % ZOOMS.length; snd.click(); break;
      case 'KeyO': pod.laserMan = pod.laserMan === null ? !pod.laser : pod.laserMan ? false : null; say(`Лазер: ${pod.laserMan === null ? 'авто' : pod.laserMan ? 'вкл' : 'выкл'}`, 1.2); break;
      case 'KeyH': if (game.net && !craft.dead && C.askHelp) C.askHelp([craft.pos.x, craft.pos.z]); break;
      case 'KeyX': case 'KeyC': cm(); break;
      case 'KeyV': nextCam(); break;
      case 'KeyN': nextCam(camMode === 3 ? 0 : 3); break;
      case 'KeyL': freeLook(!free.on); break; // обзор: камера — мышью, самолёт держит курс
      case 'KeyM': toggleMap(); break;
      case 'KeyT': C.setAuto(!C.auto); break;
    }
  }
  function podView() { if (!hasPod) { say('Нет прицельного контейнера в этой подвеске'); return; } pod.show = !pod.show; snd.click(); }
  {
    const b = $('podBox');
    b.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); pod.zi = (pod.zi + 1) % ZOOMS.length; snd.click(); });
    b.addEventListener('wheel', (e) => { pod.zi = clamp(pod.zi + (e.deltaY > 0 ? -1 : 1), 0, ZOOMS.length - 1); e.preventDefault(); }, { passive: false });
  }
  const stick = { id: null, x0: 0, y0: 0, x: 0, y: 0 };
  // «Наведение камерой» (сенсорные, по умолчанию; Настройки — или ручка): палец по свободному месту экрана поворачивает
  // взгляд камеры, самолёт сам кренится и тянет туда, куда она смотрит. Крестовина (и стрелки) — ручное управление: пока
  // нажата, взгляд следует за носом. aim — направление взгляда в мире (рыскание и тангаж, как у самолёта)
  const aim = { yaw: 0, pitch: 0, id: null, x: 0, y: 0 }, AIMD = V3(), DP = V3();
  let demo = null; // показ в обучении: { pt — точка, alt — высота над землёй }
  const aimOn = () => IS_TOUCH && C.sens.aim !== false;
  // свободная камера («ОБЗОР» / L): осматриваться во все стороны, не уводя самолёт — он держит прежний курс (взгляд aim не трогаем);
  // yaw / pitch — направление взгляда в мире; ещё раз — камера снова за самолётом
  const free = { on: false, yaw: 0, pitch: 0, id: null, x: 0, y: 0 };
  function freeLook(on) {
    if (on === free.on) return; free.on = on;
    if (on) { const d = camera.getWorldDirection(AIMD); free.yaw = Math.atan2(-d.x, -d.z); free.pitch = clamp(Math.asin(clamp(d.y, -1, 1)), -1.3, 1.3); }
    else { free.id = null; camInit = false; }
    $('tLook').classList.toggle('on', on); say(on ? 'Обзор: ведите пальцем — камера осматривается, самолёт держит курс' : 'Камера — снова за самолётом', 1.6);
  }
  const freeDrag = (dx, dy) => { const k = 0.005 * C.sens.stick; free.yaw -= dx * k; free.pitch = clamp(free.pitch - dy * k, -1.3, 1.3); };
  // ПК: в обзоре — тянуть мышью по экрану
  addEventListener('pointermove', (e) => { if (!free.on || IS_TOUCH || !(e.buttons & 1) || !mine()) return; freeDrag(e.movementX || 0, e.movementY || 0); });
  const aimDir = (out) => out.set(-Math.sin(aim.yaw) * Math.cos(aim.pitch), Math.sin(aim.pitch), -Math.cos(aim.yaw) * Math.cos(aim.pitch));
  function aimSync() { fwdOf(craft, AIMD); aim.yaw = Math.atan2(-AIMD.x, -AIMD.z); aim.pitch = clamp(Math.asin(clamp(AIMD.y, -1, 1)), -1.2, 1.2); }
  {
    const zone = $('stickZone');
    const place = () => { const k = $('stickKnob'); k.style.left = (stick.x0 + stick.x * 70 - 28) + 'px'; k.style.top = (stick.y0 + stick.y * 70 - 28) + 'px'; };
    zone.addEventListener('pointerdown', (e) => {
      if (free.on) { if (free.id === null) { free.id = e.pointerId; free.x = e.clientX; free.y = e.clientY; zone.setPointerCapture(e.pointerId); } return; } // обзор — палец водит камеру
      if (aimOn()) { if (aim.id === null) { aim.id = e.pointerId; aim.x = e.clientX; aim.y = e.clientY; zone.setPointerCapture(e.pointerId); } return; }
      stick.id = e.pointerId; stick.x0 = e.clientX; stick.y0 = e.clientY; stick.x = stick.y = 0; zone.setPointerCapture(e.pointerId); $('stickKnob').style.display = 'block'; place();
    });
    zone.addEventListener('pointermove', (e) => {
      if (e.pointerId === free.id) { freeDrag(e.clientX - free.x, e.clientY - free.y); free.x = e.clientX; free.y = e.clientY; return; }
      if (e.pointerId === aim.id) { // вправо — взгляд вправо, вверх — вверх (с инверсией — вниз)
        const k = 0.0042 * C.sens.stick, dx = e.clientX - aim.x, dy = e.clientY - aim.y; aim.x = e.clientX; aim.y = e.clientY;
        aim.yaw -= dx * k; aim.pitch = clamp(aim.pitch - dy * k * (C.sens.invert ? -1 : 1), -1.2, 1.2); return;
      }
      if (e.pointerId !== stick.id) return; stick.x = clamp((e.clientX - stick.x0) / 70, -1, 1); stick.y = clamp((e.clientY - stick.y0) / 70, -1, 1); place();
    });
    const end = (e) => { if (e.pointerId === free.id) free.id = null; if (e.pointerId === aim.id) aim.id = null; if (e.pointerId !== stick.id) return; stick.id = null; stick.x = stick.y = 0; $('stickKnob').style.display = 'none'; };
    zone.addEventListener('pointerup', end); zone.addEventListener('pointercancel', end);
  }
  // автопилот к взгляду: большой угол — крен в сторону цели и тяга на себя; малый — руль направления и тангаж с
  // выравниванием крыльев (точно, без раскачки). Возвращает [крен, тангаж, руль]
  const AR = V3(), AU2 = V3(), AF = V3(), AO = [0, 0, 0];
  function aimSteer() {
    aimDir(AIMD); const q = craft.q || shipQ;
    AR.set(1, 0, 0).applyQuaternion(q); AU2.set(0, 1, 0).applyQuaternion(q); AF.set(0, 0, -1).applyQuaternion(q);
    const lx = AIMD.dot(AR), ly = AIMD.dot(AU2), lz = AIMD.dot(AF), ang = Math.acos(clamp(lz, -1, 1));
    const big = clamp((ang - 0.06) / 0.3, 0, 1), err = Math.atan2(lx, ly);
    AO[0] = clamp(big * err * 2 + (1 - big) * clamp(AR.y * 3 + lx * 4, -1, 1), -1, 1);
    AO[1] = clamp(big * clamp(Math.cos(err) * Math.min(1, ang * 2.2), -0.3, 1) + (1 - big) * ly * 9, -1, 1);
    AO[2] = (1 - big) * clamp(-lx * 9, -1, 1);
    return AO;
  }
  // крестовина: ▲▼ — тангаж, ◀▶ — крен; палец можно вести по блоку, не отрывая (угол — крен и тангаж сразу)
  const pad = { x: 0, y: 0, id: null };
  {
    const el = $('tPad'), arms = { u: el.querySelector('.pu'), d: el.querySelector('.pd'), l: el.querySelector('.pl'), r: el.querySelector('.pr') };
    const at = (e) => { const b = el.getBoundingClientRect(), dx = (e.clientX - b.left) / b.width - 0.5, dy = (e.clientY - b.top) / b.height - 0.5;
      pad.x = dx > 0.12 ? 1 : dx < -0.12 ? -1 : 0; pad.y = dy < -0.12 ? 1 : dy > 0.12 ? -1 : 0;
      arms.r.classList.toggle('on', pad.x > 0); arms.l.classList.toggle('on', pad.x < 0); arms.u.classList.toggle('on', pad.y > 0); arms.d.classList.toggle('on', pad.y < 0); };
    el.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); if (pad.id !== null) return; pad.id = e.pointerId; try { el.setPointerCapture(pad.id); } catch (_) { /* нет */ } at(e); });
    el.addEventListener('pointermove', (e) => { if (e.pointerId === pad.id) at(e); });
    const end = (e) => { if (e.pointerId !== pad.id) return; pad.id = null; pad.x = pad.y = 0; for (const a of Object.values(arms)) a.classList.remove('on'); };
    el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
  }
  const mine = () => C.ctrl === api || (C.ctrl && C.ctrl.inner === api); // в обучении управляет урок, а самолёт — внутри него
  const tap = (id, fn) => $(id).addEventListener('pointerdown', (e) => { e.preventDefault(); if (mine()) fn(); });
  tap('tFire', fire); tap('tLock', podNext); tap('tFlare', cm); tap('tThr', thrStep);
  tap('tHelp', () => { if (game.net && !craft.dead && C.askHelp) C.askHelp([craft.pos.x, craft.pos.z]); });
  tap('tLook', () => freeLook(!free.on));
  tap('tMap', () => toggleMap()); tap('tAuto', () => C.setAuto(!C.auto)); tap('tCam', () => { if (game.net && craft.dead) { spec.i++; spec.init = false; } else nextCam(); });
  // панель: тап по строке оружия — выбрать его, «ЦЕЛЬ …» — следующая цель, «ТВ» — окно контейнера
  $('wpn').addEventListener('pointerdown', (e) => {
    e.stopPropagation(); if (!mine()) return;
    const tv = e.target.closest('.tvb'), tg = e.target.closest('.tgl'), r = e.target.closest('[data-w]');
    if (tv) podView(); else if (tg) podNext();
    else if (r) { const i = +r.dataset.w; if (usable(loadout[i]) && i !== sel) { sel = i; snd.click(); } }
    else nextWeapon();
  });
  // места по умолчанию: справа два столбца у края; «КАМ.» на сенсорных — только в онлайне, пока смотрите за союзником
  function layoutTouch() {
    if (!IS_TOUCH) return;
    const R = (id, right, bottom) => { const e = $(id); e.dataset.r = `calc(${right}px + var(--sa-r))`; e.dataset.b = bottom + 'px'; };
    R('tFire', 12, 16); R('tFlare', 12, 96); R('tMap', 12, 156); R('tLook', 12, 216); R('tThr', 102, 16); R('tLock', 102, 76); R('tAuto', 102, 136); R('tHelp', 102, 196);
    const cam = $('tCam'); cam.style.right = 'calc(172px + var(--sa-r))'; cam.style.bottom = '16px';
    applyLayout(); // свои места кнопок игрока (Настройки → «Расположение кнопок»)
  }
  layoutTouch(); // места по умолчанию — сразу (редактор кнопок открывается и до первого вылета)

  // ═════════════ Карта ═════════════
  let mapOn = false, mapBase = null;
  const mapC = $('map'), mx = mapC.getContext('2d');
  function toggleMap() { mapOn = !mapOn; mapC.style.display = mapOn ? 'block' : 'none'; }
  function drawMap() {
    const S2 = Math.min(C.VW, C.VH) - 40; if (mapC.width !== S2) { mapC.width = mapC.height = S2; mapBase = C.menu.mapBase(S2); }
    mx.drawImage(mapBase, 0, 0);
    const k = S2 / (2 * CITY.HALF), P2 = (x, z) => [(x + CITY.HALF) * k, (z + CITY.HALF) * k];
    mx.font = '600 11px -apple-system, Segoe UI, sans-serif'; mx.textAlign = 'center';
    for (const o of game.targets) {
      const [px, pz] = P2(o.x, o.z);
      mx.fillStyle = o.dead ? '#888' : '#ffcf4a'; mx.beginPath(); mx.moveTo(px, pz - 7); mx.lineTo(px + 7, pz); mx.lineTo(px, pz + 7); mx.lineTo(px - 7, pz); mx.closePath(); mx.fill();
      mx.fillStyle = '#fff'; mx.strokeStyle = 'rgba(0,0,0,.7)'; mx.lineWidth = 3; mx.strokeText(o.name, px, pz - 10); mx.fillText(o.name, px, pz - 10);
    }
    for (const u of C.S.units) {
      if (u.dead || !(u.known || (C.MODE().markers && u.S.radar && u.emit))) continue;
      const [px, pz] = P2(u.pos.x, u.pos.z);
      mx.strokeStyle = 'rgba(255,107,107,.8)'; mx.lineWidth = 1; mx.beginPath(); mx.arc(px, pz, u.S.rmax * k, 0, 7); mx.stroke();
      mx.fillStyle = '#ff6b6b'; mx.fillText(u.S.rwr || u.S.short, px, pz + 4);
    }
    { const N = game.net, z = N ? N.zone : zn.Z; if (z) { const [zx, zz] = P2(N ? z[0] : z.x, N ? z[1] : z.z); mx.strokeStyle = '#4ade80'; mx.lineWidth = 2; mx.setLineDash([5, 4]); mx.beginPath(); mx.arc(zx, zz, Math.max(6, ZONE.R * k), 0, 7); mx.stroke(); mx.setLineDash([]); mx.fillStyle = '#bbf7d0'; mx.fillText('пополнение', zx, zz + Math.max(6, ZONE.R * k) + 12); } }
    for (const a of alliesOf()) { // союзники: зелёные, с именем
      const [ax, az] = P2(a.pos.x, a.pos.z);
      mx.save(); mx.translate(ax, az); mx.rotate(-a.yaw); mx.fillStyle = '#4ade80'; mx.beginPath(); mx.moveTo(0, -8); mx.lineTo(5, 6); mx.lineTo(-5, 6); mx.closePath(); mx.fill(); mx.restore();
      mx.fillStyle = '#bbf7d0'; mx.strokeStyle = 'rgba(0,0,0,.7)'; mx.lineWidth = 3; const nm = allyName(a); mx.strokeText(nm, ax, az - 10); mx.fillText(nm, ax, az - 10);
    }
    if (game.net && C.netHelps && C.drawWarn) for (const h of C.netHelps()) { if (!h.p) continue; const [hx2, hz2] = P2(h.p[0], h.p[1]); C.drawWarn(mx, hx2, hz2, 10); mx.fillStyle = '#fde047'; mx.strokeStyle = 'rgba(0,0,0,.8)'; mx.lineWidth = 3; mx.strokeText(h.name, hx2, hz2 - 15); mx.fillText(h.name, hx2, hz2 - 15); } // союзник просит помощи
    const [px, pz] = P2(craft.pos.x, craft.pos.z);
    mx.save(); mx.translate(px, pz); mx.rotate(-craft.yaw); mx.fillStyle = '#7cf'; mx.beginPath(); mx.moveTo(0, -9); mx.lineTo(6, 7); mx.lineTo(-6, 7); mx.closePath(); mx.fill(); mx.restore();
  }

  // ═════════════ HUD ═════════════
  const rc = $('rwr'), rx2 = rc.getContext('2d'), CCIP = V3();
  let ccipOk = false, larText = '', larT = 0, hudT = 0;
  function updateLar(dt) {
    larT -= dt; if (larT > 0) return; larT = 0.15;
    const l = curW(); larText = ''; ccipOk = false;
    if (!l || craft.dead) return;
    const Wp = AG[l.key];
    if (Wp.kind === 'cruise' || Wp.kind === 'decoy') { const a = coordAim(Wp.rmax); larText = a ? `пуск по координатам · ${(craft.pos.distanceTo(a) / 1000).toFixed(1)} км` : 'нет координат цели'; return; }
    if (Wp.kind === 'bomb' || Wp.kind === 'lgb' || Wp.kind === 'tvb' || Wp.kind === 'gps') {
      const aim = Wp.kind === 'bomb' ? null : Wp.kind === 'gps' ? coordAim(Wp.rmax * 1.2) : pod.lock;
      const t = predictBomb(city, Wp, craft.pos, craft.vel, aim, CCIP);
      ccipOk = t > 0;
      if (aim && t > 0) {
        const miss = CCIP.distanceTo(aim);
        larText = miss < Math.max(12, Wp.blast * 0.4) ? `В ЗОНЕ · ${t.toFixed(0)} с до попадания` : (CCIP.distanceTo(craft.pos) < aim.distanceTo(craft.pos) ? 'ДАЛЕКО — ближе или выше' : 'БЛИЗКО — проскочили');
      } else if (t > 0) larText = Wp.kind === 'bomb' ? `падение через ${t.toFixed(0)} с` : 'нужен захват контейнером';
    } else if (Wp.kind === 'arm') {
      const u = armTarget(Wp); larText = u ? `РЛС ${u.S.rwr || u.S.short} · ${(craft.pos.distanceTo(u.pos) / 1000).toFixed(1)} км — ПУСК` : 'нет РЛС впереди';
    } else if (pod.lock) {
      const d = craft.pos.distanceTo(pod.lock); larText = d < Wp.rmax ? `в зоне · ${(d / 1000).toFixed(1)} км` : `далеко · ${(d / 1000).toFixed(1)} км`;
    } else larText = 'нужен захват контейнером';
  }
  function drawHud() {
    const hx = C.hx, proj = (p) => C.proj(p);
    hx.font = '600 11px -apple-system, Segoe UI, sans-serif'; hx.textAlign = 'center'; hx.lineWidth = 1.5;
    if (craft.dead) return;
    const fp = proj(LP.copy(craft.pos).addScaledVector(craft.vel, 3));
    if (aimOn()) { const ap = proj(LP.copy(craft.pos).addScaledVector(aimDir(AIMD), 2000)); if (ap) { hx.strokeStyle = 'rgba(255,255,255,.85)'; hx.beginPath(); hx.arc(ap[0], ap[1], 11, 0, 7); hx.moveTo(ap[0] - 3, ap[1]); hx.lineTo(ap[0] + 3, ap[1]); hx.stroke(); } } // куда смотрит камера — туда летит самолёт
    if (fp) { hx.strokeStyle = '#9fffb8'; hx.beginPath(); hx.arc(fp[0], fp[1], 7, 0, 7); hx.moveTo(fp[0] - 16, fp[1]); hx.lineTo(fp[0] - 7, fp[1]); hx.moveTo(fp[0] + 7, fp[1]); hx.lineTo(fp[0] + 16, fp[1]); hx.moveTo(fp[0], fp[1] - 7); hx.lineTo(fp[0], fp[1] - 13); hx.stroke(); }
    for (const o of game.targets) {
      const p = proj(LP.set(o.x, city.groundH(o.x, o.z) + 20, o.z)); if (!p) continue;
      const d = craft.pos.distanceTo(LP);
      hx.strokeStyle = o.dead ? 'rgba(200,200,200,.6)' : '#fde047'; hx.fillStyle = hx.strokeStyle;
      hx.beginPath(); hx.moveTo(p[0], p[1] - 9); hx.lineTo(p[0] + 9, p[1]); hx.lineTo(p[0], p[1] + 9); hx.lineTo(p[0] - 9, p[1]); hx.closePath(); hx.stroke();
      hx.fillText(`${o.name}${o.dead ? ' ✕' : ''} ${(d / 1000).toFixed(1)}`, p[0], p[1] - 13);
    }
    const M = C.MODE();
    // «Реализм»: подвеска пуста (или мало ловушек/топлива) — метка точки вылета, где пополняются
    if (M.reload === 'home' && reloadable() && homeLeft > 0 && (needsRearm() || craft.cmFlare < M.cm * 0.5 || craft.fuel < 0.6)) {
      const p = proj(LP.set(home.x, home.y + 30, home.z));
      const dh = Math.hypot(craft.pos.x - home.x, craft.pos.z - home.z), z0 = game.net ? game.net.zone : zn.Z;
      if (!z0 || (!zn.fuel && !zn.ammo)) edgeArrow(LP.set(home.x, home.y + 30, home.z), `вылет ${(dh / 1000).toFixed(1)} км`, '#86efac'); // зоны нет (или кончилась) — пополнение у точки вылета
      if (p) { const d = dh; hx.strokeStyle = hx.fillStyle = '#86efac'; hx.beginPath(); hx.arc(p[0], p[1], 9, 0, 7); hx.moveTo(p[0] - 5, p[1]); hx.lineTo(p[0] + 5, p[1]); hx.moveTo(p[0], p[1] - 5); hx.lineTo(p[0], p[1] + 5); hx.stroke(); hx.fillText(`Пополнение ${(d / 1000).toFixed(1)}${d < 2500 ? ' · ниже 1500 м' : ''}`, p[0], p[1] - 13); }
    }
    for (const u of C.S.units) {
      if (u.dead) continue;
      if (!(M.markers ? (u.S.radar && u.emit) || u.known : u.known && u.S.radar && u.emit) && !game.opts.showUnits) continue;
      const p = proj(u.pos); if (!p) continue;
      hx.strokeStyle = u.track === craft ? '#ff4d4d' : '#ff9b9b'; hx.fillStyle = hx.strokeStyle;
      hx.beginPath(); hx.moveTo(p[0], p[1] - 8); hx.lineTo(p[0] + 7, p[1] + 5); hx.lineTo(p[0] - 7, p[1] + 5); hx.closePath(); hx.stroke();
      hx.fillText(u.S.rwr || u.S.short, p[0], p[1] + 17);
    }
    if (M.markers) for (const m of C.S.sams) {
      if (m.dead || m.target !== craft) continue;
      const p = proj(m.pos); if (!p) continue;
      hx.strokeStyle = '#ff3b3b'; hx.beginPath(); hx.arc(p[0], p[1], 6, 0, 7); hx.stroke();
      hx.fillStyle = '#ff3b3b'; hx.fillText((m.pos.distanceTo(craft.pos) / 1000).toFixed(1), p[0], p[1] - 9);
    }
    if (pod.lock) { const p = proj(pod.lock); if (p) { hx.strokeStyle = pod.laser ? '#fb7185' : '#fde047'; hx.strokeRect(p[0] - 10, p[1] - 10, 20, 20); if (pod.laser) { hx.fillStyle = '#fb7185'; hx.fillText('L', p[0] + 16, p[1] - 10); } } }
    const l = curW();
    if (l && ccipOk && AG[l.key].kind !== 'agm' && AG[l.key].kind !== 'arm') {
      const p = proj(CCIP);
      // прицел бомбы: круг на земле — радиус поражения (разлёт), перекрестие — точка падения; при большом крене — красный («сброс невозможен»)
      if (p) {
        const Wb = AG[l.key], R = Math.max(8, Wb.blast || 20), ok = levelOk(), col = ok ? '#9fffb8' : '#f87171';
        hx.strokeStyle = col; hx.lineWidth = 2.2; hx.beginPath(); let first = true, span = 0;
        const ring = []; for (let i = 0; i <= 32; i++) { const a2 = i / 32 * Math.PI * 2, q = proj(TMP0.set(CCIP.x + Math.cos(a2) * R, CCIP.y + 0.5, CCIP.z + Math.sin(a2) * R)); ring.push(q); if (q) span = Math.max(span, Math.hypot(q[0] - p[0], q[1] - p[1])); }
        // круг поражения на земле; если вдали он меньше 14 px — рисуем не меньше (иначе не разглядеть)
        if (span < 14) hx.arc(p[0], p[1], 14, 0, 7);
        else for (const q of ring) { if (!q) { first = true; continue; } if (first) { hx.moveTo(q[0], q[1]); first = false; } else hx.lineTo(q[0], q[1]); }
        hx.stroke();
        const c = 16, g = 5; hx.beginPath(); hx.moveTo(p[0] - c, p[1]); hx.lineTo(p[0] - g, p[1]); hx.moveTo(p[0] + g, p[1]); hx.lineTo(p[0] + c, p[1]); hx.moveTo(p[0], p[1] - c); hx.lineTo(p[0], p[1] - g); hx.moveTo(p[0], p[1] + g); hx.lineTo(p[0], p[1] + c); hx.stroke();
        hx.beginPath(); hx.arc(p[0], p[1], 1.8, 0, 7); hx.fillStyle = col; hx.fill(); hx.lineWidth = 1;
        if (!ok) hx.fillText('КРЕН', p[0], p[1] - 22);
      }
    }
    for (const w of C.S.wpns) { if (w.owner !== craft) continue; const p = proj(w.pos); if (!p) continue; hx.fillStyle = w.homing ? '#fde047' : '#aaa'; hx.beginPath(); hx.arc(p[0], p[1], 3, 0, 7); hx.fill(); }
  }
  function drawRwr(list, mws, t) {
    const S2 = rc.width, c = S2 / 2; rx2.clearRect(0, 0, S2, S2);
    rx2.fillStyle = 'rgba(0,18,8,.55)'; rx2.beginPath(); rx2.arc(c, c, c - 2, 0, 7); rx2.fill();
    rx2.strokeStyle = 'rgba(140,255,170,.45)'; rx2.lineWidth = 2; for (const r of [0.33, 0.66, 0.98]) { rx2.beginPath(); rx2.arc(c, c, (c - 4) * r, 0, 7); rx2.stroke(); }
    rx2.font = `700 ${Math.round(S2 * 0.09)}px -apple-system, sans-serif`; rx2.textAlign = 'center'; rx2.textBaseline = 'middle';
    const brg = (p) => Math.atan2(-(p.x - craft.pos.x), -(p.z - craft.pos.z)) - craft.yaw;
    for (const e of list) {
      if (e.state === 'launch' && Math.floor(t * 6) % 2) continue;
      const b = brg(e.u.ant), rr = (c - 14) * (e.state === 'launch' ? 0.3 : e.state === 'track' ? 0.6 : 0.88);
      const x = c - Math.sin(b) * rr, y = c - Math.cos(b) * rr, col = e.state === 'search' ? '#9fffb8' : '#ff4d4d';
      rx2.fillStyle = col; rx2.fillText(e.u.S.rwr || '?', x, y);
      if (e.state !== 'search') { rx2.strokeStyle = col; rx2.beginPath(); rx2.arc(x, y, S2 * 0.08, 0, 7); rx2.stroke(); }
    }
    for (const e of mws) { const b = brg(e.m.pos), x = c - Math.sin(b) * (c - 9), y = c - Math.cos(b) * (c - 9); rx2.fillStyle = '#ff2d2d'; rx2.beginPath(); rx2.arc(x, y, S2 * 0.045, 0, 7); rx2.fill(); }
    rx2.fillStyle = '#9fffb8'; rx2.beginPath(); rx2.moveTo(c, c - 8); rx2.lineTo(c + 6, c + 7); rx2.lineTo(c - 6, c + 7); rx2.closePath(); rx2.fill();
  }
  // компактная панель слева вверху (5 строк): полёт и топливо; оружие в одну строку (тап по названию — выбор); прицел;
  // цель контейнера и «ТВ»; ловушки, цели задания, корпус (если повреждён). Газ — на кнопке «ГАЗ», очки — в итогах
  function hudText(rw, mw) {
    const g = city.groundH(craft.pos.x, craft.pos.z), inAir = C.S.wpns.filter((w) => w.owner === craft).length;
    let tgl = '';
    if (hasPod) {
      const t = pod.tgt, d = t ? (craft.pos.distanceTo(tgtPos(t, TP)) / 1000).toFixed(1) : '';
      const st = !t ? '<span class="dim">нет целей</span>' : pod.lock ? `<b class="lk">ЗАХВАТ</b>${pod.laser ? ' <b class="ls">●</b>' : ''}` : pod.why ? `<span class="warnc">${pod.why}</span>` : '<span class="lk2">захват…</span>';
      tgl = `<div class="tgl"><span class="tn">◎ ${t ? `${pod.lockName} ${d}` : ''} ${st}</span><span class="tvb ${pod.show ? 'on' : ''}">ТВ</span></div>`;
    }
    const dead = game.targets.filter((o) => o.dead).length, fuel = Math.round((craft.fuel ?? 1) * 100);
    $('wpn').innerHTML = `<div class="fl"><b>${Math.round(craft.speed * 3.6)}</b> км/ч <b>${Math.round(craft.pos.y - g)}</b> м <span class="${craft.fuel < 0.2 ? 'warnc' : 'dim'}">${ico('fuel', 'ii')}${fuel}%</span>${craft.ab ? ' <b class="ab">Ф</b>' : ''}</div>` +
      `<div class="wl">${loadout.map((l, i) => `<span class="r ${i === sel ? 'sel' : ''}" data-w="${i}">${AG[l.key].short}${AG[l.key].kind === 'ecm' ? ' ●' : ' ×' + l.n}${AG[l.key].kind !== 'ecm' && Number.isFinite(l.res) && !game.net ? ` <span class="dim">+${l.res}</span>` : ''}${l.rt > 0 ? ` <span class="dim">↻${Math.ceil(l.rt)}</span>` : ''}</span>`).join('')}</div>` +
      `<div class="st">${msgT > 0 ? msgText : larText}${inAir ? ` <span class="fly">· в полёте ${inAir}</span>` : ''}</div>` + tgl +
      `<div class="cm">ловушки ${Math.max(craft.cmFlare, craft.cmChaff)}${game.hunt ? ` · РЛС ${game.hunt.n}/${game.hunt.need}` : game.targets.length ? ` · цели ${dead}/${game.targets.length}` : ''}${craft.hp < 100 ? (() => { const [, nm, col] = hullState(craft.hp), br = dmgBrief(craft); return `<br><b style="color:${col}">${nm}</b>${br ? ` <span class="dim">· ${br}</span>` : ''}`; })() : ''}${C.auto ? ' · <b style="color:#86efac">АВТО</b>' : ''}${hasPod && pod.laserMan !== null ? ` · лазер ${pod.laserMan ? 'вкл' : 'выкл'}` : ''}${homeT > 0 ? ` · <b style="color:#86efac">пополнение ${Math.ceil(12 - homeT)} с</b>` : ''}</div>`;
    const lk = rw.find((e) => e.state === 'launch'), tr = rw.find((e) => e.state === 'track'), wn = $('warn');
    if (mw.length || lk) { wn.textContent = `ПУСК РАКЕТЫ${lk ? ' — ' + (lk.u.S.rwr || lk.u.S.short) : ''}`; wn.style.display = 'block'; }
    else if (tr) { wn.textContent = `ЗАХВАТ — ${tr.u.S.rwr || tr.u.S.short}`; wn.style.display = 'block'; }
    else wn.style.display = 'none';
    const b = $('podBox'); b.style.display = pod.show && hasPod && !game.over && !craft.dead ? 'block' : 'none';
    if (pod.show) {
      b.classList.toggle('locked', !!pod.lock); b.classList.toggle('ir', NIGHT >= 0.5);
      b.querySelector('.zoom').textContent = `×${Math.round(ZOOMS[0] / ZOOMS[pod.zi] * 10) / 10}`;
      b.querySelector('.mask').style.display = pod.masked ? 'flex' : 'none';
      const rng = pod.lock ? craft.pos.distanceTo(pod.lock) : 0;
      b.querySelector('.info').textContent = `${NIGHT >= 0.5 ? 'ИК' : 'ТВ'}${pod.lock ? `  ЗАХВАТ ${(rng / 1000).toFixed(1)} км` : pod.tgt ? '  поиск' : '  обзор'}\n${pod.lockName}`;
      b.querySelector('.info2').textContent = pod.laser ? 'ЛАЗЕР ●' : pod.lock ? 'лазер ○' : pod.why;
    }
  }

  // ═════════════ Камера ═════════════
  // 0 — за самолётом, 1 — облёт, 2 — из кабины, 3 — за оружием: летит за своей бомбой/ракетой до разрыва (3 с смотрит на
  // попадание), нет своего оружия в воздухе — за ракетой ПВО, которая летит в вас; ничего нет — за самолётом
  const fw = V3(), up = V3(), camPos = V3(), camLook = V3(), wcLook = V3(), wcV = V3();
  const CAM_NAMES = ['за самолётом', 'облёт', 'из кабины', 'за оружием (бомбы и ракеты)'];
  const wc = { obj: null, kind: '', endT: 0, last: V3(), init: false, off: V3() };
  function nextCam(to) { camMode = to ?? (camMode + 1) % 4; wc.obj = null; wc.init = false; say(`Камера: ${CAM_NAMES[camMode]}`, 1.4); }
  function pickWcam() {
    let best = null;
    for (const w of C.S.wpns) if (!w.dead && w.owner === craft && weaponHasModel(w.key, w.W) && (!best || w.id < best.id)) best = w; // раньше сброшенное — раньше упадёт; без готовой модели — камеру не подводим
    if (best) return [best, 'w'];
    let bd = 1e12;
    for (const m of C.S.sams) if (!m.dead && m.target === craft) { const d = m.pos.distanceToSquared(craft.pos); if (d < bd) { bd = d; best = m; } }
    return best ? [best, 'm'] : [null, ''];
  }
  function weaponCamera(dt, t) {
    // ведём объект до разрыва и ещё 3 с смотрим на попадание; своё оружие важнее ракеты ПВО
    if (wc.obj && wc.obj.dead && !wc.endT) wc.endT = t;
    if (wc.endT && t - wc.endT > 3) { wc.obj = null; wc.endT = 0; }
    if (!wc.obj || (wc.kind === 'm' && !wc.endT)) {
      const [o, k] = pickWcam();
      if (o && o !== wc.obj && (!wc.obj || k === 'w')) { wc.obj = o; wc.kind = k; wc.endT = 0; wc.init = false; }
    }
    const o = wc.obj;
    if (!o) return false;
    if (!o.dead) {
      const v = o.vel ? wcV.copy(o.vel) : wcV.copy(o.dir).multiplyScalar(o.speed); const sp = v.length() || 1; v.divideScalar(sp);
      const L = o.W ? (o.W.vis ? o.W.vis.L : 4) : o.M.L, back = L * 3.2 + 10;
      // сзади-сбоку и чуть сверху; взгляд — вперёд по траектории, у ракеты ПВО — на самолёт
      camPos.copy(o.pos).addScaledVector(v, -back); camPos.x += -v.z * L * 0.9; camPos.z += v.x * L * 0.9; camPos.y += L * 0.7 + 2.5;
      camLook.copy(o.pos).addScaledVector(v, 50);
      if (wc.kind === 'm') camLook.lerp(craft.pos, 0.5);
      wc.last.copy(o.pos);
    } else camLook.copy(wc.last); // разрыв: камера замерла и смотрит на место попадания
    if (!wc.init) { camera.position.copy(camPos); wcLook.copy(camLook); wc.init = true; wc.off.copy(camPos).sub(o.pos); }
    else if (!o.dead) { wc.off.lerp(camPos.sub(o.pos), 1 - Math.exp(-dt * 4)); camera.position.copy(o.pos).add(wc.off); wcLook.lerp(camLook, 1 - Math.exp(-dt * 8)); } // смещение от оружия — со сглаживанием, без отставания
    else wcLook.lerp(camLook, 1 - Math.exp(-dt * 4));
    camera.up.set(0, 1, 0); camera.lookAt(wcLook);
    return true;
  }
  const camOff = V3(), UPW = new THREE.Vector3(0, 1, 0); let camInit = false;
  // онлайн: союзники — самолёты своей команды (люди и боты), кроме своего; имя — из состава комнаты
  const alliesOf = () => (game.net ? C.raid.planes.filter((a) => !a.dead && !a.out && a.role !== 'decoy' && a.role !== 'carrier' && a !== craft && !(game.net.me && a.id === game.net.me.id)) : []);
  const allyName = (a) => { const N = game.net, p = N && N.room && (N.room.players || []).find((q) => q.id === (a.owner || a.id)); return p ? `${p.name}${p.bot ? ' (бот)' : ''}` : 'союзник'; };
  // онлайн: сбит или вылет окончен — смотрим за союзником (КАМ. / B — следующий), никого нет — облёт целей
  const spec = { i: 0, why: '', t: 0, off: V3(), init: false };
  function spectate(dt, t) {
    const allies = game.net ? alliesOf() : C.raid.planes.filter((a) => !a.dead && !a.out && a.role !== 'decoy');
    if (C.camera.fov !== 62) C.setFov(62);
    if (allies.length) {
      const a = allies[spec.i % allies.length]; fwdOf(a, fw);
      camPos.copy(fw).multiplyScalar(-70).setY(16);
      if (!spec.init) { spec.off.copy(camPos); spec.init = true; } else spec.off.lerp(camPos, 1 - Math.exp(-dt * 4));
      camera.position.copy(a.pos).add(spec.off); camera.up.set(0, 1, 0); camera.lookAt(camLook.copy(a.pos).addScaledVector(fw, 80));
    } else {
      const o = game.targets[0] || { x: 0, z: 0 }, ang = t * 0.05;
      camera.position.set(o.x + Math.sin(ang) * 2500, 900, o.z + Math.cos(ang) * 2500); camera.up.set(0, 1, 0); camera.lookAt(o.x, 50, o.z);
    }
  }
  function updateCamera(dt, t) {
    if (game.net && craft.dead) { spectate(dt, t); return; } // за союзниками — только когда сбит (решение Mark)
    // модель самолёта — до отрисовки кадра, в ту же точку, по которой ставится камера (иначе самолёт «прыгает» на кадр)
    ship.position.copy(craft.pos); ship.rotation.set(craft.pitch, craft.yaw, craft.roll, 'YXZ');
    fwdOf(craft, fw); up.set(0, 1, 0).applyQuaternion(shipQ);
    if (C.camera.fov !== 62) C.setFov(62);
    if (free.on && !craft.dead) { // обзор: камера за самолётом по направлению взгляда (назад — перед самолётом, лицом к нему)
      const d = AIMD.set(-Math.sin(free.yaw) * Math.cos(free.pitch), Math.sin(free.pitch), -Math.cos(free.yaw) * Math.cos(free.pitch));
      camPos.copy(d).multiplyScalar(-42).addScaledVector(UPW, 7);
      camOff.lerp(camPos, 1 - Math.exp(-dt * 10)); camera.position.copy(craft.pos).add(camOff);
      camera.up.set(0, 1, 0); camera.lookAt(camLook.copy(craft.pos).addScaledVector(d, 150));
    } else if (camMode === 3 && weaponCamera(dt, t)) { /* за оружием */ }
    else if (camMode === 0 || camMode === 3) {
      // сглаживается смещение камеры относительно самолёта, а не её место в мире: при скорости 250 м/с сглаживание
      // абсолютной позиции даёт отставание, которое «дышит» от длительности кадра
      // наведение камерой: камера — по взгляду (aim), горизонт ровный; самолёт догоняет взгляд сам
      const am = aimOn(), d = am ? aimDir(AIMD) : fw;
      camPos.copy(d).multiplyScalar(-40).addScaledVector(am ? UPW : up, 8.5);
      if (!camInit || camOff.distanceTo(camPos) > 300) { camOff.copy(camPos); camInit = true; } else camOff.lerp(camPos, 1 - Math.exp(-dt * (am ? 12 : 8)));
      camera.position.copy(craft.pos).add(camOff);
      camera.up.lerp(am ? UPW : up, 1 - Math.exp(-dt * 6)).normalize();
      camLook.copy(craft.pos).addScaledVector(d, am ? 120 : 80); camera.lookAt(camLook);
    } else if (camMode === 1) {
      const a = t * 0.15; camera.position.set(craft.pos.x + Math.sin(a) * 90, craft.pos.y + 25, craft.pos.z + Math.cos(a) * 90);
      camera.up.set(0, 1, 0); camera.lookAt(craft.pos);
    } else { camera.position.copy(craft.pos).addScaledVector(fw, 6.5).addScaledVector(up, 1.5); camera.quaternion.copy(shipQ); camera.up.copy(up); } // из кабины
    const top = city.topAt(camera.position.x, camera.position.z) + 3;
    if (camera.position.y < top) camera.position.y = top;
  }

  // ═════════════ Начало и конец вылета ═════════════
  function start(opts = {}) {
    const setup = C.setup;
    game.opts = opts; C.lastGame = opts.lastGame || 'air'; C.ended = false; demo = null; if (free.on) freeLook(false);
    zoneReset(); zn.Z = opts.lastGame === 'training' ? null : newZone(Math.random); // обучение — без зоны пополнения
    const rnd = mulberry32((Date.now() & 0xffffff) ^ 0x9e37);
    craft.dead = false;
    // «Операция» (setup.op): вылет 1 — охота за ПВО (setup.lo), вылет 2 — удар (setup.lo2) по тому же городу: что разбито в первом —
    // остаётся разбитым, уцелевшие комплексы перезаряжаются и снова включают РЛС
    const opOn = !!(setup.op && !opts.items && !opts.targets && !opts.defense && C.lastGame === 'air');
    if (!opOn) C.op = null;
    else if (C.op && C.op.next && C.S) { C.op.stage = 2; C.op.next = false; }
    else C.op = { stage: 1, next: false };
    const cont = !!(C.op && C.op.stage === 2);
    if (C.op) setup.lo = cont ? setup.lo2 : setup.lo1;
    const S = cont ? C.S : C.newBattle({ defSide: setup.side, era: setup.era, player: craft, rnd, game: 'air' });
    if (cont) {
      C.player = craft;
      for (const m of S.sams) m.dead = true; for (const w of S.wpns) w.dead = true; S.flares.length = 0; // небо — чистое
      for (const u of S.units) if (!u.dead) { u.ammo = u.S.ammo; u.reloadT = 0; u.salvoLeft = 0; u.track = null; u.shutT = 0; if (u.S.radar && !u.manual) u.emit = !u.ambush; }
    }
    buildShip(setup.side === 'east' ? 'west' : 'east');
    C.hooks = {
      hurtPlayer: hurt, playerLaser: () => laserSpot,
      wpnEnd(w, res) {
        if (w.owner !== craft) return;
        if (res.objects.length || res.units.length) say(`${w.W.short}: попадание — ${[...res.objects.map((o) => o.name), ...res.units.map((u) => u.S.short)].join(', ')}`, 2.5);
        else say(`${w.W.short}: ${res.intercepted ? 'сбита ПВО' : w.jammed ? 'мимо — помехи навигации' : 'мимо'}`, 1.8);
        if (opts.onWpnEnd) opts.onWpnEnd(w, res);
      },
      objectDestroyed(o) {
        const isT = game.targets.includes(o);
        game.score += Math.round(o.value * (isT ? 10 : 4) * (setup.diff === 'real' ? 1.5 : 1));
        say(`УНИЧТОЖЕН: ${o.name}${isT ? ' — цель задания' : ''}`, 3);
        if (isT) snd.good();
        if (!game.done && !game.hunt && game.targets.length && game.targets.every((q) => q.dead)) { game.done = true; say('ЗАДАЧА ВЫПОЛНЕНА — уходите за границу района или охотьтесь на ПВО', 5); }
      },
      unitDestroyed(u) {
        // охота за ПВО: задача — уничтожить hunt.need комплексов с РЛС
        if (game.hunt && u.S.radar && ++game.hunt.n >= game.hunt.need && !game.done) { game.done = true; say('ЗАДАЧА ВЫПОЛНЕНА — ПВО подавлена: уходите за границу района или продолжайте охоту', 5); }
        game.kills++; game.score += Math.round((u.S.radar ? 400 : 200) * (setup.diff === 'real' ? 1.5 : 1)); say(`Уничтожен комплекс: ${u.S.name}`, 2.5); snd.good(); if (opts.onUnitDestroyed) opts.onUnitDestroyed(u); },
      samLaunch(m) { if (opts.onSamLaunch) opts.onSamLaunch(m); },
      samEnd(m, hit) { if (opts.onSamEnd) opts.onSamEnd(m, hit); },
    };
    if (cont) game.targets = C.op.targets;
    else {
      game.targets = opts.targets ? opts.targets.map((k) => S.objects.find((o) => o.key === k)).filter(Boolean) : pickTargets(S, rnd);
      const kn = setup.game === 'air' && C.diff ? C.diff.knobs('air', setup.diff) : null; // сложность: режим + скрытая подстройка (не в обучении и «Съёмке»)
      if (opts.defense) opts.defense(S, rnd); else placeDefense(S, city, rnd, setup.side, setup.era, game.targets, kn ? kn.density : 1, kn || {});
      if (C.op) C.op.targets = game.targets;
    }
    C.syncUnits();
    // подвеска: тяжёлое — ближе к фюзеляжу
    rearm(); initDamage(craft); if (craft.dmgVis) craft.dmgVis.sync(craft); // новый вылет — самолёт целый
    // задача по подвеске: «охота за ПВО» — половина комплексов с РЛС (1…4), «штурмовка» — объекты города
    game.hunt = null;
    if (!opts.items && !opts.targets && loadoutRole(LOADOUTS[setup.era][setup.lo]) === 'sead') {
      const radars = S.units.filter((u) => u.S.radar).length;
      if (radars) game.hunt = { n: 0, need: Math.max(1, Math.min(4, Math.ceil(radars * 0.5))), total: radars };
    }
    const z0 = opts.photo && C.MAP === 'city' ? 9000 : 14000; // «Съёмка» в городе — ближе: с 14 км в кадре край карты
    const sp = opts.spawn || { x: riverX(z0) + 1500, y: opts.photo && C.MAP === 'city' ? 1800 : 3200, z: z0, yaw: 0 };
    home.set(sp.x, city.groundH(sp.x, sp.z), sp.z); homeT = 0;
    craft.pos.set(sp.x, sp.y, sp.z); craft.yaw = sp.yaw; craft.pitch = 0; craft.roll = 0; craft.speed = startV(240); thrI = 2; craft.thr = THR_STEPS[thrI]; craft.ab = false; craft.fuel = 1; fuelWarn = 0;
    craft.q = null; craft.wp = craft.wr = craft.wz = 0; craft.hp = 100; fwdOf(craft, craft.vel).multiplyScalar(craft.speed); aimSync(); aim.id = null;
    updLoad();
    podSet(null); pod.show = hasPod && !IS_TOUCH; pod.laserMan = null; pod.pickT = 0; pod.dir.set(0, -0.45, -1).normalize(); // окно на телефоне — по «ТВ»
    Object.assign(game, { score: 0, kills: 0, done: false, over: false, t: 0 });
    ship.visible = true; camMode = 0; camInit = false; snd.resetRwr();
    $('hud').style.display = 'block'; document.body.classList.add('flying'); document.body.classList.toggle('aimmode', aimOn());
    layoutTouch(); layoutPod();
    if (C.op) { const left = S.units.filter((u) => !u.dead && u.S.radar).length; say(cont ? `Вылет 2 из 2 — удар: ${game.targets.filter((o) => !o.dead).map((o) => o.name).join(', ')}. Комплексов с РЛС осталось: ${left}` : `Операция, вылет 1 из 2 — охота за ПВО: уничтожьте ${game.hunt ? game.hunt.need : 1} комплекса с РЛС. Вторым вылетом — удар по целям города.`, 7); }
    else if (!opts.noIntro) say(game.hunt ? `Охота за ПВО: уничтожьте ${game.hunt.need} из ${game.hunt.total} комплексов с РЛС (цели города — по желанию).` : `Цели: ${game.targets.map((o) => o.name).join(', ')}. ПВО: ${setup.side === 'east' ? 'советская' : 'западная'}, эпоха ${ERAS[setup.era - 1].short}`, 6);
  }
  // подвеска: тяжёлое — ближе к фюзеляжу (обучение перезаряжает этой же функцией)
  function rearm() {
    const opts = game.opts, setup = C.setup;
    loadout.length = 0;
    // подвеска своей стороны (выбранная — чужой: первая своя); самолёт — из подвески
    const att = opts.side || (setup.side === 'east' ? 'west' : 'east');
    if (!opts.items && LOADOUTS[setup.era][setup.lo].side !== att) setup.lo = loadoutsOf(setup.era, att)[0][1];
    const L = opts.items ? { items: opts.items, pod: opts.pod, side: att, plane: opts.plane } : LOADOUTS[setup.era][setup.lo];
    game.used = ['air:' + L.plane, ...L.items.map(([k]) => 'wpn:' + k)]; // прокачка: на чём летали (в «Реализме» — должно быть куплено)
    hasPod = !!L.pod; for (const [k] of L.items) wantWeapon(k); // модели подвески (оружие «Мульти-волны» и новое — грузятся по запросу)
    const order = [3, 4, 2, 5, 1, 6, 0, 7]; let oi = 0;
    // запас на борт (ошибки, промахи): «Аркада» — ещё 2 полных комплекта (пополняются сами), «Реализм» — 1 пополнение на точке вылета;
    // обучение (opts.reload) — без ограничений
    const sets = opts.reload ? Infinity : (C.MODE().rearms ?? 1); homeLeft = sets;
    for (const [key, n] of L.items.slice().sort((a, b) => AG[b[0]].mass - AG[a[0]].mass)) { const st = []; for (let i = 0; i < n && oi < 8; i++) st.push(order[oi++]); loadout.push({ key, n: st.length, n0: st.length, st, st0: st.slice(), rt: 0, res: st.length * sets }); }
    sel = 0;
    buildShip(L.side || att, classOf(L.items, AG), L.plane || null); // модель самолёта — из подвески
    craft.cmFlare = craft.cmChaff = C.MODE().cm;
    buildPylons();
    craft.jam = Math.max(0, ...loadout.map((l) => AG[l.key].jam || 0)); // станция помех на подвеске
    if (!usable(loadout[sel])) nextWeapon();
    // свои ТТХ самолёта (sim/flight.js): модель — из подвески; режим (Аркада/Реализм) — мягкость виража
    craft.fm = flightModel(L.plane || (att === 'east' ? 'su30' : 'f16'), { ind: (C.MODE() || {}).ind });
    updLoad();
  }
  // скорость на старте — не быстрее, чем самолёт может (Су-25, B-52)
  const startV = (v) => (craft.fm ? Math.min(v, craft.fm.s.vSL / 3.6 * 0.8 * 0.85) : v);
  // груз и сопротивление подвесок → лётная модель (масса топлива — из craft.fuel)
  function updLoad() {
    craft.massK = 1 + loadout.reduce((s, q) => s + q.n * AG[q.key].mass, 0) / 9000;
    if (craft.fm) { const L = loadOf(craft.fm.key, loadout.map((q) => ({ mass: AG[q.key].mass, n: q.n }))); craft.payload = L.payload; craft.dragK = L.dragK; }
  }
  // ═════════════ Онлайн ═════════════
  // зеркало боя собрано (net.js); вылет — по событию сервера spawn (связка, точка, подвеска), урон — netHit, сбитие — netDown
  function startNet(N) {
    game.net = N; game.opts = { noEnd: true, noIntro: true, side: N.battle.sideAir }; C.lastGame = 'online'; C.ended = false;
    craft.dead = true; C.player = craft; spec.why = 'Ждём вылета'; spec.init = false;
    buildShip(N.battle.sideAir); ship.visible = false; // модель — до вылета (связку и подвеску даст spawn)
    C.hooks = {
      playerLaser: () => laserSpot,
      wpnEnd(w, res) { if (w.owner === craft) say(`${w.W.short}: ${res.intercepted ? 'сбита ПВО' : 'разрыв'}`, 1.8); },
      objectDestroyed(o) { say(`УНИЧТОЖЕН: ${o.name}${game.targets.includes(o) ? ' — цель задания' : ''}`, 3); if (game.targets.includes(o)) snd.good(); },
      unitDestroyed(u) { say(`Уничтожен комплекс: ${u.S.name}`, 2.5); snd.good(); },
    };
    game.targets = N.battle.targets.map((id) => C.S.objects.find((o) => o.id === id)).filter(Boolean);
    Object.assign(game, { score: 0, kills: 0, done: false, over: false, t: 0 });
    $('hud').style.display = 'block'; document.body.classList.add('flying'); document.body.classList.toggle('aimmode', aimOn()); layoutTouch(); layoutPod(); snd.resetRwr();
  }
  function netSpawn(m) {
    const o = game.opts, L = { items: m.load.map((l) => [l.key, l.n]), plane: m.plane };
    o.items = L.items; o.plane = m.plane; o.pod = !!(m.choice !== undefined && LOADOUTS[game.net.battle.era][m.choice] && LOADOUTS[game.net.battle.era][m.choice].pod);
    rearm(); if (!m.back || !craft.dz) { initDamage(craft); if (craft.dmgVis) craft.dmgVis.sync(craft); }
    craft.cmFlare = m.cm.flare; craft.cmChaff = m.cm.chaff;
    const [x, y, z, yaw] = m.s;
    craft.dead = false; craft.pos.set(x, y, z); craft.yaw = yaw; craft.pitch = 0; craft.roll = 0; craft.speed = m.back ? (m.v || 240) : startV(m.v || 240); thrI = 2; craft.thr = THR_STEPS[thrI]; craft.ab = false; craft.fuel = 1; fuelWarn = 0; zoneReset();
    craft.q = null; craft.wp = craft.wr = craft.wz = 0; craft.hp = m.hp ?? 100; fwdOf(craft, craft.vel).multiplyScalar(craft.speed); aimSync(); aim.id = null;
    podSet(null); pod.show = hasPod && !IS_TOUCH; pod.laserMan = null; pod.pickT = 0; pod.dir.set(0, -0.45, -1).normalize();
    ship.visible = true; camMode = 0; camInit = false; game.over = false;
    if (m.back) { say('Связь восстановлена — управление снова у вас', 3); snd.good(); return; } // самолёт вёл ИИ, пока не было связи
    say(`Вылет! Цели: ${game.targets.map((q) => q.name).join(', ')}. Вылетов в запасе: ${m.lives}`, 5);
  }
  // связь пропала — самолёт ведёт ИИ (без взрыва: он летит дальше); вернётся связь — управление снова у игрока (netSpawn back)
  function netAI() {
    if (craft.dead) return;
    craft.dead = true; ship.visible = false;
    spec.why = 'Связь пропала — самолёт ведёт ИИ. Управление вернётся, как только связь восстановится'; spec.t = 0; spec.init = false; say(spec.why, 5);
  }
  function netHit(hp, by, pk) { if (craft.dead) return; const hurtNow = hp < craft.hp; craft.hp = hp; if (hurtNow && by) { flashT = 0.35; snd.hit(); } if (pk) dmgEvents(dmgUnpack(craft, pk), by); else if (by) say(`Попадание: ${by}`, 1.5); }
  function netDown(why) {
    if (craft.dead) return;
    craft.dead = true; craft.hp = 0; C.fx.explosion(craft.pos, 30, 'air'); snd.planeKill(0);
    spec.why = why || 'Самолёт сбит'; spec.t = 0; spec.init = false; say(spec.why, 4);
  }
  function stop() {
    game.net = null; free.on = false; free.id = null; $("tLook").classList.remove("on"); zn.Z = null; zoneG.visible = false;
    ship.visible = false; $('hud').style.display = 'none'; $('podBox').style.display = 'none'; document.body.classList.remove('flying');
    mapOn = false; mapC.style.display = 'none'; $('warn').style.display = 'none'; keys.clear(); laserSpot = null; document.body.classList.remove('spect');
  }
  function finish(why, ok) {
    if (game.over) return; game.over = true;
    if (game.opts.noEnd) return;
    const dead = game.targets.filter((o) => o.dead).length, real = C.setup.diff === 'real';
    // прокачка: что сделано за вылет → airdef-solo (длительность меряет сервер); цели — по одной, комплексы, вернулся ли
    const claim = () => C.progress && C.progress.runClaim({ targets: Array(dead).fill(1), sams: game.kills, back: !craft.dead, win: !!game.done && !craft.dead }, game.used);
    if (C.op && C.op.stage === 1) { // операция: итоги первого вылета — дальше удар
      C.op.s1 = { score: game.score, kills: game.kills, hunt: game.hunt, alive: !craft.dead }; C.op.next = true;
      const h = game.hunt || { n: 0, need: 0 };
      setTimeout(claim, 950);
      C.showEnd({ title: 'Вылет 1 из 2 завершён', reason: why, win: craft.dead ? false : game.done ? true : null, again: 'Вылет 2: удар →',
        stats: [[`${Math.min(h.n, h.need)}/${h.need}`, 'РЛС уничтожено'], [game.kills, 'комплексов ПВО'], [game.score, 'очков'], [craft.dead ? 'сбит' : 'вернулся', 'самолёт']],
        note: `Уничтоженное остаётся уничтоженным; уцелевшие комплексы перезарядятся и снова включат РЛС. ${h.n >= h.need ? 'ПВО подавлена — удару будет легче.' : 'ПВО подавлена не полностью — удар будет опаснее.'}` });
      return;
    }
    if (C.op && C.op.stage === 2) { // операция: общий итог
      const s1 = C.op.s1 || { score: 0, kills: 0, alive: false, hunt: null }, bonus = s1.alive && !craft.dead ? 300 : 0, total = s1.score + game.score + bonus;
      C.showEnd({ title: 'Операция завершена', reason: why, win: game.done ? true : craft.dead ? false : null, again: 'Новая операция',
        stats: [[s1.hunt ? `${Math.min(s1.hunt.n, s1.hunt.need)}/${s1.hunt.need}` : '—', 'РЛС (вылет 1)'], [`${dead}/${game.targets.length}`, 'целей (вылет 2)'], [s1.kills + game.kills, 'комплексов ПВО'], [total, 'очков']],
        note: `Очки: ${s1.score} + ${game.score}${bonus ? ` + ${bonus} за два возвращения` : ''}. ${real ? 'Реализм' : 'Аркада'}, эпоха ${ERAS[C.setup.era - 1].short}.` });
      C.op = null; C.menu.record('air', total); setTimeout(claim, 950); return;
    }
    C.showEnd({ title: craft.dead ? 'Самолёт потерян' : 'Вылет завершён', reason: why, win: craft.dead ? false : game.done ? true : null,
      stats: [game.hunt ? [`${Math.min(game.hunt.n, game.hunt.need)}/${game.hunt.need}`, 'РЛС уничтожено'] : [`${dead}/${game.targets.length}`, 'целей уничтожено'], [game.kills, 'комплексов ПВО'], [game.score, 'очков'], [real ? 'Реализм' : 'Аркада', `эпоха ${ERAS[C.setup.era - 1].short}`]],
      note: game.done ? 'Задание выполнено.' : '' });
    C.menu.record('air', game.score); setTimeout(claim, 950); // итоги появляются через 0,9 с
  }

  // ═════════════ Кадр ═════════════
  // ═════════════ Пополнение подвески (одиночный вылет; онлайн — новый вылет за очки, обучение — своё) ═════════════
  // «Аркада»: опустевший пилон пополняется сам — по одной единице, тяжёлое дольше (20–60 с);
  // «Реализм»: только у точки вылета — ниже 1500 м в 2,5 км от неё 12 с: подвеска, ловушки и топливо целиком
  const relT = (l) => clamp(20 + AG[l.key].mass / 30, 20, 60);
  const reloadable = () => !game.net && (!game.opts.items || game.opts.reload) && !craft.dead && !game.over;
  const needsRearm = () => loadout.some((l) => AG[l.key].kind !== 'ecm' && l.n < l.n0 && l.res > 0);
  // ═════════════ Зона пополнения ═════════════
  // одиночный вылет — своя зона (sim/online.js zoneStep), онлайн — с сервера (N.zone: [x, z, до переезда]) и событие 'zr'
  const zn = { Z: null, it: { pos: craft.pos, zT: 0 }, fuel: ZONE.FUEL, ammo: ZONE.AMMO };
  const zoneG = new THREE.Group(); zoneG.visible = false; scene.add(zoneG);
  { const ring = new THREE.Mesh(new THREE.RingGeometry(ZONE.R - 40, ZONE.R, 64), new THREE.MeshBasicMaterial({ color: 0x4ade80, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 6; zoneG.add(ring);
    const col = new THREE.Mesh(new THREE.CylinderGeometry(ZONE.R, ZONE.R, 4000, 48, 1, true), new THREE.MeshBasicMaterial({ color: 0x4ade80, transparent: true, opacity: 0.07, side: THREE.DoubleSide, depthWrite: false }));
    col.position.y = 2000; zoneG.add(col); }
  const zoneRearm = () => { // весь боекомплект по связке (из «зоны» — без расхода запаса), ловушки — полные
    for (const l of loadout) for (const st of l.st0) if (!l.st.includes(st)) { l.st.push(st); l.n++; const m = pylonMeshes.find((q) => q.userData.st === st); if (m) m.visible = !shipInternal; }
    craft.cmFlare = craft.cmChaff = C.MODE().cm;
  };
  const zoneNeed = () => ({ fuel: zn.fuel > 0 && (craft.fuel ?? 1) < 0.9, ammo: zn.ammo > 0 && (loadout.some((l) => AG[l.key].kind !== 'ecm' && l.n < l.n0) || craft.cmFlare < C.MODE().cm * 0.5 || craft.cmChaff < C.MODE().cm * 0.5) });
  const zoneSay = (f, a) => { say(`Пополнение: ${[f ? 'топливо' : '', a ? 'боекомплект и ловушки' : ''].filter(Boolean).join(', ')} · осталось: топливо ${zn.fuel}, БК ${zn.ammo}`, 3.5); snd.good(); };
  function zoneReset() { zn.fuel = ZONE.FUEL; zn.ammo = ZONE.AMMO; zn.it.zT = 0; zn.it.pos = craft.pos; }
  function zoneUpdate(dt) {
    const N = game.net, z = N ? N.zone : zn.Z;
    zoneG.visible = !!z && !game.over && !game.opts.photo; // в «Режиме съёмки» колонна зоны не попадает в кадр
    if (!z) return;
    const zx = N ? z[0] : z.x, zz = N ? z[1] : z.z; zoneG.position.set(zx, city.groundH(zx, zz), zz);
    if (craft.dead || game.over) { zn.it.zT = 0; return; }
    if (N) { // онлайн: выдаёт сервер; здесь — только набор времени для подсказки
      const n = zoneNeed(), inside = (n.fuel || n.ammo) && Math.hypot(craft.pos.x - zx, craft.pos.z - zz) < ZONE.R;
      zn.it.zT = inside ? Math.min(ZONE.STAY, zn.it.zT + dt) : 0;
    } else zoneStep(zn.Z, [zn.it], dt, Math.random, zoneNeed, (it, n) => {
      if (n.fuel) { zn.fuel--; craft.fuel = 1; fuelWarn = 0; }
      if (n.ammo) { zn.ammo--; zoneRearm(); }
      zoneSay(n.fuel, n.ammo);
    });
  }
  function netResupply(e) { // [_, id, топливо, БК, осталось топлива, осталось БК, подвеска, ЛТЦ, диполи]
    zn.fuel = e[4]; zn.ammo = e[5]; zn.it.zT = 0;
    if (e[2]) { craft.fuel = 1; fuelWarn = 0; }
    if (e[3]) { zoneRearm(); craft.cmFlare = e[7]; craft.cmChaff = e[8]; }
    zoneSay(e[2], e[3]);
  }
  function zoneHud() { // зона пополнения: только метка в кадре или стрелка у края — расстояние и через сколько зона переедет (без строки внизу)
    const N = game.net, z = N ? N.zone : zn.Z; if (!z || craft.dead || game.over || (!zn.fuel && !zn.ammo)) return;
    const zx = N ? z[0] : z.x, zz = N ? z[1] : z.z, d = Math.hypot(craft.pos.x - zx, craft.pos.z - zz), left = N ? z[2] : Math.max(0, Math.round(ZONE.MOVE - z.t));
    const hx = C.hx, lab = zn.it.zT > 0 ? `пополнение ${Math.ceil(ZONE.STAY - zn.it.zT)} с` : `${(d / 1000).toFixed(1)} км${left ? ` · ${left} с` : ''}`;
    const p = C.proj(fw.set(zx, city.groundH(zx, zz) + 300, zz));
    if (p) {
      hx.font = '700 11px -apple-system, Segoe UI, sans-serif'; hx.textAlign = 'center'; hx.shadowColor = 'rgba(0,0,0,.85)'; hx.shadowBlur = 4;
      hx.strokeStyle = '#4ade80'; hx.lineWidth = 2; hx.beginPath(); hx.arc(p[0], p[1], 8, 0, 7); hx.stroke();
      hx.fillStyle = '#bbf7d0'; hx.fillText(lab, p[0], p[1] - 12); hx.shadowBlur = 0;
    }
    const nd = zoneNeed(); if (zn.it.zT <= 0 && (nd.fuel || nd.ammo || (craft.fuel ?? 1) < 0.35)) edgeArrow(fw.set(zx, city.groundH(zx, zz) + 300, zz), lab, '#4ade80'); // нужно пополниться — куда лететь
  }
  // стрелка у края экрана к точке, которой нет в кадре (за краем или позади): направление и подпись
  const EA = new THREE.Vector3();
  function edgeArrow(wp, label, col) {
    const W = C.VW, H = C.VH, v = EA.copy(wp).project(C.camera), behind = v.z > 1;
    let dx = (v.x + 1) / 2 * W - W / 2, dy = (1 - v.y) / 2 * H - H / 2;
    if (!behind && Math.abs(dx) < W / 2 - 50 && Math.abs(dy) < H / 2 - 60) return; // в кадре — там своя метка
    if (behind) { dx = -dx; dy = -dy; if (Math.abs(dx) + Math.abs(dy) < 1) dy = H; }
    const mx = W / 2 - (IS_TOUCH ? 110 : 70), my = H / 2 - (IS_TOUCH ? 95 : 70), k = Math.min(mx / Math.max(1e-6, Math.abs(dx)), my / Math.max(1e-6, Math.abs(dy)));
    const ax = W / 2 + dx * k, ay = H / 2 + dy * k, ang = Math.atan2(dy, dx), hx = C.hx, pulse = 0.75 + 0.25 * Math.sin(performance.now() / 180);
    hx.save(); hx.translate(ax, ay); hx.rotate(ang); hx.globalAlpha = pulse; hx.fillStyle = col; hx.strokeStyle = 'rgba(0,0,0,.75)'; hx.lineWidth = 2;
    hx.beginPath(); hx.moveTo(13, 0); hx.lineTo(-8, -9); hx.lineTo(-3, 0); hx.lineTo(-8, 9); hx.closePath(); hx.stroke(); hx.fill(); hx.restore();
    hx.font = '700 11px -apple-system, Segoe UI, sans-serif'; hx.textAlign = 'center'; hx.shadowColor = 'rgba(0,0,0,.85)'; hx.shadowBlur = 4; hx.fillStyle = col;
    hx.fillText(label, ax - Math.cos(ang) * 30, ay - Math.sin(ang) * 22 + 4); hx.shadowBlur = 0;
  }
  // кнопка «ПУСК» (телефон; сброс бомб и пуск ракет): готово сейчас × до следующей единицы (с), заливка по часовой — ход перезарядки; пусто и пополнять
  // нечем — кнопка полупрозрачная. Перезарядка сама — только в «Аркаде» (l.rt); в «Реализме» и онлайне — число
  let fbT = 0, fbS = '';
  function fireBtn(dt) {
    if (!IS_TOUCH || (fbT -= dt) > 0) return; fbT = 0.12;
    const b = $('tFire'), l = loadout[sel]; if (!b) return;
    const W = l && AG[l.key], reloading = !!(l && l.rt > 0 && l.n < l.n0), p = reloading ? Math.max(0, Math.min(1, 1 - l.rt / relT(l))) : l && l.n > 0 ? 1 : 0;
    const txt = !l ? '' : reloading ? `${l.n}×${Math.ceil(l.rt)}с` : `×${l.n}`, key = `${txt}|${Math.round(p * 60)}|${W ? W.short : ''}`;
    if (key === fbS) return; fbS = key;
    b.innerHTML = `<span>${ico('fire')}<small>${W ? W.short : ''}</small><em>${txt}</em></span>`; b.title = 'Пуск / сброс';
    if (b.style.setProperty) b.style.setProperty('--fb', `${Math.round(p * 360)}deg`);
    b.classList.toggle('dry', !!l && l.n <= 0 && !reloading);
  }
  function reloadOne(l) {
    const st = l.st0.find((q) => !l.st.includes(q)); if (st === undefined || !(l.res > 0)) return;
    l.st.push(st); l.n++; l.res--;
    const m = pylonMeshes.find((q) => q.userData.st === st); if (m) m.visible = !shipInternal;
    updLoad();
    if (!usable(loadout[sel])) sel = loadout.indexOf(l);
  }
  function reloadStep(dt) {
    if (!reloadable()) return;
    if (C.MODE().reload === 'auto') {
      for (const l of loadout) {
        if (AG[l.key].kind === 'ecm' || l.n >= l.n0 || !(l.res > 0)) { l.rt = 0; continue; }
        if (!l.rt) l.rt = relT(l);
        if ((l.rt -= dt) > 0) continue;
        reloadOne(l); l.rt = l.n < l.n0 ? relT(l) : 0;
        say(`${AG[l.key].short}: пополнено ${l.n}/${l.n0}`, 1.6); snd.click();
      }
      return;
    }
    const near = Math.hypot(craft.pos.x - home.x, craft.pos.z - home.z) < 2500 && craft.pos.y - city.groundH(craft.pos.x, craft.pos.z) < 1500;
    const need = homeLeft > 0 && (needsRearm() || craft.cmFlare < C.MODE().cm * 0.5 || craft.fuel < 0.6);
    if (!near || !need) { homeT = 0; return; }
    homeT += dt;
    if (homeT < 12) return;
    for (const l of loadout) { while (l.n < l.n0 && l.res > 0) reloadOne(l); l.rt = 0; } // запас кончился — сколько есть (иначе цикл не кончится)
    craft.cmFlare = craft.cmChaff = C.MODE().cm; craft.fuel = 1; fuelWarn = 0; homeT = 0; homeLeft--;
    say(`Пополнение: подвеска, ловушки и топливо${Number.isFinite(homeLeft) ? ` · осталось пополнений: ${homeLeft}` : ''}`, 3); snd.good();
  }
  function update(dt) {
    game.t += dt;
    reloadStep(dt); zoneUpdate(dt);
    if (!craft.dead && !game.over) {
      const keysOf = (...k) => k.some((c) => keys.has(c));
      let rx = 0, ry = 0;
      if (keysOf('KeyA', 'ArrowLeft')) rx -= 1; if (keysOf('KeyD', 'ArrowRight')) rx += 1;
      // вверх — нос вверх (инверсия «как в авиасимуляторах» — в настройках); крестовина — тангаж и крен кнопками, слабее ручки
      const inv = C.sens.invert ? -1 : 1;
      if (keys.has('ArrowUp')) ry += inv; if (keys.has('ArrowDown')) ry -= inv;
      if (pad.x || pad.y) { rx += pad.x * C.sens.padK; ry += pad.y * C.sens.padK * inv; }
      if (craft.fuel > 0) craft.thr = THR_STEPS[thrI];
      const tt = craft.fuel <= 0 ? 'двиг. ✕' : thrI === AB_I ? (craft.fm && !(craft.fm.s.ab > 0) ? 'макс.' : 'форсаж') : `${Math.round(craft.thr * 100)}%`, tb = $('tThr');
      if (tb._t !== tt) { tb._t = tt; tb.innerHTML = `${ico('throttle')}<small>${tt}</small>`; tb.title = 'Газ'; tb.classList.toggle('ab', thrI === AB_I); } // спидометр и газ
      if (stick.id !== null) { rx += stick.x; ry -= stick.y * inv; }
      let rz = 0;
      if (demo) { // показ в обучении: автопилот на высоте demo.alt к точке demo.pt, оружие применяет «АВТО»
        // высота — не ниже рельефа впереди (горы, дома): смотрим по курсу и по пути к точке на ~14 с полёта вперёд
        const look = clamp(craft.speed * 14, 1500, 4500), fy = Math.atan2(demo.pt.x - craft.pos.x, demo.pt.z - craft.pos.z), clr = Math.max(90, demo.alt * 0.35);
        let floor = -1e9, near = -1e9;
        for (let d = 0; d <= look; d += 120) for (const yw of [Math.atan2(-Math.sin(craft.yaw), -Math.cos(craft.yaw)), fy]) {
          const x = craft.pos.x + Math.sin(yw) * d, z = craft.pos.z + Math.cos(yw) * d, h = Math.max(city.groundH(x, z), city.topAt(x, z)) + clr;
          floor = Math.max(floor, h); if (d < look * 0.4) near = Math.max(near, h);
        }
        const wantY = Math.max(city.groundH(demo.pt.x, demo.pt.z) + demo.alt, floor);
        DP.set(demo.pt.x, wantY, demo.pt.z).sub(craft.pos);
        // оружие в полёте — плавный отворот ~70° и горизонт: цель сбоку, контейнер держит подсвет (над целью её закрыл бы корпус)
        if (C.S.wpns.some((w) => w.owner === craft && !w.dead)) { if (demo.relYaw === undefined) demo.relYaw = craft.yaw + 1.2; DP.set(-Math.sin(demo.relYaw), (Math.max(demo.alt + city.groundH(craft.pos.x, craft.pos.z), floor) - craft.pos.y) / 4000, -Math.cos(demo.relYaw)); }
        else { demo.relYaw = undefined; if (Math.hypot(DP.x, DP.z) < 400) DP.set(-Math.sin(craft.yaw), 0, -Math.cos(craft.yaw)); } // над точкой — прямо
        DP.normalize(); aim.yaw = Math.atan2(-DP.x, -DP.z); aim.pitch = clamp(Math.asin(DP.y), near > craft.pos.y - 40 ? -0.05 : -0.35, near > craft.pos.y ? 0.75 : 0.35); // гора близко — круче вверх и не снижаться
        const o = aimSteer(); rx = o[0]; ry = o[1]; rz = o[2];
      } else if (aimOn()) { if (rx || ry) aimSync(); else { const o = aimSteer(); rx = o[0]; ry = o[1]; rz = o[2]; } } // крестовина нажата — взгляд за носом
      craft.ab = thrI === AB_I && craft.fuel > 0 && !(craft.fm && !(craft.fm.s.ab > 0))&& !craft.noAB; // без форсажа (Су-25) — верхняя ступень = 100 %
      // повреждения: течь бака, пожар ест корпус (онлайн — урон считает сервер)
      if (craft.dz && !game.opts.invuln) {
        if (craft.leak && craft.fuel > 0) craft.fuel = Math.max(0, craft.fuel - craft.leak * dt);
        const br = burnRate(craft); if (br && !game.net) { craft.hp -= br * dt; if (craft.hp <= 0) { craft.hp = 0; craft.dead = true; C.fx.explosion(craft.pos, 30, 'air'); snd.planeKill(0); finish(craft.det.tailAll ? 'Потеря управления: хвост разрушен' : 'Сгорел: пожар на борту', false); } }
      }
      if (craft.dmgVis) craft.dmgVis.update(dt, craft, C.windV || (C.windV = new THREE.Vector3(3.9, 0, 1.1)));
      // топливо: расход по газу, форсаж — втрое; кончилось — двигатель встал, самолёт планирует (в обучении не тратится)
      if (!game.opts.invuln) {
        if (craft.fuel > 0) craft.fuel = Math.max(0, craft.fuel - (0.35 + 0.65 * craft.thr) * (craft.ab ? 3 : 1) / (C.MODE().fuelS || 240) * dt);
        if (craft.fuel < 0.2 && fuelWarn < 1) { fuelWarn = 1; say('Мало топлива — 20 %', 3); snd.alarm(); }
        if (craft.fuel <= 0) { craft.thr = 0; craft.ab = false; if (fuelWarn < 2) { fuelWarn = 2; say('Топливо кончилось — двигатель встал, планируйте', 4); snd.alarm(); } }
      }
      if (craft.ab && !abWas) snd.afterburner(); abWas = craft.ab;
      if (!aimOn()) { rx *= C.sens.stick; ry *= C.sens.stick; }
      pilotStep(craft, rx, ry, dt, craft.pos.y > CITY.CEIL ? 0.3 : 0, 0.8, rz);
      const top = Math.max(city.topAt(craft.pos.x, craft.pos.z), CITY.WATER_Y);
      if (craft.pos.y < top + 1.5) {
        if (game.opts.invuln) { craft.pos.y = top + 150; craft.pitch = 0.2; craft.q = null; say('Учебный вылет: высоту вернули — не прижимайтесь так низко', 2.5); }
        else if (game.net) { game.net.selfCrash(); netDown(city.bldAt(craft.pos.x, craft.pos.z) > 0 ? 'Врезались в здание' : 'Столкновение с землёй'); }
        else { craft.dead = true; C.fx.explosion(craft.pos, 25, 'ground'); snd.explosion(0, 3); finish(city.bldAt(craft.pos.x, craft.pos.z) > 0 ? 'Врезались в здание' : 'Столкновение с землёй', false); }
      }
      if (Math.abs(craft.pos.x) > CITY.HALF - 300 || Math.abs(craft.pos.z) > CITY.HALF - 300) {
        if (game.net && !loadout.some((l) => l.n > 0 && AG[l.key].kind !== 'ecm')) { game.net.send({ t: 'rtb' }); craft.dead = true; spec.why = 'Вылет завершён — оружие израсходовано'; spec.t = 0; say(spec.why, 4); }
        else if (game.done && !game.opts.noEnd) finish('Вышли из района целей', true);
        else { craft.yaw += Math.PI; craft.q = null; craft.pos.x = clamp(craft.pos.x, -CITY.HALF + 400, CITY.HALF - 400); craft.pos.z = clamp(craft.pos.z, -CITY.HALF + 400, CITY.HALF - 400); say('Граница района — разворот', 2); }
      }
    }
    shipQ.setFromEuler(E.set(craft.pitch, craft.yaw, craft.roll));
    updatePod(dt);
    msgT -= dt;
    if ((C.auto || demo) && !craft.dead && !game.over) autoAssist(dt);
    if (game.opts.onTick) game.opts.onTick(dt);
  }
  function hud(dt, t) {
    ship.visible = !craft.dead && camMode !== 2;
    flames.update(craft.thr, craft.ab);
    if (shipModel) spinProps(shipModel, dt, craft.thr); // винты (Ту-95)
    if (game.opts.photo) return; // «Съёмка»: без прицелов и панелей — свой интерфейс (photo.js)
    if (game.over && craft.dead) return;
    const sp = !!(game.net && craft.dead); if (sp !== document.body.classList.contains('spect')) document.body.classList.toggle('spect', sp); // «КАМ.» — следующий союзник
    if (sp) { // онлайн: наблюдение до нового вылета
      const hx = C.hx; hx.textAlign = 'center'; hx.font = '700 15px -apple-system, Segoe UI, sans-serif'; hx.fillStyle = '#fde68a'; hx.shadowColor = 'rgba(0,0,0,.8)'; hx.shadowBlur = 4;
      hx.fillText(spec.why, C.VW / 2, C.VH * 0.2); hx.font = '600 12px -apple-system, Segoe UI, sans-serif'; hx.fillStyle = '#fff';
      hx.fillText(game.net.lives > 0 ? 'Новый вылет — через несколько секунд' : 'Вылеты на эту волну кончились — смотрите за союзниками', C.VW / 2, C.VH * 0.2 + 22);
      hx.fillText(IS_TOUCH ? '«КАМ.» — следующий союзник' : 'B — следующий союзник', C.VW / 2, C.VH * 0.2 + 40);
      { const al = alliesOf(); if (al.length) { hx.fillStyle = '#93c5fd'; hx.fillText(`Смотрите за: ${allyName(al[spec.i % al.length])}`, C.VW / 2, C.VH * 0.2 + 58); } } hx.shadowBlur = 0;
      return;
    }
    updateLar(dt); drawHud(); zoneHud(); fireBtn(dt);
    if (game.net) { // союзники в небе: зелёная стрелка над самолётом, имя и дальность (до 25 км)
      const hx = C.hx; hx.font = '600 11px -apple-system, Segoe UI, sans-serif'; hx.textAlign = 'center';
      for (const a of alliesOf()) {
        const d = a.pos.distanceTo(craft.pos); if (d > 25000) continue;
        const p = C.proj(fw.copy(a.pos).setY(a.pos.y + 12)); if (!p) continue;
        hx.strokeStyle = '#4ade80'; hx.lineWidth = 2; hx.beginPath(); hx.moveTo(p[0] - 7, p[1] - 6); hx.lineTo(p[0], p[1] + 2); hx.lineTo(p[0] + 7, p[1] - 6); hx.stroke();
        hx.fillStyle = '#bbf7d0'; hx.shadowColor = 'rgba(0,0,0,.8)'; hx.shadowBlur = 3; hx.fillText(`${allyName(a)} · ${(d / 1000).toFixed(1)} км`, p[0], p[1] - 10); hx.shadowBlur = 0;
      }
    }
    if (camMode === 3) {
      const o = wc.obj, hx = C.hx; let txt = 'КАМЕРА: ЗА ОРУЖИЕМ — нет оружия в воздухе';
      if (o && wc.kind === 'w') txt = `КАМЕРА: ${o.W.short}${o.dead ? ' — разрыв' : ` · ${Math.round(o.vel.length() * 3.6)} км/ч · ${Math.round(o.pos.y - city.groundH(o.pos.x, o.pos.z))} м`}`;
      else if (o) txt = `КАМЕРА: ракета ${o.S.short} летит в вас${o.dead ? ' — подрыв' : ` · ${(o.pos.distanceTo(craft.pos) / 1000).toFixed(1)} км`}`;
      hx.font = '700 12px -apple-system, Segoe UI, sans-serif'; hx.textAlign = 'center'; hx.fillStyle = wc.kind === 'm' ? '#ff8a8a' : '#fde047';
      hx.shadowColor = 'rgba(0,0,0,.85)'; hx.shadowBlur = 4; hx.fillText(txt, C.VW / 2, Math.max(64, C.VH * 0.16)); hx.shadowBlur = 0;
    }
    if ((hudT -= dt) <= 0) { hudT = 0.1; const rw = C.S.rwr(craft), mw = C.S.mws(craft); hudText(rw, mw); drawRwr(rw, mw, t); if (!C.paused && !game.over) snd.rwrTick(0.1, rw, mw); }
    if (mapOn) drawMap();
    if (flashT > 0) { flashT -= dt; document.body.style.boxShadow = `inset 0 0 120px rgba(255,40,40,${Math.max(0, flashT)})`; } else document.body.style.boxShadow = '';
  }
  const api = {
    get plane() { return shipReal ? shipName || shipCls : 'процедурный'; },
    modelsReady() { if (shipSide) { buildShip(shipSide, shipCls, shipName); buildPylons(); } }, // готовая модель догрузилась во время вылета
    craft, pod, game, loadout, fire, podNext, podView, nextWeapon, cm, say, rearm, setThr, aim, aimSync, netResupply,
    // обучение: показ автопилотом, перенос самолёта, смена целей задания, камера (0 — за самолётом, 3 — за оружием)
    demo(d) { demo = d || null; if (!demo) aimSync(); },
    place(sp) { craft.pos.set(sp.x, sp.y, sp.z); craft.yaw = sp.yaw || 0; craft.pitch = craft.roll = 0; craft.q = null; craft.speed = Math.max(craft.speed, 220); craft.wp = craft.wr = craft.wz = 0; fwdOf(craft, craft.vel).multiplyScalar(craft.speed); aimSync(); camInit = false; },
    retarget(list) { game.targets = list; podSet(null); },
    setCam(m) { if (camMode !== m) { camMode = m; wc.obj = null; wc.init = false; } },
    // «Съёмка»: модель самолёта и подвеска (пилоны — userData.st), поставить модель в точку самолёта до кадра
    ship, pylons: () => pylonMeshes, poseShip() { ship.position.copy(craft.pos); ship.rotation.set(craft.pitch, craft.yaw, craft.roll, 'YXZ'); ship.updateMatrixWorld(true); },
    get hasPod() { return hasPod; }, get sel() { return sel; }, get mapOn() { return mapOn; }, curW,
    start, stop, update, hud, onKey, finish, camera: updateCamera, startNet, netSpawn, netHit, netDown, netAI, focus: () => craft.pos, afterRender: renderPod, extraCam: () => (pod.show && hasPod && craft && !craft.dead ? podCam : null),
    resize() { layoutTouch(); layoutPod(); },
    pauseHelp: () => (IS_TOUCH ? `${aimOn() ? 'Ведите пальцем по экрану — камера поворачивается, самолёт летит туда, куда она смотрит (белый кружок). Крестовина — точные крен и тангаж.' : 'Левая половина экрана — ручка.'} «ГАЗ» — ступени, после 100 % — форсаж. «ЛОВУШКИ» — ЛТЦ и диполи разом. Панель слева: тап по оружию — выбор, по строке цели — следующая цель, «ТВ» — окно контейнера (тап по окну — увеличение). Контейнер захватывает цель сам: 1–18 км, высота от 400 м, цель не закрыта домами.`
      : 'Стрелки — тангаж и крен · A/D — крен · W/S — газ ступенями (после 100 % — форсаж) · Shift — форсаж вкл/выкл · Пробел/F — сброс · Q — оружие · V — камера · N — камера за оружием · L — обзор (камера мышью, самолёт держит курс)<br>Контейнер захватывает цель сам (1–18 км, высота от 400 м, цель не закрыта домами) · R — следующая цель · G — окно контейнера · Z — увеличение · O — лазер<br>X — ловушки (ЛТЦ и диполи) · M — карта · Esc — пауза'),
  };
  return api;
}
