// Осенняя карта «Туманная топь» (map-autumn.js) — отрисовка земли, погода, лес, дороги и вода болота. Остальное (небо, свет,
// облака, дома, объекты) — общее с городом (city-render.js). Земля: сухая трава (деталь вблизи и снимок с высоты), опавшая
// листва в лесу и рыжая крона издали, грязь на дне оврагов и в болоте, пашня и тыквенные поля, скалы Лысой горы; туман
// стелется в низинах (над болотом и в оврагах) — гуще в сумерках. Нормали — из сетки высот (50 м).
/* global THREE */
import { tr } from './i18n.js?v=20261022r';
import { ZONE } from './city.js?v=20261022r';
import { AUTUMN } from './map-autumn.js?v=20261022r';

// погода (панорамы — Poly Haven, CC0): осенний вечер (низкое солнце, голый лес у горизонта), сумерки (закат под облаками),
// туман (пасмурно, всё в молоке). lowFog — плотность тумана в низинах (шейдер земли), 0…1
export function autumnWeathers(W) {
  const D = W.day, O = W.overcast;
  return {
    a_eve: { ...D, name: tr('Осенний вечер'), el: 9.8, az: 245, sun: 0xffc890, sunI: 0.95, sky: 0x9aa6b8, gnd: 0x6a5a48, hemiI: 0.7, zenith: 0x5a74a0, horizon: 0xe8cdb0,
      haze: 0xffb878, hazeK: 0.35, fog: 0xc8b8a8, fogD: 0.00007, clouds: 0.3, cloudLit: 0xffe0c0, cloudDark: 0x8a8090, hdri: { f: 'a_field', u: 0.6097, k: 1, h0: 0.02 }, autumn: 1, lowFog: 0.55 },
    a_dusk: { ...D, name: tr('Сумерки'), el: 4, az: 250, sun: 0xff9a5a, sunI: 0.7, sky: 0x8a8aa8, gnd: 0x5a5058, hemiI: 1.05, zenith: 0x3c4670, horizon: 0xe0a080,
      haze: 0xff8a50, hazeK: 0.45, fog: 0x6c6474, fogD: 0.00011, clouds: 0.45, cloudLit: 0xffb890, cloudDark: 0x5a5468, hdri: { f: 'a_belf', u: 0.6047, k: 0.75, h0: 0.01 }, autumn: 1, lowFog: 0.85 },
    a_fog: { ...O, name: tr('Туман'), sun: 0xd8d0c8, sunI: 0.35, sky: 0x9c9a98, gnd: 0x5c5650, hemiI: 1.0, zenith: 0x8a8886, horizon: 0xaaa6a0,
      fog: 0xa8a49e, fogD: 0.00024, clouds: 0.6, cloudLit: 0xc8c4be, cloudDark: 0x7c7874, autumn: 1, lowFog: 1 },
  };
}
export const AUTUMN_KEYS = ['a_eve', 'a_dusk', 'a_fog'];

