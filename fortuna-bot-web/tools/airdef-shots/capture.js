// Кадры фона главного меню «Воздушного превосходства» → games/airdef/shots/*.webp и shots.js (menubg.js).
// Снимает Chrome без окна (на видеокарте Мака) режимом «Съёмка» с параметром ?shot=…: объект, ракурс, подстройка, поле
// зрения, сколько секунд боя ждать; игра сама ставит стоп-кадр и сообщает window.__shot = 'ready'.
//   deno run -A fortuna-bot-web/tools/airdef-shots/capture.js [имя кадра …]      (без имён — все)
//   … --review [--par=N] [номер или имя …]   — кадры «на утверждение»: список REVIEW ниже → tools/airdef-shots/review/*.webp и
//   review/index.html (сетка с подписями); shots.js и games/airdef/shots/ не трогаются. --par=N — N страниц одновременно
// Файлы игры отдаёт сам скрипт (порт 8943); нужны Google Chrome и cwebp (brew install webp).
import puppeteer from 'npm:puppeteer-core@22.15.0';
import { serveDir } from 'jsr:@std/http@1.0.9/file-server';

const ROOT = new URL('../../../', import.meta.url).pathname; // папка wtm-materials
//   … --set3 [--par=N] [номер или имя …] — третий набор (SET3 ниже) → review3/ (как --review, максимальная графика, 2560×1440)
const REVIEW_MODE = Deno.args.includes('--review') || Deno.args.includes('--set3');
const PAR = Math.max(1, +((Deno.args.find((a) => a.startsWith('--par=')) || '--par=1').slice(6)) || 1);
const OUT = Deno.env.get('SHOT_OUT') || new URL(REVIEW_MODE ? (Deno.args.includes('--set3') ? './review3/' : './review/') : '../../games/airdef/shots/', import.meta.url).pathname;
const PORT = 8943, W = 1600, H = 900; // графика — «cinema» (предел «Ультра»: дома и деревья моделями на километры, MSAA, без динамического разрешения)
// setup — настройки «Съёмки» (как в меню), w — погода, shot — объект (s), ракурс (a), az/el/k, поле зрения f, ждать t с (max — предел)
const SHOTS = [
  { f: 'su34-kh59', t: ['air'], w: 'morning', setup: { pside: 'air', era: 4, side: 'west', lo: 0, palt: 'mid' }, shot: { s: 'kh59m', a: 'side', az: 0.25, el: 0.05, k: 1.1, t: 30 } },
  { f: 'f16-front', t: ['air'], w: 'day', setup: { pside: 'air', era: 4, side: 'east', lo: 7, palt: 'low' }, shot: { s: 'ship', a: 'side', az: 0.3, el: 0.25, k: 0.7, t: 70 } },
  { f: 'su30-top', t: ['air'], w: 'morning', setup: { pside: 'air', era: 4, side: 'west', lo: 1, palt: 'low' }, shot: { s: 'ship', a: 'top', az: 0.3, el: -0.3, k: 0.8, t: 75 } },
  { f: 'sam-chase', t: ['air', 'pvo'], w: 'day', setup: { pside: 'air', era: 3, side: 'east', lo: 4, palt: 'low' }, shot: { s: 'sam', a: 'chase', az: 0.35, el: 0.15, k: 1.3, t: 6, max: 200 } },
  { f: 's400-unit', t: ['pvo'], w: 'evening', setup: { pside: 'def', era: 4, side: 'east', psam: 's400', pvs: 'air' }, shot: { s: 'msl', a: 'side', az: 0.35, el: 0.12, k: 1.5, t: 4, max: 200 } },
  { f: 'patriot-launch', t: ['pvo'], w: 'day', setup: { pside: 'def', era: 3, side: 'west', psam: 'patriot', pvs: 'air' }, shot: { s: 'msl', a: 'side', az: 0.3, el: 0.12, k: 1.6, t: 4, max: 200 } },
  { f: 'pantsir-side', t: ['pvo'], w: 'day', setup: { pside: 'def', era: 4, side: 'east', psam: 'pantsir', pvs: 'air' }, shot: { s: 'unit', a: 'front', az: 0.2, el: 0.12, k: 1.25, t: 3 } },
  { f: 'tor-launch', t: ['pvo'], w: 'day', setup: { pside: 'def', era: 4, side: 'east', psam: 'torm2', pvs: 'multi' }, shot: { s: 'msl', a: 'side', az: 0.2, el: 0.15, k: 1.6, t: 4, max: 200 } },
  { f: 'iskander-launcher', t: ['multi'], w: 'evening', setup: { pside: 'multi', era: 4, side: 'west', pmun: 'iskander' }, shot: { s: 'src', a: 'side', az: 0.6, el: 0.1, k: 0.75, t: 14 } },
  { f: 'iskander-flight', t: ['multi'], w: 'day', setup: { pside: 'multi', era: 4, side: 'west', pmun: 'iskander' }, shot: { s: 'mun', a: 'chase', az: 0.3, el: 0.05, k: 1.4, t: 6, max: 120 } },
  { f: 'tu160-kh555', t: ['multi'], w: 'sunset', setup: { pside: 'multi', era: 4, side: 'west', pmun: 'kh555' }, shot: { s: 'src', a: 'side', az: 0.45, el: 0.12, k: 1.0, t: 20, max: 160 } },
  { f: 'mig31-kinzhal', t: ['multi'], w: 'sunset', setup: { pside: 'multi', era: 4, side: 'west', pmun: 'kinzhal' }, shot: { s: 'src', a: 'side', az: 0.35, el: 0.08, k: 1.0, t: 25, max: 200 } }, // вместо «Шахеда» (решение Mark)
];

