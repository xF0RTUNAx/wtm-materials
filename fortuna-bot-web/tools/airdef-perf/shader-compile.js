// Какие шейдеры собираются посреди боя (рывок кадра и лишний ЦП): новые программы renderer.info.programs после старта боя, с временем и именем.
//   deno run -A shader-compile.js [пресет=medium] [карта=city] [игра=air] [с=40]
import puppeteer from 'npm:puppeteer-core@22.15.0';
const [preset = 'medium', map = 'city', game = 'air', secS = '40'] = Deno.args;
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', protocolTimeout: 600000,
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--window-size=915,412', '--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] });
try {
  const page = await browser.newPage(); const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  await page.setViewport({ width: 915, height: 412, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true, isLandscape: true });
  await page.evaluateOnNewDocument((p, g) => { localStorage.setItem('fortuna_airdef_setup', JSON.stringify({ game: g, diff: 'arcade', era: 3, side: 'east' })); localStorage.setItem('fortuna_airdef_gfx', p); }, preset, game);
  await page.goto(`http://127.0.0.1:${Deno.env.get('PORT') || '8937'}/fortuna-bot-web/games/airdef.html?test=1&touch=1&map=${map}&weather=day&go=${game}${Deno.env.get('Q') || ''}`, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => window.__a && window.__a.state === 'play', { timeout: 180000, polling: 500 });
  await page.evaluate(() => {
    const C = window.__a, R = C.renderer, seen = new Set(R.info.programs.map((p) => p.cacheKey)); window.__np = []; const t0 = performance.now();
    window.__state = () => ({ n: R.info.programs.length });
    const PN = ['precision', 'isWebGL2', 'supportsVertexTextures', 'outputEncoding', 'instancing', 'instancingColor', 'map', 'mapEncoding', 'matcap', 'matcapEncoding', 'envMap', 'envMapMode', 'envMapEncoding', 'envMapCubeUV', 'lightMap', 'lightMapEncoding', 'aoMap', 'emissiveMap', 'emissiveMapEncoding', 'bumpMap', 'normalMap', 'objectSpaceNormalMap', 'tangentSpaceNormalMap', 'clearcoatMap', 'clearcoatRoughnessMap', 'clearcoatNormalMap', 'displacementMap', 'specularMap', 'roughnessMap', 'metalnessMap', 'gradientMap', 'alphaMap', 'combine', 'vertexColors', 'vertexAlphas', 'vertexTangents', 'vertexUvs', 'uvsVertexOnly', 'fog', 'useFog', 'fogExp2', 'flatShading', 'sizeAttenuation', 'logarithmicDepthBuffer', 'skinning', 'maxBones', 'useVertexTexture', 'morphTargets', 'morphNormals', 'premultipliedAlpha', 'numDirLights', 'numPointLights', 'numSpotLights', 'numHemiLights', 'numRectAreaLights', 'numDirLightShadows', 'numPointLightShadows', 'numSpotLightShadows', 'shadowMapEnabled', 'shadowMapType', 'toneMapping', 'physicallyCorrectLights', 'alphaTest', 'doubleSided', 'flipSided', 'numClippingPlanes', 'numClipIntersection', 'depthPacking', 'dithering', 'sheen', 'transmissionMap', 'rOutEnc', 'gamma', 'custom'];
    const tail = (k) => k.split(',').slice(-PN.length), head = (k) => k.split(',').slice(0, -PN.length).join(',');
    // ближайшая уже собранная программа с тем же шейдером: какие параметры отличаются
    const diffKey = (k) => { const h = head(k), t = tail(k); let best = null; for (const p of R.info.programs) { if (p.cacheKey === k || head(p.cacheKey) !== h) continue; const d = []; tail(p.cacheKey).forEach((v, i) => { if (v !== t[i]) d.push(PN[i] + ':' + v + '→' + t[i]); }); if (!best || d.length < best.length) best = d; } return best ? best.join(' ') : 'новый шейдер'; };
    setInterval(() => { for (const p of R.info.programs) if (!seen.has(p.cacheKey)) { seen.add(p.cacheKey); window.__np.push({ t: +((performance.now() - t0) / 1000).toFixed(1), name: p.name, key: p.cacheKey.slice(0, 160), diff: diffKey(p.cacheKey) }); } }, 100);
    if (C.setAuto) C.setAuto(true);
    // материалы, у которых version растёт (needsUpdate каждый кадр → поиск программы заново)
    const ver = new Map(); window.__mv = {};
    setInterval(() => { C.scene.traverse((o) => { const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : []; for (const m of ms) { const v0 = ver.get(m); if (v0 !== undefined && m.version > v0) { const k = (m.name || m.type) + ' @' + (o.name || o.type) + (o.isInstancedMesh ? ' inst' : ''); window.__mv[k] = (window.__mv[k] || 0) + (m.version - v0); } ver.set(m, m.version); } }); }, 1000);
  });
  await new Promise((r) => setTimeout(r, +secS * 1000));
  const np = await page.evaluate(() => ({ list: window.__np, n: window.__a.renderer.info.programs.length, mv: Object.entries(window.__mv).sort((a, b) => b[1] - a[1]).slice(0, 15) }));
  console.log('материалы с needsUpdate (рост version за всё время):', JSON.stringify(np.mv));
  console.log(`== ${preset} · ${map} · ${game}: программ всего ${np.n}, новых за ${secS} с боя: ${np.list.length}`);
  for (const p of np.list) console.log(`${String(p.t).padStart(5)} с  ${p.name}  ${p.diff}`);
  if (errs.length) console.log('ошибки:', errs.slice(0, 3));
} finally { await browser.close(); }
