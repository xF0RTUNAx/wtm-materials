// Рейтинг онлайна «Воздушного превосходства» (Mark 2026-10-25): очки боя. Чистый модуль — общий для игрового сервера (части боя кладутся
// в подписанный итог), функции airdef-claim (итог с силой соперников; копия — supabase/functions/_shared/airdef/rating.js,
// tools/airdef-headless/sync-shared.js) и окна рейтинга (разбор в «Моих боях»).
// Очки боя = (итог команды + вклад + сила соперников) × режим × боты × ранг; сезон — сумма 7 лучших боёв (sql/022: airdef_rating_board).
export const RATING = {
  WIN: 400, DRAW: 200,                          // итог команды: победа, ничья (в «Мульти-волне»); поражение — 0
  CONTRIB_AVG: 250, CONTRIB_MAX: 500,           // вклад: доля очков в своей команде; средний в команде — 250
  OPP_MAX: 100,                                 // сила соперников: равные — 50
  ARCADE_K: 0.6,                                // аркада; реализм — ×1
  RANK_K: { 1: 1, 2: 1.02, 3: 1.05, 4: 1.08 },  // ранг (эпоха) боя «Вылет и оборона»; в «Мульти-волне» надбавки нет
  BOT_MIN: 0.5,                                 // все соперники — боты: ×0,5; все люди — ×1, между — по доле людей
  BEST: 7,                                      // в сезон идут 7 лучших боёв
};

// части боя (игровой сервер, конец боя): win — 1 / 0 / 0.5 (ничья); score, kills — игрока; teamScores — очки всех в его команде (с ботами);
// oppHumans / oppTotal — людей и всего у соперников; mode — 'real' | 'arcade'; era — эпоха комнаты; multi — «Мульти-волна».
// Ни очков, ни сбитых/уничтоженных — бездействие: бой засчитывается нулём (idle)
export function battleParts({ win, score = 0, kills = 0, teamScores = [], oppHumans = 0, oppTotal = 0, mode = 'arcade', era = 1, multi = false }) {
  const idle = !(score > 0) && !(kills > 0);
  const sum = teamScores.reduce((a, v) => a + Math.max(0, v || 0), 0), n = Math.max(1, teamScores.length);
  const c = idle ? 0 : Math.round(Math.min(RATING.CONTRIB_MAX, sum > 0 ? RATING.CONTRIB_AVG * n * Math.max(0, score) / sum : RATING.CONTRIB_AVG));
  const r = idle ? 0 : win === 0.5 ? RATING.DRAW : win ? RATING.WIN : 0;
  const b = +(RATING.BOT_MIN + (1 - RATING.BOT_MIN) * (oppTotal > 0 ? Math.min(1, oppHumans / oppTotal) : 0)).toFixed(3);
  const m = mode === 'real' ? 1 : RATING.ARCADE_K, k = multi ? 1 : RATING.RANK_K[era] || 1;
  return { r, c, b, m, k, idle: idle ? 1 : 0 };
}

// сила соперников (airdef-claim, по очкам сезона): средние очки соперников-людей против своих → 0…100; у всех ноль — 50
export function oppStrength(mine, opp = []) {
  const a = opp.length ? opp.reduce((x, y) => x + Math.max(0, y), 0) / opp.length : 0, me = Math.max(0, mine);
  return a + me > 0 ? Math.round(RATING.OPP_MAX * a / (a + me)) : Math.round(RATING.OPP_MAX / 2);
}

// очки боя из частей и силы соперников s
export const battlePoints = (p, s = 0) => (p && !p.idle ? Math.round((p.r + p.c + Math.max(0, Math.min(RATING.OPP_MAX, s))) * p.b * p.m * p.k) : 0);
