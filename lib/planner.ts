/**
 * AI-планировщик на базе Google Gemini Flash
 * Бесплатный тариф: 15 RPM, 1M токенов/день
 * Получить ключ: https://aistudio.google.com/app/apikey
 *
 * Принимает свободный текст → возвращает структурированные задачи с временем
 */

import { GoogleGenerativeAI } from '@google/generative-ai'
import type { Task, Settings, ScheduleLesson } from '@/types'

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' })

interface PlannerTask {
  title: string
  remind_at: string | null    // ISO datetime или null
  deadline: string | null     // YYYY-MM-DD или null
  priority: 1 | 2 | 3
  estimated_min: number | null
}

interface PlannerInput {
  userText: string
  settings: Settings
  existingTasks: Task[]
  schedule: ScheduleLesson[]
  targetDate: string           // YYYY-MM-DD
  currentTime: string          // "14:30"
}

/**
 * Строим системный промпт с профилем пользователя
 */
function buildSystemPrompt(settings: Settings, schedule: ScheduleLesson[]): string {
  const days = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

  const scheduleText = schedule.length > 0
    ? schedule.map(l =>
        `  - ${l.time_start}–${l.time_end}: ${l.subject}${l.teacher ? ` (${l.teacher})` : ''}${l.room ? `, ауд. ${l.room}` : ''} [${l.source === 'college' ? 'колледж' : 'университет'}]`
      ).join('\n')
    : '  - Пар нет'

  const wakeRules = (settings.wake_times as Array<{ lesson_number: number; wake_time: string }>)
    .map(r => `  - ${r.lesson_number} пара → подъём в ${r.wake_time}`)
    .join('\n')

  return `Ты — личный планировщик задач. Твоя работа: парсить текст пользователя и распределять задачи по времени дня.

## Профиль пользователя
- Часовой пояс: ${settings.timezone} (Екатеринбург, UTC+5)
- Просыпается: ${settings.work_start} (если нет ранних пар)
- Рабочий день: ${settings.work_start}–${settings.work_end}
- Обед: ${settings.lunch_start}, ~${settings.lunch_duration_min} минут
- Спорт/прогулки: ${settings.sport_days.map(d => days.indexOf(d) >= 0 ? ['вс','пн','вт','ср','чт','пт','сб'][days.indexOf(d)] : d).join(', ')} в ${settings.sport_time} (~${settings.sport_duration_min} мин) — НЕ ТРОГАТЬ
- Учёба/олимпиады: ${settings.study_days.map(d => days.indexOf(d) >= 0 ? ['вс','пн','вт','ср','чт','пт','сб'][days.indexOf(d)] : d).join(', ')} в ${settings.study_time} (~${settings.study_duration_min} мин) — НЕ ТРОГАТЬ
- Деятельность: разработка (Next.js, Supabase), предпринимательство, учёба

## Правила подъёма по парам
${wakeRules}
  - Нет пар → подъём в 09:00

## Расписание на сегодня
${scheduleText}

## Правила планирования
1. Если пользователь указал конкретное время — используй его
2. Если время не указано — распредели задачи по свободным слотам
3. Высокоприоритетные (priority=1) задачи — в первую половину дня
4. НЕ ставь задачи во время пар, обеда, спорта, учёбы
5. Учитывай estimated_min — не ставь задачу если слот слишком короткий
6. Вечер после ${settings.work_end} — свободное время, не трогать без явной необходимости
7. remind_at — время когда прислать напоминание (в ISO формате UTC)

## Формат ответа
Верни ТОЛЬКО валидный JSON без markdown-обёртки:
{
  "tasks": [
    {
      "title": "Название задачи",
      "remind_at": "2024-01-15T09:00:00+05:00",
      "deadline": null,
      "priority": 2,
      "estimated_min": 30
    }
  ],
  "comment": "Краткий комментарий к плану (1-2 предложения)"
}`
}

/**
 * Парсим задачи из свободного текста пользователя
 */
export async function planTasks(input: PlannerInput): Promise<{
  tasks: PlannerTask[]
  comment: string
}> {
  const { userText, settings, existingTasks, schedule, targetDate, currentTime } = input

  const existingText = existingTasks.length > 0
    ? '\n\nУже запланировано на сегодня:\n' + existingTasks.map(t =>
        `- ${t.remind_at ? new Date(t.remind_at).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit', timeZone: settings.timezone }) : '?'}: ${t.title} (${t.estimated_min ?? '?'} мин, приоритет ${t.priority})`
      ).join('\n')
    : ''

  const userPrompt = `Дата: ${targetDate}, текущее время: ${currentTime}
${existingText}

Текст пользователя:
"${userText}"

Разбери задачи и расставь по времени.`

  const res = await fetch(GROQ_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [
        { role: 'system', content: buildSystemPrompt(settings, schedule) },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: 1024,
      temperature: 0.3,
    }),
  })

  if (!res.ok) throw new Error(`Groq API error: ${res.status} ${await res.text()}`)
  const data = await res.json()
  const raw: string = data.choices?.[0]?.message?.content ?? ''

  try {
    const cleaned = raw.replace(/```json|```/g, '').trim()
    const parsed = JSON.parse(cleaned)
    return {
      tasks: parsed.tasks ?? [],
      comment: parsed.comment ?? '',
    }
  } catch {
    console.error('Planner JSON parse error:', raw)
    return { tasks: [], comment: 'Не удалось распарсить задачи' }
  }
}

/**
 * Добавить одну задачу в течение дня (команда /add или текст боту)
 */
export async function addSingleTask(
  text: string,
  settings: Settings,
  existingTasks: Task[],
  schedule: ScheduleLesson[],
): Promise<{ tasks: PlannerTask[]; comment: string }> {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: settings.timezone }))
  const targetDate = now.toISOString().split('T')[0]
  const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`

  return planTasks({ userText: text, settings, existingTasks, schedule, targetDate, currentTime })
}
