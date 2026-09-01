-- Gamification v2 keeps every reward server-authoritative. Browser roles can
-- read the resulting DTO only through the Engineerus API and cannot call the
-- mutation RPC or write progression tables directly.

create or replace function public.level_for_xp(p_total_xp bigint)
returns integer
language sql
immutable
strict
security invoker
set search_path = ''
as $$
  select floor(greatest(p_total_xp, 0) / 100.0)::integer + 1;
$$;

revoke all on function public.level_for_xp(bigint)
from public, anon, authenticated, service_role;

update public.user_progress
set level = public.level_for_xp(total_xp)
where level <> public.level_for_xp(total_xp);

alter table public.quest_definitions
add column quest_kind text not null default 'legacy'
  check (quest_kind in ('legacy', 'daily', 'weekly')),
add column skill_id uuid references public.skills (id) on delete set null,
add column skill_xp_reward integer not null default 0 check (skill_xp_reward >= 0),
add column sort_order integer not null default 100 check (sort_order >= 0);

update public.quest_definitions
set skill_id = '20000000-0000-4000-8000-000000000005',
    skill_xp_reward = 15
where id = 'material_scout';

insert into public.quest_definitions (
  id, name, description, reward_label, criteria, xp_reward,
  repeat_policy, achievement_code, quest_kind, sort_order
)
values
  (
    'daily_active',
    '{"ru":"Активный день","kk":"Белсенді күн","en":"Active Day"}',
    '{"ru":"Зайди в Engineerus и зафиксируй дневную активность","kk":"Engineerus жүйесіне кіріп, күнделікті белсенділікті белгіле","en":"Visit Engineerus and record daily activity"}',
    '{"ru":"+5 XP","kk":"+5 XP","en":"+5 XP"}',
    '{"fact":"daily_activity","target":1}', 5, 'daily', null, 'daily', 10
  ),
  (
    'daily_ai_question',
    '{"ru":"Инженерный вопрос","kk":"Инженерлік сұрақ","en":"Engineering Question"}',
    '{"ru":"Получи один завершённый ответ ИИ-Тьютора","kk":"ЖИ-Тьютордан бір аяқталған жауап ал","en":"Receive one completed AI Tutor answer"}',
    '{"ru":"+10 XP","kk":"+10 XP","en":"+10 XP"}',
    '{"fact":"ai_questions","target":1}', 10, 'daily', null, 'daily', 20
  ),
  (
    'daily_learning_quest',
    '{"ru":"Шаг в обучении","kk":"Оқу қадамы","en":"Learning Step"}',
    '{"ru":"Заверши один основной учебный квест","kk":"Бір негізгі оқу квестін аяқта","en":"Complete one core learning quest"}',
    '{"ru":"+15 XP","kk":"+15 XP","en":"+15 XP"}',
    '{"fact":"learning_quests","target":1}', 15, 'daily', null, 'daily', 30
  ),
  (
    'weekly_learning_five',
    '{"ru":"Учебная неделя","kk":"Оқу аптасы","en":"Learning Week"}',
    '{"ru":"Заверши пять основных или ежедневных квестов за неделю","kk":"Апта ішінде бес негізгі немесе күнделікті квестті аяқта","en":"Complete five core or daily quests this week"}',
    '{"ru":"+50 XP","kk":"+50 XP","en":"+50 XP"}',
    '{"fact":"quest_completions","target":5}', 50, 'weekly', null, 'weekly', 10
  ),
  (
    'weekly_ai_three_days',
    '{"ru":"Регулярная практика","kk":"Тұрақты тәжірибе","en":"Regular Practice"}',
    '{"ru":"Используй ИИ-Тьютора в три разных дня недели","kk":"ЖИ-Тьюторды аптаның үш бөлек күнінде пайдалан","en":"Use AI Tutor on three distinct days this week"}',
    '{"ru":"+40 XP","kk":"+40 XP","en":"+40 XP"}',
    '{"fact":"ai_distinct_days","target":3}', 40, 'weekly', null, 'weekly', 20
  ),
  (
    'weekly_teamwork_explorer',
    '{"ru":"Командная инженерия","kk":"Командалық инженерия","en":"Team Engineering"}',
    '{"ru":"Выполни два разных действия в Проектах или EngiMatch","kk":"Жобаларда немесе EngiMatch ішінде екі түрлі әрекет жаса","en":"Complete two distinct Projects or EngiMatch actions"}',
    '{"ru":"+40 XP","kk":"+40 XP","en":"+40 XP"}',
    '{"fact":"teamwork_actions","target":2}', 40, 'weekly', null, 'weekly', 30
  )
