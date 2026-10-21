// Главное меню: слева — режимы, справа — «папка задания» (настройки режима и старт), Арсенал / Справка / Настройки /
// Об игре — панель поверх. Фон — готовые кадры (menubg.js), пока их нет — живой бой (director.js).
import { CITY, ZONE } from './city.js?v=20261022r';
import { AG, SAM, ERAS, LOADOUTS, DEFENSE, SAM_TYPE, AG_KIND, SAM_COST, PLANES, loadoutsOf, loadoutRole, ROLE_NAME, COMBINED, CARRIERS, MULTI, multiBudget, multiItems } from './arsenal.js?v=20261022r';
import { combinedOk, COMBINED_NAME } from './sim/combined.js?v=20261022r';
import { MODES } from './sim/strike.js?v=20261022r';
import { WEATHERS } from '../drone/world.js?v=20261022r';
import { WINTER_KEYS } from './winter-render.js?v=20261022r';
import { LESSONS } from './training.js?v=20261022r';
import { MODEL_CREDITS } from './models.js?v=20261022r';
import { openLayoutEditor } from './layout.js?v=20261022r';
import { orientGate } from '../orient-warn.js?v=20261011a';
import { ECO_SELECT, setAudioEcoMode } from '../drone/audio.js?v=20261022r';
import { photoItems } from './photo.js?v=20261022r';
import { guideChapters } from './guide.js?v=20261022r';
import { iconize, ico } from './icons.js?v=20261022r';

