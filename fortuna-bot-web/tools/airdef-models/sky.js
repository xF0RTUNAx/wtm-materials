// Панорамы неба (Poly Haven, CC0) → games/airdef/sky/<имя>.jpg (и <имя>_hi.jpg): только верхняя полусфера (низ — земля),
// солнце заменено средним кольца вокруг (диск и ореол рисует шейдер неба), мягкое сжатие ярких мест, гамма 2,2.
//   deno run -A tools/airdef-models/sky.js [имя…]      (без имён — все)
// Исходники — ~/Downloads/<панорама>_<разрешение>.hdr (берётся самое большое из 8k / 4k / 2k). Печатает u солнца (доля
// ширины) и его высоту: u — в WEATHERS[…].hdri.u (drone/world.js), высота — для el погоды.
const HOME = Deno.env.get('HOME'), DL = `${HOME}/Downloads`, OUT = new URL('../../games/airdef/sky/', import.meta.url).pathname;
// k — экспозиция, rs — радиус «вычищаемого» солнца, ° (0 — не трогать: луна и звёзды остаются)
const SKIES = {
  day: { src: 'kloofendal_48d_partly_cloudy_puresky', k: 1.6, rs: 4 },
  morning: { src: 'syferfontein_18d_clear_puresky', k: 1.2, rs: 4 },
  evening: { src: 'qwantani_late_afternoon_puresky', k: 0.9, rs: 4 },
  sunset: { src: 'citrus_orchard_road_puresky', k: 0.45, rs: 2.5 },
  overcast: { src: 'kloofendal_overcast_puresky', k: 0.7, rs: 0 },
  night: { src: 'qwantani_night_puresky', k: 0.07, rs: 0 },
};
const run = async (args) => { const p = new Deno.Command('ffmpeg', { args: ['-loglevel', 'error', '-y', ...args], stdout: 'piped' }).outputSync(); if (!p.success) throw new Error('ffmpeg ' + args.join(' ')); return p.stdout; };
for (const name of Deno.args.length ? Deno.args : Object.keys(SKIES)) {
  const S = SKIES[name], res = ['8k', '4k', '2k'].find((r) => { try { Deno.statSync(`${DL}/${S.src}_${r}.hdr`); return true; } catch { return false; } });
  if (!res) { console.log(name, ': нет исходника', S.src); continue; }
  const W = { '8k': 8192, '4k': 4096, '2k': 2048 }[res], H = W / 4; // верхняя полусфера: W × W/4
  const raw = await run(['-i', `${DL}/${S.src}_${res}.hdr`, '-vf', `crop=${W}:${H}:0:0`, '-f', 'rawvideo', '-pix_fmt', 'gbrpf32le', 'pipe:1']);
  const n = W * H, f = new Float32Array(raw.buffer, raw.byteOffset, n * 3), G = f.subarray(0, n), B = f.subarray(n, 2 * n), R = f.subarray(2 * n, 3 * n);
  let bi = 0, best = 0; for (let i = 0; i < n; i++) { const l = 0.2126 * R[i] + 0.7152 * G[i] + 0.0722 * B[i]; if (l > best) { best = l; bi = i; } }
  const sx = bi % W, sy = (bi / W) | 0, el = (y) => (1 - (y + 0.5) / H) * Math.PI / 2, az = (x) => ((x + 0.5) / W) * 2 * Math.PI;
  const dir = (x, y) => [Math.cos(el(y)) * Math.cos(az(x)), Math.sin(el(y)), Math.cos(el(y)) * Math.sin(az(x))], Sd = dir(sx, sy);
  if (S.rs > 0) { // внутри RB — среднее кольца RB…1,25·RB, плавно к краю
    const RB = S.rs * Math.PI / 180, dy = Math.ceil((S.rs * 1.3) / 90 * H) + 2, pts = [], ring = [0, 0, 0, 0];
    for (let y = Math.max(0, sy - dy); y < Math.min(H, sy + dy); y++) for (let x = sx - 4 * dy; x < sx + 4 * dy; x++) {
      const xx = ((x % W) + W) % W, d = dir(xx, y), a = Math.acos(Math.max(-1, Math.min(1, d[0] * Sd[0] + d[1] * Sd[1] + d[2] * Sd[2]))), i = y * W + xx;
      if (a < RB) pts.push(i, a); else if (a < RB * 1.25) { ring[0] += R[i]; ring[1] += G[i]; ring[2] += B[i]; ring[3]++; }
    }
    const rc = [R, G, B].map((_, k) => ring[k] / Math.max(1, ring[3]));
    for (let p = 0; p < pts.length; p += 2) { const i = pts[p], q = Math.max(0, (pts[p + 1] / RB - 0.7) / 0.3), t = q * q * (3 - 2 * q); [R, G, B].forEach((C, k) => { if (C[i] > rc[k]) C[i] = rc[k] + (C[i] - rc[k]) * t; }); }
  }
  const ppm = new Uint8Array(n * 3), tm = (v) => Math.round(Math.pow(1 - Math.exp(-Math.max(0, v) * S.k * 1.4), 1 / 2.2) * 255);
  for (let i = 0; i < n; i++) { ppm[i * 3] = tm(R[i]); ppm[i * 3 + 1] = tm(G[i]); ppm[i * 3 + 2] = tm(B[i]); }
  const tmp = await Deno.makeTempFile({ suffix: '.ppm' });
  const head = new TextEncoder().encode(`P6\n${W} ${H}\n255\n`), all = new Uint8Array(head.length + ppm.length); all.set(head); all.set(ppm, head.length); Deno.writeFileSync(tmp, all);
  // обычная — не шире 4096 (телефоны), _hi — 8192 (если исходник позволяет)
  await run(['-i', tmp, '-vf', `scale=${Math.min(W, 4096)}:${Math.min(W, 4096) / 4}:flags=lanczos`, '-q:v', '2', `${OUT}${name}.jpg`]);
  if (W > 4096) await run(['-i', tmp, '-q:v', '2', `${OUT}${name}_hi.jpg`]); else try { Deno.removeSync(`${OUT}${name}_hi.jpg`); } catch { /* нет */ }
  Deno.removeSync(tmp);
  console.log(name, res, `u ${((sx + 0.5) / W).toFixed(4)}`, `высота ${(el(sy) * 180 / Math.PI).toFixed(1)}°`, W > 4096 ? '+ _hi' : '');
}
