// Краска техники, живая к миру (Mark 2026-11-05: «красивыми, реалистичными и интерактивными с миром»): материал остаётся MeshPhong
// (тени, повреждения, камуфляж работают как были), шейдер добавляет то, чего у него нет:
//  • отражение настоящего неба текущей погоды (панорама из drone/world.js), снизу - земля и дымка горизонта, в ангаре - размытая картинка зала;
//  • Френель: под острым углом обшивка блестит сильнее; блик солнца и размытость отражения - по шероховатости точки;
//  • шероховатость и металл: своя карта модели (glTF metallicRoughnessTexture: G шероховатость, B металл) или, пока её нет, шум и грязь по текстуре.
// Включается ?paint=1 (проба), ?paint=0 - выключено. Дальние копии (_lo) и обломки стоянок - без неё.
/* global THREE */
let SRC = null, HALL = null;
export const paintOn = (() => { try { return /[?&]paint=1/.test(location.search); } catch (_) { return false; } })();
// небо боя: равномерные величины неба из city-render.js (SU), панорама приходит позже - читаем значение при каждой отправке в шейдер
export const setPaintSky = (su) => { SRC = su; };
// ангар: функция, которая возвращает текстуру зала (null - выйти из режима зала)
export const setPaintHall = (fn) => { HALL = fn; };
const hallTex = () => (HALL ? HALL() : null);
const C0 = new THREE.Color(0, 0, 0), V0 = new THREE.Vector3(0, 1, 0);
const U = {
  uPSky: { get value() { const h = hallTex(); return h || (SRC && SRC.skyTex.value) || null; } },
  uPOn: { get value() { return SRC ? SRC.skyOn.value : 0; } },
  uPU: { get value() { return SRC ? SRC.skyU.value : 0; } },
  uPK: { get value() { return SRC ? SRC.skyK.value : 1; } },
  uPHall: { get value() { return hallTex() ? 1 : 0; } },
  uPZen: { get value() { return SRC ? SRC.zenith.value : C0; } },
  uPHor: { get value() { return SRC ? SRC.horizon.value : C0; } },
  uPGnd: { get value() { return SRC ? SRC.ground.value : C0; } },
  uPSun: { get value() { return SRC ? SRC.sunDir.value : V0; } },
};
const GLSL = `
uniform sampler2D uPSky; uniform float uPOn, uPU, uPK, uPHall, uPRough, uPMetal; uniform vec3 uPZen, uPHor, uPGnd, uPSun;
#ifdef PAINT_ORM
uniform sampler2D uPOrm;
#endif
varying vec3 vPP;
float pH(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float pV(vec3 x) { vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(pH(i), pH(i + vec3(1, 0, 0)), f.x), mix(pH(i + vec3(0, 1, 0)), pH(i + vec3(1, 1, 0)), f.x), f.y),
    mix(mix(pH(i + vec3(0, 0, 1)), pH(i + vec3(1, 0, 1)), f.x), mix(pH(i + vec3(0, 1, 1)), pH(i + vec3(1, 1, 1)), f.x), f.y), f.z); }
vec3 pLod(vec2 uv, float l) {
  #if defined(GL_EXT_shader_texture_lod) || __VERSION__ >= 300
    return texture2DLodEXT(uPSky, uv, l).rgb;
  #else
    return texture2D(uPSky, uv, l + 1.0).rgb;
  #endif
}
vec3 paintEnv(vec3 d, float r) {
  float l = 2.5 + r * 4.5;
  if (uPHall > 0.5) { vec3 p = pLod(vec2(0.5 + d.x * 0.5, 0.5 + d.y * 0.5), l + 1.0); return p * p; } // зал: свет сверху, пол снизу
  float h = max(d.y, 0.0); vec3 col = mix(uPHor, uPZen, pow(h, 0.45));
  if (uPOn > 0.5) { vec2 uv = vec2(fract((atan(d.z, d.x) - atan(uPSun.z, uPSun.x)) / 6.2831853 + uPU), asin(min(h, 1.0)) / 1.5707963);
    vec3 p = pLod(uv, l); col = mix(col, p * p * uPK, smoothstep(0.0, 0.12, h)); }
  return d.y >= 0.0 ? col : mix(uPHor, uPGnd, smoothstep(0.0, 0.25, -d.y));
}
`;
// mat - MeshPhongMaterial; o: { rough, metal, glass, orm - карта } (rough и metal - основа, карта их заменяет)
export function paintMat(mat, o = {}) {
  const prev = mat.onBeforeCompile, was = mat.customProgramCacheKey && mat.customProgramCacheKey(), glass = !!o.glass, rough = o.rough ?? 0.5, metal = o.metal ?? 0;
  if (o.orm) mat.defines = { ...(mat.defines || {}), PAINT_ORM: 1 };
  mat.onBeforeCompile = (sh, r) => {
    if (prev && prev !== THREE.Material.prototype.onBeforeCompile) prev(sh, r);
    Object.assign(sh.uniforms, U, { uPRough: { value: rough }, uPMetal: { value: metal } }); if (o.orm) sh.uniforms.uPOrm = { value: o.orm };
    sh.vertexShader = 'varying vec3 vPP;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvPP = position;');
    sh.fragmentShader = GLSL + sh.fragmentShader
      .replace('#include <lights_phong_fragment>', `#include <lights_phong_fragment>
  float pRg = uPRough, pMt = uPMetal;
  #ifdef PAINT_ORM
    { vec4 pO = texture2D(uPOrm, vUv); pRg = pO.g; pMt = pO.b; }
  #else
    ${glass ? '' : `{ float pN1 = pV(vPP * 1.7), pN2 = pV(vPP * 9.0), pL = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11));
      pRg = clamp(pRg + (pN1 - 0.5) * 0.22 + (pN2 - 0.5) * 0.1 + (0.32 - pL) * 0.28, 0.12, 0.95); }`} // пока нет карты: пятна полировки и краски, тёмное и грязное - матовее
  #endif
  { float pA = pRg * pRg; material.specularShininess = clamp(2.0 / max(pA * pA, 0.0005) - 2.0, 4.0, 800.0);
    material.specularColor = mix(vec3(0.05), diffuseColor.rgb, pMt) * (1.0 - pRg * 0.35); }`)
      .replace('#include <aomap_fragment>', `#include <aomap_fragment>
  { vec3 pVw = normalize(vViewPosition); float pNV = clamp(dot(normal, pVw), 0.0, 1.0);
    vec3 pDir = inverseTransformDirection(reflect(-pVw, normal), viewMatrix), pF0 = mix(vec3(${glass ? '0.08' : '0.045'}), diffuseColor.rgb, pMt);
    vec3 pF = pF0 + (max(vec3((1.0 - pRg) * ${glass ? '1.0' : '0.62'}), pF0) - pF0) * pow(1.0 - pNV, 5.0); // краска не зеркало: под острым углом блестит, но не хромом
    float pAo = 1.0;
    #ifdef USE_COLOR
      pAo = clamp(dot(vColor.rgb, vec3(0.3333)) * 1.25, 0.0, 1.0);
    #endif
    reflectedLight.indirectSpecular += paintEnv(pDir, pRg) * pF * pAo * ${glass ? '1.6' : '1.0'};
    reflectedLight.directDiffuse *= 1.0 - pMt * 0.85; reflectedLight.indirectDiffuse *= 1.0 - pMt * 0.85; }`);
  };
  mat.customProgramCacheKey = () => (was || '') + (glass ? 'paintG' : 'paint');
  return mat;
}
