// Сложность одиночной игры (Mark 2026-10-20): режим (Аркада / Реализм) + скрытая подстройка под игрока.
// Подстройка — рейтинг r от −1 до +1 на каждый режим игры (вылет, оборона, «Мульти-волна»), хранится в браузере:
// победа — на ступень сильнее ПВО и налёты, поражение — слабее (сильнее, чем после победы: застрять в проигрышах хуже).
// Игроку не показывается. Онлайн не трогает (там противник — люди и сервер), обучение и «Съёмку» — тоже.
const KEY = 'fortuna_airdef_skill';
const GAMES = ['air', 'defense', 'multi', 'multi_atk']; // «Мульти-волна» — отдельно за ПВО (multi) и за удар (multi_atk)
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function createDifficulty(ls) {
  let R = {}; try { R = JSON.parse(ls.get(KEY) || '{}') || {}; } catch (_) { R = {}; }
  const save = () => { try { ls.set(KEY, JSON.stringify(R)); } catch (_) { /* без хранилища — в памяти */ } };
  const r = (game) => clamp(+R[game] || 0, -1, 1);
  return {
    r,
    // итог боя: win — победа (у вылета — цели разбиты и вернулся)
    result(game, win) {
      if (!GAMES.includes(game)) return;
      R[game] = Math.round(clamp(r(game) + (win ? 0.2 : -0.3), -1, 1) * 100) / 100; save();
    },
    // поправки ИИ для боя: mode — 'arcade' | 'real'
    // density — сколько комплексов ПВО вокруг целей (×), ambush — доля засад (молчат до близкой дистанции),
    // skill — прибавка к опыту расчётов (точность, реакция), wave — размер волн налёта (×), raidSkill — пилоты налёта,
    // early — налёт с ПРР, помехами и ложными целями уже с первой волны
    knobs(game, mode) {
      const x = r(game), real = mode === 'real';
      return {
        density: (real ? 1.35 : 1.1) * (1 + 0.25 * x),
        ambush: clamp((real ? 0.4 : 0.3) + 0.12 * x, 0.15, 0.6),
        skill: (real ? 0.05 : 0) + 0.1 * x,
        wave: (real ? 1.25 : 1.05) * (1 + 0.25 * x),
        raidSkill: (real ? 0.08 : 0) + 0.12 * x,
        early: real || x > 0.4,
      };
    },
  };
}
