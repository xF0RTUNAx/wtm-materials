// Вылет за самолёт: «Изделие» с ударной подвеской против ИИ-ПВО города. Прицельный контейнер (окно ТВ/ИК, захват точки,
// лазер), прицел точки падения, СПО и датчик пуска, метки целей, итоги. start(opts) — опции для обучения:
// { items, pod, targets: [ключи], defense(S, rnd), invuln, spawn: {x,y,z,yaw}, noEnd, onTick(dt) }.
/* global THREE */
import { tr } from './i18n.js?v=20261028a';
import { CITY, ZONE_NAME, mulberry32, riverX, objAimXZ, objDist } from './city.js?v=20261028a';
import { strikerGeo, attachFlames } from './units-render.js?v=20261028a';
import { planeModel, classOf, weaponMesh, pylonMesh, podModel, weaponHasModel, planeMeta, spinProps, wantWeapon } from './models.js?v=20261028a';
import { ico, drawIco } from './icons.js?v=20261028a';
import { applyLayout } from './layout.js?v=20261028a';
import { clamp, makeCraft, pilotStep, fwdOf, D2R, angleBetween } from '../drone/sim/core.js?v=20261028a';
import { DRONE } from '../drone/sim/modes.js?v=20261028a';
import { AG, SAM, ERAS, LOADOUTS, HELI_LOADOUTS, loadoutsOf, loadoutRole } from './arsenal.js?v=20261028a';
import { predictBomb, predictRocket } from './sim/strike.js?v=20261028a';
import { flightModel, loadOf } from './sim/flight.js?v=20261028a';
import { heliModel, heliStep, heliInit, heliLand, touchVerdict, tmaxAcc, isHeli } from './sim/heli.js?v=20261028a';
import { cmOf, cmKey } from './sim/cm.js?v=20261028a';
import { initDamage, hitZones, dmgUnpack, burnRate, hullState, dmgBrief } from './sim/damage.js?v=20261028a';
import { planeDamageVis } from './plane-damage.js?v=20261028a';
import { placeDefense, pickTargets } from './mission.js?v=20261028a';
import { ZONE, newZone, zoneStep } from './sim/online.js?v=20261028a';

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
  // вертолёт вместо самолёта подвески — для проверки (?heli=h_mi24 …), пока у вертолётов нет своих подвесок
  const HELI_Q = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('heli') : null;

  // ── модель самолёта и подвеска ──
  // самолёт игрока: многоцелевой ударный самолёт стороны атакующих (как в превью меню), подвеска — на его пилонах
  const ship = new THREE.Group(); ship.rotation.order = 'YXZ';
  const shipMat = new THREE.MeshPhongMaterial({ vertexColors: true, specular: 0x666666, shininess: 55 });
  let shipModel = null, shipSide = null, shipCls = null, shipName = null, shipSkin = null, shipReal = false, shipInternal = false, flames = null, stations = [], podPos = new THREE.Vector3(0, -1.6, -3.5);
  // cls — ударный (бомбы) или ракетный: Су-30 / F/A-18 или МиГ-29 / F-16
  function buildShip(side, cls = 'strike', name = null) {
    // готовая модель (models.js), если загрузилась, иначе — процедурная; окраска из магазина — надетая на этот самолёт (аккаунт игры, shop-ui.js),
    // кроме «Съёмки» и обучения: её модель грузится по требованию, до прихода — обычная
    const skin = name && C.shop && C.shop.wallet() && C.setup.game !== 'photo' && C.setup.game !== 'training' ? (C.shop.wallet().worn || {})[name] || null : null;
    const pm = planeModel(side, cls, name, skin);
    // shipReal — стоит именно модель подвески (пока она грузится — подходящая из загруженных, потом заменяется), с надетой окраской — когда пришла и она
    const exact = !!pm && (!name || pm.name === name) && (pm.skin || null) === skin;
    if (shipSide === side && shipCls === cls && shipName === name && shipSkin === skin && (shipReal || !pm || (!exact && shipModel && shipModel.userData.pm === pm.name + (pm.skin ? '@' + pm.skin : '')))) return;
    if (shipModel) ship.remove(shipModel);
    shipSide = side; shipCls = cls; shipName = name; shipSkin = skin; shipReal = exact; shipInternal = !!(pm && pm.internal);
    if (pm) {
      shipModel = pm.obj; shipModel.userData.pm = pm.name + (pm.skin ? '@' + pm.skin : ''); stations = craft.heli ? heliStations(pm.stations, pm.pods4) : pm.stations; podPos = craft.heli ? null : pm.pod; // pod: null — встроенная прицельная система (у вертолёта — всегда)
      shipModel.traverse((o) => { if (o.isMesh && !o.userData.glass) o.castShadow = !!P.shadows; });
      flames = attachFlames(shipModel, pm.nozzles, pm.nr / 0.45, true, pm.dry, pm.name);
      craft.dmgVis = planeDamageVis(scene, shipModel, pm.name, planeMeta(pm.name), () => C.fx); craft.dmgVis.sync(craft); // зоны повреждений: отрыв частей, дым
    } else {
      craft.dmgVis = null;
      const sg = strikerGeo(side, true); stations = craft.heli ? heliStations(sg.stations) : sg.stations; podPos = craft.heli ? null : new THREE.Vector3(0, -1.6, -3.5);
      shipModel = new THREE.Group(); const m = new THREE.Mesh(sg.geo, shipMat); m.castShadow = !!P.shadows; shipModel.add(m);
      flames = attachFlames(shipModel, sg.nozzles, sg.nr / 0.45, true);
    }
    ship.add(shipModel);
    if (craft.heli) { // высота центра над землёй, стоя на шасси — по низу модели (без подвесок: они не в shipModel)
      const r0 = ship.rotation.clone(); ship.rotation.set(0, 0, 0); ship.updateMatrixWorld(true);
      const b = new THREE.Box3().setFromObject(shipModel); craft.gearH = Math.max(0.8, ship.position.y - b.min.y);
      ship.rotation.copy(r0); ship.updateMatrixWorld(true);
    }
  }
  // слоты вертолёта по точкам подвески модели (mirror: слева от внешней к внутренней, справа — обратно): 0–3 — рама ПТУР 2×2 на
  // левом внешнем пилоне, 4 — левый внутренний (блок НАР), 5 — правый внутренний, 6–9 — рама на правом внешнем. Одна точка на
  // борт (UH-1) — рама и блок на одной
  // точки подвески вертолёта: 0–3 и 6–9 — пакеты ПТУР на внешних точках, 4/5 — блоки НАР на внутренних;
  // pods4 (Ми-8МТВ) — ещё 10/11: блоки НАР и на внешних точках (по два блока на ферме)
  function heliStations(S, pods4) {
    const k = Math.max(1, S.length >> 1), L = S.slice(0, k), R = S.slice(k).reverse(), out = [];
    const rack = (p) => { for (let i = 0; i < 4; i++) out.push(Object.assign(new THREE.Vector3(p.x + (i % 2 ? 0.17 : -0.17), p.y - (i >> 1) * 0.3, p.z), { py: p.py || 0 })); };
    rack(L[0]); const pl = L[k - 1], pr = R[k - 1], ro = R[0];
    out.push(pl, pr); rack(ro);
    if (pods4) out.push(L[0], R[0]);
    return out;
  }
  ship.visible = false; scene.add(ship);
  const pylonMeshes = [];
  function buildPylons() {
    for (const m of pylonMeshes) ship.remove(m);
    pylonMeshes.length = 0;
    for (const l of loadout) for (const st of l.st) {
      const m = pylonMesh(l.key, AG[l.key], C.weaponGeo, C.mats.wMat); const p = stations[st], W0 = AG[l.key].vis; m.position.set(p.x, p.y - (W0.hang ?? W0.r) - 0.05, p.z); // hang — у ракет с гондолой под корпусом
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
    if (craft.hp > 0) C.bev('r', tr('попадание'), 'hurt', 6);
    if (craft.hp <= 0) { craft.hp = 0; craft.dead = true; C.fx.explosion(craft.pos, 30, 'plane'); snd.planeKill(0); finish(tr('Сбит: {0}', [by]), false); }
  }
  // повреждения зон (sim/damage.js): что случилось — словами и звуком, отлетевшее — с самолёта (plane-damage.js)
  const ZNAME = { consL: tr('Оторвало законцовку левого крыла — тянет влево, держите ручку'), consR: tr('Оторвало законцовку правого крыла — тянет вправо, держите ручку'), tailL: tr('Разбит хвост слева — управление хуже, уводит'), tailR: tr('Разбит хвост справа — управление хуже, уводит'), tailAll: tr('Хвост разрушен — самолёт неуправляем!'), fire: tr('Пожар на борту!') };
  // вертолёт: те же зоны — пилоны, хвостовая балка с рулевым винтом (sim/damage.js applyDamage)
  const ZNAME_H = { consL: tr('Разбит левый пилон — подвеска на нём потеряна'), consR: tr('Разбит правый пилон — подвеска на нём потеряна'), tailL: tr('Повреждён рулевой винт — разворачивает, держите педали и сбросьте шаг'), tailR: tr('Повреждён рулевой винт — разворачивает, держите педали и сбросьте шаг'), tailAll: tr('Хвостовая балка разрушена — вращение! Садитесь'), fire: tr('Пожар на борту!') };
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
    if (ev.length) { const e2 = ev.includes('tailAll') ? ev.filter((e) => e !== 'tailL' && e !== 'tailR') : ev, ZN = craft.heli ? ZNAME_H : ZNAME; say(e2.map((e) => ZN[e]).filter(Boolean).join(' · '), 4); snd.alarm(); return; }
    const D = craft.dz; if (!D || !by) return; // без источника (пожар раз в секунду) — молча
    const bad = [D.wingL < 0.6 && tr('левое крыло'), D.wingR < 0.6 && tr('правое крыло'), D.tail < 0.6 && tr('хвост'), D.eng.some((e) => e < 0.6) && (D.eng.length > 1 ? (D.eng[0] < 0.6 && D.eng[1] < 0.6 ? tr('оба двигателя') : D.eng[0] < 0.6 ? tr('левый двигатель') : tr('правый двигатель')) : tr('двигатель')), D.fuel < 0.7 && tr('бак — течь')].filter(Boolean);
    if (bad.length) say(tr('Попадание{0} · повреждено: {1}', [by ? `: ${by}` : '', bad.join(', ')]), 2.5);
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
  // дальность — как у основной камеры (50 км): сфера неба — радиус 42 км, при 40 км её не было (вертолёт смотрит почти горизонтально — полкадра пустоты)
  const podCam = new THREE.PerspectiveCamera(10, 4 / 3, 5, 50000); podCam.layers.enable(4); podCam.layers.enable(5); // и облака с дымом (слои половинного разрешения)
  // «Контейнер 30 к/с» (C.P.podHalf): сцена в окно контейнера — через кадр, в свою текстуру; на экран она кладётся каждый кадр
  // одним прямоугольником (второй проход сцены — самый дорогой после основного; настоящие ТВ-каналы и так 25–30 к/с)
  // на сенсорных окно рисуется в своей текстуре в 90% разрешения (картинка «ТВ» и так зернистая) — и при «каждый кадр»
  const POD_K = IS_TOUCH ? 0.9 : 1;
  const POD_LUM = 0.24; // освещённость сцены (podGain), ниже которой окно «ТВ» усиливается (осенний вечер 0,26 → ×1, сумерки 0,12 → ×1,5)
  // окно всегда — в своей текстуре: серое изображение и автоуровни, как у настоящего ТВ-канала, делает шейдер вывода
  // (2026-10-24, Telegram: был CSS backdrop-filter contrast 1.35 — небо на ×1 выбеливалось, склон на ×15 в сумерках уходил в чёрное)
  const POD_MIP = renderer.capabilities.isWebGL2; // уровни — по уменьшенным копиям кадра; без WebGL2 — постоянные
  // (у цели рендера в r128 уменьшенные копии по умолчанию выключены — без generateMipmaps текстура неполная и читается чёрной)
  const podRT = new THREE.WebGLRenderTarget(1, 1, { minFilter: POD_MIP ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: POD_MIP });
  podRT.texture.encoding = THREE.sRGBEncoding;
  // замер: 1 пиксель — r: яркость центра кадра, g: тёмный уровень (самый тёмный из 4 × 4 участков), b: самый светлый; плавно (k), два буфера по очереди
  // (16 бит, где можно: в 8 битах плавная подстройка застревала — шаг 1/255 больше поправки за кадр)
  const POD_HF = POD_MIP && !!(renderer.extensions && renderer.extensions.has('EXT_color_buffer_float')); // (у заглушки рендера в тестах extensions нет)
  const podSt = [0, 1].map(() => new THREE.WebGLRenderTarget(1, 1, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: false, type: POD_HF ? THREE.HalfFloatType : THREE.UnsignedByteType }));
  let podSi = 0, podSk = 1, podST = 0, podN = 0;
  renderer.domElement.addEventListener('webglcontextrestored', () => { podN = 0; }); // замер потерян — уровни заново по первому кадру
  const podQC = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), V2 = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
  const podQuad = (mat) => { const S = new THREE.Scene(), q = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat); q.frustumCulled = false; S.add(q); return S; };
  const statMat = new THREE.ShaderMaterial({ uniforms: { map: { value: podRT.texture }, prev: { value: null }, lod: { value: 0 }, k: { value: 1 } }, vertexShader: V2, depthTest: false, depthWrite: false,
    extensions: { shaderTextureLOD: true },
    fragmentShader: `uniform sampler2D map, prev; uniform float lod, k; varying vec2 vUv;
      float Y(float x, float y) { return dot(texture2DLodEXT(map, vec2(x, y), lod).rgb, vec3(0.2126, 0.7152, 0.0722)); }
      void main() {
        float lo = 1.0, hi = 0.0, c = 0.0;
        for (int i = 0; i < 4; i++) for (int j = 0; j < 4; j++) {
          float y = Y((float(i) + 0.5) / 4.0, (float(j) + 0.5) / 4.0); lo = min(lo, y); hi = max(hi, y);
          if (i > 0 && i < 3 && j > 0 && j < 3) c += y * 0.25;
        }
        gl_FragColor = vec4(mix(texture2D(prev, vec2(0.5)).rgb, vec3(c, lo, hi), k), 1.0);
      }` });
  const statQS = podQuad(statMat);
  // вывод: серое, чёрная точка — 0,6 тёмного уровня (снимает дымку), усиление — среднее (геометрическое) из общего (центр кадра —
  // средне-серый) и местного (по размытой копии вокруг точки, как WDR у настоящих ТВ-каналов): светлое небо усиливается меньше, тёмная
  // земля — больше, ×0,8…×4; светлое — с мягким плечом; лёгкое зерно скрывает ступеньки 8-битной картинки при сильном усилении
  const outMat = new THREE.ShaderMaterial({ uniforms: { map: { value: podRT.texture }, st: { value: podSt[0].texture }, lodL: { value: 0 }, t: { value: 0 } }, vertexShader: V2,
    depthTest: false, depthWrite: false, defines: { MIP: POD_MIP ? 1 : 0 }, extensions: { shaderTextureLOD: POD_MIP },
    fragmentShader: `uniform sampler2D map, st; uniform float lodL, t; varying vec2 vUv;
      float Y(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
      void main() {
      #if MIP
        vec3 s = texture2D(st, vec2(0.5)).rgb; float l = Y(texture2DLodEXT(map, vUv, lodL).rgb);
      #else
        vec3 s = vec3(0.5, 0.2, 0.8); float l = 0.5;
      #endif
        float b = s.g * 0.6, g = clamp(sqrt(0.5 / max(s.r - b, 0.03) * 0.5 / max(l - b, 0.03)), 0.8, 4.0);
        float y = (Y(texture2D(map, vUv).rgb) - b) * g;
        y += (fract(sin(dot(gl_FragCoord.xy + t, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) * 0.006 * g;
        y = y < 0.6 ? y : 1.0 - 0.4 * exp((0.6 - y) / 0.4);
        y = y > 0.1 ? y : 0.1 * exp((y - 0.1) / 0.1); // мягкий «носок»: ниже чёрной точки — не сплошной чёрный (силуэты деревьев с деталями)
        gl_FragColor = vec4(vec3(clamp(y, 0.0, 1.0)), 1.0);
      }` });
  const podQS = podQuad(outMat);
  const shipQ = new THREE.Quaternion(), invQ = new THREE.Quaternion(), E = new THREE.Euler(0, 0, 0, 'YXZ');
  // окно: на сенсорных — небольшое, вверху справа (над кнопками, левее паузы и звука); на ПК — справа внизу
  function layoutPod() {
    const VW = C.VW, VH = C.VH;
    let w = IS_TOUCH ? Math.min(VW * 0.27, 230) : Math.min(VW * 0.3, 380), h = w * 0.75;
    // телефон: вровень с рядом паузы и звука (он уже под кнопками Telegram и панелью состояния) и левее него
    const rr = ['pause', 'mute', 'plBtn'].map((id) => ($(id).getBoundingClientRect ? $(id).getBoundingClientRect() : null)).filter((r) => r && r.width);
    const pb = rr.length ? { width: 1, left: Math.min(...rr.map((r) => r.left)), top: Math.min(...rr.map((r) => r.top)) } : { width: 0, top: 6 };
    const y = IS_TOUCH ? Math.max(6, pb.top) : VH - h - 180;
    let x = VW - w - 14; pod.ackTop = null;
    if (IS_TOUCH) { // не ниже верха кнопок справа («КАРТА», «АВТО», у вертолёта — «ПОДСКОК», «ОБЗОР»; свою раскладку слева не считаем)
      let lim = VH, xl = pb.width ? pb.left : VW - 50;
      for (const id of ['tMap', 'tAuto', 'tHelp', 'tPop', 'tLook']) { const r = $(id).getBoundingClientRect ? $(id).getBoundingClientRect() : null; if (r && r.height && r.left > VW / 2) { lim = Math.min(lim, r.top); xl = Math.min(xl, r.left); } }
      const wl = Math.min(Math.min(VH * 0.32, 150) / 0.75, xl - 8 - (VW / 2 + 40)); // левее столбцов кнопок, но правее прицела
      if (lim - y - 6 >= 90 || wl < 120) { h = Math.max(90, Math.min(h, lim - y - 6)); w = h / 0.75; x = pb.width ? pb.left - w - 8 : VW - w - 58; }
      else { // над кнопками места нет (Telegram во весь экран: ряд паузы опущен под его кнопки)
        w = wl; h = w * 0.75; x = xl - w - 8;
        // «ПОНЯЛ» (#rwrAck, вертолёт) стоит в ряду паузы с 50% + 54 px — окно на него налезло бы: на это время кнопка уходит под окно
        const a = $('rwrAck'), aw = a.offsetWidth || 80; if (x < VW / 2 + 54 + aw + 4) pod.ackTop = y + h + 6;
      }
    }
    Object.assign(pod.rect, { x, y, w, h });
    const b = $('podBox'); b.style.left = x + 'px'; b.style.top = y + 'px'; b.style.width = w + 'px'; b.style.height = h + 'px';
  }
  // цели контейнера: цели задания, затем замеченные комплексы ПВО (метки на экране)
  const tgtName = (t) => (t.S ? t.S.rwr || t.S.short : t.name);
  // объект — его главная точка прицела (city.js objAimXZ: постройка, а не центр — у порта, «Ведьминой поляны», ГЭС центр — пустая земля)
  const AXZ = { x: 0, z: 0 }, aimXZ = (o) => objAimXZ(o, -1, 0, 0, AXZ);
  const tgtPos = (t, out) => { if (t.S) return out.copy(t.pos); const a = aimXZ(t); return out.set(a.x, city.topAt(a.x, a.z), a.z); };
  // самая высокая точка объекта (крыша корпуса) — для прицела вертолёта: с малой высоты центр объекта у земли закрыт его же
  // постройками и деревьями (2026-10-21: с 2,5–4,5 км на 40–110 м склад ГСМ и «Фонарь Джека» не захватывались ни с одного направления)
  // (2026-10-22: по постройкам объекта — city.js aims; сетка 5 × 5 по рамке объекта попадала и в пустую землю между ними)
  function hiPoint(t, out) {
    const k = t.bld ? Object.values(t.bld).filter((B) => B.dead).length : 0; // объект-сцена (city.js SITES): постройку разбили — точка заново, мимо руин
    if (!t._hp || t._hpK !== k) {
      let best = null; t._hpK = k;
      if (t.aims && t.aims.length) for (const q of t.aims) { if (q.b && t.bld && t.bld[q.b].dead) continue; const y = city.topAt(q.x, q.z); if (!best || y > best[1]) best = [q.x, y, q.z]; }
      if (!best) { const w = (t.w || 120) * 0.45, d = (t.d || 120) * 0.45; for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) { const x = t.x + (i / 2) * w, z = t.z + (j / 2) * d, y = city.topAt(x, z); if (!best || y > best[1]) best = [x, y, z]; } }
      t._hp = best;
    }
    return out.set(t._hp[0], t._hp[1], t._hp[2]);
  }
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
    if (!hasPod) { say(tr('Нет прицельного контейнера — цели для бомб по координатам выбираются сами')); snd.deny(); return; }
    const L = podCands(); if (!L.length) { say(tr('Нет целей')); snd.deny(); return; }
    fwdOf(craft, LQ); const yaw0 = Math.atan2(-LQ.x, -LQ.z);
    const brg = (t) => { tgtPos(t, TP); let b = Math.atan2(-(TP.x - craft.pos.x), -(TP.z - craft.pos.z)) - yaw0; while (b > Math.PI) b -= 2 * Math.PI; while (b < -Math.PI) b += 2 * Math.PI; return -b; };
    L.sort((a, b) => brg(a) - brg(b));
    podSet(L[(L.indexOf(pod.tgt) + 1) % L.length]); snd.click();
    say(tr('Цель: {0}', [pod.lockName]), 1.4);
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
    // подвесной контейнер самолёта вверх не смотрит (> 10° — «закрыта корпусом»); прицел вертолёта — в носу: +30° / −60°, ±120° по курсу
    // (2026-10-22: вертолёт на подскоке клевал носом — цель на уровне вертолёта «пряталась за корпус», ПТУР не пускался)
    pod.masked = craft.heli ? el > 0.52 || el < -1.05 || Math.abs(az) > 2.1 : el > 0.17 || Math.abs(az) > 2.8;
    // захват: условия проверяются 10 раз в секунду; выполнены POD_ACQ с подряд — точка захвачена
    if (pod.tgt && !pod.lock && (pod.chkT -= dt) <= 0) {
      pod.chkT = 0.1; tgtPos(pod.tgt, TP);
      const d = pod.pos.distanceTo(TP), h = craft.pos.y - city.groundH(craft.pos.x, craft.pos.z);
      pod.why = d > POD_R[1] ? tr('далеко — ближе {0} км', [POD_R[1] / 1000]) : d < POD_R[0] ? tr('слишком близко') : h < POD_H && !craft.heli ? tr('низко — выше {0} м', [POD_H]) /* прицел вертолёта — в носу, работает и у земли */ : pod.masked ? tr('закрыта корпусом') :
        !(city.los(pod.pos.x, pod.pos.y, pod.pos.z, TP.x, TP.y + 2, TP.z, 4) || (craft.heli && !pod.tgt.S && city.los(pod.pos.x, pod.pos.y, pod.pos.z, ...hiPoint(pod.tgt, TP).toArray().map((v, k) => (k === 1 ? v + 2 : v)), 4))) ? tr('закрыта домами') : '';
      if (pod.why) pod.acq = 0;
      else if ((pod.acq += 0.1) >= POD_ACQ) { pod.lock = TP.clone(); if (craft.heli) pod.lock.y += 2; /* вертолёт: точка — на 2 м выше поверхности, как при проверке видимости: иначе пологий луч подсвета упирался в ту же крышу, и Hellfire шли без наведения */ pod.acq = 0; snd.lock(); }
    }
    const need = C.S.wpns.some((w) => w.owner === craft && (w.W.kind === 'lgb' || w.W.seeker === 'laser'));
    const want = pod.laserMan !== null ? pod.laserMan : need;
    const was = pod.laser;
    pod.laser = !!(hasPod && want && pod.lock && !pod.masked && !craft.dead && pod.pos.distanceTo(pod.lock) < 25000
      && city.los(pod.pos.x, pod.pos.y, pod.pos.z, pod.lock.x, pod.lock.y, pod.lock.z, 4)); // 4 м у концов — как при захвате (было 3: захват есть, а подсвет на грани видимости не включался)
    if (pod.laser !== was) snd.laser(pod.laser);
    laserSpot = pod.laser ? pod.lock : null;
  }
  function renderPod() {
    if (!pod.show || !hasPod || craft.dead || game.over) { podN = 0; return; }
    const r = pod.rect, VH = C.VH;
    const pr = renderer.getPixelRatio() * POD_K, pw = Math.max(1, Math.round(r.w * pr)), ph = Math.max(1, Math.round(r.h * pr));
    if (podRT.width !== pw || podRT.height !== ph) { podRT.setSize(pw, ph); podN = 0; }
    if (podN === 0) podSk = 1; // окно только открыли — уровни сразу по первому кадру, дальше — плавно
    if (!C.P.podHalf || (podN++ & 1) === 0) {
      drawPod(podRT);
      const now = performance.now();
      if (POD_MIP) { // замер уровней: 4 × 4 участка (уменьшенная копия ~ 1/4 окна), подстройка ~0,35 с
        statMat.uniforms.lod.value = Math.max(0, Math.log2(Math.max(pw, ph) / 4)); outMat.uniforms.lodL.value = Math.max(0, Math.log2(Math.max(pw, ph) / 10)); // местное — ~1/10 окна
        statMat.uniforms.k.value = podSk < 1 ? Math.max(POD_HF ? 0 : 0.2, 1 - Math.exp(-Math.min(0.2, (now - podST) / 1000) / 0.35)) : 1; // в 8 битах — не медленнее 0,2 за замер
        statMat.uniforms.prev.value = podSt[podSi].texture; podSi ^= 1;
        renderer.setRenderTarget(podSt[podSi]); renderer.render(statQS, podQC);
        outMat.uniforms.st.value = podSt[podSi].texture; podSk = 0;
      }
      podST = now; outMat.uniforms.t.value = (now % 1000) * 0.37;
    }
    renderer.setRenderTarget(null); renderer.setScissorTest(true); renderer.setScissor(r.x, VH - r.y - r.h, r.w, r.h); renderer.setViewport(r.x, VH - r.y - r.h, r.w, r.h);
    renderer.autoClear = false; renderer.render(podQS, podQC);
    renderer.autoClear = true; renderer.setScissorTest(false); renderer.setViewport(0, 0, C.VW, VH);
  }
  function drawPod(target) {
    podCam.fov = ZOOMS[pod.zi]; podCam.aspect = pod.rect.w / Math.max(1, pod.rect.h); podCam.updateProjectionMatrix();
    podCam.position.copy(pod.pos); podCam.up.set(0, 1, 0); podCam.lookAt(LQ.copy(pod.pos).add(pod.dir));
    const au = renderer.shadowMap.autoUpdate, sv = ship.visible;
    renderer.shadowMap.autoUpdate = false; ship.visible = false;
    // ночью — тепловизор: дымка для ИК прозрачнее, сцена подсвечена равномерно (иначе ночной туман и темнота «съедают» всё)
    const ir = NIGHT >= 0.5, fog = scene.fog, H = C.G.hemi, ex = renderer.toneMappingExposure, keep = ir && { fd: fog.density, fc: fog.color.clone(), hi: H.intensity, hc: H.color.clone(), hg: H.groundColor.clone() };
    const gain = ir ? 1.6 : podGain(); pod.gain = gain; renderer.toneMappingExposure = ex * gain;
    if (ir) { fog.density *= 0.35; fog.color.setRGB(0.1, 0.1, 0.1); H.intensity = 1.7; H.color.setRGB(0.75, 0.75, 0.75); H.groundColor.setRGB(0.45, 0.45, 0.45); }
    renderer.setRenderTarget(target); renderer.toneMapping = THREE.ACESFilmicToneMapping;
    // точка взгляда контейнера (пересечение с землёй) — вокруг неё дома и техника подробно, только на время кадра окна
    const gy = C.city.groundH(pod.pos.x, pod.pos.z), tt = pod.dir.y < -0.02 ? Math.min(30000, (pod.pos.y - gy) / -pod.dir.y) : 6000;
    const back = C.podPass ? C.podPass(podCam, PAT.copy(pod.pos).addScaledVector(pod.dir, tt), target.height) : null;
    renderer.autoClear = false; renderer.clear(); renderer.render(scene, podCam); if (back) back();
    renderer.autoClear = true;
    renderer.toneMapping = C.sceneTM; renderer.shadowMap.autoUpdate = au; ship.visible = sv;
    renderer.toneMappingExposure = ex;
    if (ir) { fog.density = keep.fd; fog.color.copy(keep.fc); H.intensity = keep.hi; H.color.copy(keep.hc); H.groundColor.copy(keep.hg); }
  }
  // в сумерках — ещё и выдержка (до ×1,5; больше — выбеливает небо до уровней): чем темнее сцена (небо + солнце над горизонтом), тем сильнее; уровни после неё — в шейдере вывода,
  // а с выдержкой у тёмной картинки больше оттенков (8 бит) — меньше ступенек
  const lumOf = (c) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
  function podGain() {
    const H = C.G.hemi, S = C.G.sun, d = C.G.sunDir;
    let l = H ? H.intensity * (lumOf(H.color) + lumOf(H.groundColor)) / 2 : 1;
    if (S && d) l += S.intensity * lumOf(S.color) * Math.max(0, d.y);
    pod.lum = l; return Math.min(1.5, Math.max(1, POD_LUM / Math.max(0.05, l)));
  }

  // ═════════════ Оружие ═════════════
  const usable = (l) => l && l.n > 0 && AG[l.key].kind !== 'ecm'; // станция помех не сбрасывается — работает весь вылет
  const NV = V3(), noseV = () => (craft.heli ? fwdOf(craft, NV) : craft.vel); // куда смотрит ГСН при пуске: у вертолёта — по оси (скорость бывает нулевой)
  // НАР (kind 'rocket'): l.n — блоков с ракетами, l.rs — залпов осталось в текущем блоке; всего ракет — для панели
  const rocketsOf = (l) => { const W = AG[l.key], per = Math.ceil(W.load / W.salvo); return l.n > 0 ? ((l.n - 1) * per + (l.rs ?? per)) * W.salvo : 0; };
  const curW = () => (usable(loadout[sel]) ? loadout[sel] : null);
  function nextWeapon() { for (let i = 1; i <= loadout.length; i++) { const k = (sel + i) % loadout.length; if (usable(loadout[k])) { sel = k; snd.click(); break; } } }
  // координаты для спутникового оружия и крылатых ракет: захват контейнера или ближайшая цель задания впереди
  const CO = V3();
  function coordAim(maxR) {
    if (pod.lock) return pod.lock;
    fwdOf(craft, LQ); let best = null, bd = maxR;
    for (const o of game.targets) { if (o.dead) continue; tgtPos(o, CO); const d = CO.distanceTo(craft.pos); if (d < bd && angleBetween(LQ, TMP0.copy(CO).sub(craft.pos)) < 80 * D2R) { bd = d; best = o; } }
    return best ? tgtPos(best, CO) : null;
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
  // прицел НАР по поколению вертолёта (Mark 2026-10-21): 1 — механический (кольцо по оси, без расчёта), 2 — вычислитель (крест точки
  // падения), 3 — с дальномером (дальность до цели под крестом, «ПУСК»), 4 — цифровой: нажали раньше — залп уйдёт сам, когда крест на цели
  const FCS = { h_uh1: 1, h_mi8: 1, h_uh60: 2, h_mi24: 2, h_ah1: 2, h_mi28: 3, h_ah64: 3, h_ka50: 3, h_ka52: 4, h_rah66: 4 };
  const fcs = () => (craft.heli ? FCS[craft.hm.key] || 2 : 2);
  let rkHold = 0, rkOn = null; // отложенный залп (ц4): секунд ожидания; цель под крестом (ц3+)
  // НАР у вертолёта (Mark 2026-10-22): цель впереди (захват контейнера или ближайшая цель задания / замеченный комплекс в ±35° от носа
  // и в досягаемости) — подпись у круга («опустите нос» / «в зоне — залп»…); в «Аркаде» нос сам ведёт круг точки падения на неё
  // (pitch — наклон, при котором расчётная точка падения на дальности цели), остаётся дать залп. pt — точка цели, on — помощь ведёт нос в этом кадре
  const nar = { pt: new THREE.Vector3(), has: false, key: null, pitch: 0, yaw: 0, on: false, assist: false, slow: false, hint: '' }, NAR_D = new THREE.Vector3(), NAR_P = new THREE.Vector3();
  const NAR_TOL_U = 15; // «в зоне» / «ПУСК» по машине ПВО — точка падения ближе 15 м (урон по машине — до ~18 м: blast, R 14 + 4)
  // помощь «Аркады» довела нос до расчётного направления (< 2°): залп пойдёт точно по нему (fire: opts.dir)
  const narAligned = () => { if (!nar.on) return false; const cp = Math.cos(nar.pitch); NAR_D.set(-Math.sin(nar.yaw) * cp, Math.sin(nar.pitch), -Math.cos(nar.yaw) * cp); return fwdOf(craft, NV).angleTo(NAR_D) < 0.035; };
  // подсказка к оружию вертолёта — при первом переключении на него в вылете (Mark 2026-10-22: «непонятно, как пускать НАР и ПТУР»; 2026-10-28 —
  // в начале боя не показывать); hintSeen — за вылет
  const hintSeen = new Set();
  let samMe = false; // по игроку пускали ЗУР, а ловушки ещё не бросал — лента боя («Разбор», C.bev)
  const logFire = (key) => { const W = AG[key]; if (W && W.kind !== 'ecm') C.bev('', BOMBK.has(W.kind) ? tr('сброс {0}', [W.short]) : tr('пуск {0}', [W.short]), 'fire:' + key, 1e9); }; // первый пуск / сброс каждого вида оружия
  function weaponHint(key) {
    const W = AG[key], fireK = IS_TOUCH ? tr('«Пуск»') : tr('Пробел'), nextK = IS_TOUCH ? tr('«Цель»') : 'R', km = (W.rmax / 1000).toFixed(1), F = fcs();
    if (W.kind === 'rocket') return (craft.hm.arcade
      ? tr('НАР: круг на земле — куда лягут ракеты. Цель впереди — нос сам доворачивает на неё, а на висении доводит и круг; «в зоне — залп» — жмите {0}. Дальность до {1} км.', [fireK, km])
      : tr('НАР: опускайте нос, пока круг на земле не ляжет на цель, и залп — {0}. Круг ближе цели — нос выше, дальше — ниже. Дальность до {1} км.', [fireK, km]))
      + (F === 1 ? ' ' + tr('Прицел механический: кольцо — точка попадания на 1,5 км.') : F >= 4 ? ' ' + tr('Можно нажать пуск заранее — залп уйдёт сам.') : '') + ' ' + tr('С высоты 100–200 м ракеты падают круче и ложатся кучнее.');
    if (W.kind === 'agm') return tr('ПТУР: контейнер сам захватывает цель впереди ({0} — следующая). Пуск — {1}, затем держите цель в рамке до попадания. Приём: из-за укрытия подскок, пуск и снова вниз — у земли ПВО берёт вас не сразу (≈ 3 с).', [nextK, fireK])
      + ' ' + (craft.hm.arcade ? tr('{0} — подскок сам: вверх, пуск и вниз.', [IS_TOUCH ? tr('«Подскок»') : 'E']) : tr('{0} — на сколько подняться до цели.', [IS_TOUCH ? tr('«Подскок»') : 'E']));
    return '';
  }

  // ═════════════ Подскок (вертолёт; Mark 2026-10-22) ═════════════
  // E / «ПОДСКОК»: «Аркада» — сам вверх, пока контейнер не увидит цель, захват, пуск ПТУР (НАР — когда круг на цели), висит, пока
  // ПТУР летит (его ведут до попадания), и вниз на прежнюю высоту; взялись за высоту или поворот — управление у игрока.
  // «Реализм» — только подсказка: на сколько подняться, чтобы цель показалась. st: 0 — нет, 1 — вверх, 2 — захват и пуск, 3 — ведёт ПТУР, 4 — вниз
  const pop = { st: 0, t: 0, agl0: 0, fired: false, tgt: null, seeT: 0 };
  const aglNow = () => craft.pos.y - city.topAt(craft.pos.x, craft.pos.z);
  // цель подскока: цель контейнера (выбранная R / «ЦЕЛЬ»), если она впереди (±40°) и в досягаемости выбранного оружия, иначе ближайшая
  // такая — цели задания и замеченные комплексы (как у контейнера). Mark 2026-10-22: подскок брал ближайшую и переводил на неё контейнер —
  // выбранный ЗРК подменялся КП или соседним комплексом (на стенде — в 4 пусках из 10), ПТУР уходил не туда
  function popPick() {
    const l = curW(), R = l ? AG[l.key].rmax * 1.1 : 6000, fx = -Math.sin(craft.yaw), fz = -Math.cos(craft.yaw); let best = null, bd = 1e9;
    const dOk = (t) => { tgtPos(t, TP); const dx = TP.x - craft.pos.x, dz = TP.z - craft.pos.z, d = Math.hypot(dx, dz); return d < 300 || d > R || (dx * fx + dz * fz) / d < 0.75 ? 0 : d; };
    const cands = podCands();
    if (hasPod && pod.tgt && cands.includes(pod.tgt) && dOk(pod.tgt)) return pod.tgt;
    for (const t of cands) { const d = dOk(t); if (d && d < bd) { bd = d; best = t; } }
    return best;
  }
  // нос смотрит на точку p не дальше deg градусов (ПТУР сходит по оси носа: цель вне поля ГСН — ракета её не увидит)
  const noseOn = (p, deg) => angleBetween(fwdOf(craft, NV), LP.copy(p).sub(craft.pos)) < deg * D2R;
  // видна ли цель с высоты dh над нынешней: луч из носа на высшую точку объекта (у вертолёта центр объекта закрыт его же постройками)
  function popSees(t, dh = 0) { const P = t.S ? tgtPos(t, TP) : hiPoint(t, TP); return city.los(craft.pos.x, craft.pos.y - 1.5 + dh, craft.pos.z, P.x, P.y + 2, P.z, 4); }
  function popNeed() { // «Реализм»: сколько метров вверх до видимости цели
    const t = popPick(); if (!t) return tr('Подскок: нет цели впереди в досягаемости — доверните на цель');
    for (let dh = 0; dh <= 80; dh += 5) if (popSees(t, dh)) return dh ? tr('Подскок: поднимитесь на +{0} м — {1} покажется; пуск — и вниз', [dh, tgtName(t)]) : tr('{0} видна — пуск, затем вниз', [tgtName(t)]);
    return tr('Цель не покажется и с +80 м — смените позицию');
  }
  function heliHelp() {
    const arc = craft.hm.arcade;
    if (IS_TOUCH) return arc
      ? tr('Ручка слева: вперёд — разгон, назад — тормоз, вбок — поворот. ▲▼ — высота, ◀▶ — шаг вбок, «Газ» — ступени скорости. «Подскок» — сам вверх до цели, пуск и вниз. «Ловушки» — ЛТЦ и диполи (зажмите — очередью). Панель слева: тап по оружию — выбор, по строке цели — следующая цель, «ТВ» — окно прицела. Прицел вертолёта захватывает цель сам, и у земли тоже. «Понял» (появляется при долгом захвате) глушит писк захвата; сигнал пуска ракеты остаётся.')
      : tr('Ручка слева — наклон и крен. ▲▼ — шаг-газ (вверх / вниз), ◀▶ — педали. «Подскок» — на сколько подняться, чтобы цель показалась. «Ловушки» — ЛТЦ и диполи (зажмите — очередью). Панель слева: тап по оружию — выбор, по строке цели — следующая цель, «ТВ» — окно прицела. Прицел вертолёта захватывает цель сам, и у земли тоже. «Понял» (появляется при долгом захвате) глушит писк захвата; сигнал пуска ракеты остаётся.');
    return arc
      ? tr('W/S — разгон и торможение · A/D — поворот · ↑ или Shift / ↓ или Ctrl — высота · ← / → — шаг вбок · мышь — прицел и камера<br>Пробел/F — пуск ПТУР, залп НАР · Q — оружие · R — следующая цель · E — подскок (вверх, пуск, вниз) · G — окно прицела · Z — увеличение<br>X — ловушки (держать — очередью) · Y — «Понял»: заглушить писк захвата · V — камера · M — карта · F1 — подсказки клавиш · Esc — пауза')
      : tr('W/S — ручка вперёд / назад · A/D — крен · ↑ или Shift / ↓ или Ctrl — шаг-газ · ← / → — педали · мышь — прицел и камера<br>Пробел/F — пуск · Q — оружие · R — следующая цель · E — на сколько подняться до цели · G — окно прицела · Z — увеличение<br>X — ловушки (держать — очередью) · Y — «Понял»: заглушить писк захвата · V — камера · M — карта · F1 — подсказки клавиш · Esc — пауза');
  }
  function popToggle() {
    if (!craft.heli || craft.dead || craft.landed) return;
    if (!craft.hm.arcade) { say(popNeed(), 3); snd.click(); return; }
    if (pop.st) { pop.st = 4; pop.t = 0; say(tr('Подскок отменён — вниз'), 1.5); return; }
    const t = popPick(); if (!t) { say(tr('Подскок: нет цели впереди в досягаемости — доверните на цель'), 2); snd.deny(); return; }
    pop.tgt = t; pop.seeT = 0; if (hasPod && pod.tgt !== t) podSet(t); // контейнер — на ту же цель
    pop.agl0 = aglNow(); pop.st = 1; pop.t = 0; pop.fired = false; snd.click(); say(tr('Подскок: вверх, пока цель не покажется'), 1.8);
  }
  function popStep(dt) {
    if (!pop.st) return;
    if (!craft.hm.arcade || craft.dead || game.over) { pop.st = 0; return; }
    if (Math.abs(HU.col) > 0.2 || Math.abs(HU.yaw) > 0.2) { pop.st = 0; say(tr('Подскок: управление у вас'), 1.2); return; } // сами взялись за высоту или поворот (палец, лежащий на ручке, — не в счёт)
    pop.t += dt; HU.cy = 0; // на подскоке — висение
    const l = curW(), W = l && AG[l.key], agl = aglNow(), T = pop.tgt;
    if (pop.st < 4 && (!T || T.dead)) { pop.st = 4; pop.t = 0; }
    if (T && pop.st < 4) { tgtPos(T, TP); HU.yawTo = Math.atan2(-(TP.x - craft.pos.x), -(TP.z - craft.pos.z)); } // нос — на цель
    if (pop.st === 1) {
      // видна с запасом 3 м — хватит; с НАР — не ниже 80 м, как у ИИ (с малой высоты ракеты идут почти вдоль земли: 1 м по высоте — 30 м по дальности)
      if ((pop.seeT -= dt) <= 0) { pop.seeT = 0.15; if (popSees(T, 3) && (!W || W.kind !== 'rocket' || agl >= 80)) { pop.st = 2; pop.t = 0; HU.col = 0; return; } }
      HU.col = 1;
      if (agl - pop.agl0 > (W && W.kind === 'rocket' ? 100 : 70) || pop.t > 14) { pop.st = 4; pop.t = 0; say(tr('Подскок: цель не показалась — смените позицию'), 2.5); }
    } else if (pop.st === 2) {
      HU.col = popSees(T, -1.5) ? 0 : 0.5; // чуть выше, если цель снова скрылась (с запасом 1,5 м: на грани видимости вертолёт проседал — подсвет гас)
      // ПТУР — когда нос довёрнут на цель (≤ 12°): пуск сразу по захвату, пока вертолёт ещё поворачивал, уводил ракету из поля ГСН; и цель
      // видна с запасом (иначе подсвет гаснет сразу после пуска и ракета падает неуправляемой)
      // НАР — когда помощь довела нос до расчёта (< 2°: залп уйдёт точно по нему — fire, opts.dir) или круг по носу «в зоне». Круг по носу
      // с висения у земли гуляет на десятки метров (1° наклона — сотни метров по дальности): ждать «в зоне» вместе с расчётом — залпа не было
      const ready = W && usable(l) && (W.kind === 'agm' ? !!pod.lock && pod.tgt === T && craft.pos.distanceTo(pod.lock) < W.rmax && noseOn(pod.lock, 12) && popSees(T, -1.5)
        : W.kind === 'rocket' && nar.has && nar.hint !== tr('далеко — ближе к цели') && (narAligned() || nar.hint === tr('в зоне — залп')));
      if (ready) { fire(true); pop.fired = true; pop.t = 0; pop.st = W.kind === 'agm' ? 3 : 4; }
      else if (pop.t > 6) { pop.st = 4; pop.t = 0; say(W && W.kind === 'agm' ? tr('Подскок: нет захвата — вниз') : W && W.kind === 'rocket' ? tr('Подскок: круг не лёг на цель — вниз') : tr('Подскок: выберите ПТУР или НАР'), 2.5); }
    } else if (pop.st === 3) { // ПТУР ведут до попадания: висим, нос на цели; цель закрывается (просели) — вверх, иначе подсвет гаснет (не выше +100 м — не в зону ПВО)
      HU.col = !popSees(T, -1) && agl - pop.agl0 < 100 ? 1 : 0;
      if (!C.S.wpns.some((w) => w.owner === craft && !w.dead && w.W.kind === 'agm') || pop.t > 25) { pop.st = 4; pop.t = 0; }
    } else { // вниз на прежнюю высоту
      HU.col = -1;
      if (agl <= pop.agl0 + 2 || pop.t > 10) { pop.st = 0; HU.col = 0; say(tr('Подскок завершён'), 1.2); }
    }
  }
  function narTarget(Wp) {
    if (pop.st && pop.tgt && !pop.tgt.dead) { const P = pop.tgt.S ? tgtPos(pop.tgt, TP) : hiPoint(pop.tgt, TP); return [P.x, P.y + 1, P.z, pop.tgt]; } // подскок: цель — его
    const fx = -Math.sin(craft.yaw), fz = -Math.cos(craft.yaw);
    const ok = (x, z) => { const dx = x - craft.pos.x, dz = z - craft.pos.z, d = Math.hypot(dx, dz); return d > 300 && d < Wp.rmax * 1.15 && (dx * fx + dz * fz) / d > 0.82 ? d : 0; };
    if (pod.lock && ok(pod.lock.x, pod.lock.z)) return [pod.lock.x, pod.lock.y, pod.lock.z, 'pod'];
    let best = null, bd = 1e9;
    for (const o of game.targets) { if (o.dead) continue; const a = aimXZ(o), d = ok(a.x, a.z); if (d && d < bd) { bd = d; best = [a.x, city.groundH(a.x, a.z) + 3, a.z, o]; } }
    for (const u of C.S.units) { if (u.dead || !u.known) continue; const d = ok(u.pos.x, u.pos.z); if (d && d < bd) { bd = d; best = [u.pos.x, u.pos.y + 1, u.pos.z, u]; } }
    return best;
  }
  function fire(auto) {
    const l = curW(); if (!l || game.over || craft.dead) return;
    if (auto !== true && AG[l.key].kind === 'rocket' && fcs() >= 4 && !rkOn) { rkHold = 4; say(tr('Залп — когда прицел придёт на цель'), 1.5); snd.click(); return; } // цифровой прицел: пуск отложен
    if (game.net) { const now = performance.now(); if (now - fireAt < 300) return; fireAt = now; }
    const Wp = AG[l.key], opts = {};
    const no = (t) => { say(t); snd.deny(); };
    if (Wp.tv) {
      if (!pod.lock) return no(tr('Нужен захват контейнером (ТВ-ГСН)'));
      if (NIGHT >= 0.5) return no(tr('Ночь: ТВ-головка не видит цель'));
      if (angleBetween(noseV(), LP.copy(pod.lock).sub(craft.pos)) > (Wp.kind === 'tvb' ? 50 : Wp.fov) * D2R) return no(tr('Цель вне поля ГСН — доверните на неё'));
      if (craft.pos.distanceTo(pod.lock) > Wp.rmax * 1.25) return no(tr('Далеко для ГСН'));
      opts.aim = pod.lock;
    } else if (Wp.kind === 'arm') {
      const u = armTarget(Wp); if (!u) return no(tr('Нет включённой РЛС впереди в поле ГСН'));
      opts.target = u;
    } else if (Wp.kind === 'agm' && Wp.seeker === 'laser' && !pod.lock) return no(tr('Нужен захват контейнером (лазер)'));
    else if (Wp.kind === 'agm' && Wp.seeker === 'laser' && craft.heli) {
      // ПТУР с вертолёта (2026-10-22): цель вне поля ГСН — ракета ушла бы мимо неуправляемой; в поле — сходит на линию прицела
      if (!noseOn(pod.lock, Wp.fov)) return no(tr('Цель вне поля ГСН — доверните на неё'));
      opts.dir = LP.copy(pod.lock).sub(craft.pos).normalize().clone(); opts.aim = pod.lock; // aim — первая «память» пятна (strike.js release)
    }
    else if (Wp.kind === 'gps' || Wp.kind === 'cruise') {
      const a = coordAim(Wp.rmax * 1.2); if (!a) return no(tr('Нет координат: захватите точку контейнером или доверните на цель задания'));
      opts.aim = a;
    } else if (Wp.kind === 'decoy') opts.aim = coordAim(30000);
    // бомбу с держателя не сбросить при крене больше 60° или вверх ногами (отделится в самолёт); ракеты сходят с направляющих в любом положении
    if (BOMBK.has(Wp.kind) && !levelOk()) return no(tr('Сброс невозможен: крен больше 60° или самолёт перевёрнут'));
    if (Wp.kind === 'rocket') { // залп НАР: блок остаётся на пилоне; пустой — следующий
      const per = Math.ceil(Wp.load / Wp.salvo); l.rs = (l.rs ?? per) - 1;
      // «Аркада», помощь навела нос (ошибка < 2°): залп — точно по рассчитанному направлению (как прицельный вычислитель). Почти по
      // касательной к земле 1° наклона — ≈ 600 м по дальности, а нос висящего вертолёта держит угол не точнее ~1° (Mark 2026-10-22)
      if (nar.on && !game.net) { const cp = Math.cos(nar.pitch); NAR_D.set(-Math.sin(nar.yaw) * cp, Math.sin(nar.pitch), -Math.cos(nar.yaw) * cp); fwdOf(craft, NV); if (NV.angleTo(NAR_D) < 0.035) opts.dir = NAR_D.clone(); }
      if (game.net) C.S.release(craft, l.key, { ...opts, salvo: Wp.salvo }); // онлайн: залп — одно сообщение (сервер пускает все ракеты и сам ведёт счёт в блоке)
      else for (let i = 0; i < Wp.salvo; i++) C.S.release(craft, l.key, opts);
      if (l.rs <= 0) { l.st.pop(); l.n--; l.rs = per; }
      logFire(l.key);
      if (C.hooks.trainFire) C.hooks.trainFire(l.key);
      if (l.n <= 0) nextWeapon();
      return;
    }
    const st = l.st.pop(); l.n--;
    const m = pylonMeshes.find((q) => q.userData.st === st); if (m) m.visible = false;
    C.S.release(craft, l.key, opts);
    updLoad(); logFire(l.key);
    if (C.hooks.trainFire) C.hooks.trainFire(l.key);
    if (l.n <= 0) nextWeapon();
  }
  // принудительный пуск для «Съёмки» (кнопка «Пуск»): с пилона o.st, иначе выбранное оружие, иначе любое годное; подвеска пуста — пополнение и пуск.
  // Бомбы — сразу (без зоны сброса и проверки крена), управляемые — по o.tgt (объект) или ближайшей цели задания, ПРР — по ближайшей РЛС (нет её — другое
  // оружие). Возвращает { w — пущенное оружие (null у ложной цели), st — пилон, key, rearmed } или null
  const FF = V3();
  function forceFire(o = {}) {
    if (craft.dead || game.over) return null;
    const rearmed = !loadout.some(usable);
    if (rearmed) rearm();
    const tgt = o.tgt && !o.tgt.dead ? o.tgt : game.targets.filter((q) => !q.dead).sort((a, b) => (a.x - craft.pos.x) ** 2 + (a.z - craft.pos.z) ** 2 - (b.x - craft.pos.x) ** 2 - (b.z - craft.pos.z) ** 2)[0];
    const P = tgt ? tgtPos(tgt, FF).clone() : fwdOf(craft, V3()).multiplyScalar(4000).add(craft.pos); // нет целей — вперёд
    const armU = (Wp) => C.S.units.filter((u) => !u.dead && u.S.radar).sort((a, b) => a.pos.distanceToSquared(craft.pos) - b.pos.distanceToSquared(craft.pos))[0] || null;
    const first = o.st !== undefined ? loadout.find((q) => usable(q) && q.st.includes(o.st)) : null;
    for (const l of [first, curW(), ...loadout].filter(usable).sort((m, n) => (AG[m.key].kind === 'decoy') - (AG[n.key].kind === 'decoy'))) { // ложные цели — в последнюю очередь
      const Wp = AG[l.key], opts = {};
      if (Wp.kind === 'arm') { const u = armU(Wp); if (!u) continue; opts.target = u; }
      else if (Wp.tv || Wp.kind === 'lgb' || (Wp.kind === 'agm' && Wp.seeker === 'laser')) { opts.aim = P; if (tgt && !craft.heli) { pod.tgt = tgt; pod.lock = P.clone(); pod.lockName = tgtName(tgt); } } // подсвет и ГСН — на цель
      else if (Wp.kind === 'gps' || Wp.kind === 'cruise' || Wp.kind === 'decoy') opts.aim = P;
      let w = null, stn;
      if (Wp.kind === 'rocket') {
        const per = Math.ceil(Wp.load / Wp.salvo); l.rs = (l.rs ?? per) - 1; stn = l.st[l.st.length - 1];
        for (let i = 0; i < Wp.salvo; i++) w = C.S.release(craft, l.key, opts);
        if (l.rs <= 0) { l.st.pop(); l.n--; l.rs = per; }
      } else {
        const i = o.st !== undefined ? l.st.indexOf(o.st) : -1; stn = i >= 0 ? l.st.splice(i, 1)[0] : l.st.pop(); l.n--;
        const m = pylonMeshes.find((q) => q.userData.st === stn); if (m) m.visible = false;
        w = C.S.release(craft, l.key, opts);
      }
      updLoad(); logFire(l.key);
      if (l.n <= 0 && l === loadout[sel]) nextWeapon();
      return { w, st: stn, key: l.key, rearmed };
    }
    return null;
  }
  // ловушки — одной кнопкой (одинаково на всех устройствах): пачка ЛТЦ и диполей разом; у каждой машины свои точки и залп (sim/cm.js)
  const cmInfo = () => cmOf(cmKey(craft), craft.cmSide); // ловушки машины игрока
  const cmLow = (k) => (cmInfo().flare ? craft.cmFlare : craft.cmChaff) < C.MODE().cm * k; // запас ловушек ниже доли k (у машины без ЛТЦ — по диполям)
  function cm(auto) {
    if (game.over || craft.dead) return;
    const f = cmInfo().flare && craft.cmFlare > 0, c = craft.cmChaff > 0; // машина без ЛТЦ — только диполи
    if (!f && !c) { if (!auto) say(tr('Ловушки кончились'), 1.2); return; }
    if (f) craft.cmFlare--; if (c) craft.cmChaff--;
    if (samMe) { samMe = false; C.bev('y', tr('ловушки')); }
    if (game.net) C.S.dropCM(craft, 'both'); // онлайн: одна команда серверу на каждый залп (с шагом 0,6 с автомата — нормально)
    else { if (f) C.S.dropCM(craft, 'flare'); if (c) C.S.dropCM(craft, 'chaff'); }
  }
  // очередь ловушек (Mark 2026-10-23: «надоедает постоянно тыкать»): кнопка «ЛОВУШКИ» / X / C зажата — залп сразу и затем каждые 0,6 с;
  // настройка C.sens.cmBurst — короткое нажатие даёт серию из 3 залпов с шагом 0,5 с. Отсчёт по dt боя (update), поэтому пауза его останавливает
  const CM_HOLD = 0.6, CM_BURST = 0.5, cmA = { hold: new Set(), t: 0, n: 0, out: false }; // hold — что зажато ('btn', 'KeyX', 'KeyC'); n — залпов серии впереди; out — «кончились» уже сказано
  const cmHave = () => (cmInfo().flare && craft.cmFlare > 0) || craft.cmChaff > 0;
  const cmReset = () => { cmA.hold.clear(); cmA.t = cmA.n = 0; cmA.out = false; };
  function cmPress(src) {
    const had = cmHave(); cmA.hold.add(src); cmA.out = false; cm();
    if (!had) cmA.out = true; // пусто — сообщение уже показано, автомат молчит
    if (C.sens.cmBurst && had) { cmA.n = 2; cmA.t = CM_BURST; } else cmA.t = CM_HOLD;
  }
  const cmRelease = (src) => { cmA.hold.delete(src); };
  function cmStep(dt) {
    if (!cmA.hold.size && !cmA.n) return;
    if (craft.dead || game.over) { cmReset(); return; }
    if ((cmA.t -= dt) > 0) return;
    if (!cmHave()) { cmA.n = 0; cmA.t = CM_HOLD; if (!cmA.out) { cmA.out = true; say(tr('Ловушки кончились'), 1.2); } return; } // один раз, а не на каждом шаге автомата
    cm(true); if (cmA.n > 0) cmA.n--;
    cmA.t = cmA.n > 0 ? CM_BURST : CM_HOLD;
  }
  addEventListener('blur', () => cmA.hold.clear()); // окно потеряло фокус — «keyup» мог не прийти

  // вертолёт: «ПОНЯЛ» — глушит писк захвата СПО (Mark 2026-10-23: захват у вертолёта долгий, писк надоедает). Считаем, сколько секунд комплекс
  // держит захват (state 'track' / 'launch' подряд); держит ≥ 3 с и не заглушён — появляется кнопка (клавиша Y). Нажатие глушит писк захвата у
  // всех комплексов, что держат захват сейчас; пуск ракеты ('launch') не глушится никогда. Отпустил захват — счётчик и глушение сбрасываются
  const RWA_T = 3, rwa = { held: new Map(), mute: new Set(), on: false }, ackBtn = $('rwrAck');
  function rwrAckShow(on) { if (rwa.on === on) return; rwa.on = on; ackBtn.classList.toggle('on', on); }
  function rwrAckReset() { rwa.held.clear(); rwa.mute.clear(); rwrAckShow(false); }
  function rwrAckPress() { if (!rwa.on) return; for (const id of rwa.held.keys()) rwa.mute.add(id); rwrAckShow(false); snd.click(); }
  // шаг раз в 0,1 с (боевое время, не на паузе): список СПО для звука — захват заглушённых комплексов как «облучение» (писка нет)
  function rwrAckStep(rw, dt) {
    if (!craft.heli) { if (rwa.held.size || rwa.on) rwrAckReset(); return rw; }
    const now = new Set();
    for (const e of rw) if (e.state === 'track' || e.state === 'launch') { now.add(e.u.id); rwa.held.set(e.u.id, (rwa.held.get(e.u.id) || 0) + dt); }
    for (const id of [...rwa.held.keys()]) if (!now.has(id)) { rwa.held.delete(id); rwa.mute.delete(id); }
    rwrAckShow([...rwa.held].some(([id, t]) => t >= RWA_T && !rwa.mute.has(id)));
    return rwa.mute.size ? rw.map((e) => (e.state === 'track' && rwa.mute.has(e.u.id) ? { ...e, state: 'search' } : e)) : rw;
  }
  ackBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); if (mine()) rwrAckPress(); });

  // ═════════════ «АВТО» — помощь в бою ═════════════
  // Как в «Летке»: не бесполезна, но и не идеальна. Бомба уходит, когда точка падения на цели или «В ЗОНЕ», ТВ-ракета —
  // в зоне, ПРР — по включённой РЛС впереди (захват контейнером — сам, у всех). Выбор оружия — первое, для которого
  // условие выполнено, с задержкой реакции. Пилотирование и уклонение — ваши.
  const AU = { relT: 0, cd: 0 };
  const PT = V3();
  function autoReady(l) {
    const Wp = AG[l.key];
    if (Wp.kind === 'arm') return !!armTarget(Wp);
    if (Wp.kind === 'ecm' || Wp.kind === 'rocket') return false; // НАР — только вручную
    if (Wp.kind === 'cruise' || Wp.kind === 'decoy') { const a = coordAim(Wp.kind === 'cruise' ? 22000 : 16000); return !!a && craft.pos.distanceTo(a) > 5000; }
    if (Wp.kind === 'gps') { const a = coordAim(Wp.rmax * 1.2); if (!a) return false; const t = predictBomb(city, Wp, craft.pos, craft.vel, a, PT); return t > 0 && PT.distanceTo(a) < 20; }
    if (Wp.kind === 'bomb') {
      if (predictBomb(city, Wp, craft.pos, craft.vel, null, PT) < 0) return false;
      return game.targets.some((o) => !o.dead && Math.abs(PT.x - o.x) < o.w / 2 + Wp.blast * 0.3 && Math.abs(PT.z - o.z - (o.rz || 0)) < o.d / 2 + Wp.blast * 0.3); // rz — сдвиг рамки
    }
    if (!pod.lock || C.S.wpns.some((w) => w.owner === craft && !w.dead && w.W.kind !== 'arm')) return false; // по одной на точку
    const d = craft.pos.distanceTo(pod.lock);
    if (Wp.kind === 'lgb' || Wp.kind === 'tvb') { const t = predictBomb(city, Wp, craft.pos, craft.vel, pod.lock, PT); return t > 0 && PT.distanceTo(pod.lock) < Math.max(12, Wp.blast * 0.4) && (!Wp.tv || NIGHT < 0.5); }
    return d < Wp.rmax * 0.85 && angleBetween(noseV(), LQ.copy(pod.lock).sub(craft.pos)) < Wp.fov * 0.8 * D2R && (!Wp.tv || NIGHT < 0.5);
  }
  function autoAssist(dt) {
    AU.acc = (AU.acc || 0) + dt; if (AU.acc < 0.1) return; dt = AU.acc; AU.acc = 0; // 10 раз в секунду хватает
    AU.cd -= dt;
    if (AU.cd > 0) return;
    const i = loadout.findIndex((l) => l.n > 0 && autoReady(l));
    if (i < 0) { AU.relT = 0; return; }
    AU.relT += dt;
    if (AU.relT < (AG[loadout[i].key].kind === 'arm' ? 0.9 : 0.25) + Math.random() * 0.04 * 10) return; // реакция «расчёта»
    sel = i; fire(true); AU.relT = 0; AU.cd = AG[loadout[i].key].kind === 'bomb' ? 0.35 : 1.6;
  }

  // ═════════════ Управление ═════════════
  const keys = new Set();
  let camMode = 0, abWas = false, fuelWarn = 0, thrI = 2;
  // газ ступенями, после 100 % — форсаж (одна кнопка «ГАЗ» на всех устройствах; на ПК — W/S по ступеням)
  const THR_STEPS = [0.4, 0.6, 0.8, 1, 1], AB_I = 4;
  function setThr(i) { thrI = clamp(i, 0, AB_I); craft.thr = THR_STEPS[thrI]; snd.click(); }
  function thrStep() { if (craft.heli && craft.hm && craft.hm.arcade) { heliSpd(hSpdI() + 1 >= H_SPD.length ? 1 : hSpdI() + 1); return; } setThr(thrI === AB_I ? 0 : thrI + 1); }
  // вертолёт («Аркада»): заданная скорость — доля наибольшей (назад, висение, ¼ … полная); кнопка «газ» листает по кругу
  const H_SPD = [-0.2, 0, 0.25, 0.5, 0.75, 1]; let hSpd = 0.25;
  const hSpdI = () => H_SPD.reduce((b, v, i) => (Math.abs(v - hSpd) < Math.abs(H_SPD[b] - hSpd) ? i : b), 0);
  function heliSpd(i) { hSpd = H_SPD[clamp(i, 0, H_SPD.length - 1)]; snd.click(); }
  function onKey(e, down) {
    if (!down) { keys.delete(e.code); if (e.code === 'KeyX' || e.code === 'KeyC') cmRelease(e.code); return; }
    if (e.repeat) return;
    keys.add(e.code);
    switch (e.code) {
      case 'Space': case 'KeyF': fire(); e.preventDefault(); break;
      case 'KeyQ': case 'Tab': nextWeapon(); e.preventDefault(); break;
      case 'KeyB': if (game.net && craft.dead) { spec.i++; spec.init = false; } else if (C.sens.bino !== false) binoTap(); break; // онлайн, сбит — следующий союзник; иначе — бинокль
      case 'KeyR': podNext(); break;
      case 'KeyG': podView(); break;
      case 'KeyW': if (!craft.heli) setThr(thrI + 1); break; // вертолёт: W/S держать — разгон и торможение, как ручка на телефоне (heliFly)
      case 'KeyS': if (!craft.heli) setThr(thrI - 1); break;
      case 'ShiftLeft': case 'ShiftRight': if (!craft.heli) setThr(thrI === AB_I ? 3 : AB_I); break;
      case 'KeyZ': pod.zi = (pod.zi + 1) % ZOOMS.length; snd.click(); break;
      case 'KeyO': pod.laserMan = pod.laserMan === null ? !pod.laser : pod.laserMan ? false : null; say(tr('Лазер: {0}', [pod.laserMan === null ? tr('авто') : pod.laserMan ? tr('вкл') : tr('выкл')]), 1.2); break;
      case 'KeyH': if (game.net && !craft.dead && C.askHelp) C.askHelp([craft.pos.x, craft.pos.z]); break;
      case 'KeyX': case 'KeyC': cmPress(e.code); break; // зажать — очередью
      case 'KeyY': rwrAckPress(); break; // вертолёт: «ПОНЯЛ» на писк захвата
      case 'KeyV': nextCam(); break;
      case 'KeyN': nextCam(camMode === 3 ? 0 : 3); break;
      case 'KeyL': freeLook(!free.on); break; // обзор: камера — мышью, самолёт держит курс
      case 'KeyM': toggleMap(); break;
      case 'KeyT': C.setAuto(!C.auto); break;
      case 'KeyE': popToggle(); break; // вертолёт: подскок
    }
  }
  function podView() { if (!hasPod) { say(tr('Нет прицельного контейнера в этой подвеске')); return; } pod.show = !pod.show; snd.click(); }
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
    $('tLook').classList.toggle('on', on); say(on ? tr('Обзор: ведите пальцем — камера осматривается, самолёт держит курс') : tr('Камера — снова за самолётом'), 1.6);
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
      const heliStick = craft.heli && e.clientX < innerWidth * 0.45; // вертолёт: левая часть экрана — ручка, правая — взгляд
      if (aimOn() && !heliStick) { if (aim.id === null) { aim.id = e.pointerId; aim.x = e.clientX; aim.y = e.clientY; zone.setPointerCapture(e.pointerId); } return; }
      if (craft.heli && stick.id !== null) return; // второй палец слева ручку не перехватывает
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
  // крестовина: ▲▼ — тангаж (у вертолёта — высота), ◀▶ — крен (педали). Кнопки — с фиксацией (Mark 2026-10-20: в вебе
  // держать палец неудобно): тап — включена и держится, ещё тап (или противоположная) — выключена; по осям независимо,
  // тап в середину — всё выключить. Новый вылет — всё выключено (padReset)
  const pad = { x: 0, y: 0, id: null };
  const padArms = (() => { const el = $('tPad'); return { el, u: el.querySelector('.pu'), d: el.querySelector('.pd'), l: el.querySelector('.pl'), r: el.querySelector('.pr') }; })();
  const padShow = () => { const A = padArms; A.r.classList.toggle('on', pad.x > 0); A.l.classList.toggle('on', pad.x < 0); A.u.classList.toggle('on', pad.y > 0); A.d.classList.toggle('on', pad.y < 0); };
  function padReset() { pad.x = pad.y = 0; padShow(); }
  padArms.el.addEventListener('pointerdown', (e) => {
    e.preventDefault(); e.stopPropagation();
    const b = padArms.el.getBoundingClientRect(), dx = (e.clientX - b.left) / b.width - 0.5, dy = (e.clientY - b.top) / b.height - 0.5;
    if (Math.abs(dx) < 0.17 && Math.abs(dy) < 0.17) padReset();
    else if (Math.abs(dx) > Math.abs(dy)) { const v = dx > 0 ? 1 : -1; pad.x = pad.x === v ? 0 : v; }
    else { const v = dy < 0 ? 1 : -1; pad.y = pad.y === v ? 0 : v; }
    padShow(); if (snd.click) snd.click();
  });
  const mine = () => C.ctrl === api || (C.ctrl && C.ctrl.inner === api); // в обучении управляет урок, а самолёт — внутри него
  const tap = (id, fn) => $(id).addEventListener('pointerdown', (e) => { e.preventDefault(); if (mine()) fn(); });
  tap('tFire', fire); tap('tLock', podNext); tap('tThr', thrStep);
  { const b = $('tFlare'); b.addEventListener('pointerdown', (e) => { e.preventDefault(); if (mine()) cmPress('btn'); }); for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) b.addEventListener(ev, () => cmRelease('btn')); } // зажата — ловушки очередью
  tap('tHelp', () => { if (game.net && !craft.dead && C.askHelp) C.askHelp([craft.pos.x, craft.pos.z]); });
  tap('tLook', () => freeLook(!free.on)); tap('tBino', binoTap);
  tap('tPop', popToggle); tap('tMap', () => toggleMap()); tap('tAuto', () => C.setAuto(!C.auto)); tap('tCam', () => { if (game.net && craft.dead) { spec.i++; spec.init = false; } else nextCam(); });
  // панель: тап по строке оружия — выбрать его, «ЦЕЛЬ …» — следующая цель, «ТВ» — окно контейнера
  $('wpn').addEventListener('pointerdown', (e) => {
    e.stopPropagation(); if (!mine()) return;
    const tv = e.target.closest('.tvb'), tg = e.target.closest('.tgl'), r = e.target.closest('[data-w]');
    if (tv) podView(); else if (tg) podNext();
    else if (r) { const i = +r.dataset.w; if (usable(loadout[i]) && i !== sel) { sel = i; snd.click(); } }
    else nextWeapon();
  });
  // места по умолчанию: справа два столбца у края; «КАМ.» на сенсорных — только в онлайне, пока смотрите за союзником.
  // Низкий экран (телефон ~850×360 с кнопками Telegram, Mark 2026-10-23): верх столбцов налезал на «паузу» и «звук» — места по умолчанию
  // сжимаются: отступы и размер кнопок ×k (k = место под верхним рядом / высота столбца, не меньше 0,6); свои места игрока не трогаем
  const COL_H = 268; // самый высокий столбец — «ОБЗОР»: 216 от низа + 52 высоты кнопки
  let topProbe = null; // скрытый пробный элемент с теми же top и высотой, что у «паузы» / «звука» / «Игроков» (видны не всегда)
  function touchK() {
    try {
      if (!topProbe) { topProbe = document.createElement('div'); topProbe.style.cssText = 'position:fixed;top:var(--top);left:0;width:1px;height:36px;visibility:hidden;pointer-events:none'; document.body.appendChild(topProbe); }
      const room = innerHeight - topProbe.getBoundingClientRect().bottom - 8; // 8 px запаса
      return room > 0 ? +clamp(room / COL_H, 0.6, 1).toFixed(2) : 1;
    } catch (_) { return 1; }
  }
  function layoutTouch() {
    if (!IS_TOUCH) return;
    const k = touchK(), px = (v) => Math.round(v * k);
    const R = (id, right, bottom) => { const e = $(id); e.dataset.r = `calc(${px(right)}px + var(--sa-r))`; e.dataset.b = px(bottom) + 'px'; e.dataset.k = k < 1 ? String(k) : ''; };
    R('tFire', 12, 16); R('tFlare', 12, 96); R('tMap', 12, 156); R('tLook', 12, 216); R('tBino', 172, 76); /* «Бинокль» — над «КАМ.» */ R('tThr', 102, 16); R('tLock', 102, 76); R('tAuto', 102, 136); R('tHelp', 102, 196); R('tPop', 102, 196); // «ПОДСКОК» — только у вертолёта, «ПОМОЩЬ» — только в онлайне (вертолётов в онлайне нет)
    const cam = $('tCam'); cam.style.right = `calc(${px(172)}px + var(--sa-r))`; cam.style.bottom = px(16) + 'px'; cam.style.transform = k < 1 ? `scale(${k})` : ''; cam.style.transformOrigin = 'right bottom';
    applyLayout(); // свои места кнопок игрока (Настройки → «Расположение кнопок»)
  }
  addEventListener('airdef-safearea', () => { layoutTouch(); layoutPod(); }); // вырез / кнопки Telegram изменились (shell.js) — ряд паузы сдвинулся, окно «ТВ» за ним
  layoutTouch(); // места по умолчанию — сразу (редактор кнопок открывается и до первого вылета)

  // ═════════════ Карта ═════════════
  let mapOn = false, mapBase = null;
  const mapC = $('map'), mx = mapC.getContext('2d');
  function toggleMap() { mapOn = !mapOn; mapC.style.display = mapOn ? 'block' : 'none'; }
  function drawMap() {
    const S2 = Math.min(C.VW, C.VH) - 40; if (mapC.width !== S2) { mapC.width = mapC.height = S2; mapBase = C.menu.mapBase(S2); }
    mx.drawImage(mapBase, 0, 0);
    const k = S2 / (2 * CITY.HALF), P2 = (x, z) => [(x + CITY.HALF) * k, (z + CITY.HALF) * k];
    mx.font = '600 11px "Golos Text", -apple-system, Segoe UI, sans-serif'; mx.textAlign = 'center';
    for (const o of game.targets) {
      const [px, pz] = P2(o.x, o.z);
      mx.fillStyle = o.dead ? '#888' : '#ffcf4a'; mx.beginPath(); mx.moveTo(px, pz - 7); mx.lineTo(px + 7, pz); mx.lineTo(px, pz + 7); mx.lineTo(px - 7, pz); mx.closePath(); mx.fill();
      mx.fillStyle = '#fff'; mx.strokeStyle = 'rgba(0,0,0,.7)'; mx.lineWidth = 3; mx.strokeText(o.name, px, pz - 10); mx.fillText(o.name, px, pz - 10);
    }
    for (const u of C.S.units) {
      if (u.dead || !(u.known || (C.MODE().markers && u.S.radar && u.emit))) continue;
      const [px, pz] = P2(u.pos.x, u.pos.z);
      mx.strokeStyle = 'rgba(255,107,107,.8)'; mx.lineWidth = 1; mx.beginPath(); mx.arc(px, pz, u.S.rmax * k, 0, 7); mx.stroke();
      // вертолёт: зона поражения закрашена, подпись — дальность: видно, откуда можно бить ПТУР, не входя в неё (Mark 2026-10-22)
      if (craft.heli) { mx.fillStyle = u.track === craft ? 'rgba(255,60,60,.22)' : 'rgba(255,90,90,.12)'; mx.fill(); mx.fillStyle = '#fecaca'; mx.fillText(tr('{0} км', [(u.S.rmax / 1000).toFixed(1)]), px, pz - u.S.rmax * k - 3); }
      mx.fillStyle = '#ff6b6b'; mx.fillText(u.S.rwr || u.S.short, px, pz + 4);
    }
    { const N = game.net, z = N ? N.zone : zn.Z; if (z) { const [zx, zz] = P2(N ? z[0] : z.x, N ? z[1] : z.z); mx.strokeStyle = '#4ade80'; mx.lineWidth = 2; mx.setLineDash([5, 4]); mx.beginPath(); mx.arc(zx, zz, Math.max(6, ZONE.R * k), 0, 7); mx.stroke(); mx.setLineDash([]); mx.fillStyle = '#bbf7d0'; mx.fillText(tr('пополнение'), zx, zz + Math.max(6, ZONE.R * k) + 12); } }
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
    if (rkHold > 0) rkHold -= dt;
    larT -= dt; if (larT > 0) return; larT = 0.15;
    const l = curW(); larText = ''; ccipOk = false;
    if (!l || craft.dead) return;
    const Wp = AG[l.key];
    if (Wp.kind === 'cruise' || Wp.kind === 'decoy') { const a = coordAim(Wp.rmax); larText = a ? tr('пуск по координатам · {0} км', [(craft.pos.distanceTo(a) / 1000).toFixed(1)]) : tr('нет координат цели'); return; }
    if (Wp.kind === 'bomb' || Wp.kind === 'lgb' || Wp.kind === 'tvb' || Wp.kind === 'gps') {
      const aim = Wp.kind === 'bomb' ? null : Wp.kind === 'gps' ? coordAim(Wp.rmax * 1.2) : pod.lock;
      const t = predictBomb(city, Wp, craft.pos, craft.vel, aim, CCIP);
      ccipOk = t > 0;
      if (aim && t > 0) {
        const miss = CCIP.distanceTo(aim);
        larText = miss < Math.max(12, Wp.blast * 0.4) ? tr('В зоне · {0} с до попадания', [t.toFixed(0)]) : (CCIP.distanceTo(craft.pos) < aim.distanceTo(craft.pos) ? tr('Далеко — ближе или выше') : tr('Близко — проскочили'));
      } else if (t > 0) larText = Wp.kind === 'bomb' ? tr('падение через {0} с', [t.toFixed(0)]) : tr('нужен захват контейнером');
    } else if (Wp.kind === 'rocket') { // НАР: точка падения по оси вертолёта
      fwdOf(craft, NV); const t = predictRocket(city, Wp, LP.copy(craft.pos).addScaledVector(UPW, -2.5), NV, Math.max(0, craft.vel.dot(NV)), CCIP);
      ccipOk = t > 0; const d = ccipOk ? CCIP.distanceTo(craft.pos) : 0, F = fcs();
      rkOn = null;
      if (ccipOk && F >= 3) { let best = 1e9; const tol = Math.max(25, (Wp.blast || 10) * 0.9);
        for (const o of game.targets) { if (o.dead) continue; const e = objDist(o, CCIP.x, CCIP.z); if (e < best) { best = e; rkOn = e < tol ? o : null; } } // до ближайшей постройки (было: до центра минус треть размера — у порта «ПУСК» за ~900 м от причала)
        for (const u of C.S.units) { if (u.dead || !u.known) continue; const e = Math.hypot(u.pos.x - CCIP.x, u.pos.z - CCIP.z); if (e < NAR_TOL_U && e < best) { best = e; rkOn = u; } } }
      larText = F === 1 ? tr('НАР · механический прицел (кольцо)')
        : !ccipOk ? tr('НАР: опустите нос — точка падения дальше 4 км') : d > Wp.rmax ? tr('далеко · {0} км', [(d / 1000).toFixed(1)])
        : F >= 3 ? tr('{0} · дальность {1} км · {2} с{3}', [rkOn ? tr('Пуск') : tr('НАР'), (d / 1000).toFixed(2), t.toFixed(1), rkHold > 0 ? tr(' · залп ждёт цель') : '']) : tr('НАР · {0} км · {1} с', [(d / 1000).toFixed(1), t.toFixed(1)]);
      if (rkHold > 0 && rkOn && d <= Wp.rmax) { rkHold = 0; fire(true); } // цифровой прицел: залп сам — крест на цели
      // цель впереди: подпись у круга и поправка наведения «Аркады» (круг ближе цели — нос выше, дальше — ниже)
      const tg = craft.heli ? narTarget(Wp) : null; nar.has = !!tg; nar.hint = '';
      if (tg) {
        nar.key = tg[3]; nar.pt.set(tg[0], tg[1], tg[2]);
        const dT = Math.hypot(tg[0] - craft.pos.x, tg[2] - craft.pos.z), dC = ccipOk ? Math.hypot(CCIP.x - craft.pos.x, CCIP.z - craft.pos.z) : 1e9;
        // «в зоне»: по машине ПВО — 15 м (25 м, как по зданиям, — уже промах: радиус НАР 14 м, а машина — точка), по объекту — 25 м
        const tk = tg[3] === 'pod' ? pod.tgt : tg[3], miss = Math.hypot(CCIP.x - tg[0], CCIP.z - tg[2]), tol = tk && tk.S ? NAR_TOL_U : Math.max(25, (Wp.blast || 10) * 0.9);
        // наклон для «Аркады»: подбор делением пополам — при каком наклоне по курсу на цель расчётная точка падения на её дальности
        // (поправка «по промаху» раскачивала нос до 15°). 14 шагов (было 9: шаг 0,1° — с висения на 50 м это до ±30 м по дальности)
        const yw = Math.atan2(-(tg[0] - craft.pos.x), -(tg[2] - craft.pos.z)), P0 = LP.copy(craft.pos).addScaledVector(UPW, -2.5);
        let lo = -0.6, hi = 0.35;
        for (let it = 0; it < 14; it++) {
          const a = (lo + hi) / 2; NAR_D.set(-Math.sin(yw) * Math.cos(a), Math.sin(a), -Math.cos(yw) * Math.cos(a));
          const tt = predictRocket(city, Wp, P0, NAR_D, Math.max(0, craft.vel.dot(NAR_D)), NAR_P), dd = tt > 0 ? Math.hypot(NAR_P.x - craft.pos.x, NAR_P.z - craft.pos.z) : 1e9;
          if (dd > dT) hi = a; else lo = a;
        }
        nar.pitch = (lo + hi) / 2; nar.yaw = yw;
        nar.hint = dT > Wp.rmax ? tr('далеко — ближе к цели') : ccipOk && miss < tol ? tr('в зоне — залп') : dC < dT ? tr('поднимите нос') : tr('опустите нос');
      } else nar.key = null;
    } else if (Wp.kind === 'arm') {
      const u = armTarget(Wp); larText = u ? tr('РЛС {0} · {1} км — пуск', [u.S.rwr || u.S.short, (craft.pos.distanceTo(u.pos) / 1000).toFixed(1)]) : tr('нет РЛС впереди');
    } else if (pod.lock) {
      const d = craft.pos.distanceTo(pod.lock); larText = d < Wp.rmax ? tr('в зоне · {0} км', [(d / 1000).toFixed(1)]) : tr('далеко · {0} км', [(d / 1000).toFixed(1)]);
    } else larText = tr('нужен захват контейнером');
  }
  function drawHud() {
    const hx = C.hx, proj = (p) => C.proj(p);
    hx.font = '600 11px "Golos Text", -apple-system, Segoe UI, sans-serif'; hx.textAlign = 'center'; hx.lineWidth = 1.5;
    if (craft.dead) return;
    const fp = proj(LP.copy(craft.pos).addScaledVector(craft.vel, 3));
    if (aimOn()) { const ap = proj(LP.copy(craft.pos).addScaledVector(aimDir(AIMD), 2000)); if (ap) { hx.strokeStyle = 'rgba(255,255,255,.85)'; hx.beginPath(); hx.arc(ap[0], ap[1], 11, 0, 7); hx.moveTo(ap[0] - 3, ap[1]); hx.lineTo(ap[0] + 3, ap[1]); hx.stroke(); } } // куда смотрит камера — туда летит самолёт
    if (fp) { hx.strokeStyle = '#9fffb8'; hx.beginPath(); hx.arc(fp[0], fp[1], 7, 0, 7); hx.moveTo(fp[0] - 16, fp[1]); hx.lineTo(fp[0] - 7, fp[1]); hx.moveTo(fp[0] + 7, fp[1]); hx.lineTo(fp[0] + 16, fp[1]); hx.moveTo(fp[0], fp[1] - 7); hx.lineTo(fp[0], fp[1] - 13); hx.stroke(); }
    for (const o of game.targets) {
      const a = aimXZ(o), p = proj(LP.set(a.x, city.groundH(a.x, a.z) + 20, a.z)); if (!p) continue; // метка — над главной постройкой (куда целиться)
      const d = craft.pos.distanceTo(LP);
      hx.strokeStyle = o.dead ? 'rgba(200,200,200,.6)' : '#fde047'; hx.fillStyle = hx.strokeStyle;
      hx.beginPath(); hx.moveTo(p[0], p[1] - 9); hx.lineTo(p[0] + 9, p[1]); hx.lineTo(p[0], p[1] + 9); hx.lineTo(p[0] - 9, p[1]); hx.closePath(); hx.stroke();
      if (o.dead) drawIco(hx, 'close', p[0], p[1], 13); // уничтожена — крестик в ромбе
      hx.fillText(`${o.name} ${(d / 1000).toFixed(1)}`, p[0], p[1] - 13);
    }
    const M = C.MODE();
    // «Реализм»: подвеска пуста (или мало ловушек/топлива) — метка точки вылета, где пополняются
    if (M.reload === 'home' && reloadable() && homeLeft > 0 && (needsRearm() || cmLow(0.5) || craft.fuel < 0.6)) {
      const p = proj(LP.set(home.x, home.y + 30, home.z));
      const dh = Math.hypot(craft.pos.x - home.x, craft.pos.z - home.z), z0 = game.net ? game.net.zone : zn.Z;
      if (!z0 || (!zn.fuel && !zn.ammo)) edgeArrow(LP.set(home.x, home.y + 30, home.z), tr('вылет {0} км', [(dh / 1000).toFixed(1)]), '#86efac'); // зоны нет (или кончилась) — пополнение у точки вылета
      if (p) { const d = dh; hx.strokeStyle = hx.fillStyle = '#86efac'; hx.beginPath(); hx.arc(p[0], p[1], 9, 0, 7); hx.moveTo(p[0] - 5, p[1]); hx.lineTo(p[0] + 5, p[1]); hx.moveTo(p[0], p[1] - 5); hx.lineTo(p[0], p[1] + 5); hx.stroke(); hx.fillText(tr('Пополнение {0}{1}', [(d / 1000).toFixed(1), d < 2500 ? tr(' · ниже 1500 м') : '']), p[0], p[1] - 13); }
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
    if (l && AG[l.key].kind === 'rocket' && fcs() === 1) { // механический прицел: неподвижное кольцо по оси на 1,5 км
      fwdOf(craft, NV); const p = proj(LP.copy(craft.pos).addScaledVector(NV, 1500));
      if (p) { hx.strokeStyle = 'rgba(255,214,120,.95)'; hx.lineWidth = 1.6; hx.beginPath(); hx.arc(p[0], p[1], 18, 0, 7); hx.moveTo(p[0] - 26, p[1]); hx.lineTo(p[0] - 18, p[1]); hx.moveTo(p[0] + 18, p[1]); hx.lineTo(p[0] + 26, p[1]); hx.stroke(); hx.lineWidth = 1; narLabel(p, 32); }
    } else if (l && ccipOk && AG[l.key].kind !== 'agm' && AG[l.key].kind !== 'arm') {
      const p = proj(CCIP);
      // прицел бомбы: круг на земле — радиус поражения (разлёт), перекрестие — точка падения; при большом крене — красный («сброс невозможен»)
      if (p) {
        const Wb = AG[l.key], R = Math.max(8, Wb.blast || 20), ok = levelOk(), col = !ok ? '#f87171' : Wb.kind === 'rocket' && rkOn ? '#4ade80' : Wb.kind === 'rocket' && fcs() >= 3 ? '#fde68a' : '#9fffb8'; // НАР с дальномером: крест на цели — зелёный
        hx.strokeStyle = col; hx.lineWidth = 2.2; hx.beginPath(); let first = true, span = 0;
        const ring = []; for (let i = 0; i <= 32; i++) { const a2 = i / 32 * Math.PI * 2, q = proj(TMP0.set(CCIP.x + Math.cos(a2) * R, CCIP.y + 0.5, CCIP.z + Math.sin(a2) * R)); ring.push(q); if (q) span = Math.max(span, Math.hypot(q[0] - p[0], q[1] - p[1])); }
        // круг поражения на земле; если вдали он меньше 14 px — рисуем не меньше (иначе не разглядеть)
        if (span < 14) hx.arc(p[0], p[1], 14, 0, 7);
        else for (const q of ring) { if (!q) { first = true; continue; } if (first) { hx.moveTo(q[0], q[1]); first = false; } else hx.lineTo(q[0], q[1]); }
        hx.stroke();
        const c = 16, g = 5; hx.beginPath(); hx.moveTo(p[0] - c, p[1]); hx.lineTo(p[0] - g, p[1]); hx.moveTo(p[0] + g, p[1]); hx.lineTo(p[0] + c, p[1]); hx.moveTo(p[0], p[1] - c); hx.lineTo(p[0], p[1] - g); hx.moveTo(p[0], p[1] + g); hx.lineTo(p[0], p[1] + c); hx.stroke();
        hx.beginPath(); hx.arc(p[0], p[1], 1.8, 0, 7); hx.fillStyle = col; hx.fill(); hx.lineWidth = 1;
        if (!ok) hx.fillText(tr('Крен'), p[0], p[1] - 22);
        if (Wb.kind === 'rocket') narLabel(p, Math.max(30, Math.min(span, 80) + 14));
      }
    } else if (l && AG[l.key].kind === 'rocket' && nar.hint) { const p = proj(nar.pt); if (p) narLabel(p, 24); } // круга нет (точка падения дальше 4 км) — подпись у цели
    for (const w of C.S.wpns) { if (w.owner !== craft) continue; const p = proj(w.pos); if (!p) continue; hx.fillStyle = w.homing ? '#fde047' : '#aaa'; hx.beginPath(); hx.arc(p[0], p[1], 3, 0, 7); hx.fill(); }
  }
  // подпись у круга НАР: что сделать, чтобы попасть; в «Аркаде» с помощью — «нос ведёт…»
  function narLabel(p, dy) {
    if (!nar.hint) return;
    const ok = /залп/.test(nar.hint) || nar.hint === tr('в зоне — залп');
    const t = ok ? nar.hint : nar.on ? tr('нос ведёт на цель…') : nar.assist && !nar.slow && nar.hint !== tr('далеко — ближе к цели') ? tr('сбавьте скорость — нос наведётся') : nar.hint;
    hx2Text(t, p[0], p[1] + dy, ok ? '#4ade80' : '#fde68a', 13);
  }
  function hx2Text(t, x, y, col, px) {
    const hx = C.hx; hx.font = `700 ${px}px "Golos Text", -apple-system, Segoe UI, sans-serif`; hx.textAlign = 'center';
    hx.lineWidth = 3; hx.strokeStyle = 'rgba(0,0,0,.75)'; hx.strokeText(t, x, y); hx.fillStyle = col; hx.fillText(t, x, y);
    hx.font = '600 11px "Golos Text", -apple-system, Segoe UI, sans-serif'; hx.lineWidth = 1.5;
  }
  // вертолёт: «вас видит» — комплекс уже видит и берёт на сопровождение (у земли захват на 3 с дольше, sim/strike.js) — успеть уйти
  // вниз за рельеф (Mark 2026-10-22); захват и пуск — прежние предупреждения строки #warn
  function seenBy() {
    if (!craft.heli || craft.dead) return null;
    for (const u of C.S.units) if (!u.dead && !u.track && u.seeT > 0.15 && u.seeTgt === craft && u.pos.distanceTo(craft.pos) < u.S.rmax * 1.3) return u; // смотрит на нас, а не на ПТУР
    return null;
  }
  function drawRwr(list, mws, t) {
    const S2 = rc.width, c = S2 / 2; rx2.clearRect(0, 0, S2, S2);
    rx2.fillStyle = 'rgba(0,18,8,.55)'; rx2.beginPath(); rx2.arc(c, c, c - 2, 0, 7); rx2.fill();
    rx2.strokeStyle = 'rgba(140,255,170,.45)'; rx2.lineWidth = 2; for (const r of [0.33, 0.66, 0.98]) { rx2.beginPath(); rx2.arc(c, c, (c - 4) * r, 0, 7); rx2.stroke(); }
    rx2.font = `700 ${Math.round(S2 * 0.09)}px "Golos Text", -apple-system, sans-serif`; rx2.textAlign = 'center'; rx2.textBaseline = 'middle';
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
      const st = !t ? tr('<span class="dim">нет целей</span>') : pod.lock ? tr('<b class="lk">Захват</b>{0}', [pod.laser ? ' <b class="ls"><i class="sd"></i></b>' : '']) : pod.why ? `<span class="warnc">${pod.why}</span>` : tr('<span class="lk2">захват…</span>');
      tgl = `<div class="tgl"><span class="tn">◎ ${t ? `${pod.lockName} ${d}` : ''} ${st}</span><span class="tvb ${pod.show ? 'on' : ''}">${tr('ТВ')}</span></div>`;
    }
    const dead = game.targets.filter((o) => o.dead).length, fuel = Math.round((craft.fuel ?? 1) * 100);
    // задача выполнена — постоянное короткое напоминание вместо «цели N/N» (Mark 2026-10-27: плашка гаснет через 5 с, а игрок забывает, что
    // вылет кончается за границей района): сколько до неё по прямой; вертолёт уходит сам по отсчёту — ему не нужно
    const doneTxt = game.done && !craft.heli && !game.net && !game.opts.noEnd
      ? tr(' · <b class="okd">задача выполнена</b> <span class="dim">— выход за границу района, {0} км</span>', [(Math.max(0, CITY.HALF - 300 - Math.max(Math.abs(craft.pos.x), Math.abs(craft.pos.z))) / 1000).toFixed(1)]) : '';
    $('wpn').innerHTML = `<div class="fl"><b>${Math.round(craft.speed * 3.6)}</b> ${tr('км/ч')} <b>${Math.round(craft.pos.y - g)}</b> ${tr('м')} <span class="${craft.fuel < 0.2 ? 'warnc' : 'dim'}">${ico('fuel', 'ii')}${fuel}%</span>${craft.ab ? ` <b class="ab">${tr('Ф')}</b>` : ''}</div>` +
      `<div class="wl">${loadout.map((l, i) => `<span class="r ${i === sel ? 'sel' : ''}" data-w="${i}">${AG[l.key].short}${AG[l.key].kind === 'ecm' ? ' <i class="sd"></i>' : ' ×' + (AG[l.key].kind === 'rocket' ? rocketsOf(l) : l.n)}${AG[l.key].kind !== 'ecm' && Number.isFinite(l.res) && !game.net ? ` <span class="dim">+${AG[l.key].kind === 'rocket' ? l.res * AG[l.key].load : l.res}</span>` : ''}${l.rt > 0 ? ` <span class="dim">${ico('rotCw', 'ii')}${Math.ceil(l.rt)}</span>` : ''}</span>`).join('')}</div>` +
      `<div class="st">${msgT > 0 ? msgText : larText}${inAir ? tr(' <span class="fly">· в полёте {0}</span>', [inAir]) : ''}</div>` + tgl +
      `<div class="cm">${tr('ловушки')} ${cmInfo().flare ? Math.max(craft.cmFlare, craft.cmChaff) : craft.cmChaff + ` <span class="dim">${tr('(диполи)')}</span>`}${doneTxt || (game.hunt ? tr(' · РЛС {0}/{1}', [game.hunt.n, game.hunt.need]) : game.targets.length ? tr(' · цели {0}/{1}', [dead, game.targets.length]) : '')}${craft.hp < 100 ? (() => { const [, nm, col] = hullState(craft.hp), br = dmgBrief(craft); return `<br><b style="color:${col}">${nm}</b>${br ? ` <span class="dim">· ${br}</span>` : ''}`; })() : ''}${C.auto ? ` · <b style="color:#86efac">${tr('Авто')}</b>` : ''}${hasPod && pod.laserMan !== null ? tr(' · лазер {0}', [pod.laserMan ? tr('вкл') : tr('выкл')]) : ''}${homeT > 0 ? tr(' · <b style="color:#86efac">пополнение {0} с</b>', [Math.ceil(12 - homeT)]) : ''}</div>`;
    const lk = rw.find((e) => e.state === 'launch'), trk = rw.find((e) => e.state === 'track'), wn = $('warn');
    if (bino.on && binoThreat(mw)) binoOff(tr('Пуск ракеты по вам — бинокль выключен')); else binoHud();
    if (mw.length || lk) { wn.textContent = tr('ПУСК РАКЕТЫ{0}', [lk ? ' — ' + (lk.u.S.rwr || lk.u.S.short) : '']); wn.style.display = 'block'; }
    else if (trk) { wn.textContent = craft.heli ? tr('ЗАХВАТ — {0} · вниз, за рельеф!', [trk.u.S.rwr || trk.u.S.short]) : tr('ЗАХВАТ — {0}', [trk.u.S.rwr || trk.u.S.short]); wn.style.display = 'block'; }
    else { const su = seenBy(); if (su) { wn.textContent = tr('ВАС ВИДИТ {0} — снижайтесь за рельеф', [su.S.rwr || su.S.short]); wn.style.display = 'block'; } else wn.style.display = 'none'; }
    const b = $('podBox'), bOn = pod.show && hasPod && !game.over && !craft.dead; b.style.display = bOn ? 'block' : 'none';
    const ackTop = bOn && pod.ackTop != null ? pod.ackTop + 'px' : ''; if (ackBtn.style.top !== ackTop) ackBtn.style.top = ackTop; // «ПОНЯЛ» — под окном, пока оно в его ряду
    if (pod.show) {
      b.classList.toggle('locked', !!pod.lock);
      b.querySelector('.zoom').textContent = `×${Math.round(ZOOMS[0] / ZOOMS[pod.zi] * 10) / 10}`;
      b.querySelector('.mask').style.display = pod.masked ? 'flex' : 'none';
      const rng = pod.lock ? craft.pos.distanceTo(pod.lock) : 0;
      b.querySelector('.info').textContent = `${NIGHT >= 0.5 ? tr('ИК') : tr('ТВ')}${pod.lock ? tr('  Захват {0} км', [(rng / 1000).toFixed(1)]) : pod.tgt ? tr('  поиск') : tr('  обзор')}\n${pod.lockName}`;
      { const i2 = b.querySelector('.info2'), h2 = pod.laser || pod.lock ? `${tr('Лазер')} <i class="sd${pod.laser ? '' : ' o'}"></i>` : (pod.why || ''); if (i2._h !== h2) { i2._h = h2; i2.innerHTML = h2; } } // строка меняется редко — разметку не пересобираем каждый кадр
    }
  }

  // ═════════════ Камера ═════════════
  // 0 — за самолётом, 1 — облёт, 2 — из кабины, 3 — за оружием: летит за своей бомбой/ракетой до разрыва (3 с смотрит на
  // попадание), нет своего оружия в воздухе — за ракетой ПВО, которая летит в вас; ничего нет — за самолётом
  const fw = V3(), up = V3(), camPos = V3(), camLook = V3(), wcLook = V3(), wcV = V3();
  const CAM_NAMES = [tr('за самолётом'), tr('облёт'), tr('из кабины'), tr('за оружием (бомбы и ракеты)')];
  const wc = { obj: null, kind: '', endT: 0, last: V3(), init: false, off: V3() };
  function nextCam(to) { camMode = to ?? (camMode + 1) % 4; wc.obj = null; wc.init = false; say(tr('Камера: {0}', [CAM_NAMES[camMode]]), 1.4); }
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
  // ═════════════ «Бинокль» (Mark 2026-10-28): вид с самолёта на захваченную цель и за своим оружием, самолёт ведёт автопилот ═════════════
  // кнопка #tBino / B: выкл → цель → оружие (пока в полёте; за разрывом — следующее) → выкл. Цель — захват контейнера, иначе ближайшая цель задания;
  // приближение — цель ≈ 1/6 высоты кадра (у оператора ЗРК — ¼; Mark: «чуть меньший масштаб»). Автопилот — курс и высота на момент включения, не ниже
  // рельефа впереди + 300 м, у границы района — к центру (planeFly). Выход — кнопкой, ручкой / крестовиной / клавишами / пальцем по экрану и сам —
  // при пуске ракеты по самолёту. Выключается в настройках («Экран и кнопки»: C.sens.bino) — тогда кнопки нет
  const bino = { on: false, mode: 'tgt', w: null, ap: { yaw: 0, alt: 0 }, fov: 30, why: '' }, BT = V3();
  const binoOk = () => C.sens.bino !== false && !craft.heli && !craft.dead && !game.over;
  function binoTgt() {
    if (pod.tgt && !pod.tgt.dead) return pod.tgt;
    let b = null, bd = 1e12; for (const o of game.targets) { if (o.dead) continue; const d = Math.hypot(o.x - craft.pos.x, o.z - craft.pos.z); if (d < bd) { bd = d; b = o; } }
    return b;
  }
  const binoWpns = () => C.S.wpns.filter((w) => !w.dead && w.owner === craft && weaponHasModel(w.key, w.W));
  // ракета летит именно в самолёт (датчик пуска или ЗУР с целью — он): плашка «ПУСК РАКЕТЫ» бывает и от пусков по своим бомбам («Тор», «Панцирь»)
  const binoThreat = (mw) => (mw && mw.length > 0) || C.S.sams.some((m) => !m.dead && m.target === craft);
  function binoSet(mode) {
    bino.mode = mode; wc.obj = null; wc.init = false; wc.endT = 0;
    if (mode === 'wpn') { const ws = binoWpns(); bino.w = ws.find((w) => w.id > (bino.w ? bino.w.id : -1)) || ws[0] || null; wc.obj = bino.w; wc.kind = 'w'; }
    ship.visible = mode !== 'tgt'; // вид из самолёта — без своей модели в кадре
  }
  function binoOn() {
    if (!binoOk()) return;
    const t = binoTgt(), ws = binoWpns();
    if (binoThreat(C.S.mws ? C.S.mws(craft) : null)) { say(tr('Ракета летит в вас — бинокль недоступен'), 1.8); snd.deny(); return; }
    if (!t && !ws.length) { say(tr('Бинокль: нет цели и оружия в полёте'), 1.8); snd.deny(); return; }
    if (free.on) freeLook(false);
    bino.on = true; bino.ap.yaw = craft.yaw; bino.ap.alt = craft.pos.y; bino.fov = 30;
    binoSet(t ? 'tgt' : 'wpn'); $('tBino').classList.add('on'); document.body.classList.add('binoOn'); snd.click();
  }
  function binoOff(why) {
    if (!bino.on) return;
    bino.on = false; bino.w = null; wc.obj = null; ship.visible = !craft.dead; aimSync(); C.setFov(62);
    $('tBino').classList.remove('on'); document.body.classList.remove('binoOn'); binoBar.style.display = 'none';
    if (why) say(why, 2.2);
  }
  function binoTap() {
    if (!bino.on) { binoOn(); return; }
    const ws = binoWpns();
    if (bino.mode === 'tgt' && ws.length) { binoSet('wpn'); snd.click(); return; }
    if (bino.mode === 'wpn' && ws.some((w) => w.id > (bino.w ? bino.w.id : -1))) { binoSet('wpn'); snd.click(); return; } // следующее оружие в полёте
    binoOff(); snd.click();
  }
  const binoBar = document.createElement('div'); binoBar.id = 'binoBar'; if (document.body && document.body.appendChild) document.body.appendChild(binoBar);
  function binoCamera(dt, t) {
    if (bino.mode === 'wpn') {
      if (!wc.obj && bino.w && !bino.w.dead) { wc.obj = bino.w; wc.kind = 'w'; }
      if (C.camera.fov !== 38) C.setFov(38); // за оружием — уже обычного (62°): бомба крупнее в кадре; после вида на цель — не узкое
      if (weaponCamera(dt, t)) { if (wc.obj && wc.obj !== bino.w && wc.kind === 'w') bino.w = wc.obj; return true; } // за разрывом — следующее своё (weaponCamera)
      if (binoTgt()) binoSet('tgt'); else { binoOff(); return false; } // оружия в полёте больше нет — к цели
    }
    const tg = binoTgt(); if (!tg) { binoOff(tr('Бинокль: целей больше нет')); return false; }
    tgtPos(tg, BT); camera.position.copy(craft.pos); camera.position.y -= 2.5; camera.up.set(0, 1, 0); camera.lookAt(BT);
    const d = Math.max(80, BT.distanceTo(camera.position)), size = tg.S ? 14 : Math.max(40, tg.r || 70), f = clamp(2 * Math.atan(size * 3 / d) / D2R, 0.6, 30);
    if (Math.abs(f - bino.fov) / bino.fov > 0.1) bino.fov = f; // ступенями (смена поля зрения — пересчёт кадра)
    C.setFov(bino.fov);
    return true;
  }
  function binoHud() {
    if (!bino.on) return;
    const tg = binoTgt(), ws = binoWpns(), i = bino.w ? ws.indexOf(bino.w) : -1;
    const what = bino.mode === 'wpn' && bino.w ? tr('{0} — {1} из {2}', [AG[bino.w.key].short, Math.max(1, i + 1), Math.max(1, ws.length)])
      : tg ? `${tg.S ? tg.S.short : tg.name} ${(Math.hypot(tgtPos(tg, BT).x - craft.pos.x, BT.z - craft.pos.z) / 1000).toFixed(1)} ${tr('км')}` : '';
    const h = tr('<b>Бинокль</b> · {0}', [what]);
    if (binoBar._h !== h) { binoBar._h = h; binoBar.innerHTML = h; } binoBar.style.display = 'block';
  }
  const camOff = V3(), UPW = new THREE.Vector3(0, 1, 0); let camInit = false;
  // онлайн: союзники — самолёты своей команды (люди и боты), кроме своего; имя — из состава комнаты
  const alliesOf = () => (game.net ? C.raid.planes.filter((a) => !a.dead && !a.out && a.role !== 'decoy' && a.role !== 'carrier' && a !== craft && !(game.net.me && a.id === game.net.me.id)) : []);
  const allyName = (a) => { const N = game.net, p = N && N.room && (N.room.players || []).find((q) => q.id === (a.owner || a.id)); return p ? `${p.name}${p.bot ? tr(' (бот)') : ''}` : tr('союзник'); };
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
    // дым и огонь из повреждённых зон — от модели в положении этого кадра (2026-10-25: был в systems() до шага полёта — след отставал на кадр);
    // время — шагов полёта с прошлого кадра (камера идёт и на паузе, и в замедлении — по ним дым не копится)
    if (craft.dmgVis && dmgDt > 0 && !craft.dead) craft.dmgVis.update(dmgDt, craft, C.windV || (C.windV = new THREE.Vector3(3.9, 0, 1.1)));
    dmgDt = 0;
    fwdOf(craft, fw); up.set(0, 1, 0).applyQuaternion(shipQ);
    if (bino.on && !craft.dead && binoCamera(dt, t)) return; // бинокль: вид на цель или за своим оружием
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
      // вертолёт без наведения камерой — за курсом, горизонт ровный (на скорости нос опущен на ~25°: за носом камера «клюёт»)
      const am = aimOn(), hl = craft.heli && !am, d = am ? aimDir(AIMD) : hl ? AIMD.set(-Math.sin(craft.yaw), -0.18, -Math.cos(craft.yaw)).normalize() : fw;
      camPos.copy(d).multiplyScalar(-40).addScaledVector(am || hl ? UPW : up, 8.5);
      if (!camInit || camOff.distanceTo(camPos) > 300) { camOff.copy(camPos); camInit = true; } else camOff.lerp(camPos, 1 - Math.exp(-dt * (am ? 12 : 8)));
      camera.position.copy(craft.pos).add(camOff);
      camera.up.lerp(am || hl ? UPW : up, 1 - Math.exp(-dt * 6)).normalize();
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
    dmgDt = 0; // время для дыма из зон — с нового вылета (updateCamera; в «Съёмке» и при ?view= камера своя — копилось)
    const setup = C.setup;
    game.opts = opts; C.lastGame = opts.lastGame || 'air'; C.ended = false; demo = null; if (free.on) freeLook(false); binoOff();
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
    samMe = false; C.bev('', tr('взлёт'));
    C.hooks = {
      hurtPlayer: hurt, playerLaser: () => laserSpot,
      wpnEnd(w, res) {
        if (w.owner !== craft) return;
        if (res.objects.length || res.units.length) say(tr('{0}: попадание — {1}', [w.W.short, [...res.objects.map((o) => o.name), ...res.units.map((u) => u.S.short)].join(', ')]), 2.5);
        else say(`${w.W.short}: ${res.intercepted ? tr('сбита ПВО') : w.jammed ? tr('мимо — помехи навигации') : tr('мимо')}`, 1.8);
        if (opts.onWpnEnd) opts.onWpnEnd(w, res);
      },
      objectDestroyed(o) {
        const isT = game.targets.includes(o);
        game.score += Math.round(o.value * (isT ? 10 : 4) * (setup.diff === 'real' ? 1.5 : 1));
        say(tr('УНИЧТОЖЕН: {0}{1}', [o.name, isT ? tr(' — цель задания') : '']), 3);
        if (isT) C.bev('g', o.name);
        if (isT) snd.good();
        if (!game.done && !game.hunt && game.targets.length && game.targets.every((q) => q.dead)) missionDone(tr('ЗАДАЧА ВЫПОЛНЕНА — уходите за границу района или охотьтесь на ПВО'));
      },
      unitDestroyed(u) {
        // охота за ПВО: задача — уничтожить hunt.need комплексов с РЛС
        if (game.hunt && u.S.radar && ++game.hunt.n >= game.hunt.need && !game.done) missionDone(tr('ЗАДАЧА ВЫПОЛНЕНА — ПВО подавлена: уходите за границу района или продолжайте охоту'));
        game.kills++; game.score += Math.round((u.S.radar ? 400 : 200) * (setup.diff === 'real' ? 1.5 : 1)); say(tr('Уничтожен комплекс: {0}', [u.S.name]), 2.5); C.bev('g', tr('{0} уничтожен', [u.S.short || u.S.name])); snd.good(); if (opts.onUnitDestroyed) opts.onUnitDestroyed(u); },
      samLaunch(m) { if (m.target === craft) { samMe = true; C.bev('r', tr('пуск ЗУР по вам'), 'samMe', 8); } if (opts.onSamLaunch) opts.onSamLaunch(m); },
      samEnd(m, hit) { if (opts.onSamEnd) opts.onSamEnd(m, hit); },
    };
    if (cont) game.targets = C.op.targets;
    else {
      game.targets = opts.targets ? opts.targets.map((k) => S.objects.find((o) => o.key === k)).filter(Boolean) : pickTargets(S, rnd);
      const kn = setup.game === 'air' && C.diff ? C.diff.knobs('air', setup.diff) : null; // сложность: режим + скрытая подстройка (не в обучении и «Съёмке»)
      // против вертолёта (craft.heli тут ещё от прошлого вылета): только ближние комплексы и реже — «Аркада» ×0,35, «Реализм» ×0,5 (Mark 2026-10-22: было ×0,6 и весь набор эпохи)
      const vsHeli = !opts.items && (isHeli(HELI_Q) || (LOADOUTS[setup.era][setup.lo] || {}).heli);
      if (opts.defense) opts.defense(S, rnd); else placeDefense(S, city, rnd, setup.side, setup.era, game.targets, (kn ? kn.density : 1) * (vsHeli ? (setup.diff === 'real' ? 0.5 : 0.35) : 1), { ...(kn || {}), heli: vsHeli, same: setup.game !== 'air' }); // состав — случайный только в «Вылете» (уроки и «Съёмка» — как в arsenal)
      if (C.op) C.op.targets = game.targets;
    }
    C.syncUnits();
    // подвеска: тяжёлое — ближе к фюзеляжу
    rearm(); initDamage(craft); if (craft.dmgVis) craft.dmgVis.sync(craft); // новый вылет — самолёт целый
    hintSeen.clear(); nar.key = null; nar.has = nar.on = false; pop.st = 0; // подсказки к оружию — снова в каждом вылете; подскока нет
    // задача по подвеске: «охота за ПВО» — половина комплексов с РЛС (1…4), «штурмовка» — объекты города
    game.hunt = null;
    if (!opts.items && !opts.targets && loadoutRole(LOADOUTS[setup.era][setup.lo]) === 'sead') {
      const radars = S.units.filter((u) => u.S.radar).length;
      if (radars) game.hunt = { n: 0, need: Math.max(1, Math.min(4, Math.ceil(radars * 0.5))), total: radars };
    }
    const z0 = opts.photo && C.MAP === 'city' ? 9000 : 14000; // «Съёмка» в городе — ближе: с 14 км в кадре край карты
    // вертолёт — ближе к целям (9 км; на «Туманной топи» — наша площадка city.home) и низко: 120 м над землёй, 25 м/с вперёд
    const hz = city.home ? city.home.z : 9000, hx = city.home ? city.home.x : riverX(hz) + 1500;
    const sp = opts.spawn || (craft.heli ? { x: hx, y: city.groundH(hx, hz) + 120, z: hz, yaw: 0 } : { x: riverX(z0) + 1500, y: opts.photo && C.MAP === 'city' ? 1800 : 3200, z: z0, yaw: 0 });
    home.set(sp.x, city.groundH(sp.x, sp.z), sp.z); homeT = 0;
    craft.pos.set(sp.x, sp.y, sp.z); craft.yaw = sp.yaw; craft.pitch = 0; craft.roll = 0; craft.speed = craft.heli ? 25 : startV(240); thrI = 2; craft.thr = THR_STEPS[thrI]; craft.ab = false; craft.fuel = 1; fuelWarn = 0;
    craft.q = null; craft.wp = craft.wr = craft.wz = 0; craft.hp = 100; fwdOf(craft, craft.vel).multiplyScalar(craft.speed); aimSync(); aim.id = null;
    { const ha = craft.heli && craft.hm.arcade; if (padArms.l) { padArms.l.innerHTML = ico(ha ? 'sideL' : 'rollL'); padArms.r.innerHTML = ico(ha ? 'sideR' : 'rollR'); } } // крестовина: вертолёт («Аркада») — шаг вбок, самолёт — крен
    if (craft.heli) { craft.landed = false; craft.col = null; heliInit(craft); craft.col = 9.81 / tmaxAcc(craft.hm, craft.pos.y, 25); hSpd = 0.25;
      if (craft.hm.arcade && !opts.photo) setTimeout(() => say(C.IS_TOUCH ? tr('Ручка слева: вперёд — разгон, назад — тормоз, вбок — поворот · ▲▼ — высота · «газ» — ступени')
        : tr('W / S — разгон и торможение · A / D — поворот · ↑ / ↓ — высота · ← / → — вбок · мышь — прицел'), 7), 600); } // как управлять — сразу при взлёте
    document.body.classList.toggle('heli', !!craft.heli); padReset(); // фиксированные кнопки крестовины — выключены
    updLoad();
    podSet(null); pod.show = hasPod && !IS_TOUCH; pod.laserMan = null; pod.pickT = 0; pod.dir.set(0, -0.45, -1).normalize(); // окно на телефоне — по «ТВ»
    Object.assign(game, { score: 0, kills: 0, done: false, over: false, t: 0, endT: 0 });
    ship.visible = true; camMode = 0; camInit = false; snd.resetRwr(); cmReset(); rwrAckReset();
    $('hud').style.display = 'block'; document.body.classList.add('flying'); document.body.classList.toggle('aimmode', aimOn());
    layoutTouch(); layoutPod();
    if (C.op) { const left = S.units.filter((u) => !u.dead && u.S.radar).length; say(cont ? tr('Вылет 2 из 2 — удар: {0}. Комплексов с РЛС осталось: {1}', [game.targets.filter((o) => !o.dead).map((o) => o.name).join(', '), left]) : tr('Операция, вылет 1 из 2 — охота за ПВО: уничтожьте {0} комплекса с РЛС. Вторым вылетом — удар по целям города.', [game.hunt ? game.hunt.need : 1]), 7); }
    else if (!opts.noIntro) say(game.hunt ? tr('Охота за ПВО: уничтожьте {0} из {1} комплексов с РЛС (цели города — по желанию).', [game.hunt.need, game.hunt.total]) : tr('Цели: {0}. ПВО: {1}, эпоха {2}', [game.targets.map((o) => o.name).join(', '), setup.side === 'east' ? tr('советская') : tr('западная'), ERAS[setup.era - 1].short]), 6);
  }
  // подвеска: тяжёлое — ближе к фюзеляжу (обучение перезаряжает этой же функцией)
  function rearm() {
    const opts = game.opts, setup = C.setup;
    loadout.length = 0;
    // подвеска своей стороны (выбранная — чужой: первая своя); самолёт — из подвески
    const att = opts.side || (setup.side === 'east' ? 'west' : 'east');
    if (!opts.items && LOADOUTS[setup.era][setup.lo].side !== att) setup.lo = loadoutsOf(setup.era, att)[0][1];
    const L0 = opts.items ? { items: opts.items, pod: opts.pod, side: att, plane: opts.plane } : LOADOUTS[setup.era][setup.lo];
    const L = !opts.items && isHeli(HELI_Q) ? HELI_LOADOUTS.find((q) => q.plane === HELI_Q) || { ...L0, plane: HELI_Q, side: heliModel(HELI_Q).s.side } : L0;
    // вертолёт (sim/heli.js): своя лётная модель; «Реализм» — честное управление, остальное — «Аркада»
    craft.hm = isHeli(L.plane) ? heliModel(L.plane, { arcade: true }) : null; craft.heli = !!craft.hm; // вертолёт — аркадное управление и в «Реализме» (Mark 2026-10-25: «чтобы не усложнять»)
    if (craft.irBase === undefined) craft.irBase = craft.ir;
    craft.ir = craft.heli ? craft.irBase * 0.55 : craft.irBase; // вертолёт: турбовальные двигатели с экранами выхлопа — тепловым ГСН труднее
    game.used = [(L.heli || craft.heli ? 'heli:' : 'air:') + L.plane, ...L.items.map(([k]) => 'wpn:' + k)]; // прокачка: на чём летали (в «Реализме» — должно быть куплено)
    hasPod = !!L.pod; for (const [k] of L.items) wantWeapon(k); // модели подвески (оружие «Мульти-волны» и новое — грузятся по запросу)
    const order = [3, 4, 2, 5, 1, 6, 0, 7]; let oi = 0;
    // запас на борт (ошибки, промахи): «Аркада» — ещё 2 полных комплекта (пополняются сами), «Реализм» — 1 пополнение на точке вылета;
    // обучение (opts.reload) — без ограничений
    const sets = opts.reload ? Infinity : (C.MODE().rearms ?? 1); homeLeft = sets;
    // вертолёт: ПТУР — в рамы внешних пилонов (по 4, слева-справа по очереди), блоки НАР — на внутренние (heliStations)
    const hOrd = { rack: [0, 6, 1, 7, 2, 8, 3, 9], pod: stations.length > 10 ? [4, 5, 10, 11] : [4, 5] }, hi = { rack: 0, pod: 0 }; // Ми-8МТВ — 4 блока НАР
    for (const [key, n] of L.items.slice().sort((a, b) => AG[b[0]].mass - AG[a[0]].mass)) {
      const st = [], h = AG[key].kind === 'rocket' ? 'pod' : 'rack';
      for (let i = 0; i < n; i++) { if (craft.heli) { if (hi[h] < hOrd[h].length) st.push(hOrd[h][hi[h]++]); } else if (oi < 8) st.push(order[oi++]); }
      loadout.push({ key, n: st.length, n0: st.length, st, st0: st.slice(), rt: 0, res: st.length * sets });
    }
    sel = 0;
    buildShip(L.side || att, classOf(L.items, AG), L.plane || null); // модель самолёта — из подвески
    craft.cmFlare = craft.cmChaff = C.MODE().cm;
    buildPylons();
    craft.jam = Math.max(0, ...loadout.map((l) => AG[l.key].jam || 0)); // станция помех на подвеске
    if (!usable(loadout[sel])) nextWeapon();
    // свои ТТХ самолёта (sim/flight.js): модель — из подвески; режим (Аркада/Реализм) — мягкость виража
    craft.model = L.plane || (att === 'east' ? 'su30' : 'f16'); craft.cmSide = att; // ключ модели — точки ловушек (sim/cm.js)
    craft.fm = craft.heli ? null : flightModel(L.plane || (att === 'east' ? 'su30' : 'f16'), { ind: (C.MODE() || {}).ind });
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
    craft.dead = true; C.player = craft; spec.why = tr('Ждём вылета'); spec.init = false;
    buildShip(N.battle.sideAir); ship.visible = false; // модель — до вылета (связку и подвеску даст spawn)
    C.hooks = {
      playerLaser: () => laserSpot,
      wpnEnd(w, res) { if (w.owner === craft) say(`${w.W.short}: ${res.intercepted ? tr('сбита ПВО') : tr('разрыв')}`, 1.8); },
      objectDestroyed(o) { say(tr('УНИЧТОЖЕН: {0}{1}', [o.name, game.targets.includes(o) ? tr(' — цель задания') : '']), 3); if (game.targets.includes(o)) snd.good(); },
      unitDestroyed(u) { say(tr('Уничтожен комплекс: {0}', [u.S.name]), 2.5); snd.good(); },
    };
    game.targets = N.battle.targets.map((id) => C.S.objects.find((o) => o.id === id)).filter(Boolean);
    Object.assign(game, { score: 0, kills: 0, done: false, over: false, t: 0, endT: 0 });
    $('hud').style.display = 'block'; document.body.classList.add('flying'); document.body.classList.toggle('aimmode', aimOn()); layoutTouch(); layoutPod(); snd.resetRwr(); cmReset(); rwrAckReset();
  }
  function netSpawn(m) {
    const o = game.opts, L = { items: m.load.map((l) => [l.key, l.n]), plane: m.plane };
    o.items = L.items; o.plane = m.plane; o.pod = !!(m.choice !== undefined && LOADOUTS[game.net.battle.era][m.choice] && LOADOUTS[game.net.battle.era][m.choice].pod);
    rearm(); if (!m.back || !craft.dz) { initDamage(craft); if (craft.dmgVis) craft.dmgVis.sync(craft); }
    for (const l of loadout) { const s = m.load.find((q) => q.key === l.key); if (s && s.rs !== undefined) l.rs = s.rs; } // начатый блок НАР (ИИ-двойник давал залпы) — как у сервера
    craft.cmFlare = m.cm.flare; craft.cmChaff = m.cm.chaff;
    const [x, y, z, yaw] = m.s;
    craft.dead = false; craft.pos.set(x, y, z); craft.yaw = yaw; craft.pitch = 0; craft.roll = 0; craft.speed = m.back ? (m.v || 240) : startV(m.v || 240); thrI = 2; craft.thr = THR_STEPS[thrI]; craft.ab = false; craft.fuel = 1; fuelWarn = 0; zoneReset();
    craft.q = null; craft.wp = craft.wr = craft.wz = 0; craft.hp = m.hp ?? 100; fwdOf(craft, craft.vel).multiplyScalar(craft.speed); aimSync(); aim.id = null;
    podSet(null); pod.show = hasPod && !IS_TOUCH; pod.laserMan = null; pod.pickT = 0; pod.dir.set(0, -0.45, -1).normalize();
    ship.visible = true; camMode = 0; camInit = false; game.over = false;
    if (m.back) { say(tr('Связь восстановлена — управление снова у вас'), 3); snd.good(); return; } // самолёт вёл ИИ, пока не было связи
    say(tr('Вылет! Цели: {0}. Вылетов в запасе: {1}', [game.targets.map((q) => q.name).join(', '), m.lives]), 5);
  }
  // связь пропала — самолёт ведёт ИИ (без взрыва: он летит дальше); вернётся связь — управление снова у игрока (netSpawn back)
  function netAI() {
    if (craft.dead) return;
    craft.dead = true; ship.visible = false;
    spec.why = tr('Связь пропала — самолёт ведёт ИИ. Управление вернётся, как только связь восстановится'); spec.t = 0; spec.init = false; say(spec.why, 5);
  }
  function netHit(hp, by, pk) { if (craft.dead) return; const hurtNow = hp < craft.hp; craft.hp = hp; if (hurtNow && by) { flashT = 0.35; snd.hit(); } if (pk) dmgEvents(dmgUnpack(craft, pk), by); else if (by) say(tr('Попадание: {0}', [by]), 1.5); }
  function netDown(why) {
    if (craft.dead) return;
    craft.dead = true; craft.hp = 0; C.fx.explosion(craft.pos, 30, 'plane'); snd.planeKill(0);
    spec.why = why || tr('Самолёт сбит'); spec.t = 0; spec.init = false; say(spec.why, 4);
  }
  // волна кончилась, а самолёт цел: сервер его уже убрал (endWave) — у игрока он тоже уходит на базу, камера облетает район,
  // пока идут итоги и выбор связки (Mark 2026-10-26: «полёт продолжается во время выбора нового юнита»)
  function netWaveOut() {
    if (craft.dead) return;
    binoOff(); craft.dead = true; ship.visible = false; free.on = false; $('tLook').classList.remove('on'); pod.show = false;
    spec.why = tr('Волна окончена — самолёт вернулся на базу'); spec.t = 0; spec.init = false;
  }
  function stop() {
    game.net = null; free.on = false; free.id = null; $("tLook").classList.remove("on"); zn.Z = null; zoneG.visible = false;
    ship.visible = false; $('hud').style.display = 'none'; $('podBox').style.display = 'none'; document.body.classList.remove('flying');
    mapOn = false; mapC.style.display = 'none'; $('warn').style.display = 'none'; keys.clear(); laserSpot = null; document.body.classList.remove('spect');
  }
  // задача выполнена: самолёт уходит за границу района (≈ минута), вертолёту до неё 3–4 минуты над пустым районом — вылет кончается сам
  // через HELI_END с (Mark 2026-10-24: «после победы над всеми целями бой не заканчивается, и по сути ничего не происходит»)
  const HELI_END = 10;
  function missionDone(msg) {
    game.done = true;
    if (craft.heli && !game.net && !game.opts.noEnd) { game.endT = HELI_END; say(tr('ЗАДАЧА ВЫПОЛНЕНА — вылет завершится через {0} с', [HELI_END]), 5); }
    else say(msg, 5);
  }
  function finish(why, ok) {
    if (game.over) return; game.over = true;
    if (game.opts.noEnd) return;
    C.bev(craft.dead ? 'r' : '', craft.dead ? why : game.done ? (craft.heli ? tr('посадка') : tr('выход из района')) : tr('вылет окончен')); // последняя метка ленты
    const dead = game.targets.filter((o) => o.dead).length, real = C.setup.diff === 'real';
    // прокачка: что сделано за вылет → airdef-solo (длительность меряет сервер); цели — по одной, комплексы, вернулся ли
    const claim = () => C.progress && C.progress.runClaim({ targets: Array(dead).fill(1), sams: game.kills, back: !craft.dead, win: !!game.done && !craft.dead }, game.used);
    if (C.op && C.op.stage === 1) { // операция: итоги первого вылета — дальше удар
      C.op.s1 = { score: game.score, kills: game.kills, hunt: game.hunt, alive: !craft.dead }; C.op.next = true;
      const h = game.hunt || { n: 0, need: 0 };
      setTimeout(claim, 950);
      C.showEnd({ title: tr('Вылет 1 из 2 завершён'), reason: why, win: craft.dead ? false : game.done ? true : null, again: tr('Вылет 2: удар →'),
        stats: [[`${Math.min(h.n, h.need)}/${h.need}`, tr('РЛС уничтожено')], [game.kills, tr('комплексов ПВО')], [game.score, tr('очков')], [craft.dead ? tr('сбит') : tr('вернулся'), tr('самолёт')]],
        note: tr('Уничтоженное остаётся уничтоженным; уцелевшие комплексы перезарядятся и снова включат РЛС. {0}', [h.n >= h.need ? tr('ПВО подавлена — удару будет легче.') : tr('ПВО подавлена не полностью — удар будет опаснее.')]) });
      return;
    }
    if (C.op && C.op.stage === 2) { // операция: общий итог
      const s1 = C.op.s1 || { score: 0, kills: 0, alive: false, hunt: null }, bonus = s1.alive && !craft.dead ? 300 : 0, total = s1.score + game.score + bonus;
      C.showEnd({ title: tr('Операция завершена'), reason: why, win: game.done ? true : craft.dead ? false : null, again: tr('Новая операция'),
        stats: [[s1.hunt ? `${Math.min(s1.hunt.n, s1.hunt.need)}/${s1.hunt.need}` : '—', tr('РЛС (вылет 1)')], [`${dead}/${game.targets.length}`, tr('целей (вылет 2)')], [s1.kills + game.kills, tr('комплексов ПВО')], [total, tr('очков')]],
        note: tr('Очки: {0} + {1}{2}. {3}, эпоха {4}.', [s1.score, game.score, bonus ? tr(' + {0} за два возвращения', [bonus]) : '', real ? tr('Реализм') : tr('Аркада'), ERAS[C.setup.era - 1].short]) });
      C.op = null; C.menu.record('air', total); setTimeout(claim, 950); return;
    }
    C.showEnd({ title: craft.dead ? tr('Самолёт потерян') : tr('Вылет завершён'), reason: why, win: craft.dead ? false : game.done ? true : null,
      stats: [game.hunt ? [`${Math.min(game.hunt.n, game.hunt.need)}/${game.hunt.need}`, tr('РЛС уничтожено')] : [`${dead}/${game.targets.length}`, tr('целей уничтожено')], [game.kills, tr('комплексов ПВО')], [game.score, tr('очков')], [real ? tr('Реализм') : tr('Аркада'), tr('эпоха {0}', [ERAS[C.setup.era - 1].short])]],
      note: game.done ? tr('Задание выполнено.') : '' });
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
    for (const l of loadout) { l.rs = undefined; for (const st of l.st0) if (!l.st.includes(st)) { l.st.push(st); l.n++; const m = pylonMeshes.find((q) => q.userData.st === st); if (m) m.visible = !shipInternal; } } // и блок НАР — полный
    craft.cmFlare = craft.cmChaff = C.MODE().cm;
  };
  const zoneNeed = () => ({ fuel: zn.fuel > 0 && (craft.fuel ?? 1) < 0.9, ammo: zn.ammo > 0 && (loadout.some((l) => AG[l.key].kind !== 'ecm' && (l.n < l.n0 || (l.rs !== undefined && l.rs < Math.ceil(AG[l.key].load / AG[l.key].salvo)))) || cmLow(0.5) || craft.cmChaff < C.MODE().cm * 0.5) });
  const zoneSay = (f, a) => { say(tr('Пополнение: {0} · осталось: топливо {1}, БК {2}', [[f ? tr('топливо') : '', a ? tr('боекомплект и ловушки') : ''].filter(Boolean).join(', '), zn.fuel, zn.ammo]), 3.5); snd.good(); };
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
    const hx = C.hx, lab = zn.it.zT > 0 ? tr('пополнение {0} с', [Math.ceil(ZONE.STAY - zn.it.zT)]) : tr('{0} км{1}', [(d / 1000).toFixed(1), left ? tr(' · {0} с', [left]) : '']);
    const p = C.proj(fw.set(zx, city.groundH(zx, zz) + 300, zz));
    if (p) {
      hx.font = '700 11px "Golos Text", -apple-system, Segoe UI, sans-serif'; hx.textAlign = 'center'; hx.shadowColor = 'rgba(0,0,0,.85)'; hx.shadowBlur = 4;
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
    hx.font = '700 11px "Golos Text", -apple-system, Segoe UI, sans-serif'; hx.textAlign = 'center'; hx.shadowColor = 'rgba(0,0,0,.85)'; hx.shadowBlur = 4; hx.fillStyle = col;
    hx.fillText(label, ax - Math.cos(ang) * 30, ay - Math.sin(ang) * 22 + 4); hx.shadowBlur = 0;
  }
  // кнопка «ПУСК» (телефон; сброс бомб и пуск ракет): готово сейчас × до следующей единицы (с), заливка по часовой — ход перезарядки; пусто и пополнять
  // нечем — кнопка полупрозрачная. Перезарядка сама — только в «Аркаде» (l.rt); в «Реализме» и онлайне — число
  let fbT = 0, fbS = '';
  function fireBtn(dt) {
    if (!IS_TOUCH || (fbT -= dt) > 0) return; fbT = 0.12;
    const b = $('tFire'), l = loadout[sel]; if (!b) return;
    const W = l && AG[l.key], reloading = !!(l && l.rt > 0 && l.n < l.n0), p = reloading ? Math.max(0, Math.min(1, 1 - l.rt / relT(l))) : l && l.n > 0 ? 1 : 0;
    const cnt = l && W.kind === 'rocket' ? rocketsOf(l) : l && l.n; // НАР — ракет, а не блоков
    const txt = !l ? '' : reloading ? tr('{0}×{1}с', [cnt, Math.ceil(l.rt)]) : `×${cnt}`, key = `${txt}|${Math.round(p * 60)}|${W ? W.short : ''}`;
    if (key === fbS) return; fbS = key;
    b.innerHTML = `<span>${ico('fire')}<small>${W ? W.short : ''}</small><em>${txt}</em></span>`; b.title = tr('Пуск / сброс');
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
        say(tr('{0}: пополнено {1}/{2}', [AG[l.key].short, l.n, l.n0]), 1.6); snd.click();
      }
      return;
    }
    const dh = Math.hypot(craft.pos.x - home.x, craft.pos.z - home.z);
    const near = craft.heli ? craft.landed && dh < 800 : dh < 2500 && craft.pos.y - city.groundH(craft.pos.x, craft.pos.z) < 1500; // вертолёт — сесть у точки вылета
    const need = homeLeft > 0 && (needsRearm() || cmLow(0.5) || craft.fuel < 0.6);
    if (!near || !need) { homeT = 0; return; }
    homeT += dt;
    if (homeT < 12) return;
    for (const l of loadout) { while (l.n < l.n0 && l.res > 0) reloadOne(l); l.rt = 0; } // запас кончился — сколько есть (иначе цикл не кончится)
    craft.cmFlare = craft.cmChaff = C.MODE().cm; craft.fuel = 1; fuelWarn = 0; homeT = 0; homeLeft--;
    say(tr('Пополнение: подвеска, ловушки и топливо{0}', [Number.isFinite(homeLeft) ? tr(' · осталось пополнений: {0}', [homeLeft]) : '']), 3); snd.good();
  }
  // повреждения (течь бака, пожар) и топливо — у самолёта и вертолёта одинаково
  let dmgDt = 0; // время полёта для дыма из зон (updateCamera)
  function systems(dt) {
    dmgDt += dt;
    // повреждения: течь бака, пожар ест корпус (онлайн — урон считает сервер)
    if (craft.dz && !game.opts.invuln) {
      if (craft.leak && craft.fuel > 0) craft.fuel = Math.max(0, craft.fuel - craft.leak * dt);
      const br = burnRate(craft); if (br && !game.net) { craft.hp -= br * dt; if (craft.hp <= 0) { craft.hp = 0; craft.dead = true; C.fx.explosion(craft.pos, 30, 'plane'); snd.planeKill(0); finish(craft.det.tailAll ? tr('Потеря управления: хвост разрушен') : tr('Сгорел: пожар на борту'), false); } }
    }
    // топливо: расход по газу, форсаж — втрое; кончилось — двигатель встал, самолёт планирует (в обучении не тратится)
    if (!game.opts.invuln) {
      if (craft.fuel > 0) craft.fuel = Math.max(0, craft.fuel - (0.35 + 0.65 * craft.thr) * (craft.ab ? 3 : 1) / (C.MODE().fuelS || 240) * (craft.heli ? 1 / 3 : 1) * dt); // вертолёт держится втрое дольше (Mark 2026-10-21: не успевал долететь и навестись)
      if (craft.fuel < 0.2 && fuelWarn < 1) { fuelWarn = 1; say(tr('Мало топлива — 20 %'), 3); snd.alarm(); }
      if (craft.fuel <= 0) { craft.thr = 0; craft.ab = false; if (fuelWarn < 2) { fuelWarn = 2; say(tr('Топливо кончилось — двигатель встал, планируйте'), 4); snd.alarm(); } }
    }
    if (craft.ab && !abWas) snd.afterburner(); abWas = craft.ab;
  }
  // автопилот «Съёмки» (demo.photo, Mark 2026-10-26: «улетает за карту и не возвращается», «всё ещё врезается в землю и препятствия»).
  // Курс: заход на точку demo.pt → после прохода прямо ещё 2,2–3,2 км и разворот на неё же (самолёт остаётся в районе цели); оружие в воздухе —
  // круг вокруг точки (цель сбоку, контейнер держит подсвет, самолёт не уходит за оружием); у края карты (< 3,5 км) — к центру.
  // Высота: лучи вперёд по курсу и по желаемому повороту (±11°) на ~12 с полёта — крыши и рельеф + запас clr; нужный подъём считается как угол
  // до самой опасной точки (с учётом того, что на выводе из снижения самолёт ещё теряет vy²/78 м), нос не ниже этого угла — выход из пикирования заранее
  const PHF = V3();
  function photoPilot(dt) {
    const sp = Math.max(craft.speed, 100), p = craft.pos, pt = demo.pt, f = PHF, ve = craft.vel;
    const hx = Math.hypot(ve.x, ve.z) > 40 ? ve.x : fwdOf(craft, f).x, hz = Math.hypot(ve.x, ve.z) > 40 ? ve.z : f.z, hl = Math.hypot(hx, hz) || 1, hdx = hx / hl, hdz = hz / hl;
    let vx = pt.x - p.x, vz = pt.z - p.z; const d = Math.hypot(vx, vz) || 1; vx /= d; vz /= d;
    const edge = CITY.HALF - Math.max(Math.abs(p.x), Math.abs(p.z)), wfly = C.S.wpns.some((w) => w.owner === craft && !w.dead);
    const rt = clamp(sp * sp / (9.81 * Math.min(5, (craft.fm ? craft.fm.nMax(craft, sp) : 6) * 0.6)), 1500, 3500); // радиус виража
    let dx = vx, dz = vz;
    if (edge < 3500) { const r = Math.hypot(p.x, p.z) || 1; dx = -p.x / r; dz = -p.z / r; demo.ph = 'in'; demo.orb = 0; } // у края — к центру
    else if (wfly) { // круг вокруг точки: касательная + поправка по радиусу
      const rx = -vx, rz = -vz; // от точки к самолёту
      if (!demo.orb) demo.orb = (-rz * hdx + rx * hdz) >= 0 ? 1 : -1;
      const k = clamp((d - rt) / rt, -1, 1) * 1.2; dx = -rz * demo.orb - rx * k; dz = rx * demo.orb - rz * k; demo.ph = 'in';
    } else {
      demo.orb = 0;
      if (demo.ph === 'out') { dx = hdx; dz = hdz; demo.phT = (demo.phT || 0) + dt; if (d > (demo.outD || 2800) || demo.phT > 30) demo.ph = 'in'; }
      else if (d < 450 || (vx * hdx + vz * hdz < -0.2 && d < 2500)) { demo.ph = 'out'; demo.phT = 0; demo.outD = clamp(sp * 10, 2200, 3200); }
    }
    const dl = Math.hypot(dx, dz) || 1; dx /= dl; dz /= dl;
    // высота: рельеф и крыши по лучам
    const alt = demo.alt, clr = Math.max(90, alt * 0.35), look = clamp(sp * 12, 1800, 4800), vy = ve.y, yEff = p.y - (vy < 0 ? vy * vy / 78 : 0);
    let need = -1, gnd = city.groundH(p.x, p.z);
    for (const [ux, uz] of [[hdx, hdz], [dx, dz]]) for (const off of [-0.2, 0, 0.2]) {
      const c = Math.cos(off), sn = Math.sin(off), rx = ux * c - uz * sn, rz = ux * sn + uz * c;
      for (let s = 60; s <= look; s += s < 600 ? 60 : 120) {
        const x = p.x + rx * s, z = p.z + rz * s, h = Math.max(city.groundH(x, z), city.topAt(x, z)) + clr;
        need = Math.max(need, (h - yEff) / s);
        if (s <= 1500) gnd = Math.max(gnd, city.groundH(x, z));
      }
    }
    const here = Math.max(city.groundH(p.x, p.z), city.topAt(p.x, p.z));
    if (p.y - here < clr * 0.6) need = Math.max(need, 0.12); // совсем низко — набирать при любом раскладе
    const wantY = demo.ph === 'in' && !wfly && edge >= 3500 ? Math.max(city.groundH(pt.x, pt.z), gnd * 0.5 + city.groundH(pt.x, pt.z) * 0.5) + alt : gnd + alt;
    const pw = clamp(Math.atan2(wantY - p.y, clamp(d, 800, 4000)), -0.3, 0.3), pl = need > 0 ? Math.atan(need) + 0.04 : -9;
    // курс: не больше 63° от текущего за раз (иначе на развороте «через плечо» самолёт валится в пикирование), а чтобы виражом не терять высоту
    // (крен ~60° — вертикальная часть подъёмной силы вдвое меньше), нос цели — выше пропорционально повороту
    const her = Math.atan2(-dx, -dz) - craft.yaw, herr = Math.atan2(Math.sin(her), Math.cos(her));
    aim.yaw = craft.yaw + clamp(herr, -1.1, 1.1); aim.pitch = clamp(Math.max(pw, pl) + 0.4 * Math.min(1, Math.abs(herr) / 1.1), -0.3, 0.9);
    if (pl > 0.35 && p.y - here < clr) { aim.yaw = Math.atan2(-hdx, -hdz); } // выход вплотную к земле — крылья в горизонт, прямо
    const o = aimSteer(); return o;
  }
  // самолёт: ручка / крестовина / наведение камерой → pilotStep; ниже крыш и земли — авария
  function planeFly(dt) {
    const keysOf = (...k) => k.some((c) => keys.has(c));
    let rx = 0, ry = 0;
    if (keysOf('KeyA', 'ArrowLeft')) rx -= 1; if (keysOf('KeyD', 'ArrowRight')) rx += 1;
    // вверх — нос вверх (инверсия «как в авиасимуляторах» — в настройках); крестовина — тангаж и крен кнопками, слабее ручки
    const inv = C.sens.invert ? -1 : 1;
    if (keys.has('ArrowUp')) ry += inv; if (keys.has('ArrowDown')) ry -= inv;
    if (pad.x || pad.y) { rx += pad.x * C.sens.padK; ry += pad.y * C.sens.padK * inv; }
    if (craft.fuel > 0) craft.thr = THR_STEPS[thrI];
    const tt = craft.fuel <= 0 ? tr('двиг.') + ico('close', 'ii') : thrI === AB_I ? (craft.fm && !(craft.fm.s.ab > 0) ? tr('макс.') : tr('форсаж')) : `${Math.round(craft.thr * 100)}%`, tb = $('tThr');
    if (tb._t !== tt) { tb._t = tt; tb.innerHTML = `${ico('throttle')}<small>${tt}</small>`; tb.title = tr('Газ'); tb.classList.toggle('ab', thrI === AB_I); } // спидометр и газ
    if (stick.id !== null) { rx += stick.x; ry -= stick.y * inv; }
    let rz = 0;
    if (bino.on && (rx || ry || stick.id !== null || aim.id != null || free.on)) binoOff(); // взялся за управление — обычный вид, самолёт твой
    if (bino.on && !demo) { // бинокль: автопилот — курс и высота на момент включения, не ниже рельефа впереди + 300 м; у границы района — к центру
      if (Math.max(Math.abs(craft.pos.x), Math.abs(craft.pos.z)) > CITY.HALF - 2500) bino.ap.yaw = Math.atan2(craft.pos.x, craft.pos.z);
      const look = clamp(craft.speed * 14, 1500, 4500), sy = -Math.sin(bino.ap.yaw), cy = -Math.cos(bino.ap.yaw); let floor = -1e9, near = -1e9;
      for (let d = 0; d <= look; d += 120) { const x = craft.pos.x + sy * d, z = craft.pos.z + cy * d, h = Math.max(city.groundH(x, z), city.topAt(x, z)) + 300; floor = Math.max(floor, h); if (d < look * 0.4) near = Math.max(near, h); }
      aim.yaw = bino.ap.yaw; aim.pitch = clamp((Math.max(bino.ap.alt, floor) - craft.pos.y) / 1500, near > craft.pos.y - 40 ? -0.05 : -0.25, near > craft.pos.y ? 0.6 : 0.25);
      const o = aimSteer(); rx = o[0]; ry = o[1]; rz = o[2];
    } else if (demo && demo.photo) { const o = photoPilot(dt); rx = o[0]; ry = o[1]; rz = o[2]; }
    else if (demo) { // показ в обучении: автопилот на высоте demo.alt к точке demo.pt, оружие применяет «АВТО»
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
    systems(dt);
    if (!aimOn()) { rx *= C.sens.stick; ry *= C.sens.stick; }
    pilotStep(craft, rx, ry, dt, craft.pos.y > CITY.CEIL ? 0.3 : 0, 0.8, rz);
    const top = Math.max(city.topAt(craft.pos.x, craft.pos.z), CITY.WATER_Y);
    if (craft.pos.y < top + 1.5) {
      if (game.opts.invuln) { craft.pos.y = top + 150; craft.pitch = 0.2; craft.q = null; say(tr('Учебный вылет: высоту вернули — не прижимайтесь так низко'), 2.5); }
      else if (game.net) { game.net.selfCrash(); netDown(city.bldAt(craft.pos.x, craft.pos.z) > 0 ? tr('Врезались в здание') : tr('Столкновение с землёй')); }
      else { craft.dead = true; C.fx.explosion(craft.pos, 25, 'ground'); snd.explosion(0, 3); finish(city.bldAt(craft.pos.x, craft.pos.z) > 0 ? tr('Врезались в здание') : tr('Столкновение с землёй'), false); }
    }
  }
  // вертолёт (sim/heli.js): ручка — палец на левой половине экрана / WASD (вперёд — скорость, вбок — смещение, на скорости —
  // вираж), правая половина — взгляд (нос за ним), ▲▼ крестовины / ↑↓ / Shift–Ctrl — высота, ⟲⟳ / ←→ — педали. Касание земли:
  // мягкое — посадка (у точки вылета — пополнение), жёсткое — урон, сильное — авария; вода — авария
  const HU = { cx: 0, cy: 0, col: 0, yaw: 0, yawTo: undefined, pitchTo: undefined };
  function heliCrash(why) {
    if (game.net) { game.net.selfCrash(); netDown(why); return; }
    craft.dead = true; C.fx.explosion(craft.pos, 22, 'ground'); snd.explosion(0, 3); finish(why, false);
  }
  // «Аркада» (Mark 2026-10-21 — «как набирать скорость?»; одинаково на телефоне и ПК): заданная скорость держится сама — ручка или W/S
  // вперёд/назад плавно меняют её, кнопка «газ» листает ступени, A/D и ручка вбок — поворот (на скорости — вираж с креном), ↑/↓ и кнопки — высота,
  // ←/→ и кнопки вбок — шаг в сторону. «Реализм» — как раньше: ручка — наклон диска, педали, шаг винта
  function heliFly(dt) {
    const k = (...c) => (c.some((q) => keys.has(q)) ? 1 : 0), st = stick.id !== null, arc = craft.hm.arcade;
    const vh = Math.hypot(craft.vel.x, craft.vel.z), fast = clamp((vh - 15) / 20, 0, 1);
    HU.col = clamp(k('ArrowUp', 'ShiftLeft', 'ShiftRight') - k('ArrowDown', 'ControlLeft', 'ControlRight') + pad.y, -1, 1);
    if (arc) {
      const acc = k('KeyW') - k('KeyS') - (st ? stick.y : 0); // ручка или W/S: вперёд — разгон, назад — торможение; отпустили — скорость держится
      if (acc) hSpd = clamp(hSpd + clamp(acc, -1, 1) * 0.45 * dt, H_SPD[0], 1);
      const turn = clamp(k('KeyD') - k('KeyA') + (st ? stick.x : 0), -1, 1), side = clamp(k('ArrowRight') - k('ArrowLeft') + pad.x, -1, 1);
      HU.cy = hSpd; HU.yaw = turn; HU.cx = clamp(turn * fast + side * (1 - fast), -1, 1);
    } else {
      HU.cx = clamp(k('KeyD') - k('KeyA') + (st ? stick.x : 0), -1, 1);
      HU.cy = clamp(k('KeyW') - k('KeyS') - (st ? stick.y : 0), -1, 1);
      HU.yaw = clamp(k('ArrowRight') - k('ArrowLeft') + pad.x, -1, 1); HU.stab = true; // мягкая стабилизация (Mark 2026-10-21)
    }
    if (aimOn() && HU.yaw) aim.yaw = craft.yaw; // поворот — взгляд за носом
    HU.yawTo = aimOn() && !HU.yaw ? aim.yaw : undefined; HU.pitchTo = aimOn() ? aim.pitch : undefined;
    // «Аркада» + НАР: цель впереди — нос сам на неё (курс и наклон: угол на цель + поправка по промаху круга); повернули сами — помощь отпускает
    popStep(dt); { const pb = $('tPop'); if (pb && pb._on !== !!pop.st) { pb._on = !!pop.st; pb.classList.toggle('on', pb._on); } } // подскок «Аркады» — поверх ручки (висение, высота, нос на цель)
    // курс на цель — всегда; наклон — только почти на висении (заданная скорость ≈ 0 и < 25 м/с): на крейсерском полёте к цели держать
    // наклон прицела нельзя — вертолёт перестаёт разгоняться и не подлетает (урок «Управление» стоял в 4 км от цели)
    // помощь отпускает: ручка вбок (не просто палец на ней) или взгляд камерой ушёл от цели больше чем на 12° (иначе нос «прилипал» к цели)
    const lw = curW(), wrapA = (v) => Math.atan2(Math.sin(v), Math.cos(v)), brgT = Math.atan2(-(nar.pt.x - craft.pos.x), -(nar.pt.z - craft.pos.z));
    const narW = arc && nar.has && Math.abs(HU.yaw) < 0.2 && !(aimOn() && Math.abs(wrapA(aim.yaw - brgT)) > 0.21) && !!lw && AG[lw.key].kind === 'rocket' && usable(lw);
    nar.slow = Math.abs(HU.cy) < 0.12 && vh < 25; nar.on = narW && nar.slow;
    // подсказка к оружию — при первом переключении на него в вылете (первое оружие боя — без неё: Mark 2026-10-28, большая подсказка
    // в начале боя мешает); в уроках оружие объясняет карточка урока
    if (lw && !hintSeen.has(lw.key)) { if (!hintSeen.size) hintSeen.add(lw.key); else if (!craft.landed && game.opts.lastGame !== 'training') { hintSeen.add(lw.key); const h = weaponHint(lw.key); if (h) C.say(h, 8); } }
    if (narW) {
      const dx = nar.pt.x - craft.pos.x, dz = nar.pt.z - craft.pos.z;
      HU.yawTo = Math.atan2(-dx, -dz); if (nar.on) HU.pitchTo = nar.pitch; // наклон — подобран по расчёту точки падения (updateLar)
    }
    HU.pitchHold = nar.on; nar.assist = narW;
    const tb = $('tThr'), tt = craft.fuel <= 0 ? tr('двиг.') + ico('close', 'ii') : arc ? (hSpd < -0.01 ? tr('назад') : hSpd < 0.02 ? tr('висение') : tr('{0} км/ч', [Math.round(hSpd * craft.hm.vmax * 3.6 / 10) * 10])) : tr('шаг {0}%', [Math.round((craft.col || 0) * 100)]);
    if (tb._t !== tt) { tb._t = tt; tb.innerHTML = `${ico('throttle')}<small>${tt}</small>`; tb.title = arc ? tr('Скорость: ступени (W/S)') : tr('Шаг винта'); tb.classList.remove('ab'); }
    craft.ab = false; systems(dt);
    const top = Math.max(city.topAt(craft.pos.x, craft.pos.z), city.waterAt ? city.autumn.WY : CITY.WATER_Y); // болото «Туманной топи» — своя отметка воды
    const tk = craft.thrK; if (craft.fuel <= 0) craft.thrK = (tk ?? 1) * 0.62; // двигатели встали — авторотация: снижение, у земли — подрыв шага
    // «Аркада»: самая высокая земля на пути за 0,8 / 1,6 / 2,5 с — лётная модель сама наберёт высоту перед склоном (sim/heli.js climb)
    const arcH = !!craft.hm.arcade; let gA;
    if (arcH) { const wy = city.waterAt ? city.autumn.WY : CITY.WATER_Y; gA = top; for (const t of [0.8, 1.6, 2.5]) { const x = craft.pos.x + craft.vel.x * t, z = craft.pos.z + craft.vel.z * t; gA = Math.max(gA, city.topAt(x, z), wy); } }
    const ev = heliStep(craft, craft.hm, HU, dt, { groundY: top, gear: craft.gearH || 2, groundAhead: gA });
    craft.thrK = tk; craft.thr = craft.landed ? 0.3 : craft.col; // винт на земле — малый шаг
    if (ev === 'lift') say(tr('Взлёт'), 1);
    if (!ev || ev === 'lift') return;
    const water = city.waterAt ? city.waterAt(craft.pos.x, craft.pos.z) : city.groundH(craft.pos.x, craft.pos.z) < CITY.WATER_Y - 0.5 && top <= CITY.WATER_Y + 0.1;
    const v = water ? 'crash' : touchVerdict(ev);
    if (game.opts.invuln && v !== 'land') { craft.pos.y = top + 60; craft.vel.set(0, 0, 0); say(tr('Учебный вылет: высоту вернули — садитесь мягче'), 2.5); return; }
    // «Аркада»: касание вскользь (снижение < 3,5 м/с, наклон < 26°, скорость < 30 м/с) — не авария: отскок, торможение, урон (2026-10-22)
    if (v === 'crash' && arcH && !water && !(city.bldAt(craft.pos.x, craft.pos.z) > 0) && ev.vy < 3.5 && ev.tilt < 0.45 && ev.vh < 30) {
      craft.vel.x *= 0.6; craft.vel.z *= 0.6; craft.vel.y = 2.5; craft.pos.y = top + (craft.gearH || 2) + 0.3;
      say(tr('Задели землю — повреждения'), 2.5); hurt(10, tr('удар о землю')); return;
    }
    if (v === 'crash') { heliCrash(water ? tr('Упали в воду') : city.bldAt(craft.pos.x, craft.pos.z) > 0 ? tr('Разбились о здание') : tr('Удар о землю — {0} м/с', [Math.round(ev.touch)])); return; }
    heliLand(craft);
    if (v === 'hard') { say(tr('Жёсткая посадка — повреждения'), 2.5); hurt(18, tr('жёсткая посадка')); }
    else say(Math.hypot(craft.pos.x - home.x, craft.pos.z - home.z) < 800 ? tr('Посадка на площадке — пополнение') : tr('Посадка'), 1.6);
  }
  function update(dt) {
    game.t += dt;
    reloadStep(dt); zoneUpdate(dt); cmStep(dt);
    if (!craft.dead && !game.over) {
      if (craft.heli) heliFly(dt);
      else planeFly(dt);
      if (Math.abs(craft.pos.x) > CITY.HALF - 300 || Math.abs(craft.pos.z) > CITY.HALF - 300) {
        if (game.net && !loadout.some((l) => l.n > 0 && AG[l.key].kind !== 'ecm')) { game.net.send({ t: 'rtb' }); craft.dead = true; spec.why = tr('Вылет завершён — оружие израсходовано'); spec.t = 0; say(spec.why, 4); }
        else if (game.done && !game.opts.noEnd) finish(tr('Вышли из района целей'), true);
        else { craft.yaw += Math.PI; craft.q = null; if (craft.heli) { craft.vel.x *= -1; craft.vel.z *= -1; } craft.pos.x = clamp(craft.pos.x, -CITY.HALF + 400, CITY.HALF - 400); craft.pos.z = clamp(craft.pos.z, -CITY.HALF + 400, CITY.HALF - 400); say(tr('Граница района — разворот'), 2); }
      }
      if (game.endT > 0) { // отсчёт — каждую секунду (подсказки к оружию иначе перекрывают надпись)
        const s0 = Math.ceil(game.endT); game.endT -= dt;
        if (game.endT <= 0) finish(tr('Задание выполнено — вертолёт уходит на площадку'), true);
        else if (Math.ceil(game.endT) !== s0) say(tr('ЗАДАЧА ВЫПОЛНЕНА — вылет завершится через {0} с', [Math.ceil(game.endT)]), 1.5);
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
    if (rwa.on && (craft.dead || game.over)) rwrAckReset();
    flames.update(craft.thr, craft.ab);
    if (shipModel) spinProps(shipModel, dt, craft.thr); // винты (Ту-95; у вертолёта thr — шаг несущего)
    if (game.opts.photo && !game.opts.phud) return; // «Съёмка»: без прицелов и панелей — свой интерфейс (photo.js); phud — запись ролика с интерфейсом боя (shot.hud)
    if (game.over && craft.dead) return;
    const sp = !!(game.net && craft.dead); if (sp !== document.body.classList.contains('spect')) document.body.classList.toggle('spect', sp); // «КАМ.» — следующий союзник
    if (sp) { // онлайн: наблюдение до нового вылета
      const hx = C.hx; hx.textAlign = 'center'; hx.font = '700 15px "Golos Text", -apple-system, Segoe UI, sans-serif'; hx.fillStyle = '#fde68a'; hx.shadowColor = 'rgba(0,0,0,.8)'; hx.shadowBlur = 4;
      hx.fillText(spec.why, C.VW / 2, C.VH * 0.2); hx.font = '600 12px "Golos Text", -apple-system, Segoe UI, sans-serif'; hx.fillStyle = '#fff';
      hx.fillText(game.net.lives > 0 ? tr('Новый вылет — через несколько секунд') : tr('Вылеты на эту волну кончились — смотрите за союзниками'), C.VW / 2, C.VH * 0.2 + 22);
      hx.fillText(IS_TOUCH ? tr('«Кам.» — следующий союзник') : tr('B — следующий союзник'), C.VW / 2, C.VH * 0.2 + 40);
      { const al = alliesOf(); if (al.length) { hx.fillStyle = '#93c5fd'; hx.fillText(tr('Смотрите за: {0}', [allyName(al[spec.i % al.length])]), C.VW / 2, C.VH * 0.2 + 58); } } hx.shadowBlur = 0;
      return;
    }
    updateLar(dt); drawHud(); zoneHud(); fireBtn(dt);
    if (game.net) { // союзники в небе: зелёная стрелка над самолётом, имя и дальность (до 25 км)
      const hx = C.hx; hx.font = '600 11px "Golos Text", -apple-system, Segoe UI, sans-serif'; hx.textAlign = 'center';
      for (const a of alliesOf()) {
        const d = a.pos.distanceTo(craft.pos); if (d > 25000) continue;
        const p = C.proj(fw.copy(a.pos).setY(a.pos.y + 12)); if (!p) continue;
        hx.strokeStyle = '#4ade80'; hx.lineWidth = 2; hx.beginPath(); hx.moveTo(p[0] - 7, p[1] - 6); hx.lineTo(p[0], p[1] + 2); hx.lineTo(p[0] + 7, p[1] - 6); hx.stroke();
        hx.fillStyle = '#bbf7d0'; hx.shadowColor = 'rgba(0,0,0,.8)'; hx.shadowBlur = 3; hx.fillText(tr('{0} · {1} км', [allyName(a), (d / 1000).toFixed(1)]), p[0], p[1] - 10); hx.shadowBlur = 0;
      }
    }
    if (camMode === 3) {
      const o = wc.obj, hx = C.hx; let txt = tr('Камера: за оружием — нет оружия в воздухе');
      if (o && wc.kind === 'w') txt = tr('Камера: {0}{1}', [o.W.short, o.dead ? tr(' — разрыв') : tr(' · {0} км/ч · {1} м', [Math.round(o.vel.length() * 3.6), Math.round(o.pos.y - city.groundH(o.pos.x, o.pos.z))])]);
      else if (o) txt = tr('Камера: ракета {0} летит в вас{1}', [o.S.short, o.dead ? tr(' — подрыв') : tr(' · {0} км', [(o.pos.distanceTo(craft.pos) / 1000).toFixed(1)])]);
      hx.font = '700 12px "Golos Text", -apple-system, Segoe UI, sans-serif'; hx.textAlign = 'center'; hx.fillStyle = wc.kind === 'm' ? '#ff8a8a' : '#fde047';
      hx.shadowColor = 'rgba(0,0,0,.85)'; hx.shadowBlur = 4; hx.fillText(txt, C.VW / 2, Math.max(64, C.VH * 0.16)); hx.shadowBlur = 0;
    }
    if ((hudT -= dt) <= 0) { hudT = 0.1; const rw = C.S.rwr(craft), mw = C.S.mws(craft); hudText(rw, mw); drawRwr(rw, mw, t); if (!C.paused && !game.over) snd.rwrTick(0.1, rwrAckStep(rw, 0.1), mw); }
    if (mapOn) drawMap();
    if (flashT > 0) { flashT -= dt; document.body.style.boxShadow = `inset 0 0 120px rgba(255,40,40,${Math.max(0, flashT)})`; } else document.body.style.boxShadow = '';
  }
  const api = {
    get plane() { return shipReal ? shipName || shipCls : tr('процедурный'); },
    modelsReady() { if (shipSide) { buildShip(shipSide, shipCls, shipName); buildPylons(); } }, // готовая модель догрузилась во время вылета
    craft, pod, game, loadout, fire, podNext, podView, nextWeapon, cm, say, rearm, setThr, aim, aimSync, netResupply,
    // обучение: показ автопилотом, перенос самолёта, смена целей задания, камера (0 — за самолётом, 3 — за оружием)
    demo(d) { demo = d || null; if (!demo) aimSync(); },
    place(sp) { craft.pos.set(sp.x, sp.y, sp.z); craft.yaw = sp.yaw || 0; craft.pitch = craft.roll = 0; craft.q = null; craft.speed = craft.heli ? 20 : Math.max(craft.speed, 220); craft.wp = craft.wr = craft.wz = 0; fwdOf(craft, craft.vel).multiplyScalar(craft.speed); aimSync(); camInit = false; },
    forceFire, // «Съёмка»: принудительный пуск (кнопка «Пуск»)
    retarget(list) { game.targets = list; podSet(null); },
    setCam(m) { if (camMode !== m) { camMode = m; wc.obj = null; wc.init = false; } },
    bino: () => ({ on: bino.on, mode: bino.mode }), // «Бинокль» — для урока «Спутниковые бомбы» (training.js)
    // «Съёмка»: модель самолёта и подвеска (пилоны — userData.st), поставить модель в точку самолёта до кадра
    ship, pylons: () => pylonMeshes, poseShip() { ship.position.copy(craft.pos); ship.rotation.set(craft.pitch, craft.yaw, craft.roll, 'YXZ'); ship.updateMatrixWorld(true); },
    get hasPod() { return hasPod; }, get sel() { return sel; }, get mapOn() { return mapOn; }, curW,
    start, stop, update, hud, onKey, finish, camera: updateCamera, startNet, netSpawn, netHit, netDown, netAI, netWaveOut, focus: () => craft.pos, afterRender: renderPod, extraCam: () => (pod.show && hasPod && craft && !craft.dead ? podCam : null),
    resize() { layoutTouch(); layoutPod(); },
    pop, podState: () => ({ tgt: pod.tgt && tgtName(pod.tgt), why: pod.why, lock: !!pod.lock, lockD: pod.lock ? Math.round(craft.pos.distanceTo(pod.lock)) : -1 }), // подскок и прицел — для стендов
    // вертолёт — своё управление (2026-10-22: в паузе были клавиши самолёта: тангаж, форсаж)
    pauseHelp: () => (craft.heli ? heliHelp() : IS_TOUCH ? tr('{0} «Газ» — ступени, после 100 % — форсаж. «Ловушки» — ЛТЦ и диполи разом (зажмите — очередью). Панель слева: тап по оружию — выбор, по строке цели — следующая цель, «ТВ» — окно контейнера (тап по окну — увеличение). Контейнер захватывает цель сам: 1–18 км, высота от 400 м, цель не закрыта домами.', [aimOn() ? tr('Ведите пальцем по экрану — камера поворачивается, самолёт летит туда, куда она смотрит (белый кружок). Крестовина — точные крен и тангаж.') : tr('Левая половина экрана — ручка.')])
      : tr('Стрелки — тангаж и крен · A/D — крен · W/S — газ ступенями (после 100 % — форсаж) · Shift — форсаж вкл/выкл · Пробел/F — сброс · Q — оружие · V — камера · N — камера за оружием · L — обзор (камера мышью, самолёт держит курс)<br>Контейнер захватывает цель сам (1–18 км, высота от 400 м, цель не закрыта домами) · R — следующая цель · G — окно контейнера · Z — увеличение · O — лазер<br>X — ловушки (ЛТЦ и диполи; зажать — очередью) · M — карта · Esc — пауза')),
  };
  return api;
}
