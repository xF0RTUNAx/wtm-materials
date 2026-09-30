// Крупные объекты-ориентиры карты «Симулятора Летки» и «жизнь» на ней (2026-09-30):
//  реки со склонов в озёра, огромный вантовый мост через главную долину, плотина ГЭС с водохранилищем, телебашня,
//  АЭС с градирнями, порт с кранами и кораблями, военная база с ЗРК и РЛС, второй аэродром, карьер, солнечная
//  электростанция, маяк, монастырь на холме, стадион; лодки на воде и стаи птиц.
// Всё — только картинка: коробок для столкновений нет (дрон пролетает сквозь), расстановка — свой генератор от seed,
// общий Math.random не трогается (бой и расписание от этих объектов не зависят).
// Статика склеена в несколько мешей по материалам; анимация (антенна РЛС, луч маяка, лодки, птицы) — отдельными объектами.
/* global THREE */
import { mulberry32 } from './schedule.js?v=20260930c';
import { M, part, mergeParts } from './models.js?v=20260930c';

// C: { WORLD, TOWNS, AIRFIELD, terrainH, lin, add, P, seed, villages, industry, waterMat, noiseTex, waterTime }
export function buildLandmarks(C) {
  const { WORLD, TOWNS, AIRFIELD, terrainH, lin, add, P } = C;
  const R = mulberry32(0x1a4d ^ C.seed), W = WORLD.WATER_Y, lvl = Math.min(2, P.propsLvl ?? 2);
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const parts = [], gold = [], glass = [], panels = [], anim = [], lights = [], emitters = [], lines = [];
  const placed = []; // занятые места (x, z, r)
  const avoid = [...TOWNS.map((t) => ({ ...t, r: t.r + 250 })), { ...AIRFIELD, r: AIRFIELD.r + 700 },
    ...(C.industry ? [{ ...C.industry, r: C.industry.r + 300 }] : []), ...(C.villages || []).map((v) => ({ ...v, r: v.r + 250 }))];
  const free = (x, z, r) => avoid.every((a) => Math.hypot(a.x - x, a.z - z) > a.r + r) && placed.every((a) => Math.hypot(a.x - x, a.z - z) > a.r + r + 200);
  const flat = (x, z, r) => { let lo = 1e9, hi = -1e9; for (const [dx, dz] of [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r], [r * 0.7, r * 0.7], [-r * 0.7, -r * 0.7], [r * 0.7, -r * 0.7], [-r * 0.7, r * 0.7]]) { const h = terrainH(x + dx, z + dz); lo = Math.min(lo, h); hi = Math.max(hi, h); } return { rng: hi - lo, lo, hi }; };
  const inMap = (x, z, m = 0) => Math.hypot(x, z) < 11000 - m;
  // локальная система объекта: поворот rot вокруг центра (cx, cz), y0 — высота площадки
  const frame = (cx, cz, y0, rot) => {
    const at = (lx, lz) => [cx + Math.cos(rot) * lx - Math.sin(rot) * lz, cz + Math.sin(rot) * lx + Math.cos(rot) * lz];
    const P_ = (list, geo, col, lx, ly, lz, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) => { const [x, z] = at(lx, lz); list.push(part(geo, col, M(x, y0 + ly, z, rx, rot + ry, rz, sx, sy, sz))); return [x, z]; };
    return { at, P: (...a) => P_(parts, ...a), G: (...a) => P_(gold, ...a), L: (...a) => P_(glass, ...a) };
  };
  const BOX = new THREE.BoxGeometry(1, 1, 1); BOX.translate(0, 0.5, 0);
  const CYL = (r0, r1, h, n = 16) => { const g = new THREE.CylinderGeometry(r1, r0, h, n); g.translate(0, h / 2, 0); return g; };
  const lathe = (pts, n = 28) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), n);
  const hyperboloid = (r0, h) => lathe([[r0, 0], [r0 * 0.86, h * 0.33], [r0 * 0.7, h * 0.66], [r0 * 0.72, h * 0.85], [r0 * 0.78, h]]);
  const onion = (r) => lathe([[0.001, 0], [r * 0.9, r * 0.3], [r, r * 0.75], [r * 0.7, r * 1.25], [r * 0.25, r * 1.6], [0.001, r * 2.1]], 16);
  const findSite = (tries, gen, score) => { let best = null, bs = -1e9; for (let k = 0; k < tries; k++) { const c = gen(); if (!c) continue; const s = score(c); if (s > bs) { bs = s; best = c; } } return bs > -1e8 ? best : null; };
  const shoreDir = (x, z, d) => { // направление на воду (если вода в d метрах)
    let best = null; for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2, h = terrainH(x + Math.cos(a) * d, z + Math.sin(a) * d); if (h < W - 3 && (!best || h < best.h)) best = { a, h }; } return best;
  };

  // ════════ Реки: со склонов вниз по рельефу до озера, шире к устью ════════
  const rivers = [];
  {
    for (let k = 0; k < 900 && rivers.length < [3, 5, 7][lvl]; k++) {
      const a = R() * Math.PI * 2, d = 2000 + R() * 8500; let x = Math.cos(a) * d, z = Math.sin(a) * d;
      const g0 = terrainH(x, z); if (g0 < 170 || g0 > 950 || !free(x, z, 200)) continue;
      const pts = []; let dx = 0, dz = 0, ok = false;
      for (let i = 0; i < 500; i++) {
        const g = terrainH(x, z); pts.push({ x, z, g });
        if (g < W - 0.5) { ok = true; break; }
        const e = 30, gx = terrainH(x + e, z) - terrainH(x - e, z), gz = terrainH(x, z + e) - terrainH(x, z - e), gl = Math.hypot(gx, gz);
        if (gl < 0.02) break;
        const m = Math.sin(i * 0.23 + k) * 0.35; // меандры
        let nx = -gx / gl * 0.55 + dx * 0.45, nz = -gz / gl * 0.55 + dz * 0.45; const nl = Math.hypot(nx, nz) || 1; nx /= nl; nz /= nl;
        dx = nx * Math.cos(m) - nz * Math.sin(m); dz = nx * Math.sin(m) + nz * Math.cos(m);
        x += dx * 40; z += dz * 40;
        if (i > 12 && g > pts[i - 10].g + 2) break; // упёрлись в яму — не река
        if (!inMap(x, z, 300)) break;
      }
      if (!ok || pts.length < 45) continue;
      if (rivers.some((r) => r.pts.some((p) => Math.hypot(p.x - pts[0].x, p.z - pts[0].z) < 700))) continue;
      let y = pts[0].g + 0.7; for (const p of pts) { y = Math.min(y, p.g + 0.7); p.y = Math.max(y, W + 0.3); }
      rivers.push({ pts });
    }
    if (rivers.length) {
      const pos = [], uv = [], idx = [];
      for (const r of rivers) {
        const pts = r.pts, n = pts.length, base = pos.length / 3; let along = 0;
        for (let i = 0; i < n; i++) {
          const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)], p = pts[i];
          let tx = b.x - a.x, tz = b.z - a.z; const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
          if (i) along += Math.hypot(p.x - pts[i - 1].x, p.z - pts[i - 1].z);
          const half = 7 + 32 * Math.pow(i / (n - 1), 1.3);
          pos.push(p.x - tz * half, p.y, p.z + tx * half, p.x + tz * half, p.y, p.z - tx * half); uv.push(0, along, 1, along);
          if (i) { const o = base + i * 2; idx.push(o - 2, o - 1, o, o - 1, o + 1, o); }
        }
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('rv', new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(idx); g.computeVertexNormals(); g.boundingSphere = new THREE.Sphere(V(0, 300, 0), WORLD.SIZE);
      const mat = P.pbr ? new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.12, metalness: 0, envMapIntensity: 0.8 }) : new THREE.MeshLambertMaterial({ color: 0xffffff });
      mat.onBeforeCompile = (sh) => {
        sh.uniforms.noiseTex = { value: C.noiseTex }; sh.uniforms.wTime = C.waterTime;
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec2 rv; varying vec2 vRv;')
          .replace('#include <project_vertex>', '#include <project_vertex>\nvRv = rv; mvPosition.xyz *= 0.9985; gl_Position = projectionMatrix * mvPosition;');
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 vRv; uniform sampler2D noiseTex; uniform float wTime;')
          .replace('#include <color_fragment>', `#include <color_fragment>
            float e = abs(vRv.x - 0.5) * 2.0;                                  // 0 — середина русла, 1 — берег
            float fl = texture2D(noiseTex, vec2(vRv.x * 0.35, vRv.y * 0.004 - wTime * 0.05)).r;   // течение: рябь бежит вниз по реке
            vec3 water = mix(vec3(0.02, 0.07, 0.09), vec3(0.05, 0.13, 0.16), fl) * (1.0 - 0.3 * e);
            vec3 bank = vec3(0.12, 0.1, 0.07);
            diffuseColor.rgb = mix(water, bank, smoothstep(0.78, 0.95, e));`)
          .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(0.08, 0.9, smoothstep(0.78, 0.95, abs(vRv.x - 0.5) * 2.0));');
      };
      const m = add(new THREE.Mesh(g, mat)); m.receiveShadow = !!P.shadows; m.renderOrder = -1;
    }
  }

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

  // ════════ Плотина ГЭС с водохранилищем: в узком месте долины одной из рек ════════
  let dam = null;
  if (rivers.length) {
    const G = 25;
    for (const r of rivers) {
      if (dam) break;
      const pts = r.pts;
      for (let i = Math.floor(pts.length * 0.2); i < pts.length - 15 && !dam; i += 4) {
        const p = pts[i], q = pts[i + 3], fx = q.x - p.x, fz = q.z - p.z, fl = Math.hypot(fx, fz); if (!fl) continue;
        const ux = fx / fl, uz = fz / fl, level = p.g + 34;
        if (!free(p.x, p.z, 250)) continue;
        // берега: поперёк русла рельеф должен подниматься выше уровня воды
        let a = null, b = null; for (let d = 10; d < 900; d += 10) { if (a === null && terrainH(p.x - uz * d, p.z + ux * d) > level + 6) a = d; if (b === null && terrainH(p.x + uz * d, p.z - ux * d) > level + 6) b = d; }
        if (a === null || b === null || a + b > 1300) continue;
        // заливка вверх по долине до уровня воды (сетка 25 м), вниз за плотину не идём
        const seen = new Set(), cells = [], stack = [[Math.round((p.x - ux * 60) / G), Math.round((p.z - uz * 60) / G)]]; let leak = false;
        while (stack.length && cells.length < 9000) {
          const [ci, cj] = stack.pop(), key = ci * 100000 + cj; if (seen.has(key)) continue; seen.add(key);
          const x = ci * G, z = cj * G, along = (x - p.x) * ux + (z - p.z) * uz;
          if (along > -8) { if (Math.hypot(x - p.x, z - p.z) > Math.max(a, b) + 150) leak = true; continue; }
          if (terrainH(x, z) >= level || Math.hypot(x - p.x, z - p.z) > 3500) continue;
          cells.push([x, z]); stack.push([ci + 1, cj], [ci - 1, cj], [ci, cj + 1], [ci, cj - 1]);
        }
        if (leak || cells.length < 120 || cells.length >= 9000) continue;
        dam = { x: p.x, z: p.z, ux, uz, a, b, level, g: p.g, cells };
      }
    }
    if (dam) {
      const { x, z, ux, uz, a, b, level, g, cells } = dam, G2 = G / 2 + 2;
      const pos = [], idx = []; // зеркало водохранилища — квадраты сетки на уровне воды (края прячутся под склоны)
      for (const [cx, cz] of cells) { const o = pos.length / 3; pos.push(cx - G2, level, cz - G2, cx + G2, level, cz - G2, cx + G2, level, cz + G2, cx - G2, level, cz + G2); idx.push(o, o + 2, o + 1, o, o + 3, o + 2); }
      const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); wg.setIndex(idx); wg.computeVertexNormals();
      wg.boundingSphere = new THREE.Sphere(V(x, level, z), 4000);
      add(new THREE.Mesh(wg, C.waterMat));
      // тело плотины: гравитационная стена поперёк долины, по гребню — дорога; водосброс по центру
      const yaw = Math.atan2(-ux, -uz), span = a + b + 60, cxm = x + (-uz) * (a - b) / 2, czm = z + ux * (a - b) / 2, H = level + 5 - (g - 8);
      parts.push(part(BOX, 0xb9b6ad, M(cxm, g - 8, czm, 0, yaw, 0, span, H, 14)));
      parts.push(part(BOX, 0xa9a69d, M(cxm + ux * 16, g - 8, czm + uz * 16, 0, yaw, 0, span, H * 0.62, 20)));  // уступ с низовой стороны
      parts.push(part(BOX, 0x3a3c3e, M(cxm, level + 5, czm, 0, yaw, 0, span, 0.4, 9)));
      parts.push(part(BOX, 0xe6f0f2, M(x + ux * 27, g - 4, z + uz * 27, 0, yaw, 0, 24, H * 0.9, 1.5)));          // пенный поток водосброса
      parts.push(part(BOX, 0x8f9a92, M(x + ux * 70 + uz * 60, g - 1, z + uz * 70 - ux * 60, 0, yaw, 0, 60, 18, 30)));  // здание ГЭС
      emitters.push({ x: x + ux * 40, y: g + 4, z: z + uz * 40, kind: 'spray' }, { x: x + ux * 55, y: g + 2, z: z + uz * 55, kind: 'spray' });
      const lamp = []; for (let k = 0; k < 10; k++) { const t = (k / 9 - 0.5) * span; lamp.push(V(cxm - uz * t, level + 11, czm + ux * t)); }
      lights.push({ pts: lamp, color: 0xffc27a, size: 0.9 });
      placed.push({ name: 'dam',  x, z, r: 700 });
    }
  }

  // ════════ Телебашня в городе (≈ 360 м) ════════
  {
    const T = TOWNS[0], a = 2.2, x = T.x + Math.cos(a) * T.r * 0.82, z = T.z + Math.sin(a) * T.r * 0.82, y = terrainH(x, z) - 2;
    const f = frame(x, z, y, 0);
    f.P(lathe([[26, 0], [18, 20], [9, 70], [6.2, 250], [5.2, 300], [2.6, 300]], 20), 0xd9d6ce, 0, 0, 0);          // бетонный ствол
    for (const [yy, r, h, c] of [[228, 17, 14, 0xc9c6be], [242, 15, 3, 0x5c6a78], [252, 12, 8, 0xc9c6be]]) f.P(CYL(r, r, h, 24), c, 0, yy, 0);
    f.L(CYL(16.4, 16.4, 9, 24), 0x7fa6c4, 0, 232, 0);                                                              // остеклённый ресторан
    for (let k = 0; k < 6; k++) f.P(CYL(2.2 - k * 0.3, 2.4 - k * 0.3, 11), k % 2 ? 0xeeeeea : 0xc2352b, 0, 300 + k * 11, 0); // антенна
    lights.push({ pts: [V(x, y + 368, z), V(x, y + 300, z), V(x, y + 256, z)], color: 0xff2a18, size: 2.6, blink: true, always: true });
    placed.push({ name: 'tv',  x, z, r: 60 });
  }

  // ════════ АЭС на берегу: два реактора, машинный зал, четыре градирни с паром, труба ════════
  {
    const s = findSite(700, () => { const a = R() * Math.PI * 2, d = 2500 + R() * 8000, x = Math.cos(a) * d, z = Math.sin(a) * d; if (!free(x, z, 500) || !inMap(x, z, 800)) return null; const f = flat(x, z, 330); if (f.rng > 38 || f.lo < W + 6 || f.lo > 350) return null; const sd = shoreDir(x, z, 1200); return sd ? { x, z, f, sd } : null; },
      (c) => -c.f.rng);
    if (s) {
      const y0 = s.f.hi + 0.5, rot = s.sd.a + Math.PI / 2, f = frame(s.x, s.z, y0, rot);
      f.P(BOX, 0x62645e, 0, -(y0 - s.f.lo) - 1, 0, 0, 0, 0, 760, y0 - s.f.lo + 1.2, 580);
      for (const lx of [-120, 30]) { f.P(CYL(26, 26, 48, 28), 0xd8d5cc, lx, 0, -80); f.P(new THREE.SphereGeometry(26, 28, 12, 0, Math.PI * 2, 0, Math.PI / 2), 0xe2dfd6, lx, 48, -80); }
      f.P(BOX, 0x9ba3aa, -45, 0, 30, 0, 0, 0, 230, 34, 55); f.P(BOX, 0x6f7a84, -45, 34, 30, 0, 0, 0, 232, 2, 57);
      for (const [lx, lz] of [[-260, 190], [-120, 220], [60, 230], [200, 200]]) {
        f.P(hyperboloid(58, 155), 0xc7c3ba, lx, 0, lz); const [x, z] = f.at(lx, lz); emitters.push({ x, y: y0 + 158, z, kind: 'steamL' });
      }
      for (let k = 0; k < 10; k++) f.P(CYL(4.4 - k * 0.2, 4.6 - k * 0.2, 15, 14), k % 2 ? 0xe8e6e0 : 0xb33a2e, 180, k * 15, -120);
      for (let i = 0; i < 24; i++) f.P(BOX, 0x8a8f94, 260 + (i % 6) * 18, 0, -40 + Math.floor(i / 6) * 22, 0, 0, 0, 4, 9, 4); // распредустройство
      const [cx, cz] = f.at(180, -120); lights.push({ pts: [V(cx, y0 + 152, cz)], color: 0xff2a18, size: 2.4, blink: true, always: true });
      placed.push({ name: 'npp',  x: s.x, z: s.z, r: 520 });
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

  // ════════ Военная база: ангары, казармы, ЗРК, РЛС с вращающейся антенной, вертолётная площадка ════════
  if (lvl >= 1) {
    const s = findSite(260, () => { const a = R() * Math.PI * 2, d = 3000 + R() * 7500, x = Math.cos(a) * d, z = Math.sin(a) * d; if (!free(x, z, 450) || !inMap(x, z, 600)) return null; const f = flat(x, z, 330); if (f.rng > 16 || f.lo < W + 25 || f.lo > 750) return null; return { x, z, f }; }, (c) => -c.f.rng);
    if (s) {
      const y0 = s.f.hi + 0.3, f = frame(s.x, s.z, y0, R() * Math.PI);
      f.P(BOX, 0x66694f, 0, -(y0 - s.f.lo) - 1, 0, 0, 0, 0, 690, y0 - s.f.lo + 1.3, 530);
      for (let k = 0; k < 4; k++) { f.P(new THREE.CylinderGeometry(18, 18, 50, 16, 1, false, 0, Math.PI), 0x5d6450, -220 + k * 60, 0, -150, Math.PI / 2, 0, Math.PI / 2); }
      for (let k = 0; k < 5; k++) f.P(BOX, 0x8b8a78, 60 + (k % 3) * 60, 0, -170 + Math.floor(k / 3) * 50, 0, 0, 0, 44, 9, 18);
      for (const [lx, lz] of [[-200, 140], [-120, 180], [-40, 140]]) { // пусковые ЗРК: шасси и 4 трубы под углом
        f.P(BOX, 0x4f5a40, lx, 0, lz, 0, 0, 0, 5, 3.2, 12);
        for (let t = 0; t < 4; t++) f.P(CYL(0.9, 0.9, 9, 8), 0x5d6a4a, lx - 1.5 + (t % 2) * 3, 3.4 + Math.floor(t / 2) * 2, lz + 2, -1.0, 0, 0);
      }
      f.P(CYL(3, 3, 18, 10), 0x6d7560, 120, 0, 150); // вышка РЛС
      const [rx_, rz_] = f.at(120, 150), dish = new THREE.Mesh(mergeParts([part(new THREE.BoxGeometry(22, 7, 1.2), 0xd8dccf, M(0, 0, 0, 0.2, 0, 0)), part(new THREE.BoxGeometry(2, 3, 3), 0x5a6250, M(0, -3, 0))]), new THREE.MeshLambertMaterial({ vertexColors: true }));
      dish.position.set(rx_, y0 + 22, rz_); add(dish); anim.push({ o: dish, axis: 'y', w: 1.3 });
      f.P(CYL(14, 14, 0.4, 24), 0x3d4034, 200, 0, -40); f.P(CYL(11, 11, 0.45, 24), 0xe8e8e0, 200, 0, -40); f.P(CYL(9.5, 9.5, 0.5, 24), 0x3d4034, 200, 0, -40);
      for (let k = 0; k < 48; k++) { const t = (k + 0.5) / 48 * Math.PI * 2, lx = Math.cos(t) * 350, lz = Math.sin(t) * 270; f.P(BOX, 0x8a8a80, lx, 0, lz, 0, -Math.atan2(Math.cos(t) * 270, -Math.sin(t) * 350), 0, 42, 2.6, 0.4); } // ограда по периметру
      placed.push({ name: 'base',  x: s.x, z: s.z, r: 380 });
    }
  }

  // ════════ Второй аэродром: полоса 2,4 км на насыпи, рулёжка, ангары, диспетчерская вышка ════════
  if (lvl >= 1) {
    const s = findSite(900, () => { const a = R() * Math.PI * 2, d = 3500 + R() * 7000, x = Math.cos(a) * d, z = Math.sin(a) * d, rot = R() * Math.PI;
      if (Math.hypot(x - AIRFIELD.x, z - AIRFIELD.z) < 5000 || !free(x, z, 1150) || !inMap(x, z, 1200)) return null;
      let lo = 1e9, hi = -1e9; for (let t = -1150; t <= 1150; t += 100) for (const o of [-60, 60]) { const h = terrainH(x + Math.cos(rot) * t - Math.sin(rot) * o, z + Math.sin(rot) * t + Math.cos(rot) * o); lo = Math.min(lo, h); hi = Math.max(hi, h); }
      if (lo < W + 15 || hi - lo > 50) return null; return { x, z, rot, lo, hi }; }, (c) => -(c.hi - c.lo));
    if (s) {
      const y0 = s.hi + 0.6, f = frame(s.x, s.z, y0, s.rot + Math.PI / 2); // локально полоса вдоль z
      f.P(BOX, 0x5f6e44, 0, -(y0 - s.lo) - 2, 0, 0, 0, 0, 120, y0 - s.lo + 1.5, 2300);    // насыпь
      f.P(BOX, 0x34373a, 0, -0.5, 0, 0, 0, 0, 45, 0.6, 2200);
      for (let k = -10; k <= 10; k++) f.P(BOX, 0xe8e8e0, 0, 0.12, k * 100, 0, 0, 0, 1.2, 0.05, 36);
      for (const sgn of [-1, 1]) for (let k = 0; k < 6; k++) f.P(BOX, 0xe8e8e0, (k - 2.5) * 5, 0.12, sgn * 1060, 0, 0, 0, 2.4, 0.05, 28);
      f.P(BOX, 0x44474a, 90, -0.55, 0, 0, 0, 0, 20, 0.6, 2000); f.P(BOX, 0x4a4d50, 150, -0.55, -500, 0, 0, 0, 120, 0.6, 260);
      for (let k = 0; k < 3; k++) { f.P(BOX, 0x7d8378, 200, 0, -600 + k * 90, 0, 0, 0, 44, 14, 60); f.P(new THREE.CylinderGeometry(22, 22, 60, 16, 1, false, 0, Math.PI), 0x6b7169, 200, 14, -600 + k * 90, Math.PI / 2, 0, Math.PI / 2); }
      f.P(BOX, 0xd9d6ce, 160, 0, -300, 0, 0, 0, 8, 26, 8); f.L(CYL(7, 6, 5, 8), 0x7fa6c4, 160, 26, -300); f.P(CYL(7.5, 7.5, 1, 8), 0x5b636b, 160, 31, -300);
      const lamp = []; for (let k = -11; k <= 11; k++) for (const o of [-24, 24]) { const [x, z] = f.at(o, k * 100); lamp.push(V(x, y0 + 1, z)); } lights.push({ pts: lamp, color: 0xffd49a, size: 0.7 });
      placed.push({ name: 'airfield2',  x: s.x, z: s.z, r: 1300 });
    }
  }

  // ════════ Карьер на склоне: светлые уступы (рисует шейдер земли), отвалы, самосвалы, экскаватор ════════
  let quarry = null;
  if (lvl >= 1) {
    const s = findSite(220, () => { const a = R() * Math.PI * 2, d = 3000 + R() * 7000, x = Math.cos(a) * d, z = Math.sin(a) * d; if (!free(x, z, 450) || !inMap(x, z, 600)) return null; const f = flat(x, z, 300); if (f.lo < W + 60 || f.hi > 800 || f.rng < 25 || f.rng > 110) return null; return { x, z, f }; }, (c) => -Math.abs(c.f.rng - 60));
    if (s) {
      quarry = { x: s.x, z: s.z, r: 360 };
      const f = frame(s.x, s.z, 0, R() * 6);
      for (const [lx, lz, r, h] of [[330, 60, 70, 40], [300, -120, 55, 32], [380, -20, 45, 26]]) { const [x, z] = f.at(lx, lz); parts.push(part(new THREE.ConeGeometry(r, h, 12), 0x8a7d68, M(x, terrainH(x, z) + h / 2 - 3, z))); }
      for (const [lx, lz, ry] of [[-60, 40, 0.3], [40, -80, 1.8], [120, 90, 2.9]]) { const [x, z] = f.at(lx, lz), y = terrainH(x, z); parts.push(part(BOX, 0xd8a52a, M(x, y, z, 0, ry, 0, 5, 4, 10))); parts.push(part(BOX, 0x6a6258, M(x, y + 4, z, 0, ry, 0, 4.6, 2.5, 6))); }
      { const [x, z] = f.at(-10, -10), y = terrainH(x, z); parts.push(part(BOX, 0xd8a52a, M(x, y, z, 0, 0.7, 0, 7, 5, 9)), part(BOX, 0xd8a52a, M(x + 6, y + 6, z + 6, 0.5, 0.7, 0, 1.8, 1.8, 16))); }
      placed.push({ name: 'quarry',  x: s.x, z: s.z, r: 400 });
    }
  }

  // ════════ Солнечная электростанция: ряды панелей на южном склоне ════════
  if (lvl >= 1) {
    const s = findSite(200, () => { const a = R() * Math.PI * 2, d = 2500 + R() * 7500, x = Math.cos(a) * d, z = Math.sin(a) * d; if (!free(x, z, 260) || !inMap(x, z, 400)) return null; const f = flat(x, z, 200); if (f.rng > 18 || f.lo < W + 15 || f.lo > 700) return null; return { x, z, f }; }, (c) => -c.f.rng);
    if (s) {
      for (let r = 0; r < 14; r++) for (let c = 0; c < 34; c++) { const x = s.x - 190 + c * 11.5, z = s.z - 160 + r * 23, y = terrainH(x, z) + 1.6; panels.push(M(x, y, z, -0.52, 0, 0, 10.5, 0.25, 4.6)); }
      for (let k = 0; k < 4; k++) parts.push(part(BOX, 0xd0d0c8, M(s.x + 215, terrainH(s.x + 215, s.z - 120 + k * 80), s.z - 120 + k * 80, 0, 0, 0, 6, 3, 10)));
      placed.push({ name: 'solar',  x: s.x, z: s.z, r: 250 });
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

  // ════════ Монастырь на холме: белые стены с башнями, собор с золотыми и синими куполами, колокольня ════════
  {
    const s = findSite(260, () => { const T = TOWNS[2 + ((R() * 2) | 0)], a = R() * Math.PI * 2, d = T.r + 600 + R() * 2400, x = T.x + Math.cos(a) * d, z = T.z + Math.sin(a) * d; if (!free(x, z, 120) || !inMap(x, z, 400)) return null; const f = flat(x, z, 90); if (f.rng > 16 || f.lo < W + 40) return null; return { x, z, f }; }, (c) => c.f.hi);
    if (s) {
      const y0 = s.f.lo - 0.5, f = frame(s.x, s.z, y0, R() * Math.PI);
      for (const [lx, lz, w, d] of [[0, -58, 150, 3], [0, 58, 150, 3], [-75, 0, 3, 116], [75, 0, 3, 116]]) f.P(BOX, 0xe2ddd0, lx, 0, lz, 0, 0, 0, w, 10 + (s.f.hi - s.f.lo), d);
      for (const [lx, lz] of [[-75, -58], [75, -58], [-75, 58], [75, 58]]) { f.P(CYL(5, 5, 18, 12), 0xe2ddd0, lx, 0, lz); f.P(new THREE.ConeGeometry(6, 9, 12), 0x3f7a55, lx, 22.5, lz); }
      f.P(BOX, 0xe8e4d8, 0, 0, 0, 0, 0, 0, 30, 22, 40); f.P(CYL(8, 8, 12, 16), 0xe8e4d8, 0, 22, 0);
      f.G(onion(7.5), 0xd8a62e, 0, 34, 0); f.G(CYL(0.4, 0.4, 6, 6), 0xd8a62e, 0, 49, 0);
      for (const [lx, lz] of [[-10, -12], [10, -12], [-10, 12], [10, 12]]) { f.P(CYL(3.6, 3.6, 7, 12), 0xe8e4d8, lx, 22, lz); f.P(onion(3.8), 0x2f5aa8, lx, 29, lz); }
      f.P(BOX, 0xe8e4d8, 0, 0, 34, 0, 0, 0, 10, 36, 10); f.P(BOX, 0xe8e4d8, 0, 36, 34, 0, 0, 0, 8, 10, 8); f.G(new THREE.ConeGeometry(4.2, 18, 8), 0xd8a62e, 0, 55, 34);
      placed.push({ name: 'monastery',  x: s.x, z: s.z, r: 130 });
    }
  }

  // ════════ Стадион у города: чаша трибун, поле, мачты освещения ════════
  if (lvl >= 1) {
    const s = findSite(200, () => { const T = TOWNS[(R() * TOWNS.length) | 0], a = R() * Math.PI * 2, d = T.r + 150 + R() * 700, x = T.x + Math.cos(a) * d, z = T.z + Math.sin(a) * d; if (!free(x, z, 170)) return null; const f = flat(x, z, 150); if (f.rng > 12 || f.lo < W + 8) return null; return { x, z, f }; }, (c) => -c.f.rng);
    if (s) {
      const y0 = s.f.hi, f = frame(s.x, s.z, y0, R() * Math.PI), N = 44;
      f.P(BOX, 0x3f8a3a, 0, -0.5, 0, 0, 0, 0, 72, 0.6, 108); for (const lz of [-54, 0, 54]) f.P(BOX, 0xe8e8e0, 0, 0.12, lz, 0, 0, 0, 72, 0.05, 0.6);
      f.P(BOX, 0x9a4b3a, 0, -0.55, 0, 0, 0, 0, 100, 0.6, 150);
      // чаша трибун: профиль (ступени от поля к верхней кромке и наружная стена) вращением, сжата в овал
      const bowl = [[62, 0], [62, 3], [70, 7], [80, 13], [90, 19], [98, 25], [100, 26], [100, 0]], seats = [[64, 3.2], [72, 7.4], [82, 13.4], [92, 19.4], [96, 22]];
      for (const pr of [bowl, bowl.slice().reverse()]) f.P(lathe(pr, 48), 0xa9afb6, 0, 0, 0, 0, 0, 0, 1, 1, 1.32);   // двусторонняя чаша
      for (const pr of [seats, seats.slice().reverse()]) f.P(lathe(pr, 48), 0x2f6fb0, 0, 0.3, 0, 0, 0, 0, 1, 1, 1.32); // сиденья
      const lamp = [];
      for (const [lx, lz] of [[-95, -125], [95, -125], [-95, 125], [95, 125]]) { f.P(CYL(1.2, 1.6, 50, 8), 0x9aa0a6, lx, 0, lz); f.P(BOX, 0x5b636b, lx, 50, lz, 0, 0, 0, 10, 5, 1.5); const [x, z] = f.at(lx, lz); lamp.push(V(x, y0 + 53, z)); }
      lights.push({ pts: lamp, color: 0xfff4e0, size: 2.6 });
      placed.push({ name: 'stadium',  x: s.x, z: s.z, r: 180 });
    }
  }

  // ════════ Сборка статики: по одному мешу на материал ════════
  const solid = new THREE.MeshLambertMaterial({ vertexColors: true });
  const mk = (list, mat) => { if (!list.length) return null; const g = mergeParts(list); g.boundingSphere = new THREE.Sphere(V(0, 300, 0), WORLD.SIZE); const m = add(new THREE.Mesh(g, mat)); m.castShadow = m.receiveShadow = !!P.shadows; return m; };
  mk(parts, solid);
  mk(gold, P.pbr ? new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 1, roughness: 0.28, envMapIntensity: 1.2 }) : solid);
  mk(glass, P.pbr ? new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.2, roughness: 0.08, envMapIntensity: 1.1 }) : solid);
  if (panels.length) {
    const im = new THREE.InstancedMesh(BOX, P.pbr ? new THREE.MeshStandardMaterial({ color: lin(0x16233a), metalness: 0.35, roughness: 0.18, envMapIntensity: 1.1 }) : new THREE.MeshLambertMaterial({ color: lin(0x1d2b44) }), panels.length);
    panels.forEach((m, i) => im.setMatrixAt(i, m)); im.instanceMatrix.needsUpdate = true; im.geometry = BOX.clone(); im.geometry.boundingSphere = new THREE.Sphere(V(0, 300, 0), WORLD.SIZE);
    im.receiveShadow = !!P.shadows; add(im);
  }
  if (lines.length) { // ванты моста — тонкие цилиндры (линия в 1 пиксель вблизи смотрится бедно)
    const cp = []; for (let i = 0; i < lines.length; i += 2) { const a = lines[i], b = lines[i + 1], len = a.distanceTo(b), mid = a.clone().add(b).multiplyScalar(0.5);
      const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), b.clone().sub(a).normalize()); cp.push(part(new THREE.CylinderGeometry(0.35, 0.35, len, 5), 0xe9ebee, new THREE.Matrix4().compose(mid, q, V(1, 1, 1)))); }
    mk(cp, solid);
  }

  // ════════ Лодки на воде и стаи птиц ════════
  const boats = [], flocks = [];
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
    const birdGeo = new THREE.BufferGeometry(); birdGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -0.3, -1.1, 0.25, 0.2, 0, 0, 0.35, 0, 0, -0.3, 1.1, 0.25, 0.2, 0, 0, 0.35], 3)); birdGeo.computeVertexNormals();
    const birdMat = new THREE.MeshBasicMaterial({ color: lin(0x1e2226), side: THREE.DoubleSide });
    for (let k = 0; k < 200 && flocks.length < 4; k++) {
      const x = (R() - 0.5) * 18000, z = (R() - 0.5) * 18000, g = terrainH(x, z); if (g > 700 || !inMap(x, z, 800)) continue;
      if (flocks.some((f) => Math.hypot(f.x - x, f.z - z) < 3000)) continue;
      const n = 14, im = new THREE.InstancedMesh(birdGeo, birdMat, n); im.frustumCulled = false; add(im);
      flocks.push({ im, x, z, n, alt: 120 + R() * 180, rad: 250 + R() * 250, t: R() * 6, w: 0.05 + R() * 0.04, off: Array.from({ length: n }, () => [R() * 30 - 15, R() * 8 - 4, R() * 30 - 15, R() * 6]) });
    }
  }

  // огни (как в props.js): HDR-точки, светятся в сумерках; blink — мигают
  const lightMeshes = lights.map((L) => {
    const g = new THREE.SphereGeometry(L.size, 6, 4), m = new THREE.MeshBasicMaterial({ color: lin(L.color).multiplyScalar(8) });
    const im = new THREE.InstancedMesh(g, m, L.pts.length), mm = new THREE.Matrix4();
    L.pts.forEach((p, i) => im.setMatrixAt(i, mm.makeTranslation(p.x, p.y, p.z))); im.instanceMatrix.needsUpdate = true;
    g.boundingSphere = new THREE.Sphere(V(0, 300, 0), WORLD.SIZE); add(im); return { im, L };
  });

  let t = 0; const mm = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = V(1, 1, 1), p = V(0, 0, 0);
  return {
    emitters, quarry, bridge, rivers, sites: placed,
    // dt — шаг, night — темнота 0…1, cam — положение камеры, wake(x, y, z, dx, dz) — пена за лодкой (частицы main.js)
    update(dt, night, cam, wake) {
      t += dt;
      for (const a of anim) a.o.rotation.y += a.w * dt;
      for (const { im, L } of lightMeshes) im.visible = (L.always || night > 0.25) && (!L.blink || (t % 1.6) < 0.8);
      if (beacon) { beacon.a += dt * 0.9; beacon.beam.rotation.y = beacon.a; beacon.beam.visible = night > 0.2; }
      for (const b of boats) {
        b.t += b.w * dt; const x = b.x + Math.cos(b.t) * b.rad, z = b.z + Math.sin(b.t) * b.rad, dx = -Math.sin(b.t) * Math.sign(b.w), dz = Math.cos(b.t) * Math.sign(b.w);
        b.m.position.set(x, W + 0.2 + Math.sin(t * 1.3 + b.x) * 0.15, z); b.m.rotation.set(0, Math.atan2(-dx, -dz), Math.sin(t * 0.9 + b.z) * 0.03);
        if (wake && cam && Math.hypot(x - cam.x, z - cam.z) < 3000) wake(x - dx * 7, W + 0.3, z - dz * 7, dx, dz);
      }
      for (const f of flocks) {
        const near = cam && Math.hypot(f.x - cam.x, f.z - cam.z) < 2500; f.im.visible = !!near; if (!near) continue;
        f.t += f.w * dt; const cx = f.x + Math.cos(f.t) * f.rad, cz = f.z + Math.sin(f.t) * f.rad, cy = terrainH(cx, cz) + f.alt, yaw = Math.atan2(Math.sin(f.t), -Math.cos(f.t)) + Math.PI;
        f.off.forEach(([ox, oy, oz, ph], i) => {
          const flap = 0.35 + 0.65 * Math.abs(Math.sin(t * 7 + ph));
          p.set(cx + ox + Math.sin(t * 0.7 + ph) * 3, cy + oy + Math.sin(t * 1.1 + ph) * 1.5, cz + oz); q.setFromEuler(e.set(0, yaw, 0)); sc.set(1.6, 1.6 * flap, 1.6);
          f.im.setMatrixAt(i, mm.compose(p, q, sc));
        });
        f.im.instanceMatrix.needsUpdate = true;
      }
    },
  };
}
