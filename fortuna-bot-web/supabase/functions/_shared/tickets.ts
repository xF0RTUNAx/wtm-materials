// Билеты на игры с наградой — sql/017_tickets.sql. Единый источник дневного лимита.
export const DAILY_TICKETS = 5;

// Дата "сегодня" по Москве (UTC+3, без перехода на летнее время) в формате YYYY-MM-DD —
// граница суток для попыток слота (player_economy.spin_day) и билетов.
export function mskDay(): string {
  return new Date(Date.now() + 3 * 3600 * 1000).toISOString().slice(0, 10);
}
