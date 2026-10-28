// С-300 / С-400 (своя пусковая 5П85): весь цикл в игре (кадр рисует сама игра) — пусковая лежит (РЛС выключена) → РЛС включили: домкраты,
// подъём пакета (≈ 13 с) → цель в зоне: крышка, холодный выброс, запуск двигателя (листы Blender), полёт → РЛС выключили: пакет ложится.
// Свою машину ставит рядом с первым комплексом боя (остальные убирает), цель — самолёт игрока (держим в зоне). Пишет кадры, лист кадров
// <ключ>-лист.jpg и ролик <ключ>.mp4; печатает ход (угол пакета, домкраты, крышка, ракета: время, высота, скорость, двигатель).
// Нужен сервер игры: cd /Users/mark./wtm-materials && python3 fortuna-bot-web/tools/dev/nocache-server.py 8937
//   deno run -A tools/airdef-perf/s300-launch.js [папка = .] [ключ = s300] [пресет = high] [карта = city]
import puppeteer from 'npm:puppeteer-core@22.15.0';
const [out = '.', key = 's300', preset = 'high', map = 'city'] = Deno.args, FPS = 30;
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', protocolTimeout: 900000,
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--window-size=1280,720', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });
try {
  const page = await browser.newPage(); const errs = []; page.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text().slice(0, 300)); });
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1.5 });
  await page.evaluateOnNewDocument((p) => { localStorage.setItem('fortuna_airdef_setup', JSON.stringify({ game: 'air', diff: 'arcade', era: 4, side: 'east' })); localStorage.setItem('fortuna_airdef_gfx', p); }, preset);
  await page.goto(`http://127.0.0.1:8937/fortuna-bot-web/games/airdef.html?test=1&map=${map}&weather=day&go=air`, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => window.__a && window.__a.state === 'play', { timeout: 180000, polling: 500 });
  const ok = await page.evaluate((key) => {
    const C = window.__a, u0 = C.S.units[0]; if (!u0) return false;
    window.requestAnimationFrame = () => 0; C.ctrl.afterRender = () => {}; C.ctrl.extraCam = () => null; window.__t = performance.now();
    for (const q of [...C.S.units]) C.S.removeUnit(q);
    // открытая площадка: в радиусе 70 м нет построек и земля ровная (камеры не упираются в дома) — по спирали от первого комплекса боя
    const ct = C.city, open = (x, z) => { const g0 = ct.groundH(x, z); for (let dx = -70; dx <= 70; dx += 14) for (let dz = -70; dz <= 70; dz += 14) if (ct.topAt(x + dx, z + dz) - ct.groundH(x + dx, z + dz) > 0.5 || Math.abs(ct.groundH(x + dx, z + dz) - g0) > 4) return false; return true; };
    let px = u0.pos.x, pz = u0.pos.z; for (let k = 0; k < 400; k++) { const a = k * 0.7, r = 40 + k * 12, x = u0.pos.x + Math.cos(a) * r, z = u0.pos.z + Math.sin(a) * r; if (open(x, z)) { px = x; pz = z; break; } }
    const u = C.S.addUnit(key, px, pz, { ambush: true, yaw: 0.6, skill: 1 }); window.__u = u; C.syncUnits(); // в засаде: РЛС молчит, пакет лежит
    const R = new THREE.Vector3(Math.cos(u.yaw), 0, -Math.sin(u.yaw)), F = new THREE.Vector3(-Math.sin(u.yaw), 0, -Math.cos(u.yaw)); window.__R = R; window.__F = F;
    window.__cam = { d: 24, h: 6, look: 3, side: 0.75, fwd: -0.45 };
    C.ctrl.camera = () => { // 3/4 сбоку-сзади: видно кабину, домкраты, цилиндр и пакет; d, h — расстояние и высота камеры, look — высота точки взгляда
      const c = window.__cam, cam = C.camera, p = u.pos, z = c.z || 0; // z — точка взгляда вдоль машины (пакет стоит за кормой: 6,6 м)
      const lx = p.x - F.x * z, lz = p.z - F.z * z; if (c.fov && cam.fov !== c.fov) { cam.fov = c.fov; cam.updateProjectionMatrix(); }
      const ox = c.ang !== undefined ? Math.sin(c.ang) : R.x * c.side + F.x * c.fwd, oz = c.ang !== undefined ? Math.cos(c.ang) : R.z * c.side + F.z * c.fwd; // ang — азимут камеры (pickWide)
      cam.position.set(lx + ox * c.d, p.y + c.h, lz + oz * c.d); cam.lookAt(lx, p.y + c.look, lz); cam.updateMatrixWorld();
    };
    // общий план: азимут, откуда видно и машину, и столб дыма (дома не загораживают)
    window.__pickWide = (d, h) => { const p = u.pos, lx = p.x + F.x * 6.6, lz = p.z + F.z * 6.6;
      for (let k = 0; k < 24; k++) { const a = Math.atan2(R.x, R.z) + k * 0.2618 * (k % 2 ? 1 : -1) * Math.ceil(k / 2) / Math.max(1, k), x = lx + Math.sin(a) * d, z = lz + Math.cos(a) * d, y = Math.max(p.y + h, C.city.topAt(x, z) + 3);
        if (C.city.los(x, y, z, lx, p.y + 3, lz, 5) && C.city.los(x, y, z, lx, p.y + 60, lz, 5)) return { a, y: y - p.y }; }
      return { a: Math.atan2(R.x, R.z), y: h }; };
    return true;
  }, key);
  if (!ok) throw new Error('в бою нет комплексов — некуда ставить');
  const step = (n, snap) => page.evaluate((n, FPS, snap) => {
    for (let q = 0; q < n; q++) { window.__t += 1000 / FPS; window.__a.paused = false; window.__frame(window.__t); }
    if (!snap) return null;
    const src = window.__a.renderer.domElement, cv = window.__cv || (window.__cv = document.createElement('canvas')); cv.width = src.width; cv.height = src.height;
    cv.getContext('2d').drawImage(src, 0, 0); return cv.toDataURL('image/jpeg', 0.9);
  }, n, FPS, !!snap);
  const save = (name, url) => Deno.writeFileSync(`${out}/${name}.jpg`, Uint8Array.from(atob(url.split(',')[1]), (c) => c.charCodeAt(0)));
  // цель далеко (не мешает), пока грузятся модели и листы
  const far = () => page.evaluate(() => { const C = window.__a, u = window.__u, P = C.player; if (P) P.pos.set(u.pos.x + 90000, u.pos.y + 3000, u.pos.z); u.track = null; u.seeT = 0; u.cool = 99; }); // seeT — и самолёты налёта не берёт
  for (let i = 0; i < 120; i++) { await far(); await step(1); if (i % 10 === 9) await new Promise((r) => setTimeout(r, 400)); }
  const st = () => page.evaluate(() => { const C = window.__a, u = window.__u, m = C.S.sams.find((q) => q.unit === u && !q.dead), gy = C.city.groundH(u.pos.x, u.pos.z), o = { dep: +(u.dep || 0).toFixed(1), lel: +(u.lel * 57.3).toFixed(0), lid: +u.lid.toFixed(2), jk: +(u.jkV ?? 0).toFixed(2) };
    if (m) Object.assign(o, { t: +m.t.toFixed(2), h: +(m.pos.y - gy).toFixed(1), v: +m.speed.toFixed(0), lit: !!m.lit }); return o; });
  const frames = []; let n = 0; const shot = async (tag) => { const f = `${key}-${String(n++).padStart(3, '0')}`; save(f, await step(1, true)); frames.push([f, tag]); };
  await far(); await shot('лежит'); console.log('лежит:', JSON.stringify(await st()));
  // РЛС включили: 15 с подъёма — кадр в ролик каждые 0,1 с
  await page.evaluate(() => window.__a.S.setEmit(window.__u, true));
  const up = [];
  for (let f = 0; f < 15 * FPS; f++) { await far(); if (f % 3 === 0) await shot(`подъём ${(f / FPS).toFixed(1)} с`); else await step(1); if (f % FPS === 0) up.push(await st()); }
  console.log('подъём (каждую с): ' + up.map((o) => `${o.dep}:${o.lel}°/дк ${o.jk}`).join(' · '));
  // цель в зоне: крышка, пуск; камера — ближе к пакету, после выхода — шире (лист 80 м)
  const hold = () => page.evaluate(() => {
    const C = window.__a, u = window.__u, P = C.player, R = window.__R, F = window.__F; if (!P) return;
    const dir = new THREE.Vector3().addScaledVector(F, 1).addScaledVector(R, 0.3).normalize();
    P.pos.set(u.pos.x + dir.x * 14000, u.pos.y + 4000, u.pos.z + dir.z * 14000); if (P.vel) P.vel.copy(dir).multiplyScalar(200); P.dead = false; if (P.hp !== undefined) P.hp = Math.max(P.hp, 50);
    u.track = P; u.seeT = 99; u.lostT = 0; u.reactT = 99;
  });
  // сверху на торцы (носы ракет в контейнерах, крышки), потом — у торцов сбоку
  await page.evaluate(() => Object.assign(window.__cam, { d: 3, h: 16, look: 7.8, z: 6.6, side: 0.5, fwd: 0.6, fov: 50 })); await shot('сверху');
  await page.evaluate(() => { window.__u.cool = 0; Object.assign(window.__cam, { d: 11, h: 10, look: 8.5, z: 6.6, side: 0.95, fwd: 0.3 }); });
  const lg = []; let t0 = -1;
  for (let f = 0; f < FPS * 9; f++) {
    await hold(); const o = await st(); lg.push(o);
    if (t0 < 0 && o.t !== undefined) t0 = f;
    if (t0 >= 0 && f - t0 === Math.round(FPS * 0.6)) await page.evaluate(() => Object.assign(window.__cam, { d: 30, h: 6, look: 22, z: 6.6, side: 0.95, fwd: 0.3, fov: 55 }));
    if (t0 >= 0 && f - t0 === Math.round(FPS * 1.3)) await page.evaluate(() => { const w = window.__pickWide(110, 6); Object.assign(window.__cam, { d: 110, h: w.y, look: 45, z: 6.6, ang: w.a, fov: 45 }); });
    await shot(o.t !== undefined ? `пуск +${o.t.toFixed(2)} с` : `крышка ${o.lid}`);
    if (t0 >= 0 && f - t0 >= FPS * 6.5) break;
  }
  console.log(`до пуска (кадров ${t0}): ` + lg.filter((o) => o.t === undefined).map((o) => o.lid).join(' '));
  for (const o of lg) if (o.t !== undefined && Math.abs(o.t * 10 - Math.round(o.t * 10)) < 0.17 && o.t < 3) console.log(`  t ${o.t.toFixed(2)} с: высота ${o.h} м, ${o.v} м/с, двигатель ${o.lit ? 'да' : 'нет'}`);
  // после пуска сверху: крышки ушедших ракет закрылись (открыты 5 с после выхода — launchers.js lids.hold)
  await page.evaluate(() => Object.assign(window.__cam, { d: 3, h: 16, look: 7.8, z: 6.6, ang: undefined, side: 0.5, fwd: 0.6, fov: 50 })); await far(); await shot('сверху после пуска');
  // РЛС выключили: пакет ложится (12 с), домкраты вверх (3 с)
  await page.evaluate(() => { window.__a.S.setEmit(window.__u, false); Object.assign(window.__cam, { d: 24, h: 6, look: 3, z: 0, ang: undefined, side: 0.75, fwd: -0.45, fov: 55 }); });
  const dn = [];
  for (let f = 0; f < 16 * FPS; f++) { await far(); if (f % 3 === 0) await shot(`опускание ${(f / FPS).toFixed(1)} с`); else await step(1); if (f % FPS === 0) dn.push(await st()); }
  console.log('опускание (каждую с): ' + dn.map((o) => `${o.dep}:${o.lel}°/дк ${o.jk}/кр ${o.lid}`).join(' · '));
  const ff = new Deno.Command('ffmpeg', { args: ['-v', 'error', '-y', '-framerate', '10', '-start_number', '0', '-i', `${out}/${key}-%03d.jpg`, '-vf', 'scale=1280:-2', '-c:v', 'libx264', '-crf', '20', '-pix_fmt', 'yuv420p', `${out}/${key}.mp4`] }).outputSync();
  if (!ff.success) console.log('ролик не собран:', new TextDecoder().decode(ff.stderr).slice(0, 300));
  console.log(JSON.stringify({ frames: frames.length, video: `${out}/${key}.mp4`, errs: errs.slice(0, 6) }));
} finally { await browser.close(); }
