// Главное меню: слева - режимы, справа - «папка задания» (настройки режима и старт), Арсенал / Справка / Настройки /
// Об игре - панель поверх. Фон - готовые кадры (menubg.js), пока их нет - живой бой (director.js).
import { LANG, LANGS, LOCALE, setLang, tr, trIf, trDom } from './i18n.js?v=20261126b';
import { CITY, ZONE } from './city.js?v=20261126b';
import { AG, SAM, ERAS, LOADOUTS, DEFENSE, SAM_TYPE, AG_KIND, SAM_COST, PLANES, loadoutsOf, loadoutRole, loadoutTargets, ROLE_NAME, COMBINED, CARRIERS, MULTI, multiBudget, multiItems } from './arsenal.js?v=20261126b';
import { combinedOk, COMBINED_NAME, levelIn, levelOfSams } from './sim/combined.js?v=20261126b';
import { MODES } from './sim/strike.js?v=20261126b';
import { WEATHERS } from '../drone/world.js?v=20261126b';
import { WINTER_KEYS } from './winter-render.js?v=20261126b';
import { LESSONS } from './training.js?v=20261126b';
import { MODEL_CREDITS, modelUrls, planeMeta, stationsFor, podBuiltIn } from './models.js?v=20261126b';
import { storageInfo, prefetchAll, prefetchSize, offlineOk } from './offline.js?v=20261126b';
import { openLayoutEditor } from './layout.js?v=20261126b';
import { orientGate } from '../orient-warn.js?v=20261011a';
import { ECO_SELECT, setAudioEcoMode } from '../drone/audio.js?v=20261126b';
import { photoItems } from './photo.js?v=20261126b';
import { guideChapters } from './guide.js?v=20261126b';
import { iconize, ico, capsHtml } from './icons.js?v=20261126b';
import { NODE, owned, researched, canBuy, canResearch, retiredHidden } from './progress.js?v=20261126b';
const loadInBayUi = (L) => { const s = stationsFor(L.plane, L.items.map(([q]) => q)); return s.internal && !s.mixed; }; // весь груз в отсеках (Су-57 - по загрузке)

const LOC = LOCALE; // разделитель тысяч в числах
const GAMES = [
  { k: 'air', name: tr('Вылет'), desc: tr('за самолёт: прорвать ПВО и уничтожить цели') },
  { k: 'defense', name: tr('Оборона'), desc: tr('за ПВО: отразить волны налётов на город') },
  { k: 'multi', name: tr('Мульти-волна'), desc: tr('ракеты, дроны и баллистика: за атакующую волну или за ПВО') },
  { k: 'training', name: tr('Обучение'), desc: tr('по шагам, с объяснениями, проиграть нельзя') },
  { k: 'online', name: tr('Онлайн'), desc: tr('командные бои с другими игроками: авиация против ПВО') },
  { k: 'photo', name: tr('Режим съёмки'), desc: tr('автобой и свободная камера: красивые кадры') },
];
const TIPS = [
  tr('Здания закрывают РЛС обзор: на малой высоте между домами комплекс видит вас урывками и не успевает выстрелить.'),
  tr('Лазерную бомбу нужно подсвечивать до попадания. Отвернули так, что контейнер закрыло корпусом, - бомба упадёт мимо.'),
  tr('Shrike летит только на включённую РЛС. HARM и Х-58 помнят место станции - спасёт лишь переезд.'),
  tr('Против полуактивной ракеты («Куб», Hawk) - «траверз»: поставьте РЛС на 3 или 9 часов и снижайтесь, когерентная станция потеряет вас в доплеровском провале.'),
  tr('Диполи хорошо работают против старых РЛС (С-75), а против когерентных - только если идти поперёк луча.'),
  tr('ПЗРК на крышах не видны на СПО: о них предупредит только датчик пуска. Отстреливайте ловушки сразу.'),
  tr('В обороне смотрите на «тени» зон: здание рядом с комплексом может закрыть целый сектор на малой высоте.'),
  tr('Оператору командного ЗРК: «три точки» надёжнее по манёвренной цели, «половинное спрямление» экономит энергию ракеты по быстрой цели, идущей поперёк.'),
  tr('Опытный расчёт выключает РЛС при пуске противорадиолокационной ракеты. В обороне это делаете вы - кнопка «РЛС».'),
  // «ТВ-головки ночью не видят…» - вернуть вместе с ночью (сейчас темнота боя только у ночи: main.js NIGHT; вечером совет был бы неверен)
  tr('Засада: комплекс с выключенной РЛС не виден на СПО и включается, только когда сеть ПВО сообщит о цели рядом.'),
  tr('Пушкам нужно упреждение: ведите ствол в кружок впереди самолёта, а не на сам самолёт.'),
];

