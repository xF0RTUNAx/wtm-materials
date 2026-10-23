// Видеочип телефона и его примерная производительность (2026-10-23, Mark: «грамотная и широкая градация — у айфонов и андроидов железо разное»).
// Оценка — в баллах, ориентир — тесты уровня 3DMark Wild Life (порядок величин, не точное число): по ней «Обычная» чёткость выбирает ступень (main.js).
// Игроку показывается только название определённого видеочипа (без «класса»).
//   • Android: имя из WEBGL_debug_renderer_info — Adreno по номеру, Mali / Immortalis — по модели и числу ядер (MC / MP), Xclipse, PowerVR, Maleoon.
//   • iPhone / iPad: имя всегда «Apple GPU» — модель угадывается по размеру экрана (в точках) и версии iOS (iOS 18 — не ниже A12 и т. п.).
//   • Неизвестный — null (main.js берёт среднюю ступень).

// Adreno: номер → баллы (между известными — по ближайшему меньшему в той же серии)
const ADRENO = { 505: 250, 506: 300, 508: 350, 509: 400, 510: 450, 512: 600, 530: 900, 540: 1300,
  605: 400, 608: 500, 610: 550, 612: 800, 613: 650, 615: 900, 616: 950, 618: 1200, 619: 1400, 620: 1800, 630: 2900, 640: 3700, 642: 3200, 643: 2600, 644: 3200,
  650: 4600, 660: 6000, 662: 2300, 663: 2600, 680: 4000, 690: 5000, 695: 5500,
  702: 700, 710: 3500, 720: 4500, 722: 3200, 725: 8000, 730: 10000, 732: 9000, 735: 12000, 740: 13000, 750: 19000, 810: 6000, 825: 12000, 830: 24000 };
// Mali / Immortalis: модель → баллы на ядро (итог — × число ядер MC/MP; если не указано — типичное для модели)
const MALI = { 31: [120, 2], 51: [150, 4], 52: [260, 2], 57: [550, 2], 68: [480, 4], 71: [150, 8], 72: [140, 12], 76: [280, 4], 77: [450, 9], 78: [400, 14],
  310: [300, 2], 510: [500, 2], 610: [900, 6], 615: [900, 2], 710: [900, 10], 715: [1050, 11], 720: [1300, 12], 725: [1500, 12], 925: [1600, 12] };
const OTHER = [[/Xclipse\s*950/i, 18000], [/Xclipse\s*940/i, 14000], [/Xclipse\s*920/i, 8000], [/Xclipse\s*5\d0/i, 5000], [/Xclipse/i, 8000],
  [/Maleoon\s*920/i, 9000], [/Maleoon\s*910/i, 6000], [/Maleoon/i, 6000],
  [/GM\s*9446/i, 1500], [/BXM-8-256/i, 1200], [/GE\s*8322/i, 170], [/GE\s*8320/i, 150], [/GE\s*8300/i, 120], [/PowerVR|IMG/i, 200], [/Mali-T\d/i, 200], [/Mali-4\d\d/i, 60]];

// iPhone / iPad: [меньшая сторона, большая сторона, dpr] экрана в точках → [баллы; при старой iOS — баллы для старейшей модели этого размера]
// (у одного размера бывают разные чипы: 375×667 — от 6s (A9) до SE 3 (A15); iOS 18+ ставится только с A12, iOS 16–17 — с A11)
function appleScore(w, h, dpr, ios) {
  const s = Math.min(w, h), l = Math.max(w, h), k = `${s}x${l}@${Math.round(dpr)}`, min12 = ios >= 18, min11 = ios >= 16;
  const T = {
    '375x667@2': min12 ? 6000 : min11 ? 3500 : 1500, // 6s / 7 / 8 / SE 2 / SE 3
    '414x736@3': min11 ? 3500 : 1500, // 6s+ / 7+ / 8+
    '320x568@2': 800, // SE (1-е)
    '375x812@3': min12 ? 6500 : 4000, // X / XS / 11 Pro / 12 mini / 13 mini (iOS 16–17 — может быть X на A11)
    '414x896@2': 6000, '414x896@3': 6500, // XR, 11 / XS Max, 11 Pro Max
    '390x844@3': 8500, '428x926@3': 8800, // 12, 13, 14 / 12 Pro Max, 13 Pro Max, 14 Plus
    '393x852@3': 11000, '430x932@3': 11000, // 14 Pro, 15, 15 Pro, 16 / 14 Pro Max, 15 Plus, 15 Pro Max, 16 Plus
    '402x874@3': 13000, '440x956@3': 13000, '420x912@3': 12000, // 16 Pro, 17 / 16 Pro Max, 17 Pro Max / Air
  };
  if (T[k] !== undefined) return T[k];
  // iPad (в точках): 768×1024 — старые (A9–A12), 810×1080 — iPad 9 (A13), 820×1180 — iPad 10 / Air 4–5 (A14 / M1), 744×1133 — mini 6–7 (A15+),
  // 834×1112 — Air 3 / Pro 10,5 (A12 / A10X), 834×1194 и 1024×1366 — Pro (M1 и новее; старые 12,9 — A9X–A12X, всё равно не слабые)
  const P = { '768x1024': 3500, '810x1080': 6000, '820x1180': 9000, '744x1133': 9000, '834x1112': 5000, '834x1194': 15000, '1024x1366': ios >= 17 ? 15000 : 8000, '834x1210': 15000, '1032x1376': 15000 };
  if (P[`${s}x${l}`] !== undefined) return P[`${s}x${l}`];
  if (s >= 700) return 8000; // другой iPad
  return min12 ? 8000 : 6000; // неизвестный iPhone
}