// ── «на утверждение» (--review): 40 новых кадров, не входят в игру, пока Mark не выберет ──
// n — номер, f — имя файла, cap — подпись, m — карта (city | winter | autumn), w — погода (ключ WEATHERS / WINTER_KEYS / AUTUMN_KEYS),
// setup и shot — как выше (setup.pmap ставится из m); cam в shot — камера в точке [x, y, z, куда x, y, z] (виды местности)
const REVIEW = [
  // ── Город ──
  { f: 'mig23-city', m: 'city', w: 'morning', cap: 'МиГ-23БН (восток) низко над кварталами, утро, сбоку', setup: { pside: 'air', era: 1, side: 'west', lo: 3, palt: 'low' }, shot: { s: 'ship', a: 'side', az: 0.3, el: 0.05, k: 1.0, t: 40, ox: 0.12 } },
  { f: 'f4-evening', m: 'city', w: 'evening', cap: 'F-4 Phantom (запад) с Shrike, вечер, сбоку', setup: { pside: 'air', era: 1, side: 'east', lo: 7, palt: 'low' }, shot: { s: 'ship', a: 'front', az: 0.6, el: 0.1, k: 0.9, t: 50, ox: -0.1 } },
  { f: 'su25-kh29', m: 'city', w: 'sunset', cap: 'Су-25: Х-29Т на подвеске, закат', setup: { pside: 'air', era: 2, side: 'west', lo: 2, palt: 'mid' }, shot: { s: 'kh29t', a: 'side', az: 0.3, el: 0.05, k: 1.2, t: 8, max: 200 } },
  { f: 'a10-maverick', m: 'city', w: 'overcast', cap: 'A-10A: Maverick и Mk 82 под крылом, пасмурно', setup: { pside: 'air', era: 2, side: 'east', lo: 11, palt: 'low' }, shot: { s: 'agm65b', a: 'side', az: 0.3, el: 0.08, k: 1.2, t: 30, max: 200 } },
  { f: 'tornado-front', m: 'city', w: 'morning', cap: 'Tornado, утро, спереди', setup: { pside: 'air', era: 2, side: 'east', lo: 9, palt: 'low' }, shot: { s: 'ship', a: 'front', az: -0.5, el: 0.12, k: 0.8, t: 30, ox: 0.14 } },
  { f: 'f15e-low', m: 'city', w: 'sunset', cap: 'F-15E низко над городом, закат', setup: { pside: 'air', era: 3, side: 'east', lo: 8, palt: 'low' }, shot: { s: 'ship', a: 'chase', az: 0.35, el: 0.12, k: 0.8, t: 30, ox: -0.12 } },
  { f: 'b52-below', m: 'city', w: 'day', cap: 'B-52H снизу на фоне облаков, день', setup: { pside: 'air', era: 3, side: 'east', lo: 13, palt: 'mid' }, shot: { s: 'ship', a: 'below', az: 0.3, el: -0.2, k: 1.2, t: 40 } },
  { f: 'tu95-front', m: 'city', w: 'morning', cap: 'Ту-95МС, утро', setup: { pside: 'air', era: 3, side: 'west', lo: 12, palt: 'low' }, shot: { s: 'ship', a: 'front', az: 0.5, el: 0.15, k: 0.9, t: 35, ox: 0.1 } },
  { f: 'su57-side', m: 'city', w: 'sunset', cap: 'Су-57 над окраиной, закат', setup: { pside: 'air', era: 4, side: 'west', lo: 3, palt: 'low' }, shot: { s: 'ship', a: 'side', az: 0.3, el: 0.08, k: 0.7, t: 30, ox: 0.1 } },
  { f: 'patriot-sunset', m: 'city', w: 'sunset', cap: 'Пуск Patriot, закат', setup: { pside: 'def', era: 3, side: 'west', psam: 'patriot', pvs: 'air' }, shot: { s: 'msl', a: 'side', az: 0.3, el: 0.12, k: 1.6, t: 4, max: 200 } },
  { f: 'shilka-day', m: 'city', w: 'day', cap: 'ЗСУ-23-4 «Шилка»', setup: { pside: 'def', era: 1, side: 'east', psam: 'zsu234', pvs: 'air' }, shot: { s: 'unit', a: 'front', az: 0.3, el: 0.04, k: 0.55, t: 45, ox: 0.15 } },
  { f: 'shahed-city', m: 'city', w: 'day', cap: 'Дрон над городом', setup: { pside: 'multi', era: 4, side: 'west', pmun: 'shahed' }, shot: { s: 'mun', a: 'chase', az: 0.3, el: 0.1, k: 0.6, t: 20, max: 200, ox: -0.12 } },
  { f: 'buk-city', m: 'city', w: 'evening', cap: 'Бук-М1, пуск', setup: { pside: 'def', era: 3, side: 'east', psam: 'buk', pvs: 'air' }, shot: { s: 'msl', a: 'side', az: 0.3, el: 0.12, k: 1.6, t: 4, max: 200 } },
  // ── Северный рубеж ──
  { f: 'f22-clear', m: 'winter', w: 'w_clear', cap: 'F-22 над горами, ясно', setup: { pside: 'air', era: 4, side: 'east', lo: 5, palt: 'mid' }, shot: { s: 'ship', a: 'side', az: 0.3, el: 0.1, k: 1.0, t: 60 } },
  { f: 'f117-low', m: 'winter', w: 'w_frost', cap: 'F-117A над заснеженной равниной, мороз', setup: { pside: 'air', era: 3, side: 'east', lo: 9, palt: 'low' }, shot: { s: 'ship', a: 'chase', az: 0.4, el: 0.15, k: 0.8, t: 50, ox: 0.12 } },
  { f: 'su34-umpk', m: 'winter', w: 'w_snow', cap: 'Су-34: планирующая бомба УМПК под фюзеляжем, снегопад', setup: { pside: 'air', era: 4, side: 'west', lo: 0, palt: 'mid' }, shot: { s: 'umpk', a: 'side', az: 0.3, el: 0.05, k: 1.1, t: 8, max: 200 } },
  { f: 'tu160-kh101', m: 'winter', w: 'w_clear', cap: 'Крылатая Х-101 после пуска', setup: { pside: 'multi', era: 4, side: 'west', pmun: 'kh101' }, shot: { s: 'mun', a: 'chase', az: 0.3, el: 0.1, k: 1.4, t: 15, max: 200, ox: 0.1 } },
  { f: 'b1b-tomahawk', m: 'winter', w: 'w_frost', cap: 'B-1B, носитель Tomahawk', setup: { pside: 'multi', era: 3, side: 'east', pmun: 'tomahawk' }, shot: { s: 'mun', a: 'chase', az: 0.3, el: 0.1, k: 1.4, t: 15, max: 200 } },
  { f: 'shahed-snow', m: 'winter', w: 'w_snow', cap: 'Дрон, снегопад', setup: { pside: 'multi', era: 4, side: 'west', pmun: 'shahed' }, shot: { s: 'mun', a: 'side', az: 0.3, el: 0.1, k: 0.7, t: 20, max: 200, ox: -0.12 } },
  { f: 'kalibr-front', m: 'winter', w: 'w_clear', cap: 'Ту-160 пускает «Калибр»', setup: { pside: 'multi', era: 4, side: 'west', pmun: 'kalibr' }, shot: { s: 'mun', a: 'front', az: 0.3, el: 0.1, k: 1.4, t: 15, max: 200 } },
  { f: 'pantsir-snow', m: 'winter', w: 'w_snow', cap: 'Панцирь, снег', setup: { pside: 'def', era: 4, side: 'east', psam: 'pantsir', pvs: 'air' }, shot: { s: 'unit', a: 'front', az: 0.3, el: 0.12, k: 1.25, t: 3 } },
  { f: 'pac3-frost', m: 'winter', w: 'w_frost', cap: 'PAC-3, пуск', setup: { pside: 'def', era: 4, side: 'west', psam: 'pac3', pvs: 'air' }, shot: { s: 'msl', a: 'side', az: 0.3, el: 0.12, k: 2.0, t: 4, max: 200 } },
  { f: 'kinzhal-chase', m: 'winter', w: 'w_clear', cap: 'МиГ-31К с «Кинжалом»', setup: { pside: 'multi', era: 4, side: 'west', pmun: 'kinzhal' }, shot: { s: 'src', a: 'chase', az: 0.3, el: 0.1, k: 1.0, t: 25, max: 200, ox: -0.1 } },
  // harrier-frost (Harrier GR.3 над снегом) убран из фона меню — Mark 2026-10-24: под крылом чёрный квадрат
  { f: 'su25-mount', m: 'winter', w: 'w_clear', cap: 'Су-25, камера на крыле', setup: { pside: 'air', era: 2, side: 'west', lo: 17, palt: 'low' }, shot: { s: 'ship', a: 'mount', t: 50 } },
  // ── Туманная топь ──
  { f: 'mi24-dusk', m: 'autumn', w: 'a_dusk', cap: 'Ми-24', setup: { pside: 'def', era: 2, side: 'west', psam: 'gepard', pvs: 'air' }, shot: { s: 'heli', a: 'side', az: 0.3, el: 0.1, k: 1.0, t: 110, max: 400 } },
  { f: 'ah64-fog', m: 'autumn', w: 'a_fog', cap: 'AH-64', setup: { pside: 'def', era: 3, side: 'east', psam: 'tor', pvs: 'air' }, shot: { s: 'heli', a: 'side', az: 0.3, el: 0.1, k: 1.2, t: 130, max: 400 } },
  { f: 'mi28-eve', m: 'autumn', w: 'a_eve', cap: 'Ми-28Н', setup: { pside: 'def', era: 3, side: 'west', psam: 'avenger', pvs: 'air' }, shot: { s: 'heli', a: 'front', az: 0.3, el: 0.1, k: 1.0, t: 110, max: 400 } },
  { f: 'ka52-dusk', m: 'autumn', w: 'a_dusk', cap: 'Ка-52', setup: { pside: 'def', era: 4, side: 'west', psam: 'pac3', pvs: 'air' }, shot: { s: 'heli', a: 'side', az: 0.3, el: 0.1, k: 1.0, t: 110, max: 400 } },
  { f: 'ah1-eve', m: 'autumn', w: 'a_eve', cap: 'AH-1W', setup: { pside: 'def', era: 2, side: 'east', psam: 'osa', pvs: 'air' }, shot: { s: 'heli', a: 'below', az: 0.3, el: 0.1, k: 1.0, t: 110, max: 400 } },
  { f: 'uh1-fog', m: 'autumn', w: 'a_fog', cap: 'UH-1H', setup: { pside: 'def', era: 1, side: 'east', psam: 'zsu234', pvs: 'air' }, shot: { s: 'heli', a: 'side', az: 0.3, el: 0.1, k: 1.0, t: 110, max: 400 } },
  { f: 'su25-fog', m: 'autumn', w: 'a_fog', cap: 'Су-25 над топью, туман', setup: { pside: 'air', era: 2, side: 'west', lo: 2, palt: 'low' }, shot: { s: 'ship', a: 'side', az: 0.3, el: 0.05, k: 1.0, t: 50 } },
  { f: 'mig27-dusk', m: 'autumn', w: 'a_dusk', cap: 'МиГ-27К сумерки', setup: { pside: 'air', era: 2, side: 'west', lo: 4, palt: 'low' }, shot: { s: 'ship', a: 'chase', az: 0.3, el: 0.1, k: 0.9, t: 50 } },
  { f: 'a10-eve', m: 'autumn', w: 'a_eve', cap: 'A-10 Maverick', setup: { pside: 'air', era: 2, side: 'east', lo: 11, palt: 'low' }, shot: { s: 'agm65b', a: 'chase', az: 0.3, el: 0.08, k: 1.2, t: 30, max: 200 } },
  { f: 'torm2-dusk', m: 'autumn', w: 'a_dusk', cap: 'Тор-М2 пуск', setup: { pside: 'def', era: 4, side: 'east', psam: 'torm2', pvs: 'air' }, shot: { s: 'msl', a: 'side', az: 0.2, el: 0.15, k: 1.6, t: 4, max: 200 } },
  { f: 'shilka-fog', m: 'autumn', w: 'a_fog', cap: 'Шилка в тумане', setup: { pside: 'def', era: 1, side: 'east', psam: 'zsu234', pvs: 'air' }, shot: { s: 'unit', a: 'front', az: 0.3, el: 0.04, k: 0.55, t: 45, ox: 0.15 } },
  { f: 'shahed-dusk', m: 'autumn', w: 'a_dusk', cap: 'Дрон, сумерки', setup: { pside: 'multi', era: 4, side: 'west', pmun: 'shahed' }, shot: { s: 'mun', a: 'side', az: 0.3, el: 0.1, k: 0.6, t: 20, max: 200, ox: -0.12 } },
  { f: 'church-dusk', m: 'autumn', w: 'a_dusk', cap: 'Монастырь на острове', setup: { pside: 'def', era: 2, side: 'west', psam: 'gepard', pvs: 'air' }, shot: { s: 'unit', a: 'front', t: 2, f: 38, cg: 1, cam: [480, 8, 213, 620, 18, 160] } },
  { f: 'pumpkins-eve', m: 'autumn', w: 'a_eve', cap: 'Тыквенное поле', setup: { pside: 'def', era: 2, side: 'west', psam: 'gepard', pvs: 'air' }, shot: { s: 'unit', a: 'front', t: 2, f: 45, cg: 1, cam: [-7013, 1.5, -192, -7193, 3, -222] } },
  { f: 'mill-dusk', m: 'autumn', w: 'a_dusk', cap: 'Мельница и РЛС на Лысой горе', setup: { pside: 'def', era: 2, side: 'west', psam: 'gepard', pvs: 'air' }, shot: { s: 'unit', a: 'front', t: 2, f: 45, cg: 1, cam: [7437, 3, -6968, 7534, 16, -7055] } },
  { f: 'cemetery-fog', m: 'autumn', w: 'a_fog', cap: 'Кладбище у деревни', setup: { pside: 'def', era: 2, side: 'west', psam: 'gepard', pvs: 'air' }, shot: { s: 'unit', a: 'front', t: 2, f: 50, cg: 1, cam: [-611, 1.7, 5011, -666, 1.5, 4976] } },
];

