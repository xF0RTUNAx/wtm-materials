// Справочник для поиска звуков (Mark 2026-10-21): вся техника и оружие игры из кода + что сейчас звучит (запись / синтез) и что искать.
//   deno run -A tools/airdef-sounds/catalog.js   → tools/airdef-sounds/catalog.html (открыть через сервер :8937, с телефона тоже)
const dir = new URL('.', import.meta.url).pathname;
(0, eval)(Deno.readTextFileSync(dir + '../drone-headless/three.min.js'));
const { AG, SAM, PLANES, LOADOUTS, CARRIERS, ERAS, SAM_TYPE, AG_KIND } = await import('../../games/airdef/arsenal.js');
const { LNCH } = await import('../../games/airdef/launchers.js');
const LN = LNCH || {};
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
const eraName = (e) => (ERAS.find((x) => x.id === e) || {}).name || e;
const side = (s) => (s === 'east' ? 'Восток' : s === 'west' ? 'Запад' : s);
const REC = '<b class="rec">запись</b>', SYN = '<b class="syn">синтез</b>', NO = '<b class="no">нет</b>';

// ── самолёты и вертолёты: из подвесок (кто на чём летает) ──
const planes = new Map();
for (const [era, list] of Object.entries(LOADOUTS)) for (const L of list) {
  const k = L.plane; if (!k) continue; const p = planes.get(k) || { k, name: PLANES[k] || k, side: L.side, heli: !!L.heli, eras: new Set(), items: new Set() };
  p.eras.add(+era); for (const [w] of L.items) p.items.add(w); planes.set(k, p);
}
for (const [k, c] of Object.entries(CARRIERS || {})) if (!planes.has(k)) planes.set(k, { k, name: c.name || PLANES[k] || k, side: c.side, heli: false, eras: new Set(), items: new Set(), carrier: true });
const pl = [...planes.values()].sort((a, b) => (a.heli - b.heli) || a.side.localeCompare(b.side) || Math.min(...a.eras, 9) - Math.min(...b.eras, 9));
const planeRow = (p) => `<tr><td>${esc(p.name)}</td><td>${side(p.side)}</td><td>${[...p.eras].sort().map(eraName).join(', ') || (p.carrier ? 'носитель «Мульти-волны»' : '')}</td><td>${[...p.items].map((w) => esc(AG[w] ? AG[w].short || AG[w].name : w)).join(', ')}</td></tr>`;

// ── оружие ──
const kinds = {};
for (const [k, W] of Object.entries(AG)) { (kinds[W.kind] = kinds[W.kind] || []).push([k, W]); }
const KIND_SND = {
  bomb: ['сброс — щелчок замка ' + SYN, 'свист падения ' + SYN, 'взрыв ' + SYN + ' + далёкий ' + REC],
  lgb: ['как бомба'], tvb: ['как бомба'], gps: ['как бомба'],
  agm: ['пуск с самолёта ' + REC + ' (launch_air)', 'полёт ' + SYN, 'взрыв ' + SYN],
  arm: ['пуск ' + REC + ' (launch_air)', 'полёт ' + SYN], rocket: ['залп НАР ' + SYN + ' — <i>нужна запись залпа</i>', 'полёт ' + SYN],
  cruise: ['пуск с носителя ' + SYN, 'полёт — турбовентилятор ' + REC + ' (как самолёт)'], tbm: ['старт ' + REC + ' («Искандер»)', 'полёт ' + REC + ' + спуск ' + SYN, 'взрыв ' + REC],
  decoy: ['полёт ' + SYN], ecm: ['—'],
};
const wRow = ([k, W]) => `<tr><td>${esc(W.name)}</td><td>${side(W.side)}</td><td>${eraName(W.era)}</td><td>${esc((AG_KIND[W.kind] || W.kind).split(',')[0])}</td></tr>`;