// районы → две текстуры. tZ: r — лес, g — вода, b — площадки и деревня-объекты, a — деревня; tZ2: r — врезка оврага (÷60 м),
// g — пашня, b — тыквенное поле, a — болото (суша в котловине)
export function autumnZoneTex(city, size) {
  const H = 16000, d = new Uint8Array(size * size * 4), d2 = new Uint8Array(size * size * 4);
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
    const x = -H + (i + 0.5) * 2 * H / size, z = -H + (j + 0.5) * 2 * H / size, zn = city.zoneAt(x, z), q = (j * size + i) * 4, f = city.inField(x, z);
    d[q] = zn === ZONE.PARK ? 255 : 0; d[q + 1] = zn === ZONE.WATER ? 255 : 0; d[q + 2] = zn === ZONE.AIR || zn === ZONE.IND ? 255 : 0; d[q + 3] = zn === ZONE.LOW ? 255 : 0;
    d2[q] = Math.min(255, city.ravineAt(x, z) / 60 * 255); d2[q + 1] = f && !f.pumpkin ? 255 : 0; d2[q + 2] = f && f.pumpkin ? 255 : 0; d2[q + 3] = city.basinD(x, z) < 1.05 ? 255 : 0;
  }
  const mk = (a) => { const t = new THREE.DataTexture(a, size, size, THREE.RGBAFormat); t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.flipY = false; t.needsUpdate = true; return t; };
  return [mk(d), mk(d2)];
}
// текстуры осени (tex/a_*.jpg — Poly Haven и ambientCG, CC0) и скалы — общие с зимой
const ATEX = { aG: 'a_grass', aGN: 'a_grass_n', aGA: 'a_grassA', aL: 'a_leaves', aM: 'a_mud', aMA: 'a_mudA', aF: 'a_field', aRk: 'w_rock', aRA: 'w_rockA' };
export function autumnTextures(aniso, stats) {
  const U = {};
  for (const [u, f] of Object.entries(ATEX)) {
    const t = new THREE.Texture(); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = aniso; t.minFilter = THREE.LinearMipmapLinearFilter; U[u] = { value: t };
    if (typeof createImageBitmap !== 'function' || typeof fetch !== 'function') continue;
    if (stats) stats.req++;
    fetch(new URL(`./tex/${f}.jpg?v=20261023a`, import.meta.url)).then((r) => (r.ok ? r.blob() : Promise.reject(new Error(f)))).then((b) => createImageBitmap(b))
      .then((bmp) => { t.image = bmp; t.needsUpdate = true; if (stats) stats.done++; }).catch((e) => { if (stats) stats.done++; console.warn('осенняя текстура не загрузилась:', e.message); });
  }
  return U;
}
// материал земли: Phong (свет, тени, туман — как у остального), цвет и нормаль — в шейдере
export function autumnGroundMaterial(city, zt, nt, ENV, AT, W) {
  const H = 16000, BA = AUTUMN.BALD, fogC = new THREE.Color(W.fog).convertSRGBToLinear();
  const m = new THREE.MeshPhongMaterial({ color: 0xffffff, specular: 0x0c0c0a, shininess: 10 }); m.userData.AT = AT;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, AT, { uCam: ENV.uCam, tZ: { value: zt[0] }, tZ2: { value: zt[1] }, tNm: { value: nt },
      uBald: { value: new THREE.Vector3(BA.x, BA.z, BA.r) }, uLow: { value: new THREE.Vector4(fogC.r, fogC.g, fogC.b, W.lowFog ?? 0.5) } });
    sh.vertexShader = 'varying vec3 vWp;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n vWp = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = `varying vec3 vWp; uniform vec3 uCam, uBald; uniform vec4 uLow; uniform sampler2D tZ, tZ2, tNm, aG, aGN, aGA, aL, aM, aMA, aF, aRk, aRA;
      float lum(vec3 c) { return dot(c, vec3(0.3, 0.59, 0.11)); }
      float hs(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(hs(i), hs(i + vec2(1, 0)), f.x), mix(hs(i + vec2(0, 1)), hs(i + vec2(1, 1)), f.x), f.y); }
      vec3 wN; float aLow;
