// Тени двух масштабов одной картой (Mark 2026-11-25: «картинка выгоревшая и плоская»): левая половина карты - прежняя дальняя (P.shadowBox),
// правая - ближняя вокруг того же центра, в NS_K раз подробнее (техника, деревья и дома рядом, тень самолёта на нём самом).
// Обе - одной ортокамерой вдоль солнца с одним центром: ближняя координата получается из дальней прямо в шейдере, ни второго источника,
// ни второй текстуры, ни лишних varying не нужно (у земли и так много текстур). Прежний сдвиг (bias −0,0004 при глубине 11,9 км = 4,8 м и
// normalBias 1,5 м) съедал тени всего, что ниже ~5 м - теперь он считается от пикселя карты и высоты солнца.
// Чужие тени (ангар в меню) - без изменений: признак двойной карты - shadowRadius больше 8. ?ns=0 - как было.
/* global THREE */
export const NS_ON = typeof location === 'undefined' || !/[?&]ns=0/.test(location.search);
export const NS_K = 8;
// аппаратное сглаживание (2026-11-25, AIRDEF_GRAPHICS.md этап 2): карта теней солнца - текстура глубины, четыре сравнения с билинейным смешением делает сама видеокарта
// за одну выборку. Вместо 17 выборок с распаковкой - 4 (на «Среднем» и у дальней половины - 1-2), край мягче и без «лесенки». Только WebGL2; ?hws=0 - прежнее.
// Правка - при загрузке модуля: все материалы игры (и ангара) обязаны брать карту солнца одним и тем же типом. Прожекторы - как были
export const HWS = typeof location === 'undefined' || !/[?&]hws=0/.test(location.search);
let hw = false, patched = false;
const NS2 = (A) => `
	float getShadow( ${A ? 'highp sampler2DShadow' : 'sampler2D'} shadowMap, vec2 shadowMapSize, float shadowBias, float shadowRadius, vec4 shadowCoord ) {
		if ( shadowRadius < 8.0 ) return getShadowA( shadowMap, shadowMapSize, shadowBias, shadowRadius, shadowCoord );
		vec3 c = shadowCoord.xyz / shadowCoord.w; vec2 at = vec2( shadowMapSize.x * 2.0, shadowMapSize.y ); vec3 n = vec3( ( c.xy - 0.5 - nsOff.xy ) * ${NS_K}.0 + 0.5, c.z - nsOff.z );
		if ( c.z >= 1.0 ) return 1.0;
		float m = 4.0 / shadowMapSize.x, en = min( min( n.x, 1.0 - n.x ), min( n.y, 1.0 - n.y ) ) - m, k = clamp( en * 12.0, 0.0, 1.0 ), s = 1.0;
		if ( k > 0.0 ) s = getShadowA( shadowMap, at, shadowBias, shadowRadius - 16.0, vec4( 0.5 + n.x * 0.5, n.yz, 1.0 ) );
		if ( k >= 1.0 ) return s;
		float f = 1.0; vec2 ef = min( c.xy, 1.0 - c.xy );
		if ( min( ef.x, ef.y ) > m ) f = ${A ? `texture( shadowMap, vec3( c.x * 0.5, c.y, c.z + shadowBias * ${NS_K}.0 ) )` : `getShadowA( shadowMap, at, shadowBias * ${NS_K}.0, shadowRadius - 16.0, vec4( c.x * 0.5, c.y, c.z, 1.0 ) )`};
		return k > 0.0 ? mix( f, s, k ) : f;
	}
`;
// сдвиг ближней половины относительно дальней (дальняя рисуется реже - её коробка отстаёт на шаг-два): общий для всех программ (простой объект three не копирует)
export const NS_OFF = { x: 0, y: 0, z: 0 };
export function shadowPatch(renderer) {
  if (patched) return; patched = true;
  const C = THREE.ShaderChunk, src = C.shadowmap_pars_fragment, i = src.indexOf('float getShadow('), j = src.indexOf('vec2 cubeToUV(');
  if (i < 0 || j < 0) return; // другая версия three - как есть
  hw = HWS && renderer.capabilities.isWebGL2 && renderer.shadowMap.hw === false; if (hw) renderer.shadowMap.hw = true;
  const body = src.slice(i, j).replace('float getShadow(', 'float getShadowA('), dirD = 'uniform sampler2D directionalShadowMap[ NUM_DIR_LIGHT_SHADOWS ];';
  for (const k in THREE.ShaderLib) { const u = THREE.ShaderLib[k].uniforms; if (u && u.directionalShadowMap) u.nsOff = { value: NS_OFF }; }
  THREE.UniformsLib.lights.nsOff = { value: NS_OFF };
  const A = `
	float getShadowA( highp sampler2DShadow shadowMap, vec2 shadowMapSize, float shadowBias, float shadowRadius, vec4 shadowCoord ) {
		vec3 c = shadowCoord.xyz / shadowCoord.w; c.z += shadowBias;
		if ( c.x < 0.0 || c.x > 1.0 || c.y < 0.0 || c.y > 1.0 || c.z > 1.0 ) return 1.0;
		vec2 t = vec2( 0.6 ) / shadowMapSize;
		#ifdef NS_LITE
		return 0.5 * ( texture( shadowMap, vec3( c.xy + t * 0.6, c.z ) ) + texture( shadowMap, vec3( c.xy - t * 0.6, c.z ) ) );
		#else
		return 0.25 * ( texture( shadowMap, vec3( c.xy + t, c.z ) ) + texture( shadowMap, vec3( c.xy - t, c.z ) ) + texture( shadowMap, vec3( c.xy + vec2( t.x, - t.y ), c.z ) ) + texture( shadowMap, vec3( c.xy + vec2( - t.x, t.y ), c.z ) ) );
		#endif
	}
`;
  C.shadowmap_pars_fragment = 'uniform vec3 nsOff;\n' + (hw ? src.slice(0, i).replace(dirD, dirD.replace('uniform sampler2D', 'uniform highp sampler2DShadow')) + body.replace('getShadowA(', 'getShadow(') + A + NS2(true) : src.slice(0, i) + body + NS2(false)) + src.slice(j);
}
// «Средний»: вместо 17 выборок 5 (углы и середина); с аппаратным сглаживанием - две (define в начале куска). До сборки материалов карты
function lite() {
  const C = THREE.ShaderChunk; let s = C.shadowmap_pars_fragment; if (!patched || s.includes('#define NS_LITE')) return;
  if (hw) { C.shadowmap_pars_fragment = '#define NS_LITE\n' + s; return; }
  const m = /shadow = \(([\s\S]*?)\)\s*\*\s*\(\s*1\.0 \/ 17\.0\s*\);/.exec(s), t = m ? m[1].match(/texture2DCompare\(.*?shadowCoord\.z \)/g) || [] : [], five = t.filter((q) => /vec2\( dx[01], dy[01] \)|shadowCoord\.xy, shadowCoord\.z/.test(q));
  if (five.length === 5) C.shadowmap_pars_fragment = s.replace(m[0], `shadow = (${five.join(' + ')}) * 0.2;`);
}
// light - солнце (DirectionalLight), N - сторона половины карты, far - полуразмер дальней (м), sunY - высота солнца (синус)
export function nearShadow(light, N, far, sunY, G, renderer, lt = false) {
  shadowPatch(renderer); if (lt) lite();
  // подставные формы теней (Mark 2026-11-25): простая крона вместо дерева, лепестки вместо куста травы - видны только карте теней, в кадр не попадают
  // (visible включается на время её прохода). G.nsProxy.far - в дальней половине, .near - в ближней; подробные наборы домов и деревьев - только в ближней
  // (в дальней дома дают тень коробками плиток, деревья - подставными кронами)
  const PX = G.nsProxy = { far: [], near: [], both: [] }, SM = renderer.shadowMap, r0 = SM.render;
  const show = (L, v) => { for (let i = 0; i < L.length; i++) L[i].visible = v; };
  SM.render = function (a, b, c) { r0.call(SM, a, b, c); show(PX.far, false); show(PX.near, false); show(PX.both, false); if (G.nsPools) G.nsPools((m) => { if (m.userData.nsC !== undefined) { m.count = m.userData.nsC; m.userData.nsC = undefined; } }); };
  const sh = light.shadow, near = far / NS_K, texN = 2 * near / N, P = new THREE.Vector3(), T = new THREE.Vector3(), PM = new THREE.Matrix4();
  sh.mapSize.set(N, N); sh._frameExtents.set(2, 1); sh._viewportCount = 2; sh._viewports = [new THREE.Vector4(1, 0, 1, 1), new THREE.Vector4(0, 0, 1, 1)]; // сначала ближняя (правая половина), потом дальняя
  sh.radius = 17; // признак двойной карты (16 + обычный радиус 1)
  const c = sh.camera, depth = c.far - c.near, tan = sunY / Math.sqrt(Math.max(1e-4, 1 - sunY * sunY));
  sh.normalBias = texN * 1.5; sh.bias = -Math.min(0.6, texN * 0.9 / Math.max(0.12, tan)) / depth; // ближняя; у дальней в шейдере ×NS_K
  // дальняя половина - раз в FE кадров (или если коробка ушла дальше 4 % её полуразмера): там дома, рельеф и кроны, за 3 кадра они не меняются; ?fsh=1 - каждый кадр
  const FE = +((typeof location !== 'undefined' && /[?&]fsh=(\d+)/.exec(location.search) || [])[1] || 3), O3 = new THREE.Vector3(), M3 = new THREE.Matrix4(); let fn = 0, zT = 0, have = false;
  sh.skipView = (l) => {
    if (FE < 2) return -1; T.setFromMatrixPosition(l.target.matrixWorld); fn++;
    if (have && sh.map && fn % FE) { O3.copy(T).applyMatrix4(M3); O3.x -= 0.5; O3.y -= 0.5; O3.z -= zT; if (Math.max(Math.abs(O3.x), Math.abs(O3.y)) < 0.02) { NS_OFF.x = O3.x; NS_OFF.y = O3.y; NS_OFF.z = O3.z; return 1; } }
    fn = 0; NS_OFF.x = NS_OFF.y = NS_OFF.z = 0; return -1;
  };
  sh.updateMatrices = function (l, vp) {
    P.setFromMatrixPosition(l.matrixWorld); c.position.copy(P); T.setFromMatrixPosition(l.target.matrixWorld); c.lookAt(T);
    const nr = !vp, b = nr ? near : far;
    // наборы ближних моделей (дома, деревья): экземпляры внутри ближней коробки стоят в буфере первыми (city-render G.near) - в ближнюю половину рисуем только их
    if (nr) show(PX.both, true);
    show(PX.far, !nr); show(PX.near, nr);
    if (G.nsPools) G.nsPools((m) => { if (nr) { m.userData.nsC = m.count; m.count = m.userData.nsN; } else m.count = m.userData.nsFar ? m.userData.nsC : 0; }); c.left = c.bottom = -b; c.right = c.top = b; c.updateProjectionMatrix(); c.updateMatrixWorld();
    PM.multiplyMatrices(c.projectionMatrix, c.matrixWorldInverse); this._frustum.setFromProjectionMatrix(PM);
    if (!nr) this.matrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1).multiply(PM), M3.copy(this.matrix), zT = O3.copy(T).applyMatrix4(M3).z, have = true;
  };
}
// подставная крона дерева (высота 1, у земли 0): round - лиственное, иначе ель / сосна конусом; около 20 треугольников
export function treeShadowGeo(round) {
  const t = new THREE.CylinderGeometry(0.025, 0.035, 0.4, 3, 1, true), c = round ? new THREE.IcosahedronGeometry(0.33, 0) : new THREE.ConeGeometry(0.2, 0.75, 5, 1, false);
  t.translate(0, 0.2, 0); c.translate(0, round ? 0.66 : 0.62, 0);
  const A = t.toNonIndexed(), B = c.index ? c.toNonIndexed() : c, n = A.attributes.position.count, p = new Float32Array((n + B.attributes.position.count) * 3);
  p.set(A.attributes.position.array); p.set(B.attributes.position.array, n * 3);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3)); return g;
}
// лепестки куста травы: высота h, размах w - пять узких треугольников наклонно
export function tuftShadowGeo(h, w) {
  const p = [], n = 5; for (let i = 0; i < n; i++) { const a = i * 2.39996, c = Math.cos(a), s = Math.sin(a), b = w * 0.11, o = w * (0.12 + 0.05 * i), t = w * 0.42;
    p.push(c * o - s * b, 0, s * o + c * b, c * o + s * b, 0, s * o - c * b, c * t, h * (0.95 - 0.08 * i), s * t); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); return g;
}
export const shadowOnly = () => new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, color: 0 });