// ── ПВО ──
const MODE = { cold: 'вертикальный «холодный» (выброс, потом двигатель)', vhot: 'вертикальный «горячий»', box: 'из контейнера, «горячий»', rail: 'с направляющей, «горячий»', tube: 'из трубы (ПЗРК-тип)', gun: 'пушки' };
const SND_SAM = (k, S) => {
  const m = LN[k] && LN[k].mode;
  if (m === 'gun') return k === 'phalanx' || k === 'm163' ? 'очередь ' + REC + ' (Phalanx)' : 'очередь ' + SYN + ' (по темпу стрельбы)';
  if (m === 'cold') return 'старт ' + REC + ' (3 записи вертикального старта)';
  if (['patriot', 'pac3', 'nasams', 'hawk', 'khordad'].includes(k)) return 'старт ' + REC + ' (Patriot)';
  if (S.type === 'ir' && !m) return 'пуск ПЗРК ' + SYN;
  return 'старт ' + SYN;
};
const sams = Object.entries(SAM).sort((a, b) => a[1].side.localeCompare(b[1].side) || a[1].era - b[1].era);
const samRow = ([k, S]) => `<tr><td>${esc(S.name)}</td><td>${side(S.side)}</td><td>${eraName(S.era)}</td><td>${esc(SAM_TYPE[S.type] || S.type)}</td><td>${esc(MODE[(LN[k] || {}).mode] || (S.type === 'ir' ? 'ПЗРК, с плеча' : '—'))}</td><td>${SND_SAM(k, S)}</td></tr>`;

// ── звуковые события ──
const EV = [
  ['Свой самолёт', 'двигатель (рёв, гул, вой турбины), форсаж — включение, обтекание, тряска, у земли', SYN, 'рёв реактивного вблизи (из кабины / сзади), включение форсажа'],
  ['Свой самолёт', 'пушка (ГШ-30, M61, GAU-8)', SYN, 'очереди авиапушек'],
  ['Свой самолёт', 'винты Ту-95', SYN + ' (голос ИИ — ' + REC + ')', '—'],
  ['Свой вертолёт', 'несущий винт', REC + ' (UH-1, две петли)', 'Ми-8 / Ми-24 / Ка-52 вблизи — висение и крейсер'],
  ['Свой вертолёт', 'турбины, запуск двигателей', SYN, 'запуск турбин и раскрутка винта'],
  ['Свой вертолёт', 'пушка (ГШ-23, 2А42, M230)', NO, 'очереди вертолётных пушек'],
  ['Кабина', 'СПО: облучение, захват, пуск', SYN, '<b>захват цели, сигналы СПО</b> (тона RWR)'],
  ['Кабина', 'захват ГСН (рычание ИК-ГСН), лазер, датчик пуска', SYN, 'тон захвата ГСН, предупреждение о пуске ракеты'],
  ['Кабина', 'щелчки, отказ, «нужна помощь», подсказки', SYN, 'щелчки тумблеров, голос «внимание, ракета» (без слов или по-русски)'],
  ['Кабина', 'ловушки и диполи — отстрел', SYN, 'отстрел ЛТЦ / диполей (хлопки)'],
  ['Кабина', 'попадание в самолёт', SYN, 'удар осколков по обшивке'],
  ['ИИ-самолёты', 'пролёт рядом: подлёт / уход / пролёт < 300 м', REC, 'пролёт строя, турбовинтовой, бомбардировщик вдали'],
  ['ИИ-вертолёты', 'винт вблизи и вдали', REC, '—'],
  ['Ракеты', 'полёт ракеты мимо (свист, рёв)', SYN, 'пролёт ракеты мимо, свист'],
  ['Ракеты', 'пуск ЗУР «горячий» (С-75, С-125, «Куб», «Оса», «Бук», «Тор», «Панцирь», Roland, Rapier…)', SYN + ' (Patriot-подобные — ' + REC + ')', '<b>пуски ЗУР по системам</b>'],
  ['Ракеты', 'пуск ПЗРК (Стрела, Игла, Верба, Stinger, Redeye)', SYN, '<b>пуск ПЗРК</b>: хлопок вышибного, рёв маршевого'],
  ['Ракеты', 'пуск ПТУР с вертолёта («Штурм», «Атака», Hellfire)', REC + ' (launch_air)', 'пуск ПТУР'],
  ['Ракеты', 'залп НАР', SYN, 'залп С-8 / Hydra (есть ссылка hijongpark 699823 — не скачан)'],
  ['Ракеты', 'старт и полёт крылатой ракеты, запуск с носителя', SYN, 'старт крылатой ракеты, её пролёт (турбовентилятор)'],
  ['Взрывы', 'на земле (по калибру), бомба, тяжёлая БЧ', SYN + ' + далёкий ' + REC, 'взрывы разного калибра вблизи (ФАБ-250 / 500 / 1000)'],
  ['Взрывы', 'подрыв ЗУР в воздухе, сбитие', REC + ' (перехват, далёкий взрыв)', 'подрыв БЧ вблизи'],
  ['Взрывы', 'баллистика вблизи', REC + ' («Искандер»)', '—'],
  ['Взрывы', 'гибель самолёта, обломки, падение', SYN, 'взрыв самолёта в воздухе, падение обломков'],
  ['ПВО', 'очередь зениток (ЗУ-23, «Шилка», Gepard, Skyguard, «Тунгуска», «Панцирь»)', SYN + ' (Phalanx, Vulcan — ' + REC + ')', 'очереди 23 / 30 / 35 мм вдали и вблизи'],
  ['ПВО', 'сирена воздушной тревоги', REC, '—'],
  ['ПВО', 'пульт оператора (переключатели, РЛС)', SYN, 'звуки кабины оператора ЗРК'],
  ['Дроны', 'мотор «Шахеда»', REC, '—'],
  ['Фон', 'меню: ветер, гул города, пролёты, раскаты, птицы, вертолёт вдали', SYN + ' + ' + REC, 'далёкий гул города, ветер'],
  ['Фон', '«Туманная топь»: вороны', REC, 'колокол, сова, лягушки, волки, ветер в лесу (ссылки — в журнале)'],
  ['Сверхзвук', 'удар звукового барьера', SYN, 'хлопок пролёта на сверхзвуке'],
];
const evRow = ([g, w, now, find]) => `<tr><td>${g}</td><td>${esc(w)}</td><td>${now}</td><td>${find}</td></tr>`;

