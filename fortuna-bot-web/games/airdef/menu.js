// Главное меню (карточка в стиле «Симулятора Летки»): режимы, вкладки «Бой», «Арсенал», «Руководство», «Настройки»,
// рекорды и советы. Фон за карточкой — живой бой (director.js).
import { CITY } from './city.js?v=20261012d';
import { AG, SAM, ERAS, LOADOUTS, DEFENSE, SAM_TYPE, AG_KIND, SAM_COST, PLANES, loadoutsOf } from './arsenal.js?v=20261012d';
import { MODES } from './sim/strike.js?v=20261012d';
import { WEATHERS } from '../drone/world.js?v=20261012d';
import { LESSONS } from './training.js?v=20261012d';
import { MODEL_CREDITS } from './models.js?v=20261012d';
import { openLayoutEditor } from './layout.js?v=20261012d';
import { orientGate } from '../orient-warn.js?v=20261011a';

const GAMES = [
  { k: 'air', name: 'Вылет', desc: 'за самолёт: прорвать ПВО и уничтожить цели' },
  { k: 'defense', name: 'Оборона', desc: 'за ПВО: отразить волны налётов на город' },
  { k: 'training', name: 'Обучение', desc: 'по шагам, с объяснениями, проиграть нельзя' },
  { k: 'online', name: 'Онлайн', desc: 'люди против людей: авиация против ПВО' },
];
const TIPS = [
  'Здания закрывают РЛС обзор: на малой высоте между домами комплекс видит вас урывками и не успевает выстрелить.',
  'Лазерную бомбу нужно подсвечивать до попадания. Отвернули так, что контейнер закрыло корпусом, — бомба упадёт мимо.',
  'Shrike летит только на включённую РЛС. HARM и Х-58 помнят место станции — спасёт лишь переезд.',
  'Против полуактивной ракеты («Куб», Hawk) — «траверз»: поставьте РЛС на 3 или 9 часов и снижайтесь, когерентная станция потеряет вас в доплеровском провале.',
  'Диполи хорошо работают против старых РЛС (С-75), а против когерентных — только если идти поперёк луча.',
  'ПЗРК на крышах не видны на СПО: о них предупредит только датчик пуска. Отстреливайте ловушки сразу.',
  'В обороне смотрите на «тени» зон: здание рядом с комплексом может закрыть целый сектор на малой высоте.',
  'Оператору командного ЗРК: «три точки» надёжнее по манёвренной цели, «половинное спрямление» экономит энергию ракеты по быстрой цели, идущей поперёк.',
  'Опытный расчёт выключает РЛС при пуске противорадиолокационной ракеты. В обороне это делаете вы — кнопка «РЛС».',
  'ТВ-головки ночью не видят: в вечерних и ночных вылетах берите лазерные бомбы или ПРР.',
  'Засада: комплекс с выключенной РЛС не виден на СПО и включается, только когда сеть ПВО сообщит о цели рядом.',
  'Пушкам нужно упреждение: ведите ствол в кружок впереди самолёта, а не на сам самолёт.',
];