// ── второй проход (v2): слабые кадры первого — объект крупнее (k меньше), светлее погода, фон — небо (el ≤ 0: камера ниже объекта) ──
// n — номер исходного кадра; имя файла — «NN-имя-v2»; на страницу идут вместе с первыми
const REVIEW2 = [
  { n: 8, f: 'tu95-far-v2', m: 'city', w: 'morning', cap: 'Ту-95МС сбоку, крупно, утро', setup: { pside: 'air', era: 3, side: 'west', lo: 12, palt: 'low' }, shot: { s: 'ship', a: 'side', az: 0.35, el: -0.03, k: 1.0, t: 35 } },
  { n: 9, f: 'su57-front-v2', m: 'city', w: 'morning', cap: 'Су-57 спереди, утро', setup: { pside: 'air', era: 4, side: 'west', lo: 3, palt: 'low' }, shot: { s: 'ship', a: 'front', az: 0.5, el: -0.1, k: 0.4, t: 30, ox: 0.1 } },
  { n: 12, f: 'shahed-city-v2', m: 'city', w: 'day', cap: 'Дрон над городом, крупно', setup: { pside: 'multi', era: 4, side: 'west', pmun: 'shahed' }, shot: { s: 'mun', a: 'side', az: 0.3, el: -0.05, k: 0.35, t: 20, max: 200, ox: -0.1 } },
  { n: 15, f: 'f117-low-v2', m: 'winter', w: 'w_frost', cap: 'F-117A над заснеженной равниной, крупнее', setup: { pside: 'air', era: 3, side: 'east', lo: 9, palt: 'low' }, shot: { s: 'ship', a: 'side', az: 0.35, el: 0.05, k: 0.5, t: 50, ox: 0.1 } },
  { n: 26, f: 'mi24-dusk-v2', m: 'autumn', w: 'a_dusk', cap: 'Ми-24 ближе, на фоне неба', setup: { pside: 'def', era: 2, side: 'west', psam: 'gepard', pvs: 'air' }, shot: { s: 'heli', a: 'side', az: 0.3, el: -0.12, k: 0.6, t: 110, max: 400 } },
  { n: 27, f: 'ah64-fog-v2', m: 'autumn', w: 'a_fog', cap: 'AH-64 ближе, светлый туман', setup: { pside: 'def', era: 3, side: 'east', psam: 'tor', pvs: 'air' }, shot: { s: 'heli', a: 'side', az: 0.3, el: -0.12, k: 0.55, t: 130, max: 400 } },
  { n: 28, f: 'mi28-eve-v2', m: 'autumn', w: 'a_eve', cap: 'Ми-28Н спереди, ближе', setup: { pside: 'def', era: 3, side: 'west', psam: 'avenger', pvs: 'air' }, shot: { s: 'heli', a: 'front', az: 0.3, el: -0.1, k: 0.4, t: 110, max: 400 } },
  { n: 30, f: 'ah1-eve-v2', m: 'autumn', w: 'a_eve', cap: 'AH-1W сбоку, на фоне неба', setup: { pside: 'def', era: 2, side: 'east', psam: 'osa', pvs: 'air' }, shot: { s: 'heli', a: 'side', az: 0.3, el: -0.1, k: 0.6, t: 110, max: 400 } },
  { n: 31, f: 'uh1-fog-v2', m: 'autumn', w: 'a_fog', cap: 'UH-1H ближе, туман', setup: { pside: 'def', era: 1, side: 'east', psam: 'zsu234', pvs: 'air' }, shot: { s: 'heli', a: 'side', az: 0.3, el: -0.05, k: 0.4, t: 110, max: 400 } },
  { n: 34, f: 'a10-eve-v2', m: 'autumn', w: 'a_eve', cap: 'A-10 над топью, вечер, сбоку', setup: { pside: 'air', era: 2, side: 'east', lo: 11, palt: 'low' }, shot: { s: 'ship', a: 'side', az: 0.4, el: -0.05, k: 0.9, t: 50 } },
  { n: 36, f: 'shilka-fog-v2', m: 'autumn', w: 'a_fog', cap: 'Шилка в тумане, крупно', setup: { pside: 'def', era: 1, side: 'east', psam: 'zsu234', pvs: 'air' }, shot: { s: 'unit', a: 'front', az: 0.5, el: 0.08, k: 0.4, t: 45, ox: -0.05, oy: 0.1 } },
  { n: 37, f: 'shahed-dusk-v2', m: 'autumn', w: 'a_eve', cap: 'Дрон над топью, вечер, крупно', setup: { pside: 'multi', era: 4, side: 'west', pmun: 'shahed' }, shot: { s: 'mun', a: 'side', az: 0.3, el: -0.05, k: 0.35, t: 20, max: 200, ox: 0.12 } },
  // 2026-10-22: гривы и углублённые овраги «Туманной топи»
  { n: 42, f: 'ridges-fog', m: 'autumn', w: 'a_fog', cap: 'Гривы в болоте у торфяника, туман', setup: { pside: 'def', era: 2, side: 'west', psam: 'gepard', pvs: 'air' }, shot: { s: 'unit', a: 'front', t: 2, f: 48, cg: 1, cam: [3950, 6, 1150, 2000, 22, 1000] } },
  { n: 43, f: 'ravine-dusk', m: 'autumn', w: 'a_dusk', cap: 'Глубокий овраг, сумерки', setup: { pside: 'def', era: 2, side: 'west', psam: 'gepard', pvs: 'air' }, shot: { s: 'unit', a: 'front', t: 2, f: 55, cg: 1, cam: [-9844, 4, 1594, -9023, 25, 1032] } },
  { n: 44, f: 'mon-ridge-eve', m: 'autumn', w: 'a_eve', cap: 'Монастырь из-за гривы, вечер', setup: { pside: 'def', era: 2, side: 'west', psam: 'gepard', pvs: 'air' }, shot: { s: 'unit', a: 'front', t: 2, f: 40, cg: 1, cam: [2850, 34, 900, 600, 14, 200] } },
];

