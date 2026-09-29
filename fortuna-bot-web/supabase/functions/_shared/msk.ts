// Сутки по Москве (UTC+3, без перехода на летнее время) — граница билетов и дневных пределов, как msk_today() в SQL.
export const mskToday = () => new Date(Date.now() + 3 * 3600 * 1000).toISOString().slice(0, 10);
// начало текущих суток МСК в UTC (для выборок по timestamptz)
export const mskDayStartIso = () => new Date(Date.parse(mskToday() + "T00:00:00Z") - 3 * 3600 * 1000).toISOString();
