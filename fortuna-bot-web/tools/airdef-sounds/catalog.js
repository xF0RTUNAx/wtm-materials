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
const planeRow = (p) => `<tr><td>${esc(p.name)}</td><td>${side(p.side)}</td><td>${[...p.eras].sort().map(eraName).join(', ') || (p.carrier ? 'носитель «Мульти-волны»' : '')}</td><td>${[...p.items].map((w) => esc(AG[w] ? AG[w].short || AG[w].name : w)).join(', ')}</td><td class="q">${esc(p.name)} ${p.heli ? 'helicopter flyby sound' : 'flyby sound · engine'}</td><td class="q">${esc(p.name)} ${p.heli ? 'вертолёт звук' : 'пролёт звук · звук двигателя'}</td></tr>`;

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
const NATO = { s75: 'SA-2 Guideline', s125: 'SA-3 Goa', kub: 'SA-6 Gainful', osa: 'SA-8 Gecko', strela1: 'SA-9 Gaskin', strela10: 'SA-13 Gopher', buk: 'SA-11 Gadfly', bukm3: 'SA-17 / Buk-M3', tor: 'SA-15 Gauntlet', torm2: 'SA-15 Tor-M2', s300: 'SA-10 Grumble', s400: 'SA-21 Growler', pantsir: 'SA-22 Greyhound', tunguska: 'SA-19 Grison', strela2: 'SA-7 Grail', strela3: 'SA-14 Gremlin', igla: 'SA-16 Gimlet', iglas: 'SA-24 Grinch', verba: 'SA-25 Verba', zsu234: 'ZSU-23-4 Shilka', zu23: 'ZU-23-2' };
const enName = (k, S) => NATO[k] || S.short || S.name;
const samQ = (k, S) => { const g = (LN[k] || {}).mode === 'gun'; const en = enName(k, S);
  return [g ? `${en} firing sound` : `${en} launch sound`, g ? `${S.short || S.name} стрельба звук` : `пуск ${S.short || S.name} звук`]; };
