// Прокачка в онлайне «Воздушного превосходства»: что игрок купил (из подписанного билета mp-ticket, поле a) и что из этого
// следует на сервере — в комнатах «Реализма» подвеска, комплекс и удар должны быть куплены (стартовое — всегда); быстрый
// поиск «Реализма» подбирает эпоху не выше самого «младшего» ранга людей в очереди. Аркада — без ограничений.
// Правила — те же, что у игры и функций Supabase (games/airdef/progress.js).
import { NODE, newProgress, owned, branchRank, strikeId } from '../games/airdef/progress.js?v=20261022l';

// билет → состояние для проверок (null — разработка без MP_SECRET или тестовый вход: ограничений нет)
export const adProgress = (list) => (Array.isArray(list) ? { ...newProgress(), own: list.filter((id) => NODE[id]) } : null);
// наибольший ранг, который открыт и в «Авиации», и в «ПВО» (игрока могут поставить за любую команду)
export const adRank = (P) => (P ? Math.min(branchRank(P, 'air'), branchRank(P, 'pvo')) : 4);
export const loadoutIds = (L) => [(L.heli ? 'heli:' : 'air:') + L.plane, ...L.items.map(([k]) => 'wpn:' + k)];
export const samIds = (k) => ['pvo:' + k];
export const strikeIds = (n) => Object.keys(n || {}).filter((k) => n[k] > 0).map(strikeId);
// отказ (текст) или null; mode — режим комнаты, c — игрок (c.adP из билета)
export function realDeny(mode, c, ids) {
  if (mode !== 'real' || !c || !c.adP) return null;
  const miss = ids.filter((id) => NODE[id] && !owned(c.adP, id));
  return miss.length ? `В «Реализме» — только купленное в «Исследованиях»: ${miss.map((id) => NODE[id].short).join(', ')}` : null;
}
// эпоха быстрой комнаты «Реализма»: случайная из открытых всем людям (у «Мульти-волны» — не ниже II)
export function quickEra(mode, clients, minEra = 1) {
  if (mode !== 'real') return null;
  const cap = Math.max(minEra, Math.min(4, ...clients.map((c) => adRank(c && c.adP))));
  return minEra + Math.floor(Math.random() * (cap - minEra + 1));
}
