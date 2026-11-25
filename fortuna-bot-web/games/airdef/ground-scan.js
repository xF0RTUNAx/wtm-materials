// Земля осени и зимы «по сканам» (проба ?scan=1, Mark 2026-11-25: «на топи рельеф пластиковый, глянцевый и однородный», «живость, реализм, красота земли севера»).
// Атлас 4 × 4 (tools/airdef-tex/season-atlas.py, CC0): цвет (√) с высотой в альфе и нормали. Вблизи - плитка 3 м, дальше - средний цвет слоя с пятнами
// шума 2-60 м (sMot), чтобы с высоты земля не становилась ровной заливкой. Слои складываются по высоте (камни из-под снега).
/* global THREE */
import { ktxLoad } from './ktx.js?v=20261124a';
import { GTILES_SEASON } from './ground-tiles-season.js?v=20261124a';
export const SCAN_S = typeof location !== 'undefined' && /[?&]scan=1/.test(location.search); // проба - только где есть KTX2
export function scanTextures(k, aniso, hi, stats) {
  const U = {};
  for (const [u, f] of [['tSC', 'c'], ['tSN', 'n']]) {
    const t = new THREE.Texture(); U[u] = { value: t }; if (stats) stats.req++;
    ktxLoad(`sg${k}_${f}_${hi ? 'hi' : 'lo'}`).then((q) => { q.wrapS = q.wrapT = THREE.ClampToEdgeWrapping; q.anisotropy = Math.min(4, aniso); U[u].value = q; if (stats) stats.done++; }).catch((e) => { if (stats) stats.done++; console.warn('атлас земли', e.message); });
  }
  return U;
}
// средний цвет плитки (линейный) - в GLSL
const V3 = (k, i) => { const m = GTILES_SEASON[k][i].mean; return `vec3(${m.map((v) => Math.max(v, 0.004).toFixed(4)).join(', ')})`; };
export const SCAN_GLSL = `uniform sampler2D tSC, tSN; vec3 SC = vec3(0.0); vec2 SN = vec2(0.0); float SW = 0.0, SH = 0.0, gMo = 1.0;
vec2 sGr(vec2 g) { float l = length(g); return l > 0.014 ? g * (0.014 / l) : g; }
vec2 sUV(float s, vec2 p, float T) { return (vec2(mod(s, 4.0), floor(s * 0.25 + 0.01)) + 0.0625 + fract(p / T) * 0.875) * 0.25; }
// слой: s - клетка, m - её средний цвет, tg - нужный средний цвет, w - вес; T - плитка, м
void sMat(float s, vec3 m, vec3 tg, vec2 p, float T, float w) {
  if (w <= 0.01) return;
  float k1 = 1.0 - smoothstep(T * 0.035, T * 0.11, gFp), h = 0.5; vec3 r = vec3(gMo); vec2 n = vec2(0.0);
  if (k1 > 0.0) { float q = 0.21875 / T; vec2 uv = sUV(s, p, T); vec4 c = TEXG(tSC, uv, sGr(gDx * q), sGr(gDy * q)); vec3 q3 = clamp(c.rgb * c.rgb / m, 0.12, 3.5); if (tg.g > 0.6) q3 = mix(vec3(1.0), q3, 0.35); r *= mix(vec3(1.0), q3, k1); h = mix(0.5, c.a, k1); if (gFp < 0.09) n = (TEXG(tSN, uv, sGr(gDx * q), sGr(gDy * q)).rg * 2.0 - 1.0) * k1 * (1.0 - smoothstep(0.05, 0.09, gFp)); }
  float wh = w * exp(h * 5.0 * (1.0 - w * 0.6)); wh *= w; SC += r * tg * wh; SN += n * wh; SH += h * wh; SW += wh;
}
// пятнистость 2-60 м: вместо ровной заливки с высоты (дешевле второй выборки скана и без великанских листьев)
void sMot(vec2 p) { float a = smoothstep(0.25, 0.75, vn(p / 1.5 + 3.0)), b = smoothstep(0.2, 0.8, vn(p / 4.9) * 0.6 + vn(p / 2.3 + 5.0) * 0.4), c = vn(p / 19.0 + 7.0), d = vn(p / 63.0 + 1.0); gMo = clamp(0.35 + 0.34 * a * (1.0 - smoothstep(0.5, 2.0, gFp)) + 0.17 * smoothstep(0.5, 2.0, gFp) + 0.42 * b + 0.34 * c + 0.22 * d, 0.5, 1.5); }
void sBeg() { SC = vec3(0.0); SN = vec2(0.0); SW = 0.0; SH = 0.0; }
vec3 sEnd() { float i = 1.0 / max(SW, 1e-4); SN *= i; SH *= i; return SC * i; }
`;
// осень: луг - ветошь, отава, проплешины, солома; лес - палый лист; болото - мох, осока, торф; берег - ил; пашня - комья
export const autumnScan = (WY) => { const M = (i, tg, T, w, p = 'P.xz') => `sMat(${i}.0, ${V3('a', i)}, ${tg}, ${p}, ${T.toFixed(1)}, ${w});`; return `
  float n4 = vn(P.xz / 410.0 + 5.0), n1 = vn(P.xz / 140.0), n2 = vn(P.xz / 37.0 + 9.0), n3 = vn(P.xz / 9.5 + 2.0), n5 = vn(P.xz / 3.1 + 4.0), na = n1 * 0.45 + n2 * 0.35 + n3 * 0.2, up = hgt - ${WY.toFixed(1)};
  float wet = 1.0 - smoothstep(3.0, 22.0, up + 14.0 * (n2 - 0.5)), frS = smoothstep(0.25, 0.75, Z.r + 0.5 * (vn(P.xz / 160.0) - 0.5) + 0.3 * (n2 - 0.5)), bogS = smoothstep(0.3, 0.8, Z2.a + 0.25 * (n1 - 0.5)) * (1.0 - smoothstep(4.0, 9.0, up));
  float plS = smoothstep(0.3, 0.7, max(Z2.b, Z2.g) + 0.25 * (n3 - 0.5)), shS = (1.0 - smoothstep(0.3, 2.6, up + 1.8 * (n2 - 0.5) + 0.9 * (n3 - 0.5))), open = (1.0 - frS) * (1.0 - bogS) * (1.0 - plS) * (1.0 - shS);
  float gr = n4 * 0.5 + na * 0.6 - 0.05, w1 = smoothstep(0.5, 0.36, gr), w2 = smoothstep(0.36, 0.5, gr) * smoothstep(0.66, 0.54, gr), w9 = smoothstep(0.56, 0.68, gr), wb = smoothstep(0.56, 0.72, n2 * 0.5 + n3 * 0.5 + slope * 0.9);
  sMot(P.xz); sBeg();
  ${M(1, 'mix(vec3(0.135, 0.135, 0.06), vec3(0.095, 0.11, 0.045), wet)', 3, 'open * w1 * (1.0 - wb)')}
  ${M(0, 'mix(vec3(0.215, 0.185, 0.105), vec3(0.175, 0.165, 0.085), n2)', 3, 'open * w2 * (1.0 - wb)')}
  ${M(9, 'vec3(0.235, 0.19, 0.11)', 3, 'open * w9 * (1.0 - wb)')}
  ${M(2, 'vec3(0.145, 0.122, 0.08)', 3, 'open * wb')}
  ${M(13, 'vec3(0.085, 0.072, 0.056)', 3.3, 'open * smoothstep(0.1, 0.24, slope + 0.1 * (n3 - 0.5))')}
  ${M(6, 'vec3(0.15, 0.108, 0.055)', 3, 'frS * (1.0 - bogS) * smoothstep(0.42, 0.58, n2 * 0.6 + n3 * 0.4)')}
  ${M(5, 'vec3(0.125, 0.085, 0.052)', 3, 'frS * (1.0 - bogS) * smoothstep(0.58, 0.42, n2 * 0.6 + n3 * 0.4) * smoothstep(0.35, 0.6, n1 + 0.2 * (n5 - 0.5))')}
  ${M(14, 'vec3(0.08, 0.085, 0.04)', 3, 'frS * (1.0 - bogS) * smoothstep(0.6, 0.35, n1 + 0.2 * (n5 - 0.5))')}
  ${M(7, 'vec3(0.075, 0.056, 0.026)', 3.3, 'frS * wet * smoothstep(0.45, 0.65, n3)')}
  ${M(4, 'vec3(0.07, 0.083, 0.035)', 2.4, 'bogS * (1.0 - shS) * smoothstep(0.3, 0.55, n2 * 0.6 + n3 * 0.4)')}
  ${M(10, 'vec3(0.08, 0.066, 0.045)', 3, 'bogS * (1.0 - shS) * smoothstep(0.55, 0.3, n2 * 0.6 + n3 * 0.4)')}
  ${M(0, 'vec3(0.125, 0.105, 0.05)', 3, 'bogS * (1.0 - shS) * smoothstep(0.62, 0.78, n1 * 0.4 + n5 * 0.25 + n3 * 0.4)')}
  ${M(11, 'mix(vec3(0.03, 0.026, 0.02), vec3(0.055, 0.046, 0.034), smoothstep(0.0, 1.6, up))', 3.4, 'shS * (1.0 - plS)')}
  ${M(12, 'mix(vec3(0.062, 0.044, 0.03), vec3(0.1, 0.075, 0.052), n1 * 0.6 + n3 * 0.4)', 3, 'plS')}
  ${M(9, 'vec3(0.15, 0.115, 0.06)', 3, 'plS * smoothstep(0.55, 0.75, n2 * 0.6 + n5 * 0.4) * 0.8')}
  grass = sEnd(); grass *= 0.82 + 0.36 * mix(gA, vn(P.xz / 1.3), 0.25);`; };