const samRow = ([k, S]) => `<tr><td>${esc(S.name)}</td><td>${side(S.side)}</td><td>${eraName(S.era)}</td><td>${esc(SAM_TYPE[S.type] || S.type)}</td><td>${esc(MODE[(LN[k] || {}).mode] || (S.type === 'ir' ? 'ПЗРК, с плеча' : '—'))}</td><td>${SND_SAM(k, S)}</td><td class="q">${esc(samQ(k, S)[0])}</td><td class="q">${esc(samQ(k, S)[1])}</td></tr>`;

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
// запросы для поиска: [английский, русский] — по ключевому слову события
const Q = [
  ['двигатель (рёв', 'fighter jet engine close sound · afterburner ignition · jet engine spool up cockpit', 'рёв реактивного двигателя звук · включение форсажа звук · двигатель истребителя вблизи'],
  ['пушка (ГШ-30', 'M61 Vulcan cannon sound · GAU-8 brrrt · GSh-30 cannon firing', 'стрельба авиапушки звук · ГШ-30 стрельба · пушка Су-25 звук'],
  ['винты Ту-95', 'Tu-95 Bear flyby sound · contra-rotating propeller drone', 'Ту-95 пролёт звук · гул соосных винтов'],
  ['несущий винт', 'Mi-8 helicopter hover sound · Mi-24 Hind flyby · helicopter blade slap close', 'звук вертолёта Ми-8 · Ми-24 пролёт звук · вертолёт висение звук'],
  ['турбины, запуск', 'helicopter turbine startup · Mi-8 engine start · UH-1 startup', 'запуск двигателей вертолёта звук · Ми-8 запуск'],
  ['пушка (ГШ-23', 'M230 chain gun Apache firing · 2A42 30mm cannon sound · GSh-23 firing', 'стрельба 2А42 звук · пушка Ми-28 стрельба · ГШ-23 очередь'],
  ['СПО: облучение', 'RWR radar warning receiver sound · missile lock warning tone · F-16 RWR', 'звук СПО · сигнал облучения РЛС · предупреждение о захвате'],
  ['захват ГСН', 'Sidewinder growl tone · IR seeker lock tone · missile launch warning', 'рычание ГСН · захват ГСН звук · Р-73 захват'],
  ['щелчки, отказ', 'cockpit switch click · toggle switch aircraft · master caution beep', 'щелчок тумблера звук · звуки кабины самолёта'],
  ['ловушки и диполи', 'flare dispense sound · countermeasures flares · chaff release', 'отстрел ловушек звук · тепловые ловушки'],
  ['попадание в самолёт', 'shrapnel hitting metal · bullet impact aircraft', 'попадание осколков по металлу звук'],
  ['пролёт рядом', 'jet flyby low pass · formation flyby · bomber flyby distant', 'пролёт самолёта звук · пролёт на малой высоте'],
  ['винт вблизи и вдали', 'military helicopter flyby distant', 'пролёт вертолёта вдали'],
  ['полёт ракеты мимо', 'missile flyby whoosh · rocket passing by', 'пролёт ракеты звук · свист ракеты'],
  ['пуск ЗУР «горячий»', 'SAM launch sound · surface to air missile launch close · SA-6 launch · Buk launch', 'пуск зенитной ракеты звук · пуск ЗУР · старт «Бука» звук'],
  ['пуск ПЗРК', 'MANPADS launch sound · Stinger missile launch · Igla launch close', 'пуск ПЗРК звук · пуск «Иглы» · выстрел Stinger'],
  ['пуск ПТУР', 'Hellfire launch sound · ATGM launch helicopter · Ataka missile launch', 'пуск ПТУР звук · пуск «Атаки» с вертолёта · пуск «Штурма»'],
  ['залп НАР', 'rocket pod salvo sound · Hydra 70 launch · S-8 rockets salvo', 'залп НАР звук · пуск С-8 с вертолёта · залп неуправляемых ракет'],
  ['крылатой ракеты', 'cruise missile launch · Tomahawk launch · cruise missile flyby', 'пуск крылатой ракеты звук · пролёт крылатой ракеты'],
  ['на земле (по калибру)', 'bomb explosion close · 500 lb bomb explosion · artillery explosion near', 'взрыв авиабомбы звук · взрыв ФАБ-500 · близкий взрыв'],
  ['подрыв ЗУР в воздухе', 'missile interception explosion · air burst explosion · flak burst', 'перехват ракеты взрыв звук · взрыв в воздухе'],
  ['баллистика вблизи', 'ballistic missile impact · Iskander impact', 'попадание баллистической ракеты · взрыв «Искандера»'],
  ['гибель самолёта', 'aircraft explosion midair · plane crash debris', 'взрыв самолёта в воздухе звук · падение самолёта'],
  ['очередь зениток', 'ZU-23-2 firing · Shilka firing · Gepard 35mm firing · anti-aircraft gun distant', 'стрельба ЗУ-23-2 · «Шилка» стрельба · зенитка очередь'],
  ['сирена', 'air raid siren', 'сирена воздушной тревоги'],
  ['пульт оператора', 'radar control room · military console beeps', 'пульт оператора звуки · звук РЛС'],
  ['мотор «Шахеда»', 'Shahed drone sound · Geran drone engine', 'звук «Шахеда» · мопед дрон звук'],
  ['меню: ветер', 'distant city ambience · wind ambience · distant explosions', 'фоновый шум города · ветер звук'],
  ['«Туманная топь»', 'church bell distant · owl night · frogs swamp night · wolves howl distant · wind forest night', 'колокол вдали · сова ночью · лягушки на болоте · вой волков вдали'],
  ['звукового барьера', 'sonic boom · supersonic flyby', 'звуковой удар · преодоление звукового барьера'],
];
const qOf = (w) => Q.find(([k]) => w.includes(k)) || ['', '', ''];
const evRow = ([g, w, now, find]) => { const [, en, ru] = qOf(w); return `<tr><td>${g}</td><td>${esc(w)}</td><td>${now}</td><td>${find}</td><td class="q">${esc(en)}</td><td class="q">${esc(ru)}</td></tr>`; };

