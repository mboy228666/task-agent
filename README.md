# task-agent

Личный ИИ-планировщик с Telegram-ботом, знает твоё расписание в колледже/университете и умно распределяет задачи по дню.

## Стек
- **Next.js 15** (App Router)
- **Supabase** (PostgreSQL)
- **Telegraf** (Telegram Bot)
- **Claude API** (Anthropic) — парсинг задач и планирование
- **Vercel** — деплой + cron jobs

---

## Быстрый старт

### 1. Клонируй и установи зависимости

```bash
git clone <твой-репо>
cd task-agent
npm install
```

### 2. Настрой Supabase

1. Создай новый проект на [supabase.com](https://supabase.com)
2. Зайди в **SQL Editor** и выполни файл `supabase/schema.sql`
3. Скопируй из настроек проекта:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public key` → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role key` → `SUPABASE_SERVICE_ROLE_KEY`

### 3. Создай Telegram бота

1. Напиши [@BotFather](https://t.me/BotFather) → `/newbot`
2. Получи токен → `TELEGRAM_BOT_TOKEN`
3. Узнай свой Telegram ID у [@userinfobot](https://t.me/userinfobot)
4. Позже впиши этот ID в настройки на `/settings`

### 4. Получи Claude API ключ

[console.anthropic.com](https://console.anthropic.com) → API Keys → Create Key → `ANTHROPIC_API_KEY`

### 5. Создай `.env.local`

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# Anthropic
ANTHROPIC_API_KEY=sk-ant-...

# Telegram
TELEGRAM_BOT_TOKEN=1234567890:ABC...

# Безопасность cron-эндпоинтов (придумай любую строку)
CRON_SECRET=my-super-secret-string-123
```

### 6. Локальный запуск

```bash
npm run dev
# Открой http://localhost:3000
```

Для локального тестирования бота используй [ngrok](https://ngrok.com):
```bash
ngrok http 3000
# Зарегистрируй вебхук:
curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://xxxx.ngrok.io/api/webhook"
```

---

## Деплой на Vercel

```bash
npm i -g vercel
vercel
```

Добавь все переменные из `.env.local` в **Vercel → Settings → Environment Variables**.

После деплоя зарегистрируй вебхук:
```bash
curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://твой-домен.vercel.app/api/webhook"
```

Проверь что вебхук установлен:
```bash
curl "https://api.telegram.org/bot<TOKEN>/getWebhookInfo"
```

---

## Первоначальная настройка

1. Открой `https://твой-домен.vercel.app/settings`
2. Укажи свой **Telegram Chat ID**
3. Проверь группы колледжа и университета
4. Настрой время опроса, спорт, учёбу
5. Принудительно подтяни расписание:
   ```
   https://твой-домен.vercel.app/api/schedule/sync?secret=<CRON_SECRET>
   ```
6. Проверь расписание: `https://твой-домен.vercel.app/schedule`

---

## Страницы

| URL | Описание |
|-----|----------|
| `/tasks` | Задачи на сегодня |
| `/schedule` | Расписание на неделю (пары + задачи) |
| `/settings` | Все настройки агента |

---

## Команды бота

| Команда | Действие |
|---------|----------|
| `/list` | Задачи на сегодня |
| `/schedule` | Расписание на сегодня |
| `/add <текст>` | Добавить задачу (Claude расставит время) |
| Любой текст | Тоже добавляет задачи — пиши в свободной форме |

**Примеры:**
```
в 15 позвонить куратору
сегодня надо: написать курсач, сходить в магаз после 19, оплатить хостинг
```

---

## Как работает планировщик

При добавлении задач Claude получает:
- Твой профиль (режим дня, привычки из настроек)
- Расписание пар на сегодня
- Уже запланированные задачи
- Текущее время

И автоматически:
1. Парсит задачи из свободного текста
2. Расставляет время в свободные слоты
3. НЕ ставит задачи во время пар, обеда, спорта
4. Приоритетные задачи кладёт в первую половину дня

---

## Cron расписание

| Путь | График | Что делает |
|------|--------|------------|
| `/api/cron/reminders` | Каждую минуту | Шлёт напоминания в Telegram |
| `/api/cron/morning` | `0 3 * * *` (08:00 Екб) | Синкает расписание + утренний опрос |

> На Vercel Hobby plan минимум — 1 раз в минуту. Этого достаточно.

---

## Важно про парсинг расписания

Сайт `usue.ru` рендерит расписание через форму. После первого запуска может потребоваться скорректировать CSS-селекторы в `lib/schedule.ts` → функция `parseHtml`.

Для отладки добавь в функцию `fetchScheduleHtml` лог HTML и посмотри реальную структуру таблицы через DevTools сайта.

---

## Структура проекта

```
task-agent/
├── app/
│   ├── api/
│   │   ├── webhook/route.ts        — Telegram webhook
│   │   ├── cron/
│   │   │   ├── reminders/route.ts  — каждую минуту
│   │   │   └── morning/route.ts    — утренний опрос
│   │   └── schedule/
│   │       ├── route.ts            — GET расписания из кэша
│   │       └── sync/route.ts       — принудительная синхронизация
│   ├── tasks/page.tsx              — список задач
│   ├── schedule/page.tsx           — расписание на неделю
│   ├── settings/page.tsx           — настройки
│   └── globals.css
├── lib/
│   ├── supabase.ts                 — клиент БД
│   ├── bot.ts                      — Telegraf бот + хелперы
│   ├── planner.ts                  — Claude-агент
│   └── schedule.ts                 — парсер usue.ru
├── types/index.ts                  — TypeScript типы
├── supabase/schema.sql             — SQL схема
├── vercel.json                     — cron конфиг
└── .env.local                      — переменные окружения
```
