-- 034: поддержка - правки по ревью (2026-11-18).
-- Применить: SUPABASE_ACCESS_TOKEN= supabase db query --linked --workdir . -f sql/034_support_fixes.sql
-- 1) уведомление в Telegram - у каждого сообщения своё (раньше один флаг на обращение: ответ игрока мог потеряться);
-- 2) support_add - проверка лимитов и вставка одной транзакцией под замком игрока (параллельные запросы не обходят лимиты).
alter table support_messages add column if not exists notified boolean not null default false;
update support_messages set notified = true where author = 'support' or sent;
create index if not exists support_messages_unnotified on support_messages (id) where author = 'player' and sent and not notified;

-- новое обращение (p_ticket null) или сообщение в своё открытое; возвращает { ticket, msg } или { err: 'tickets'|'open'|'msgs'|'bytes'|'closed'|'notfound' }
create or replace function support_add(p_player uuid, p_ticket bigint, p_topic text, p_title text, p_lang text, p_meta jsonb, p_body text, p_bytes bigint,
  p_max_tickets int, p_max_open int, p_max_msgs int, p_max_bytes bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  since timestamptz := now() - interval '24 hours';
  n_t int; n_open int; n_m int; n_b bigint; tid bigint; st text; mid bigint;
begin
  perform pg_advisory_xact_lock(hashtext('support:' || p_player::text));
  select count(*) filter (where created_at >= since), count(*) filter (where status in ('new', 'answered')) into n_t, n_open from support_tickets where player_id = p_player;
  select count(*), coalesce(sum(m.bytes), 0) into n_m, n_b from support_messages m join support_tickets t on t.id = m.ticket_id
    where t.player_id = p_player and m.author = 'player' and m.created_at >= since;
  if n_m >= p_max_msgs then return jsonb_build_object('err', 'msgs'); end if;
  if n_b + p_bytes > p_max_bytes then return jsonb_build_object('err', 'bytes'); end if;
  if p_ticket is null then
    if n_t >= p_max_tickets then return jsonb_build_object('err', 'tickets'); end if;
    if n_open >= p_max_open then return jsonb_build_object('err', 'open'); end if;
    insert into support_tickets (player_id, topic, title, status, lang, meta) values (p_player, p_topic, p_title, 'draft', p_lang, coalesce(p_meta, '{}'::jsonb)) returning id into tid;
  else
    select status into st from support_tickets where id = p_ticket and player_id = p_player;
    if st is null or st = 'draft' then return jsonb_build_object('err', 'notfound'); end if;
    if st = 'closed' then return jsonb_build_object('err', 'closed'); end if;
    tid := p_ticket;
  end if;
  insert into support_messages (ticket_id, author, body, sent, bytes) values (tid, 'player', p_body, false, p_bytes) returning id into mid;
  return jsonb_build_object('ticket', tid, 'msg', mid);
end $$;
revoke execute on function support_add(uuid, bigint, text, text, text, jsonb, text, bigint, int, int, int, bigint) from public, anon, authenticated;