const GAMES = [
  { k: 'air', name: 'Вылет', desc: 'за самолёт: прорвать ПВО и уничтожить цели' },
  { k: 'defense', name: 'Оборона', desc: 'за ПВО: отразить волны налётов на город' },
  { k: 'multi', name: 'Мульти-волна', desc: 'ракеты, дроны и баллистика: за атакующую волну или за ПВО' },
  { k: 'training', name: 'Обучение', desc: 'по шагам, с объяснениями, проиграть нельзя' },
  { k: 'online', name: 'Онлайн', desc: 'командные бои с другими игроками: авиация против ПВО' },
  { k: 'photo', name: 'Режим съёмки', desc: 'автобой и свободная камера: красивые кадры' },
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
  const realLock = () => setup.diff === 'real' && C.progress && C.progress.ready(); // прокачка ограничивает только «Реализм»

  function renderModeSel() {
    $('modeSel').innerHTML = GAMES.map((g) => `<button data-g="${g.k}" class="${setup.game === g.k ? 'on' : ''}"><b>${g.name}</b><span>${g.desc}</span></button>`).join('');
    const G = GAMES.find((g) => g.k === setup.game) || GAMES[0]; // «папка задания»: режим и что в нём делать
    $('mpKind').textContent = G.name; $('mpTitle').textContent = G.desc[0].toUpperCase() + G.desc.slice(1);
    $('startBtn').textContent = setup.game === 'online' ? C.online.primaryText() : setup.game === 'training' ? 'НАЧАТЬ УРОК' : setup.game === 'photo' ? 'СНИМАТЬ' : setup.game === 'defense' || (setup.game === 'multi' && setup.mrole !== 'atk') ? 'К РАССТАНОВКЕ' : setup.game === 'multi' ? 'К ПЛАНУ ВОЛНЫ' : 'ВЗЛЁТ';
  }
  // пройденные уроки по id; записи прежнего обучения («air0»… — по номеру) переносятся на те же уроки нового учебника
  const OLD = { air: ['ctl', 'bomb', 'lgb', 'agm', 'arm', 'evade'], def: ['d_plan', 'd_op', 'd_gun', 'd_ir', 'd_arm', 'd_short'] };
  function lessonsDone() { const l = stats().lessons || {}, out = { ...l }; for (const sd in OLD) OLD[sd].forEach((id, i) => { if (l[sd + i]) out[id] = 1; }); return out; }
  $('modeSel').onclick = (e) => {
    const b = e.target.closest('button'); if (!b) return; setup.game = b.dataset.g; setup.evd = false; save(); // evd — оборона события на осенней карте (event.js): обычное меню её сбрасывает
    if (C.wantMap(setup.game, setup.pmap, setup.era, -1, false) !== C.MAP) { const u = new URL(location.href); u.searchParams.delete('mp'); u.searchParams.delete('ad'); if (setup.game === 'online') u.searchParams.set('mp', '1'); location.replace(u.href); return; } // «Мульти-волна» — на зимней карте, остальное — на городе
    if (tab !== 'play') { tab = 'play'; showTab(); } if (C.ctrl && C.ctrl.modeChanged) C.ctrl.modeChanged();
    // ночи в онлайне пока нет (решение Mark 2026-10-12): погода строится при загрузке — перезагрузка вечером, сразу в раздел онлайна
    if (setup.game === 'online' && C.W_KEY === 'night') { const u = new URL(location.href); u.searchParams.set('weather', 'evening'); u.searchParams.set('mp', '1'); location.href = u.href; return; }
    render();
  };
  function renderPlay() {
    const g = setup.game, el = $('tab-play'); C.realBlock = false;
    if (g === 'online') { C.online.panel(el); return; } // онлайн — свой раздел (online.js)
    if (g === 'training' && !setup.tlist) { el.innerHTML = renderFirst(); return; } // «Первые шаги»
    if (g === 'training') {
      const done = lessonsDone(), list = LESSONS[setup.tside];
      // учебник: уроки по разделам («Основы», «Системы», «Бомбы»… / «Оборона», «Комплексы»…), номер — сквозной
      const mw = setup.tside === 'matk' || setup.tside === 'mdef'; // учебник «Мульти-волны» — свои две ветки
      let h = `<p class="hint"><button class="fsl" data-fs="wiz">‹ Первые шаги — подобрать урок по ответам</button></p><div class="prow"><span>Учебник</span>${seg('tbook', mw ? 'multi' : 'base', [['base', 'Вылет и оборона'], ['multi', 'Мульти-волна']])}</div>
        <div class="prow"><span>Сторона</span>${seg('tside', setup.tside, mw ? [['matk', 'За волну'], ['mdef', 'За ПВО']] : [['air', 'За самолёт'], ['def', 'За ПВО']])}</div>${mw ? '' : `
        <div class="prow"><span>Чьей техникой</span>${seg('tnat', setup.tside === 'air' ? (setup.side === 'east' ? 'west' : 'east') : setup.side, [['east', 'Восток'], ['west', 'Запад']])}</div>`}`, sec = null;
      list.forEach((l, i) => {
        if (l.sec !== sec) { sec = l.sec; const n = list.filter((q) => q.sec === sec).length, k = list.filter((q) => q.sec === sec && done[q.id]).length; h += `<div class="cat-h">${sec} <span class="dim">${k}/${n}</span></div>`; }
        h += `<button class="opt ${i === setup.tl ? 'on' : ''} ${done[l.id] ? 'done' : ''}" data-tl="${i}"><div class="nm"><b>${i + 1}. ${l.name}${done[l.id] ? ' ✓' : ''}</b><span>${l.desc}</span></div></button>`;
      });
      el.innerHTML = h + (mw ? '<p class="hint">Каждый урок: как это работает и типичные ошибки → шаги с подсказками в панели «Урок» (кнопка вверху справа; пока она открыта — пауза): что нажать и почему. Уроки идут по порядку: от карты и первой покупки до контрольной волны.</p>'
        : '<p class="hint">Каждый урок: как это работает в игре и типичные ошибки → показ (самолёт всё делает сам) → вы. Проиграть нельзя: урон отключён, боеприпасы пополняются. Подсказка шага — в панели «Урок» вверху справа (пока она открыта — пауза); кнопка «?» объясняет оружие или комплекс.</p>');
      return;
    }
    if (g === 'multi') { el.innerHTML = renderMulti(); return; }
    if (g === 'photo') { el.innerHTML = renderPhoto(); return; }
    let h = `<div class="prow"><span>Режим</span>${seg('diff', setup.diff, Object.entries(MODES).map(([k, m]) => [k, m.name]))}</div><p class="hint">${MODES[setup.diff].desc}</p>
      <div class="prow"><span>Эпоха</span>${seg('era', setup.era, ERAS.filter((e) => LOADOUTS[e.id]).map((e) => [e.id, e.name]))}</div>
      <div class="prow"><span>${g === 'defense' ? 'Ваша ПВО' : 'ПВО города'}</span>${seg('side', setup.side, [['east', 'Советская'], ['west', 'Западная']])}</div>`;
    if (g === 'air') {
      h += `<p class="hint">Комплексы: ${DEFENSE[setup.side][setup.era].map(([k]) => SAM[k].short).join(', ')}.</p><div class="cat-h">Подвеска</div>`;
      // подвески стороны, которая атакует выбранную ПВО; у каждой — свой самолёт
      const att = setup.side === 'east' ? 'west' : 'east', mine = loadoutsOf(setup.era, att).filter(([L]) => !L.heli); // вертолёты — в событии «Туманная топь» (event.js)
      // «Реализм»: только подвески, у которых куплены самолёт и всё оружие (прокачка); закрытая — с замком и «нужно: …»
      const can = ([L]) => !realLock() || C.progress.loadoutOk(L), open = mine.filter(can);
      if (!open.some(([, i]) => i === setup.lo)) setup.lo = (open[0] || mine[0])[1];
      const loBtn = ([L, i], attr, on) => { const miss = can([L]) ? [] : C.progress.loadoutMissing(L);
        return `<button class="opt ${on && !miss.length ? 'on' : ''} ${miss.length ? 'lock' : ''}" ${miss.length ? `data-need="${miss[0].id}"` : `${attr}="${i}"`}><div class="nm"><b>${miss.length ? ico('lock') + ' ' : ''}${PLANES[L.plane]} · ${L.name}</b><span class="role ${loadoutRole(L)}">${ROLE_NAME[loadoutRole(L)]}</span><span>${L.items.map(([k, n]) => `${AG[k].short} ×${n}`).join(' · ')}${L.pod ? ' · контейнер' : ''}</span>${miss.length ? `<span class="need">${C.progress.needText(miss)} — открыть в «Исследованиях»</span>` : ''}</div>${L.items.map(([k]) => tags(AG[k].kind, AG_KIND[AG[k].kind].split(',')[0].split(' ')[0])).filter((v, j, a) => a.indexOf(v) === j).join(' ')}</button>`; };
      C.realBlock = !open.length;
      if (!open.length) h += `<p class="hint need">В «Реализме» эпохи ${ERAS[setup.era - 1].short} у вас пока нет подвески за эту сторону — купите самолёт и оружие в «Исследованиях» или играйте в «Аркаде».</p>`;
      // «Операция»: два вылета — сначала охота за ПВО, потом удар (у стороны нет охотничьей подвески — только одиночный вылет)
      const sead = mine.filter(([L]) => loadoutRole(L) === 'sead'), strike = mine.filter(([L]) => loadoutRole(L) !== 'sead');
      const seadOk = sead.filter(can), strikeOk = strike.filter(can);
      const canOp = seadOk.length > 0 && strikeOk.length > 0; if (!canOp) setup.op = false;
      if (canOp) h += `<div class="prow"><span>Вылеты</span>${seg('op', setup.op ? 'op' : 'one', [['one', 'Один вылет'], ['op', 'Операция: 2 вылета']])}</div>`;
      if (setup.op) {
        if (!seadOk.some(([, i]) => i === setup.lo1)) setup.lo1 = seadOk[0][1];
        if (!strikeOk.some(([, i]) => i === setup.lo2)) setup.lo2 = strikeOk[0][1];
        h += `<p class="hint">Как в жизни: сначала подавить ПВО, потом бить по городу. Разбитое в первом вылете остаётся разбитым, уцелевшие комплексы перезарядятся. Очки — за оба вылета, +300 за два возвращения.</p>`;
        h += `<div class="cat-h">Вылет 1 — охота за ПВО</div>` + sead.map((x) => loBtn(x, 'data-lo1', x[1] === setup.lo1)).join('');
        h += `<div class="cat-h">Вылет 2 — штурмовка</div>` + strike.map((x) => loBtn(x, 'data-lo2', x[1] === setup.lo2)).join('');
      } else h += mine.map((x) => loBtn(x, 'data-lo', x[1] === setup.lo)).join('') + `<p class="hint">У подвески «охота за ПВО» задача — уничтожить комплексы с РЛС, у «штурмовки» — цели города.</p>`;
      const L = LOADOUTS[setup.era][setup.op ? setup.lo1 : setup.lo];
      h += `<p class="hint">${L.items.map(([k]) => `<b>${AG[k].short}</b> — ${AG[k].guide}`).join('<br>')}</p>`;
    } else {
      // последняя волна — «Мульти-волна» (если у атакующей стороны в эпохе есть чем ударить)
      const attS = setup.side === 'east' ? 'west' : 'east';
      if (combinedOk(attS, setup.era)) {
        h += `<div class="prow"><span>Последняя волна</span>${seg('cs', setup.cs === false ? 'off' : 'on', [['on', COMBINED_NAME], ['off', 'Обычный налёт']])}</div>`;
        if (setup.cs !== false) h += `<p class="hint">${COMBINED_NAME}: разведчик и ${attS === 'east' && setup.era >= 4 ? 'ударные дроны' : 'ложные цели'}, затем крылатые ракеты с нескольких направлений на малой высоте, в конце — оперативно-тактические: ${COMBINED[attS][setup.era].filter(([k]) => AG[k].kind === 'tbm').map(([k]) => AG[k].short).join(', ') || 'нет'}. Баллистику сбивают только противоракетные комплексы (${['s300', 's400', 'patriot', 'pac3', 'bukm3'].filter((k) => SAM[k] && SAM[k].side === setup.side && SAM[k].era <= setup.era).map((k) => SAM[k].short).join(', ') || 'в этой эпохе — никто'}).</p>`;
      }
      const list = Object.entries(SAM).filter(([, s]) => s.side === setup.side && s.era <= setup.era);
      h += `<div class="cat-h">Комплексы в вашем распоряжении</div>` + list.map(([k, s]) => { const lk = realLock() && !C.progress.samOk(k);
        return `<div class="opt ${lk ? 'lock' : ''}" ${lk ? `data-need="pvo:${k}"` : ''}><div class="nm"><b>${lk ? ico('lock') + ' ' : ''}${s.name}</b><span>${SAM_TYPE[s.type]} · до ${(s.rmax / 1000).toFixed(1)} км, высота до ${(s.hmax / 1000).toFixed(1)} км</span>${lk ? '<span class="need">в «Реализме» — после покупки в «Исследованиях»</span>' : ''}</div><span class="pr">${SAM_COST[k]} очк</span></div>`; }).join('') +
        `<p class="hint">Перед каждой волной расставьте комплексы на карте за очки обороны, между волнами — докупка, переезд и продажа. Волн — ${C.WAVES}. Потеряно 75 % ценности военных объектов — поражение. В бою можно «сесть» в любой комплекс оператором.</p>`;
    }
    el.innerHTML = h;
  }
  // «Съёмка»: что снимаем (самолёт с подвеской, комплекс ПВО, оружие «Мульти-волны»), эпоха и сторона ПВО города
  function renderPhoto() {
    const ps = setup.pside || 'air', att = setup.side === 'east' ? 'west' : 'east';
    let h = `<div class="prow"><span>Снимаем</span>${seg('pside', ps, [['air', 'Самолёт'], ['def', 'ПВО'], ['multi', 'Мульти-волна']])}</div>
      <div class="prow"><span>Эпоха</span>${seg('era', setup.era, ERAS.filter((e) => LOADOUTS[e.id]).map((e) => [e.id, e.name]))}</div>
      <div class="prow"><span>${ps === 'def' ? 'Сторона ПВО' : 'ПВО города'}</span>${seg('side', setup.side, [['east', 'Советская'], ['west', 'Западная']])}</div>
      <div class="prow"><span>Карта</span>${seg('pmap', C.MAP, [['winter', 'Северный рубеж'], ['city', 'Город']])}</div>
      <div class="prow"><span>Погода</span>${seg('pwx', C.MAP === 'winter' ? (WINTER_KEYS.includes(C.weatherKey) ? C.weatherKey : 'random') : (WEATHER_KEYS.includes(C.weatherKey) ? C.weatherKey : 'random'),
        [['random', 'Случайная'], ...(C.MAP === 'winter' ? WINTER_KEYS : WEATHER_KEYS).map((k) => [k, WEATHERS[k].name])])}</div>
      <p class="hint">Сейчас: ${C.W.name}. Карта и погода строятся при загрузке — смена перезапускает страницу.</p>`;
    if (ps === 'air') {
      const mine = loadoutsOf(setup.era, att).filter(([L]) => !L.heli); // вертолёты — в событии «Туманная топь»
      if (!mine.some(([, i]) => i === setup.lo)) setup.lo = mine[0][1];
      h += `<div class="prow"><span>Высота</span>${seg('palt', setup.palt || 'mid', [['low', '250 м'], ['mid', '1,5 км'], ['high', '4 км']])}</div><div class="cat-h">Самолёт и подвеска</div>` +
        mine.map(([L, i]) => `<button class="opt ${i === setup.lo ? 'on' : ''}" data-lo="${i}"><div class="nm"><b>${PLANES[L.plane]} · ${L.name}</b><span>${L.items.map(([k, n]) => `${AG[k].short} ×${n}`).join(' · ')}${L.pod ? ' · контейнер' : ''}</span></div></button>`).join('') +
        '<p class="hint">Самолёт летит сам от цели к цели, сам сбрасывает и пускает, ставит ловушки; урона не получает, подвеска пополняется. Камеру можно привязать к каждому оружию на пилоне — снять сход с подвески и полёт до разрыва. На 250 м контейнер не захватывает цели: лазерные и ТВ не пускаются.</p>';
    } else if (ps === 'def') {
      const list = Object.entries(SAM).filter(([, s]) => s.side === setup.side && s.era <= setup.era);
      if (!list.some(([k]) => k === setup.psam)) setup.psam = list[0][0];
      const canM = combinedOk(att, setup.era);
      h += `<div class="prow"><span>Против</span>${seg('pvs', canM && setup.pvs === 'multi' ? 'multi' : 'air', canM ? [['air', 'Самолётов'], ['multi', COMBINED_NAME]] : [['air', 'Самолётов']])}</div><div class="cat-h">Комплекс</div>` +
        list.map(([k, s]) => `<button class="opt ${k === setup.psam ? 'on' : ''}" data-psam="${k}"><div class="nm"><b>${s.name}</b><span>${SAM_TYPE[s.type]} · до ${(s.rmax / 1000).toFixed(1)} км</span></div></button>`).join('') +
        '<p class="hint">Комплекс стоит у цели и отражает налёт за налётом (неуязвим, перезаряжается быстро); вокруг — ИИ-ПВО города.</p>';
    } else {
      const items = photoItems(att, setup.era);
      if (!items.some(([k]) => k === setup.pmun) && items.length) setup.pmun = items[0][0];
      h += '<div class="cat-h">Оружие волны</div>' + (items.length ? items.map(([k, via]) => `<button class="opt ${k === setup.pmun ? 'on' : ''}" data-pmun="${k}"><div class="nm"><b>${AG[k].name}</b><span>${AG[k].recon ? 'разведчик' : AG[k].uav ? 'дрон' : AG[k].kind === 'tbm' ? (via ? 'аэробаллистическая' : 'баллистическая, с пусковой') : 'крылатая / планирующая'}${via ? ` · носитель ${CARRIERS[via].name}` : ''}</span></div></button>`).join('')
        : '<p class="hint">В этой эпохе у этой стороны нечего снять — выберите другую эпоху.</p>') +
        '<p class="hint">Выбранное оружие снова и снова идёт на город: носитель или пусковая → пуск → полёт → перехват или попадание. ПВО города — ИИ.</p>';
    }
    return h + `<p class="hint">${C.IS_TOUCH ? 'Тяните по экрану — камера вокруг объекта, два пальца — ближе/дальше.' : 'Мышь — вокруг объекта, колесо — ближе/дальше, ←/→ ракурс, ↑/↓ объект, H — спрятать интерфейс.'} Внизу — что снимать и ракурс, справа — зум, скорость (×½, ×¼, стоп-кадр) и ◎ — убрать весь интерфейс (тап по экрану вернёт).</p>`;
  }
  // «Первые шаги» в обучении: за кого → опыт → первый урок по ответам (решение Mark 2026-10-13). Ответ про опыт ведёт к
  // уроку: впервые — с самого начала, немного — к оружию, уверенно — к защите от ПВО (у ПВО — к защите от ПРР)
  const FIRST = {
    air: { q: 'Вы уже летали в авиасимуляторах?', a: [['ctl', 'Нет, впервые', 'начнём с управления самолётом'], ['bomb', 'Да, немного', 'сразу к бомбам и ракетам'], ['evade', 'Да, уверенно', 'к уклонению от ракет ПВО']] },
    def: { q: 'Вы уже играли за ПВО в похожих играх?', a: [['d_plan', 'Нет, впервые', 'начнём с расстановки комплексов'], ['d_op', 'Да, немного', 'сразу к стрельбе из комплекса'], ['d_arm', 'Да, уверенно', 'к защите от противорадарных ракет']] },
    multi: { q: 'Что хотите освоить в «Мульти-волне»?', a: [['matk', 'Собирать удар', 'дроны, крылатые ракеты, баллистика'], ['mdef', 'Отбивать удар', 'ПВО против волны']] },
  };
  const fs = { side: null, pick: null };
  function renderFirst() {
    const SN = { air: 'Самолёт', def: 'ПВО', multi: 'Мульти-волна' }, step = !fs.side ? 0 : fs.pick === null ? 1 : 2;
    const chip = (t, k) => `<span class="fsc ${k}">${t}</span>`;
    let h = `<div class="fsh">${chip(fs.side ? SN[fs.side] + ' ✓' : 'За кого', step === 0 ? 'on' : 'ok')}${chip(fs.side === 'multi' ? 'Роль' : 'Опыт', step === 1 ? 'on' : step > 1 ? 'ok' : '')}${chip('Первый урок', step === 2 ? 'on' : '')}<button class="fsl" data-fs="list">Все уроки</button></div>`;
    if (step === 0) h += `<div class="fsq">За кого хотите научиться играть?</div>` + [['air', 'Самолёт', 'прорваться через ПВО и поразить цели'], ['def', 'ПВО', 'защитить город от налётов'], ['multi', 'Мульти-волна', 'дроны, ракеты и баллистика']].map(([k, n, d]) => `<button class="fso" data-fs="side:${k}"><b>${n}</b><span>${d}</span></button>`).join('');
    else if (step === 1) h += `<div class="fsq">${FIRST[fs.side].q}</div>` + FIRST[fs.side].a.map(([, n, d], i) => `<button class="fso" data-fs="pick:${i}"><b>${n}</b><span>${d}</span></button>`).join('') + '<button class="fsl" data-fs="back">‹ Назад</button>';
    else {
      const L = LESSONS[setup.tside][setup.tl] || LESSONS[setup.tside][0];
      h += `<div class="fsq">Ваш первый урок</div><div class="opt on"><div class="nm"><b>${L.name}</b><span>${L.desc}</span></div></div>
        <p class="hint">Урок короткий, проиграть нельзя: сначала объяснение, потом показ, потом вы. Дальше уроки идут по порядку — список в «Все уроки».</p><button class="fsl" data-fs="reset">Ответить заново</button>`;
    }
    return h;
  }
  function firstClick(v) {
    if (v === 'list') { setup.tlist = true; save(); return; }
    if (v === 'wiz') { setup.tlist = false; fs.side = null; fs.pick = null; save(); return; }
    if (v === 'reset') { fs.side = null; fs.pick = null; return; }
    if (v === 'back') { fs.side = null; return; }
    const [k, x] = v.split(':');
    if (k === 'side') { fs.side = x; fs.pick = null; return; }
    if (k === 'pick') {
      fs.pick = +x; const [id] = FIRST[fs.side].a[fs.pick];
      const side = fs.side === 'multi' ? id : fs.side, list = LESSONS[side], i = fs.side === 'multi' ? 0 : list.findIndex((l) => l.id === id);
      setup.tside = side; setup.tl = Math.max(0, i); save();
    }
  }
  // «Мульти-волна» отдельно: роль, сторона игрока, эпоха (есть ли у атакующих чем ударить), что ждёт
  function renderMulti() {
    const atk = setup.mrole === 'atk', me = setup.side, att = atk ? me : me === 'east' ? 'west' : 'east', def = att === 'east' ? 'west' : 'east';
    const eras = ERAS.filter((e) => combinedOk(att, e.id));
    if (!eras.some((e) => e.id === setup.era)) setup.era = eras[eras.length - 1].id;
    let h = `<div class="prow"><span>Роль</span>${seg('mrole', atk ? 'atk' : 'def', [['def', 'За ПВО'], ['atk', 'За волну']])}</div>
      <div class="prow"><span>Сторона</span>${seg('side', me, [['east', 'Восток'], ['west', 'Запад']])}</div>
      <div class="prow"><span>Режим</span>${seg('diff', setup.diff, Object.entries(MODES).map(([k, m]) => [k, m.name]))}</div><p class="hint">${MODES[setup.diff].desc}</p>
      <div class="prow"><span>Эпоха</span>${seg('era', setup.era, eras.map((e) => [e.id, e.name]))}</div>
      <p class="hint">Карта «Северный рубеж» — зимняя горная долина: объекты разнесены по карте — авиабаза, ГЭС на плотине, РЛС на вершине, арсенал в ущелье; хребты прикрывают от РЛС и ракет.</p>`;
    const items = multiItems(att, setup.era), carriers = [...new Set(items.map(([, v]) => v).filter(Boolean))].map((v) => CARRIERS[v].name);
    h += `<div class="cat-h">Как идёт волна</div><p class="hint">1. <b>Дрон разведчик</b> (без боевой части, с камерой) облетает город и засекает комплексы ПВО. 2. <b>${(att === 'east' && setup.era >= 4) || (att === 'west' && setup.era >= 3) ? 'Ударные дроны' : 'Дроны'} и ложные цели</b> — ПВО тратит на них ракеты и включает РЛС.
      3. <b>Крылатые ракеты</b> — носители (${carriers.join(', ') || '—'}) заходят из-за края карты и пускают их с рубежа за краем района (там ПВО их не достаёт); ракеты идут на малой высоте с 2–3 направлений. 4. <b>Баллистика</b> — с пусковых за городом, по крутой дуге с высоты 25–45 км.
      Расписание не ждёт: несбитые дроны долетают до своих целей, а крылатые и баллистика идут в свой срок.</p>
      <p class="hint"><b>Баллистику</b> сбивают только противоракетные ЗРК: С-300, С-400, Patriot, PAC-3 (немного — «Бук-М3»), и только на снижении, в последние ~20 с. О пуске предупреждает тревога, на карте — ромб, высота и время до падения, круг — район падения.</p>`;
    if (atk) h += `<div class="cat-h">За волну</div><p class="hint">Бюджет — <b>${multiBudget(att, setup.era)}</b> очков угрозы${att === 'west' ? ' (у запада +15 %: моделей меньше)' : ''}: дрон и ложная цель — 1, крылатая — 3, малозаметная — 4, баллистическая — 5, «Искандер» — 7.
      На карте выбираете 1–4 цели, состав, маршруты (до 3 точек) и высоту полёта, время прихода (эшелонами или разом) и долю по ПВО. Где ПВО — заранее неизвестно: её засекает разведчик, выдают излучение РЛС и пуски.
      В бою — «Ход волны»: что летит, когда пуски носителей и баллистики; «Смотреть» и «Ждать» — камера к событию, время ×4. ПВО противника — ИИ (${DEFENSE[def][setup.era].map(([k]) => SAM[k].short).join(', ')}). Волна прорвалась — разрушено 50 % ценности целей.</p>`;
    else h += `<div class="cat-h">За ПВО</div><p class="hint">Одна большая волна по 3 целям. Расстановка — <b>${Math.round(MULTI.sam[setup.era] * (setup.diff === 'arcade' ? 1.2 : 1))}</b> очков обороны, докупки нет. Ожидается: ${(COMBINED[att][setup.era] || []).filter(([k]) => k !== 'scout').map(([k, n]) => `${AG[k].short} ×${n}`).join(', ')}.
      Волна прорвалась — разрушено 50 % ценности целей. Время в бою можно ускорить ×4, кнопка «Смотреть» — камера за ракетой.</p>`;
    return h;
  }
  $('tab-play').onclick = (e) => {
    if (setup.game === 'online') { C.online.onClick(e); return; }
    const f = e.target.closest('[data-fs]'); if (f) { firstClick(f.dataset.fs); snd.click(); render(); return; }
    const nd = e.target.closest('[data-need]'); if (nd) { snd.click(); C.research.open(nd.dataset.need); return; } // закрыто в «Реализме» — к нужной единице дерева
    const b = e.target.closest('[data-v]'), lo = e.target.closest('[data-lo]'), lo1 = e.target.closest('[data-lo1]'), lo2 = e.target.closest('[data-lo2]'), tl = e.target.closest('[data-tl]');
    if (b) {
      const id = b.parentNode.dataset.seg, v = b.dataset.v;
      if (id === 'pmap' || id === 'pwx') { // карта и погода «Съёмки» — перезапуск страницы (строятся при загрузке)
        if (id === 'pmap') setup.pmap = v; else setup.pwx = { ...(setup.pwx || {}), [C.MAP]: v };
        save(); const u = new URL(location.href); u.searchParams.delete('weather'); u.searchParams.delete('map'); location.replace(u.href); return;
      }
      if (id === 'pside') setup.pside = v; else if (id === 'palt') setup.palt = v; else if (id === 'pvs') setup.pvs = v; else if (id === 'op') setup.op = v === 'op'; else if (id === 'mrole') setup.mrole = v; else if (id === 'cs') setup.cs = v === 'on'; else if (id === 'diff') setup.diff = v; else if (id === 'era') { setup.era = +v; setup.lo = 0; } else if (id === 'side') setup.side = v; else if (id === 'tnat') setup.side = setup.tside === 'air' ? (v === 'east' ? 'west' : 'east') : v; /* обучение: своя техника; setup.side — сторона ПВО */ else if (id === 'tside') { setup.tside = v; setup.tl = 0; } else if (id === 'tbook') { setup.tside = v === 'multi' ? 'matk' : 'air'; setup.tl = 0; }
    } else if (e.target.closest('[data-psam]')) setup.psam = e.target.closest('[data-psam]').dataset.psam; else if (e.target.closest('[data-pmun]')) setup.pmun = e.target.closest('[data-pmun]').dataset.pmun;
    else if (lo) setup.lo = +lo.dataset.lo; else if (lo1) setup.lo1 = +lo1.dataset.lo1; else if (lo2) setup.lo2 = +lo2.dataset.lo2; else if (tl) setup.tl = +tl.dataset.tl; else return;
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
      e_su34: ['Су-34', 'Россия · фронтовой бомбардировщик, встроенный прицельный комплекс «Платан»: КАБ-500С, УМПК, Х-59М, Х-31П.'],
      e_mig31: ['МиГ-31БМ', 'Россия · перехватчик, в модернизации — ПРР Х-31П против ПВО.'],
      e_su57: ['Су-57', 'Россия · малозаметный: оружие во внутренних отсеках (Х-59МК2 создавалась под них), выходит из отсека при пуске.'],
      e_f4: ['F-4 Phantom II', 'США · «Дикая ласка» F-4G — охотник за ПВО: Shrike, HARM.'],
      f18: ['F/A-18 Hornet', 'США · палубный многоцелевой: Mk 82, GBU-12, JDAM, HARM, AARGM.'],
      f16: ['F-16', 'США · лёгкий многоцелевой: Mk 82, Maverick, HARM, JASSM.'],
      e_gripen: ['JAS 39 Gripen', 'Швеция · лёгкий многоцелевой с контейнером LITENING: GBU-12, JDAM.'],
      e_f22: ['F-22A Raptor', 'США · малозаметный: JDAM и SDB во внутренних отсеках, наведение по GPS (прицельного контейнера нет).'],
      e_f35: ['F-35A Lightning II', 'США · малозаметный: SDB во внутренних отсеках, встроенная оптико-электронная система EOTS.'] };
    h += `<div class="cat-h">Самолёты</div>` + Object.entries(PL).map(([k, [n, d]]) => `<details class="ref"><summary>${n}</summary><div class="body"><p>${d}</p><p>Подвески: ${Object.entries(LOADOUTS).flatMap(([era, list]) => list.filter((L) => L.plane === k).map((L) => `${L.name} (эп. ${ERAS[era - 1].short})`)).join('; ')}.</p></div></details>`).join('');
    for (const e of ERAS.filter((x) => LOADOUTS[x.id])) {
      h += `<div class="cat-h">Зенитные комплексы · эпоха ${e.short}</div>`;
      for (const [k, s] of Object.entries(SAM)) if (s.era === e.id) h += `<details class="ref"><summary>${tags(s.type, { guns: 'АРТ', ir: 'ИК', sarh: 'ПАРЛ', saclos: 'ЛВ', tvm: 'TVM', arh: 'АРЛ', jammer: 'РЭБ', command: 'РК' }[s.type])} ${s.name}</summary><div class="body">
        <p>${s.guide}</p>${specs(s)}<h4>В игре</h4><p>${SAM_TYPE[s.type]} · ${(s.rmin / 1000).toFixed(1)}–${(s.rmax / 1000).toFixed(1)} км · высоты ${s.hmin}–${s.hmax} м${s.radar ? ` · РЛС видит цель ЭПР 5 м² с ${(s.radar.range / 1000).toFixed(0)} км, захват ${s.radar.acq} с${s.radar.doppler ? ', когерентная — есть доплеровский провал' : ''}` : s.type === 'jammer' ? ` · радиус подавления ${(s.jamR / 1000).toFixed(0)} км` : ' · без РЛС — на СПО не виден'}${s.channels > 1 ? ` · целевых каналов ${s.channels}` : ''}${s.vls ? ' · вертикальный старт' : ''}${s.antiMun ? ' · сбивает бомбы и ракеты' : ''}${s.optTrack ? ' · оптический канал без излучения' : ''} · стоимость в обороне ${SAM_COST[k]}</p></div></details>`;
      h += `<div class="cat-h">Ударное оружие · эпоха ${e.short}</div>`;
      for (const [, w] of Object.entries(AG)) if (w.era === e.id) h += `<details class="ref"><summary>${tags(w.kind, { bomb: 'ФАБ', lgb: 'ЛАЗ', tvb: 'ТВ', arm: 'ПРР', gps: 'GPS', cruise: 'КР', decoy: 'ЛЦ', ecm: 'РЭБ', rocket: 'НАР' }[w.kind] || (w.seeker === 'tv' ? 'ТВ' : 'ЛАЗ'))} ${w.name}</summary><div class="body">
        <p>${w.guide}</p>${specs(w)}<h4>В игре</h4><p>${AG_KIND[w.kind]}${w.rmax ? ` · пуск до ≈ ${(w.rmax / 1000).toFixed(0)} км` : ''} · радиус поражения ${w.blast} м</p></div></details>`;
    }
    $('tab-ref').innerHTML = h;
  }
  // ── Руководство ──
  function renderGuide() { $('tab-guide').innerHTML = guideChapters(C).map(([t, b], i) => `<details class="ref"${i === 0 ? ' open' : ''}><summary>${t}</summary><div class="body">${iconize(b)}</div></details>`).join(''); }
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
      <label class="chk"><input type="checkbox" id="sPerf" ${C.perfHud ? 'checked' : ''}> счётчик производительности в бою</label>
      <p class="hint">Видеочип: ${C.gpuName}</p>
      <div class="cat-h">Время и погода</div>${seg('wx', C.weatherKey, [['random', 'Случайная'], ...WEATHER_KEYS.map((k) => [k, WEATHERS[k].name])])}
      <div class="cat-h">Управление</div>
      ${C.IS_TOUCH ? '<button class="btn alt" id="sLayout">Расположение и размер кнопок…</button>' : ''}
      ${C.shell.canFs() ? `<label class="chk"><input type="checkbox" id="sFs" ${C.shell.fsPref ? 'checked' : ''}> полный экран</label>` : ''}
      <label class="chk">ручка (тангаж и крен) <input type="range" id="sStick" min="0.4" max="1.8" step="0.05" value="${C.sens.stick}"> <b id="vStick">×${C.sens.stick.toFixed(2)}</b></label>
      <label class="chk"><input type="checkbox" id="sInv" ${C.sens.invert ? 'checked' : ''}> инверсия тангажа: вверх — нос вниз (как в авиасимуляторах)</label>
      ${C.IS_TOUCH ? `<label class="chk"><input type="checkbox" id="sAim" ${C.sens.aim !== false ? 'checked' : ''}> наведение камерой: ведите пальцем по экрану — самолёт летит туда, куда смотрит камера (выкл — ручка в левой половине)</label>` : ''}
      ${C.IS_TOUCH ? `<label class="chk"><input type="checkbox" id="sPadOn" ${C.sens.pad ? 'checked' : ''}> крестовина: тангаж и крен кнопками (точные манёвры)</label>
      <label class="chk">сила крестовины <input type="range" id="sPadK" min="0.15" max="1" step="0.05" value="${C.sens.padK}"> <b id="vPadK">${Math.round(C.sens.padK * 100)}%</b></label>` : ''}
      ${C.IS_TOUCH ? '' : `<label class="chk"><input type="checkbox" id="sKeys" ${C.sens.keys ? 'checked' : ''}> подсказки клавиш в бою — панель слева внизу (F1 — включить и выключить в бою)</label>`}
      <label class="chk">поворот обзора оператора ЗРК <input type="range" id="sLook" min="0.3" max="2.5" step="0.05" value="${C.sens.look}"> <b id="vLook">×${C.sens.look.toFixed(2)}</b></label>
      <label class="chk"><input type="checkbox" id="sAuto" ${C.auto ? 'checked' : ''}> «АВТО» — помощь в бою (кнопка «АВТО» / клавиша T прямо в бою)</label>
      <p class="hint">«АВТО» в вылете сбрасывает бомбы и пускает ракеты, у оператора ЗРК — назначает цель, пускает и наводит пушку. Помогает, но не идеально: реагирует с задержкой и ошибается — пилотирование, уклонение и выбор момента остаются за вами.</p>
      <div class="cat-h">Звук</div><label class="chk"><input type="checkbox" id="sMute" ${snd.muted ? '' : 'checked'}> звук включён</label>
      <label class="chk">громкость <input type="range" id="sVol" min="0" max="1" step="0.05" value="${snd.volume}"></label>
      ${ECO_SELECT('sEco')}`;
  }
  // ── Прочее: об игре (дисклеймер) и благодарности авторам моделей, эффектов и звуков ──
  const A = (url, t) => `<a href="${url}" target="_blank" rel="noopener">${t}</a>`;
  function renderMisc() {
    $('tab-misc').innerHTML = `<div class="cat-h">Об игре</div>
      <p class="hint">Air Superiority Online — игра, созданная исключительно в образовательных и развлекательных целях.</p>
      <p class="hint">Техника, вооружение, камуфляжи, обозначения, 3D-модели, звуки и игровые механики упрощены, несмотря на цель приблизиться к реализму, и служат только для того, чтобы создать атмосферу. Они не обязаны отражать реальные характеристики, тактику и боевое применение и не являются руководством к действию.</p>
      <p class="hint">Город, объекты, позывные и события в игре вымышлены. Любые совпадения с реальными местами, людьми, организациями и событиями случайны.</p>
      <p class="hint">Игра не пропагандирует войну и насилие и не выражает политических позиций. Названия и модели образцов техники используются только для узнаваемости и реалистичности; права на товарные знаки принадлежат их владельцам. Игра не связана с производителями техники, военными ведомствами и игровыми компаниями и не одобрена ими.</p>
      <div class="cat-h">Отдельное спасибо за помощь</div>
      <p class="hint">3D-модели (для игры упрощены, разделены на части, текстуры уменьшены): ${MODEL_CREDITS.map((m) => `${A(m.url, `«${m.title}»`)} — ${m.author} (${A(m.licenseUrl, m.license)})`).join(' · ')}.</p>
      <p class="hint">Звуки (обрезаны, обработаны, сведены в моно): ${[
        ['https://freesound.org/people/puniho/sounds/116677/', 'Stretched Canvas Bass Drum Granulated', 'Puniho', 'CC BY 3.0'],
        ['https://freesound.org/people/Benboncan/sounds/74242/', 'Military Helicopter', 'Benboncan', 'CC BY 4.0'],
        ['https://freesound.org/people/Rmutt/sounds/156906/', 'UH-1 Helicopter', 'Rmutt', 'CC0'],
        ['https://freesound.org/people/qubodup/sounds/189446/', 'Jet Plane Flyby', 'qubodup', 'CC0'],
        ['https://freesound.org/people/qubodup/sounds/163119/', 'Navy Mk 15 Phalanx CIWS Fast Burst', 'qubodup', 'CC0'],
        ['https://freesound.org/people/qubodup/sounds/211617/', 'Far Away Rocket Launch', 'qubodup', 'CC0'],
        ['https://freesound.org/people/Fenodyrie/sounds/565911/', 'Flock of Crows', 'Fenodyrie', 'CC0'],
        ['https://freesound.org/people/invadium/sounds/824805/', 'Cruise missiles interception and fly-by', 'Invadium', 'CC0'],
        ['https://www.youtube.com/watch?v=kAVnPGU8CYw', 'F16 Fighter Jet Engine Idle', 'Sound Effect Database', 'лицензия куплена'],
        ['https://www.youtube.com/watch?v=8VIxcncNPVA', 'Flares Sound Effect', 'Sound Effect Database', 'лицензия куплена'],
        ['https://www.youtube.com/watch?v=PCRW2ZQbNxA', 'Bomb distant explosion', 'Free Sound Effect', 'YouTube'],
        ['https://www.youtube.com/watch?v=lKmJKFGzwyc', 'Propeller engine loop', 'Free Sound Effect', 'YouTube'],
        ['https://www.youtube.com/watch?v=V4j2Df-S10k', 'Patriot Missile Launch', 'Sound Treasures', 'YouTube'],
        ['https://www.youtube.com/watch?v=zLjGbjdmoOo', '9K720 Iskander-M', 'WarLeaks — Military Blog', 'YouTube'],
        ['https://www.youtube.com/watch?v=bi2AB18biz4', 'Afterburner Sound', 'SOUND Effects Public Domain', 'YouTube'],
        ['https://www.youtube.com/watch?v=zJvVsHkSs_g', 'AIM-9 Sidewinder', 'Booyadee', 'YouTube'],
        ['https://www.youtube.com/watch?v=A76J507nxtE', 'Shahed 136', 'zagros aim', 'YouTube'],
        ['https://www.youtube.com/watch?v=cnzLJ6bco0U', 'Air Raid Siren', 'Sounds', 'YouTube'],
        ['https://www.youtube.com/watch?v=1qUN59Oebe0', 'Missile launch', 'mrkerk12', 'YouTube'],
        ['https://www.youtube.com/watch?v=dw6AvjAyFKs', 'Missile Launch Sound Effects', 'Friendly Free Sounds', 'YouTube'],
      ].map(([u, t, a, l]) => `${A(u, `«${t}»`)} — ${a} (${l})`).join(' · ')}.</p>
      <p class="hint">Остальное в игре реализовано процедурным способом.</p>`;
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
    if (e.target.id === 'sEco') setAudioEcoMode(e.target.value);
    if (e.target.id === 'sVol') { snd.unlock(); snd.setVolume(+e.target.value); }
    for (const [id, k, v] of [['sStick', 'stick', 'vStick'], ['sLook', 'look', 'vLook']]) if (e.target.id === id) { C.sens[k] = +e.target.value; $(v).textContent = '×' + C.sens[k].toFixed(2); C.saveSens(); }
    if (e.target.id === 'sAuto') C.setAuto(e.target.checked);
    if (e.target.id === 'sPerf') { C.perfHud = e.target.checked; ls.set('fortuna_airdef_perfhud', C.perfHud ? '1' : '0'); document.body.classList.toggle('perfhud', C.perfHud); }
    if (e.target.id === 'sFull') { C.GO.fullRes = e.target.checked; ls.set('fortuna_airdef_gfxo', JSON.stringify(C.GO)); }
    if (e.target.id === 'sInv') { C.sens.invert = e.target.checked; C.saveSens(); }
    if (e.target.id === 'sAim') { C.sens.aim = e.target.checked; C.saveSens(); }
    if (e.target.id === 'sKeys') { C.sens.keys = e.target.checked; C.saveSens(); }
    if (e.target.id === 'sPadOn') { C.sens.pad = e.target.checked; C.saveSens(); document.body.classList.toggle('nopad', !C.sens.pad); }
    if (e.target.id === 'sPadK') { C.sens.padK = +e.target.value; $('vPadK').textContent = Math.round(C.sens.padK * 100) + '%'; C.saveSens(); }
    if (e.target.id === 'sFs') C.shell.setFs(e.target.checked);
    if (e.target.id === 'sMute') { snd.unlock(); snd.setMuted(!e.target.checked); C.muteIco(); }
  };
  // Арсенал / Справка / Настройки / Об игре — панель поверх меню; повторное касание, ✕ или Esc — закрыть
  const SHEET = { ref: 'Арсенал', guide: 'Справка', set: 'Настройки', misc: 'Об игре' };
  $('mtabs').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; snd.click(); if (b.dataset.tab === 'research') { C.research.open(); return; } tab = tab === b.dataset.tab ? 'play' : b.dataset.tab; showTab(); }; // «Исследования» — свой экран (research.js)
  $('msClose').onclick = () => { tab = 'play'; snd.click(); showTab(); };
  addEventListener('keydown', (e) => { if (e.code === 'Escape' && C.state === 'menu' && tab !== 'play') { tab = 'play'; showTab(); } });
  function showTab() {
    for (const b of $('mtabs').querySelectorAll('button')) b.classList.toggle('on', b.dataset.tab === tab);
    for (const t of ['play', 'ref', 'guide', 'set', 'misc']) $('tab-' + t).classList.toggle('on', t === tab || t === 'play');
    document.body.classList.toggle('msheetOn', tab !== 'play'); $('msTitle').textContent = SHEET[tab] || '';
    if (tab === 'set') renderSet(); if (tab === 'misc') renderMisc();
  }
  // ── рекорды, советы ──
  function renderStats() {
    const s = stats(), g = setup.game;
    if (g === 'online') { $('lobbyStats').innerHTML = 'Онлайн: авиация против ПВО города, три волны.'; return; }
    if (g === 'photo') { $('lobbyStats').innerHTML = 'Бой идёт сам, вы — оператор камеры.'; return; }
    $('lobbyStats').innerHTML = g === 'training' ? `Обучение: ${Object.values(LESSONS).flat().filter((l) => lessonsDone()[l.id]).length} из ${Object.values(LESSONS).flat().length} уроков пройдено.`
      : g === 'multi' ? (s.multi ? `Рекорд «Мульти-волны»: <b>${s.multi.best.toLocaleString('ru-RU')}</b> очков · боёв ${s.multi.runs}` : 'Мульти-волну пока не играли.')
      : g === 'air' ? (s.air ? `Рекорд вылета: <b>${s.air.best.toLocaleString('ru-RU')}</b> очков · вылетов ${s.air.runs}` : 'Вылетов пока не было.')
        : (s.defense ? `Рекорд обороны: <b>${s.defense.best.toLocaleString('ru-RU')}</b> очков · лучший итог — ${s.defense.waves} волн` : 'Обороны пока не было.');
  }
  let tipI = Math.floor(Math.random() * TIPS.length), tipT = 0;
  function showTip(next) { if (next) tipI = (tipI + 1) % TIPS.length; const el = $('lobbyTip'); el.classList.remove('in'); void el.offsetWidth; el.classList.add('in'); el.innerHTML = `<b>Совет.</b> ${TIPS[tipI]}`; }
  $('lobbyTip').onclick = () => { tipT = 0; showTip(true); };
  setInterval(() => { if (C.state === 'menu' && (tipT += 1) > 12) { tipT = 0; showTip(true); } }, 1000);
  $('startBtn').onclick = () => orientGate(() => { if (setup.game === 'online') { C.online.primary(); return; }
    if (C.realBlock && setup.game === 'air') { snd.deny && snd.deny(); C.research.open(); return; } // «Реализм»: нет купленной подвески — в «Исследования»
    setup.evd = false; C.lastGame = setup.game; C.start(setup.game); }); // на телефоне вертикально — сначала совет повернуть
  // опыт и серебро над режимами (тап — «Исследования»); гость — подсказка войти
  function renderPg() {
    const P = C.progress && C.progress.P; if (!P) { $('pgBar').innerHTML = ''; return; }
    $('pgBar').innerHTML = C.progress.guest ? '<small>Войдите на сайте — опыт и серебро копятся в аккаунте</small>' : `<span class="xp">${ico('xp')}${Math.round(P.xp).toLocaleString('ru-RU')}</span><span>${ico('silver')}${Math.round(P.silver).toLocaleString('ru-RU')}</span>`; // «Исследования» — кнопкой в углу фона (место в колонке — режимам)
  }
  $('pgBar').onclick = () => { snd.click(); C.research.open(); };
  $('resIco').innerHTML = ico('research'); $('resBtn').onclick = () => { snd.click(); C.research.open(); }; // кнопка в углу фона меню
  function render() { renderModeSel(); renderPlay(); renderStats(); renderPg(); }
  $('weatherChip').textContent = `${C.W.name} · ${C.P.name}`;
  render(); renderRef(); renderGuide(); showTip(false);
  // подложка карт: районы и крупные дома (общая для карты вылета и тактической карты обороны)
  const baseCache = {};
  function mapBase(S2) {
    if (baseCache[S2]) return baseCache[S2];
    const c = document.createElement('canvas'); c.width = c.height = S2; const x = c.getContext('2d'), city = C.city;
    if (city.kind === 'autumn') return (baseCache[S2] = autumnMapBase(c, x, city, S2));
    if (city.kind === 'winter') return (baseCache[S2] = winterMapBase(c, x, city, S2));
    const ZC = ['#56603e', '#6f7262', '#7d7f78', '#8f9093', '#7a7569', '#3c5a2e', '#2d5574', '#6d7858', '#77746c'];
    const st = Math.max(2, Math.round(S2 / 400)), step = 2 * CITY.HALF / S2;
    for (let j = 0; j < S2; j += st) for (let i = 0; i < S2; i += st) { x.fillStyle = ZC[city.zoneAt(-CITY.HALF + i * step, -CITY.HALF + j * step)]; x.fillRect(i, j, st, st); }
    const k = S2 / (2 * CITY.HALF), B = city.B;
    x.fillStyle = 'rgba(30,30,36,.6)';
    for (let i = 0; i < B.n; i++) if (B.h[i] > 18) x.fillRect((B.x[i] - B.w[i] / 2 + CITY.HALF) * k, (B.z[i] - B.d[i] / 2 + CITY.HALF) * k, Math.max(1, B.w[i] * k), Math.max(1, B.d[i] * k));
    return (baseCache[S2] = c);
  }
  // зимняя карта — как топографическая: мягкая отмывка (свет с северо-запада + рассеянный), цвет по высоте, горизонтали
  // (сглаженные, толщина — по крутизне), утолщённые — через 500 м; лес — размытой плотностью, лёд — по уровню берега
  function winterMapBase(c, x, city, S2) {
    const H = CITY.HALF, step = 2 * H / S2, img = x.createImageData(S2, S2), d = img.data, gh = city.groundH, e = Math.max(25, step * 0.75), AUT = city.kind === 'autumn';
    const CI = S2 >= 1200 ? 100 : 200, IX = S2 >= 1200 ? 500 : 1000; // шаг горизонталей и утолщённых
    // плотность леса и лёд — по сетке 100 м, потом билинейно (края мягкие)
    const FG = 321, fs = 2 * H / (FG - 1), FD = new Float32Array(FG * FG), ID = new Float32Array(FG * FG);
    for (let j = 0; j < FG; j++) for (let i = 0; i < FG; i++) { const wx = -H + i * fs, wz = -H + j * fs; FD[j * FG + i] = city.zoneAt(wx, wz) === ZONE.PARK ? 1 : 0; ID[j * FG + i] = (AUT ? city.waterAt(wx, wz) : city.iceAt(wx, wz)) ? 1 : 0; }
    const blur = (A) => { const T = A.slice(); for (let j = 1; j < FG - 1; j++) for (let i = 1; i < FG - 1; i++) { const q = j * FG + i; A[q] = (4 * T[q] + T[q - 1] + T[q + 1] + T[q - FG] + T[q + FG]) / 8; } };
    blur(FD); blur(FD); blur(ID);
    const bil = (A, wx, wz) => { const fx = Math.min(FG - 1.001, Math.max(0, (wx + H) / fs)), fz = Math.min(FG - 1.001, Math.max(0, (wz + H) / fs)), i = fx | 0, j = fz | 0, u = fx - i, v = fz - j, q = j * FG + i;
      return (A[q] * (1 - u) + A[q + 1] * u) * (1 - v) + (A[q + FG] * (1 - u) + A[q + FG + 1] * u) * v; };
    const W = city.winter || {}, lakeN = W.LAKE_N_Y, lakeS = W.LAKE_S_Y, damZ = W.DAM_Z;
    const L = [-0.55, 0.7, -0.45], ll = Math.hypot(...L); L[0] /= ll; L[1] /= ll; L[2] /= ll;
    const sm = (a, b, t) => { t = Math.min(1, Math.max(0, (t - a) / (b - a))); return t * t * (3 - 2 * t); };
    for (let j = 0; j < S2; j++) for (let i = 0; i < S2; i++) {
      const wx = -H + (i + 0.5) * step, wz = -H + (j + 0.5) * step, h = gh(wx, wz);
      const hx = (gh(wx + e, wz) - gh(wx - e, wz)) / (2 * e), hz = (gh(wx, wz + e) - gh(wx, wz - e)) / (2 * e), g = Math.hypot(hx, hz), nl = Math.hypot(hx, 1, hz);
      const sh = 0.8 * ((-hx * L[0] + L[1] - hz * L[2]) / nl - L[1]) + 0.2 * (1 / nl - 1); // 0 на равнине
      const f = Math.max(0.7, Math.min(1.12, 1 + sh * 0.6));
      // цвет по высоте: дно долины — светлый снег, к вершинам — серо-голубой; на крутых склонах — камень
      const t = AUT ? sm(60, 750, h) : sm(100, 1700, h); // осень: низины — охра, холмы — бурее
      let r = AUT ? 196 - 40 * t : 214 - 52 * t, gg = AUT ? 184 - 44 * t : 220 - 46 * t, b = AUT ? 140 - 30 * t : 228 - 36 * t;
      const rk = sm(0.75, 1.15, g); r += (138 - r) * rk * 0.6; gg += (134 - gg) * rk * 0.6; b += (132 - b) * rk * 0.6;
      const fo = sm(0.2, 0.8, bil(FD, wx, wz)) * 0.5, FC = AUT ? [170, 118, 72] : [120, 150, 124]; r += (FC[0] - r) * fo; gg += (FC[1] - gg) * fo; b += (FC[2] - b) * fo; // лес: зимой бледно-зелёный, осенью рыжий // лес — бледно-зелёный, рельеф под ним виден
      // лёд: у льда на сетке, а берег — по высоте над уровнем льда
      const iy = AUT ? city.autumn.WY : wz < damZ ? lakeN : Math.max(lakeS, 144 - wz * 0.004), ik = bil(ID, wx, wz) > 0.05 ? 1 - sm(0.4, 2.5, h - iy) : 0;
      const IC = AUT ? [92, 112, 110] : [156, 192, 214]; r += (IC[0] - r) * ik; gg += (IC[1] - gg) * ik; b += (IC[2] - b) * ik; // лёд / вода болота
      // горизонтали: расстояние до ближайшей в пикселях (по крутизне), сглаженная линия
      const dh = Math.abs(h - Math.round(h / CI) * CI), px = dh / (g * step + 1e-6), idx = Math.abs(h - Math.round(h / IX) * IX) < CI / 2;
      const clF = sm(1.5, 3.5, CI / (g * step + 1e-6)); // на кручах горизонтали сливаются — там бледнее
      const cl = (1 - sm(idx ? 0.55 : 0.3, idx ? 1.25 : 0.95, px)) * (idx ? 0.5 : 0.3) * (1 - ik) * (idx ? 0.4 + 0.6 * clF : clF);
      const shore = ik > 0 && ik < 1 ? (1 - Math.abs(ik - 0.5) * 2) * 0.45 : 0;
      const q = (j * S2 + i) * 4, k = f * 0.86;
      d[q] = (r * k) * (1 - cl) + 96 * cl; d[q + 1] = (gg * k) * (1 - cl) + 84 * cl; d[q + 2] = (b * k) * (1 - cl) + 72 * cl;
      if (shore) { d[q] = d[q] * (1 - shore) + 60 * shore; d[q + 1] = d[q + 1] * (1 - shore) + 100 * shore; d[q + 2] = d[q + 2] * (1 - shore) + 135 * shore; }
      d[q + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    const k = S2 / (2 * H);
    x.strokeStyle = 'rgba(40,36,32,.85)'; x.lineCap = 'round';
    for (const r of city.roads || []) { x.lineWidth = Math.max(1, r.w * k * 1.6); x.beginPath(); r.pts.forEach(([px, pz], q) => { const X = (px + H) * k, Y = (pz + H) * k; if (q) x.lineTo(X, Y); else x.moveTo(X, Y); }); x.stroke(); }
    const a = city.airport; x.fillStyle = 'rgba(30,30,34,.9)'; if (a.rwyL) x.fillRect((a.x - a.rwyW / 2 + H) * k - 1, (a.z - a.rwyL / 2 + H) * k, Math.max(2, a.rwyW * k + 2), a.rwyL * k); // ВПП
    const B = city.B; x.fillStyle = 'rgba(30,30,36,.75)';
    for (let i = 0; i < B.n; i++) x.fillRect((B.x[i] - B.w[i] / 2 + H) * k, (B.z[i] - B.d[i] / 2 + H) * k, Math.max(1, B.w[i] * k), Math.max(1, B.d[i] * k));
    return c;
  }
  // «Туманная топь» — карта, по которой читается рельеф: послойная окраска (низина болота — зеленовато-серая, склоны — охра,
  // вершины — светлее), сильная отмывка, горизонтали через 25 м (утолщённые — 100 м), лес — тёмно-оливковый с «крапом»,
  // болото — штриховкой (знак топокарты), овраги — линиями тальвегов, гать — пунктиром, узкоколейка — «шпалами»; подписи местности
  function autumnMapBase(c, x, city, S2) {
    const H = CITY.HALF, step = 2 * H / S2, img = x.createImageData(S2, S2), d = img.data, gh = city.groundH, e = Math.max(25, step * 0.75), A = city.autumn, WY = A.WY;
    const CI = 25, IX = 100;
    const FG = 321, fs = 2 * H / (FG - 1), FD = new Float32Array(FG * FG), ID = new Float32Array(FG * FG), BG = new Float32Array(FG * FG), RV = new Float32Array(FG * FG);
    for (let j = 0; j < FG; j++) for (let i = 0; i < FG; i++) {
      const wx = -H + i * fs, wz = -H + j * fs, q = j * FG + i, w = city.waterAt(wx, wz);
      FD[q] = city.zoneAt(wx, wz) === ZONE.PARK ? 1 : 0; ID[q] = w ? 1 : 0; RV[q] = Math.min(1, city.ravineAt(wx, wz) / 18);
      BG[q] = !w && city.basinD(wx, wz) <= 1.1 && gh(wx, wz) < WY + 4 ? 1 : 0; // заболоченная низина у воды
    }
    const blur = (M) => { const T = M.slice(); for (let j = 1; j < FG - 1; j++) for (let i = 1; i < FG - 1; i++) { const q = j * FG + i; M[q] = (4 * T[q] + T[q - 1] + T[q + 1] + T[q - FG] + T[q + FG]) / 8; } };
    blur(FD); blur(FD); blur(ID); blur(BG); blur(RV);
    const bil = (M, wx, wz) => { const fx = Math.min(FG - 1.001, Math.max(0, (wx + H) / fs)), fz = Math.min(FG - 1.001, Math.max(0, (wz + H) / fs)), i = fx | 0, j = fz | 0, u = fx - i, v = fz - j, q = j * FG + i;
      return (M[q] * (1 - u) + M[q + 1] * u) * (1 - v) + (M[q + FG] * (1 - u) + M[q + FG + 1] * u) * v; };
    const L = [-0.55, 0.7, -0.45], ll = Math.hypot(...L); L[0] /= ll; L[1] /= ll; L[2] /= ll;
    const sm = (a, b, t) => { t = Math.min(1, Math.max(0, (t - a) / (b - a))); return t * t * (3 - 2 * t); };
    const mix = (C1, C2, t) => [C1[0] + (C2[0] - C1[0]) * t, C1[1] + (C2[1] - C1[1]) * t, C1[2] + (C2[2] - C1[2]) * t];
    // шкала высот: низина → склон → холм → вершина (над уровнем воды)
    const HY = [[0, [150, 160, 128]], [30, [176, 170, 128]], [120, [190, 166, 116]], [260, [178, 140, 96]], [420, [204, 186, 160]]];
    const hyp = (h) => { const a = h - WY; for (let k = 1; k < HY.length; k++) if (a < HY[k][0]) return mix(HY[k - 1][1], HY[k][1], sm(0, 1, (a - HY[k - 1][0]) / (HY[k][0] - HY[k - 1][0]))); return HY[HY.length - 1][1]; };
    const sp = Math.max(5, Math.round(S2 / 180)); // шаг значков (штриховка болота, крап леса), пикс.
    for (let j = 0; j < S2; j++) for (let i = 0; i < S2; i++) {
      const wx = -H + (i + 0.5) * step, wz = -H + (j + 0.5) * step, h = gh(wx, wz);
      const hx = (gh(wx + e, wz) - gh(wx - e, wz)) / (2 * e), hz = (gh(wx, wz + e) - gh(wx, wz - e)) / (2 * e), g = Math.hypot(hx, hz), nl = Math.hypot(hx, 1, hz);
      const sh = 0.8 * ((-hx * L[0] + L[1] - hz * L[2]) / nl - L[1]) + 0.2 * (1 / nl - 1);
      const f = Math.max(0.55, Math.min(1.2, 1 + sh * 1.1)); // отмывка сильнее, чем на зимней: холмы и овраги объёмные
      let [r, gg, b] = hyp(h);
      const rv = sm(0.15, 0.7, bil(RV, wx, wz)); r += (120 - r) * rv * 0.3; gg += (92 - gg) * rv * 0.3; b += (66 - b) * rv * 0.3; // дно и склоны оврагов — бурее
      const fo = sm(0.3, 0.8, bil(FD, wx, wz)); r += (112 - r) * fo * 0.36; gg += (118 - gg) * fo * 0.36; b += (80 - b) * fo * 0.36; // лес — тёмно-оливковый
      if (fo > 0.6 && (i % sp === ((j / sp | 0) % 2 ? sp >> 1 : 0)) && j % sp === 0) { r *= 0.8; gg *= 0.82; b *= 0.8; } // крап — «деревья»
      const ik = bil(ID, wx, wz) > 0.05 ? 1 - sm(0.3, 2.2, h - WY) : 0; [r, gg, b] = mix([r, gg, b], [78, 104, 112], ik); // вода
      const bg = sm(0.3, 0.7, bil(BG, wx, wz)) * (1 - ik);
      if (bg > 0) { [r, gg, b] = mix([r, gg, b], [138, 152, 136], bg * 0.6); if (j % sp === 0 && (i + (j / sp | 0) * 3) % sp < sp * 0.55) [r, gg, b] = mix([r, gg, b], [58, 92, 118], bg * 0.85); } // болото: штриховка
      const dh = Math.abs(h - Math.round(h / CI) * CI), px = dh / (g * step + 1e-6), idx = Math.abs(h - Math.round(h / IX) * IX) < CI / 2;
      const clF = sm(1.2, 3, CI / (g * step + 1e-6));
      const cl = (1 - sm(idx ? 0.5 : 0.3, idx ? 1.2 : 0.9, px)) * (idx ? 0.55 : 0.22) * (1 - ik) * (idx ? 0.5 + 0.5 * clF : clF);
      const q = (j * S2 + i) * 4, k = f * 0.9;
      d[q] = r * k * (1 - cl) + 110 * cl; d[q + 1] = gg * k * (1 - cl) + 78 * cl; d[q + 2] = b * k * (1 - cl) + 50 * cl; d[q + 3] = 255; // горизонтали — коричневые
    }
    x.putImageData(img, 0, 0);
    const k = S2 / (2 * H), P = (px, pz) => [(px + H) * k, (pz + H) * k], lw = Math.max(1, S2 / 700);
    const line = (pts) => { x.beginPath(); pts.forEach(([px, pz], q) => { const [X, Y] = P(px, pz); if (q) x.lineTo(X, Y); else x.moveTo(X, Y); }); x.stroke(); };
    x.lineCap = x.lineJoin = 'round';
    for (const rv of city.ravines || []) { x.strokeStyle = rv.main ? 'rgba(84,52,30,.75)' : 'rgba(84,52,30,.45)'; x.lineWidth = (rv.main ? 1.6 : 0.9) * lw; line(rv.pts); } // тальвеги оврагов
    for (const r of city.roads || []) {
      x.setLineDash(r.gat ? [3 * lw, 2.5 * lw] : []); x.strokeStyle = 'rgba(52,40,30,.9)'; x.lineWidth = Math.max(1.2, r.w * k * 1.6) * (r.rail ? 0.8 : 1); line(r.pts);
      if (r.rail) { x.setLineDash([3 * lw, 3 * lw]); x.strokeStyle = 'rgba(235,228,210,.9)'; x.lineWidth = Math.max(0.8, r.w * k * 0.7); line(r.pts); }
    }
    x.setLineDash([]);
    const a = city.airport; x.fillStyle = 'rgba(30,30,34,.9)'; if (a.rwyL) x.fillRect((a.x - a.rwyW / 2 + H) * k - 1, (a.z - a.rwyL / 2 + H) * k, Math.max(2, a.rwyW * k + 2), a.rwyL * k);
    const B = city.B; x.fillStyle = 'rgba(40,32,28,.8)';
    for (let i = 0; i < B.n; i++) x.fillRect((B.x[i] - B.w[i] / 2 + H) * k, (B.z[i] - B.d[i] / 2 + H) * k, Math.max(1, B.w[i] * k), Math.max(1, B.d[i] * k));
    // вершина Лысой горы — треугольник с отметкой; подписи местности — курсивом, как на топокарте
    { let bx = A.BALD.x, bz = A.BALD.z, bh = -1e9; for (let dz = -900; dz <= 900; dz += 60) for (let dx = -900; dx <= 900; dx += 60) { const hh = gh(A.BALD.x + dx, A.BALD.z + dz); if (hh > bh) { bh = hh; bx = A.BALD.x + dx; bz = A.BALD.z + dz; } }
      const [X, Y] = P(bx, bz), s = 4 * lw; x.fillStyle = 'rgba(60,40,26,.95)'; x.beginPath(); x.moveTo(X, Y - s); x.lineTo(X + s, Y + s * 0.7); x.lineTo(X - s, Y + s * 0.7); x.closePath(); x.fill();
      label('Лысая гора', bx, bz + 260, 1, Math.round(bh - WY) + ' м'); }
    function label(t, wx, wz, sz = 1, sub = '') {
      const [X, Y] = P(wx, wz), fpx = Math.max(10, Math.round(S2 / 60 * sz));
      x.font = `italic 600 ${fpx}px Georgia, 'Times New Roman', serif`; x.textAlign = 'center'; x.lineWidth = Math.max(2, fpx / 4); x.strokeStyle = 'rgba(236,228,206,.75)'; x.fillStyle = 'rgba(58,40,28,.92)';
      x.strokeText(t, X, Y); x.fillText(t, X, Y);
      if (sub) { x.font = `italic ${Math.round(fpx * 0.8)}px Georgia, serif`; x.strokeText(sub, X, Y + fpx); x.fillText(sub, X, Y + fpx); }
    }
    const BA = A.BASIN || {}; label('Гиблая топь', (BA.x ?? 600) - 900, (BA.z ?? 600) + 1700, 1.25);
    label('Чёрная вода', A.OXBOW.x - A.OXBOW.r * 0.2, A.OXBOW.z - A.OXBOW.r - 250, 0.85);
    { // овраги: тот, где кладбище техники, — «Костяной»; самый длинный из остальных — «Совиный яр»
      const wr = city.objects.find((o) => o.key === 'a_wreck'), dTo = (l) => (wr ? Math.min(...l.pts.map((p) => Math.hypot(p[0] - wr.x, p[1] - wr.z))) : 0);
      const rm = (city.ravines || []).filter((l) => l.main), first = rm.slice().sort((p, q) => dTo(p) - dTo(q))[0];
      const rest = rm.filter((l) => l !== first).sort((p, q) => q.pts.length - p.pts.length), names = ['Костяной овраг', 'Совиный яр'];
      [first, ...rest.slice(0, 1)].forEach((l, n) => { if (!l) return; const p = n || !wr ? l.pts[Math.floor(l.pts.length * 0.55)] : l.pts.reduce((m, q) => (Math.hypot(q[0] - wr.x, q[1] - wr.z) < Math.hypot(m[0] - wr.x, m[1] - wr.z) ? q : m)); label(names[n], p[0], p[1] + (n ? -220 : 520), 0.8); }); }
    return c;
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