// зима: свежий снег, наст с застругами, проталины (камень, трава), осыпь у скал, хвоя под лесом
export const winterScan = () => { const M = (i, tg, T, w, p = 'P.xz') => `sMat(${i}.0, ${V3('w', i)}, ${tg}, ${p}, ${T.toFixed(1)}, ${w});`; return `
  vec2 wd = vec2(0.83, 0.56), pw = vec2(dot(P.xz, wd), dot(P.xz, vec2(-wd.y, wd.x))); // ветер
  float n4 = vn(P.xz / 520.0 + 5.0), n1 = vn(P.xz / 150.0), n2 = vn(P.xz / 41.0 + 9.0), n3 = vn(P.xz / 10.5 + 2.0), n5 = vn(P.xz / 3.3 + 4.0);
  float wv = vn(P.xz / 60.0) * 5.0, sa = vn(vec2(pw.x / 16.0 + wv * 0.2, pw.y / 2.6 + wv)), sb = vn(vec2(pw.x / 70.0, pw.y / 17.0 + wv * 0.4)); // заструги и длинные наносы
  float frS = smoothstep(0.25, 0.75, Z.r + 0.5 * (vn(P.xz / 160.0) - 0.5) + 0.3 * (n2 - 0.5)), crust = smoothstep(0.42, 0.62, n4 * 0.5 + n1 * 0.3 + sb * 0.35 - 0.06);
  float bare = smoothstep(0.635, 0.82, n1 * 0.34 + n2 * 0.3 + n3 * 0.16 + sa * 0.14 + (0.5 - sb) * 0.22 + min(slope, 0.2) * 0.55) * (1.0 - smoothstep(0.0, 0.3, Z.g));
  float lit = frS * smoothstep(0.58, 0.8, n2 * 0.35 + n3 * 0.35 + n5 * 0.3), scree = smoothstep(0.13, 0.22, slope + 0.1 * (n3 - 0.5) + 0.07 * (n2 - 0.5)) * (1.0 - smoothstep(0.3, 0.42, slope)) * (0.75 - 0.35 * smoothstep(400.0, 1000.0, hgt)); // вблизи скал, выше - снега больше
  vec3 fresh = vec3(0.8, 0.83, 0.88) * mix(1.0, dS, 0.4 * near), old = vec3(0.7, 0.735, 0.79);
  gMo = 0.8 + 0.16 * n2 + 0.14 * n3 + 0.1 * n5; sBeg(); SW = 1e-3; SC = fresh * 1e-3;
  float cov = (1.0 - bare) * (1.0 - lit * 0.75) * (1.0 - scree * 0.75);
  { float w = cov * max(1.0 - crust, 0.4); float wh = w * w * exp(2.5 * (1.0 - w * 0.6)); SC += fresh * wh; SW += wh; }
  ${M(0, 'old', 5, 'cov * crust * smoothstep(0.35, 0.6, sa)')}
  ${M(3, 'old * vec3(0.96, 0.98, 1.02)', 5, 'cov * crust * smoothstep(0.6, 0.35, sa) * 0.55')}
  ${M(2, 'vec3(0.5, 0.515, 0.53)', 4, 'max(bare * (1.0 - smoothstep(0.35, 0.95, bare)) * 2.6, 0.0) * (1.0 - scree)')}
  ${M(5, 'vec3(0.23, 0.205, 0.155)', 3, 'smoothstep(0.55, 1.0, bare) * smoothstep(0.4, 0.55, n2) * (1.0 - smoothstep(350.0, 700.0, hgt)) * (1.0 - scree)')}
  ${M(7, 'vec3(0.17, 0.165, 0.158)', 3.3, 'smoothstep(0.55, 1.0, bare) * smoothstep(0.55, 0.4, n2) * (1.0 - scree)')}
  ${M(4, 'vec3(0.2, 0.2, 0.2)', 3.6, 'max(scree, smoothstep(0.55, 1.0, bare) * smoothstep(350.0, 700.0, hgt)) * smoothstep(0.35, 0.6, n2 * 0.5 + n3 * 0.5)')}
  ${M(2, 'vec3(0.55, 0.57, 0.6)', 4, 'scree * smoothstep(0.6, 0.35, n2 * 0.5 + n3 * 0.5)')}
  ${M(8, 'vec3(0.2, 0.185, 0.16)', 3, 'lit * 0.8')}
  ${M(2, 'vec3(0.6, 0.62, 0.64)', 4, 'lit * smoothstep(0.6, 0.4, n5)')}
  snow = sEnd(); { float df = (sa - 0.5) * 0.05 * (1.0 - smoothstep(0.6, 3.0, gFp)) + (sb - 0.5) * 0.1; float L = lum(snow); snow *= 1.0 + df * smoothstep(0.3, 0.6, L); snow = mix(snow, snow * vec3(0.94, 0.98, 1.04), smoothstep(0.55, 0.3, sb) * 0.6 * smoothstep(0.3, 0.6, L)); // в ложбинах наносов снег голубее
    float gk = (1.0 - smoothstep(0.25, 1.2, gFp)) * (0.35 + 0.65 * crust) * smoothstep(0.35, 0.6, L); if (gk > 0.01) { float e = 0.7; vec2 gs = vec2(vn(vec2((pw.x + e) / 16.0 + wv * 0.2, pw.y / 2.6 + wv)) - sa, vn(vec2(pw.x / 16.0 + wv * 0.2, (pw.y + e) / 2.6 + wv)) - sa) * 0.55 * gk; SN += vec2(dot(gs, vec2(wd.x, -wd.y)), -dot(gs, vec2(wd.y, wd.x))); } }
  snow *= mix(vec3(1.0), sA * sA / 0.62, 0.25) * mix(vec3(1.0), sA2 * sA2 / 0.62, 0.22);`; };
