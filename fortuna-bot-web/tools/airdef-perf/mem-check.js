// Видеопамять: текстуры (по размерам картинок, с мипмапами), цели отрисовки, геометрия — и откуда они
import puppeteer from 'npm:puppeteer-core@22.15.0';
const [preset = 'ultra', map = 'city'] = Deno.args;
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', protocolTimeout: 300000,
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--window-size=915,412', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 915, height: 412, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true, isLandscape: true });
  await page.evaluateOnNewDocument(() => { if (typeof ImageBitmap !== 'undefined') ImageBitmap.prototype.close = function () {}; }); // замер: размеры картинок не пропадают
  await page.evaluateOnNewDocument((p) => { localStorage.setItem('fortuna_airdef_setup', JSON.stringify({ game: 'air', diff: 'arcade', era: 3, side: 'east' })); localStorage.setItem('fortuna_airdef_gfx', p); }, preset);
  await page.goto(`http://127.0.0.1:8937/fortuna-bot-web/games/airdef.html?test=1&touch=1&map=${map}&weather=day&go=air`, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => window.__a && window.__a.state === 'play', { timeout: 180000, polling: 500 });
  for (let i = 0; i < 150; i++) { const l = await page.evaluate(() => { const e = document.getElementById('assetLoad'); return e && e.classList.contains('on'); }); if (!l && i > 8) break; await new Promise((r) => setTimeout(r, 1000)); }
  await page.evaluate(() => { const C = window.__a; if (C.setAuto) C.setAuto(true); });
  await new Promise((r) => setTimeout(r, 20000));
  const res = await page.evaluate(() => {
    const C = window.__a, tex = new Map(), geos = new Set();
    const addT = (t, where) => { if (!t || !t.isTexture || tex.has(t)) return; const im = t.image || {}; const w = im.width || 0, h = im.height || 0;
      const mip = t.generateMipmaps !== false && t.minFilter !== THREE.LinearFilter && t.minFilter !== THREE.NearestFilter;
      let src = (im.src || im.currentSrc || '').split('/').slice(-2).join('/').split('?')[0];
      if (t.isCompressedTexture) { const b = (t.mipmaps || []).reduce((s, m) => s + (m.data ? m.data.byteLength : 0), 0); tex.set(t, { w, h, mb: b / 1048576, where, src: 'KTX2 (сжатая)' }); return; }
      if (!src) src = t.flipY === false && t.anisotropy === 4 && typeof ImageBitmap !== 'undefined' && im instanceof ImageBitmap ? 'models/' : t.isDataTexture ? 'data' : im.getContext ? 'canvas' : im instanceof ImageBitmap ? 'bitmap (земля, город)' : '?';
      tex.set(t, { w, h, mb: w * h * 4 * (mip ? 4 / 3 : 1) / 1048576, where, src }); };
    const walkMat = (m, where) => { for (const k in m) { const v = m[k]; if (v && v.isTexture) addT(v, where); } if (m.uniforms) for (const k in m.uniforms) { const v = m.uniforms[k] && m.uniforms[k].value; if (v && v.isTexture) addT(v, where); if (Array.isArray(v)) v.forEach((x) => x && x.isTexture && addT(x, where)); } };
    C.scene.traverse((o) => { const where = (() => { for (let p = o; p; p = p.parent) { if (p === C.scene) break; if (/^G\./.test(p.name || '')) return p.name.split('.').slice(0, 2).join('.'); } return o.type; })();
      const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : []; for (const m of ms) walkMat(m, where);
      if (o.geometry) geos.add(o.geometry); });
    let gmb = 0; for (const g of geos) for (const k in g.attributes) { const a = g.attributes[k]; gmb += (a.isInterleavedBufferAttribute ? a.data.array.byteLength / 2 : a.array.byteLength); } // переплетённые — примерно
    for (const g of geos) if (g.index) gmb += g.index.array.byteLength;
    const L = [...tex.values()], tot = L.reduce((s, t) => s + t.mb, 0);
    const by = {}; for (const t of L) { const k = /models\//.test(t.src) ? 'модели (glb)' : /fx\//.test(t.src) ? 'эффекты (fx)' : /tex\//.test(t.src) ? 'город и земля (tex)' : /sky\//.test(t.src) ? 'небо' : t.src; by[k] = (by[k] || 0) + t.mb; }
    const R = C.renderer, sz = R.getDrawingBufferSize(new THREE.Vector2());
    return { textures: L.length, texMB: +tot.toFixed(0), by: Object.fromEntries(Object.entries(by).map(([k, v]) => [k, +v.toFixed(0)]).sort((a, b) => b[1] - a[1]).slice(0, 10)),
      top: L.sort((a, b) => b.mb - a.mb).slice(0, 14).map((t) => `${t.mb.toFixed(1)} МБ ${t.w}×${t.h} ${t.src} [${t.where}]`), geoMB: +(gmb / 1048576).toFixed(0), geos: geos.size,
      buffer: `${sz.x}×${sz.y}`, info: R.info.memory, js: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null };
  });
  console.log(`== ${preset} · ${map}`); console.log(JSON.stringify(res, null, 1));
} finally { await browser.close(); }