export function createMenu(C, { PRESETS, WEATHER_KEYS }) {
  const { $, setup, ls, snd } = C;
  const save = () => C.saveSetup();
  let tab = 'play';
  const stats = () => { try { return JSON.parse(ls.get('fortuna_airdef_stats') || '{}') || {}; } catch (_) { return {}; } };
  const seg = (id, cur, items) => `<div class="seg" data-seg="${id}">${items.map(([v, l]) => `<button data-v="${v}" class="${String(v) === String(cur) ? 'on' : ''}">${l}</button>`).join('')}</div>`;
  const tags = (k, t) => `<span class="tag ${k}">${t}</span>`;

  function renderModeSel() {
    $('modeSel').innerHTML = GAMES.map((g) => `<button data-g="${g.k}" class="${setup.game === g.k ? 'on' : ''}"><b>${g.name}</b><span>${g.desc}</span></button>`).join('');
    $('startBtn').textContent = setup.game === 'online' ? C.online.primaryText() : setup.game === 'training' ? 'НАЧАТЬ УРОК' : setup.game === 'defense' ? 'К РАССТАНОВКЕ' : 'ВЗЛЁТ';
  }
  // пройденные уроки по id; записи прежнего обучения («air0»… — по номеру) переносятся на те же уроки нового учебника
  const OLD = { air: ['ctl', 'bomb', 'lgb', 'agm', 'arm', 'evade'], def: ['d_plan', 'd_op', 'd_gun', 'd_ir', 'd_arm', 'd_short'] };
  function lessonsDone() { const l = stats().lessons || {}, out = { ...l }; for (const sd in OLD) OLD[sd].forEach((id, i) => { if (l[sd + i]) out[id] = 1; }); return out; }
  $('modeSel').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; setup.game = b.dataset.g; save(); render(); };
  function renderPlay() {
    const g = setup.game, el = $('tab-play');
    if (g === 'online') { C.online.panel(el); return; } // онлайн — свой раздел (online.js)
    if (g === 'training') {
      const done = lessonsDone(), list = LESSONS[setup.tside];
      // учебник: уроки по разделам («Основы», «Системы», «Бомбы»… / «Оборона», «Комплексы»…), номер — сквозной
      let h = `<div class="prow"><span>Сторона</span>${seg('tside', setup.tside, [['air', 'За самолёт'], ['def', 'За ПВО']])}</div>`, sec = null;
      list.forEach((l, i) => {
        if (l.sec !== sec) { sec = l.sec; const n = list.filter((q) => q.sec === sec).length, k = list.filter((q) => q.sec === sec && done[q.id]).length; h += `<div class="cat-h">${sec} <span class="dim">${k}/${n}</span></div>`; }
        h += `<button class="opt ${i === setup.tl ? 'on' : ''} ${done[l.id] ? 'done' : ''}" data-tl="${i}"><div class="nm"><b>${i + 1}. ${l.name}${done[l.id] ? ' ✓' : ''}</b><span>${l.desc}</span></div></button>`;
      });
      el.innerHTML = h + '<p class="hint">Каждый урок: как это работает в игре и типичные ошибки → показ (самолёт всё делает сам) → вы. Проиграть нельзя: урон отключён, боеприпасы пополняются. Кнопка «?» ставит игру на паузу и объясняет оружие или комплекс.</p>';
      return;
    }
    let h = `<div class="prow"><span>Режим</span>${seg('diff', setup.diff, Object.entries(MODES).map(([k, m]) => [k, m.name]))}</div><p class="hint">${MODES[setup.diff].desc}</p>
      <div class="prow"><span>Эпоха</span>${seg('era', setup.era, ERAS.filter((e) => LOADOUTS[e.id]).map((e) => [e.id, e.name]))}</div>
      <div class="prow"><span>${g === 'defense' ? 'Ваша ПВО' : 'ПВО города'}</span>${seg('side', setup.side, [['east', 'Советская'], ['west', 'Западная']])}</div>`;
    if (g === 'air') {
      h += `<p class="hint">Комплексы: ${DEFENSE[setup.side][setup.era].map(([k]) => SAM[k].short).join(', ')}.</p><div class="cat-h">Подвеска</div>`;
      // подвески стороны, которая атакует выбранную ПВО; у каждой — свой самолёт
      const att = setup.side === 'east' ? 'west' : 'east', mine = loadoutsOf(setup.era, att);
      if (!mine.some(([, i]) => i === setup.lo)) setup.lo = mine[0][1];
      h += mine.map(([L, i]) => `<button class="opt ${i === setup.lo ? 'on' : ''}" data-lo="${i}"><div class="nm"><b>${PLANES[L.plane]} · ${L.name}</b><span>${L.items.map(([k, n]) => `${AG[k].short} ×${n}`).join(' · ')}${L.pod ? ' · контейнер' : ''}</span></div>${L.items.map(([k]) => tags(AG[k].kind, AG_KIND[AG[k].kind].split(',')[0].split(' ')[0])).filter((v, j, a) => a.indexOf(v) === j).join(' ')}</button>`).join('');
      const L = LOADOUTS[setup.era][setup.lo];
      h += `<p class="hint">${L.items.map(([k]) => `<b>${AG[k].short}</b> — ${AG[k].guide}`).join('<br>')}</p>`;
    } else {
      const list = Object.entries(SAM).filter(([, s]) => s.side === setup.side && s.era <= setup.era);
      h += `<div class="cat-h">Комплексы в вашем распоряжении</div>` + list.map(([k, s]) => `<div class="opt"><div class="nm"><b>${s.name}</b><span>${SAM_TYPE[s.type]} · до ${(s.rmax / 1000).toFixed(1)} км, высота до ${(s.hmax / 1000).toFixed(1)} км</span></div><span class="pr">${SAM_COST[k]} очк</span></div>`).join('') +
        `<p class="hint">Перед каждой волной расставьте комплексы на карте за очки обороны, между волнами — докупка, переезд и продажа. Волн — ${C.WAVES}. Потеряно 75 % ценности военных объектов — поражение. В бою можно «сесть» в любой комплекс оператором.</p>`;
    }
    el.innerHTML = h;
  }
  $('tab-play').onclick = (e) => {
    if (setup.game === 'online') { C.online.onClick(e); return; }
    const b = e.target.closest('[data-v]'), lo = e.target.closest('[data-lo]'), tl = e.target.closest('[data-tl]');
    if (b) {
      const id = b.parentNode.dataset.seg, v = b.dataset.v;
      if (id === 'diff') setup.diff = v; else if (id === 'era') { setup.era = +v; setup.lo = 0; } else if (id === 'side') setup.side = v; else if (id === 'tside') { setup.tside = v; setup.tl = 0; }
    } else if (lo) setup.lo = +lo.dataset.lo; else if (tl) setup.tl = +tl.dataset.tl; else return;
    save(); render();
  };
  // ── Арсенал ──
  function specs(s) { return `<table class="tt">${s.specs.map(([a, b]) => `<tr><td>${a}</td><td>${b}</td></tr>`).join('')}</table>`; }
  function renderRef() {
    let h = '<p class="hint">Реальные характеристики — округлённые открытые данные. Дальности в игре уменьшены под размер карты.</p>';
    // самолёты: какие подвески несёт каждый
    const PL = { e_su17: ['Су-17М4', 'СССР · истребитель-бомбардировщик с крылом изменяемой стреловидности: ФАБ, ПРР Х-28 и Х-58, Х-25МЛ.'],
      e_su24: ['Су-24М', 'СССР / Россия · фронтовой бомбардировщик, встроенная лазерно-телевизионная система «Кайра»: КАБ-500Л, Х-58, Х-29Т, Х-31П.'],
      e_su25: ['Су-25', 'СССР / Россия · бронированный штурмовик: ФАБ-500, Х-29Т, Х-25МЛ (у Су-25Т — встроенный «Шквал»).'],
      su30: ['Су-30', 'Россия · двухместный многоцелевой: КАБ-500, УМПК.'],
      mig29: ['МиГ-29СМТ', 'Россия · лёгкий фронтовой: ПРР Х-31П.'],
      e_su34: ['Су-34', 'Россия · фронтовой бомбардировщик, встроенный прицельный комплекс «Платан»: КАБ-500С, УМПК, Х-59МК2, Х-31П.'],
      e_mig31: ['МиГ-31БМ', 'Россия · перехватчик, в модернизации — ПРР Х-31П против ПВО.'],
      e_su57: ['Су-57', 'Россия · малозаметный: оружие во внутренних отсеках (Х-59МК2 создавалась под них), выходит из отсека при пуске.'],
      e_f4: ['F-4 Phantom II', 'США · «Дикая ласка» F-4G — охотник за ПВО: Shrike, HARM.'],
      f18: ['F/A-18 Hornet', 'США · палубный многоцелевой: Mk 82, GBU-12, JDAM, HARM, AARGM.'],
      f16: ['F-16', 'США · лёгкий многоцелевой: Mk 82, Maverick, HARM, JASSM.'],
      e_gripen: ['JAS 39 Gripen', 'Швеция · лёгкий многоцелевой с контейнером LITENING: GBU-12, JDAM.'],
      e_f35: ['F-35A Lightning II', 'США · малозаметный: SDB во внутренних отсеках, встроенная оптико-электронная система EOTS.'] };
    h += `<div class="cat-h">Самолёты</div>` + Object.entries(PL).map(([k, [n, d]]) => `<details class="ref"><summary>${n}</summary><div class="body"><p>${d}</p><p>Подвески: ${Object.entries(LOADOUTS).flatMap(([era, list]) => list.filter((L) => L.plane === k).map((L) => `${L.name} (эп. ${ERAS[era - 1].short})`)).join('; ')}.</p></div></details>`).join('');
    for (const e of ERAS.filter((x) => LOADOUTS[x.id])) {
      h += `<div class="cat-h">Зенитные комплексы · эпоха ${e.short}</div>`;
      for (const [k, s] of Object.entries(SAM)) if (s.era === e.id) h += `<details class="ref"><summary>${tags(s.type, { guns: 'АРТ', ir: 'ИК', sarh: 'ПАРЛ', saclos: 'ЛВ', tvm: 'TVM', arh: 'АРЛ', jammer: 'РЭБ', command: 'РК' }[s.type])} ${s.name}</summary><div class="body">
        <p>${s.guide}</p>${specs(s)}<h4>В игре</h4><p>${SAM_TYPE[s.type]} · ${(s.rmin / 1000).toFixed(1)}–${(s.rmax / 1000).toFixed(1)} км · высоты ${s.hmin}–${s.hmax} м${s.radar ? ` · РЛС видит цель ЭПР 5 м² с ${(s.radar.range / 1000).toFixed(0)} км, захват ${s.radar.acq} с${s.radar.doppler ? ', когерентная — есть доплеровский провал' : ''}` : s.type === 'jammer' ? ` · радиус подавления ${(s.jamR / 1000).toFixed(0)} км` : ' · без РЛС — на СПО не виден'}${s.channels > 1 ? ` · целевых каналов ${s.channels}` : ''}${s.vls ? ' · вертикальный старт' : ''}${s.antiMun ? ' · сбивает бомбы и ракеты' : ''}${s.optTrack ? ' · оптический канал без излучения' : ''} · стоимость в обороне ${SAM_COST[k]}</p></div></details>`;
      h += `<div class="cat-h">Ударное оружие · эпоха ${e.short}</div>`;
      for (const [, w] of Object.entries(AG)) if (w.era === e.id) h += `<details class="ref"><summary>${tags(w.kind, { bomb: 'ФАБ', lgb: 'ЛАЗ', tvb: 'ТВ', arm: 'ПРР', gps: 'GPS', cruise: 'КР', decoy: 'ЛЦ', ecm: 'РЭБ' }[w.kind] || (w.seeker === 'tv' ? 'ТВ' : 'ЛАЗ'))} ${w.name}</summary><div class="body">
        <p>${w.guide}</p>${specs(w)}<h4>В игре</h4><p>${AG_KIND[w.kind]}${w.rmax ? ` · пуск до ≈ ${(w.rmax / 1000).toFixed(0)} км` : ''} · радиус поражения ${w.blast} м</p></div></details>`;
    }
    $('tab-ref').innerHTML = h;
  }
  // ── Руководство ──
  const CH = [
    ['Режимы', `<p><b>Вылет</b> — вы на ударном беспилотнике «Изделие»: три цели в городе, ПВО выбранной стороны и эпохи. Задание выполнено — уходите за границу района.</p>
      <p><b>Оборона</b> — вы командуете ПВО города: расставляете комплексы за очки, отражаете ${'волны'} ИИ-ударников, между волнами докупаете и переставляете. В любой комплекс можно «сесть» оператором.</p>
      <p><b>Обучение</b> — короткие уроки за обе стороны. <b>Аркада</b> мягче (ПВО реагирует медленнее, урон меньше, все угрозы на экране), <b>Реализм</b> — только СПО и датчик пуска, опытные расчёты, очки ×1,5.</p>`],
    ['Город и прямая видимость', `<p>Каждый дом — препятствие для радиоволн, лазера и камеры. РЛС комплекса не видит цель, если между ними здание или холм, а у старых станций ещё и «земля» под низкой целью (С-75 — ниже ~100 м).</p>
      <p>За самолёт это главный приём: низко между домами вас видят урывками. За ПВО — ставьте комплексы на открытых местах и учитывайте «тени» зон на карте.</p>`],
    ['Наведение зенитных ракет', `<p><b>Радиокомандное</b> (С-75, С-125, «Оса»): ракету ведёт РЛС комплекса. Сорвали ей сопровождение (здание, провал, диполи, выключили станцию) — ракета летит вслепую. Методы: «три точки» — ракета на линии «РЛС — цель», надёжно, но догоняет; «половинное спрямление» — ближе к перехвату, экономнее по энергии.</p>
      <p><b>Полуактивное</b> (Hawk, «Куб»): станция подсвечивает цель, ракета идёт на отражение — подсвет нужен до попадания. Когерентные станции теряют цель, идущую «траверзом» низко над землёй.</p>
      <p><b>Тепловое</b> (ПЗРК): ГСН видит тепло, РЛС не нужна, на СПО не видно. Ранние — только вдогон, против ловушек слабы.</p>
      <p><b>Пушки</b> (Vulcan, Gepard, «Панцирь») — смертельны вблизи и низко, нужно упреждение.</p>`],
    ['СПО, излучение и ПРР', `<p>СПО показывает излучающие РЛС: дальше от центра — обзор, ближе и в кружке — захват, мигает — ведут ракету. Датчик пуска ловит факел любой ракеты, в том числе ИК.</p>
      <p>Противорадиолокационная ракета летит на излучение. Shrike и Х-28 без памяти — выключенная станция спасает. HARM и Х-58 помнят место — спасёт только переезд. Засада: комплекс молчит, пока сеть ПВО не сообщит о цели рядом.</p>`],
    ['Эпохи III–IV и РЭБ', `<p><b>Многоканальные комплексы</b> (С-300, С-400, Patriot, «Тор», «Бук-М3») ведут несколько целей сразу и наводят ракеты «через ракету» или ракетами с <b>активной ГСН</b> — после её включения станцию можно выключить, ракета летит сама. Диполи и помехи против них почти бесполезны.</p>
      <p><b>«Тор», «Панцирь», PAC-3</b> сбивают летящее оружие: бомбы, крылатые ракеты, ПРР. «Панцирь» ведёт ракету по оптике — без излучения.</p>
      <p><b>Спутниковое оружие</b> (JDAM, КАБ-500С, SDB, УМПК) летит в координаты в любую погоду; <b>станция подавления навигации</b> уводит его на десятки метров. <b>Крылатые ракеты</b> идут на 70–80 м, огибая дома, — их видят только станции с малой «землёй». <b>Ложные цели</b> для РЛС неотличимы от самолёта. <b>Станция помех</b> на самолёте: РЛС видят его ближе («прожиг») и чаще срывают сопровождение; AARGM находит даже выключенную станцию, если она не уехала.</p>`],
    ['Как стартуют зенитные ракеты', `<p><b>С направляющей</b> (С-75, С-125, Hawk, «Куб», «Бук-М3», «Оса», «Панцирь»): пусковая сначала разворачивается на цель и поднимает ракеты — пока она не навелась, пуска нет. Двигатель запускается сразу, у пусковой — вспышка и облако пыли и дыма.</p>
      <p><b>Отделяемый ускоритель</b>: у С-75 и С-125 толстая стартовая ступень с большим оперением отваливается через 3–4 с, дальше летит маршевая ступень с тонким следом. У «Панциря» ускоритель разгоняет ракету за 2,4 с, потом она летит без двигателя.</p>
      <p><b>«Холодный» вертикальный старт</b> (С-300, С-400, «Тор»): газогенератор выбрасывает ракету из контейнера на 20–30 м, двигатель запускается уже в воздухе, газовые рули доворачивают её на цель. Пусковой не нужно разворачиваться. «Тор» сначала склоняет ракету в сторону цели и только потом запускает двигатель.</p>
      <p><b>Наклонные контейнеры</b> (Patriot, NASAMS): пусковая поворачивается только по азимуту, ракета первые полсекунды идёт по оси контейнера.</p>
      <p><b>ПЗРК</b>: стартовый двигатель выталкивает ракету из трубы, маршевый включается в 5–8 м от стрелка, чтобы не обжечь его.</p>`],
    ['Камеры', `<p><b>В вылете</b> V перебирает камеры: за самолётом, облёт, из кабины, за оружием (N — сразу она). Камера за оружием летит за вашей бомбой или ракетой до разрыва и 3 с смотрит на попадание. Если своего оружия в воздухе нет, она летит за ракетой ПВО, которая идёт в вас.</p>
      <p><b>Оператор ЗРК</b>: V или «КАМ.» — вид оператора, снаружи (машина от третьего лица, видно разворот пусковой и старт) и за ракетой (после старта камера летит за своей ракетой до подрыва). Снаружи тянуть по экрану — облёт, колесо — ближе или дальше.</p>`],
    ['Ударное оружие', `<p><b>Свободнопадающие</b> — кружок точки падения (CCIP) на экране, сбрасывать, когда он на цели. <b>Лазерные</b> — контейнер захватывает цель сам (1–18 км, самолёт не ниже 400 м, цель не закрыта домами; «ЦЕЛЬ» — другая цель), сбросьте «В ЗОНЕ», держите подсвет до попадания (корпус и здания его срывают). <b>ТВ</b> — захват до пуска, дальше сами; ночью не работают. <b>ПРР</b> — по включённой РЛС впереди.</p>`],
    ['Оборона волнами', `<p>Очки обороны тратятся на комплексы; за сбитых и уцелевшие объекты начисляются новые. Ценность — сумма уцелевших военных объектов (узел связи, командный пункт, склады, аэродром, база, парк техники); ниже 40 % — поражение. Командир видит то, что видит сеть РЛС; кнопки комплекса: «Управлять», «РЛС вкл/выкл», «Огонь: свободный / по команде».</p>
      <p>Оператор: тап по отметке на круговом обзоре — назначить цель, захват занимает реальное время станции, затем «ПУСК». Пушки — ведите прицел в кружок упреждения и держите «ОГОНЬ». ПЗРК — наведите перекрестие на самолёт, дождитесь тона захвата.</p>`],
    ['Топливо и ловушки', `<p>Топлива — примерно на 4 минуты полного газа в «Реализме» (в «Аркаде» — больше), форсаж расходует втрое быстрее. Кончилось — двигатель встаёт и самолёт планирует. Ловушки — одной кнопкой: пачка ЛТЦ и диполей разом. Пачек: «Аркада» — 360, «Реализм» — 240.</p>`],
    ['Управление', `<p><b>Самолёт (ПК):</b> стрелки — тангаж и крен, W/S — газ ступенями (после 100 % — форсаж), Shift — форсаж вкл/выкл, Пробел — сброс, Q — оружие, R — следующая цель контейнера, G — окно контейнера, Z — увеличение, O — лазер, X — ловушки, M — карта, V — камера, N — камера за оружием.</p>
      <p><b>Самолёт (телефон):</b> ведите пальцем по экрану — камера поворачивается, самолёт сам летит туда, куда она смотрит (белый кружок); крестовина — точные крен и тангаж (в настройках можно вернуть ручку); справа кнопки; «ГАЗ» — тап меняет ступень (40 / 60 / 80 / 100 % / ФОРСАЖ); «ЛОВУШКИ» — ЛТЦ и диполи разом; «ЦЕЛЬ» — следующая цель контейнера. Панель слева: тап по оружию — выбор, «ТВ» — окно контейнера.</p>
      <p><b>Контейнер</b> на всех устройствах ищет и захватывает цель сам: ближайшую впереди цель задания (потом — замеченные комплексы ПВО). Захват — через секунду, если до цели 1–18 км, самолёт не ниже 400 м над землёй, а цель не закрыта домами и корпусом.</p>
      <p><b>Оператор ЗРК:</b> тянуть по экрану — поворот, колесо/щипок — увеличение, Пробел — пуск или огонь, E — РЛС, Tab — следующая цель, M — метод, V — камера (оператор / снаружи / за ракетой), Esc — на карту.</p>`],
  ];
  function renderGuide() { $('tab-guide').innerHTML = CH.map(([t, b], i) => `<details class="ref"${i === 0 ? ' open' : ''}><summary>${t}</summary><div class="body">${b}</div></details>`).join(''); }
  // ── Настройки ──
  // «Кастомный»: свои настройки (C.GO → localStorage, применяются перезапуском)
  function customPanel() {
    const o = C.GO, row = (label, key, items, cur) => `<div class="prow"><span>${label}</span><div class="seg" data-go="${key}">${items.map(([v, l]) => `<button data-v="${v}" class="${String(v) === String(cur) ? 'on' : ''}">${l}</button>`).join('')}</div></div>`;
    return `<details class="ref" open><summary>Кастомный — свои настройки</summary><div class="body">
      ${row('Разрешение', 'rs', [[0.4, '40%'], [0.5, '50%'], [0.6, '60%'], [0.7, '70%'], [0.8, '80%'], [0.9, '90%'], [1, '100%']], o.rs || 1)}
      ${row('Динамическое', 'dyn', [[1, 'Вкл'], [0, 'Выкл']], o.dyn === false ? 0 : 1)}
      ${row('Цель кадров', 'fps', [[30, '30 к/с'], [60, '60 к/с']], o.fps || 60)}
      ${row('Не ниже', 'dynMin', [[0.35, '35%'], [0.4, '40%'], [0.5, '50%'], [0.6, '60%'], [0.7, '70%']], o.dynMin || 0.6)}
      ${row('Предел кадров', 'cap', [[30, '30 к/с'], [60, '60 к/с'], ...(C.IS_TOUCH ? [] : [[0, 'Нет']])], o.cap ?? (C.IS_TOUCH ? 60 : 0))}
      ${row('Контейнер', 'pod', [['half', '30 к/с'], ['full', 'Каждый кадр']], o.pod || (C.P.podHalf ? 'half' : 'full'))}
      ${row('Апскейлер', 'up', [['off', 'Нет'], ['cas', 'CAS'], ['fsr', 'FSR']], o.up || 'cas')}
      ${row('Сглаживание', 'aa', [['off', 'Нет'], ['fxaa', 'FXAA'], ['msaa', 'MSAA']], o.aa || 'msaa')}
      ${row('Тени', 'sh', [['off', 'Нет'], ['low', 'Вблизи'], ['mid', 'Средние'], ['high', 'Высокие']], o.sh || 'mid')}
      ${row('Обновление теней', 'shRate', [[1, 'Каждый кадр'], [2, 'Через кадр']], o.shRate || 1)}
      ${row('Город', 'city', [['low', 'Простой'], ['mid', 'Средний'], ['full', 'Полный']], o.city || 'low')}
      ${row('Деревья', 'trees', [[0, 'Нет'], [0.5, 'Мало'], [1, 'Обычно'], [1.5, 'Много']], o.trees ?? 1)}
      ${row('Текстуры', 'tex', [['low', 'Низкие'], ['mid', 'Обычные'], ['high', 'Высокие']], o.tex || 'mid')}
      ${row('Детали улиц', 'props', [[1, 'Вкл'], [0, 'Выкл']], o.props ? 1 : 0)}
      ${row('Эффекты кадра', 'fx', [[1, 'Вкл'], [0, 'Выкл']], o.fx === false ? 0 : 1)}
      ${row('Дальность', 'draw', [[0.6, '60%'], [0.8, '80%'], [1, '100%'], [1.3, '130%']], o.draw || 1)}
      ${row('Облака', 'clouds', [[0, 'Нет'], [0.5, 'Мало'], [1, 'Обычно'], [2, 'Много']], o.clouds ?? 1)}
      ${row('Частицы', 'parts', [[0.5, 'Мало'], [1, 'Обычно'], [1.5, 'Много']], o.parts || 1)}
      ${C.IS_TOUCH ? `<label class="chk"><input type="checkbox" id="sFull" ${o.fullRes ? 'checked' : ''}> полное разрешение экрана</label>` : ''}
      <p class="hint">Тяжелее всего: разрешение, тени, эффекты кадра, город «Полный» и окно контейнера. Слабому устройству: «Предел кадров 30», «Контейнер 30 к/с», «Тени через кадр» или без теней, разрешение 60–70%. Техника, ракеты, бомбы и самолёты — одинаково подробные при любых настройках. «Детали улиц» — при городе «Средний» или «Полный».</p>
      <button class="btn" id="sApplyGfx">Применить (перезапуск)</button></div></details>`;
  }
  function renderSet() {
    $('tab-set').innerHTML = `<div class="cat-h">Графика</div><div class="gfx-row">${Object.entries(PRESETS).map(([k, p]) => `<button class="gfx ${k === C.gfxKey ? 'on' : ''}" data-gfx="${k}"><b>${p.name}</b></button>`).join('')}</div>
      ${C.gfxKey === 'custom' ? customPanel() : ''}
      <label class="chk"><input type="checkbox" id="sPerf" ${C.perfHud ? 'checked' : ''}> счётчик производительности в бою (кадр, ЦП, вызовы, треугольники, память)</label>
      <p class="hint">Видеочип: ${C.gpuName}. Загрузку процессора и видеочипа в процентах браузер не сообщает — счётчик показывает время кадра: «ЦП» — подготовка кадра, остальное — видеочип и ожидание.${navigator.deviceMemory ? ` Память устройства: ≈${navigator.deviceMemory} ГБ.` : ''}</p>
      <div class="cat-h">Время и погода</div>${seg('wx', C.weatherKey, [['random', 'Случайная'], ...WEATHER_KEYS.map((k) => [k, WEATHERS[k].name])])}
      <div class="cat-h">Управление</div>
      ${C.IS_TOUCH ? '<button class="btn alt" id="sLayout">Расположение и размер кнопок…</button>' : ''}
      ${C.shell.canFs() ? `<label class="chk"><input type="checkbox" id="sFs" ${C.shell.fsPref ? 'checked' : ''}> полный экран</label>` : ''}
      <label class="chk">ручка (тангаж и крен) <input type="range" id="sStick" min="0.4" max="1.8" step="0.05" value="${C.sens.stick}"> <b id="vStick">×${C.sens.stick.toFixed(2)}</b></label>
      <label class="chk"><input type="checkbox" id="sInv" ${C.sens.invert ? 'checked' : ''}> инверсия тангажа: вверх — нос вниз (как в авиасимуляторах)</label>
      ${C.IS_TOUCH ? `<label class="chk"><input type="checkbox" id="sAim" ${C.sens.aim !== false ? 'checked' : ''}> наведение камерой: ведите пальцем по экрану — самолёт летит туда, куда смотрит камера (выкл — ручка в левой половине)</label>` : ''}
      ${C.IS_TOUCH ? `<label class="chk"><input type="checkbox" id="sPadOn" ${C.sens.pad ? 'checked' : ''}> крестовина: тангаж и крен кнопками (точные манёвры)</label>
      <label class="chk">сила крестовины <input type="range" id="sPadK" min="0.15" max="1" step="0.05" value="${C.sens.padK}"> <b id="vPadK">${Math.round(C.sens.padK * 100)}%</b></label>` : ''}
      <label class="chk">поворот обзора оператора ЗРК <input type="range" id="sLook" min="0.3" max="2.5" step="0.05" value="${C.sens.look}"> <b id="vLook">×${C.sens.look.toFixed(2)}</b></label>
      <label class="chk"><input type="checkbox" id="sAuto" ${C.auto ? 'checked' : ''}> «АВТО» — помощь в бою (кнопка «АВТО» / клавиша T прямо в бою)</label>
      <p class="hint">«АВТО» в вылете сбрасывает бомбы и пускает ракеты, у оператора ЗРК — назначает цель, пускает и наводит пушку. Помогает, но не идеально: реагирует с задержкой и ошибается — пилотирование, уклонение и выбор момента остаются за вами.</p>
      <div class="cat-h">Звук</div><label class="chk"><input type="checkbox" id="sMute" ${snd.muted ? '' : 'checked'}> звук включён</label>
      <label class="chk">громкость <input type="range" id="sVol" min="0" max="1" step="0.05" value="${snd.volume}"></label>
      <details class="ref credits"><summary>3D-модели, текстуры и эффекты — авторы</summary><div class="body"><p class="hint">${MODEL_CREDITS.map((m) => `<a href="${m.url}" target="_blank" rel="noopener">«${m.title}»</a> — ${m.author} (<a href="${m.licenseUrl}" target="_blank" rel="noopener">${m.license}</a>)`).join(' · ')}. Для игры модели упрощены, разделены на части, текстуры уменьшены.</p>
      <p class="hint">Остальные модели — процедурные, сделаны для игры.</p></div></details>`;
  }
  $('tab-set').onclick = (e) => {
    const g = e.target.closest('[data-gfx]'), w = e.target.closest('[data-seg="wx"] [data-v]');
    const go = e.target.closest('[data-go] [data-v]');
    if (go) { // настройка «Кастомного»: запоминаем, применяется кнопкой «Применить»
      const k = go.closest('[data-go]').dataset.go, v = go.dataset.v, num = +v;
      C.GO[k] = k === 'dyn' || k === 'fx' || k === 'props' ? num === 1 : Number.isFinite(num) ? num : v;
      ls.set('fortuna_airdef_gfxo', JSON.stringify(C.GO)); renderSet(); return;
    }
    if (e.target.id === 'sApplyGfx') { location.reload(); return; }
    if (g) { ls.set('fortuna_airdef_gfx', g.dataset.gfx); const u = new URL(location.href); u.searchParams.delete('gfx'); location.href = u.href; }
    if (e.target.id === 'sLayout') openLayoutEditor();
    if (w) { ls.set('fortuna_airdef_weather', w.dataset.v); const u = new URL(location.href); u.searchParams.delete('weather'); location.href = u.href; }
  };
  $('tab-set').oninput = (e) => {
    if (e.target.id === 'sVol') { snd.unlock(); snd.setVolume(+e.target.value); }
    for (const [id, k, v] of [['sStick', 'stick', 'vStick'], ['sLook', 'look', 'vLook']]) if (e.target.id === id) { C.sens[k] = +e.target.value; $(v).textContent = '×' + C.sens[k].toFixed(2); C.saveSens(); }
    if (e.target.id === 'sAuto') C.setAuto(e.target.checked);
    if (e.target.id === 'sPerf') { C.perfHud = e.target.checked; ls.set('fortuna_airdef_perfhud', C.perfHud ? '1' : '0'); document.body.classList.toggle('perfhud', C.perfHud); }
    if (e.target.id === 'sFull') { C.GO.fullRes = e.target.checked; ls.set('fortuna_airdef_gfxo', JSON.stringify(C.GO)); }
    if (e.target.id === 'sInv') { C.sens.invert = e.target.checked; C.saveSens(); }
    if (e.target.id === 'sAim') { C.sens.aim = e.target.checked; C.saveSens(); }
    if (e.target.id === 'sPadOn') { C.sens.pad = e.target.checked; C.saveSens(); document.body.classList.toggle('nopad', !C.sens.pad); }
    if (e.target.id === 'sPadK') { C.sens.padK = +e.target.value; $('vPadK').textContent = Math.round(C.sens.padK * 100) + '%'; C.saveSens(); }
    if (e.target.id === 'sFs') C.shell.setFs(e.target.checked);
    if (e.target.id === 'sMute') { snd.unlock(); snd.setMuted(!e.target.checked); $('mute').textContent = snd.muted ? '✕♪' : '♪'; }
  };
  $('mtabs').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; tab = b.dataset.tab; showTab(); };
  function showTab() {
    for (const b of $('mtabs').querySelectorAll('button')) b.classList.toggle('on', b.dataset.tab === tab);
    for (const t of ['play', 'ref', 'guide', 'set']) $('tab-' + t).classList.toggle('on', t === tab);
    if (tab === 'set') renderSet();
  }
  // ── рекорды, советы ──
  function renderStats() {
    const s = stats(), g = setup.game;
    if (g === 'online') { $('lobbyStats').innerHTML = 'Онлайн: авиация против ПВО города, три волны.'; return; }
    $('lobbyStats').innerHTML = g === 'training' ? `Обучение: ${[...LESSONS.air, ...LESSONS.def].filter((l) => lessonsDone()[l.id]).length} из ${LESSONS.air.length + LESSONS.def.length} уроков пройдено.`
      : g === 'air' ? (s.air ? `Рекорд вылета: <b>${s.air.best.toLocaleString('ru-RU')}</b> очков · вылетов ${s.air.runs}` : 'Вылетов пока не было.')
        : (s.defense ? `Рекорд обороны: <b>${s.defense.best.toLocaleString('ru-RU')}</b> очков · лучший итог — ${s.defense.waves} волн` : 'Обороны пока не было.');
  }
  let tipI = Math.floor(Math.random() * TIPS.length), tipT = 0;
  function showTip(next) { if (next) tipI = (tipI + 1) % TIPS.length; const el = $('lobbyTip'); el.classList.remove('in'); void el.offsetWidth; el.classList.add('in'); el.innerHTML = `<b>Совет.</b> ${TIPS[tipI]}`; }
  $('lobbyTip').onclick = () => { tipT = 0; showTip(true); };
  setInterval(() => { if (C.state === 'menu' && (tipT += 1) > 12) { tipT = 0; showTip(true); } }, 1000);
  $('startBtn').onclick = () => orientGate(() => { if (setup.game === 'online') { C.online.primary(); return; } C.lastGame = setup.game; C.start(setup.game); }); // на телефоне вертикально — сначала совет повернуть
  function render() { renderModeSel(); renderPlay(); renderStats(); }
  $('weatherChip').textContent = `${C.W.name} · ${C.P.name}`;
  render(); renderRef(); renderGuide(); showTip(false);
  // подложка карт: районы и крупные дома (общая для карты вылета и тактической карты обороны)
  const baseCache = {};
  function mapBase(S2) {
    if (baseCache[S2]) return baseCache[S2];
    const c = document.createElement('canvas'); c.width = c.height = S2; const x = c.getContext('2d'), city = C.city;
    const ZC = ['#56603e', '#6f7262', '#7d7f78', '#8f9093', '#7a7569', '#3c5a2e', '#2d5574', '#6d7858', '#77746c'];
    const st = Math.max(2, Math.round(S2 / 400)), step = 2 * CITY.HALF / S2;
    for (let j = 0; j < S2; j += st) for (let i = 0; i < S2; i += st) { x.fillStyle = ZC[city.zoneAt(-CITY.HALF + i * step, -CITY.HALF + j * step)]; x.fillRect(i, j, st, st); }
    const k = S2 / (2 * CITY.HALF), B = city.B;
    x.fillStyle = 'rgba(30,30,36,.6)';
    for (let i = 0; i < B.n; i++) if (B.h[i] > 18) x.fillRect((B.x[i] - B.w[i] / 2 + CITY.HALF) * k, (B.z[i] - B.d[i] / 2 + CITY.HALF) * k, Math.max(1, B.w[i] * k), Math.max(1, B.d[i] * k));
    return (baseCache[S2] = c);
  }
  return {
    show() { render(); showTab(); $('menu').classList.add('on'); },
    render, mapBase,
    record(game, score, extra = {}) {
      const s = stats(), r = s[game] || { best: 0, runs: 0, waves: 0 };
      r.runs++; r.best = Math.max(r.best, score); if (extra.waves) r.waves = Math.max(r.waves, extra.waves);
      s[game] = r; ls.set('fortuna_airdef_stats', JSON.stringify(s));
    },
    lessonDone(id) { const s = stats(); s.lessons = s.lessons || {}; s.lessons[id] = 1; ls.set('fortuna_airdef_stats', JSON.stringify(s)); },
  };
}
