// Дальние копии объектов: до (?farflat=0) и после — снимки с одной точки (за порогом lodObj) и телевиком; вызовы на копию
import puppeteer from 'npm:puppeteer-core@22.15.0';
const [preset = 'medium', map = 'city'] = Deno.args;
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', protocolTimeout: 300000,
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--window-size=915,412', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });
const shots = async (flag) => {
  const page = await browser.newPage(); const errs = []; page.on('pageerror', (e) => errs.push(String(e).slice(0, 160)));
  await page.setViewport({ width: 915, height: 412, deviceScaleFactor: 2, isMobile: true, hasTouch: true, isLandscape: true });
  await page.evaluateOnNewDocument((p) => { localStorage.setItem('fortuna_airdef_setup', JSON.stringify({ game: 'air', diff: 'arcade', era: 3, side: 'east' })); localStorage.setItem('fortuna_airdef_gfx', p); }, preset);
  await page.goto(`http://127.0.0.1:8937/fortuna-bot-web/games/airdef.html?test=1&touch=1&map=${map}&weather=day&go=air${flag}`, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => window.__a && window.__a.state === 'play', { timeout: 180000, polling: 500 });
  for (let i = 0; i < 150; i++) { const l = await page.evaluate(() => { const e = document.getElementById('assetLoad'); return e && e.classList.contains('on'); }); if (!l && i > 8) break; await new Promise((r) => setTimeout(r, 1000)); }
  await new Promise((r) => setTimeout(r, 6000));
  console.log(flag || 'после', 'готовность копий:', await page.evaluate(() => JSON.stringify(Object.fromEntries(Object.entries(window.__a.G.objFar || {}).map(([k, f]) => [k, f ? [f.userData.ready, [...(f.userData.left || [])].join('+')] : null])))));
  await new Promise((r) => setTimeout(r, 3000));
  const info = await page.evaluate(() => { window.requestAnimationFrame = () => 0; const G = window.__a.G, o = {}; for (const id in G.objFar) { let n = 0; G.objFar[id].traverse((q) => { if (q.isMesh && q.visible) n++; }); o[id] = n; } return o; });
  const out = [];
  const ids = Object.keys(info);
  for (const id of ids) for (const tele of [false, true]) {
    await page.evaluate((id, tele) => {
      const C = window.__a, G = C.G, R = C.renderer, ob = C.city.objects.find((q) => String(q.id) === String(id)), P = C.P;
      for (const k in G.objGroup) { G.objGroup[k].visible = false; if (G.objFar[k]) G.objFar[k].visible = false; if (G.objBox[k]) G.objBox[k].visible = false; if (G.objMesh[k]) G.objMesh[k].visible = String(k) === String(id); }
      G.objFar[id].visible = true;
      const d = (P.lodObj || 5000) + 300, cam = new THREE.PerspectiveCamera(tele ? 3 : C.camera.fov, R.domElement.width / R.domElement.height, 5, 40000);
      const gy = C.city.groundH(ob.x, ob.z); cam.position.set(ob.x - d * 0.8, gy + 700, ob.z - d * 0.6); cam.lookAt(ob.x, gy + 15, ob.z); cam.updateMatrixWorld();
      R.setRenderTarget(null); R.render(C.scene, cam);
    }, id, tele);
    const W = 915 * 2, H = 412 * 2, cw = tele ? 900 : 160, ch = tele ? 600 : 110;
    const buf = await page.screenshot({ clip: { x: (915 - cw / 2) / 2, y: (412 - ch / 2) / 2, width: cw / 2, height: ch / 2 } });
    out.push({ id, tele, buf });
  }
  await page.close(); return { info, out, errs };
};
const A = await shots('&farflat=0'), B = await shots('');
Deno.mkdirSync('far', { recursive: true });
for (let i = 0; i < A.out.length; i++) { const a = A.out[i], b = B.out[i]; Deno.writeFileSync(`far/${a.id}-${a.tele ? 'tele' : 'real'}-before.png`, a.buf); Deno.writeFileSync(`far/${b.id}-${b.tele ? 'tele' : 'real'}-after.png`, b.buf); }
console.log(preset, map, 'вызовов на копию до:', JSON.stringify(A.info), 'после:', JSON.stringify(B.info), 'ошибки:', [...A.errs, ...B.errs].slice(0, 3));
await browser.close();