export function createMenu(C, { PRESETS, WEATHER_KEYS }) {
  const { $, setup, ls, snd } = C;
  const save = () => C.saveSetup();
  let tab = 'play';
  let trSec = null; // раскрытый раздел учебника (null - тот, где выбранный урок)
  const stats = () => { try { return JSON.parse(ls.get('fortuna_airdef_stats') || '{}') || {}; } catch (_) { return {}; } };
  const seg = (id, cur, items) => `<div class="seg" data-seg="${id}">${items.map(([v, l]) => `<button data-v="${v}" class="${String(v) === String(cur) ? 'on' : ''}">${l}</button>`).join('')}</div>`;
  const tags = (k, t) => `<span class="tag ${k}">${t}</span>`;
  const realLock = () => setup.diff === 'real' && C.progress && C.progress.ready(); // прокачка ограничивает только «Про»
  // ангар (hangar.js): какой самолёт смотрим в ленте; настройки вылета свёрнуты в одну строку над подвеской
  let hgPlane = null, hgSet = false, opSlot = 1, hgSam = null; // hgSam - комплекс, открытый крупно в «Обороне» ангара // opSlot - какой вылет «Операции» выбирается в ленте ангара (1 - охота за ПВО, 2 - штурмовка)
  // таблички подвесок (Mark 2026-11-10, вариант «Таблички»): миниатюра, название и количество; описаний оружия здесь нет - они в «Арсенале»
  const wpnTiles = (L) => L.items.map(([k, n]) => `<span class="hgt${C.hangar && C.hangar.focused() === k ? ' fo' : ''}" data-fw="${k}"><span class="im"><img src="airdef/thumbs/wpn_${k}.webp?v=20261126b" alt="" onerror="this.style.visibility='hidden'"></span><em>${trIf(AG[k].short)}<u>×${n}</u></em></span>`).join('') + (L.pod ? `<span class="hgt pod"><span class="im">${ico('target')}</span><em>${podBuiltIn(L.plane) ? tr('прицел') : tr('контейнер')}</em></span>` : ''); // встроенный прицел («Кайра», «Платан», EOTS) - модель без контейнера (pod: null)

  function renderModeSel() {
    $('modeSel').innerHTML = GAMES.map((g) => `<button data-g="${g.k}" class="${setup.game === g.k ? 'on' : ''}"><b>${g.name}</b><span>${g.desc}</span></button>`).join('');
    const G = GAMES.find((g) => g.k === setup.game) || GAMES[0]; // «папка задания»: режим и что в нём делать
    $('mpKind').textContent = G.name; $('mpTitle').textContent = G.desc[0].toUpperCase() + G.desc.slice(1);
    $('startBtn').textContent = setup.game === 'online' ? C.online.primaryText() : setup.game === 'training' ? tr('Начать урок') : setup.game === 'photo' ? tr('Снимать') : setup.game === 'defense' || (setup.game === 'multi' && setup.mrole !== 'atk') ? tr('К расстановке') : setup.game === 'multi' ? tr('К плану волны') : tr('В бой'); // Mark 2026-11-13: «текст взлет - переделал под В бой»
  }
  // пройденные уроки по id; записи прежнего обучения («air0»… - по номеру) переносятся на те же уроки нового учебника
  const OLD = { air: ['ctl', 'bomb', 'lgb', 'agm', 'arm', 'evade'], def: ['d_plan', 'd_op', 'd_gun', 'd_ir', 'd_arm', 'd_short'] };
  function lessonsDone() { const l = stats().lessons || {}, out = { ...l }; for (const sd in OLD) OLD[sd].forEach((id, i) => { if (l[sd + i]) out[id] = 1; }); return out; }
  // панель задания справа (Mark 2026-10-25): при запуске убрана, выезжает при выборе режима, «›» - убрать; открыта ли - на сеанс вкладки
  // (перезагрузка под карту - при старте боя и в «Съёмке»: панель должна остаться открытой); онлайн по ссылке - сразу открыта
  const mpKey = 'fortuna_airdef_mpanel';
  function panel(on) { document.body.classList.toggle('mpOpen', on); if (C.hangar && C.hangar.panelChanged) C.hangar.panelChanged(); try { sessionStorage.setItem(mpKey, on ? '1' : '0'); } catch (_) { /* нет хранилища - только на эту загрузку */ } }
  { const q = new URLSearchParams(location.search), must = q.get('mp') === '1' || q.has('ad'); let on = q.get('oldbg') !== '1'; /* ангар: подвеска на виду, «›» - убрать */ try { const st = sessionStorage.getItem(mpKey); on = st === '1' || (on && st !== '0'); } catch (_) { /* как есть */ } panel(on || must); }
  $('mpClose').onclick = () => { snd.click(); panel(false); };
  // Арсенал, Справка, Настройки, Об игре (Mark): свёрнуты в кнопку, как табличка разделов
  $('mtFold').innerHTML = ico('cog') + '<span class="supn"></span>'; // отметка непрочитанного ответа поддержки (support-ui.js paintBadges)
  $('mtSup').onclick = (e) => { e.stopPropagation(); snd.click(); $('mtabs').classList.remove('open'); if (C.support) C.support.open(); }; // «Поддержка» в ряду шестерёнки (Mark 2026-11-18)
  $('mtFold').onclick = (e) => { e.stopPropagation(); snd.click(); $('mtabs').classList.toggle('open'); };
  $('hgStrip').onclick = (e) => {
    const ol = e.target.closest('[data-ol]'), nd = e.target.closest('[data-need]'), sm = e.target.closest('[data-sam]');
    const pl = e.target.closest('[data-plo],[data-psam],[data-pmun]'); if (pl) { panel(true); snd.click(); if (pl.dataset.plo) setup.lo = +pl.dataset.plo; else if (pl.dataset.psam) setup.psam = pl.dataset.psam; else setup.pmun = pl.dataset.pmun; save(); render(); return; } // «Съёмка»: что снимать
    if (sm) { panel(true); if (hgSam !== sm.dataset.sam) { snd.click(); hgSam = sm.dataset.sam; } render(); return; } // «Оборона»: комплекс крупно в панели
    if (nd) { snd.click(); C.research.open(nd.dataset.need); return; }
    if (ol) { panel(true); const k = opSlot === 1 ? 'lo1' : 'lo2', v = +ol.dataset.ol; if (setup[k] !== v) { snd.click(); setup[k] = v; save(); } render(); return; } // «Операция»: подвеска выбранного вылета
    const b = e.target.closest('[data-hgp]'); if (!b) return; panel(true); if (b.dataset.hgp === hgPlane) return; snd.click(); hgPlane = b.dataset.hgp; render(); save(); };
  $('modeSel').onclick = (e) => {
    const b = e.target.closest('button'); if (!b) return;
    panel(true); setup.game = b.dataset.g; setup.evd = false; save(); // evd - оборона события на осенней карте (event.js): обычное меню её сбрасывает
    if (setup.game === 'online' && C.RAND_MAPS.includes(C.MAP)) C.ls.set('fortuna_ad_omap', C.MAP); // онлайн «Вылет и оборона»: карту даст комната - пока подходит загруженная
    // смена режима в лобби страницу не перезагружает (Mark 2026-11-17): карту под режим игра загрузит при старте боя (C.start - сразу в бой, за створками);
    // «Съёмка» - как раньше: её панель показывает и выбирает карту загруженной страницы
    if (setup.game === 'photo' && C.wantMap(setup.game, setup.pmap, setup.era, -1, false) !== C.MAP) { const u = new URL(location.href); u.searchParams.delete('mp'); u.searchParams.delete('ad'); if (setup.game === 'online') u.searchParams.set('mp', '1'); location.replace(u.href); return; } // «Мульти-волна» - на зимней карте, остальное - на городе
    if (tab !== 'play') { tab = 'play'; showTab(); } if (C.ctrl && C.ctrl.modeChanged) C.ctrl.modeChanged();
    // ночи в онлайне пока нет (решение Mark 2026-10-12): погода строится при загрузке - перезагрузка вечером, сразу в раздел онлайна
    if (setup.game === 'online' && C.W_KEY === 'night') { const u = new URL(location.href); u.searchParams.set('weather', 'evening'); u.searchParams.set('mp', '1'); location.href = u.href; return; }
    render();
  };
  function renderPlay() {
    const g = setup.game, el = $('tab-play'); C.realBlock = false;
    document.body.classList.toggle('trOn', g === 'training'); // «Обучение»: набор «Учебный класс» (airdef.html, .trOn)
    if (g === 'online') { C.online.panel(el); return; } // онлайн - свой раздел (online.js)
    if (g === 'training' && !setup.tlist) { el.innerHTML = renderFirst(); return; } // «Первые шаги»
    if (g === 'training') {
      const done = lessonsDone(), list = LESSONS[setup.tside], sl = [...el.querySelectorAll('.trSecs, .seg')].map((n) => n.scrollLeft); // прокрутка вбок закладок и переключателей переживает перерисовку
      // учебник: уроки по разделам («Основы», «Системы», «Бомбы»… / «Оборона», «Комплексы»…), номер - сквозной
      const mw = setup.tside === 'matk' || setup.tside === 'mdef'; // учебник «Мульти-волны» - свои две ветки
      // раздел (закладка) - тот, где выбранный урок; клик по закладке только переключает показ (trSec), урок не меняется
      const secs = [...new Set(list.map((l) => l.sec))], cur = secs.includes(trSec) ? trSec : (list[setup.tl] || list[0]).sec, L0 = list[setup.tl] || list[0];
      let h = `<p class="hint trWiz"><button class="fsl" data-fs="wiz"><b>${tr('Первые шаги')}</b><small>${tr('подобрать урок по ответам')}</small></button></p><div class="prow"><span>${tr('Учебник')}</span>${seg('tbook', mw ? 'multi' : 'base', [['base', tr('Вылет и оборона')], ['multi', tr('Мульти-волна')]])}</div>
        <div class="prow"><span>${tr('Сторона')}</span>${seg('tside', setup.tside, mw ? [['matk', tr('За волну')], ['mdef', tr('За ПВО')]] : [['air', tr('За самолёт')], ['heli', tr('За вертолёт')], ['def', tr('За ПВО')]])}</div>${mw ? '' : `
        <div class="prow"><span>${tr('Чьей техникой')}</span>${seg('tnat', setup.tside !== 'def' ? (setup.side === 'east' ? 'west' : 'east') : setup.side, [['east', tr('Восток')], ['west', tr('Запад')]])}</div>`}`;
      // учебник: уроки по разделам («Основы», «Системы», «Бомбы»… / «Оборона», «Комплексы»…) - закладки с «пройдено k/n»; под ними карточки уроков раздела, номер - сквозной
      h += `<div class="trSecs">${secs.map((sec, j) => { const q = list.filter((l) => l.sec === sec); return `<button class="trSec ${sec === cur ? 'on' : ''}" data-trsec="${j}"><span>${trIf(sec)}</span><em>${q.filter((l) => done[l.id]).length}/${q.length}</em></button>`; }).join('')}</div><div class="trGrid">`;
      list.forEach((l, i) => { if (l.sec === cur) h += `<button class="opt trCard ${i === setup.tl ? 'on' : ''} ${done[l.id] ? 'done' : ''}" data-tl="${i}"><i class="trNum">${i + 1}</i><b class="trNm">${trIf(l.name)}</b>${done[l.id] ? '<i class="trMk"></i>' : ''}</button>`; });
      h += `</div><div class="trDesc"><b>${setup.tl + 1}. ${trIf(L0.name)}</b><span>${trIf(L0.desc)}</span></div>`;
      el.innerHTML = h + (mw ? '<p class="hint">' + tr('Каждый урок: объяснение и шаги с подсказками в панели «Урок» (кнопка вверху справа; пока она открыта, игра на паузе). Уроки идут по порядку: от карты и первой покупки до контрольной волны.') + '</p>'
        : '<p class="hint">' + tr('Каждый урок: объяснение, показ (самолёт всё делает сам), затем вы. Проиграть нельзя: урона нет, боеприпасы пополняются. Шаги - в панели «Урок» вверху справа (пока она открыта, игра на паузе). Кнопка «?» объясняет оружие или комплекс.') + '</p>');
      [...el.querySelectorAll('.trSecs, .seg')].forEach((n, i) => { n.scrollLeft = sl[i] || 0; });
      const bar = el.querySelector('.trSecs'), on = bar && bar.querySelector('.on'); // выбранная закладка - в видимой части ряда
      if (on) { const r = on.getBoundingClientRect(), q = bar.getBoundingClientRect(); if (r.right > q.right) bar.scrollLeft += r.right - q.right + 8; else if (r.left < q.left) bar.scrollLeft -= q.left - r.left + 8; }
      return;
    }
    if (g === 'multi') { el.innerHTML = renderMulti(); return; }
    if (g === 'photo') { el.innerHTML = renderPhoto(); return; }
    let h = `<div class="prow"><span>${tr('Режим')}</span>${seg('diff', setup.diff, Object.entries(MODES).map(([k, m]) => [k, trIf(m.name)]))}</div><p class="hint">${trIf(MODES[setup.diff].desc)}</p>
      <div class="prow"><span>${tr('Ранг')}</span>${seg('era', setup.era, ERAS.filter((e) => LOADOUTS[e.id]).map((e) => [e.id, e.short]))}</div>
      <div class="prow">${g === 'defense' ? `<span>${tr('Ваша ПВО')}</span>${seg('side', setup.side, [['east', tr('Советская')], ['west', tr('Западная')]])}` /* вылет (Mark 2026-11-17): выбирается своя авиация, ПВО города - другой стороны */ : `<span>${tr('Ваша авиация')}</span>${seg('aside', setup.side === 'east' ? 'west' : 'east', [['east', tr('Советская')], ['west', tr('Западная')]])}`}</div>`;
    if (g === 'air') {
      const hg = C.hangar && C.hangar.has();
      const setRow = `<p class="hint">${tr('ПВО противника: {0}.', [DEFENSE[setup.side][setup.era].map(([k]) => trIf(SAM[k].short)).join(', ')])}</p>`;
      const segs = h; if (!hg) h += `${setRow}<div class="cat-h">${tr('Подвеска')}</div>`;
      // подвески стороны, которая атакует выбранную ПВО; у каждой - свой самолёт
      const att = setup.side === 'east' ? 'west' : 'east', mine = loadoutsOf(setup.era, att).filter(([L, i]) => !L.heli && (!retiredHidden(C.progress && C.progress.P, L.plane) || (!(C.progress && C.progress.P) && i === setup.lo))); // вертолёты - в событии «Туманная топь» (event.js); снятые с продажи - только у купивших
      // «Про»: только подвески, у которых куплены самолёт и всё оружие (прокачка); закрытая - с замком и «нужно: …»
      const can = ([L]) => !realLock() || C.progress.loadoutOk(L), open = mine.filter(can);
      if (!open.some(([, i]) => i === setup.lo)) setup.lo = (open[0] || mine[0])[1];
      const loBtn = ([L, i], attr, on) => { const miss = can([L]) ? [] : C.progress.loadoutMissing(L);
        return `<button class="opt ${on && !miss.length ? 'on' : ''} ${miss.length ? 'lock' : ''}" ${miss.length ? `data-need="${miss[0].id}"` : `${attr}="${i}"`}><div class="nm"><b>${miss.length ? ico('lock') + ' ' : ''}${trIf(PLANES[L.plane])} · ${trIf(L.name)}</b><span class="role ${loadoutRole(L)}">${trIf(ROLE_NAME[loadoutRole(L)])}</span><span>${L.items.map(([k, n]) => `${trIf(AG[k].short)} ×${n}`).join(' · ')}${L.pod ? (podBuiltIn(L.plane) ? tr(' · прицел') : tr(' · контейнер')) : ''}</span>${loadoutRole(L) !== 'sead' ? `<span class="tgn">${tr('целей: {0} - по силе подвески', [loadoutTargets(L)])}</span>` : ''}${miss.length ? `<span class="need">${tr('{0} - открыть в «Исследованиях»', [C.progress.needText(miss)])}</span>` : ''}</div>${L.items.map(([k]) => tags(AG[k].kind, trIf(AG_KIND[AG[k].kind]).split(',')[0].split(' ')[0])).filter((v, j, a) => a.indexOf(v) === j).join(' ')}</button>`; };
      C.realBlock = !open.length; C.realNeed = null;
      const noneHint = !open.length ? `<p class="hint need">${tr('В «Про» ранга {0} нет подвески за эту сторону. Купите самолёт и оружие в «Исследованиях» или играйте в «Аркаде».', [ERAS[setup.era - 1].short])}</p>` : '';
      if (!hg) h += noneHint;
      // «Операция»: два вылета - сначала охота за ПВО, потом удар (у стороны нет охотничьей подвески - только одиночный вылет)
      const sead = mine.filter(([L]) => loadoutRole(L) === 'sead'), strike = mine.filter(([L]) => loadoutRole(L) !== 'sead');
      const seadOk = sead.filter(can), strikeOk = strike.filter(can);
      const canOp = seadOk.length > 0 && strikeOk.length > 0; if (!canOp) setup.op = false;
      const opRow = canOp ? `<div class="prow"><span>${tr('Вылеты')}</span>${seg('op', setup.op ? 'op' : 'one', [['one', tr('Один вылет')], ['op', tr('Операция: 2 вылета')]])}</div>` : '';
      // ангар (Mark 2026-11-18, макет «Свёрнуто», вариант Б): плашка ранга и строка «звезда · режим · вылеты»; раскрыто - режим и ранги, звёзды своей авиации, плитки «Один вылет / Операция» с самолётами выбранной стороны; без тёмной подложки
      if (hg) { const own = setup.side === 'east' ? 'west' : 'east', sp = sead[0] || mine[0], st = strike[0] || mine[0], cur = (LOADOUTS[setup.era][setup.lo] || st[0]).plane;
        const opT = canOp ? `<div class="seg otiles o2" data-seg="op">${ptile('one', setup.op ? 'op' : 'one', thumb('air_' + cur, 'left:12%;top:4%;width:76%;height:92%'), tr('Один вылет'))}${ptile('op', setup.op ? 'op' : 'one', thumb('air_' + sp[0].plane, 'left:0;top:2%;width:58%;height:70%') + thumb('air_' + st[0].plane, 'right:0;top:26%;width:58%;height:70%'), tr('Операция: 2 вылета'))}</div>` : '';
        h = `<button class="hgTop${hgSet ? ' open' : ''}" data-hgset="1"><b class="hgRank">${tr('Ранг')} ${ERAS[setup.era - 1].short}</b><span class="hgSum hgSf"><i class="hgSt">${STAR_SEG[own]}</i><span class="hgTx">${trIf(MODES[setup.diff].name)} · ${setup.op ? tr('Операция') : tr('Один вылет')}</span></span></button>${hgSet ? `<div class="dset hgd"><div class="drow">${seg('diff', setup.diff, Object.entries(MODES).map(([k, m]) => [k, trIf(m.name)]))}${seg('era', setup.era, ERAS.filter((e) => LOADOUTS[e.id]).map((e) => [e.id, e.short]))}</div><div class="drow">${seg('aside', own, [['east', STAR_SEG.east], ['west', STAR_SEG.west]])}</div>${opT}</div>` : ''}${noneHint}`;
      } else h += opRow;
      if (setup.op) {
        if (!seadOk.some(([, i]) => i === setup.lo1)) setup.lo1 = seadOk[0][1];
        if (!strikeOk.some(([, i]) => i === setup.lo2)) setup.lo2 = strikeOk[0][1];
        if (hg) { // ангар (Mark 2026-11-17, макет «Таблички + лента»): в панели две таблички вылетов - самолёт и оружие миниатюрами; самолёты выбранного вылета - в ленте внизу
          const opTile = (L) => `<span class="hgt hgpl"><span class="im"><img src="airdef/thumbs/air_${L.plane}.webp?v=20261126b" alt="" onerror="this.style.visibility='hidden'"></span><em>${trIf(PLANES[L.plane])}</em></span>`;
          h += [[1, setup.lo1, 'sead', tr('Охота за ПВО')], [2, setup.lo2, 'strike', tr('Штурмовка')]].map(([n, i, rk, rn]) => { const L = LOADOUTS[setup.era][i], inb = planeMeta(L.plane) && loadInBayUi(L);
            return `<div class="opt hgl hgop ${opSlot === n ? 'on' : ''}" role="button" tabindex="0" data-ops="${n}">${opSlot === n ? '<i class="pin"></i>' : ''}<span class="hgh2"><em class="opn">${n}</em><b class="${rk}">${rn}</b>${inb ? `<i>${tr('в отсеках')}</i>` : ''}</span><span class="hgr${inb || opSlot !== n ? ' inb' : ''}">${opTile(L)}${wpnTiles(L)}</span></div>`; }).join('');
          h += `<p class="hint">${tr('Разбитое в 1-м вылете остаётся разбитым · +300 за два возвращения')}</p>`;
          const pool = opSlot === 1 ? sead : strike, cur = opSlot === 1 ? setup.lo1 : setup.lo2;
          $('hgStrip').innerHTML = pool.map(([L, i]) => { const miss = can([L, i]) ? [] : C.progress.loadoutMissing(L);
            return `<button class="hgc op${i === cur && !miss.length ? ' on' : ''}${miss.length ? ' lock' : ''}" ${miss.length ? `data-need="${miss[0].id}"` : `data-ol="${i}"`}><b>${miss.length ? ico('lock') + ' ' : ''}${trIf(PLANES[L.plane])}</b><img src="airdef/thumbs/air_${L.plane}.webp?v=20261126b" alt="" loading="lazy"><span class="hgw">${L.items.map(([k, n]) => `<span><img src="airdef/thumbs/wpn_${k}.webp?v=20261126b" alt="" onerror="this.style.visibility='hidden'"><u>×${n}</u></span>`).join('')}</span></button>`; }).join('');
          const sel = $('hgStrip').querySelector && $('hgStrip').querySelector('.hgc.on'); if (sel && sel.scrollIntoView) sel.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        } else {
          h += `<p class="hint">${tr('Сначала подавить ПВО, потом бить по городу. Разбитое в первом вылете остаётся разбитым, уцелевшие комплексы перезарядятся. Очки считаются за оба вылета, +300 за два возвращения.')}</p>`;
          h += `<div class="cat-h">${tr('Вылет 1 - охота за ПВО')}</div>` + sead.map((x) => loBtn(x, 'data-lo1', x[1] === setup.lo1)).join('');
          h += `<div class="cat-h">${tr('Вылет 2 - штурмовка')}</div>` + strike.map((x) => loBtn(x, 'data-lo2', x[1] === setup.lo2)).join('');
        }
      } else if (hg) {
        // лента внизу - самолёты стороны; в панели - подвески выбранного. Закрытый в «Про» самолёт можно смотреть, «Взлёт» ведёт в «Исследования»
        const planes = mine.map(([L]) => L.plane).filter((p, i, a) => a.indexOf(p) === i), loPlane = LOADOUTS[setup.era][setup.lo].plane;
        if (!planes.includes(hgPlane)) hgPlane = planes.includes(loPlane) ? loPlane : planes[0];
        const own = mine.filter(([L]) => L.plane === hgPlane), ownOpen = own.filter(can);
        if (ownOpen.length && !ownOpen.some(([, i]) => i === setup.lo)) setup.lo = ownOpen[0][1];
        if (!ownOpen.length) { C.realBlock = true; C.realNeed = C.progress.loadoutMissing(own[0][0])[0].id; }
        h += own.map(([L, i]) => { const miss = can([L, i]) ? [] : C.progress.loadoutMissing(L), onn = i === setup.lo && !miss.length;
          return `<div class="opt hgl ${onn ? 'on' : ''} ${miss.length ? 'lock' : ''}" role="button" tabindex="0" ${miss.length ? `data-need="${miss[0].id}"` : `data-lo="${i}"`}>${onn ? '<i class="pin"></i>' : ''}<span class="hgh2"><b>${trIf(ROLE_NAME[loadoutRole(L)])}</b>${miss.length ? `<i class="need">${ico('lock')} ${C.progress.needText(miss)}</i>` : planeMeta(L.plane) && loadInBayUi(L) ? `<i>${tr('в отсеках')}</i>` : ''}</span><span class="hgr${planeMeta(L.plane) && loadInBayUi(L) ? ' inb' : ''}">${wpnTiles(L)}</span></div>`; }).join('');
        $('hgStrip').innerHTML = planes.map((p) => { const lk = !mine.some((x) => x[0].plane === p && can(x)); return `<button class="hgc${p === hgPlane ? ' on' : ''}${lk ? ' lock' : ''}" data-hgp="${p}"><b>${lk ? ico('lock') + ' ' : ''}${trIf(PLANES[p])}</b><img src="airdef/thumbs/air_${p}.webp?v=20261126b" alt="" loading="lazy"></button>`; }).join('');
        const sel = $('hgStrip').querySelector && $('hgStrip').querySelector('.hgc.on'); if (sel && sel.scrollIntoView) sel.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      } else h += mine.map((x) => loBtn(x, 'data-lo', x[1] === setup.lo)).join('') + `<p class="hint">${tr('«Охота за ПВО» - уничтожить комплексы с РЛС, «штурмовка» - цели города.')}</p>`;
      if (!hg) { const L = LOADOUTS[setup.era][setup.op ? setup.lo1 : setup.lo]; // в ангаре описаний оружия нет (Mark 2026-11-10)
        h += `<p class="hint guide">${L.items.map(([k]) => `<b>${trIf(AG[k].short)}</b> - ${trIf(AG[k].guide)}`).join('<br>')}</p>`; }
    } else if (g === 'defense' && C.hangar && C.hangar.has()) {
      // ангар (Mark 2026-11-17, макет «Лента ПВО»): настройки кнопками, комплексы - в ленте внизу, выбранный - крупно с дальностью, высотой и наведением
      const attS = setup.side === 'east' ? 'west' : 'east', csOk = combinedOk(attS, setup.era);
      const STE = '<svg class="ic star" viewBox="0 0 24 24"><path fill="#d8332a" stroke="#f3e7c8" stroke-width="1.2" d="M12 1.8l2.9 7.2 7.6.4-5.9 4.9 2 7.5L12 17.6l-6.6 4.2 2-7.5-5.9-4.9 7.6-.4z"/></svg>';
      const STW = '<svg class="ic star" viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="#28427a" stroke="#f3e7c8" stroke-width="1.2"/><path fill="#fff" d="M12 4.2l2 5 5.3.3-4.1 3.4 1.4 5.2L12 15.2l-4.6 2.9 1.4-5.2-4.1-3.4 5.3-.3z"/></svg>';
      h = `<div class="dset"><div class="drow">${seg('diff', setup.diff, Object.entries(MODES).map(([k, m]) => [k, trIf(m.name)]))}${seg('era', setup.era, ERAS.filter((e) => LOADOUTS[e.id]).map((e) => [e.id, e.short]))}</div>
        <div class="drow">${seg('side', setup.side, [['east', STE], ['west', STW]])}${csOk ? seg('cs', setup.cs === false ? 'off' : 'on', [['on', trIf(COMBINED_NAME)], ['off', tr('Налёт')]]) : ''}</div></div>`;
      const TT = { guns: tr('АРТ'), ir: tr('ИК'), sarh: tr('ПАРЛ'), saclos: tr('ЛВ'), tvm: 'TVM', arh: tr('АРЛ'), jammer: tr('РЭБ'), command: tr('РК') };
      const list = Object.entries(SAM).filter(([, s]) => s.side === setup.side && s.era <= setup.era), lockOf = (k) => realLock() && !C.progress.samOk(k);
      if (!list.some(([k]) => k === hgSam)) hgSam = list[0][0];
      const S = SAM[hgSam], lk = lockOf(hgSam), km = (m) => tr('{0} км', [(m / 1000).toFixed(m < 10000 ? 1 : 0).replace('.0', '')]);
      h += `<div class="opt hgl on dsam${lk ? ' lock' : ''}" ${lk ? `data-need="pvo:${hgSam}"` : ''}><span class="hgh2"><b>${lk ? ico('lock') + ' ' : ''}${trIf(S.short || S.name)}</b>${capsHtml(S, 'def')}<i class="cost">${SAM_COST[hgSam]}</i></span>
        <img class="dpic" src="airdef/thumbs/pvo_${hgSam}.webp?v=20261126b" alt="" onerror="this.style.visibility='hidden'">
        <span class="dst"><span><b>${km(S.rmax)}</b><small>${tr('дальность')}</small></span><span><b>${km(S.hmax)}</b><small>${tr('высота')}</small></span><span class="t-${S.type}"><b>${TT[S.type] || ''}</b><small>${tr('наведение')}</small></span></span>
        ${lk ? `<i class="need">${tr('в «Про» - после покупки в «Исследованиях»')}</i>` : ''}</div>`;
      $('hgStrip').innerHTML = list.map(([k, s]) => { const l = lockOf(k);
        return `<button class="hgc sam${k === hgSam ? ' on' : ''}${l ? ' lock' : ''}" data-sam="${k}"><b>${l ? ico('lock') + ' ' : ''}${trIf(s.short || s.name)}</b><img src="airdef/thumbs/pvo_${k}.webp?v=20261126b" alt="" loading="lazy"><span class="dft"><i class="t-${s.type}">${TT[s.type] || ''}</i><u>${SAM_COST[k]}</u></span></button>`; }).join('');
      const sel = $('hgStrip').querySelector && $('hgStrip').querySelector('.hgc.on'); if (sel && sel.scrollIntoView) sel.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    } else {
      // последняя волна - «Мульти-волна» (если у атакующей стороны в эпохе есть чем ударить)
      const attS = setup.side === 'east' ? 'west' : 'east';
      if (combinedOk(attS, setup.era)) {
        h += `<div class="prow"><span>${tr('Последняя волна')}</span>${seg('cs', setup.cs === false ? 'off' : 'on', [['on', trIf(COMBINED_NAME)], ['off', tr('Обычный налёт')]])}</div>`;
        if (setup.cs !== false) h += `<p class="hint">${tr('{0}: разведчик и {1}, затем крылатые ракеты с нескольких направлений на малой высоте, в конце оперативно-тактические: {2}. Баллистику сбивают только противоракетные комплексы ({3}).', [trIf(COMBINED_NAME), attS === 'east' && setup.era >= 4 ? tr('ударные дроны') : tr('ложные цели'), COMBINED[attS][setup.era].filter(([k]) => AG[k].kind === 'tbm').map(([k]) => trIf(AG[k].short)).join(', ') || tr('нет'), ['s300', 's400', 'patriot', 'pac3', 'bukm3'].filter((k) => SAM[k] && SAM[k].side === setup.side && SAM[k].era <= setup.era).map((k) => trIf(SAM[k].short)).join(', ') || tr('в этом ранге - никто')])}</p>`;
      }
      const list = Object.entries(SAM).filter(([, s]) => s.side === setup.side && s.era <= setup.era);
      h += `<div class="cat-h">${tr('Комплексы в вашем распоряжении')}</div>` + list.map(([k, s]) => { const lk = realLock() && !C.progress.samOk(k);
        return `<div class="opt ${lk ? 'lock' : ''}" ${lk ? `data-need="pvo:${k}"` : ''}><div class="nm"><b>${lk ? ico('lock') + ' ' : ''}${trIf(s.name)}${capsHtml(s, setup.game === 'multi' ? 'multi' : 'def')}</b><span>${tr('{0} · до {1} км, высота до {2} км', [trIf(SAM_TYPE[s.type]), (s.rmax / 1000).toFixed(1), (s.hmax / 1000).toFixed(1)])}</span>${lk ? `<span class="need">${tr('в «Про» - после покупки в «Исследованиях»')}</span>` : ''}</div><span class="pr">${tr('{0} очк', [SAM_COST[k]])}</span></div>`; }).join('') +
        `<p class="hint">${tr('Перед каждой волной расставьте комплексы за очки обороны; между волнами можно докупить, перевезти и продать. Волн: {0}. Поражение - если потеряно 75 % ценности военных объектов. В бою можно сесть в любой комплекс оператором.', [C.WAVES])}</p>`;
        }
    el.innerHTML = h;
  }
  // «Съёмка»: что снимаем (самолёт с подвеской, комплекс ПВО, оружие «Мульти-волны»), эпоха и сторона ПВО города
  // «Съёмка» в ангаре (Mark 2026-11-17, макет «Плитки»): что снимаем, карта и погода - картинками; сторона - снимаемого; самолёты, комплексы или оружие - в ленте внизу
  function renderPhotoHg() {
    const ps = setup.pside || 'air', ms = photoMs(), att = setup.side === 'east' ? 'west' : 'east', SP = SIDE_PIC[ms];
    const wxk = C.MAP === 'winter' ? WINTER_KEYS : WEATHER_KEYS, wxCur = wxk.includes(C.weatherKey) ? C.weatherKey : 'random';
    let h = `<div class="seg otiles og o3" data-seg="pside">${ptile('air', ps, thumb(SP.air, 'left:6%;top:4%;width:88%;height:92%'), tr('Самолёт'))}${ptile('def', ps, thumb(SP.pvo, 'left:6%;top:4%;width:88%;height:92%'), tr('ПВО'))}${ptile('multi', ps, thumb(SP.wave[0], 'left:0;top:10%;width:100%;height:80%'), tr('Волна'))}</div>
      <div class="dset"><div class="seg pmaps" data-seg="pmap">${[['city', 'drone-city-evening', tr('Речной узел')], ['winter', 'gripen-gbu12-snow', tr('Северный рубеж')]].map(([k, img, l]) => `<button data-v="${k}" class="${C.MAP === k ? 'on' : ''}"><img src="airdef/shots/${img}.webp?v=20261126b" alt=""><em>${l}</em></button>`).join('')}</div>
        <div class="seg wxs" data-seg="pwx">${[['random', ''], ...wxk.map((k) => [k, WX_SHORT[k] || trIf(WEATHERS[k].name)])].map(([k, l]) => `<button data-v="${k}" class="${k === wxCur ? 'on' : ''}" style="background:${WX_BG[k] || 'rgba(10,12,9,.8)'}">${k === 'random' ? DICE_I : l}</button>`).join('')}</div>
        <div class="drow">${seg('era', setup.era, ERAS.filter((e) => LOADOUTS[e.id]).map((e) => [e.id, e.short]))}${seg('pms', ms, [['east', STAR_SEG.east], ['west', STAR_SEG.west]])}</div>
        ${ps === 'air' ? `<div class="drow">${seg('palt', setup.palt || 'mid', [['low', tr('250 м')], ['mid', tr('1,5 км')], ['high', tr('4 км')]])}</div>` : ''}
        ${ps === 'def' && combinedOk(att, setup.era) ? `<div class="drow">${seg('pvs', setup.pvs === 'multi' ? 'multi' : 'air', [['air', tr('Против самолётов')], ['multi', trIf(COMBINED_NAME)]])}</div>` : ''}</div>`;
    let strip = '';
    if (ps === 'air') {
      const mine = loadoutsOf(setup.era, att).filter(([L, i]) => !L.heli && (!retiredHidden(C.progress && C.progress.P, L.plane) || (!(C.progress && C.progress.P) && i === setup.lo)));
      if (!mine.some(([, i]) => i === setup.lo)) setup.lo = mine[0][1];
      strip = mine.map(([L, i]) => `<button class="hgc op${i === setup.lo ? ' on' : ''}" data-plo="${i}"><b>${trIf(PLANES[L.plane])}</b><img src="airdef/thumbs/air_${L.plane}.webp?v=20261126b" alt="" loading="lazy"><span class="hgw">${L.items.map(([k, n]) => `<span><img src="airdef/thumbs/wpn_${k}.webp?v=20261126b" alt="" onerror="this.style.visibility='hidden'"><u>×${n}</u></span>`).join('')}</span></button>`).join('');
    } else if (ps === 'def') {
      const list = Object.entries(SAM).filter(([, s]) => s.side === setup.side && s.era <= setup.era && s.type !== 'jammer');
      if (!list.some(([k]) => k === setup.psam)) setup.psam = list[0][0];
      strip = list.map(([k, s]) => `<button class="hgc sam${k === setup.psam ? ' on' : ''}" data-psam="${k}"><b>${trIf(s.short || s.name)}</b><img src="airdef/thumbs/pvo_${k}.webp?v=20261126b" alt="" loading="lazy"></button>`).join('');
    } else {
      const items = photoItems(att);
      if (!items.some(([k]) => k === setup.pmun) && items.length) setup.pmun = items[0][0];
      strip = items.map(([k]) => `<button class="hgc sam${k === setup.pmun ? ' on' : ''}" data-pmun="${k}"><b>${trIf(AG[k].short || AG[k].name)}</b><img src="airdef/thumbs/${AG[k].recon ? SIDE_PIC[att].stages[0] : 'strike_' + k}.webp?v=20261126b" alt="" loading="lazy" onerror="this.onerror=null;this.src='airdef/thumbs/wpn_${k}.webp?v=20261126b'"></button>`).join('');
      if (!items.length) h += `<p class="hint">${tr('В этом ранге у этой стороны нечего снять - выберите другой ранг.')}</p>`;
    }
    $('hgStrip').innerHTML = strip;
    const sel = $('hgStrip').querySelector && $('hgStrip').querySelector('.hgc.on'); if (sel && sel.scrollIntoView) sel.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    return h;
  }
  const DICE_I = '<svg class="ic" viewBox="0 0 24 24"><path fill="currentColor" d="M4 2h16a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm3.5 3.5a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm9 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM12 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm-4.5 4.5a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm9 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4z"/></svg>';
  function renderPhoto() {
    if (C.hangar && C.hangar.has()) return renderPhotoHg();
    const ps = setup.pside || 'air', att = setup.side === 'east' ? 'west' : 'east';
    let h = `<div class="prow"><span>${tr('Снимаем')}</span>${seg('pside', ps, [['air', tr('Самолёт')], ['def', tr('ПВО')], ['multi', tr('Мульти-волна')]])}</div>
      <div class="prow"><span>${tr('Ранг')}</span>${seg('era', setup.era, ERAS.filter((e) => LOADOUTS[e.id]).map((e) => [e.id, e.short]))}</div>
      <div class="prow"><span>${ps === 'def' ? tr('Сторона ПВО') : tr('ПВО города')}</span>${seg('side', setup.side, [['east', tr('Советская')], ['west', tr('Западная')]])}</div>
      <div class="prow"><span>${tr('Карта')}</span>${seg('pmap', C.MAP, [['winter', tr('Северный рубеж')], ['city', tr('Речной узел')]])}</div>
      <div class="prow"><span>${tr('Погода')}</span>${seg('pwx', C.MAP === 'winter' ? (WINTER_KEYS.includes(C.weatherKey) ? C.weatherKey : 'random') : (WEATHER_KEYS.includes(C.weatherKey) ? C.weatherKey : 'random'),
        [['random', tr('Случайная')], ...(C.MAP === 'winter' ? WINTER_KEYS : WEATHER_KEYS).map((k) => [k, trIf(WEATHERS[k].name)])])}</div>
      <p class="hint">${tr('Сейчас: {0}. Смена карты и погоды перезапускает страницу.', [trIf(C.W.name)])}</p>`;
    if (ps === 'air') {
      const mine = loadoutsOf(setup.era, att).filter(([L, i]) => !L.heli && (!retiredHidden(C.progress && C.progress.P, L.plane) || (!(C.progress && C.progress.P) && i === setup.lo))); // вертолёты - в событии «Туманная топь»; пока прогресс не пришёл, выбранный снятый самолёт не сбрасываем
      if (!mine.some(([, i]) => i === setup.lo)) setup.lo = mine[0][1];
      h += `<div class="prow"><span>${tr('Высота')}</span>${seg('palt', setup.palt || 'mid', [['low', tr('250 м')], ['mid', tr('1,5 км')], ['high', tr('4 км')]])}</div><div class="cat-h">${tr('Самолёт и подвеска')}</div>` +
        mine.map(([L, i]) => `<button class="opt ${i === setup.lo ? 'on' : ''}" data-lo="${i}"><div class="nm"><b>${trIf(PLANES[L.plane])} · ${trIf(L.name)}</b><span>${L.items.map(([k, n]) => `${trIf(AG[k].short)} ×${n}`).join(' · ')}${L.pod ? (podBuiltIn(L.plane) ? tr(' · прицел') : tr(' · контейнер')) : ''}</span></div></button>`).join('') +
        '<p class="hint">' + tr('Самолёт сам летит от цели к цели, сбрасывает, пускает и ставит ловушки. Урона нет, подвеска пополняется. Камеру можно привязать к любому оружию на пилоне: сход с подвески и полёт до разрыва. На 250 м контейнер не берёт цели, лазерные и ТВ не пускаются.') + '</p>';
    } else if (ps === 'def') {
      const list = Object.entries(SAM).filter(([, s]) => s.side === setup.side && s.era <= setup.era && s.type !== 'jammer'); // глушилки GPS не пускают - в съёмке снимать нечего (Mark 2026-10-27)
      if (!list.some(([k]) => k === setup.psam)) setup.psam = list[0][0];
      const canM = combinedOk(att, setup.era);
      h += `<div class="prow"><span>${tr('Против')}</span>${seg('pvs', canM && setup.pvs === 'multi' ? 'multi' : 'air', canM ? [['air', tr('Самолётов')], ['multi', trIf(COMBINED_NAME)]] : [['air', tr('Самолётов')]])}</div><div class="cat-h">${tr('Комплекс')}</div>` +
        list.map(([k, s]) => `<button class="opt ${k === setup.psam ? 'on' : ''}" data-psam="${k}"><div class="nm"><b>${trIf(s.name)}${capsHtml(s)}</b><span>${tr('{0} · до {1} км', [trIf(SAM_TYPE[s.type]), (s.rmax / 1000).toFixed(1)])}</span></div></button>`).join('') +
        '<p class="hint">' + tr('Комплекс стоит у цели и отражает налёт за налётом: неуязвим, быстро перезаряжается. Вокруг - ИИ-ПВО города.') + '</p>';
    } else {
      const items = photoItems(att);
      if (!items.some(([k]) => k === setup.pmun) && items.length) setup.pmun = items[0][0];
      h += `<div class="cat-h">${tr('Оружие волны')}</div>` + (items.length ? items.map(([k, via]) => `<button class="opt ${k === setup.pmun ? 'on' : ''}" data-pmun="${k}"><div class="nm"><b>${trIf(AG[k].name)}</b><span>${AG[k].recon ? tr('разведчик') : AG[k].uav ? tr('дрон') : AG[k].kind === 'tbm' ? (via ? tr('аэробаллистическая') : tr('баллистическая, с пусковой')) : tr('крылатая / планирующая')}${via ? tr(' · носитель {0}', [trIf(CARRIERS[via].name)]) : ''}</span></div></button>`).join('')
        : '<p class="hint">' + tr('В этом ранге у этой стороны нечего снять - выберите другой ранг.') + '</p>') +
        '<p class="hint">' + tr('Выбранное оружие снова и снова идёт на город: носитель или пусковая → пуск → полёт → перехват или попадание. ПВО города - ИИ.') + '</p>';
    }
    return h + `<p class="hint">${iconize(tr('{0} Внизу - что снимать и ракурс, справа - зум, скорость (×½, ×¼, стоп-кадр) и ◎ - убрать весь интерфейс (тап по экрану вернёт).', [C.IS_TOUCH ? tr('Тяните по экрану - камера вокруг объекта, два пальца - ближе/дальше.') : tr('Мышь - вокруг объекта, колесо - ближе/дальше, ←/→ ракурс, ↑/↓ объект, H - спрятать интерфейс.')]))}</p>`;
  }
  // «Первые шаги» в обучении: за кого → опыт → первый урок по ответам (решение Mark 2026-10-13). Ответ про опыт ведёт к
  // уроку: впервые - с самого начала, немного - к оружию, уверенно - к защите от ПВО (у ПВО - к защите от ПРР)
  const FIRST = {
    air: { q: tr('Вы уже летали в авиасимуляторах?'), a: [['ctl', tr('Нет, впервые'), tr('начнём с управления самолётом')], ['bomb', tr('Да, немного'), tr('сразу к бомбам и ракетам')], ['evade', tr('Да, уверенно'), tr('к уклонению от ракет ПВО')]] },
    def: { q: tr('Вы уже играли за ПВО в похожих играх?'), a: [['d_plan', tr('Нет, впервые'), tr('начнём с расстановки комплексов')], ['d_op', tr('Да, немного'), tr('сразу к стрельбе из комплекса')], ['d_arm', tr('Да, уверенно'), tr('к защите от противорадарных ракет')]] },
    multi: { q: tr('Что хотите освоить в «Мульти-волне»?'), a: [['matk', tr('Собирать удар'), tr('дроны, крылатые ракеты, баллистика')], ['mdef', tr('Отбивать удар'), tr('ПВО против волны')]] },
  };
  const fs = { side: null, pick: null };
  function renderFirst() {
    const SN = { air: tr('Самолёт'), def: tr('ПВО'), multi: tr('Мульти-волна') }, step = !fs.side ? 0 : fs.pick === null ? 1 : 2;
    const chip = (t, k) => `<span class="fsc ${k}">${t}</span>`;
    let h = `<div class="fsh">${chip(fs.side ? SN[fs.side] + ' ' + ico('ok', 'ii') : tr('За кого'), step === 0 ? 'on' : 'ok')}${chip(fs.side === 'multi' ? tr('Роль') : tr('Опыт'), step === 1 ? 'on' : step > 1 ? 'ok' : '')}${chip(tr('Первый урок'), step === 2 ? 'on' : '')}<button class="fsl" data-fs="list">${tr('Все уроки')}</button></div>`;
    if (step === 0) h += `<div class="fsq">${tr('За кого хотите научиться играть?')}</div>` + [['air', tr('Самолёт'), tr('прорваться через ПВО и поразить цели')], ['def', tr('ПВО'), tr('защитить город от налётов')], ['multi', tr('Мульти-волна'), tr('дроны, ракеты и баллистика')]].map(([k, n, d]) => `<button class="fso" data-fs="side:${k}"><b>${n}</b><span>${d}</span></button>`).join('');
    else if (step === 1) h += `<div class="fsq">${FIRST[fs.side].q}</div>` + FIRST[fs.side].a.map(([, n, d], i) => `<button class="fso" data-fs="pick:${i}"><b>${n}</b><span>${d}</span></button>`).join('') + `<button class="fsl" data-fs="back">${tr('‹ Назад')}</button>`;
    else {
      const L = LESSONS[setup.tside][setup.tl] || LESSONS[setup.tside][0];
      h += `<div class="fsq">${tr('Ваш первый урок')}</div><div class="opt on"><div class="nm"><b>${trIf(L.name)}</b><span>${trIf(L.desc)}</span></div></div>
        <p class="hint">${tr('Урок короткий, проиграть нельзя: объяснение, показ, потом вы. Дальше уроки идут по порядку (список в «Все уроки»).')}</p><button class="fsl" data-fs="reset">${tr('Ответить заново')}</button>`;
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
  // «Мульти-волна» отдельно: роль, сторона игрока, что ждёт. Эпох нет (Mark 2026-10-25): берётся всё открытое, один бюджет; уровень ИИ скрытый (sim/combined.js)
  // ── плитки «Мульти-волны» и «Съёмки» в ангаре (Mark 2026-11-17, макеты «Этапы волны» и «Плитки»): картинки - юниты выбранной стороны ──
  const SIDE_PIC = { east: { air: 'air_e_su24', pvo: 'pvo_s300', wave: ['strike_kalibr', 'strike_shahed'], stages: ['strike_shahed', 'strike_kh55d', 'strike_kalibr', 'strike_iskander'] },
    west: { air: 'air_f16', pvo: 'pvo_patriot', wave: ['strike_tomahawk', 'strike_uav_w'], stages: ['strike_uav_w', 'strike_quail', 'strike_tomahawk', 'strike_atacms'] } };
  const thumb = (n, st) => `<img src="airdef/thumbs/${n}.webp?v=20261126b" alt="" style="${st || ''}" onerror="this.style.visibility='hidden'">`;
  const ptile = (v, cur, pics, l) => `<button data-v="${v}" class="${String(v) === String(cur) ? 'on' : ''}"><span class="opics">${pics}</span><em>${l}</em></button>`;
  const STAR_SEG = { east: '<svg class="ic star" viewBox="0 0 24 24"><path fill="#d8332a" stroke="#f3e7c8" stroke-width="1.2" d="M12 1.8l2.9 7.2 7.6.4-5.9 4.9 2 7.5L12 17.6l-6.6 4.2 2-7.5-5.9-4.9 7.6-.4z"/></svg>',
    west: '<svg class="ic star" viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="#28427a" stroke="#f3e7c8" stroke-width="1.2"/><path fill="#fff" d="M12 4.2l2 5 5.3.3-4.1 3.4 1.4 5.2L12 15.2l-4.6 2.9 1.4-5.2-4.1-3.4 5.3-.3z"/></svg>' };
  const WX_SHORT = { day: tr('день'), morning: tr('утро'), evening: tr('вечер'), sunset: tr('закат'), overcast: tr('туман'), w_clear: tr('ясно'), w_frost: tr('дымка'), w_snow: tr('снег') };
  const WX_BG = { day: 'linear-gradient(#7fb8f0,#dcefff)', morning: 'linear-gradient(#f6c58a,#9ec9f0)', evening: 'linear-gradient(#f08a4b,#5a6ea8)', sunset: 'linear-gradient(#ff7b54,#3b2f63)', overcast: 'linear-gradient(#9aa3ab,#d5d9dd)', w_clear: 'linear-gradient(#8eb6e8,#eef4fb)', w_frost: 'linear-gradient(#c9d6e6,#f2f5f8)', w_snow: 'linear-gradient(#a7b1bc,#e3e8ee)' };
  const photoMs = () => (setup.pside || 'air') === 'def' ? setup.side : setup.side === 'east' ? 'west' : 'east'; // «Съёмка»: сторона снимаемого (самолёт, волна - атакующая; ПВО - своя)
  function renderMulti() {
    if (C.hangar && C.hangar.has()) {
      const atk = setup.mrole === 'atk', me = setup.side, att = atk ? me : me === 'east' ? 'west' : 'east', SP = SIDE_PIC[me];
      let h = `<div class="seg otiles og" data-seg="mrole">${ptile('def', atk ? 'atk' : 'def', thumb(SP.pvo, 'left:10%;top:2%;width:80%;height:96%'), tr('За ПВО'))}${ptile('atk', atk ? 'atk' : 'def', thumb(SP.wave[0], 'left:0;top:8%;width:62%;height:80%') + thumb(SP.wave[1], 'right:0;top:18%;width:50%;height:76%'), tr('За волну'))}</div>
        <div class="dset"><div class="drow">${seg('side', me, [['east', STAR_SEG.east], ['west', STAR_SEG.west]])}${seg('diff', setup.diff, Object.entries(MODES).map(([k, m]) => [k, trIf(m.name)]))}</div></div>
        <div class="mwst"><div class="rlbl">${tr('Как идёт волна')}</div><div class="stages">${SIDE_PIC[att].stages.map((n, i) => `${i ? '<span class="arr">›</span>' : ''}<div class="stg"><span class="im">${thumb(n)}<b>${i + 1}</b></span><em>${[tr('разведка'), tr('дроны и ложные'), tr('крылатые'), tr('баллистика')][i]}</em></div>`).join('')}</div></div>`;
      return h;
    }
    const atk = setup.mrole === 'atk', me = setup.side, att = atk ? me : me === 'east' ? 'west' : 'east';
    let h = `<div class="prow"><span>${tr('Роль')}</span>${seg('mrole', atk ? 'atk' : 'def', [['def', tr('За ПВО')], ['atk', tr('За волну')]])}</div>
      <div class="prow"><span>${tr('Сторона')}</span>${seg('side', me, [['east', tr('Восток')], ['west', tr('Запад')]])}</div>
      <div class="prow"><span>${tr('Режим')}</span>${seg('diff', setup.diff, Object.entries(MODES).map(([k, m]) => [k, trIf(m.name)]))}</div><p class="hint">${trIf(MODES[setup.diff].desc)}</p>
      <p class="hint">${tr('Карта «Северный рубеж»: зимняя горная долина. Объекты разнесены: авиабаза, ГЭС на плотине, РЛС на вершине, арсенал в ущелье. Хребты прикрывают от РЛС и ракет.')}</p>`;
    const items = multiItems(att), carriers = [...new Set(items.map(([, v]) => v).filter(Boolean))].map((v) => trIf(CARRIERS[v].name));
    h += `<div class="cat-h">${tr('Как идёт волна')}</div><p class="hint">${tr('1. <b>Дрон разведчик</b> (без боевой части, с камерой) облетает город и засекает ПВО. 2. <b>{0} и ложные цели</b>: ПВО тратит на них ракеты и включает РЛС. 3. <b>Крылатые ракеты</b>: носители ({1}) заходят из-за края карты и пускают их с рубежа за краем района, куда ПВО не достаёт. Ракеты идут на малой высоте с 2-3 направлений. 4. <b>Баллистика</b>: с пусковых за городом, по крутой дуге с высоты 25-45 км. Расписание не ждёт: несбитые дроны долетают до целей, крылатые и баллистика приходят в свой срок.', [tr('Дроны'), carriers.join(', ') || '-'])}</p>
      <p class="hint">${tr('<b>Баллистику</b> сбивают только противоракетные ЗРК: С-300, С-400, Patriot, PAC-3 (немного «Бук-М3»), и только на снижении, в последние ~20 с. О пуске предупреждает тревога. На карте ромб показывает высоту и время до падения, круг - район падения.')}</p>`;
    if (atk) h += `<div class="cat-h">${tr('За волну')}</div><p class="hint">${tr('Бюджет - <b>{0}</b> очков угрозы, цена единицы - по её силе в бою: дрон и ложная цель - 1-2, крылатая - 5-10, баллистическая - 4-13. Одного типа - не больше 10 (дронов - 12, ложных целей - 8), баллистики - не больше 2. В волну идёт всё открытое оружие вместе. На карте выбираете 1-4 цели, состав, маршруты (до 3 точек), высоту, время прихода (эшелонами или разом) и долю по ПВО. Где ПВО, заранее неизвестно: её засекает разведчик, выдают излучение РЛС и пуски. В бою «Ход волны» показывает, что летит и когда пуски носителей и баллистики; «Смотреть» и «Ждать» - камера к событию, время ×4. ПВО противника - ИИ: чем мощнее оружие в наряде, тем современнее его комплексы. Волна прорвалась, если разрушено 50 % ценности целей.', [multiBudget()])}</p>`;
    else {
      const sams = Object.keys(SAM).filter((k) => !realLock() || C.progress.samOk(k)), comp = COMBINED[att][levelIn(COMBINED[att], levelOfSams(me, sams))] || []; // ожидаемая волна - по скрытому уровню (sim/combined.js)
      h += `<div class="cat-h">${tr('За ПВО')}</div><p class="hint">${tr('Одна большая волна по 3 целям. Расстановка - <b>{0}</b> очков обороны, докупки нет: берите любые открытые комплексы своей стороны, одного типа - не больше 6 (дальних - 2, ПЗРК - 12). Ожидается: {1}. Волна прорвалась, если разрушено 50 % ценности целей. Время в бою можно ускорить ×4; «Смотреть» - камера за ракетой.', [Math.round(MULTI.sam * (setup.diff === 'arcade' ? 1.2 : 1)), comp.filter(([k]) => k !== 'scout' && k !== 'scout_e').map(([k, n]) => `${trIf(AG[k].short)} ×${n}`).join(', ')])}</p>`;
    }
    return h;
  }
  $('tab-play').onclick = (e) => {
    if (setup.game === 'online') { C.online.onClick(e); return; }
    const sum = e.target.closest('[data-hgset]'); if (sum) { snd.click(); hgSet = !hgSet; render(); return; }
    const fw = e.target.closest('.hgl.on .hgr:not(.inb) [data-fw]'); if (fw) { snd.click(); C.hangar.focusWeapon(fw.dataset.fw); render(); return; }
    const ops = e.target.closest('[data-ops]'); if (ops) { const n = +ops.dataset.ops; if (n !== opSlot) { snd.click(); opSlot = n; render(); } return; } // «Операция»: какой вылет выбирать в ленте // оружие выбранной подвески - камера подлетает
    const ts = e.target.closest('[data-trsec]'); if (ts) { const secs = [...new Set(LESSONS[setup.tside].map((l) => l.sec))]; snd.click(); trSec = secs[+ts.dataset.trsec]; render(); return; }
    const f = e.target.closest('[data-fs]'); if (f) { firstClick(f.dataset.fs); snd.click(); render(); return; }
    const nd = e.target.closest('[data-need]'); if (nd) { snd.click(); C.research.open(nd.dataset.need); return; } // закрыто в «Про» - к нужной единице дерева
    const b = e.target.closest('[data-v]'), lo = e.target.closest('[data-lo]'), lo1 = e.target.closest('[data-lo1]'), lo2 = e.target.closest('[data-lo2]'), tl = e.target.closest('[data-tl]');
    if (b) {
      const id = b.parentNode.dataset.seg, v = b.dataset.v;
      if (id === 'diff' || id === 'era' || id === 'side' || id === 'aside') hgPlane = null; // ангар: снова самолёт выбранной подвески
      if (id === 'pmap' || id === 'pwx') { // карта и погода «Съёмки» - перезапуск страницы (строятся при загрузке)
        if (id === 'pmap') setup.pmap = v; else setup.pwx = { ...(setup.pwx || {}), [C.MAP]: v };
        save(); const u = new URL(location.href); u.searchParams.delete('weather'); u.searchParams.delete('map'); location.replace(u.href); return;
      }
      if (id === 'pside') { const ms = photoMs(); setup.pside = v; setup.side = v === 'def' ? ms : ms === 'east' ? 'west' : 'east'; } else if (id === 'pms') setup.side = (setup.pside || 'air') === 'def' ? v : v === 'east' ? 'west' : 'east'; else if (id === 'palt') setup.palt = v; else if (id === 'pvs') setup.pvs = v; else if (id === 'op') setup.op = v === 'op'; else if (id === 'mrole') setup.mrole = v; else if (id === 'cs') setup.cs = v === 'on'; else if (id === 'diff') setup.diff = v; else if (id === 'era') { setup.era = +v; setup.lo = 0; } else if (id === 'side') setup.side = v; else if (id === 'aside') setup.side = v === 'east' ? 'west' : 'east'; else if (id === 'tnat') setup.side = setup.tside !== 'def' ? (v === 'east' ? 'west' : 'east') : v; /* обучение: своя техника; setup.side - сторона ПВО */ else if (id === 'tside') { setup.tside = v; setup.tl = 0; trSec = null; } else if (id === 'tbook') { setup.tside = v === 'multi' ? 'matk' : 'air'; setup.tl = 0; trSec = null; }
    } else if (e.target.closest('[data-psam]')) setup.psam = e.target.closest('[data-psam]').dataset.psam; else if (e.target.closest('[data-pmun]')) setup.pmun = e.target.closest('[data-pmun]').dataset.pmun;
    else if (lo) setup.lo = +lo.dataset.lo; else if (lo1) setup.lo1 = +lo1.dataset.lo1; else if (lo2) setup.lo2 = +lo2.dataset.lo2; else if (tl) setup.tl = +tl.dataset.tl; else return;
    save(); render();
  };
  // ── Арсенал ──
  function specs(s) { return `<table class="tt">${s.specs.map(([a, b]) => `<tr><td>${trIf(a)}</td><td>${trIf(b)}</td></tr>`).join('')}</table>`; }
  function renderRef() {
    let h = `<p class="hint">${tr('Реальные характеристики - округлённые открытые данные. Дальности в игре уменьшены под размер карты.')}</p>`;
    // самолёты: какие подвески несёт каждый
    const PL = { e_su17: [tr('Су-17М4'), tr('СССР · истребитель-бомбардировщик с крылом изменяемой стреловидности: ФАБ, ПРР Х-28 и Х-58, Х-25МЛ.')],
      e_su24: [tr('Су-24М'), tr('СССР / Россия · фронтовой бомбардировщик, встроенная лазерно-телевизионная система «Кайра»: КАБ-500Л, Х-58, Х-29Т, Х-31П.')],
      e_su25: [tr('Су-25'), tr('СССР / Россия · бронированный штурмовик: ФАБ-500, Х-29Т, Х-25МЛ (у Су-25Т - встроенный «Шквал»).')],
      su30: [tr('Су-30'), tr('Россия · двухместный многоцелевой: КАБ-500, УМПК.')],
      mig29: [tr('МиГ-29СМТ'), tr('Россия · лёгкий фронтовой: ПРР Х-31П.')],
      e_su34: [tr('Су-34'), tr('Россия · фронтовой бомбардировщик, встроенный прицельный комплекс «Платан»: КАБ-500С, УМПК, Х-59М, Х-31П.')],
      e_mig31: [tr('МиГ-31БМ'), tr('Россия · перехватчик, в модернизации - ПРР Х-31П против ПВО.')],
      e_su57: [tr('Су-57'), tr('Россия · малозаметный, пока всё оружие в отсеках; большие ракеты - на наружных пилонах и выдают его радарам.')],
      e_f4: ['F-4 Phantom II', tr('США · «Дикая ласка» F-4G - охотник за ПВО: Shrike, HARM.')],
      f18: ['F/A-18 Hornet', tr('США · палубный многоцелевой: Mk 82, GBU-12, JDAM, HARM, AARGM-ER.')],
      f16: ['F-16', tr('США · лёгкий многоцелевой: Mk 82, Maverick, HARM, JASSM.')],
      e_gripen: ['JAS 39 Gripen', tr('Швеция · лёгкий многоцелевой с контейнером LITENING: GBU-12, JDAM.')],
      e_f22: ['F-22A Raptor', tr('США · малозаметный: JDAM и SDB во внутренних отсеках, наведение по GPS (прицельного контейнера нет).')],
      e_f35: ['F-35A Lightning II', tr('США · малозаметный: SDB во внутренних отсеках, встроенная оптико-электронная система EOTS.')] };
    h += `<div class="cat-h">${tr('Самолёты')}</div>` + Object.entries(PL).map(([k, [n, d]]) => `<details class="ref"><summary>${trIf(n)}</summary><div class="body"><p>${trIf(d)}</p><p>${tr('Подвески: {0}.', [Object.entries(LOADOUTS).flatMap(([era, list]) => list.filter((L) => L.plane === k).map((L) => tr('{0} (ранг {1})', [trIf(L.name), ERAS[era - 1].short]))).join('; ')])}</p></div></details>`).join('');
    for (const e of ERAS.filter((x) => LOADOUTS[x.id])) {
      h += `<div class="cat-h">${tr('Зенитные комплексы · ранг {0}', [e.short])}</div>`;
      for (const [k, s] of Object.entries(SAM)) if (s.era === e.id) h += `<details class="ref"><summary>${tags(s.type, { guns: tr('АРТ'), ir: tr('ИК'), sarh: tr('ПАРЛ'), saclos: tr('ЛВ'), tvm: 'TVM', arh: tr('АРЛ'), jammer: tr('РЭБ'), command: tr('РК') }[s.type])} ${trIf(s.name)}${capsHtml(s)}</summary><div class="body">
        <p>${trIf(s.guide)}</p>${specs(s)}<h4>${tr('В игре')}</h4><p>${tr('{0} · {1}-{2} км · высоты {3}-{4} м{5}{6}{7}{8}{9} · стоимость в обороне {10}', [trIf(SAM_TYPE[s.type]), (s.rmin / 1000).toFixed(1), (s.rmax / 1000).toFixed(1), s.hmin, s.hmax, s.radar ? tr(' · РЛС видит цель ЭПР 5 м² с {0} км, захват {1} с{2}', [(s.radar.range / 1000).toFixed(0), s.radar.acq, s.radar.doppler ? tr(', когерентная - есть доплеровский провал') : '']) : s.type === 'jammer' ? tr(' · радиус подавления {0} км', [(s.jamR / 1000).toFixed(0)]) : tr(' · без РЛС - на СПО не виден'), s.channels > 1 ? tr(' · целевых каналов {0}', [s.channels]) : '', s.vls ? tr(' · вертикальный старт') : '', s.antiMun ? tr(' · сбивает бомбы и ракеты') : '', s.optTrack ? tr(' · оптический канал без излучения') : '', SAM_COST[k]])}</p></div></details>`;
      h += `<div class="cat-h">${tr('Ударное оружие · ранг {0}', [e.short])}</div>`;
      for (const [, w] of Object.entries(AG)) if (w.era === e.id) h += `<details class="ref"><summary>${tags(w.kind, { bomb: tr('ФАБ'), lgb: tr('ЛАЗ'), tvb: tr('ТВ'), arm: tr('ПРР'), gps: 'GPS', cruise: tr('КР'), decoy: tr('ЛЦ'), ecm: tr('РЭБ'), rocket: tr('НАР') }[w.kind] || (w.seeker === 'tv' ? tr('ТВ') : tr('ЛАЗ')))} ${trIf(w.name)}</summary><div class="body">
        <p>${trIf(w.guide)}</p>${specs(w)}<h4>${tr('В игре')}</h4><p>${tr('{0}{1} · радиус поражения {2} м', [trIf(AG_KIND[w.kind]), w.rmax ? tr(' · пуск до ≈ {0} км', [(w.rmax / 1000).toFixed(0)]) : '', w.blast])}</p></div></details>`;
    }
    $('tab-ref').innerHTML = h;
  }
  // ── Руководство ──
  function renderGuide() { $('tab-guide').innerHTML = guideChapters(C).map(([t, b], i) => `<details class="ref"${i === 0 ? ' open' : ''}><summary>${t}</summary><div class="body">${iconize(b)}</div></details>`).join(''); }
  // ── Настройки ──
  // «Кастомный»: свои настройки (C.GO → localStorage, применяются перезапуском)
  function customPanel() {
    const o = C.GO, row = (label, key, items, cur) => `<div class="prow"><span>${label}</span><div class="seg" data-go="${key}">${items.map(([v, l]) => `<button data-v="${v}" class="${String(v) === String(cur) ? 'on' : ''}">${l}</button>`).join('')}</div></div>`;
    return `<details class="ref" open><summary>${tr('Кастомный - свои настройки')}</summary><div class="body">
      ${row(tr('Разрешение'), 'rs', [[0.4, '40%'], [0.5, '50%'], [0.6, '60%'], [0.7, '70%'], [0.8, '80%'], [0.9, '90%'], [1, '100%']], o.rs || 1)}
      ${row(tr('Динамическое'), 'dyn', [[1, tr('Вкл')], [0, tr('Выкл')]], o.dyn === false ? 0 : 1)}
      ${row(tr('Цель кадров'), 'fps', [[30, tr('30 к/с')], [60, tr('60 к/с')]], o.fps || 60)}
      ${row(tr('Не ниже'), 'dynMin', [[0.35, '35%'], [0.4, '40%'], [0.5, '50%'], [0.6, '60%'], [0.7, '70%']], o.dynMin || 0.6)}
      ${row(tr('Предел кадров'), 'cap', [[30, tr('30 к/с')], [60, tr('60 к/с')], ...(C.IS_TOUCH ? [] : [[0, tr('Нет')]])], o.cap ?? (C.IS_TOUCH ? 60 : 0))}
      ${row(tr('Контейнер'), 'pod', [['half', tr('30 к/с')], ['full', tr('Каждый кадр')]], o.pod || (C.P.podHalf ? 'half' : 'full'))}
      ${row(tr('Апскейлер'), 'up', [['off', tr('Нет')], ['cas', 'CAS'], ['fsr', 'FSR']], o.up || 'cas')}
      ${row(tr('Сглаживание'), 'aa', [['off', tr('Нет')], ['fxaa', 'FXAA'], ['msaa', 'MSAA']], o.aa || 'msaa')}
      ${row(tr('Тени'), 'sh', [['off', tr('Нет')], ['low', tr('Вблизи')], ['mid', tr('Средние')], ['high', tr('Высокие')]], o.sh || 'mid')}
      ${row(tr('Обновление теней'), 'shRate', [[1, tr('Каждый кадр')], [2, tr('Через кадр')]], o.shRate || 1)}
      ${row(tr('Город'), 'city', [['low', tr('Простой')], ['mid', tr('Средний')], ['full', tr('Полный')]], o.city || 'low')}
      ${row(tr('Деревья'), 'trees', [[0, tr('Нет')], [0.5, tr('Мало')], [1, tr('Обычно')], [1.5, tr('Много')]], o.trees ?? 1)}
      ${row(tr('Текстуры'), 'tex', [['low', tr('Низкие')], ['mid', tr('Обычные')], ['high', tr('Высокие')]], o.tex || 'mid')}
      ${row(tr('Детали улиц'), 'props', [[1, tr('Вкл')], [0, tr('Выкл')]], o.props ? 1 : 0)}
      ${row(tr('Эффекты кадра'), 'fx', [[1, tr('Вкл')], [0, tr('Выкл')]], o.fx === false ? 0 : 1)}
      ${row(tr('Дальность'), 'draw', [[0.6, '60%'], [0.8, '80%'], [1, '100%'], [1.3, '130%']], o.draw || 1)}
      ${row(tr('Облака'), 'clouds', [[0, tr('Нет')], [0.5, tr('Мало')], [1, tr('Обычно')], [2, tr('Много')]], o.clouds ?? 1)}
      ${row(tr('Частицы'), 'parts', [[0.5, tr('Мало')], [1, tr('Обычно')], [1.5, tr('Много')]], o.parts || 1)}
      ${C.IS_TOUCH ? `<label class="chk"><input type="checkbox" id="sFull" ${o.fullRes ? 'checked' : ''}> ${tr('полное разрешение экрана')}</label>` : ''}
      <p class="hint">${tr('Тяжелее всего: разрешение, тени, эффекты кадра, город «Полный» и окно контейнера. Слабому устройству: «Предел кадров 30», «Контейнер 30 к/с», «Тени через кадр» или без теней, разрешение 60-70%. Техника, ракеты, бомбы и самолёты одинаково подробны при любых настройках. «Детали улиц» работают при городе «Средний» или «Полный».')}</p>
      <button class="btn" id="sApplyGfx">${tr('Применить (перезапуск)')}</button></div></details>`;
  }
  // «Скачать всё заранее» (offline.js): модели, текстуры, звуки - в кэш устройства; идёт и при уходе с вкладки «Настройки»
  const pf = { run: false, done: false, k: 0, txt: '', stop: null, mb: 0 };
  // объём - посчитан для этого устройства по списку файлов (offline.js prefetchSize), до ответа - без числа; округление до 10 МБ
  const pfLabel = () => pf.run ? tr('Остановить') : pf.mb ? tr('Скачать всё заранее (≈ {0} МБ, лучше по Wi-Fi)', [pf.mb]) : tr('Скачать всё заранее (лучше по Wi-Fi)');
  let pfAsked = false; const pfSize = () => { if (pfAsked || !offlineOk()) return; pfAsked = true; prefetchSize(modelUrls()).then((b) => { if (!b) { pfAsked = false; return; } pf.mb = Math.round(b / 10485760) * 10; pfShow(); }).catch(() => { pfAsked = false; }); };
  const pfShow = () => { const b = $('pfBar'), f = $('pfFill'), t = $('pfTxt'), btn = $('sPrefetch'); if (f) f.style.width = (pf.k * 100).toFixed(1) + '%'; if (b) b.style.display = pf.run || pf.done ? '' : 'none'; if (t) t.textContent = pf.txt; if (btn) btn.textContent = pfLabel(); };
  function offInfo() { storageInfo().then((s) => { const e = $('offInfo'); if (!e) return; e.textContent = !s.ok ? tr('Хранилище недоступно: ресурсы грузятся при каждом запуске.') : tr('Скачанные модели, текстуры и звуки хранятся на устройстве и не догружаются ни в бою, ни при следующих запусках.') + (s.used != null ? ' ' + tr('Занято: {0} МБ.', [Math.round(s.used)]) : ''); }); }
  async function prefetch() {
    if (pf.run) { pf.stop.stop = true; return; }
    if (!offlineOk()) { pf.txt = tr('Хранилище на этом устройстве недоступно.'); pfShow(); return; }
    pf.run = true; pf.done = false; pf.stop = { stop: false }; pf.k = 0; pf.txt = tr('Скачиваем…'); pfShow();
    const r = await prefetchAll(modelUrls(), (d, n, b, tot) => { pf.k = tot ? b / tot : d / n; pf.txt = tr('Скачано {0} из {1} МБ (файлов {2} из {3})', [Math.round(b / 1048576), Math.round(tot / 1048576), d, n]); pfShow(); }, pf.stop);
    pf.run = false; pf.done = true; pf.txt = pf.stop.stop ? tr('Остановлено. Скачанное сохранено, остальное догрузится по ходу игры.') : r.fail ? tr('Готово. Не скачалось файлов: {0}, они догрузятся по ходу игры.', [r.fail]) : tr('Готово: всё на устройстве, в бою ничего не догружается.'); pfShow(); offInfo();
  }
  // «Газ»: сетка ступеней 0…100 (нажатие - вкл / выкл, не меньше двух) + «Ф» (форсаж, всегда последний) и строка «как пойдёт газ по кнопке»
  const THR_ALL = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
  function thrBox() {
    const on = C.sens.thrSteps, cyc = [...on.map((v) => v + '%'), tr('Ф'), on[0] + '%'].join(' → ');
    return `<div class="thrg">${THR_ALL.map((v) => `<button data-thr="${v}" class="${on.includes(v) ? 'on' : ''}">${v}</button>`).join('')}<button class="ab" disabled title="${tr('Форсаж - всегда последняя ступень')}">${tr('Ф')}</button></div>
      <p class="hint thrc">${tr('Кнопка «Газ»: {0}', [cyc])}</p>`;
  }
  function renderSet() {
    setTimeout(offInfo, 0); setTimeout(pfSize, 0); // «На устройстве»: занято, доступно ли хранилище; объём «Скачать всё»
    $('tab-set').innerHTML = `<div class="cat-h">${tr('Язык · Language')}</div><div class="seg" data-seg="lang">${LANGS.map(([k, l]) => `<button data-v="${k}" class="${k === LANG ? 'on' : ''}">${l}</button>`).join('')}</div>
      <div class="cat-h">${tr('Графика')}</div><div class="gfx-row">${Object.entries(PRESETS).map(([k, p]) => `<button class="gfx ${k === C.gfxKey ? 'on' : ''}" data-gfx="${k}"><b>${p.name}</b></button>`).join('')}</div>
      ${C.gfxKey === 'custom' ? customPanel() : `<div class="prow"><span>${tr('Предел кадров')}</span>${seg('fpsCap', C.fpsCap, [['auto', tr('Авто (60)')], [30, '30'], [45, '45'], [60, '60'], ...(C.IS_TOUCH ? [] : [[0, tr('Нет')]])])}</div>
      ${C.IS_TOUCH ? `<div class="prow"><span>${tr('Чёткость')}</span>${seg('sharp', C.SHARP, [['auto', tr('Обычная')], ['high', tr('Высокая')], ['native', tr('Как у экрана')]])}</div>
      <p class="hint">${tr('Высокая и «как у экрана»: картинка чётче, но больше нагрузка на видеочип и нагрев. Применяется после перезапуска.')}</p>` : ''}`}
      <div class="prow"><span>${tr('Текстуры самолётов')}</span>${seg('texq', C.texQ() === 'opt' ? 'opt' : 'max', [['opt', tr('Оптимизированные')], ['max', tr('Максимальные')]])}</div>
      ${C.texQ() === 'opt' ? '' : `<div class="prow"><span>${tr('Где')}</span>${seg('texw', C.texQ(), [['hangar', tr('В ангаре')], ['battle', tr('В бою')], ['both', tr('Везде')]])}</div>`}
      <p class="hint">${tr('Максимальные: надписи и окраска чётче вблизи, но файлы больше и нужно больше памяти. В бою - только у своего самолёта.')}</p>
      <label class="chk"><input type="checkbox" id="sPerf" ${C.perfHud ? 'checked' : ''}> ${tr('счётчик производительности в бою')}</label>
      <div class="cat-h">${tr('Файлы игры')}</div>
      <p class="hint" id="offInfo">${tr('Скачанные модели, текстуры и звуки хранятся на устройстве и не догружаются ни в бою, ни при следующих запусках.')}</p>
      <button class="btn alt" id="sPrefetch">${pfLabel()}</button>
      <div class="ldbar" id="pfBar" style="margin-top:6px;${pf.run || pf.done ? '' : 'display:none'}"><i id="pfFill" style="width:${pf.k * 100}%"></i></div><p class="hint" id="pfTxt">${pf.txt}</p>
      <p class="hint">${tr('Видеочип: {0}', [String(C.gpuName || '-').replace(/[<>&]/g, '').slice(0, 70)])}</p>
      <div class="cat-h">${tr('Время и погода')}</div>${seg('wx', C.weatherKey, [['random', tr('Случайная')], ...WEATHER_KEYS.map((k) => [k, trIf(WEATHERS[k].name)])])}
      <div class="cat-h">${tr('Управление')}</div>
      <div class="sub">${tr('Экран и кнопки')}</div>
      ${C.IS_TOUCH ? `<button class="btn alt" id="sLayout">${tr('Расположение и размер кнопок…')}</button>` : ''}
      ${C.shell.canFs() ? `<label class="chk"><input type="checkbox" id="sFs" ${C.shell.fsPref ? 'checked' : ''}> ${tr('полный экран')}</label>` : ''}
      ${C.shell.hintKind() ? `<label class="chk"><input type="checkbox" id="sFsHint" ${C.shell.fsHint ? 'checked' : ''}> ${C.shell.hintKind() === 'swipe' ? tr('плашка «Потяните вверх», когда панели Safari видны в бою') : tr('кнопка возврата, когда полный экран слетел в бою')}</label>` : ''}
      <label class="chk"><input type="checkbox" id="sBino" ${C.sens.bino !== false ? 'checked' : ''}> ${tr('кнопка «Бинокль» в вылете (B): вид на цель и на своё оружие, самолёт держит курс')}</label>
      <label class="chk"><input type="checkbox" id="sBinoThr" ${C.sens.binoThreat ? 'checked' : ''}${C.sens.bino === false ? ' disabled' : ''}> ${tr('бинокль работает и при пуске ракеты по вам')}</label>
      <div class="sub">${tr('Самолёт')}</div>
      <label class="chk">${C.IS_TOUCH ? tr('скорость камеры пальцем') : tr('скорость обзора мышью')} <input type="range" id="sStick" min="0.4" max="1.8" step="0.05" value="${C.sens.stick}"> <b id="vStick">×${C.sens.stick.toFixed(2)}</b></label>
      <label class="chk"><input type="checkbox" id="sInv" ${C.sens.invert ? 'checked' : ''}> ${tr('инверсия тангажа: вверх - нос вниз (как в авиасимуляторах)')}</label>
      ${C.IS_TOUCH ? `<label class="chk"><input type="checkbox" id="sAim" ${C.sens.aim !== false ? 'checked' : ''}> ${tr('наведение камерой: самолёт летит туда, куда смотрит камера (выкл - ручка в левой половине экрана)')}</label>` : ''}
      ${C.IS_TOUCH ? `<label class="chk"><input type="checkbox" id="sPadOn" ${C.sens.pad ? 'checked' : ''}> ${tr('крестовина: тангаж и крен кнопками (точные манёвры)')}</label>
      <div id="padRows"${C.sens.pad ? '' : ' style="display:none"'}>
        <div class="prow sr"><span>${tr('крен ↺ ↻')}</span>${seg('padRoll', C.sens.padRoll, [['hold', tr('по удержанию')], ['tap', tr('по нажатию')]])}</div>
        <div class="prow sr"><span>${tr('тангаж ▲ ▼')}</span>${seg('padPitch', C.sens.padPitch, [['hold', tr('по удержанию')], ['tap', tr('по нажатию')]])}</div>
        <p class="hint">${tr('По удержанию: рули отклонены, пока палец на кнопке. По нажатию: нажали - рули отклонены и остаются, нажали ту же кнопку ещё раз - отпущены, противоположную - переключились; тап в середину крестовины - всё выключить.')}</p>
        <p class="hint">${tr('Скорость крена и тангажа зависит от самолёта: масса, скорость, высота, повреждения. Тяжёлый бомбардировщик поворачивает медленнее истребителя.')}</p>
      </div>` : ''}
      <label class="chk"><input type="checkbox" id="sCmBurst" ${C.sens.cmBurst ? 'checked' : ''}> ${tr('ловушки по нажатию: серия из 3 залпов (выкл - один залп). Удержание кнопки или X / C - очередью')}</label>
      <div class="sub">${tr('Газ')}</div>
      <div class="prow sr"><span>${tr('ступени газа в бою')}</span><span class="hint" style="margin:0">${tr('нажмите, чтобы включить или выключить')}</span></div>
      <div id="thrBox">${thrBox()}</div>
      ${C.IS_TOUCH ? `<div class="prow sr"><span>${tr('газ в бою')}</span>${seg('thrMode', C.sens.thrMode, [['btn', tr('кнопка ступенями')], ['slider', tr('ползунок')]])}</div>` : ''}
      <p class="hint">${tr('Форсаж всегда последний, если он есть у самолёта. На ПК W / S - по этим же ступеням, Shift - форсаж.')}</p>
      <div class="sub">${tr('Оператор ЗРК')}</div>
      <label class="chk">${tr('поворот обзора оператора ЗРК')} <input type="range" id="sLook" min="0.3" max="2.5" step="0.05" value="${C.sens.look}"> <b id="vLook">×${C.sens.look.toFixed(2)}</b></label>
      <div class="sub">${tr('Помощь в бою')}</div>
      <label class="chk"><input type="checkbox" id="sAuto" ${C.auto ? 'checked' : ''}> ${tr('«Авто» - помощь в бою (кнопка «Авто» или клавиша T)')}</label>
      <p class="hint">${tr('«Авто» в вылете сбрасывает бомбы и пускает ракеты, у оператора ЗРК назначает цель, пускает и наводит пушку. Помогает, но не идеально: реагирует с задержкой и ошибается. Пилотирование, уклонение и выбор момента остаются за вами.')}</p>
      ${C.IS_TOUCH ? '' : `<label class="chk"><input type="checkbox" id="sKeys" ${C.sens.keys ? 'checked' : ''}> ${tr('подсказки клавиш в бою: панель слева внизу (F1 - вкл. и выкл.)')}</label>`}
      <div class="cat-h">${tr('Звук')}</div><label class="chk"><input type="checkbox" id="sMute" ${snd.muted ? '' : 'checked'}> ${tr('звук включён')}</label>
      <label class="chk">${tr('громкость')} <input type="range" id="sVol" min="0" max="1" step="0.05" value="${snd.volume}"></label>
      ${ECO_SELECT('sEco')}
      <div class="cat-h">${tr('Поддержка')}</div>
      <p class="hint">${tr('Нашли ошибку или есть идея? Напишите нам.')}</p>
      <button class="btn alt" id="sSupport">${tr('Поддержка')}${C.support ? C.support.badge() : ''}</button>`;
    trDom($('tab-set')); // блок «Звук для слабого устройства» - из общего модуля drone/audio.js (русский текст, перевод по словарю)
  }
  // ── Прочее: об игре (дисклеймер) и благодарности авторам моделей, эффектов и звуков ──
  const A = (url, t) => `<a href="${url}" target="_blank" rel="noopener">${t}</a>`;
  function renderMisc() {
    $('tab-misc').innerHTML = `<div class="cat-h">${tr('Об игре')}</div>
      <p class="hint">${tr('Air Superiority Online - игра, созданная исключительно в образовательных и развлекательных целях.')}</p>
      <p class="hint">${tr('Техника, вооружение, камуфляжи, обозначения, 3D-модели, звуки и игровые механики упрощены, несмотря на цель приблизиться к реализму, и служат только для того, чтобы создать атмосферу. Они не обязаны отражать реальные характеристики, тактику и боевое применение и не являются руководством к действию.')}</p>
      <p class="hint">${tr('Город, объекты, позывные и события в игре вымышлены. Любые совпадения с реальными местами, людьми, организациями и событиями случайны.')}</p>
      <p class="hint">${tr('Игра не пропагандирует войну и насилие и не выражает политических позиций. Названия и модели образцов техники используются только для узнаваемости и реалистичности; права на товарные знаки принадлежат их владельцам. Игра не связана с производителями техники, военными ведомствами и игровыми компаниями и не одобрена ими.')}</p>
      <div class="cat-h">${tr('Документы')}</div>
      <p class="hint docs">${[['privacy', tr('Политика конфиденциальности')], ['terms', tr('Правила пользования')], ['account-deletion', tr('Удаление аккаунта и данных')], ['support', tr('Поддержка')]].map(([f, t]) => A(`legal/${f}.html?lang=${LANG}`, t)).join(' · ')}</p>
      <div class="cat-h">${tr('Отдельное спасибо за помощь')}</div>
      <p class="hint">${tr('3D-модели (для игры упрощены, разделены на части, текстуры уменьшены): {0}.', [MODEL_CREDITS.map((m) => `${A(m.url, `«${m.title}»`)} - ${m.author} (${A(m.licenseUrl, m.license)})`).join(' · ')])}</p>
      <p class="hint">${tr('Звуки (обрезаны, обработаны, сведены в моно): {0}.', [[
        ['https://freesound.org/people/puniho/sounds/116677/', 'Stretched Canvas Bass Drum Granulated', 'Puniho', 'CC BY 3.0'],
        ['https://freesound.org/people/Benboncan/sounds/74242/', 'Military Helicopter', 'Benboncan', 'CC BY 4.0'],
        ['https://freesound.org/people/Rmutt/sounds/156906/', 'UH-1 Helicopter', 'Rmutt', 'CC0'],
        ['https://freesound.org/people/qubodup/sounds/189446/', 'Jet Plane Flyby', 'qubodup', 'CC0'],
        ['https://freesound.org/people/qubodup/sounds/163119/', 'Navy Mk 15 Phalanx CIWS Fast Burst', 'qubodup', 'CC0'],
        ['https://freesound.org/people/qubodup/sounds/211617/', 'Far Away Rocket Launch', 'qubodup', 'CC0'],
        ['https://freesound.org/people/Fenodyrie/sounds/565911/', 'Flock of Crows', 'Fenodyrie', 'CC0'],
        ['https://freesound.org/people/invadium/sounds/824805/', 'Cruise missiles interception and fly-by', 'Invadium', 'CC0'],
        ['https://freesound.org/people/SamsterBirdies/sounds/539957/', 'Sonar Ping', 'SamsterBirdies', 'CC0'],
        ['https://freesound.org/people/Kolombooo/sounds/629020/', 'Button click', 'Kolombooo', 'CC0'],
        ['https://www.youtube.com/watch?v=kAVnPGU8CYw', 'F16 Fighter Jet Engine Idle', 'Sound Effect Database', tr('лицензия куплена')],
        ['https://www.youtube.com/watch?v=8VIxcncNPVA', 'Flares Sound Effect', 'Sound Effect Database', tr('лицензия куплена')],
      ].map(([u, t, a, l]) => `${A(u, `«${t}»`)} - ${a} (${l})`).join(' · ')])}</p>`;
  }
  $('tab-set').onclick = (e) => {
    if (e.target.closest && e.target.closest('#sSupport')) { snd.click(); C.support.open(); return; } // окно «Поддержка» (support-ui.js)
    const g = e.target.closest('[data-gfx]'), w = e.target.closest('[data-seg="wx"] [data-v]');
    const go = e.target.closest('[data-go] [data-v]');
    if (go) { // настройка «Кастомного»: запоминаем, применяется кнопкой «Применить»
      const k = go.closest('[data-go]').dataset.go, v = go.dataset.v, num = +v;
      C.GO[k] = k === 'dyn' || k === 'fx' || k === 'props' ? num === 1 : Number.isFinite(num) ? num : v;
      ls.set('fortuna_airdef_gfxo', JSON.stringify(C.GO)); renderSet(); return;
    }
    const tq = e.target.closest('[data-seg="texq"] [data-v], [data-seg="texw"] [data-v]'); if (tq) { snd.click(); const v = tq.dataset.v; C.setTexQ(v === 'max' ? 'hangar' : v); renderSet(); if (C.hangar && C.hangar.refresh) C.hangar.refresh(); return; } // настройка текстур: ангар - сразу, бой - со следующего вылета
    const fc = e.target.closest('[data-seg="fpsCap"] [data-v]'); if (fc) { C.setFpsCap(fc.dataset.v); renderSet(); return; } // предел кадров - сразу, без перезапуска
    const sp = e.target.closest('[data-seg="sharp"] [data-v]'); if (sp) { if (sp.dataset.v !== C.SHARP) { ls.set('fortuna_airdef_sharp', sp.dataset.v); location.reload(); } return; } // чёткость - перезапуск
    const lg = e.target.closest('[data-seg="lang"] [data-v]'); if (lg) { if (lg.dataset.v !== LANG) { setLang(lg.dataset.v); const u = new URL(location.href); u.searchParams.delete('lang'); location.href = u.href; } return; } // язык - перезагрузка (Mark 2026-10-21)
    const th = e.target.closest('[data-thr]'); if (th) { // ступень газа вкл / выкл (минимум две); набор - новым массивом, air.js увидит смену
      const v = +th.dataset.thr, on = C.sens.thrSteps;
      if (on.includes(v)) { if (on.length <= 2) return; C.sens.thrSteps = on.filter((x) => x !== v); } else C.sens.thrSteps = [...on, v].sort((a, b) => a - b);
      snd.click(); C.saveSens(); $('thrBox').innerHTML = thrBox(); return;
    }
    const sg = e.target.closest('[data-seg="padRoll"] [data-v], [data-seg="padPitch"] [data-v], [data-seg="thrMode"] [data-v]'); if (sg) {
      const id = sg.parentNode.dataset.seg, v = sg.dataset.v; snd.click();
      if (id === 'thrMode') { C.sens.thrMode = v === 'slider' ? 'slider' : 'btn'; document.body.classList.toggle('thrSlider', C.IS_TOUCH && C.sens.thrMode === 'slider'); } else C.sens[id] = v === 'tap' ? 'tap' : 'hold';
      C.saveSens(); renderSet(); return;
    }
    if (e.target.id === 'sApplyGfx') { location.reload(); return; }
    if (e.target.id === 'sPrefetch') { prefetch(); return; }
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
    if (e.target.id === 'sBino') { C.sens.bino = e.target.checked; C.saveSens(); document.body.classList.toggle('nobino', !e.target.checked); const t = C.$('sBinoThr'); if (t) t.disabled = !e.target.checked; }
    if (e.target.id === 'sBinoThr') { C.sens.binoThreat = e.target.checked; C.saveSens(); } // бинокль не гаснет при пуске ракеты по самолёту (по умолчанию - гаснет; air.js binoThreat)
    if (e.target.id === 'sAim') { C.sens.aim = e.target.checked; C.saveSens(); }
    if (e.target.id === 'sCmBurst') { C.sens.cmBurst = e.target.checked; C.saveSens(); }
    if (e.target.id === 'sKeys') { C.sens.keys = e.target.checked; C.saveSens(); }
    if (e.target.id === 'sPadOn') { C.sens.pad = e.target.checked; C.saveSens(); document.body.classList.toggle('nopad', !C.sens.pad); const pr = $('padRows'); if (pr) pr.style.display = C.sens.pad ? '' : 'none'; }
    if (e.target.id === 'sFs') C.shell.setFs(e.target.checked);
    if (e.target.id === 'sFsHint') C.shell.setFsHint(e.target.checked); // Mark 2026-10-27: кнопку / плашку полного экрана можно убрать
    if (e.target.id === 'sMute') { snd.unlock(); snd.setMuted(!e.target.checked); C.muteIco(); }
  };
  // Арсенал / Справка / Настройки / Об игре - панель поверх меню; повторное касание, ✕ или Esc - закрыть
  const SHEET = { ref: tr('Арсенал'), guide: tr('Справка'), set: tr('Настройки'), misc: tr('Об игре') };
  $('mtabs').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; snd.click(); $('mtabs').classList.remove('open'); if (b.dataset.tab === 'research') { C.research.open(); return; } tab = tab === b.dataset.tab ? 'play' : b.dataset.tab; showTab(); }; // «Исследования» - свой экран (research.js)
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
    if (g === 'online') { $('lobbyStats').innerHTML = tr('Онлайн: авиация против ПВО города, три волны.'); return; }
    if (g === 'photo') { $('lobbyStats').innerHTML = tr('Бой идёт сам, вы - оператор камеры.'); return; }
    $('lobbyStats').innerHTML = g === 'training' ? tr('Обучение: {0} из {1} уроков пройдено.', [Object.values(LESSONS).flat().filter((l) => lessonsDone()[l.id]).length, Object.values(LESSONS).flat().length])
      : g === 'multi' ? (s.multi ? tr('Рекорд «Мульти-волны»: <b>{0}</b> очков · боёв {1}', [s.multi.best.toLocaleString(LOC), s.multi.runs]) : tr('Мульти-волну пока не играли.'))
      : g === 'air' ? (s.air ? tr('Рекорд вылета: <b>{0}</b> очков · вылетов {1}', [s.air.best.toLocaleString(LOC), s.air.runs]) : tr('Вылетов пока не было.'))
        : (s.defense ? tr('Рекорд обороны: <b>{0}</b> очков · лучший итог - {1} волн', [s.defense.best.toLocaleString(LOC), s.defense.waves]) : tr('Обороны пока не было.'));
  }
  let tipI = Math.floor(Math.random() * TIPS.length), tipT = 0;
  function showTip(next) { if (next) tipI = (tipI + 1) % TIPS.length; const el = $('lobbyTip'); el.classList.remove('in'); void el.offsetWidth; el.classList.add('in'); el.innerHTML = `<b>${tr('Совет.')}</b> ${TIPS[tipI]}`; }
  $('lobbyTip').onclick = () => { tipT = 0; showTip(true); };
  setInterval(() => { if (C.state === 'menu' && (tipT += 1) > 12) { tipT = 0; showTip(true); } }, 1000);
  $('startBtn').onclick = () => orientGate(() => { if (setup.game === 'online') { C.online.primary(); return; }
    if (C.realBlock && setup.game === 'air') { snd.deny && snd.deny(); C.research.open(C.realNeed || undefined); return; } // «Про»: нет купленной подвески - в «Исследования»
    setup.evd = false; C.lastGame = setup.game; C.doors.run(() => C.start(setup.game)); }); // на телефоне вертикально - сначала совет повернуть; вход в бой - за створками
  // опыт и серебро над режимами (тап - «Исследования»); гость - пусто (вход - в строке аккаунта выше)
  function renderPg() {
    const P = C.progress && C.progress.P; if (!P) { $('pgBar').innerHTML = ''; return; }
    $('pgBar').innerHTML = C.progress.guest ? '' : `<span class="xp">${ico('xp')}${Math.round(P.xp).toLocaleString(LOC)}</span><span>${ico('silver')}${Math.round(P.silver).toLocaleString(LOC)}</span>`; // «Исследования» - кнопкой в углу фона (место в колонке - режимам)
  }
  $('pgBar').onclick = () => { snd.click(); C.research.open(); };
  $('resIco').innerHTML = ico('research'); $('resBtn').onclick = () => { snd.click(); C.research.open(); }; // кнопка в углу фона меню
  $('shopIco').innerHTML = ico('gem'); // «Магазин» - окно и подпись кнопки - shop-ui.js
  // разделы (Mark 2026-10-26): при входе свёрнуты в указатель; нажатие разворачивает и складывает обратно (свёрнутые - вне фокуса клавиатуры)
  $('mbFoldIco').innerHTML = ico('signpost');
  const mbOpen = (open) => {
    const mb = $('mbtns'), f = $('mbFold'); mb.classList.toggle('open', open); if (f.setAttribute) f.setAttribute('aria-expanded', open ? 'true' : 'false'); // (заглушка DOM стенда - без setAttribute)
    if (mb.querySelectorAll) for (const b of mb.querySelectorAll('button:not(#mbFold)')) b.inert = !open;
  };
  $('mbFold').onclick = () => { snd.click(); mbOpen(!$('mbtns').classList.contains('open')); };
  mbOpen(false);
  // табличка разделов (Mark 2026-11-04): число и свечение, если цель исследований готова (хватает опыта или серебра) или есть незабранные задания
  function renderNotice() {
    const G = C.progress, P = G && !G.guest && G.P, ready = [];
    if (P && P.goal) for (const id of Object.values(P.goal)) { if (!id || !NODE[id] || owned(P, id)) continue; if (researched(P, id) ? canBuy(P, id).ok : canResearch(P, id).ok) ready.push(id); }
    const n = ready.length + (C.quests ? C.quests.pending() : 0), d = $('mbNote'), sub = $('resSub');
    $('mbFold').classList.toggle('note', n > 0); d.textContent = n || ''; d.style.display = n ? 'block' : 'none';
    $('resBtn').classList.toggle('note', ready.length > 0); sub.style.display = ready.length ? 'block' : 'none';
    sub.textContent = !ready.length ? '' : ready.length > 1 ? tr('Целей готово: {0}', [ready.length]) : tr(researched(P, ready[0]) ? 'Можно купить: {0}' : 'Можно исследовать: {0}', [trIf(NODE[ready[0]].short)]);
  }
  // самолёт в ангаре и подпись кнопки - по тому, что выбрано (в обороне и других режимах - последний выбранный)
  function syncHangar() {
    if (!C.hangar || !C.hangar.has()) return;
    const air = setup.game === 'air' || setup.game === 'defense' || setup.game === 'photo'; // «Съёмка»: в ленте - самолёты, комплексы или оружие волны // лента внизу: самолёты (и в «Операции» - выбранного вылета), в «Обороне» - комплексы
    document.body.classList.toggle('hgAir', air);
    document.body.classList.toggle('hgFlat', setup.game === 'online' || setup.game === 'multi'); // онлайн (Mark 2026-11-17): панель без тёмной подложки, как в макете - плитки и таблички прямо на фоне ангара
    document.body.classList.toggle('hgPlain', ['air', 'defense', 'multi'].includes(setup.game)); // Mark: без описаний режимов в правой панели
    const list = LOADOUTS[setup.era] || [], cur = list[setup.op ? (opSlot === 1 ? setup.lo1 : setup.lo2) : setup.lo], ok = (L) => L && L.plane && !L.heli && PLANES[L.plane];
    const L = setup.game === 'air' && !setup.op && hgPlane && (!cur || cur.plane !== hgPlane) ? list.find((q) => q.plane === hgPlane && ok(q)) : ok(cur) ? cur : list.find(ok);
    if (L) C.hangar.show(L);
    const b = $('startBtn'); if (setup.game === 'air' && C.realBlock) b.textContent = tr('Исследования');
    if (b.classList) b.classList.toggle('long', b.textContent.length > 8);
  }
  function render() { renderModeSel(); renderPlay(); syncHangar(); renderStats(); renderPg(); if (C.account) C.account.render(); if (C.rating) C.rating.touch(); if (C.shop) C.shop.touch(); if (C.quests) C.quests.touch(); if (C.support) C.support.touch(); renderNotice(); } // аккаунт игры и рейтинг - в углу меню
  $('weatherChip').textContent = `${trIf(C.W.name)} · ${C.P.name}`;
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
  // зимняя карта - как топографическая: мягкая отмывка (свет с северо-запада + рассеянный), цвет по высоте, горизонтали
  // (сглаженные, толщина - по крутизне), утолщённые - через 500 м; лес - размытой плотностью, лёд - по уровню берега
  function winterMapBase(c, x, city, S2) {
    const H = CITY.HALF, step = 2 * H / S2, img = x.createImageData(S2, S2), d = img.data, gh = city.groundH, e = Math.max(25, step * 0.75), AUT = city.kind === 'autumn';
    const CI = S2 >= 1200 ? 100 : 200, IX = S2 >= 1200 ? 500 : 1000; // шаг горизонталей и утолщённых
    // плотность леса и лёд - по сетке 100 м, потом билинейно (края мягкие)
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
      // цвет по высоте: дно долины - светлый снег, к вершинам - серо-голубой; на крутых склонах - камень
      const t = AUT ? sm(60, 750, h) : sm(100, 1700, h); // осень: низины - охра, холмы - бурее
      let r = AUT ? 196 - 40 * t : 214 - 52 * t, gg = AUT ? 184 - 44 * t : 220 - 46 * t, b = AUT ? 140 - 30 * t : 228 - 36 * t;
      const rk = sm(0.75, 1.15, g); r += (138 - r) * rk * 0.6; gg += (134 - gg) * rk * 0.6; b += (132 - b) * rk * 0.6;
      const fo = sm(0.2, 0.8, bil(FD, wx, wz)) * 0.5, FC = AUT ? [170, 118, 72] : [120, 150, 124]; r += (FC[0] - r) * fo; gg += (FC[1] - gg) * fo; b += (FC[2] - b) * fo; // лес: зимой бледно-зелёный, осенью рыжий // лес - бледно-зелёный, рельеф под ним виден
      // лёд: у льда на сетке, а берег - по высоте над уровнем льда
      const iy = AUT ? city.autumn.WY : wz < damZ ? lakeN : Math.max(lakeS, 144 - wz * 0.004), ik = bil(ID, wx, wz) > 0.05 ? 1 - sm(0.4, 2.5, h - iy) : 0;
      const IC = AUT ? [92, 112, 110] : [156, 192, 214]; r += (IC[0] - r) * ik; gg += (IC[1] - gg) * ik; b += (IC[2] - b) * ik; // лёд / вода болота
      // горизонтали: расстояние до ближайшей в пикселях (по крутизне), сглаженная линия
      const dh = Math.abs(h - Math.round(h / CI) * CI), px = dh / (g * step + 1e-6), idx = Math.abs(h - Math.round(h / IX) * IX) < CI / 2;
      const clF = sm(1.5, 3.5, CI / (g * step + 1e-6)); // на кручах горизонтали сливаются - там бледнее
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
  // «Туманная топь» - карта, по которой читается рельеф: послойная окраска (низина болота - зеленовато-серая, склоны - охра,
  // вершины - светлее), сильная отмывка, горизонтали через 25 м (утолщённые - 100 м), лес - тёмно-оливковый с «крапом»,
  // болото - штриховкой (знак топокарты), овраги - линиями тальвегов, гать - пунктиром, узкоколейка - «шпалами»; подписи местности
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
      const rv = sm(0.15, 0.7, bil(RV, wx, wz)); r += (120 - r) * rv * 0.3; gg += (92 - gg) * rv * 0.3; b += (66 - b) * rv * 0.3; // дно и склоны оврагов - бурее
      const fo = sm(0.3, 0.8, bil(FD, wx, wz)); r += (112 - r) * fo * 0.36; gg += (118 - gg) * fo * 0.36; b += (80 - b) * fo * 0.36; // лес - тёмно-оливковый
      if (fo > 0.6 && (i % sp === ((j / sp | 0) % 2 ? sp >> 1 : 0)) && j % sp === 0) { r *= 0.8; gg *= 0.82; b *= 0.8; } // крап - «деревья»
      const ik = bil(ID, wx, wz) > 0.05 ? 1 - sm(0.3, 2.2, h - WY) : 0; [r, gg, b] = mix([r, gg, b], [78, 104, 112], ik); // вода
      const bg = sm(0.3, 0.7, bil(BG, wx, wz)) * (1 - ik);
      if (bg > 0) { [r, gg, b] = mix([r, gg, b], [138, 152, 136], bg * 0.6); if (j % sp === 0 && (i + (j / sp | 0) * 3) % sp < sp * 0.55) [r, gg, b] = mix([r, gg, b], [58, 92, 118], bg * 0.85); } // болото: штриховка
      const dh = Math.abs(h - Math.round(h / CI) * CI), px = dh / (g * step + 1e-6), idx = Math.abs(h - Math.round(h / IX) * IX) < CI / 2;
      const clF = sm(1.2, 3, CI / (g * step + 1e-6));
      const cl = (1 - sm(idx ? 0.5 : 0.3, idx ? 1.2 : 0.9, px)) * (idx ? 0.55 : 0.22) * (1 - ik) * (idx ? 0.5 + 0.5 * clF : clF);
      const q = (j * S2 + i) * 4, k = f * 0.9;
      d[q] = r * k * (1 - cl) + 110 * cl; d[q + 1] = gg * k * (1 - cl) + 78 * cl; d[q + 2] = b * k * (1 - cl) + 50 * cl; d[q + 3] = 255; // горизонтали - коричневые
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
    // вершина Лысой горы - треугольник с отметкой; подписи местности - курсивом, как на топокарте
    { let bx = A.BALD.x, bz = A.BALD.z, bh = -1e9; for (let dz = -900; dz <= 900; dz += 60) for (let dx = -900; dx <= 900; dx += 60) { const hh = gh(A.BALD.x + dx, A.BALD.z + dz); if (hh > bh) { bh = hh; bx = A.BALD.x + dx; bz = A.BALD.z + dz; } }
      const [X, Y] = P(bx, bz), s = 4 * lw; x.fillStyle = 'rgba(60,40,26,.95)'; x.beginPath(); x.moveTo(X, Y - s); x.lineTo(X + s, Y + s * 0.7); x.lineTo(X - s, Y + s * 0.7); x.closePath(); x.fill();
      label(tr('Лысая гора'), bx, bz + 260, 1, Math.round(bh - WY) + tr(' м')); }
    function label(t, wx, wz, sz = 1, sub = '') {
      const [X, Y] = P(wx, wz), fpx = Math.max(10, Math.round(S2 / 60 * sz));
      x.font = `italic 600 ${fpx}px Georgia, 'Times New Roman', serif`; x.textAlign = 'center'; x.lineWidth = Math.max(2, fpx / 4); x.strokeStyle = 'rgba(236,228,206,.75)'; x.fillStyle = 'rgba(58,40,28,.92)';
      x.strokeText(t, X, Y); x.fillText(t, X, Y);
      if (sub) { x.font = `italic ${Math.round(fpx * 0.8)}px Georgia, serif`; x.strokeText(sub, X, Y + fpx); x.fillText(sub, X, Y + fpx); }
    }
    const BA = A.BASIN || {}; label(tr('Гиблая топь'), (BA.x ?? 600) - 900, (BA.z ?? 600) + 1700, 1.25);
    label(tr('Чёрная вода'), A.OXBOW.x - A.OXBOW.r * 0.2, A.OXBOW.z - A.OXBOW.r - 250, 0.85);
    { // овраги: тот, где кладбище техники, - «Костяной»; самый длинный из остальных - «Совиный яр»
      const wr = city.objects.find((o) => o.key === 'a_wreck'), dTo = (l) => (wr ? Math.min(...l.pts.map((p) => Math.hypot(p[0] - wr.x, p[1] - wr.z))) : 0);
      const rm = (city.ravines || []).filter((l) => l.main), first = rm.slice().sort((p, q) => dTo(p) - dTo(q))[0];
      const rest = rm.filter((l) => l !== first).sort((p, q) => q.pts.length - p.pts.length), names = [tr('Костяной овраг'), tr('Совиный яр')];
      [first, ...rest.slice(0, 1)].forEach((l, n) => { if (!l) return; const p = n || !wr ? l.pts[Math.floor(l.pts.length * 0.55)] : l.pts.reduce((m, q) => (Math.hypot(q[0] - wr.x, q[1] - wr.z) < Math.hypot(m[0] - wr.x, m[1] - wr.z) ? q : m)); label(names[n], p[0], p[1] + (n ? -220 : 520), 0.8); }); }
    return c;
  }
  return {
    show() { render(); showTab(); $('menu').classList.add('on'); },
    render, notice: renderNotice, mapBase, panel,
    record(game, score, extra = {}) {
      const s = stats(), r = s[game] || { best: 0, runs: 0, waves: 0 };
      r.runs++; r.best = Math.max(r.best, score); if (extra.waves) r.waves = Math.max(r.waves, extra.waves);
      s[game] = r; ls.set('fortuna_airdef_stats', JSON.stringify(s));
    },
    lessonDone(id) { const s = stats(); s.lessons = s.lessons || {}; s.lessons[id] = 1; ls.set('fortuna_airdef_stats', JSON.stringify(s)); },
  };
}
