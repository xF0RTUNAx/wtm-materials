-- Билл Сайфер — эксклюзивный дизайн профиля, не входит в случайный пул
-- assign_random_profile_theme() (тот статичный массив из 6 не трогаем),
-- назначается только вручную через admin-set-profile-theme.
alter table players drop constraint if exists players_profile_theme_check;
alter table players add constraint players_profile_theme_check
  check (profile_theme in (
    'theme-harlequin', 'theme-serenity', 'theme-aquarelle',
    'theme-nostalgia', 'theme-hamster', 'theme-starry', 'theme-billcipher'
  ));
