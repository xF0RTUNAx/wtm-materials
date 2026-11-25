// Тени двух масштабов одной картой (Mark 2026-11-25: «картинка выгоревшая и плоская»): левая половина карты - прежняя дальняя (P.shadowBox),
// правая - ближняя вокруг того же центра, в NS_K раз подробнее (техника, деревья и дома рядом, тень самолёта на нём самом).
// Обе - одной ортокамерой вдоль солнца с одним центром: ближняя координата получается из дальней прямо в шейдере, ни второго источника,
// ни второй текстуры, ни лишних varying не нужно (у земли и так много текстур). Прежний сдвиг (bias −0,0004 при глубине 11,9 км = 4,8 м и
// normalBias 1,5 м) съедал тени всего, что ниже ~5 м - теперь он считается от пикселя карты и высоты солнца.
// Чужие тени (ангар в меню) - без изменений: признак двойной карты - shadowRadius больше 8. ?ns=0 - как было.
/* global THREE */
export const NS_ON = typeof location === 'undefined' || !/[?&]ns=0/.test(location.search);
export const NS_K = 8;
let patched = false;
function patch(lite) {
  if (patched) return; patched = true;
  const C = THREE.ShaderChunk, src = C.shadowmap_pars_fragment, i = src.indexOf('float getShadow('), j = src.indexOf('vec2 cubeToUV(');
  if (i < 0 || j < 0) return; // другая версия three - как есть
  let body = src.slice(i, j).replace('float getShadow(', 'float getShadowA(');
  if (lite) { // «Средний»: PCF в 5 выборок (углы и середина) вместо 17
    const m = /shadow = \(([\s\S]*?)\)\s*\*\s*\(\s*1\.0 \/ 17\.0\s*\);/.exec(body), t = m ? m[1].match(/texture2DCompare\(.*?shadowCoord\.z \)/g) || [] : [], five = t.filter((q) => /vec2\( dx[01], dy[01] \)|shadowCoord\.xy, shadowCoord\.z/.test(q));
    if (five.length === 5) body = body.replace(m[0], `shadow = (${five.join(' + ')}) * 0.2;`);
  }
  C.shadowmap_pars_fragment = src.slice(0, i) + body + `
	float getShadow( sampler2D shadowMap, vec2 shadowMapSize, float shadowBias, float shadowRadius, vec4 shadowCoord ) {
		if ( shadowRadius < 8.0 ) return getShadowA( shadowMap, shadowMapSize, shadowBias, shadowRadius, shadowCoord );
		vec3 c = shadowCoord.xyz / shadowCoord.w; vec2 at = vec2( shadowMapSize.x * 2.0, shadowMapSize.y ), n = ( c.xy - 0.5 ) * ${NS_K}.0 + 0.5;
		if ( c.z >= 1.0 ) return 1.0;
		float m = 4.0 / shadowMapSize.x, en = min( min( n.x, 1.0 - n.x ), min( n.y, 1.0 - n.y ) ) - m, k = clamp( en * 12.0, 0.0, 1.0 ), s = 1.0;
		if ( k > 0.0 ) s = getShadowA( shadowMap, at, shadowBias, shadowRadius - 16.0, vec4( 0.5 + n.x * 0.5, n.y, c.z, 1.0 ) );
		if ( k >= 1.0 ) return s;
		float f = 1.0; vec2 ef = min( c.xy, 1.0 - c.xy );
		if ( min( ef.x, ef.y ) > m ) f = getShadowA( shadowMap, at, shadowBias * ${NS_K}.0, shadowRadius - 16.0, vec4( c.x * 0.5, c.y, c.z, 1.0 ) );
		return k > 0.0 ? mix( f, s, k ) : f;
	}
	` + src.slice(j);
}
// light - солнце (DirectionalLight), N - сторона половины карты, far - полуразмер дальней (м), sunY - высота солнца (синус)
export function nearShadow(light, N, far, sunY, G, renderer, lite = false) {
  patch(lite);
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
  sh.updateMatrices = function (l, vp) {
    P.setFromMatrixPosition(l.matrixWorld); c.position.copy(P); T.setFromMatrixPosition(l.target.matrixWorld); c.lookAt(T);
    const nr = !vp, b = nr ? near : far;
    // наборы ближних моделей (дома, деревья): экземпляры внутри ближней коробки стоят в буфере первыми (city-render G.near) - в ближнюю половину рисуем только их
    if (nr) show(PX.both, true);
    show(PX.far, !nr); show(PX.near, nr);
    if (G.nsPools) G.nsPools((m) => { if (nr) { m.userData.nsC = m.count; m.count = m.userData.nsN; } else m.count = m.userData.nsFar ? m.userData.nsC : 0; }); c.left = c.bottom = -b; c.right = c.top = b; c.updateProjectionMatrix(); c.updateMatrixWorld();
    PM.multiplyMatrices(c.projectionMatrix, c.matrixWorldInverse); this._frustum.setFromProjectionMatrix(PM);
    if (!nr) this.matrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1).multiply(PM);
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
