-- Аркада: Стратег и Морской бой (game/minigames/strat.html, sea.html — уже умеют
-- postMessage({type:'mg_win', game:'strat'|'sea'}) родительскому окну). Раз в 24ч за
-- победу в каждой из игр — случайно 2 ключа или 2 детали. Тренировочный режим не трогает
-- эти кулдауны вообще (клиент просто не дёргает claim-arcade-reward в этом режиме).
alter table player_economy add column if not exists last_strat_win timestamptz;
alter table player_economy add column if not exists last_sea_win timestamptz;

update equipment_items set description = '+3 детали за каждый фарм с Меладзе' where slug = 'gitara';
