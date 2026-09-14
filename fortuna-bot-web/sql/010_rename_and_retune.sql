-- Переименование предмета: убираем "Мотича" из названия.
update shop_items set name = 'Брелок Луня' where slug = 'motich_keychain';

-- Удваиваем интервалы периодических ивентов (были 3ч/5ч/10ч/6ч) — реже срабатывают.
-- cron.schedule с тем же именем job'а обновляет расписание, а не создаёт дубликат.
select cron.schedule('strong_man_tick', '0 */6 * * *', $$select strong_man_tick()$$);
select cron.schedule('weak_man_tick', '0 */10 * * *', $$select weak_man_tick()$$);
select cron.schedule('anime_girl_tick', '0 */20 * * *', $$select anime_girl_tick()$$);
select cron.schedule('auto_key_tick', '0 */12 * * *', $$select auto_key_tick()$$);