// ── третий набор (--set3, Mark 2026-10-27: «60–80 новых красивых фото вместо текущих», максимальная графика без упрощений) ──
// снимается в review3/: без запекания земли и ленивых выборок (?gb=0&cl=0&fac=0), дома и деревья — полными моделями на всю карту (?full=1), кадр 3200×1800 → 2560×1440 (iPad и телефон — без растяжения)
const A = (era, side, lo, palt = 'low') => ({ pside: 'air', era, side, lo, palt }), D = (era, side, psam, pvs = 'air') => ({ pside: 'def', era, side, psam, pvs }), M = (era, side, pmun) => ({ pside: 'multi', era, side, pmun });
const ST = (s, k = 1.2) => ({ s, a: 'side', az: 0.3, el: 0.05, k, t: 30, max: 200 }), LAUNCH = (k = 1.6, az = 0.3) => ({ s: 'msl', a: 'side', az, el: 0.12, k, t: 4, max: 200 });
const HELI = (a = 'side', k = 0.55) => ({ s: 'heli', a, az: 0.3, el: -0.1, k, t: 110, max: 400 });
const SET3 = [
  // ── Город: авиация (низко или на фоне неба: дальние кварталы с высоты — простые коробки, сверху некрасиво; проверено 2026-10-27) ──
  { f: 'su34-kh59m-sunset', m: 'city', w: 'sunset', t: ['air'], cap: 'Су-34: Х-59М под крылом, закат', setup: A(4, 'west', 0), shot: { s: 'kh59m', a: 'side', az: 0.25, el: -0.03, k: 1.1, t: 30, max: 200 } },
  { f: 'su57-front-morning', m: 'city', w: 'morning', t: ['air'], cap: 'Су-57 спереди над окраиной, утро', setup: A(4, 'west', 3), shot: { s: 'ship', a: 'front', az: 0.5, el: -0.08, k: 0.45, t: 30, ox: 0.1 } },
  { f: 'f35-jassm-evening', m: 'city', w: 'evening', t: ['air'], cap: 'F-35A: JASSM на подвеске, вечер', setup: A(4, 'east', 4), shot: { ...ST('jassm'), el: -0.05 } },
  { f: 'f22-below-day', m: 'city', w: 'day', t: ['air'], cap: 'F-22 снизу на фоне облаков', setup: A(4, 'east', 5, 'mid'), shot: { s: 'ship', a: 'below', az: 0.3, el: -0.2, k: 0.8, t: 40 } },
  { f: 'f18-aargm-sunset', m: 'city', w: 'sunset', t: ['air'], cap: 'F/A-18E: AARGM под крылом, закат', setup: A(4, 'east', 6), shot: ST('aargm') },
  { f: 'rafale-storm-morning', m: 'city', w: 'morning', t: ['air'], cap: 'Rafale со Storm Shadow спереди, утро', setup: A(4, 'east', 8), shot: { s: 'ship', a: 'front', az: 0.5, el: -0.15, k: 0.5, t: 30, ox: 0.1 } },
  { f: 'b2-below-overcast', m: 'city', w: 'overcast', t: ['air'], cap: 'B-2 над городом, пасмурно', setup: A(4, 'east', 9, 'mid'), shot: { s: 'ship', a: 'below', az: 0.4, el: -0.15, k: 0.9, t: 40 } },
  { f: 'typhoon-chase-evening', m: 'city', w: 'evening', t: ['air'], cap: 'Typhoon сзади низко над кварталами, вечер', setup: A(4, 'east', 12), shot: { s: 'ship', a: 'chase', az: 0.35, el: 0.1, k: 0.7, t: 30, ox: -0.1 } },
  { f: 'tu160-side-sunset', m: 'city', w: 'sunset', t: ['air', 'multi'], cap: 'Ту-160 сбоку над окраиной, закат', setup: A(4, 'west', 11), shot: { s: 'ship', a: 'side', az: 0.35, el: -0.22, k: 0.7, t: 40 } },
  { f: 'su35-front-evening', m: 'city', w: 'evening', t: ['air'], cap: 'Су-35С спереди, вечер', setup: A(4, 'west', 10), shot: { s: 'ship', a: 'front', az: -0.5, el: 0.05, k: 0.5, t: 30, ox: -0.1 } },
  { f: 'mig31-kh31p-morning', m: 'city', w: 'morning', t: ['air'], cap: 'МиГ-31БМ: Х-31П, утро', setup: A(4, 'west', 2), shot: { ...ST('kh31p'), el: -0.05 } },
  { f: 'f15e-chase-sunset', m: 'city', w: 'sunset', t: ['air'], cap: 'F-15E низко над городом, закат', setup: A(3, 'east', 8), shot: { s: 'ship', a: 'chase', az: 0.35, el: 0.12, k: 0.6, t: 30, ox: -0.12 } },
  { f: 'f117-below-evening', m: 'city', w: 'evening', t: ['air'], cap: 'F-117A снизу, вечер', setup: A(3, 'east', 9), shot: { s: 'ship', a: 'below', az: 0.3, el: -0.25, k: 0.8, t: 40 } },
  { f: 'b52-side-morning', m: 'city', w: 'morning', t: ['air'], cap: 'B-52H сбоку, утро', setup: A(3, 'east', 13), shot: { s: 'ship', a: 'side', az: 0.35, el: -0.1, k: 0.9, t: 40 } },
  { f: 'b1b-front-sunset', m: 'city', w: 'sunset', t: ['air'], cap: 'B-1B спереди, закат', setup: A(3, 'east', 14), shot: { s: 'ship', a: 'front', az: 0.5, el: -0.05, k: 0.6, t: 35, ox: 0.1 } },
  { f: 'su30-mount-day', m: 'city', w: 'day', t: ['air'], cap: 'Су-30СМ, камера на крыле', setup: A(3, 'west', 1), shot: { s: 'ship', a: 'mount', t: 50 } },
  { f: 'su24-kh58-overcast', m: 'city', w: 'overcast', t: ['air'], cap: 'Су-24М: Х-58, пасмурно', setup: A(2, 'west', 0), shot: ST('kh58') },
  { f: 'tornado-gbu12-morning', m: 'city', w: 'morning', t: ['air'], cap: 'Tornado: GBU-12, утро', setup: A(2, 'east', 9), shot: ST('gbu12') },
  { f: 'a10-side-day', m: 'city', w: 'day', t: ['air'], cap: 'A-10A сбоку', setup: A(2, 'east', 11), shot: { s: 'ship', a: 'side', az: 0.4, el: -0.05, k: 0.8, t: 40 } },
  { f: 'mig27-kh29t-sunset', m: 'city', w: 'sunset', t: ['air'], cap: 'МиГ-27К: Х-29Т, закат', setup: A(2, 'west', 4), shot: ST('kh29t') },
  { f: 'tu22m3-side-evening', m: 'city', w: 'evening', t: ['air'], cap: 'Ту-22М3 сбоку, вечер', setup: A(3, 'west', 11), shot: { s: 'ship', a: 'side', az: 0.35, el: -0.08, k: 0.8, t: 40 } },
  { f: 'f4-front-sunset', m: 'city', w: 'sunset', t: ['air'], cap: 'F-4 Phantom спереди, закат', setup: A(1, 'east', 8), shot: { s: 'ship', a: 'front', az: 0.6, el: 0.05, k: 0.6, t: 40, ox: -0.1 } },
  // ── Город: ПВО и удар ──
  { f: 's400-unit', m: 'city', w: 'evening', t: ['pvo'], cap: 'Пуск С-400, вечер (это же — фон «Исследований»)', setup: D(4, 'east', 's400'), shot: LAUNCH(1.5, 0.35) },
  { f: 'pac3-day', m: 'city', w: 'day', t: ['pvo'], cap: 'Пуск PAC-3', setup: D(4, 'west', 'pac3'), shot: LAUNCH(1.8) },
  { f: 'nasams-morning', m: 'city', w: 'morning', t: ['pvo'], cap: 'Пуск NASAMS, утро', setup: D(4, 'west', 'nasams'), shot: LAUNCH() },
  { f: 'bukm3-sunset', m: 'city', w: 'sunset', t: ['pvo'], cap: 'Пуск Бук-М3, закат', setup: D(4, 'east', 'bukm3'), shot: LAUNCH() },
  { f: 'pantsir-overcast', m: 'city', w: 'overcast', t: ['pvo'], cap: 'Панцирь-С1, пасмурно', setup: D(4, 'east', 'pantsir'), shot: { s: 'unit', a: 'front', az: 0.2, el: 0.1, k: 1.0, t: 3 } },
  { f: 'patriot-morning', m: 'city', w: 'morning', t: ['pvo'], cap: 'Пуск Patriot, утро', setup: D(3, 'west', 'patriot'), shot: LAUNCH() },
  { f: 'tor-evening', m: 'city', w: 'evening', t: ['pvo'], cap: 'Пуск Тор-М1, вечер', setup: D(3, 'east', 'tor'), shot: LAUNCH(1.6, 0.2) },
  { f: 'gepard-day', m: 'city', w: 'day', t: ['pvo'], cap: 'Gepard у кварталов', setup: D(2, 'west', 'gepard'), shot: { s: 'unit', a: 'front', az: 0.3, el: 0.05, k: 0.6, t: 30, ox: 0.12 } },
  { f: 'iskander-evening', m: 'city', w: 'evening', t: ['multi'], cap: 'Пусковая «Искандер», вечер', setup: M(4, 'west', 'iskander'), shot: { s: 'src', a: 'side', az: 0.6, el: 0.1, k: 0.75, t: 14 } },
  { f: 'tomahawk-day', m: 'city', w: 'day', t: ['multi'], cap: 'Tomahawk над городом', setup: M(3, 'east', 'tomahawk'), shot: { s: 'mun', a: 'chase', az: 0.3, el: 0.1, k: 1.4, t: 15, max: 200 } },
  { f: 'drone-city-evening', m: 'city', w: 'evening', t: ['multi'], cap: 'Ударный дрон над городом, вечер', setup: M(4, 'west', 'shahed'), shot: { s: 'mun', a: 'side', az: 0.3, el: -0.05, k: 0.35, t: 20, max: 200, ox: -0.1 } },
  // ── Северный рубеж ──
  { f: 'mig31-kinzhal-clear', m: 'winter', w: 'w_clear', t: ['multi'], cap: 'МиГ-31К с «Кинжалом»', setup: M(4, 'west', 'kinzhal'), shot: { s: 'src', a: 'side', az: 0.35, el: 0.12, k: 0.55, t: 25, max: 200 } },
  { f: 'kinzhal-flight-frost', m: 'winter', w: 'w_frost', t: ['multi'], cap: '«Кинжал» после пуска, мороз', setup: M(4, 'west', 'kinzhal'), shot: { s: 'mun', a: 'chase', az: 0.3, el: 0.05, k: 1.4, t: 30, max: 200 } },
  { f: 'kh101-side-clear', m: 'winter', w: 'w_clear', t: ['multi'], cap: 'Крылатая Х-101 над горами', setup: M(4, 'west', 'kh101'), shot: { s: 'mun', a: 'side', az: 0.3, el: -0.05, k: 0.8, t: 15, max: 200 } },
  { f: 'kalibr-tu160-frost', m: 'winter', w: 'w_frost', t: ['multi'], cap: 'Ту-160 с «Калибрами» снизу, мороз', setup: M(4, 'west', 'kalibr'), shot: { s: 'src', a: 'below', az: 0.3, el: -0.2, k: 0.9, t: 15, max: 200 } },
  { f: 'tochka-clear', m: 'winter', w: 'w_clear', t: ['multi'], cap: 'Пусковая «Точка-У»', setup: M(3, 'west', 'tochka'), shot: { s: 'src', a: 'side', az: 0.6, el: 0.1, k: 0.75, t: 14 } },
  { f: 'atacms-frost', m: 'winter', w: 'w_frost', t: ['multi'], cap: 'Пусковая ATACMS, мороз', setup: M(3, 'east', 'atacms'), shot: { s: 'src', a: 'side', az: 0.6, el: 0.1, k: 0.75, t: 14 } },
  { f: 'lance-flight-snow', m: 'winter', w: 'w_snow', t: ['multi'], cap: 'Lance после пуска, снегопад', setup: M(2, 'east', 'lance'), shot: { s: 'mun', a: 'chase', az: 0.3, el: 0.05, k: 1.4, t: 6, max: 120 } },
  { f: 'typhoon-storm-snow', m: 'winter', w: 'w_snow', t: ['multi'], cap: 'Typhoon со Storm Shadow, снегопад', setup: M(4, 'east', 'storm'), shot: { s: 'src', a: 'chase', az: 0.3, el: 0.1, k: 0.8, t: 15, max: 200 } },
  { f: 'b52-jassm-clear', m: 'winter', w: 'w_clear', t: ['multi'], cap: 'B-52H с JASSM над горами', setup: M(4, 'east', 'jassm'), shot: { s: 'src', a: 'side', az: 0.4, el: -0.05, k: 0.9, t: 15, max: 200 } },
  { f: 'tomahawk-side-frost', m: 'winter', w: 'w_frost', t: ['multi'], cap: 'Tomahawk над заснеженной долиной', setup: M(3, 'east', 'tomahawk'), shot: { s: 'mun', a: 'side', az: 0.3, el: -0.05, k: 0.6, t: 20, max: 200 } },
  { f: 'su34-umpk-clear', m: 'winter', w: 'w_clear', t: ['air'], cap: 'Су-34: ФАБ-500 с УМПК', setup: A(4, 'west', 0, 'mid'), shot: { s: 'umpk', a: 'side', az: 0.3, el: 0.05, k: 1.1, t: 8, max: 200 } },
  { f: 'f16-jassm-frost', m: 'winter', w: 'w_frost', t: ['air'], cap: 'F-16C: JASSM, мороз', setup: A(4, 'east', 7, 'mid'), shot: ST('jassm') },
  { f: 'mig29k-front-frost', m: 'winter', w: 'w_frost', t: ['air'], cap: 'МиГ-29К спереди, мороз', setup: A(4, 'west', 15), shot: { s: 'ship', a: 'front', az: 0.5, el: -0.08, k: 0.45, t: 30, ox: 0.1 } },
  { f: 'f35-below-clear', m: 'winter', w: 'w_clear', t: ['air'], cap: 'F-35A снизу, ясно', setup: A(4, 'east', 4, 'mid'), shot: { s: 'ship', a: 'below', az: 0.3, el: -0.2, k: 0.9, t: 40 } },
  { f: 'gripen-gbu12-snow', m: 'winter', w: 'w_snow', t: ['air'], cap: 'Gripen: GBU-12, снегопад', setup: A(3, 'east', 5), shot: ST('gbu12') },
  { f: 'su57-chase-clear', m: 'winter', w: 'w_clear', t: ['air'], cap: 'Су-57 сзади над горами', setup: A(4, 'west', 3, 'mid'), shot: { s: 'ship', a: 'chase', az: 0.35, el: 0.1, k: 0.6, t: 30 } },
  { f: 's300-snow', m: 'winter', w: 'w_snow', t: ['pvo'], cap: 'Пуск С-300, снегопад', setup: D(3, 'east', 's300'), shot: LAUNCH() },
  { f: 'patriot-frost', m: 'winter', w: 'w_frost', t: ['pvo'], cap: 'Пуск Patriot, мороз', setup: D(3, 'west', 'patriot', 'multi'), shot: LAUNCH() },
  { f: 'buk-clear', m: 'winter', w: 'w_clear', t: ['pvo'], cap: 'Пуск Бук-М1', setup: D(3, 'east', 'buk'), shot: LAUNCH() },
  { f: 'torm2-snow', m: 'winter', w: 'w_snow', t: ['pvo'], cap: 'Пуск Тор-М2, снегопад', setup: D(4, 'east', 'torm2', 'multi'), shot: LAUNCH(1.6, 0.2) },
  { f: 'strela1-frost', m: 'winter', w: 'w_frost', t: ['pvo'], cap: 'Пуск «Стрела-1», мороз', setup: D(1, 'east', 'strela1'), shot: LAUNCH(1.4) },
  { f: 'hawk21-clear', m: 'winter', w: 'w_clear', t: ['pvo'], cap: 'Пуск Hawk XXI', setup: D(4, 'west', 'hawk21', 'multi'), shot: LAUNCH() },
  { f: 'sampt-frost', m: 'winter', w: 'w_frost', t: ['pvo'], cap: 'Пуск SAMP/T, мороз', setup: D(4, 'west', 'sampt', 'multi'), shot: LAUNCH() },
  // ── Туманная топь ──
  { f: 'ka52-eve', m: 'autumn', w: 'a_eve', t: ['air', 'pvo'], cap: 'Ка-52, вечер', setup: D(4, 'west', 'pac3'), shot: HELI() },
  { f: 'ah64-dusk', m: 'autumn', w: 'a_dusk', t: ['air', 'pvo'], cap: 'AH-64 сбоку, сумерки', setup: D(3, 'east', 'tor'), shot: HELI('side', 0.45) },
  { f: 'ka50-fog', m: 'autumn', w: 'a_fog', t: ['air', 'pvo'], cap: 'Ка-50 или Ми-28Н в тумане', setup: D(3, 'west', 'patriot'), shot: HELI() },
  { f: 'mi24-eve', m: 'autumn', w: 'a_eve', t: ['air', 'pvo'], cap: 'Ми-24, вечер', setup: D(1, 'west', 'hawk'), shot: HELI() },
  { f: 'uh60-dusk', m: 'autumn', w: 'a_dusk', t: ['air', 'pvo'], cap: 'UH-60, сумерки', setup: D(2, 'east', 'osa'), shot: HELI() },
  { f: 'mi8-fog', m: 'autumn', w: 'a_fog', t: ['air', 'pvo'], cap: 'Ми-8 с блоками С-8, туман', setup: D(2, 'west', 'gepard'), shot: HELI('below', 0.6) },
  { f: 'rah66-eve', m: 'autumn', w: 'a_eve', t: ['air', 'pvo'], cap: 'RAH-66 Comanche, вечер', setup: D(4, 'east', 'torm2'), shot: HELI() },
  { f: 'uh1-dusk', m: 'autumn', w: 'a_dusk', t: ['air', 'pvo'], cap: 'UH-1H, сумерки', setup: D(1, 'east', 'zsu234'), shot: HELI('front', 0.45) },
  { f: 'su25-fog', m: 'autumn', w: 'a_fog', t: ['air'], cap: 'Су-25 над топью, туман', setup: A(2, 'west', 2), shot: { s: 'ship', a: 'side', az: 0.4, el: -0.05, k: 0.6, t: 40 } },
  { f: 'a10-maverick-eve', m: 'autumn', w: 'a_eve', t: ['air'], cap: 'A-10A: Maverick, вечер', setup: A(2, 'east', 11), shot: ST('agm65b') },
  { f: 'osa-dusk', m: 'autumn', w: 'a_dusk', t: ['pvo'], cap: 'Пуск «Оса», сумерки', setup: D(2, 'east', 'osa'), shot: LAUNCH(1.4) },
  { f: 'gepard-fog', m: 'autumn', w: 'a_fog', t: ['pvo'], cap: 'Gepard в тумане', setup: D(2, 'west', 'gepard'), shot: { s: 'unit', a: 'front', az: 0.4, el: 0.06, k: 0.5, t: 60, ox: 0.12 } },
  { f: 'avenger-eve', m: 'autumn', w: 'a_eve', t: ['pvo'], cap: 'Пуск Avenger, вечер', setup: D(3, 'west', 'avenger'), shot: LAUNCH(1.4) },
  { f: 'tunguska-dusk', m: 'autumn', w: 'a_dusk', t: ['pvo'], cap: '«Тунгуска», сумерки', setup: D(3, 'east', 'tunguska'), shot: { s: 'unit', a: 'front', az: 0.3, el: 0.08, k: 0.6, t: 30, ox: 0.1 } },
  { f: 'roland-fog', m: 'autumn', w: 'a_fog', t: ['pvo'], cap: 'Пуск Roland, туман', setup: D(2, 'west', 'roland'), shot: LAUNCH(1.4) },
  { f: 'strela10-eve', m: 'autumn', w: 'a_eve', t: ['pvo'], cap: 'Пуск «Стрела-10», вечер', setup: D(2, 'east', 'strela10'), shot: LAUNCH(1.4) },
  { f: 'drone-swamp-eve', m: 'autumn', w: 'a_eve', t: ['multi'], cap: 'Ударный дрон над топью, вечер', setup: M(4, 'west', 'shahed'), shot: { s: 'mun', a: 'side', az: 0.3, el: -0.05, k: 0.35, t: 20, max: 200, ox: 0.12 } },
  { f: 'monastery-eve', m: 'autumn', w: 'a_eve', t: ['air', 'pvo', 'multi'], cap: 'Монастырь на острове, вечер', setup: D(2, 'west', 'gepard'), shot: { s: 'unit', a: 'front', t: 2, f: 30, cg: 1, cam: [540, 7, 190, 620, 18, 160] } },
  { f: 'mill-fog', m: 'autumn', w: 'a_fog', t: ['air', 'pvo', 'multi'], cap: 'Мельница на Лысой горе, туман', setup: D(2, 'west', 'gepard'), shot: { s: 'unit', a: 'front', t: 2, f: 45, cg: 1, cam: [7437, 3, -6968, 7534, 16, -7055] } },
  { f: 'ridges-dusk', m: 'autumn', w: 'a_dusk', t: ['air', 'pvo', 'multi'], cap: 'Гривы в болоте, сумерки', setup: D(2, 'west', 'gepard'), shot: { s: 'unit', a: 'front', t: 2, f: 48, cg: 1, cam: [3950, 6, 1150, 2000, 22, 1000] } },
  // ── Окраски магазина (Mark 2026-10-27: «юниты с камуфляжами — отдельно, где уместно»): только вышедшие в «Витрину»; q — модель с окраской (models.js CAMO_R) ──
  { f: 'f15e-inferno-sunset', m: 'city', w: 'evening', t: ['air'], cap: 'F-15E в окраске «Инферно», вечер', q: '&camo=e_f15e:inferno', setup: A(3, 'east', 8), shot: { s: 'ship', a: 'side', az: -0.35, el: -0.06, k: 0.5, t: 30, ox: 0.08 }, seed: 1 },
  { f: 'f15e-inferno-dusk', m: 'autumn', w: 'a_dusk', t: ['air'], cap: 'F-15E «Инферно» спереди над топью, сумерки', q: '&camo=e_f15e:inferno', setup: A(3, 'east', 8), shot: { s: 'ship', a: 'front', az: 0.5, el: -0.08, k: 0.45, t: 30, ox: -0.1 } },
  { f: 'mig31-dragon-clear', m: 'winter', w: 'w_clear', t: ['air'], cap: 'МиГ-31БМ «Нефритовый дракон» сверху (камера в осях самолёта)', q: '&camo=e_mig31:dragon', setup: A(4, 'west', 2, 'mid'), shot: { s: 'ship', a: 'lock', az: 0, el: 0.95, k: 0.6, t: 30 }, seed: 3 }, // «Центр» в осях самолёта: верх (дракон) виден при любом крене // сверху — весь дракон (Mark: «снять нефритового дракона сверху»)
  { f: 'mig31-dragon-frost', m: 'winter', w: 'w_frost', t: ['air'], cap: 'МиГ-31БМ «Нефритовый дракон» сбоку, мороз', q: '&camo=e_mig31:dragon', setup: A(4, 'west', 2), shot: { s: 'ship', a: 'side', az: 0.35, el: 0.08, k: 0.55, t: 30 } },
];
const SET3_MODE = Deno.args.includes('--set3'), HQ = SET3_MODE;