const html = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Техника и звуки — справочник</title>
<style>body{margin:0;background:#10140f;color:#e9e6dc;font:14px/1.45 -apple-system,'Segoe UI',sans-serif}.w{max-width:1100px;margin:0 auto;padding:16px}
h1{font-size:22px;margin:6px 0}h2{font-size:17px;margin:26px 0 6px;color:#e8b04a}p{color:#a9b19c;margin:4px 0 10px}
table{width:100%;border-collapse:collapse;font-size:13px}td,th{border-bottom:1px solid #2a3125;padding:5px 6px;text-align:left;vertical-align:top}th{color:#a9b19c;font-weight:600}
.rec{color:#7bd88f;font-weight:600}.syn{color:#e8b04a;font-weight:600}.no{color:#ff8a7a;font-weight:600}.sc{overflow-x:auto}td.q{color:#c9d7ff;font-size:12px}</style></head><body><div class="w">
<h1>Техника, оружие и звуки «Воздушного превосходства»</h1>
<p>Собрано из кода игры (${new Date().toISOString().slice(0, 10)}). <span class="rec">запись</span> — уже звучит настоящая запись, <span class="syn">синтез</span> — звук собран программно (стоит поискать запись), <span class="no">нет</span> — звука нет. Жирным в столбце «Что искать» — что найти в первую очередь. Запросы: на YouTube и Freesound лучше работает английский (для советской техники — натовское обозначение, например SA-6), в ВК и на русском YouTube — русский. Хорошо помогают слова: <i>sound effect, no music, close, distant, raw audio, field recording</i> / <i>звук, без музыки, вблизи, вдали, оригинальный звук</i>.</p>
<h2>Звуковые события — что звучит и что искать</h2><div class="sc"><table><tr><th>Группа</th><th>Событие</th><th>Сейчас</th><th>Что искать</th><th>Искать по-английски</th><th>Искать по-русски</th></tr>${EV.map(evRow).join('')}</table></div>
<h2>Комплексы ПВО (${sams.length})</h2><p>Способ старта важен для звука: вертикальный «холодный» — хлопок выброса, потом двигатель; «горячий» с направляющей — сразу рёв у пусковой; ПЗРК — хлопок и рёв маршевого.</p>
<div class="sc"><table><tr><th>Комплекс</th><th>Сторона</th><th>Эпоха</th><th>Наведение</th><th>Старт</th><th>Звук сейчас</th><th>Искать по-английски</th><th>Искать по-русски</th></tr>${sams.map(samRow).join('')}</table></div>
<h2>Самолёты и вертолёты (${pl.length})</h2><div class="sc"><table><tr><th>Машина</th><th>Сторона</th><th>Эпохи</th><th>Оружие</th><th>Искать по-английски</th><th>Искать по-русски</th></tr>${pl.map(planeRow).join('')}</table></div>
${Object.entries(kinds).map(([k, L]) => `<h2>${esc((AG_KIND[k] || k).split(',')[0])} — ${L.length}</h2><p>${(KIND_SND[k] || []).join(' · ')}</p><div class="sc"><table><tr><th>Оружие</th><th>Сторона</th><th>Эпоха</th><th>Вид</th></tr>${L.sort((a, b) => a[1].side.localeCompare(b[1].side) || a[1].era - b[1].era).map(wRow).join('')}</table></div>`).join('')}
</div></body></html>`;
Deno.writeTextFileSync(dir + 'catalog.html', html);
console.log('ok', pl.length, 'машин,', Object.keys(AG).length, 'оружия,', sams.length, 'ПВО');
