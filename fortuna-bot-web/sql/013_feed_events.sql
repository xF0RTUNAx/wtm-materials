-- Расширяем ленту событий: раньше туда попадали только чат-ивенты (сильный/слабый мужчина,
-- аниме девочка, авто-ключ, подкова) и финал рейда. Теперь добавляем фарм, покупки в магазине,
-- крафт оборудования и действия в рейде (покупка оружия, атака, старт) — по запросу: "чтобы
-- в онлайне отображались абсолютно все фармы, действия на рейдах, покупки в магазине,
-- оборудовании, и результаты мини-игры".
alter table activity_feed drop constraint activity_feed_event_type_check;
alter table activity_feed add constraint activity_feed_event_type_check
  check (event_type in (
    'strong_man', 'weak_man', 'anime_girl', 'auto_key', 'horseshoe', 'raid_finish',
    'farm', 'shop_buy', 'equipment', 'raid_action', 'minigame'
  ));

-- Общий хелпер логирования: подставляет логин игрока (денормализация, как и везде в ленте)
-- и пишет строку. Вызывается из edge-функций через db.rpc после успешного действия.
create or replace function log_feed_event(p_player_id uuid, p_event_type text, p_detail jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_login text;
begin
  select login into v_login from players where id = p_player_id;
  insert into activity_feed (event_type, target_player_id, detail)
    values (p_event_type, p_player_id, p_detail || jsonb_build_object('login', v_login));
end;
$$;

revoke all on function log_feed_event(uuid, text, jsonb) from public;
grant execute on function log_feed_event(uuid, text, jsonb) to service_role;