const html = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Техника и звуки — справочник</title>
<style>body{margin:0;background:#10140f;color:#e9e6dc;font:14px/1.45 -apple-system,'Segoe UI',sans-serif}.w{max-width:1100px;margin:0 auto;padding:16px}
h1{font-size:22px;margin:6px 0}h2{font-size:17px;margin:26px 0 6px;color:#e8b04a}p{color:#a9b19c;margin:4px 0 10px}
table{width:100%;border-collapse:collapse;font-size:13px}td,th{border-bottom:1px solid #2a3125;padding:5px 6px;text-align:left;vertical-align:top}th{color:#a9b19c;font-weight:600}
.rec{color:#7bd88f;font-weight:600}.syn{color:#e8b04a;font-weight:600}.no{color:#ff8a7a;font-weight:600}.sc{overflow-x:auto}</style></head><body><div class="w">
<h1>Техника, оружие и звуки «Воздушного превосходства»</h1>
<p>Собрано из кода игры (${new Date().toISOString().slice(0, 10)}). <span class="rec">запись</span> — уже звучит настоящая запись, <span class="syn">синтез</span> — звук собран программно (стоит поискать запись), <span class="no">нет</span> — звука нет. Жирным в последнем столбце — что найти в первую очередь.</p>
<h2>Звуковые события — что звучит и что искать</h2><div class="sc"><table><tr><th>Группа</th><th>Событие</th><th>Сейчас</th><th>Что искать</th></tr>${EV.map(evRow).join('')}</table></div>
<h2>Комплексы ПВО (${sams.length})</h2><p>Способ старта важен для звука: вертикальный «холодный» — хлопок выброса, потом двигатель; «горячий» с направляющей — сразу рёв у пусковой; ПЗРК — хлопок и рёв маршевого.</p>
<div class="sc"><table><tr><th>Комплекс</th><th>Сторона</th><th>Эпоха</th><th>Наведение</th><th>Старт</th><th>Звук сейчас</th></tr>${sams.map(samRow).join('')}</table></div>
<h2>Самолёты и вертолёты (${pl.length})</h2><div class="sc"><table><tr><th>Машина</th><th>Сторона</th><th>Эпохи</th><th>Оружие</th></tr>${pl.map(planeRow).join('')}</table></div>
${Object.entries(kinds).map(([k, L]) => `<h2>${esc((AG_KIND[k] || k).split(',')[0])} — ${L.length}</h2><p>${(KIND_SND[k] || []).join(' · ')}</p><div class="sc"><table><tr><th>Оружие</th><th>Сторона</th><th>Эпоха</th><th>Вид</th></tr>${L.sort((a, b) => a[1].side.localeCompare(b[1].side) || a[1].era - b[1].era).map(wRow).join('')}</table></div>`).join('')}
</div></body></html>`;
Deno.writeTextFileSync(dir + 'catalog.html', html);
console.log('ok', pl.length, 'машин,', Object.keys(AG).length, 'оружия,', sams.length, 'ПВО');
