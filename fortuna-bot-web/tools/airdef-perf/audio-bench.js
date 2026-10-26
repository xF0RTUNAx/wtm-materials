// Цена звука игры для процессора: тот же граф Web Audio (drone/audio.js createAudio → init), но в OfflineAudioContext — рендер N секунд звука
// так быстро, как может один поток. Доля = время рендера / длительность звука = сколько ядра звук ест постоянно (в реальном времени — то же самое).
// Варианты: как сейчас; без HRTF (панорама equalpower); без реверберации (свёртка); экономный режим (24 кГц, моно-реверберация, без HRTF).
//   deno run -A audio-bench.js [сек=20]
import puppeteer from 'npm:puppeteer-core@22.15.0';
const SEC = +(Deno.args[0] || 20);
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--autoplay-policy=no-user-gesture-required'] });
const run = async (name, { eco = false, noHrtf = false, noConv = false, noVoices = false, idleOnly = false } = {}) => {
  const page = await browser.newPage();
  await page.evaluateOnNewDocument((eco) => { localStorage.setItem('fortuna_audio_eco', eco ? '1' : '0'); }, eco);
  await page.goto('http://127.0.0.1:8937/fortuna-bot-web/games/drone/', { waitUntil: 'load' });
  const r = await page.evaluate(async (SEC, o) => {
    let ctx = null;
    window.AudioContext = function (opt) { const sr = (opt && opt.sampleRate) || 48000; ctx = new OfflineAudioContext(2, sr * SEC, sr); return ctx; };
    if (o.noHrtf) { const cp = BaseAudioContext.prototype.createPanner; BaseAudioContext.prototype.createPanner = function () { const p = cp.call(this); Object.defineProperty(p, 'panningModel', { set() {}, get() { return 'equalpower'; } }); return p; }; }
    if (o.noVoices) BaseAudioContext.prototype.createPanner = function () { const g = this.createGain(); g.connect = () => g; return g; }; // голоса не подключены к выходу — их ветки не считаются
    if (o.noConv) BaseAudioContext.prototype.createConvolver = function () { const g = this.createGain(); g.gain.value = 0; Object.defineProperty(g, 'buffer', { set() {}, get() { return null; } }); return g; };
    let nodes = 0; for (const k of Object.getOwnPropertyNames(BaseAudioContext.prototype)) if (/^create/.test(k) && k !== 'createBuffer' && k !== 'createPeriodicWave') { const f = BaseAudioContext.prototype[k]; BaseAudioContext.prototype[k] = function (...a) { nodes++; return f.apply(this, a); }; }
    const m = await import('/fortuna-bot-web/games/drone/audio.js?v=bench' + Math.random());
    const A = m.createAudio(); A.init();
    if (!ctx) return { err: 'нет контекста' };
    const t0 = performance.now(); await ctx.startRendering(); const ms = performance.now() - t0;
    return { sr: ctx.sampleRate, nodes, ms: Math.round(ms), share: +(100 * ms / (SEC * 1000)).toFixed(2) };
  }, SEC, { noHrtf, noConv, noVoices, idleOnly });
  await page.close();
  console.log(`${name.padEnd(34)} ${JSON.stringify(r)}`);
};
try {
  for (let i = 0; i < 2; i++) {
    await run('голоса (6 объёмных) отключены', { noVoices: true });
    if (Deno.env.get('ONLY')) continue;
    await run('как сейчас');
    await run('без HRTF (equalpower)', { noHrtf: true });
    await run('без реверберации', { noConv: true });
    await run('без HRTF и реверберации', { noHrtf: true, noConv: true });
    await run('экономный (24 кГц, моно, без HRTF)', { eco: true });
  }
} finally { await browser.close(); }
