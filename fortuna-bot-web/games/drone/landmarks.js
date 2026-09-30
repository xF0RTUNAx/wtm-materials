// Крупные объекты-ориентиры карты «Симулятора Летки» и «жизнь» на ней (2026-09-30):
//  огромный вантовый мост через главную долину, порт с кранами и кораблями, маяк на мысу; лодки на воде.
//  (Реки, плотина, телебашня, АЭС, военная база, второй аэродром, карьер, солнечная станция, монастырь, стадион и птицы
//  были в первой версии — Mark попросил убрать; см. git-историю коммита 3ab4103, если понадобятся.)
// Всё — только картинка: коробок для столкновений нет (дрон пролетает сквозь), расстановка — свой генератор от seed,
// общий Math.random не трогается (бой и расписание от этих объектов не зависят).
// Статика склеена в несколько мешей по материалам; анимация (луч маяка, лодки) — отдельными объектами.
/* global THREE */
import { mulberry32 } from './schedule.js?v=20260930j';
import { M, part, mergeParts } from './models.js?v=20260930j';

// C: { WORLD, TOWNS, AIRFIELD, terrainH, lin, add, P, seed, villages, industry, waterMat, noiseTex, waterTime }
export function buildLandmarks(C) {
  const { WORLD, TOWNS, AIRFIELD, terrainH, lin, add, P } = C;
  const R = mulberry32(0x1a4d ^ C.seed), W = WORLD.WATER_Y, lvl = Math.min(2, P.propsLvl ?? 2);
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const parts = [], glass = [], lights = [], emitters = [], lines = [];
  const placed = []; // занятые места (x, z, r)
  const avoid = [...TOWNS.map((t) => ({ ...t, r: t.r + 250 })), { ...AIRFIELD, r: AIRFIELD.r + 700 },
    ...(C.industry ? [{ ...C.industry, r: C.industry.r + 300 }] : []), ...(C.villages || []).map((v) => ({ ...v, r: v.r + 250 }))];
  const free = (x, z, r) => avoid.every((a) => Math.hypot(a.x - x, a.z - z) > a.r + r) && placed.every((a) => Math.hypot(a.x - x, a.z - z) > a.r + r + 200);
  // локальная система объекта: поворот rot вокруг центра (cx, cz), y0 — высота площадки
  const frame = (cx, cz, y0, rot) => {
    const at = (lx, lz) => [cx + Math.cos(rot) * lx - Math.sin(rot) * lz, cz + Math.sin(rot) * lx + Math.cos(rot) * lz];
    const P_ = (list, geo, col, lx, ly, lz, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) => { const [x, z] = at(lx, lz); list.push(part(geo, col, M(x, y0 + ly, z, rx, rot + ry, rz, sx, sy, sz))); return [x, z]; };
    return { at, P: (...a) => P_(parts, ...a), L: (...a) => P_(glass, ...a) };
  };
  const BOX = new THREE.BoxGeometry(1, 1, 1); BOX.translate(0, 0.5, 0);
  const CYL = (r0, r1, h, n = 16) => { const g = new THREE.CylinderGeometry(r1, r0, h, n); g.translate(0, h / 2, 0); return g; };
  const lathe = (pts, n = 28) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), n);
  const findSite = (tries, gen, score) => { let best = null, bs = -1e9; for (let k = 0; k < tries; k++) { const c = gen(); if (!c) continue; const s = score(c); if (s > bs) { bs = s; best = c; } } return bs > -1e8 ? best : null; };
  const shoreDir = (x, z, d) => { // направление на воду (если вода в d метрах)
    let best = null; for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2, h = terrainH(x + Math.cos(a) * d, z + Math.sin(a) * d); if (h < W - 3 && (!best || h < best.h)) best = { a, h }; } return best;
  };

  // ════════ Огромный вантовый мост через главную долину (там, где вода шире всего) ════════
  let bridge = null;
  {
    const rx = (z) => 2200 * Math.sin(z * 0.00022 + 1.1) + 900 * Math.sin(z * 0.00061), drx = (z) => 2200 * 0.00022 * Math.cos(z * 0.00022 + 1.1) + 900 * 0.00061 * Math.cos(z * 0.00061);
    const deck = W + 92; let bs = -1;
    // поперёк долины она уже 1 км — мост идёт наискось (как большие мосты через водохранилища): ищем 1,2–2,4 км с водой посередине
    for (let z = 3000; z <= 6000; z += 100) for (let ang = -0.8; ang <= 0.81; ang += 0.1) {
      const cx = rx(z); if (terrainH(cx, z) > W - 5) continue;
      const tl = Math.hypot(drx(z), 1), p0x = 1 / tl, p0z = -drx(z) / tl, px = p0x * Math.cos(ang) - p0z * Math.sin(ang), pz = p0x * Math.sin(ang) + p0z * Math.cos(ang);
      let a = null, b = null;
      for (let d = 0; d < 1500; d += 15) { if (a === null && terrainH(cx - px * d, z - pz * d) >= deck - 4) a = d; if (b === null && terrainH(cx + px * d, z + pz * d) >= deck - 4) b = d; }
      if (a === null || b === null || a + b < 1200 || a + b > 2400) continue;
      let wet = 0; for (let d = -a; d <= b; d += 50) if (terrainH(cx + px * d, z + pz * d) < W) wet += 50;
      const sc = wet + (a + b) * 0.3 - Math.abs(ang) * 300;
      if (wet >= 400 && sc > bs) { bs = sc; bridge = { x0: cx - px * a, z0: z - pz * a, x1: cx + px * b, z1: z + pz * b, deck, L: a + b }; }
    }
    if (bridge) {
      const { x0, z0, x1, z1, deck: Y, L } = bridge, ux = (x1 - x0) / L, uz = (z1 - z0) / L, yaw = Math.atan2(ux, uz);
      const pt = (s, o = 0) => [x0 + ux * s + uz * o, z0 + uz * s - ux * o]; // s — вдоль, o — поперёк (вправо)
      const put = (geo, col, s, y, o = 0, sx = 1, sy = 1, sz = 1, list = parts) => { const [x, z] = pt(s, o); list.push(part(geo, col, M(x, y, z, 0, yaw, 0, sx, sy, sz))); };
      const W_ = 34, T = 4.5;
      put(BOX, 0x8e9196, L / 2, Y - T, 0, W_, T, L + 40);                              // балка-коробка
      put(BOX, 0x2a2c30, L / 2, Y, 0, W_ - 6, 0.3, L + 40);                              // асфальт
      for (let s = 10; s < L; s += 24) put(BOX, 0xe8e8e0, s, Y + 0.3, 0, 0.35, 0.05, 10); // разметка
      for (const o of [-W_ / 2 + 1, W_ / 2 - 1]) put(BOX, 0xc9ccd0, L / 2, Y, o, 0.6, 1.4, L + 40); // ограждения
      const pyl = [L * 0.27, L * 0.73], Htop = Y + 175;
      for (const s of pyl) {
        const g = Math.min(terrainH(...pt(s)), W - 12) - 4, h = Htop - g;
        for (const o of [-W_ / 2 - 5, W_ / 2 + 5]) put(BOX, 0xd6d4ce, s, g, o, 9, h - 40, 10); // две стойки «Н»-образного пилона
        put(BOX, 0xd6d4ce, s, Htop - 70, 0, W_ + 19, 8, 10);                                   // верхняя перемычка
        put(BOX, 0xc8c6c0, s, Y - T - 6, 0, W_ + 10, 6, 10);                              // ригель под настилом
        put(BOX, 0xd6d4ce, s, Htop - 62, 0, 10, 62, 10);                                  // верх пилона (анкеры вант)
        lights.push({ pts: [V(...(() => { const [x, z] = pt(s); return [x, Htop + 2, z]; })())], color: 0xff2a18, size: 2.4, blink: true, always: true });
        // ванты: веер от верха пилона к краям настила, в обе стороны
        const [px_, pz_] = pt(s);
        for (const dir of [-1, 1]) for (const o of [-W_ / 2 + 2, W_ / 2 - 2]) for (let k = 1; k <= 13; k++) {
          const sd = s + dir * k * (L * 0.225 / 13), [dx_, dz_] = pt(sd, o), ay = Htop - 38 + k * 2.4;
          const a = V(px_ + (dx_ - pt(sd)[0]) * 0.15, ay, pz_ + (dz_ - pt(sd)[1]) * 0.15), b = V(dx_, Y + 1, dz_);
          lines.push(a, b);
        }
      }
      for (let s = 60; s < L - 40; s += 130) { // опоры подходов (где не пилоны)
        if (pyl.some((p) => Math.abs(p - s) < 250)) continue;
        const g = Math.min(terrainH(...pt(s)), Y - 5); if (Y - T - g < 6) continue;
        put(CYL(5, 4, Y - T - g + 2), 0xbcbab4, s, g - 2, -8); put(CYL(5, 4, Y - T - g + 2), 0xbcbab4, s, g - 2, 8);
      }
      const lamp = []; for (let s = 20; s < L; s += 60) for (const o of [-W_ / 2 + 1, W_ / 2 - 1]) { const [x, z] = pt(s, o); lamp.push(V(x, Y + 9, z)); }
      lights.push({ pts: lamp, color: 0xffc27a, size: 0.9 });
      placed.push({ name: 'bridge',  x: (x0 + x1) / 2, z: (z0 + z1) / 2, r: L / 2 });
    }
  }

  // ════════ Порт у города на берегу: причалы, краны, контейнеры, склады, корабли ════════
  if (lvl >= 1) {
    const s = findSite(300, () => { const T = TOWNS[(R() * TOWNS.length) | 0], a = R() * Math.PI * 2, d = T.r + 200 + R() * 1600, x = T.x + Math.cos(a) * d, z = T.z + Math.sin(a) * d;
      const g = terrainH(x, z); if (g < W + 2 || g > W + 14 || !free(x, z, 250)) return null; const sd = shoreDir(x, z, 220); return sd ? { x, z, g, sd } : null; }, (c) => -Math.abs(c.g - W - 6));
    if (s) {
      const y0 = Math.max(s.g, W + 3), rot = s.sd.a - Math.PI / 2, f = frame(s.x, s.z, y0, rot); // +z локально — к воде
      f.P(BOX, 0x8b8c88, 0, -8, 0, 0, 0, 0, 420, 9, 120);                                          // набережная
      for (const lx of [-120, 110]) { f.P(BOX, 0x8b8c88, lx, -2.5, 150, 0, 0, 0, 26, 3.5, 200); for (let k = 0; k < 6; k++) f.P(CYL(1.2, 1.2, 12, 8), 0x6f706c, lx + (k % 2 ? 10 : -10), -14, 70 + Math.floor(k / 2) * 60); }
      for (const [lx, lz] of [[-150, 40], [-60, 40], [30, 40]]) { // козловые краны
        for (const ox of [-10, 10]) for (const oz of [-8, 8]) f.P(BOX, 0xd9822b, lx + ox, 0, lz + oz, 0, 0, 0, 2, 38, 2);
        f.P(BOX, 0xd9822b, lx, 38, lz + 15, 0, 0, 0, 24, 5, 70); f.P(BOX, 0x44505a, lx, 43, lz - 6, 0, 0, 0, 8, 6, 8);
      }
      const CC = [0xb23b2e, 0x2f5f9e, 0x3f8a4a, 0xd0a33a, 0x7a7f86, 0xe0e0da];
      for (let i = 0; i < 70; i++) f.P(BOX, CC[(R() * CC.length) | 0], -190 + (i % 14) * 14, 2.6 * Math.floor(i / 28), -30 + Math.floor((i % 28) / 14) * 6, 0, 0, 0, 12, 2.6, 2.5);
      for (const lx of [80, 150]) f.P(BOX, 0xa9a397, lx, 0, -20, 0, 0, 0, 60, 14, 40);
      for (const [lx, lz, len, col] of [[-80, 150, 120, 0x27313b], [150, 160, 90, 0x6b2b24]]) { // корабли у причалов
        f.P(BOX, col, lx, -6, lz, 0, 0, 0, 18, 9, len); f.P(BOX, 0xe8e8e2, lx, 3, lz + len * 0.35, 0, 0, 0, 14, 10, 16); f.P(BOX, 0xe8e8e2, lx, 13, lz + len * 0.35, 0, 0, 0, 10, 4, 10);
      }
      const lamp = []; for (let i = 0; i < 8; i++) { const [x, z] = f.at(-200 + i * 57, 55); lamp.push(V(x, y0 + 16, z)); } lights.push({ pts: lamp, color: 0xffb060, size: 1.1 });
      placed.push({ name: 'port',  x: s.x, z: s.z, r: 300 });
    }
  }

  // ════════ Маяк на мысу большого озера: белый с красными поясами, вращающийся луч ════════
  let beacon = null;
  {
    const s = findSite(300, () => { const a = R() * Math.PI * 2, d = 1500 + R() * 9000, x = Math.cos(a) * d, z = Math.sin(a) * d, g = terrainH(x, z); if (g < W + 3 || g > W + 30 || !free(x, z, 120)) return null;
      let wet = 0; for (let i = 0; i < 12; i++) { const t = i / 12 * Math.PI * 2; if (terrainH(x + Math.cos(t) * 260, z + Math.sin(t) * 260) < W - 2) wet++; } return wet >= 6 ? { x, z, g, wet } : null; }, (c) => c.wet);
    if (s) {
      const f = frame(s.x, s.z, s.g - 1, 0);
      f.P(lathe([[6.5, 0], [5.4, 22], [4.2, 38], [0.001, 38]], 18), 0xf0efe9, 0, 0, 0);
      for (const [y, h] of [[7, 4], [17, 4], [27, 4]]) f.P(CYL(6.1 - y * 0.058, 6.1 - (y + h) * 0.058, h, 18), 0xc2352b, 0, y, 0);
      f.P(CYL(5.2, 5.2, 1, 16), 0x3a3c3e, 0, 38, 0); f.L(CYL(3.2, 3.2, 4.5, 12), 0xfff2c8, 0, 39, 0); f.P(new THREE.ConeGeometry(3.8, 3.5, 12), 0xc2352b, 0, 45.2, 0);
      const beamGeo = new THREE.ConeGeometry(28, 420, 20, 1, true); beamGeo.translate(0, -210, 0); beamGeo.rotateX(-Math.PI / 2);
      const beam = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: lin(0xfff0c0).multiplyScalar(1.4), transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      beam.position.set(s.x, s.g + 40, s.z); beam.visible = false; add(beam); beacon = { beam, a: 0 };
      lights.push({ pts: [V(s.x, s.g + 41, s.z)], color: 0xfff0c0, size: 2.2 });
      placed.push({ name: 'lighthouse',  x: s.x, z: s.z, r: 80 });
    }
  }

  // ════════ Сборка статики: по одному мешу на материал ════════
  const solid = new THREE.MeshLambertMaterial({ vertexColors: true });
  const mk = (list, mat) => { if (!list.length) return null; const g = mergeParts(list); g.boundingSphere = new THREE.Sphere(V(0, 300, 0), WORLD.SIZE); const m = add(new THREE.Mesh(g, mat)); m.castShadow = m.receiveShadow = !!P.shadows; return m; };
  mk(parts, solid);
  mk(glass, P.pbr ? new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.2, roughness: 0.08, envMapIntensity: 1.1 }) : solid);
  if (lines.length) { // ванты моста — тонкие цилиндры (линия в 1 пиксель вблизи смотрится бедно)
    const cp = []; for (let i = 0; i < lines.length; i += 2) { const a = lines[i], b = lines[i + 1], len = a.distanceTo(b), mid = a.clone().add(b).multiplyScalar(0.5);
      const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), b.clone().sub(a).normalize()); cp.push(part(new THREE.CylinderGeometry(0.35, 0.35, len, 5), 0xe9ebee, new THREE.Matrix4().compose(mid, q, V(1, 1, 1)))); }
    mk(cp, solid);
  }

  // ════════ Лодки на воде ════════
  const boats = [];
  if (lvl >= 1) {
    const boatGeo = mergeParts([part(new THREE.BoxGeometry(4, 1.6, 12), 0xf2f2ee, M(0, 0.4, 0)), part(new THREE.ConeGeometry(2, 4, 4), 0xf2f2ee, M(0, 0.4, -7.8, -Math.PI / 2, Math.PI / 4, 0, 1, 1, 0.5)),
      part(new THREE.BoxGeometry(3, 1.6, 4), 0x2f5f9e, M(0, 1.9, 1.5)), part(new THREE.BoxGeometry(4.1, 0.4, 12.1), 0x2f5f9e, M(0, -0.2, 0))]);
    const bm = new THREE.MeshLambertMaterial({ vertexColors: true });
    for (let k = 0; k < 400 && boats.length < 6; k++) {
      const x = (R() - 0.5) * 20000, z = (R() - 0.5) * 20000; if (terrainH(x, z) > W - 8) continue;
      const rad = 120 + R() * 280; let ok = true; for (let i = 0; i < 16 && ok; i++) { const t = i / 16 * Math.PI * 2; if (terrainH(x + Math.cos(t) * rad, z + Math.sin(t) * rad) > W - 3) ok = false; }
      if (!ok || boats.some((b) => Math.hypot(b.x - x, b.z - z) < 900)) continue;
      const m = add(new THREE.Mesh(boatGeo, bm)); m.castShadow = !!P.shadows; boats.push({ m, x, z, rad, t: R() * 6.28, w: (R() < 0.5 ? -1 : 1) * (5 + R() * 4) / rad });
    }
  }

  // огни (как в props.js): HDR-точки, светятся в сумерках; blink — мигают
  const lightMeshes = lights.map((L) => {
    const g = new THREE.SphereGeometry(L.size, 6, 4), m = new THREE.MeshBasicMaterial({ color: lin(L.color).multiplyScalar(8) });
    const im = new THREE.InstancedMesh(g, m, L.pts.length), mm = new THREE.Matrix4();
    L.pts.forEach((p, i) => im.setMatrixAt(i, mm.makeTranslation(p.x, p.y, p.z))); im.instanceMatrix.needsUpdate = true;
    g.boundingSphere = new THREE.Sphere(V(0, 300, 0), WORLD.SIZE); add(im); return { im, L };
  });

  let t = 0;
  return {
    emitters, bridge, sites: placed,
    // dt — шаг, night — темнота 0…1, cam — положение камеры, wake(x, y, z, dx, dz) — пена за лодкой (частицы main.js)
    update(dt, night, cam, wake) {
      t += dt;
      for (const { im, L } of lightMeshes) im.visible = (L.always || night > 0.25) && (!L.blink || (t % 1.6) < 0.8);
      if (beacon) { beacon.a += dt * 0.9; beacon.beam.rotation.y = beacon.a; beacon.beam.visible = night > 0.2; }
      for (const b of boats) {
        b.t += b.w * dt; const x = b.x + Math.cos(b.t) * b.rad, z = b.z + Math.sin(b.t) * b.rad, dx = -Math.sin(b.t) * Math.sign(b.w), dz = Math.cos(b.t) * Math.sign(b.w);
        b.m.position.set(x, W + 0.2 + Math.sin(t * 1.3 + b.x) * 0.15, z); b.m.rotation.set(0, Math.atan2(-dx, -dz), Math.sin(t * 0.9 + b.z) * 0.03);
        if (wake && cam && Math.hypot(x - cam.x, z - cam.z) < 3000) wake(x - dx * 7, W + 0.3, z - dz * 7, dx, dz);
      }
    },
  };
}
