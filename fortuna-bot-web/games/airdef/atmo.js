// Воздух и свет неба «Воздушного превосходства» (AIRDEF_GRAPHICS.md, этап 1; Mark 2026-11-25): поверх общих кусков шейдеров «Летки» (drone/world.js), её не трогает
//  • дымка: обычная экспонента + прежняя квадратичная, по каналам (синий гаснет быстрее - даль холоднее), одна на все пресеты; край прорисовки растворяется отдельно; ?hz=0 - прежняя
//  • тени облаков: бегущий шум вдоль солнца, считается в вершинах (ни одной выборки текстуры), гасит только прямой свет; ?cl=0 - без них
//  • дымка - до тонмаппинга (в r128 штатно после: без HDR-буфера цвет дали был неверным)
/* global THREE */
import { ATMO } from '../drone/world.js?v=20261126b';
import { AIR_SH } from './terrain-bake.js?v=20261126b';
const q = (k) => { try { return new URLSearchParams(location.search).get(k); } catch (_) { return null; } };
export const HZ_ON = q('hz') !== '0', CLD_ON = q('cl') !== '0';
// простые объекты: при клонировании uniform'ов остаётся общая ссылка. hz: x - линейная плотность, y - край прорисовки (м), z - 1 = включено; cld: xy - сдвиг ветром, z - сила, w - 1 / размер
export const AIR = { hz: { x: 0, y: 20000, z: 0 }, cld: { x: 0, y: 0, z: 0, w: 1 / 1300 } };
export const airUniforms = () => ({ atmoHz: { value: AIR.hz }, atmoCld: { value: AIR.cld }, atmoSh: AIR_SH.tex, atmoShR: AIR_SH.r });
for (const k in THREE.ShaderLib) {
  const L = THREE.ShaderLib[k]; if (!L.uniforms || !L.uniforms.fogColor) continue;
  Object.assign(L.uniforms, airUniforms());
}
const CLD_V = `
  uniform vec3 atmoSunDir; uniform vec4 atmoCld; varying float vCld;
  #ifndef NO_SH
  uniform highp sampler2D atmoSh; uniform vec2 atmoShR;
  // тень гор: ниже высоты тени солнца нет (мягкая граница; земля берёт свою - точнее - из текстуры рельефа)
  float shdAt(vec3 w) { if (atmoShR.y < 0.5) return 1.0; 
  #if __VERSION__ >= 300
    float h = textureLod(atmoSh, w.xz / (2.0 * atmoShR.x) + 0.5, 0.0).r;
  #else
    float h = texture2DLod(atmoSh, w.xz / (2.0 * atmoShR.x) + 0.5, 0.0).r;
  #endif
    return smoothstep(h - 14.0, h + 10.0, w.y); }
  #else
  float shdAt(vec3 w) { return 1.0; } // земля: своя тень из текстуры рельефа, 16 текстур у неё уже заняты
  #endif
  float cldH(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float cldN(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(cldH(i), cldH(i + vec2(1.0, 0.0)), f.x), mix(cldH(i + vec2(0.0, 1.0)), cldH(i + vec2(1.0, 1.0)), f.x), f.y); }
  float cldAt(vec3 w) { if (atmoCld.z <= 0.0 || w.y > 1400.0) return 1.0;
    vec2 p = (w.xz + atmoSunDir.xz * (1400.0 - w.y) / max(atmoSunDir.y, 0.15)) * atmoCld.w + atmoCld.xy;
    return 1.0 - atmoCld.z * smoothstep(0.52, 0.62, cldN(p) * 0.68 + cldN(p * 2.9 + 7.3) * 0.32) * (1.0 - smoothstep(900.0, 1400.0, w.y)); }`;
