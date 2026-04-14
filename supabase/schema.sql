-- ==============================================
-- task-agent: схема Supabase
-- Выполни в SQL Editor твоего проекта
-- ==============================================

-- Задачи
create table if not exists tasks (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  remind_at     timestamptz,
  deadline      date,
  priority      int not null default 2 check (priority in (1, 2, 3)),
  estimated_min int,
  done          boolean not null default false,
  snoozed_to    timestamptz,
  date          date not null default current_date,
  source        text not null default 'bot' check (source in ('bot', 'web', 'morning')),
  created_at    timestamptz not null default now()
);

-- Настройки (одна строка)
create table if not exists settings (
  id                  int primary key default 1 check (id = 1),
  morning_poll_time   time not null default '08:30',
  work_start          time not null default '10:00',
  work_end            time not null default '22:00',
  lunch_start         time not null default '13:00',
  lunch_duration_min  int not null default 60,
  sport_days          text[] not null default '{}',
  sport_time          time not null default '19:00',
  sport_duration_min  int not null default 60,
  study_days          text[] not null default '{}',
  study_time          time not null default '18:00',
  study_duration_min  int not null default 90,
  college_group       text not null default '24-03 ТД1',
  university_group    text not null default 'Э-ОЗЭП(ППК)-25-2-у',
  wake_times          jsonb not null default '[
    {"lesson_number": 1, "wake_time": "07:00"},
    {"lesson_number": 2, "wake_time": "08:40"},
    {"lesson_number": 3, "wake_time": "09:00"},
    {"lesson_number": 4, "wake_time": "09:00"},
    {"lesson_number": 5, "wake_time": "09:00"}
  ]',
  timezone            text not null default 'Asia/Yekaterinburg',
  telegram_chat_id    text not null default ''
);

-- Кэш расписания
create table if not exists schedule_cache (
  id            uuid primary key default gen_random_uuid(),
  date          date not null,
  lesson_number int not null,
  time_start    text not null,
  time_end      text not null,
  subject       text not null,
  teacher       text,
  room          text,
  type          text not null default 'other',
  source        text not null check (source in ('college', 'university')),
  fetched_at    timestamptz not null default now(),
  unique (date, lesson_number, source)
);

-- Лог отправленных напоминаний (чтоб не дублировать)
create table if not exists reminder_log (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid not null references tasks(id) on delete cascade,
  sent_at    timestamptz not null default now()
);

-- Вставляем дефолтные настройки
insert into settings (id) values (1) on conflict do nothing;
