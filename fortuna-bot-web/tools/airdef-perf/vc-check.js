// Проверка: у всех сеток с цветом вершин (vertexColors) есть атрибут color — и у дальних копий объектов (farGeo + bakeGroup)
import puppeteer from 'npm:puppeteer-core@22.15.0';
const [map = 'city', preset = 'medium'] = Deno.args;
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', protocolTimeout: 300000,
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--window-size=915,412', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] });
try {
  const page = await browser.newPage(); const errs = []; page.on('pageerror', (e) => errs.push(String(e).slice(0, 160)));
  await page.setViewport({ width: 915, height: 412, deviceScaleFactor: 2, isMobile: true, hasTouch: true, isLandscape: true });
  await page.evaluateOnNewDocument((preset) => { localStorage.setItem('fortuna_airdef_setup', JSON.stringify({ game: 'air', diff: 'arcade', era: 3, side: 'east' })); localStorage.setItem('fortuna_airdef_gfx', preset); }, preset);
  await page.goto(`http://127.0.0.1:8937/fortuna-bot-web/games/airdef.html?test=1&touch=1&map=${map}&weather=day&go=air`, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => window.__a && window.__a.state === 'play', { timeout: 180000, polling: 500 });
  for (let i = 0; i < 150; i++) { const l = await page.evaluate(() => { const e = document.getElementById('assetLoad'); return e && e.classList.contains('on'); }); if (!l && i > 8) break; await new Promise((r) => setTimeout(r, 1000)); }
  await new Promise((r) => setTimeout(r, 6000));
  const res = await page.evaluate(() => {
    const G = window.__a.G, bad = [], far = { objects: 0, ready: 0, baked: 0, vcMeshes: 0, noColor: 0, packed: 0 };
    window.__a.scene.traverse((q) => { if (q.isMesh && q.material && !Array.isArray(q.material) && q.material.vertexColors && !q.geometry.attributes.color) bad.push(q.name || q.parent && q.parent.name || '?'); });
    for (const id in G.objFar || {}) { const f = G.objFar[id]; if (!f) continue; far.objects++; if (f.userData.ready) far.ready++;
      f.traverse((q) => { if (!q.isMesh) return; if (q.userData.baked) far.baked++; if (q.material.vertexColors) { far.vcMeshes++; const c = q.geometry.attributes.color; if (!c) far.noColor++; else if (c.normalized) far.packed++; } }); }
    return { bad: bad.length, badNames: [...new Set(bad)].slice(0, 12), far };
  });
  console.log(map, preset, JSON.stringify(res), 'ошибки страницы:', errs.length ? errs.slice(0, 3) : 'нет');
} finally { await browser.close(); }