if (CLD_ON) {
  THREE.ShaderChunk.fog_pars_vertex = THREE.ShaderChunk.fog_pars_vertex.replace('varying vec3 vFogW;', 'varying vec3 vFogW;' + CLD_V);
  THREE.ShaderChunk.fog_vertex = THREE.ShaderChunk.fog_vertex.replace('#endif', '  vCld = cldAt(cameraPosition + vFogW) * shdAt(cameraPosition + vFogW);\n#endif');
  THREE.ShaderChunk.lights_fragment_begin = THREE.ShaderChunk.lights_fragment_begin.replace('getDirectionalDirectLightIrradiance( directionalLight, geometry, directLight );', `getDirectionalDirectLightIrradiance( directionalLight, geometry, directLight );
    #ifdef USE_FOG
    directLight.color *= vCld;
    #endif`);
  const lm = THREE.ShaderLib.lambert; if (lm) lm.fragmentShader = lm.fragmentShader.replace('getShadowMask()', 'getShadowMask() * cldF()').replace('void main() {', '#ifdef USE_FOG\nfloat cldF() { return vCld; }\n#else\nfloat cldF() { return 1.0; }\n#endif\nvoid main() {'); // карточки травы и прочее со светом по вершинам
}
{
  let fp = THREE.ShaderChunk.fog_pars_fragment; if (CLD_ON) fp = fp.replace('varying vec3 vFogW;', 'varying vec3 vFogW; varying float vCld;');
  THREE.ShaderChunk.fog_pars_fragment = fp.replace('uniform vec3 fogColor,', 'uniform vec3 atmoHz; uniform vec3 fogColor,');
  if (HZ_ON) THREE.ShaderChunk.fog_fragment = `#ifdef USE_FOG
  float fDist = length(vFogW);
  #ifdef FOG_EXP2
    float fH = atmoP.x, fy0 = cameraPosition.y, fdy = vFogW.y;
    float fk = abs(fdy) > 1.0 ? (exp(-fy0 / fH) - exp(-(fy0 + fdy) / fH)) * fH / fdy : exp(-fy0 / fH);
    fk = min(fk * exp(atmoP.z / fH), 2.2);
    vec3 fT = exp(-(atmoHz.x * fDist + fogDensity * fogDensity * fDist * fDist) * fk * mix(vec3(1.0), vec3(0.86, 1.0, 1.2), atmoHz.z));
    if (atmoHz.z > 0.5) { float fe = smoothstep(0.55 * atmoHz.y, atmoHz.y, fDist); fT *= 1.0 - fe * fe; }
  #else
    vec3 fT = vec3(1.0 - smoothstep(fogNear, fogFar, fDist));
  #endif
  float fSun = pow(max(dot(vFogW / max(fDist, 1.0), atmoSunDir), 0.0), 6.0) * atmoP.y;
  gl_FragColor.rgb = gl_FragColor.rgb * fT + mix(fogColor, atmoSunCol, fSun) * (1.0 - fT);
#endif`;
}
// Блик Фонга в r128: F_Schlick с F90 = 1 при любом блеске и почти чёрном specular - земля, дома, трава под скользящим углом к солнцу накрывались ровной
// глянцевой пеленой (разбор 2026-11-25, Mark: «отражает свет одинаково, словно глянец»): у осени (солнце 10°) пелена в несколько раз ярче самой земли.
// У шероховатого F90 падает (микрорельеф сам себя затеняет): по shininess и силе specular; вода, стекло, лак (≥ 60) - как были. ?f90=0 - прежнее
if (q('f90') !== '0') {
  const B = 'vec3 F = F_Schlick( specularColor, dotLH );', ch = THREE.ShaderChunk.bsdfs, i = ch.indexOf('vec3 BRDF_Specular_BlinnPhong'), j = ch.indexOf(B, i);
  if (i > 0 && j > i) THREE.ShaderChunk.bsdfs = ch.slice(0, j) + 'float f90 = saturate( dot( specularColor, vec3( 33.0 ) ) ) * saturate( ( shininess - 6.0 ) / 54.0 ); vec3 F = specularColor + max( vec3( f90 ) - specularColor, vec3( 0.0 ) ) * exp2( ( -5.55473 * dotLH - 6.98316 ) * dotLH );' + ch.slice(j + B.length);
}
// погода: плотность и тени облаков (city-render.js, при сборке сцены). Возвращает плотность квадратичной части для scene.fog
export function setAir(W, draw, fogD, sunY) {
  AIR_SH.r.value.y = 0; AIR.hz.z = HZ_ON ? 1 : 0; // тень гор включит terrain-bake.js (зима, осень)
  AIR.hz.y = draw; AIR.hz.x = HZ_ON ? 0.35 * Math.min(fogD, 6e-5) * (+q('hzk') || 1) : 0;
  AIR.cld.z = CLD_ON && W.sunVis && !W.night ? Math.min(0.42, 0.2 + 0.36 * Math.max(0, sunY)) * (+q('clk') || 1) : 0; AIR.cld.x = AIR.cld.y = 0;
  return HZ_ON ? fogD : Math.max(fogD, 1.15 / draw);
}
export function tickAir(t) { AIR.cld.x = t * 7 * AIR.cld.w; AIR.cld.y = t * 3 * AIR.cld.w; } // ветер около 7,5 м/с
export { ATMO };
