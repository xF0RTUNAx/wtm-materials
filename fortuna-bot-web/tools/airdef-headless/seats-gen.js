// Таблица посадки подвески games/airdef/seats-data.js: где у каждого самолёта пилон над каждой точкой, где верх корпуса у каждого оружия.
//   deno run -A tools/airdef-headless/seats-gen.js          пересчитать (нужен сервер на 8937)
//   deno run -A tools/airdef-headless/seats-gen.js e_f4     только этот самолёт или оружие, остальное как было
// Запускать после замены модели самолёта или оружия: при другой версии файла запись не действует и подвеска стоит по старой точке (ui-test это покажет).
import puppeteer from 'npm:puppeteer-core@22.15.0';
const ROOT = new URL('../../', import.meta.url).pathname, OUT = `${ROOT}games/airdef/seats-data.js`, only = new Set(Deno.args);
const html = Deno.readTextFileSync(`${ROOT}games/airdef.html`), VER = html.match(/main\.js\?v=([0-9a-z]+)/)[1];
let old = { p: {}, w: {} }; try { old = (await import(`file://${OUT}?t=${Date.now()}`)).SEATS; } catch (_) {}
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', protocolTimeout: 1200000, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
try {
  const p = await b.newPage(); p.on('pageerror', (e) => console.log('ошибка страницы', String(e).slice(0, 300)));
  await p.evaluateOnNewDocument(() => { Object.defineProperty(navigator, 'webdriver', { get: () => true }); });
  await p.setViewport({ width: 800, height: 450 }); await p.goto('http://127.0.0.1:8937/fortuna-bot-web/games/airdef.html?rmock=1&test=1', { waitUntil: 'domcontentloaded', timeout: 180000 });
  await p.waitForFunction(() => window.__a && window.__a.hangar && window.__a.hangar.ready(), { timeout: 180000, polling: 500 });
  const res = await p.evaluate(async (VER, onlyL) => {
    const M = await import(new URL(`./airdef/models.js?v=${VER}`, location.href)), { AG } = await import(new URL(`./airdef/arsenal.js?v=${VER}`, location.href));
    const only = new Set(onlyL), want = (k) => !only.size || only.has(k), wait = async (ok, ms) => { const t0 = performance.now(); while (!ok() && performance.now() - t0 < ms) await new Promise((r) => setTimeout(r, 60)); return ok(); };
    const f = (v) => (v == null ? null : +v.toFixed(3)), ray = new THREE.Raycaster(), o = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), down = new THREE.Vector3(0, -1, 0);
    const out = { p: {}, w: {}, log: [] };
    // оружие: измерить модель, как её ставит игра
    const AXIS0 = new Set(['jassm']); // начало модели на оси корпуса, а габариты сбивает сложенный киль
    const measure = (m, isPod, k) => {
      m.position.set(0, 0, 0); m.updateWorldMatrix(true, true); const b = new THREE.Box3().setFromObject(m), L = b.max.z - b.min.z, cx = AXIS0.has(k) ? 0 : (b.min.x + b.max.x) / 2, cz = (b.min.z + b.max.z) / 2;
      const hit = (x, z) => { ray.set(o.set(x, b.max.y + 1, z), down); ray.far = 8; const h = ray.intersectObject(m, true)[0]; return h ? h.point.y : null; };
      let t = b.max.y; if (!isPod) { const ys = [-0.12, 0, 0.12].map((k) => hit(cx, cz + k * L)).filter((v) => v != null); if (ys.length) t = Math.min(...ys); }
      const sh = [hit(cx + 0.1, cz), hit(cx - 0.1, cz)].filter((v) => v != null);
      return [f(t), f(b.max.y - t), f(L), f(cx), f(cz), !isPod && sh.length === 2 ? f(t - (sh[0] + sh[1]) / 2) : null];
    };
    const stub = new THREE.MeshBasicMaterial(), geoStub = () => new THREE.BoxGeometry(0.2, 0.2, 2);
    for (const k of Object.keys(AG)) { const n = M.weaponModelName(k); if (!n || !want(k)) continue; M.wantWeapon(k); if (!(await wait(() => !M.weaponPending(k), 40000))) { out.log.push(`нет модели ${k}`); continue; } if (!M.modelLoaded(n)) continue; out.w[k] = [M.glbVerOf(n), ...measure(M.pylonMesh(k, AG[k], geoStub, stub), false, k)]; }
    if (want('pod')) { const n = M.podModelName(); M.wantModel(n); await wait(() => M.modelLoaded(n), 40000); const m = M.podModel(); if (m) out.w.pod = [M.glbVerOf(n), ...measure(m, true)]; }
    // самолёты
    const clearOf = (under, x, z, y) => { let c = 99; for (const dx of [-0.4, -0.25, 0.25, 0.4]) for (const dz of [-1.4, -1, -0.6, 0.6, 1, 1.4]) { const h = under(x + dx, z + dz, y); if (h != null && h < c) c = h; } return f(c); };
    for (const name of M.planeNames()) {
      if (!want(name)) continue; const meta = M.planeMeta(name); if (meta.internal) continue;
      M.wantModel(name); if (!(await wait(() => M.modelLoaded(name), 60000))) { out.log.push(`нет модели ${name}`); continue; }
      const pm = M.planeModel(meta.side, meta.cls, name); if (!pm || pm.name !== name) { out.log.push(`другая модель ${name}`); continue; }
      const obj = pm.obj; obj.position.set(0, 0, 0); obj.updateWorldMatrix(true, true); const body = obj.children.filter((c) => !c.userData.genPylon);
      const under = (x, z, y) => { ray.set(o.set(x, y, z), up); ray.far = 8; const h = ray.intersectObjects(body, true)[0]; return h ? h.point.y : null; };
      const used = [], L = 2.4, MAX = 0.55, NEAR = 0.7;
      // ступенька вниз у точки: пилон автора
      const author = (x0, y00, z0) => {
        const y0 = y00 - 0.55, cols = []; for (let dx = -0.6; dx <= 0.601; dx += 0.05) { let lo = null; for (const k of [-0.25, 0, 0.25]) { const y = under(x0 + dx, z0 + k * L, y0); if (y != null && (lo == null || y < lo)) lo = y; } cols.push([dx, lo]); }
        const hits = cols.filter((q) => q[1] != null); if (!hits.length) return { none: true };
        const low = Math.min(...hits.map((q) => q[1])), band = hits.filter((q) => q[1] <= low + 0.04), wx = band[band.length - 1][0] - band[0][0], xP = x0 + (band[0][0] + band[band.length - 1][0]) / 2;
        const i0 = cols.indexOf(band[0]), i1 = cols.indexOf(band[band.length - 1]), edge = (q) => !q || q[1] == null || q[1] - low > 0.07;
        if (!(wx <= 0.42 && Math.abs(low - y00) <= NEAR && Math.abs(xP - x0) <= 0.45 /* соседний пилон дальше 0,45 м - не свой (Hunter: рельс −4,0 забирал пилон −3,45) */ && edge(cols[i0 - 1]) && edge(cols[i1 + 1])) || used.some((u) => Math.abs(u[0] - xP) < 0.25 && Math.abs(u[1] - z0) < 1.2)) return {};
        let z1 = null, z2 = null; for (let dz = -2; dz <= 2.001; dz += 0.08) { const y = under(xP, z0 + dz, y0); if (y != null && y <= low + 0.06) { if (z1 == null) z1 = dz; z2 = dz; } }
        const zP = z1 == null ? z0 : z0 + Math.max(-1.2, Math.min(1.2, (z1 + z2) / 2));
        if (![-0.12, 0, 0.12].some((k) => { const y = under(xP, zP + k * L, low - 0.05); return y != null && y <= low + 0.06; })) return {};
        return { x: xP, y: low, z: zP };
      };
      const one = (q) => {
        if (q.py > 0) { const ys = [-0.3, 0, 0.3].map((k) => under(q.x, q.z + k, q.y + 0.005)).filter((v) => v != null), t = Math.min(q.y + 1.6, ys.length ? Math.max(...ys) : q.y + q.py); return [1, f(q.x), f(q.y), f(q.z), clearOf(under, q.x, q.z, q.y - 0.02), f(t)]; }
        const a = author(q.x, q.y, q.z); if (a.x != null) { used.push([a.x, a.z]); return [2, f(a.x), f(a.y), f(a.z), clearOf(under, a.x, a.z, a.y - 0.02)]; }
        const here = a.none ? null : under(q.x, q.z, q.y - 0.55); if (here == null) return [0];
        const y = here - Math.max(0.2, Math.min(MAX, here - q.y)); return [1, f(q.x), f(y), f(q.z), clearOf(under, q.x, q.z, y - 0.02), f(here)];
      };
      const s = pm.stations.map((q) => q).sort((a, b) => a.x - b.x).reduce((map, q) => {
        // модели почти симметричны, но бывают сдвинуты: у каждой стороны свой ответ. Зеркало левой - только если правая нашла другое, а зеркало действительно касается пилона
        const twin = q.x > 0.01 ? map.get(pm.stations.find((t) => Math.abs(t.x + q.x) < 0.01 && Math.abs(t.z - q.z) < 0.01 && Math.abs(t.y - q.y) < 0.01)) : null;
        let r = one(q);
        if (twin && twin[0] === 2 && (r[0] !== 2 || Math.abs(r[1] + twin[1]) > 0.1 || Math.abs(r[2] - twin[2]) > 0.1 || Math.abs(r[3] - twin[3]) > 0.3) && [-0.12, 0, 0.12].some((k) => { const y = under(-twin[1], twin[3] + k * L, twin[2] - 0.05); return y != null && y <= twin[2] + 0.06; })) r = [2, f(-twin[1]), ...twin.slice(2)];
        else if (twin && twin[0] === 1 && r[0] === 2) r = [1, f(-twin[1]), ...twin.slice(2)]; // ступенька только справа: не настоящий пилон
        map.set(q, r); return map;
      }, new Map());
      const sOut = pm.stations.map((q) => s.get(q));
      let pod = null; if (pm.pod) { const a = author(pm.pod.x, pm.pod.y, pm.pod.z); if (a.x != null) pod = [2, f(a.x), f(a.y), f(a.z), 99]; else { const here = a.none ? null : under(pm.pod.x, pm.pod.z, pm.pod.y - 0.55); pod = here == null ? [0] : [3, f(pm.pod.x), f(here), f(pm.pod.z), 99]; } }
      out.p[name] = { v: M.glbVerOf(name), s: sOut, pod };
    }
    return out;
  }, VER, [...only]);
  for (const l of res.log) console.log(l);
  const P = only.size ? { ...old.p, ...res.p } : res.p, W = only.size ? { ...old.w, ...res.w } : res.w;
  const sortO = (o) => Object.keys(o).sort().map((k) => `  ${JSON.stringify(k)}: ${JSON.stringify(o[k])},`).join('\n');
  Deno.writeTextFileSync(OUT, `// Создано tools/airdef-headless/seats-gen.js, руками не править. Описание записей: seat.js\nexport const SEATS = {\n p: {\n${sortO(P)}\n },\n w: {\n${sortO(W)}\n },\n};\n`);
  const st = Object.values(P).flatMap((q) => q.s), c = (k) => st.filter((q) => q[0] === k).length;
  console.log(`самолётов ${Object.keys(P).length}, оружия ${Object.keys(W).length}; точки: дорисованный пилон ${c(1)}, пилон автора ${c(2)}, не сажать ${c(0)}; ${(Deno.statSync(OUT).size / 1024).toFixed(1)} КБ`);
} finally { await b.close(); }
