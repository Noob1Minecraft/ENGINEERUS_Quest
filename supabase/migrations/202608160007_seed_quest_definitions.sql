insert into public.quest_definitions (
  id, name, description, reward_label, criteria, xp_reward,
  repeat_policy, achievement_code
)
values
  (
    'first_contact',
    '{"ru":"Первый контакт","kk":"Алғашқы байланыс","en":"First Contact"}',
    '{"ru":"Задай вопрос ИИ-репетитору","kk":"ЖИ-репетиторға алғашқы сұрауды жібер","en":"Ask your first question to AI Tutor"}',
    '{"ru":"Бейдж Новичок","kk":"Бастаушы белгісі","en":"Novice badge"}',
    '{"type":"requests_count","minimum":1}',
    20, 'once', 'first_step'
  ),
  (
    'material_scout',
    '{"ru":"Поиск материала","kk":"Материал іздеу","en":"Material Scout"}',
    '{"ru":"Используй модуль MaterialSwap","kk":"MaterialSwap модулін қолдан","en":"Use the MaterialSwap module"}',
    '{"ru":"Бейдж Исследователь","kk":"Зерттеуші белгісі","en":"Researcher badge"}',
    '{"type":"material_count","minimum":1}',
    30, 'once', 'material_scout'
  ),
  (
    'streak_master',
    '{"ru":"Серия побед","kk":"Жеңіс сериясы","en":"Streak Master"}',
    '{"ru":"Удерживай стрик 3 дня подряд","kk":"3 күн қатарынан кір","en":"Maintain a 3-day streak"}',
    '{"ru":"Бейдж Постоянец","kk":"Тұрақты қатысушы белгісі","en":"Regular badge"}',
    '{"type":"streak_days","minimum":3}',
    50, 'once', 'streak_master'
  ),
  (
    'xp_hunter',
    '{"ru":"Охотник за XP","kk":"XP аңшысы","en":"XP Hunter"}',
    '{"ru":"Набери 100 XP","kk":"100 XP жина","en":"Earn 100 XP"}',
    '{"ru":"Бейдж Опытный","kk":"Тәжірибелі белгісі","en":"Experienced badge"}',
    '{"type":"total_xp","minimum":100}',
    40, 'once', 'xp_hunter'
  ),
  (
    'module_explorer',
    '{"ru":"Инженер-универсал","kk":"Модуль зерттеушісі","en":"Module Explorer"}',
    '{"ru":"Используй все 4 доступных инженерных модуля","kk":"Қолжетімді 4 инженерлік модульді қолдан","en":"Try all 4 available engineering modules"}',
    '{"ru":"Бейдж Универсал","kk":"Әмбебап белгісі","en":"Master badge"}',
    '{"type":"modules_used","required":["tutor","material","patent","engi_legal"]}',
    100, 'once', 'module_explorer'
  )
on conflict (id) do update
set name = excluded.name,
    description = excluded.description,
    reward_label = excluded.reward_label,
    criteria = excluded.criteria,
    xp_reward = excluded.xp_reward,
    repeat_policy = excluded.repeat_policy,
    achievement_code = excluded.achievement_code,
    updated_at = now();
