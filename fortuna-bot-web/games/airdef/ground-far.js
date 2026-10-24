// Земля вдали — мелкие текстуры без выборки (оптимизация 2026-10-25, Mark: «чтобы и грелся меньше, и фпс был стабильней»). Плитка травы,
// грязи, пашни (4–30 м) там, где на экране она меньше 4–8 пикселей, — почти только средний цвет (мелкий мип), а выборка с анизотропией под
// острым углом — самая дорогая часть земли (стенд: 8 мелких текстур осени — треть цены шейдера). Там берётся средний цвет самой текстуры
// (последний мип, 1×1), выборка пропускается; между 8 и 4 пикселями на плитку — плавный переход (стенд: на снимках 1:1 не отличить). Граница — по размеру пикселя на земле
// (меньшая ось, как у анизотропного фильтра), то есть по разрешению экрана: на большем экране текстура видна дальше.
// Производные — в начале кадра пикселя (farInit), выборка — с ними (textureGrad): ветвление не даёт швов. ?gf=0 — без этого (сравнение).
/* global THREE */
export const FAR_ON = typeof location === 'undefined' || !/[?&]gf=0/.test(location.search);
// доля плитки на пиксель, с которой начинается переход к среднему цвету (0,125 — с 8 пикселей на плитку, к 4 — уже средний); 0 — выкл.
export const FAR_U = { value: FAR_ON ? 0.125 : 0 }; // общий для материалов земли (стенд переключает на лету)
export const FAR_GLSL = `uniform float uFar;
#if __VERSION__ >= 300 || defined(GL_EXT_shader_texture_lod)
#define TEXG(t, uv, gx, gy) texture2DGradEXT(t, uv, gx, gy)
#define TEXA(t, uv) texture2DLodEXT(t, uv, 16.0)
#else
#define TEXG(t, uv, gx, gy) texture2D(t, uv)
#define TEXA(t, uv) texture2D(t, uv, 16.0)
#endif
vec2 gDx, gDy; float gFp; // производные мировых xz и метров на пиксель по меньшей оси
void farInit(vec2 p) { gDx = dFdx(p); gDy = dFdy(p); gFp = min(length(gDx), length(gDy)); }
// доля среднего цвета для плитки T м: 1/uFar пикселей на плитку — 0, вдвое меньше — 1
float farK(float T) { return uFar > 0.0 ? smoothstep(T * uFar, T * uFar * 2.0, gFp) : 0.0; }
// выборка текстуры плиткой T м со сдвигом o: texture2D(t, p / T + o), вдали — её средний цвет
vec4 texF(sampler2D t, vec2 p, float T, vec2 o) {
  float k = farK(T); vec2 uv = p / T + o;
  if (k >= 1.0) return TEXA(t, uv);
  vec4 s = TEXG(t, uv, gDx / T, gDy / T);
  return k > 0.0 ? mix(s, TEXA(t, uv), k) : s;
}
`;
// Тени на земле (2026-10-25): у телефонов PCF three r128 — 17 выборок упакованной глубины на каждый пиксель земли в зоне теней. Сначала —
// 5 из них (углы и середина): все одинаковые — точка целиком на свету или в тени, остальные 12 не нужны; иначе — все 17, как было. Результат
// тот же, кроме теней тоньше текселя карты между углами. Только земля (самолёты, техника — как были). uFar = 0 (?gf=0) — всегда 17.
let SH = null;
export function groundShadowChunk() {
  if (SH !== null) return SH;
  const src = THREE.ShaderChunk.shadowmap_pars_fragment, i = src.indexOf('#if defined( SHADOWMAP_TYPE_PCF )');
  const m = i < 0 ? null : /shadow = \(([\s\S]*?)\)\s*\*\s*\(\s*1\.0 \/ 17\.0\s*\);/.exec(src.slice(i));
  const T = m ? m[1].match(/texture2DCompare\(.*?shadowCoord\.z \)/g) || [] : [];
  const five = T.filter((t) => /vec2\( dx[01], dy[01] \)|shadowCoord\.xy, shadowCoord\.z/.test(t)), rest = T.filter((t) => !five.includes(t));
  if (T.length !== 17 || five.length !== 5) return (SH = src); // другая версия three — как есть
  return (SH = src.slice(0, i) + src.slice(i).replace(m[0], `float sh5 = ${five.join(' + ')};
			shadow = sh5 * 0.2;
			if (uFar == 0.0 || (sh5 > 0.5 && sh5 < 4.5)) shadow = (sh5 + ${rest.join(' + ')}) * ( 1.0 / 17.0 );`));
}
