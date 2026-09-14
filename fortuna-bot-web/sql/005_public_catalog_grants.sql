-- Каталоги предметов/экипировки — публичные справочные данные без привязки к игроку,
-- безопасно читать напрямую через anon-ключ, не обязательно гонять через Edge Function.
grant usage on schema public to anon;
grant select on shop_items to anon;
grant select on equipment_items to anon;