const args = Deno.args.filter((a) => !a.startsWith('--'));
const want = new Set(args);
const num = (r, i) => ({ ...r, n: i + 1, f: `${String(i + 1).padStart(2, '0')}-${r.f}` });
const LIST = SET3_MODE ? SET3.map(num) : REVIEW_MODE ? [...REVIEW.map(num), ...REVIEW2.map((r) => ({ ...r, f: `${String(r.n).padStart(2, '0')}-${r.f}` }))] : SHOTS;
const pick = (s) => !want.size || want.has(s.f) || (REVIEW_MODE && (want.has(String(s.n)) || want.has(s.f.slice(3))));
const server = Deno.serve({ port: PORT, hostname: '127.0.0.1', onListen() {} }, (req) => serveDir(req, { fsRoot: ROOT, quiet: true }));
// каждой странице — свой Chrome: фоновая вкладка засыпает (игра ставит паузу, кадры по 1 в секунду) — так нельзя снимать по несколько сразу
const launch = () => puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', protocolTimeout: 600000,
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', `--window-size=${W},${H}`, '--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] });
Deno.mkdirSync(OUT, { recursive: true });
const done = [];
async function shoot(s, browser) {
  const page = await browser.newPage();
  await page.setViewport({ width: W, height: H, deviceScaleFactor: HQ ? 3 : 2 }); // кадр 3200×1800 → 1920×1080 (чётче, чем сразу); третий набор — 4800×2700 → 2560×1440
  const setup = { ...s.setup, ...(s.m ? { pmap: s.m } : {}) };
  await page.evaluateOnNewDocument((setup) => { localStorage.setItem('fortuna_airdef_setup', JSON.stringify({ game: 'photo', diff: 'arcade', ...setup })); localStorage.setItem('fortuna_airdef_muted', '1'); }, setup);
  const url = `http://127.0.0.1:${PORT}/fortuna-bot-web/games/airdef.html?go=photo&gfx=cinema&test=1${HQ ? (Deno.env.get('SHOT_FLAGS') ?? '&gb=0&cl=0&fac=0&full=1') : ''}&weather=${s.w}${s.q || ''}${s.seed ? `&seed=${s.seed}` : ''}&shot=${encodeURIComponent(JSON.stringify(s.shot))}`;
  const t0 = Date.now(), pend = new Set(); // запросы в пути (blob: не считаем — они у Chrome «висят» вечно)
  page.on('request', (r) => { if (!/^(blob|data):/.test(r.url())) pend.add(r); });
  for (const e of ['requestfinished', 'requestfailed']) page.on(e, (r) => pend.delete(r));
  try {
    await page.goto(url, { waitUntil: 'load', timeout: 120000 });
    await page.waitForFunction(() => window.__shot === 'ready' || window.__shot === 'timeout', { timeout: 420000, polling: 500 });
    const res = await page.evaluate(() => window.__shot);
    for (let q = 0, t = Date.now(); q < 3 && Date.now() - t < 90000; await new Promise((r) => setTimeout(r, 500))) q = pend.size ? 0 : q + 1; // догрузились модели и текстуры (дома, деревья) — кадр без «коробок»
    await new Promise((r) => setTimeout(r, 1500));
    const png = `${OUT}${s.f}.png`;
    await page.screenshot({ path: png });
    const ff = new Deno.Command('cwebp', { args: ['-quiet', '-q', REVIEW_MODE ? '80' : '74', '-m', '6', '-resize', HQ ? '2560' : '1920', HQ ? '1440' : '1080', png, '-o', `${OUT}${s.f}.webp`] }).outputSync();
    Deno.removeSync(png);
    const kb = Math.round(Deno.statSync(`${OUT}${s.f}.webp`).size / 1024);
    const wk = await page.evaluate(() => (window.__a || {}).W_KEY).catch(() => '?'); // какая погода действительно включилась
    console.log(`${s.f}: ${res} · ${Math.round((Date.now() - t0) / 1000)} с · ${kb} КБ · погода ${wk}${ff.success ? '' : ' · cwebp ✕'}`);
    if (res === 'ready') done.push(s); else Deno.removeSync(`${OUT}${s.f}.webp`);
  } catch (e) { console.log(`${s.f}: ошибка — ${e.message}`); }
  await page.close();
}
// нынешние кадры меню (Mark 2026-10-27: «в сборку всех фото включи те, что уже используются — потом скажу, какие в игру») — копия в review3/cur/
// (номера С1…СN — по порядку shots.js на момент копии; делается один раз, до установки)
const CUR = `${OUT}cur/`;
if (SET3_MODE) try { Deno.statSync(`${CUR}list.json`); } catch (_) {
  const src = new URL('../../games/airdef/shots/', import.meta.url).pathname, m = Deno.readTextFileSync(`${src}shots.js`).match(/SHOTS = (\[[\s\S]*\]);/), cur = m ? JSON.parse(m[1]) : [];
  Deno.mkdirSync(CUR, { recursive: true }); for (const c of cur) Deno.copyFileSync(src + c.f, CUR + c.f);
  Deno.writeTextFileSync(`${CUR}list.json`, JSON.stringify(cur));
}
// --set3 --install=all|1,2,5,С3,С7 — выбранные кадры → games/airdef/shots/: номера — третий набор (имя без номера), СN (кириллицей или латиницей) — нынешний
// кадр N из review3/cur; остальные кадры меню удаляются, shots.js — новый список (метки режима t — из SET3 / прежние); ничего не снимает
const INSTALL = (Deno.args.find((a) => a.startsWith('--install=')) || '').slice(10);
if (SET3_MODE && INSTALL) {
  const dst = new URL('../../games/airdef/shots/', import.meta.url).pathname, tok = INSTALL === 'all' ? null : INSTALL.split(',').map((t) => t.trim());
  const cur = JSON.parse(Deno.readTextFileSync(`${CUR}list.json`)), has = (p) => { try { Deno.statSync(p); return true; } catch (_) { return false; } };
  const nums = tok ? new Set(tok.filter((t) => /^\d+$/.test(t)).map(Number)) : null, curN = tok ? tok.map((t) => /^[сcСC](\d+)$/u.exec(t)).filter(Boolean).map((m) => +m[1]) : [];
  const pickd = [...LIST.filter((s) => (!nums || nums.has(s.n)) && has(`${OUT}${s.f}.webp`)).map((s) => ({ src: `${OUT}${s.f}.webp`, f: `${s.f.slice(3)}.webp`, t: s.t })),
    ...curN.map((i) => cur[i - 1]).filter((c) => c && has(CUR + c.f)).map((c) => ({ src: CUR + c.f, f: c.f, t: c.t }))];
  if (!pickd.length) { console.log('нечего ставить: выбранных кадров нет'); Deno.exit(1); }
  for (const e of Deno.readDirSync(dst)) if (e.name.endsWith('.webp')) Deno.removeSync(dst + e.name);
  for (const s of pickd) Deno.copyFileSync(s.src, dst + s.f);
  { const r = LIST.find((s) => s.f.endsWith('-s400-unit')); if (r && has(`${OUT}${r.f}.webp`) && !pickd.some((s) => s.f === 's400-unit.webp')) Deno.copyFileSync(`${OUT}${r.f}.webp`, `${dst}s400-unit.webp`); } // фон «Исследований» (research.js) — и когда его нет среди кадров меню
  Deno.writeTextFileSync(`${dst}shots.js`, `// Кадры фона главного меню (menubg.js): f — файл в этой папке, t — метки режима (air, pvo, multi). Список пишет\n// tools/airdef-shots/capture.js; пустой — фон меню остаётся живым боем (director.js)\nexport const SHOTS = ${JSON.stringify(pickd.map((s) => ({ f: s.f, t: s.t })), null, 0)};\n`);
  console.log(`в меню: ${pickd.length} кадров, ${(pickd.reduce((a, s) => a + Deno.statSync(s.src).size, 0) / 1048576).toFixed(1)} МБ`);
  await server.shutdown(); Deno.exit(0);
}
// --seeds=1,2,3 — пробные кадры: каждый выбранный кадр с другими расстановками (seed) → review/try/ (подобрать удачную; в игру и на страницу не идут)
const SEEDS = ((Deno.args.find((a) => a.startsWith('--seeds=')) || '').slice(8)).split(',').filter(Boolean);
if (SEEDS.length) Deno.mkdirSync(`${OUT}try`, { recursive: true });
const queue = SEEDS.length ? LIST.filter(pick).flatMap((s) => SEEDS.map((sd) => ({ ...s, seed: sd, f: `try/${s.f}~s${sd}` }))) : LIST.filter(pick);
await Promise.all(Array.from({ length: PAR }, async () => { const b = await launch(); for (let s; (s = queue.shift());) await shoot(s, b); await b.close(); }));
await server.shutdown();