export function detectGpu() {
  const out = { name: '', score: null };
  if (typeof document === 'undefined' || !document.createElement) return out;
  try {
    const c = document.createElement('canvas'), g = c.getContext('webgl'); if (!g) return out;
    const e = g.getExtension('WEBGL_debug_renderer_info');
    out.name = String((e ? g.getParameter(e.UNMASKED_RENDERER_WEBGL) : g.getParameter(g.RENDERER)) || '').trim();
    const l = g.getExtension('WEBGL_lose_context'); if (l) l.loseContext();
  } catch (_) { return out; }
  out.score = gpuScore(out.name);
  return out;
}

// баллы по имени (и экрану — для Apple); null — не знаем
export function gpuScore(name, scr = typeof screen !== 'undefined' ? screen : null, dpr = typeof devicePixelRatio !== 'undefined' ? devicePixelRatio : 1, ua = typeof navigator !== 'undefined' ? navigator.userAgent : '') {
  const n = String(name || '');
  if (/Apple/i.test(n)) {
    if (/M\d/.test(n)) return 15000; // Mac / iPad на M-чипе (в имени бывает «Apple M1»)
    const ios = +((ua.match(/OS (\d+)_/) || [])[1] || 0);
    return scr ? appleScore(scr.width, scr.height, dpr, ios) : 8000;
  }
  let m = n.match(/Adreno[^\d]*(\d{3})/i);
  if (m) { // неизвестный номер — ближайший меньший в той же серии; меньших нет — младший в серии с запасом вниз
    const v = +m[1]; if (ADRENO[v] !== undefined) return ADRENO[v];
    const ser = Object.keys(ADRENO).map(Number).filter((x) => Math.floor(x / 100) === Math.floor(v / 100)), lo = ser.filter((x) => x <= v);
    return lo.length ? ADRENO[Math.max(...lo)] : ser.length ? Math.round(ADRENO[Math.min(...ser)] * 0.6) : 400;
  }
  m = n.match(/(?:Mali|Immortalis)-?G(\d{2,3})/i);
  if (m) { const v = +m[1], cores = +((n.match(/M[CP](\d+)/i) || [])[1] || 0), t = MALI[v] || (v >= 100 ? [v >= 700 ? 1000 : 700, 6] : [300, 4]); return Math.round(t[0] * (cores || t[1])); }
  for (const [re, s] of OTHER) if (re.test(n)) return s;
  return null;
}

// ступень «Обычной» чёткости по баллам: pixelRatio для пресетов (ниже нынешнего не опускаем — Mark: не мылить)
export function sharpFor(score) {
  if (score === null || score === undefined) return { low: 1.25, medium: 1.5, high: 1.5, ultra: 1.5 }; // неизвестный — средняя ступень
  if (score < 2000) return { low: 1.25, medium: 1.25, high: 1.5, ultra: 1.5 }; // как было
  if (score < 4500) return { low: 1.25, medium: 1.5, high: 1.5, ultra: 1.5 };
  if (score < 9000) return { low: 1.5, medium: 1.75, high: 1.75, ultra: 1.75 };
  return { low: 1.5, medium: 2, high: 2, ultra: 2 };
}
