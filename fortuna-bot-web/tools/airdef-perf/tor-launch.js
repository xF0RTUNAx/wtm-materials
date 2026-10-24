// Пуск «Тора» в игре (кадр рисует сама игра): крышка ячейки открывается, катапульта выбрасывает 9М331 вверх, газовые рули склоняют её
// к цели, двигатель включается на высоте ≈ 20 м. Цель — самолёт игрока, его держим в 7 км сбоку на 1,5 км. Камера: крупно башня (крышка),
// с момента пуска — общий план сбоку. Печатает ход пуска (высота, скорость, наклон, двигатель), пишет кадры, лист кадров и ролик.
//   deno run -A tools/airdef-perf/tor-launch.js [папка = .] [пресет = high] [ключ = tor] [секунд после пуска = 4] [карта = autumn (степь — дома не закрывают)]
import puppeteer from 'npm:puppeteer-core@22.15.0';
const [out = '.', preset = 'high', key = 'tor', secArg = '4', map = 'autumn'] = Deno.args, FPS = 30, SEC = +secArg;
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', protocolTimeout: 900000,
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--window-size=1280,720', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });
try {
  const page = await browser.newPage(); const errs = []; page.on('pageerror', (e) => errs.push(String(e).slice(0, 160)));
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 300)); });
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1.5 });
  // side — сторона обороны: «Тор» у востока (эпоха III — tor, IV — torm2), игрок летит за запад
  await page.evaluateOnNewDocument((p, era) => { localStorage.setItem('fortuna_airdef_setup', JSON.stringify({ game: 'air', diff: 'arcade', era, side: 'east' })); localStorage.setItem('fortuna_airdef_gfx', p); }, preset, key === 'torm2' ? 4 : 3);
  await page.goto(`http://127.0.0.1:8937/fortuna-bot-web/games/airdef.html?test=1&map=${map}&weather=day&go=air`, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => window.__a && window.__a.state === 'play', { timeout: 180000, polling: 500 });
  for (let i = 0; i < 150; i++) { const l = await page.evaluate(() => { const e = document.getElementById('assetLoad'); return e && e.classList.contains('on'); }); if (!l && i > 6) break; await new Promise((r) => setTimeout(r, 1000)); }
  // камера — к «Тору» (подробная модель грузится, когда камера ближе 1,5 км)
  const found = await page.evaluate((key) => {
    const C = window.__a, u = C.S.units.find((q) => q.key === key && !q.dead); if (!u) return null;
    window.requestAnimationFrame = () => 0; const ctrl = C.ctrl; ctrl.afterRender = () => {}; ctrl.extraCam = () => null; window.__t = performance.now();
    window.__u = u; window.__cam = { mode: 'close' };
    // направление на цель — вбок от машины (вправо), чтобы склонение ракеты было видно сбоку
    const R = new THREE.Vector3(Math.cos(u.yaw), 0, -Math.sin(u.yaw)), F = new THREE.Vector3(-Math.sin(u.yaw), 0, -Math.cos(u.yaw));
    window.__R = R; window.__F = F;
    // камера — в осях башни (она повернулась на цель): крупно — снаружи от крышки следующей ячейки; общий план — сбоку от линии на цель, 30 м
    C.ctrl.camera = () => {
      const cam = C.camera, p = u.pos, m = window.__cam, a = u.yaw + u.lyaw, tr = { x: Math.cos(a), z: -Math.sin(a) }, tf = { x: -Math.sin(a), z: -Math.cos(a) };
      const k = (u.S.ammo - Math.round(u.ammo)) % 8, sx = k % 2 ? 1 : -1, zb = 0.25 + 0.4 * Math.floor(k / 2) + 0.37; // слот: L1, R1, L2, … за осью башни
      const lx = p.x + tr.x * sx * 1.1 - tf.x * zb, lz = p.z + tr.z * sx * 1.1 - tf.z * zb, ly = p.y - 1.5 + 3.7;
      if (m.mode === 'dish') { const dx = p.x + tf.x * 3.0, dz = p.z + tf.z * 3.0, dy = p.y - 1.5 + 3.77; cam.position.set(dx + tr.x * 6.5 + tf.x * 1.5, dy + 0.4, dz + tr.z * 6.5 + tf.z * 1.5); cam.lookAt(dx, dy - 0.3, dz); } // сбоку от тарелки (она — спереди башни)
      else if (m.mode === 'close') { cam.position.set(lx + tr.x * sx * 5.5 - tf.x * 2.5, ly + 3.2, lz + tr.z * sx * 5.5 - tf.z * 2.5); cam.lookAt(lx, ly - 0.2, lz); }
      else { cam.position.set(p.x + tr.x * 34 - tf.x * 6, p.y + 7, p.z + tr.z * 34 - tf.z * 6); cam.lookAt(p.x + tf.x * 5, p.y + 13, p.z + tf.z * 5); }
      cam.updateMatrixWorld();
    };
    return { id: u.id, key: u.key, ammo: u.ammo, yaw: +u.yaw.toFixed(2) };
  }, key);
  if (!found) throw new Error(`в бою нет «${key}»`);
  // шаг кадра; снимок — в том же вызове (буфер WebGL после кадра очищается)
  const step = (n, snap) => page.evaluate((n, FPS, snap) => {
    for (let q = 0; q < n; q++) { window.__t += 1000 / FPS; window.__a.paused = false; window.__frame(window.__t); }
    if (!snap) return null;
    const src = window.__a.renderer.domElement, cv = window.__cv || (window.__cv = document.createElement('canvas')); cv.width = src.width; cv.height = src.height;
    cv.getContext('2d').drawImage(src, 0, 0); return cv.toDataURL('image/jpeg', 0.92);
  }, n, FPS, !!snap);
  const save = (name, url) => Deno.writeFileSync(`${out}/${name}.jpg`, Uint8Array.from(atob(url.split(',')[1]), (c) => c.charCodeAt(0)));
  // ждём подробную модель (крышки lid0…7 появляются только у неё)
  for (let i = 0; i < 60; i++) { await step(3); const ok = await page.evaluate(() => { let n = 0; window.__a.scene.traverse((o) => { if (o.parent && o.parent.userData && o.parent.userData.sx !== undefined) n++; }); return n; }); if (ok >= 8) break; await new Promise((r) => setTimeout(r, 500)); }
  // цель: самолёт игрока — в 7 км справа на 1,5 км, летит вдоль машины (каждый шаг ставим заново); «Тор» сразу её сопровождает
  const hold = () => page.evaluate(() => {
    const C = window.__a, u = window.__u, P = C.player, R = window.__R, F = window.__F; if (!P) return;
    P.pos.set(u.pos.x + R.x * 7000, u.pos.y + 1500, u.pos.z + R.z * 7000); if (P.vel) P.vel.set(F.x * 200, 0, F.z * 200); P.dead = false; if (P.hp !== undefined) P.hp = Math.max(P.hp, 50);
    u.emit = true; u.track = P; u.seeT = 99; u.lostT = 0; u.reactT = 99; u.cool = Math.min(u.cool, 0);
  });
  // в покое: цель далеко, РЛС молчит — крышки закрыты (иначе «Тор» сам захватит самолёт и откроет крышку до съёмки)
  const calm = () => page.evaluate(() => { const C = window.__a, u = window.__u, P = C.player; if (P) P.pos.set(u.pos.x + 60000, u.pos.y + 3000, u.pos.z); u.track = null; u.lid = 0; u.cool = 99; u.emit = false; u.seeT = 0; });
  for (let i = 0; i < 40; i++) { await calm(); await step(1); }
  await calm(); save('tor-0-rest', await step(1, true));
  // антенна сопровождения: цель у горизонта (2°), на 28° (покой тарелки) и высоко (70°) — тарелка качается на цапфе, опора на башне на месте
  await page.evaluate(() => { window.__cam.mode = 'dish'; });
  for (const [nm, el] of [['low', 2], ['mid', 28], ['high', 70]]) {
    for (let i = 0; i < 70; i++) {
      await page.evaluate((el) => { const C = window.__a, u = window.__u, P = C.player, R = window.__R, e = el / 57.3; P.pos.set(u.pos.x + R.x * 3000 * Math.cos(e), u.pos.y + 3000 * Math.sin(e), u.pos.z + R.z * 3000 * Math.cos(e)); P.dead = false; u.emit = true; u.track = P; u.seeT = 99; u.lostT = 0; u.cool = 99; u.reactT = 0; }, el);
      const url = await step(1, i === 69); if (url) save(`tor-dish-${nm}`, url);
    }
  }
  await page.evaluate(() => { window.__cam.mode = 'close'; });
  for (let i = 0; i < 40; i++) { await calm(); await step(1); }
  const log = []; let launched = -1, f = 0;
  const rec = () => page.evaluate(() => {
    const C = window.__a, u = window.__u, m = C.S.sams.find((q) => q.unit === u && !q.dead && q.id > window.__mid0); // только ракета этого пуска (до съёмки он мог уже стрелять)
    const r = { lid: +u.lid.toFixed(2), lyaw: +u.lyaw.toFixed(2), ammo: u.ammo };
    if (m) { const gy = C.city.groundH(u.pos.x, u.pos.z); Object.assign(r, { t: +m.t.toFixed(2), h: +(m.pos.y - gy).toFixed(1), v: +m.speed.toFixed(1), tilt: +(90 - Math.asin(Math.max(-1, Math.min(1, m.dir.y))) * 57.3).toFixed(0), lit: !!m.lit, slot: m.slot }); }
    return r;
  });
  await page.evaluate(() => { window.__u.cool = 0; window.__mid0 = Math.max(-1, ...window.__a.S.sams.map((q) => q.id)); });
  for (; f < FPS * (2 + SEC); f++) {
    await hold(); const url = await step(1, true);
    const r = await rec(); log.push(r);
    if (launched < 0 && r.t !== undefined) { launched = f; await page.evaluate(() => { window.__cam.mode = 'wide'; }); }
    if (launched < 0) save(`tor-1-lid-${String(f).padStart(3, '0')}`, url);
    else { save(`tor-2-launch-${String(f - launched).padStart(3, '0')}`, url); if (f - launched >= FPS * SEC) break; }
  }
  // ход пуска — каждые 0,1 с после выброса
  const L0 = log.findIndex((r) => r.t !== undefined);
  console.log('крышка до пуска (u.lid по кадрам, каждые 0,1 с):', log.slice(0, L0 < 0 ? 30 : L0).filter((_, i) => i % 3 === 0).map((r) => r.lid).join(' '));
  if (L0 >= 0) { let ign = null; for (const r of log.slice(L0)) { if (r.t === undefined) continue; if (r.lit && ign === null) ign = r; } console.log('зажигание:', ign ? `t ${ign.t} с, высота ${ign.h} м, скорость ${ign.v} м/с, наклон от вертикали ${ign.tilt}°` : 'нет'); }
  for (const r of log.slice(Math.max(0, L0))) if (r.t !== undefined && Math.abs(r.t * 10 - Math.round(r.t * 10)) < 0.17) console.log(`  t ${r.t.toFixed(1)} с: высота ${r.h} м, ${r.v} м/с, наклон ${r.tilt}°, двигатель ${r.lit ? 'да' : 'нет'}, слот ${r.slot}`);
  console.log(JSON.stringify({ found, launchedAtFrame: launched, errs: errs.slice(0, 5) }));
} finally { await browser.close(); }