if (REVIEW_MODE && SEEDS.length) { /* пробные кадры страницу не меняют */ }
else if (REVIEW_MODE) {
  if (!want.size) for (const e of Deno.readDirSync(OUT)) if (/\.(webp|png)$/.test(e.name) && !LIST.some((q) => `${q.f}.webp` === e.name)) Deno.removeSync(OUT + e.name); // остатки прежней нумерации
  writeReviewPage();
}
else {
  // список для меню: прежние кадры (если снимали не все) + новые
  const prev = (() => { try { const m = Deno.readTextFileSync(`${OUT}shots.js`).match(/SHOTS = (\[[\s\S]*\]);/); return m ? JSON.parse(m[1]) : []; } catch (_) { return []; } })();
  const all = [...prev.filter((p) => !done.some((d) => d.f + '.webp' === p.f)), ...done.map((d) => ({ f: d.f + '.webp', t: d.t }))].filter((p) => { try { Deno.statSync(OUT + p.f); return true; } catch (_) { return false; } });
  Deno.writeTextFileSync(`${OUT}shots.js`, `// Кадры фона главного меню (menubg.js): f — файл в этой папке, t — метки режима (air, pvo, multi). Список пишет\n// tools/airdef-shots/capture.js; пустой — фон меню остаётся живым боем (director.js)\nexport const SHOTS = ${JSON.stringify(all, null, 0)};\n`);
  console.log(`кадров в меню: ${all.length}`);
}