on conflict (id) do update
set name = excluded.name,
    description = excluded.description,
    reward_label = excluded.reward_label,
    criteria = excluded.criteria,
    xp_reward = excluded.xp_reward,
    repeat_policy = excluded.repeat_policy,
    quest_kind = excluded.quest_kind,
    sort_order = excluded.sort_order,
    updated_at = now();

create table public.achievement_definitions (
  slug text primary key,
  category text not null check (category in (
    'learning', 'consistency', 'projects', 'collaboration', 'exploration'
  )),
  name jsonb not null check (jsonb_typeof(name) = 'object'),
  description jsonb not null check (jsonb_typeof(description) = 'object'),
  criteria jsonb not null check (jsonb_typeof(criteria) = 'object'),
  xp_reward integer not null default 0 check (xp_reward >= 0),
  sort_order integer not null default 100 check (sort_order >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.user_achievements (
  user_id uuid not null references public.profiles (id) on delete cascade,
  achievement_slug text not null references public.achievement_definitions (slug),
  earned_at timestamptz not null default now(),
  xp_ledger_id uuid references public.xp_ledger (id),
  primary key (user_id, achievement_slug)
);

create index user_achievements_recent_idx
on public.user_achievements (user_id, earned_at desc);

-- Each row is an immutable, source-keyed learning-progress award. Aggregated
-- skill XP is platform learning progress and is never a certification claim.
create table public.user_skill_progress (
  user_id uuid not null references public.profiles (id) on delete cascade,
  skill_id uuid not null references public.skills (id) on delete cascade,
  source_key text not null check (char_length(source_key) between 1 and 160),
  xp_amount integer not null check (xp_amount > 0 and xp_amount <= 100),
  earned_at timestamptz not null default now(),
  primary key (user_id, skill_id, source_key)
);

create index user_skill_progress_user_idx
on public.user_skill_progress (user_id, skill_id, earned_at desc);

create table public.quest_chain_definitions (
  slug text primary key,
  name jsonb not null check (jsonb_typeof(name) = 'object'),
  description jsonb not null check (jsonb_typeof(description) = 'object'),
  steps jsonb not null check (jsonb_typeof(steps) = 'array' and jsonb_array_length(steps) between 1 and 10),
  xp_reward integer not null check (xp_reward > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.user_quest_chain_progress (
  user_id uuid not null references public.profiles (id) on delete cascade,
  chain_slug text not null references public.quest_chain_definitions (slug),
  completed_steps integer not null default 0 check (completed_steps >= 0),
  completed_at timestamptz,
  xp_ledger_id uuid references public.xp_ledger (id),
  updated_at timestamptz not null default now(),
  primary key (user_id, chain_slug)
);

create trigger user_quest_chain_progress_set_updated_at
before update on public.user_quest_chain_progress
for each row execute function public.set_updated_at();

insert into public.achievement_definitions (
  slug, category, name, description, criteria, xp_reward, sort_order
)
values
  ('first-question', 'learning',
   '{"ru":"Первый вопрос","kk":"Алғашқы сұрақ","en":"First Question"}',
   '{"ru":"Получи первый ответ ИИ-Тьютора","kk":"ЖИ-Тьютордан алғашқы жауап ал","en":"Receive your first AI Tutor answer"}',
   '{"fact":"ai_questions","target":1}', 10, 10),
  ('first-quest', 'learning',
   '{"ru":"Первый квест","kk":"Алғашқы квест","en":"First Quest"}',
   '{"ru":"Заверши первый основной квест","kk":"Алғашқы негізгі квестті аяқта","en":"Complete your first core quest"}',
   '{"fact":"learning_quests","target":1}', 10, 20),
  ('streak-3', 'consistency',
   '{"ru":"Серия 3 дня","kk":"3 күндік серия","en":"3-Day Streak"}',
   '{"ru":"Поддерживай активность три дня подряд","kk":"Үш күн қатарынан белсенді бол","en":"Stay active for three consecutive days"}',
   '{"fact":"longest_streak","target":3}', 15, 30),
  ('streak-7', 'consistency',
   '{"ru":"Серия 7 дней","kk":"7 күндік серия","en":"7-Day Streak"}',
   '{"ru":"Поддерживай активность семь дней подряд","kk":"Жеті күн қатарынан белсенді бол","en":"Stay active for seven consecutive days"}',
   '{"fact":"longest_streak","target":7}', 25, 40),
  ('first-project', 'projects',
   '{"ru":"Первый проект","kk":"Алғашқы жоба","en":"First Project"}',
   '{"ru":"Создай проект или стань участником","kk":"Жоба құр немесе қатысушы бол","en":"Create or join a project"}',
   '{"fact":"projects","target":1}', 15, 50),
  ('first-engimatch', 'collaboration',
   '{"ru":"Первый EngiMatch","kk":"Алғашқы EngiMatch","en":"First EngiMatch"}',
   '{"ru":"Исследуй реальные совпадения EngiMatch","kk":"Нақты EngiMatch сәйкестіктерін зертте","en":"Explore real EngiMatch results"}',
   '{"fact":"engimatch","target":1}', 10, 60),
  ('level-5', 'exploration',
   '{"ru":"Уровень 5","kk":"5-деңгей","en":"Level 5"}',
   '{"ru":"Достигни пятого уровня","kk":"Бесінші деңгейге жет","en":"Reach level five"}',
   '{"fact":"level","target":5}', 20, 70),
  ('level-10', 'exploration',
   '{"ru":"Уровень 10","kk":"10-деңгей","en":"Level 10"}',
   '{"ru":"Достигни десятого уровня","kk":"Оныншы деңгейге жет","en":"Reach level ten"}',
   '{"fact":"level","target":10}', 50, 80)
on conflict (slug) do nothing;

insert into public.quest_chain_definitions (
  slug, name, description, steps, xp_reward
)
values (
  'engineering-starter',
  '{"ru":"Инженерный старт","kk":"Инженерлік бастау","en":"Engineering Starter"}',
  '{"ru":"Пять безопасных шагов для знакомства с Engineerus","kk":"Engineerus-пен танысуға арналған бес қауіпсіз қадам","en":"Five safe steps for getting started with Engineerus"}',
  '[
    {"id":"complete-profile","fact":"profile_complete","name":{"ru":"Заполни профиль","kk":"Профильді толтыр","en":"Complete profile"}},
    {"id":"ask-ai","fact":"ai_questions","name":{"ru":"Задай первый вопрос","kk":"Алғашқы сұрақты қой","en":"Ask first question"}},
    {"id":"complete-quest","fact":"learning_quests","name":{"ru":"Заверши первый квест","kk":"Алғашқы квестті аяқта","en":"Complete first quest"}},
    {"id":"explore-engimatch","fact":"engimatch","name":{"ru":"Исследуй EngiMatch","kk":"EngiMatch-ті зертте","en":"Explore EngiMatch"}},
    {"id":"project-step","fact":"projects","name":{"ru":"Создай или присоединись к проекту","kk":"Жоба құр немесе оған қосыл","en":"Create or join a project"}}
  ]'::jsonb,
  75
)
on conflict (slug) do nothing;

alter table public.product_events
drop constraint product_events_event_name_check;

alter table public.product_events
add constraint product_events_event_name_check check (event_name in (
  'onboarding_started', 'onboarding_completed', 'ai_session_started',
  'ai_message_sent', 'quest_completed', 'project_created',
  'project_applied', 'engimatch_viewed', 'direct_chat_opened',
  'direct_message_sent', 'feedback_submitted', 'daily_quest_completed',
  'weekly_quest_completed', 'achievement_unlocked', 'level_up',
  'quest_chain_completed'
));

create or replace function public.award_xp(
  p_user_id uuid,
  p_amount integer,
  p_reason text,
  p_source_type text,
  p_source_id text default null,
  p_idempotency_key text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns table (ledger_id uuid, total_xp bigint, level integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ledger_id uuid;
  v_total_xp bigint;
  v_old_level integer;
  v_level integer;
begin
  if p_amount <= 0 then
    raise exception 'XP award amount must be positive';
  end if;

  insert into public.user_progress (user_id)
  values (p_user_id)
  on conflict (user_id) do nothing;

  select progress.total_xp, progress.level
  into v_total_xp, v_old_level
  from public.user_progress as progress
  where progress.user_id = p_user_id
  for update;

  if p_idempotency_key is not null then
    select ledger.id into v_ledger_id
    from public.xp_ledger as ledger
    where ledger.user_id = p_user_id
      and ledger.idempotency_key = p_idempotency_key;

    if found then
      return query select v_ledger_id, v_total_xp, v_old_level;
      return;
    end if;
  end if;

  v_total_xp := v_total_xp + p_amount;
  v_level := public.level_for_xp(v_total_xp);

  insert into public.xp_ledger (
    user_id, amount, balance_after, reason, source_type, source_id,
    idempotency_key, metadata
  ) values (
    p_user_id, p_amount, v_total_xp, p_reason, p_source_type, p_source_id,
    p_idempotency_key, coalesce(p_metadata, '{}'::jsonb)
  )
  returning id into v_ledger_id;

  update public.user_progress
  set total_xp = v_total_xp,
      level = v_level
  where user_id = p_user_id;

  if v_level > v_old_level then
    insert into public.product_events (user_id, event_name, metadata, dedupe_key)
    values (
      p_user_id,
      'level_up',
      jsonb_build_object('level', v_level),
      'level:' || v_level::text
    )
    on conflict (user_id, event_name, dedupe_key) do nothing;
  end if;

  return query select v_ledger_id, v_total_xp, v_level;
end;
$$;

revoke all on function public.award_xp(uuid, integer, text, text, text, text, jsonb)
from public, anon, authenticated;
grant execute on function public.award_xp(uuid, integer, text, text, text, text, jsonb)
to service_role;

alter table public.achievement_definitions enable row level security;
alter table public.user_achievements enable row level security;
alter table public.user_skill_progress enable row level security;
alter table public.quest_chain_definitions enable row level security;
alter table public.user_quest_chain_progress enable row level security;

revoke all on table public.achievement_definitions from public, anon, authenticated, service_role;
revoke all on table public.user_achievements from public, anon, authenticated, service_role;
revoke all on table public.user_skill_progress from public, anon, authenticated, service_role;
revoke all on table public.quest_chain_definitions from public, anon, authenticated, service_role;
revoke all on table public.user_quest_chain_progress from public, anon, authenticated, service_role;

create or replace function public.refresh_gamification(
  p_user_id uuid,
  p_now timestamptz default statement_timestamp()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_progress public.user_progress;
  v_definition public.quest_definitions;
  v_existing_status text;
  v_cycle_key text;
  v_cycle_start timestamptz;
  v_cycle_end timestamptz;
  v_day date := (p_now at time zone 'Asia/Almaty')::date;
  v_week date := date_trunc('week', p_now at time zone 'Asia/Almaty')::date;
  v_value integer;
  v_target integer;
  v_award record;
  v_user_quest_id uuid;
  v_achievement public.achievement_definitions;
  v_achievement_id text;
  v_eligible boolean;
  v_chain public.quest_chain_definitions;
  v_chain_step jsonb;
  v_completed_steps integer;
  v_total_steps integer;
  v_chain_was_complete boolean;
  v_result jsonb;
begin
  if p_user_id is null or not exists (
    select 1 from public.profiles where id = p_user_id
  ) then
    raise exception 'Profile does not exist';
  end if;

  insert into public.user_progress (user_id)
  values (p_user_id)
  on conflict (user_id) do nothing;

  select * into strict v_progress
  from public.user_progress
  where user_id = p_user_id
  for update;

  for v_definition in
    select * from public.quest_definitions
    where is_active = true and quest_kind in ('daily', 'weekly')
    order by quest_kind, sort_order, id
  loop
    if v_definition.quest_kind = 'daily' then
      v_cycle_key := v_day::text;
      v_cycle_start := v_day::timestamp at time zone 'Asia/Almaty';
      v_cycle_end := (v_day + 1)::timestamp at time zone 'Asia/Almaty';
    else
      v_cycle_key := v_week::text;
      v_cycle_start := v_week::timestamp at time zone 'Asia/Almaty';
      v_cycle_end := (v_week + 7)::timestamp at time zone 'Asia/Almaty';
    end if;

    v_target := greatest(coalesce((v_definition.criteria ->> 'target')::integer, 1), 1);
    v_value := case v_definition.criteria ->> 'fact'
      when 'daily_activity' then case when v_progress.last_activity_date = v_day then 1 else 0 end
      when 'ai_questions' then (
        select count(*)::integer from public.chat_messages
        where user_id = p_user_id and role = 'assistant'
          and created_at >= v_cycle_start and created_at < v_cycle_end
      )
      when 'ai_distinct_days' then (
        select count(distinct (created_at at time zone 'Asia/Almaty')::date)::integer
        from public.chat_messages
        where user_id = p_user_id and role = 'assistant'
          and created_at >= v_cycle_start and created_at < v_cycle_end
      )
      when 'learning_quests' then (
        select count(*)::integer
        from public.user_quests uq
        join public.quest_definitions qd on qd.id = uq.quest_id
        where uq.user_id = p_user_id and uq.status = 'completed'
          and qd.quest_kind = 'legacy'
          and uq.completed_at >= v_cycle_start and uq.completed_at < v_cycle_end
      )
      when 'quest_completions' then (
        select count(*)::integer
        from public.user_quests uq
        join public.quest_definitions qd on qd.id = uq.quest_id
        where uq.user_id = p_user_id and uq.status = 'completed'
          and qd.quest_kind in ('legacy', 'daily')
          and uq.completed_at >= v_cycle_start and uq.completed_at < v_cycle_end
      )
      when 'teamwork_actions' then (
        select count(distinct event_name)::integer
        from public.product_events
        where user_id = p_user_id
          and event_name in ('project_created', 'project_applied', 'engimatch_viewed')
          and created_at >= v_cycle_start and created_at < v_cycle_end
      )
      else 0
    end;

    select status into v_existing_status
    from public.user_quests
    where user_id = p_user_id and quest_id = v_definition.id and cycle_key = v_cycle_key;

    insert into public.user_quests (
      user_id, quest_id, cycle_key, status, progress, completed_at
    ) values (
      p_user_id,
      v_definition.id,
      v_cycle_key,
      case when v_value >= v_target then 'completed' else 'in_progress' end,
      jsonb_build_object('current', least(v_value, v_target), 'target', v_target),
      case when v_value >= v_target then p_now else null end
    )
    on conflict (user_id, quest_id, cycle_key) do update
    set progress = excluded.progress,
        status = case
          when public.user_quests.status = 'completed' then 'completed'
          else excluded.status
        end,
        completed_at = case
          when public.user_quests.completed_at is not null then public.user_quests.completed_at
          else excluded.completed_at
        end
    returning id into v_user_quest_id;

    if v_value >= v_target and coalesce(v_existing_status, '') <> 'completed' then
      select * into v_award from public.award_xp(
        p_user_id,
        v_definition.xp_reward,
        initcap(v_definition.quest_kind) || ' quest completed: ' || v_definition.id,
        v_definition.quest_kind || '_quest',
        v_definition.id,
        v_definition.quest_kind || '_quest:' || v_cycle_key || ':' || v_definition.id,
        jsonb_build_object('quest_id', v_definition.id, 'cycle_key', v_cycle_key)
      );

      update public.user_quests set xp_ledger_id = v_award.ledger_id
      where id = v_user_quest_id and xp_ledger_id is null;

      insert into public.product_events (user_id, event_name, metadata, dedupe_key)
      values (
        p_user_id,
        v_definition.quest_kind || '_quest_completed',
        jsonb_build_object('quest_id', v_definition.id),
        v_cycle_key || ':' || v_definition.id
      ) on conflict (user_id, event_name, dedupe_key) do nothing;
    end if;
  end loop;

  insert into public.user_skill_progress (user_id, skill_id, source_key, xp_amount, earned_at)
  select p_user_id, qd.skill_id, 'quest:' || uq.quest_id || ':' || uq.cycle_key,
         qd.skill_xp_reward, uq.completed_at
  from public.user_quests uq
  join public.quest_definitions qd on qd.id = uq.quest_id
  where uq.user_id = p_user_id and uq.status = 'completed'
    and qd.skill_id is not null and qd.skill_xp_reward > 0
  on conflict (user_id, skill_id, source_key) do nothing;

  for v_achievement in
    select * from public.achievement_definitions
    where is_active = true order by sort_order, slug
  loop
    select * into strict v_progress from public.user_progress where user_id = p_user_id;
    v_target := greatest(coalesce((v_achievement.criteria ->> 'target')::integer, 1), 1);
    v_value := case v_achievement.criteria ->> 'fact'
      when 'ai_questions' then v_progress.requests_count::integer
      when 'learning_quests' then (
        select count(*)::integer from public.user_quests uq
        join public.quest_definitions qd on qd.id = uq.quest_id
        where uq.user_id = p_user_id and uq.status = 'completed' and qd.quest_kind = 'legacy'
      )
      when 'longest_streak' then v_progress.longest_streak
      when 'projects' then (
        select count(*)::integer from (
          select id from public.projects where owner_id = p_user_id
          union
          select project_id from public.project_members where user_id = p_user_id
        ) project_rows
      )
      when 'engimatch' then (
        select count(*)::integer from public.product_events
        where user_id = p_user_id and event_name = 'engimatch_viewed'
      )
      when 'level' then v_progress.level
      else 0
    end;
    v_eligible := v_value >= v_target;

    if v_eligible then
      insert into public.user_achievements (user_id, achievement_slug, earned_at)
      values (p_user_id, v_achievement.slug, p_now)
      on conflict (user_id, achievement_slug) do nothing
      returning achievement_slug into v_achievement_id;

      if v_achievement_id is not null then
        if v_achievement.xp_reward > 0 then
          select * into v_award from public.award_xp(
            p_user_id,
            v_achievement.xp_reward,
            'Achievement unlocked: ' || v_achievement.slug,
            'achievement',
            v_achievement.slug,
            'achievement:' || v_achievement.slug,
            jsonb_build_object('achievement', v_achievement.slug)
          );
          update public.user_achievements set xp_ledger_id = v_award.ledger_id
          where user_id = p_user_id and achievement_slug = v_achievement.slug;
        end if;

        insert into public.product_events (user_id, event_name, metadata, dedupe_key)
        values (
          p_user_id, 'achievement_unlocked',
          jsonb_build_object('achievement', v_achievement.slug), v_achievement.slug
        ) on conflict (user_id, event_name, dedupe_key) do nothing;
      end if;
      v_achievement_id := null;
    end if;
  end loop;

  for v_chain in
    select * from public.quest_chain_definitions where is_active = true order by slug
  loop
    v_completed_steps := 0;
    v_total_steps := jsonb_array_length(v_chain.steps);

    for v_chain_step in select value from jsonb_array_elements(v_chain.steps)
    loop
      v_eligible := case v_chain_step ->> 'fact'
        when 'profile_complete' then exists (
          select 1 from public.profiles
          where id = p_user_id
            and display_name is not null and btrim(display_name) <> ''
            and primary_discipline_id is not null
            and bio is not null and btrim(bio) <> ''
        )
        when 'ai_questions' then exists (
          select 1 from public.user_progress where user_id = p_user_id and requests_count >= 1
        )
        when 'learning_quests' then exists (
          select 1 from public.user_quests uq
          join public.quest_definitions qd on qd.id = uq.quest_id
          where uq.user_id = p_user_id and uq.status = 'completed' and qd.quest_kind = 'legacy'
        )
        when 'engimatch' then exists (
          select 1 from public.product_events
          where user_id = p_user_id and event_name = 'engimatch_viewed'
        )
        when 'projects' then exists (
          select 1 from public.projects where owner_id = p_user_id
        ) or exists (
          select 1 from public.project_members where user_id = p_user_id
        )
        else false
      end;
      if not v_eligible then exit; end if;
      v_completed_steps := v_completed_steps + 1;
    end loop;

    select completed_at is not null into v_chain_was_complete
    from public.user_quest_chain_progress
    where user_id = p_user_id and chain_slug = v_chain.slug;
    v_chain_was_complete := coalesce(v_chain_was_complete, false);

    insert into public.user_quest_chain_progress (
      user_id, chain_slug, completed_steps, completed_at
    ) values (
      p_user_id, v_chain.slug, v_completed_steps,
      case when v_completed_steps = v_total_steps then p_now else null end
    )
    on conflict (user_id, chain_slug) do update
    set completed_steps = greatest(public.user_quest_chain_progress.completed_steps, excluded.completed_steps),
        completed_at = coalesce(public.user_quest_chain_progress.completed_at, excluded.completed_at);

    if v_completed_steps = v_total_steps and not v_chain_was_complete then
      select * into v_award from public.award_xp(
        p_user_id,
        v_chain.xp_reward,
        'Quest chain completed: ' || v_chain.slug,
        'quest_chain',
        v_chain.slug,
        'quest_chain:' || v_chain.slug,
        jsonb_build_object('chain', v_chain.slug)
      );
      update public.user_quest_chain_progress set xp_ledger_id = v_award.ledger_id
      where user_id = p_user_id and chain_slug = v_chain.slug;
      insert into public.product_events (user_id, event_name, metadata, dedupe_key)
      values (
        p_user_id, 'quest_chain_completed',
        jsonb_build_object('chain', v_chain.slug), v_chain.slug
      ) on conflict (user_id, event_name, dedupe_key) do nothing;
    end if;
  end loop;

  select * into strict v_progress from public.user_progress where user_id = p_user_id;

  select jsonb_build_object(
    'progression', jsonb_build_object(
      'total_xp', v_progress.total_xp,
      'level', v_progress.level,
      'xp_into_level', v_progress.total_xp - ((v_progress.level - 1)::bigint * 100),
      'xp_needed_for_next_level', (v_progress.level::bigint * 100) - v_progress.total_xp,
      'progress_percent', least(100, greatest(0, v_progress.total_xp - ((v_progress.level - 1)::bigint * 100)))
    ),
    'streak', jsonb_build_object(
      'current', v_progress.streak_days,
      'longest', v_progress.longest_streak,
      'last_active_date', v_progress.last_activity_date,
      'timezone', 'Asia/Almaty'
    ),
    'daily_quests', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', qd.id, 'name', qd.name, 'description', qd.description,
        'xp_reward', qd.xp_reward, 'cycle_key', v_day::text,
        'status', coalesce(uq.status, 'in_progress'),
        'progress', coalesce(uq.progress, jsonb_build_object('current', 0, 'target', qd.criteria -> 'target')),
        'completed_at', uq.completed_at
      ) order by qd.sort_order, qd.id)
      from public.quest_definitions qd
      left join public.user_quests uq on uq.user_id = p_user_id
        and uq.quest_id = qd.id and uq.cycle_key = v_day::text
      where qd.quest_kind = 'daily' and qd.is_active = true
    ), '[]'::jsonb),
    'weekly_quests', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', qd.id, 'name', qd.name, 'description', qd.description,
        'xp_reward', qd.xp_reward, 'cycle_key', v_week::text,
        'status', coalesce(uq.status, 'in_progress'),
        'progress', coalesce(uq.progress, jsonb_build_object('current', 0, 'target', qd.criteria -> 'target')),
        'completed_at', uq.completed_at
      ) order by qd.sort_order, qd.id)
      from public.quest_definitions qd
      left join public.user_quests uq on uq.user_id = p_user_id
        and uq.quest_id = qd.id and uq.cycle_key = v_week::text
      where qd.quest_kind = 'weekly' and qd.is_active = true
    ), '[]'::jsonb),
    'achievements', coalesce((
      select jsonb_agg(jsonb_build_object(
        'slug', ad.slug, 'category', ad.category, 'name', ad.name,
        'description', ad.description, 'xp_reward', ad.xp_reward,
        'earned_at', ua.earned_at
      ) order by (ua.earned_at is null), ua.earned_at desc nulls last, ad.sort_order)
      from public.achievement_definitions ad
      left join public.user_achievements ua on ua.user_id = p_user_id
        and ua.achievement_slug = ad.slug
      where ad.is_active = true
    ), '[]'::jsonb),
    'skills', coalesce((
      select jsonb_agg(jsonb_build_object(
        'skill_id', s.id, 'slug', s.slug,
        'name', jsonb_build_object('ru', s.label_ru, 'kk', s.label_kk, 'en', s.label_en),
        'skill_xp', totals.skill_xp
      ) order by totals.skill_xp desc, s.slug)
      from (
        select skill_id, sum(xp_amount)::integer as skill_xp
        from public.user_skill_progress where user_id = p_user_id group by skill_id
      ) totals join public.skills s on s.id = totals.skill_id
    ), '[]'::jsonb),
    'quest_chains', coalesce((
      select jsonb_agg(jsonb_build_object(
        'slug', qc.slug, 'name', qc.name, 'description', qc.description,
        'steps', qc.steps, 'xp_reward', qc.xp_reward,
        'completed_steps', coalesce(cp.completed_steps, 0),
        'completed_at', cp.completed_at,
        'next_step', case
          when coalesce(cp.completed_steps, 0) >= jsonb_array_length(qc.steps) then null
          else qc.steps -> coalesce(cp.completed_steps, 0)
        end
      ) order by qc.slug)
      from public.quest_chain_definitions qc
      left join public.user_quest_chain_progress cp on cp.user_id = p_user_id
        and cp.chain_slug = qc.slug
      where qc.is_active = true
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

comment on function public.refresh_gamification(uuid, timestamptz) is
'Refreshes one verified Engineerus account from authoritative facts. Rewards are serialized per user and idempotent in xp_ledger.';

revoke all on function public.refresh_gamification(uuid, timestamptz)
from public, anon, authenticated;
grant execute on function public.refresh_gamification(uuid, timestamptz)
to service_role;

comment on table public.user_skill_progress is
'Source-keyed Engineerus learning progress. This is not professional certification or a competency claim.';