` + sh.fragmentShader
      .replace('#include <color_fragment>', `#include <color_fragment>
  vec2 mp = (vWp.xz + ${H.toFixed(1)}) / ${(2 * H).toFixed(1)};
  vec4 Z = texture2D(tZ, mp), Z2 = texture2D(tZ2, mp); wN = normalize(texture2D(tNm, mp).xyz * 2.0 - 1.0);
  float slope = 1.0 - wN.y, hgt = vWp.y, dist = length(vWp - uCam), near = 1.0 - smoothstep(200.0, 1200.0, dist);
  // сухой луг: охра и оливковые пятна; рисунок — снимок с высоты (два масштаба) и сухая трава вблизи
  float gA = lum(texture2D(aGA, vWp.xz / 260.0).rgb), gA2 = lum(texture2D(aGA, vWp.xz / 1300.0 + 0.37).rgb);
  vec3 dG = texture2D(aG, vWp.xz / 5.0).rgb, dG2 = texture2D(aG, vWp.xz / 31.0 + 0.21).rgb; dG = vec3(lum(dG)) * 0.6 + dG * 0.4;
  vec3 grass = mix(vec3(0.15, 0.135, 0.06), vec3(0.095, 0.105, 0.045), smoothstep(0.3, 0.7, vn(vWp.xz / 420.0) * 0.7 + gA2 * 0.6 - 0.15));
  // пятна разной травы (ветошь, побуревшая, зеленоватая отава, рыжий клевер) — на 15–80 м, чтобы и с высоты луг был живой
  float pv = vn(vWp.xz / 80.0) * 0.6 + vn(vWp.xz / 17.0) * 0.4;
  grass *= pv < 0.35 ? vec3(0.85, 0.95, 0.8) : pv < 0.55 ? vec3(1.0) : pv < 0.72 ? vec3(1.18, 1.05, 0.85) : vec3(1.2, 0.85, 0.65);
  grass *= (0.55 + 0.9 * gA) * mix(0.75 + 0.9 * lum(dG2), 1.0, near * 0.5) * mix(1.0, 0.3 + 2.4 * lum(dG), 0.6 * near) * mix(vec3(1.0), dG / max(lum(dG), 0.05), 0.3 * near);
  // скалы: крутые склоны и голая Лысая гора (там же — бледная выгоревшая трава)
  float rA = lum(texture2D(aRA, vWp.xz / 300.0).rgb), rl = lum(texture2D(aRk, vWp.xz / 24.0).rgb);
  vec3 rock = vec3(0.12, 0.11, 0.095) * (0.55 + 0.9 * rA) * mix(1.0, 0.6 + 0.8 * rl, near);
  float bald = 1.0 - smoothstep(uBald.z * 0.45, uBald.z * 0.85, distance(vWp.xz, uBald.xy) + 120.0 * (vn(vWp.xz / 90.0) - 0.5));
  grass = mix(grass, grass * vec3(1.35, 1.25, 1.0) + 0.02, bald * 0.7);
  float rk = smoothstep(0.32, 0.5, slope + 0.14 * (rA - 0.5) + 0.1 * (vn(vWp.xz / 60.0) - 0.5));
  rk = max(rk, bald * smoothstep(0.12, 0.28, slope + 0.2 * (rA - 0.5)) * 0.85);
  vec3 col = mix(grass, rock, rk);
  // болото (суша в котловине): мох, осока, торф — тёмные бурые и оливковые пятна; вблизи — грязь с листвой
  float mA = lum(texture2D(aMA, vWp.xz / 200.0).rgb);
  vec3 bog = mix(vec3(0.045, 0.05, 0.022), vec3(0.085, 0.08, 0.03), vn(vWp.xz / 70.0) * 0.7 + vn(vWp.xz / 13.0) * 0.3) * (0.6 + 0.8 * mA); // мох и осока
  bog = mix(bog, vec3(0.13, 0.11, 0.05), smoothstep(0.62, 0.8, vn(vWp.xz / 25.0)) * 0.6); // сухая осока куртинами
  bog = mix(bog, bog * (0.5 + 1.2 * lum(dG)) * vec3(0.95, 1.05, 0.8), 0.6 * near);
  col = mix(col, bog, smoothstep(0.3, 0.8, Z2.a + 0.25 * (vn(vWp.xz / 150.0) - 0.5)) * (1.0 - smoothstep(4.0, 9.0, hgt - ${AUTUMN.WY.toFixed(1)})));
  // дно оврага: сырая грязь и палая листва (где врезка глубже, а земля ниже краёв)
  float rv = smoothstep(0.6, 0.85, Z2.r + 0.15 * (vn(vWp.xz / 40.0) - 0.5)) * (1.0 - smoothstep(0.12, 0.28, slope)); // только дно (врезка глубже ~35 м и полого)
  vec3 mud = texture2D(aM, vWp.xz / 5.0).rgb * 0.5 * mix(1.0, 0.7 + 0.6 * mA, 1.0 - near);
  col = mix(col, mud, rv * 0.75);
  // лес: издали — рыжая, жёлтая, бурая крона и серый сухостой пятнами (импосторы редкие), вблизи под деревьями — листва
  float fr = smoothstep(0.2, 0.8, Z.r + 0.5 * (vn(vWp.xz / 160.0) - 0.5) + 0.3 * (vn(vWp.xz / 45.0) - 0.5)), far = smoothstep(300.0, 1600.0, dist);
  float ch = vn(vWp.xz / 38.0) * 0.65 + vn(vWp.xz / 9.0) * 0.35;
  vec3 canopy = ch < 0.3 ? vec3(0.28, 0.08, 0.015) : ch < 0.5 ? vec3(0.34, 0.17, 0.02) : ch < 0.7 ? vec3(0.3, 0.24, 0.035) : ch < 0.86 ? vec3(0.19, 0.1, 0.035) : vec3(0.12, 0.1, 0.08);
  canopy = mix(canopy, vec3(0.03, 0.05, 0.03), step(0.9, vn(vWp.xz / 260.0 + 3.1))); // кое-где ельник
  vec3 litter = texture2D(aL, vWp.xz / 4.0).rgb * 0.6;
  col = mix(col, canopy * (0.75 + 0.5 * vn(vWp.xz / 14.0)), fr * far * 0.85);
  col = mix(col, mix(col, litter, 0.7), fr * (1.0 - far));
  // поля: пашня (бурые борозды) и тыквенные (вблизи — оранжевые точки по рядам, вдали — рыжий отлив)
  vec3 fld = texture2D(aF, vWp.xz / 9.0).rgb * 0.55 * mix(0.9, 1.1, vn(vWp.xz / 30.0));
  float pf = smoothstep(0.3, 0.7, Z2.b), pl = smoothstep(0.3, 0.7, Z2.g);
  col = mix(col, fld, max(pl, pf) * 0.9);
  vec2 pc = floor(vWp.xz / 2.2); float pk = step(0.62, hs(pc)) * (1.0 - smoothstep(0.25, 0.45, length(fract(vWp.xz / 2.2) - 0.5)));
  col = mix(col, vec3(0.55, 0.16, 0.01), pf * mix(0.18, pk, near));
  // площадки и деревня: утоптанная земля и гравий
  vec2 jo = (vec2(vn(vWp.xz / 70.0), vn(vWp.xz / 70.0 + 5.3)) - 0.5) * 100.0;
  float zb = smoothstep(0.3, 0.8, texture2D(tZ, (vWp.xz + jo + ${H.toFixed(1)}) / ${(2 * H).toFixed(1)}).b + 0.3 * (vn(vWp.xz / 45.0) - 0.5));
  float za = smoothstep(0.1, 0.9, Z.a + 0.4 * (vn(vWp.xz / 80.0) - 0.5));
  vec3 dirt = texture2D(aM, vWp.xz / 6.0).rgb * 0.5 * vec3(1.05, 1.0, 0.92);
  col = mix(col, dirt, zb * 0.85); col = mix(col, mix(col, dirt, 0.45), za * 0.6);
  // туман в низинах: над болотом и в оврагах — плотная пелена (вдали сильнее, вблизи — дымка)
  // (подмешивается после освещения — как туман, см. fog_fragment): клочьями, к дальним — плотнее
  aLow = (1.0 - smoothstep(6.0, 70.0 + 50.0 * vn(vWp.xz / 900.0), hgt - ${AUTUMN.WY.toFixed(1)} - 40.0 * Z2.r)) * mix(0.04, 1.0, smoothstep(300.0, 5000.0, dist)) * (0.85 + 0.3 * vn(vWp.xz / 600.0));
  diffuseColor.rgb = col;`)
      .replace('#include <fog_fragment>', `#include <fog_fragment>
  gl_FragColor.rgb = mix(gl_FragColor.rgb, uLow.rgb, clamp(aLow * uLow.w * 0.8, 0.0, 0.85));`)
      .replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
  // мелкий рельеф травы и земли: нормали текстуры в двух масштабах, вблизи сильнее
  vec2 nd = (texture2D(aGN, vWp.xz / 5.0).xy - 0.5) * 0.8 * (1.0 - smoothstep(150.0, 900.0, length(vWp - uCam))) + (texture2D(aGN, vWp.xz / 60.0 + 0.5).xy - 0.5) * 0.35;
  vec3 wn2 = normalize(wN + vec3(nd.x, 0.0, -nd.y));
  normal = normalize((viewMatrix * vec4(wn2, 0.0)).xyz);`);
  };
  return m;
}
// лес: лиственные (городские импосторы, перекрашены цветом экземпляра — рыжие, жёлтые, бурые, багряные), сосны (свои, зелёные)
// и сухостой (бурые); куртинами по району «лес», плотность — как у зимы
export function autumnTrees(city, P, rnd, gh = city.groundH) {
  const tl = [], want = Math.round((P.trees || 0) * 10), H = 15500, c = new THREE.Color();
  // листва конца октября в сумерках — приглушённая: охра и ржавчина (насыщенность ≤ 0,45), четверть — ещё оливковые, редко — багряные
  const leaf = () => { const r = rnd(); if (r < 0.25) c.setHSL(0.16 + rnd() * 0.07, 0.2 + rnd() * 0.12, 0.15 + rnd() * 0.05); else if (r < 0.33) c.setHSL(0.01 + rnd() * 0.02, 0.32 + rnd() * 0.12, 0.17 + rnd() * 0.05); else c.setHSL(0.05 + rnd() * 0.07, 0.25 + rnd() * 0.2, 0.17 + rnd() * 0.08); };
  for (let t = 0; t < want * 3 && tl.length < want; t++) {
    const cx = (rnd() * 2 - 1) * H, cz = (rnd() * 2 - 1) * H;
    if (city.zoneAt(cx, cz) !== ZONE.PARK) continue;
    const k = 6 + Math.floor(rnd() * 12), R = 20 + rnd() * 45;
    for (let n = 0; n < k && tl.length < want; n++) {
      const a = rnd() * 6.283, r = Math.sqrt(rnd()) * R, x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      if (city.zoneAt(x, z) !== ZONE.PARK) continue;
      const sp = rnd(), v = sp < 0.38 ? 0 : sp < 0.7 ? 1 : sp < 0.84 ? 2 : 3;
      const dead = v !== 2 && rnd() < 0.14;
      if (v === 2) c.setHSL(0.28, 0.35, 0.2); // сосна — своя хвоя (перекраски нет)
      else if (dead) c.setHSL(0.07, 0.15, 0.17); // сухостой — серо-бурый
      else leaf(); // охра, ржавчина, бурый, местами ещё оливково-зелёные
      c.convertSRGBToLinear();
      const ht = (v === 3 ? 5 : 10) + rnd() * (v === 3 ? 3 : 10);
      tl.push({ x, z, y: gh(x, z) - 0.4, sy: ht, v, color: c.clone(), ry: rnd() * 6.283 });
    }
  }
  // балки: вдоль каждого оврага (через 40 м) — по 2–4 дерева на склонах по обе стороны (укрытие для полёта по оврагу)
  for (const l of city.ravines || []) for (let k = 0; k < l.pts.length - 1; k++) {
    const [x0, z0] = l.pts[k], [x1, z1] = l.pts[k + 1], dl = Math.hypot(x1 - x0, z1 - z0) || 1, nx = -(z1 - z0) / dl, nz = (x1 - x0) / dl;
    const n = 2 + Math.floor(rnd() * 3);
    for (let m = 0; m < n; m++) {
      const off = (rnd() < 0.5 ? -1 : 1) * (12 + rnd() * 110), al = rnd(), x = x0 + (x1 - x0) * al + nx * off, z = z0 + (z1 - z0) * al + nz * off;
      if (city.zoneAt(x, z) !== ZONE.PARK) continue;
      const v = rnd() < 0.45 ? 0 : rnd() < 0.75 ? 1 : 3;
      if (rnd() < 0.12) c.setHSL(0.07, 0.15, 0.17); else leaf();
      c.convertSRGBToLinear();
      tl.push({ x, z, y: gh(x, z) - 0.4, sy: (v === 3 ? 5 : 11) + rnd() * 9, v, color: c.clone(), ry: rnd() * 6.283 });
    }
  }
  return tl;
}
// дороги: грунтовки по рельефу (лентой чуть выше земли): колеи, лужи, трава по обочинам; гать — бревенчатый настил;
// узкоколейка — насыпь со шпалами
export function autumnRoads(scene, city, AT, P, gh = city.groundH) {
  const pos = [], uv = [], kd = [], idx = [];
  for (const r of city.roads || []) {
    const pts = [];
    for (let i = 0; i < r.pts.length - 1; i++) { const [ax, az] = r.pts[i], [bx, bz] = r.pts[i + 1], L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(L / 12)); for (let k = 0; k < n; k++) pts.push([ax + (bx - ax) * k / n, az + (bz - az) * k / n]); }
    pts.push(r.pts[r.pts.length - 1]);
    let along = 0; const kind = r.gat ? 1 : r.rail ? 2 : 0;
    for (let i = 0; i < pts.length; i++) {
      const [x, z] = pts[i], [px, pz] = pts[Math.max(0, i - 1)], [nx, nz] = pts[Math.min(pts.length - 1, i + 1)], dx = nx - px, dz = nz - pz, l = Math.hypot(dx, dz) || 1, ox = -dz / l * r.w / 2, oz = dx / l * r.w / 2;
      if (i) along += Math.hypot(x - px, z - pz);
      const y = (xx, zz) => Math.max(gh(xx, zz), AUTUMN.WY + (kind === 1 ? 0.6 : 0.3)) + 0.3;
      const b = pos.length / 3; pos.push(x + ox, y(x + ox, z + oz), z + oz, x - ox, y(x - ox, z - oz), z - oz); uv.push(0, along / r.w, 1, along / r.w); kd.push(kind, kind);
      if (i) idx.push(b - 2, b - 1, b, b - 1, b + 1, b);
    }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setAttribute('aK', new THREE.Float32BufferAttribute(kd, 1)); g.setIndex(idx); g.computeVertexNormals();
  const m = new THREE.MeshPhongMaterial({ color: 0xffffff, specular: 0x0a0a0a, shininess: 8, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { aM: AT.aM, aG: AT.aG });
    sh.vertexShader = 'attribute float aK; varying float vK; varying vec2 vR; varying vec3 vWq;\n' + sh.vertexShader.replace('#include <uv_vertex>', '#include <uv_vertex>\n vR = uv; vK = aK;').replace('#include <project_vertex>', '#include <project_vertex>\n vWq = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = 'varying float vK; varying vec2 vR; varying vec3 vWq; uniform sampler2D aM, aG;\n' + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
  float e = abs(vR.x - 0.5) * 2.0;
  vec3 mud = texture2D(aM, vWq.xz / 5.0).rgb * 0.5, gr = texture2D(aG, vWq.xz / 5.0).rgb * 0.45;
  float tr = smoothstep(0.55, 0.8, abs(fract(vR.x * 2.0) - 0.5) * 2.0); // колеи
  vec3 c = mix(mud * 1.15, mud * 0.6, tr); // колеи темнее (сырые)
  c = mix(c, gr, smoothstep(0.65, 1.0, e)); // трава по обочинам
  if (vK > 0.5 && vK < 1.5) { float lg = step(0.2, fract(vR.y * 3.0)); c = mix(vec3(0.07, 0.05, 0.035), vec3(0.16, 0.11, 0.07) * (0.8 + 0.4 * fract(sin(floor(vR.y * 3.0) * 12.9) * 4375.5)), lg); } // гать: брёвна поперёк
  if (vK > 1.5) { float sl = step(0.55, fract(vR.y * 2.5)) * step(e, 0.85); c = mix(vec3(0.12, 0.11, 0.1), vec3(0.09, 0.06, 0.04), sl); c = mix(c, vec3(0.2, 0.18, 0.16), step(abs(e - 0.45), 0.05)); } // узкоколейка: шпалы и рельсы
  diffuseColor.rgb = c;`);
  };
  const mesh = new THREE.Mesh(g, m); mesh.receiveShadow = !!P.shadows; scene.add(mesh); return mesh;
}
// вода болота: маска (где вода) по котловине — для отсечения плоскости воды у берега (rimD в шейдере воды, м до берега)
export function autumnWaterMask(city) {
  const B = AUTUMN.BASIN, x0 = B.x - B.rx * 1.25, z0 = B.z - B.rz * 1.25, w = B.rx * 2.5, d = B.rz * 2.5, S = 512;
  const raw = new Float32Array(S * S);
  for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) raw[j * S + i] = city.waterAt(x0 + (i + 0.5) * w / S, z0 + (j + 0.5) * d / S) ? 1 : 0;
  const T = new Float32Array(S * S); // размытие ×3 (ячейка ~27 м): к берегу плавно — 0,5 на урезе
  for (let it = 0; it < 3; it++) { T.set(raw); for (let j = 1; j < S - 1; j++) for (let i = 1; i < S - 1; i++) { const q = j * S + i; raw[q] = (T[q] * 2 + T[q - 1] + T[q + 1] + T[q - S] + T[q + S]) / 6; } }
  const a = new Uint8Array(S * S * 4); for (let q = 0; q < S * S; q++) { a[q * 4] = Math.round(raw[q] * 255); a[q * 4 + 3] = 255; }
  const t = new THREE.DataTexture(a, S, S, THREE.RGBAFormat); t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearFilter; t.flipY = false; t.needsUpdate = true;
  return { tex: t, rect: new THREE.Vector4(x0, z0, w, d) };
}
// реквизит (map-autumn.js city.props: имя → [x, z, поворот, масштаб, …]): тыквы, надгробия, ограда, сено, колодцы, сухостой,
// брошенные машины — моделями вблизи камеры (G.addNear, как детали улиц города); радиус — по размеру предмета
const PROP_R = { pr_pumpkin: 0.35, pr_grave1: 0.4, pr_grave2: 0.45, pr_grave3: 0.45, pr_grave4: 0.3, pr_fence: 0.45, pr_fpost: 0.45, pr_hay: 0.5, pr_well: 0.5, pr_deadtree: 1.4, pr_oldtree: 1.4, c_vaz: 0.6 };
export function autumnProps(G, city, P, gh = city.groundH) {
  const R = P.bldNear || 0; if (!R || !G.addNear || !city.props) return;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), Y = new THREE.Vector3(0, 1, 0), p = new THREE.Vector3(), sc = new THREE.Vector3();
  for (const [name, arr] of Object.entries(city.props)) {
    const n = arr.length / 4, xz = new Float32Array(n * 2), mats = new Float32Array(n * 16), wy = AUTUMN.WY - 0.4; // в болоте сухостой стоит в воде
    for (let k = 0; k < n; k++) {
      const x = arr[k * 4], z = arr[k * 4 + 1]; xz[k * 2] = x; xz[k * 2 + 1] = z;
      const y = Math.max(gh(x, z), name === 'pr_deadtree' || name === 'pr_oldtree' ? wy : -1e9);
      m4.compose(p.set(x, y, z), q.setFromAxisAngle(Y, arr[k * 4 + 2]), sc.setScalar(arr[k * 4 + 3])).toArray(mats, k * 16);
    }
    G.addNear(name, 0, name, Math.round(R * (PROP_R[name] || 0.4)), xz, mats);
  }
}
