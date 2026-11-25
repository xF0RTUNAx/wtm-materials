// Ударная волна: деревья, дальние снимки деревьев и трава отклоняются от близкого взрыва (Mark 2026-11-25: «чем ближе взрыв, тем сильнее ударная волна, влияющая на деревья»)
// Последние K взрывов - в uniform'ах; вершина считает задержку прихода волны (380 м/с), отклонение от взрыва и затухающее качание на своей частоте (высокое дерево
// качается медленнее, 10 м - 0,6 Гц, 20 м - 0,4), листва дрожит. Настоящий прогиб на сотне метров - доли градуса, поэтому сила художественная (AIRDEF_GRAPHICS.md).
/* global THREE */
const K = 6, A = Array.from({ length: K }, () => new THREE.Vector4(0, 0, 0, -1e3)), B = Array.from({ length: K }, () => new THREE.Vector4());
export const BLAST_ON = typeof location === 'undefined' || !/[?&]blast=0/.test(location.search);
export const BU = { uBlA: { value: A }, uBlB: { value: B }, uBlN: { value: 0 } };
let k = 0, live = [];
// p - точка, R - радиус вспышки (м, как у fx.explosion), t - время сцены (ENV.uTime)
export function addBlast(p, R, t) {
  if (!BLAST_ON || !(R >= 4)) return;
  A[k].set(p.x, p.y, p.z, t); B[k].set(Math.min(0.5, 0.05 + R * 0.011), 6 + R * 1.5, 40 + R * 9, 0.6 + R * 0.03); // наклон (рад), полуспад, предел, дрожание листвы (с)
  k = (k + 1) % K; live.push(t);
}
export function tickBlast(t) { while (live.length && t - live[0] > 7) live.shift(); BU.uBlN.value = live.length ? K : 0; }
// bl: (наклон x, z - мировые, дрожание); base - основание дерева, H - высота (м), f - частота (Гц)
export const BLAST_GLSL = `uniform vec4 uBlA[${K}], uBlB[${K}]; uniform int uBlN;
vec3 blastAt(vec3 base, float f, float z, float tt) { vec3 bl = vec3(0.0); if (uBlN == 0) return bl;
  for (int i = 0; i < ${K}; i++) { vec4 a = uBlA[i], b = uBlB[i]; vec3 d = base - a.xyz; float r = length(d), t = tt - a.w - r / 380.0;
    if (t < 0.0 || t > 6.0 || r > b.z) continue;
    float am = b.x / (1.0 + r * r / (b.y * b.y)) * (1.0 - smoothstep(0.7, 1.0, r / b.z)), w = 6.2832 * f;
    bl.xy += d.xz / max(r, 1.0) * am * exp(-z * w * t) * sin(w * t) * 1.15; bl.z += am * exp(-t / b.w) * min(1.0, t * 20.0); }
  return bl; }
`;
