-- GRANT сам по себе не открывает строки, пока включён RLS без политик (005 дал права,
-- но без policy anon всё равно видел 0 строк). Добавляем явную политику чтения.
create policy "anon can read shop_items" on shop_items for select to anon using (true);
create policy "anon can read equipment_items" on equipment_items for select to anon using (true);