// страница review/index.html: сетка снятых кадров (номер, файл, подпись), клик — на весь экран; телефон — одна колонка
function writeReviewPage() {
  const MAPN = { city: 'Город', winter: 'Северный рубеж', autumn: 'Туманная топь' };
  const have = LIST.filter((s) => { try { Deno.statSync(`${OUT}${s.f}.webp`); return true; } catch (_) { return false; } });
  // страница копит кадры: прежние записи (в том числе кадры прежней нумерации, которых нет в LIST) остаются, снятые сейчас — перезаписываются
  const prev = (() => { try { const m = Deno.readTextFileSync(`${OUT}index.html`).match(/const D=(\[.*?\]);\n/); return m ? JSON.parse(m[1]) : []; } catch (_) { return []; } })()
    .filter((d) => { try { Deno.statSync(OUT + d.f); return true; } catch (_) { return false; } });
  const fresh = (have.filter((s) => done.includes(s)).length ? have.filter((s) => done.includes(s)) : have).map((s) => ({ n: s.n, f: `${s.f}.webp`, cap: s.cap || '', map: MAPN[s.m] || '' }));
  const data = [...prev.filter((d) => !fresh.some((q) => q.f === d.f)), ...fresh, ...have.filter((s) => !prev.some((d) => d.f === `${s.f}.webp`) && !fresh.some((q) => q.f === `${s.f}.webp`)).map((s) => ({ n: s.n, f: `${s.f}.webp`, cap: s.cap || '', map: MAPN[s.m] || '' }))]
    .sort((a, b) => a.n - b.n || a.f.localeCompare(b.f));
  const html = `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Воздушное превосходство — кадры для фона меню (на утверждение)</title>
<style>
:root{color-scheme:dark;--bg:#0d1117;--card:#161b22;--tx:#e6edf3;--mut:#8b949e;--ac:#f0a030}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--tx);font:15px/1.4 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
header{padding:20px 16px 8px;max-width:1500px;margin:auto}h1{margin:0 0 6px;font-size:22px}header p{margin:0;color:var(--mut)}
.bar{display:flex;flex-wrap:wrap;gap:8px;max-width:1500px;margin:0 auto;padding:8px 16px}
.bar button{background:var(--card);color:var(--tx);border:1px solid #30363d;border-radius:999px;padding:6px 14px;font:inherit;cursor:pointer}
.bar button.on{border-color:var(--ac);color:var(--ac)}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(420px,1fr));gap:14px;max-width:1500px;margin:auto;padding:8px 16px 40px}
figure{margin:0;background:var(--card);border-radius:10px;overflow:hidden;cursor:zoom-in;border:1px solid #21262d}
figure img{display:block;width:100%;aspect-ratio:16/9;object-fit:cover;background:#000}
figcaption{padding:10px 12px 12px}.nm{display:flex;gap:8px;align-items:baseline;flex-wrap:wrap}
.nm b{color:var(--ac);font-size:18px}.nm code{color:var(--mut);font-size:12px;word-break:break-all}.mp{color:var(--mut);font-size:12px;margin-left:auto}
figcaption p{margin:4px 0 0}
#lb{position:fixed;inset:0;background:rgba(0,0,0,.94);display:none;flex-direction:column;align-items:center;justify-content:center;z-index:9;padding:8px}
#lb.on{display:flex}#lb img{max-width:100%;max-height:calc(100% - 70px);object-fit:contain}#lb div{color:#fff;padding:10px 12px 2px;text-align:center;max-width:900px}
#lb small{color:var(--mut);display:block;margin-top:2px}
@media(max-width:560px){.grid{grid-template-columns:1fr;padding:8px 12px 40px;gap:12px}header{padding:16px 12px 6px}h1{font-size:19px}.bar{padding:8px 12px}}
</style></head><body>
<header><h1>Кадры для фона главного меню — на утверждение</h1><p>${data.length} кадров, ${HQ ? '2560×1440, графика «Кино» без упрощений' : '1920×1080; «-v2» — переснятые слабые'}. Нажмите на кадр — на весь экран (стрелки и свайп — следующий, Esc — закрыть). Запишите номера, которые войдут в игру.</p></header>
<div class="bar" id="bar"></div><div class="grid" id="g"></div>
<div id="lb"><img id="li" alt=""><div id="lc"></div></div>
<script>
const D=${JSON.stringify(data)};
const g=document.getElementById('g'),lb=document.getElementById('lb'),li=document.getElementById('li'),lc=document.getElementById('lc');
let cur=[],idx=0,flt='';
function draw(){cur=D.filter(d=>!flt||d.map===flt);g.innerHTML=cur.map((d,i)=>'<figure data-i="'+i+'"><img loading="lazy" src="'+d.f+'" alt="'+d.n+'"><figcaption><div class="nm"><b>№'+d.n+'</b><code>'+d.f+'</code><span class="mp">'+d.map+'</span></div><p>'+d.cap.replace(/</g,'&lt;')+'</p></figcaption></figure>').join('')}
const maps=[...new Set(D.map(d=>d.map))];
document.getElementById('bar').innerHTML=['Все',...maps].map((m,i)=>'<button class="'+(i?'':'on')+'" data-m="'+(i?m:'')+'">'+m+'</button>').join('');
document.getElementById('bar').onclick=e=>{const b=e.target.closest('button');if(!b)return;flt=b.dataset.m;[...b.parentNode.children].forEach(x=>x.classList.toggle('on',x===b));draw()};
function show(i){idx=(i+cur.length)%cur.length;const d=cur[idx];li.src=d.f;lc.innerHTML='<b>№'+d.n+'</b> · '+d.cap.replace(/</g,'&lt;')+'<small>'+d.f+' · '+d.map+'</small>';lb.classList.add('on')}
g.onclick=e=>{const f=e.target.closest('figure');if(f)show(+f.dataset.i)};
lb.onclick=e=>{if(e.target===li){const r=li.getBoundingClientRect();show(idx+(e.clientX>r.left+r.width/2?1:-1))}else lb.classList.remove('on')};
addEventListener('keydown',e=>{if(!lb.classList.contains('on'))return;if(e.key==='Escape')lb.classList.remove('on');else if(e.key==='ArrowRight')show(idx+1);else if(e.key==='ArrowLeft')show(idx-1)});
let sx=0;lb.addEventListener('touchstart',e=>{sx=e.touches[0].clientX},{passive:true});lb.addEventListener('touchend',e=>{const dx=e.changedTouches[0].clientX-sx;if(Math.abs(dx)>50){show(idx+(dx<0?1:-1));e.preventDefault()}});
draw();
</script></body></html>
`;
  Deno.writeTextFileSync(`${OUT}index.html`, html);
  const tot = have.reduce((a, s) => a + Deno.statSync(`${OUT}${s.f}.webp`).size, 0);
  console.log(`страница review/index.html: ${have.length} кадров, ${(tot / 1048576).toFixed(1)} МБ`);
}
