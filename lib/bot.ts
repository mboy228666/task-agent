import { Telegraf, Markup } from 'telegraf'
import type { Settings, Task, ScheduleLesson } from '@/types'
import { supabase } from './supabase'
import { addSingleTask } from './planner'
import { getScheduleForDay } from './schedule'

export const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN!)

// ─── Хелперы ────────────────────────────────────────────────────────────────

export async function getSettings(): Promise<Settings> {
  const { data, error } = await supabase.from('settings').select('*').eq('id', 1).single()
  if (error || !data) throw new Error('Settings not found')
  return data as Settings
}

export async function getTasksForDate(date: string): Promise<Task[]> {
  const { data } = await supabase
    .from('tasks')
    .select('*')
    .eq('date', date)
    .eq('done', false)
    .order('remind_at', { ascending: true })
  return (data ?? []) as Task[]
}

function formatTaskForMessage(task: Task, tz: string): string {
  const time = task.remind_at
    ? new Date(task.remind_at).toLocaleTimeString('ru', {
        hour: '2-digit', minute: '2-digit', timeZone: tz,
      })
    : '—'
  const priority = task.priority === 1 ? '🔴' : task.priority === 2 ? '🟡' : '🟢'
  const duration = task.estimated_min ? ` (~${task.estimated_min}м)` : ''
  return `${priority} ${time} — ${task.title}${duration}`
}

// ─── Команды ─────────────────────────────────────────────────────────────────

// /start
bot.start((ctx) => {
  ctx.reply(
    '👋 Привет! Я твой планировщик.\n\n' +
    'Просто напиши мне задачи в свободной форме — расставлю их по времени.\n\n' +
    'Команды:\n' +
    '/list — задачи на сегодня\n' +
    '/tomorrow — задачи на завтра\n' +
    '/add <задача> — добавить задачу\n' +
    '/done <id> — отметить выполненной\n' +
    '/schedule — расписание на сегодня\n' +
    '/settings — текущие настройки'
  )
})

// /list
bot.command('list', async (ctx) => {
  try {
    const settings = await getSettings()
    const today = new Date().toLocaleDateString('sv', { timeZone: settings.timezone })
    const tasks = await getTasksForDate(today)

    if (tasks.length === 0) {
      return ctx.reply('📭 На сегодня задач нет.')
    }

    const lines = tasks.map(t => formatTaskForMessage(t, settings.timezone))
    ctx.reply(`📋 *Задачи на сегодня:*\n\n${lines.join('\n')}`, { parse_mode: 'Markdown' })
  } catch (e) {
    ctx.reply('Ошибка при загрузке задач')
  }
})

// /schedule
bot.command('schedule', async (ctx) => {
  try {
    const settings = await getSettings()
    const today = new Date().toLocaleDateString('sv', { timeZone: settings.timezone })
    const lessons = await getScheduleForDay(today)

    if (lessons.length === 0) {
      return ctx.reply('📭 Пар сегодня нет.')
    }

    const lines = lessons.map(l =>
      `${l.lesson_number}. ${l.time_start}–${l.time_end} ${l.subject}${l.room ? ` (${l.room})` : ''}`
    )
    ctx.reply(`🎓 *Расписание на сегодня:*\n\n${lines.join('\n')}`, { parse_mode: 'Markdown' })
  } catch (e) {
    ctx.reply('Ошибка при загрузке расписания')
  }
})

// /add
bot.command('add', async (ctx) => {
  const text = ctx.message.text.replace('/add', '').trim()
  if (!text) return ctx.reply('Напиши задачу: /add позвонить Ване в 14:00')

  ctx.reply('⏳ Планирую...')

  try {
    const settings = await getSettings()
    const today = new Date().toLocaleDateString('sv', { timeZone: settings.timezone })
    const existing = await getTasksForDate(today)
    const schedule = await getScheduleForDay(today)

    const { tasks, comment } = await addSingleTask(text, settings, existing, schedule)

    if (tasks.length === 0) return ctx.reply('Не удалось разобрать задачу, попробуй ещё раз')

    // Сохраняем в Supabase
    const inserts = tasks.map(t => ({ ...t, date: today, source: 'bot' as const }))
    const { error } = await supabase.from('tasks').insert(inserts)
    if (error) throw error

    const lines = tasks.map(t => {
      const time = t.remind_at
        ? new Date(t.remind_at).toLocaleTimeString('ru', {
            hour: '2-digit', minute: '2-digit', timeZone: settings.timezone,
          })
        : 'без времени'
      return `✅ ${time} — ${t.title}`
    })

    ctx.reply(`${lines.join('\n')}\n\n💬 ${comment}`)
  } catch (e) {
    ctx.reply('Ошибка при добавлении задачи')
  }
})

// Обычное сообщение (без команды) — тоже парсим как задачи
bot.on('text', async (ctx) => {
  const text = ctx.message.text
  if (text.startsWith('/')) return // пропускаем неизвестные команды

  // Проверяем что это наш chat_id
  const settings = await getSettings()
  if (String(ctx.chat.id) !== settings.telegram_chat_id) return

  ctx.reply('⏳ Разбираю задачи...')

  try {
    const today = new Date().toLocaleDateString('sv', { timeZone: settings.timezone })
    const existing = await getTasksForDate(today)
    const schedule = await getScheduleForDay(today)

    const { tasks, comment } = await addSingleTask(text, settings, existing, schedule)

    if (tasks.length === 0) return ctx.reply('Не удалось разобрать задачи')

    const inserts = tasks.map(t => ({ ...t, date: today, source: 'bot' as const }))
    await supabase.from('tasks').insert(inserts)

    const lines = tasks.map(t => {
      const time = t.remind_at
        ? new Date(t.remind_at).toLocaleTimeString('ru', {
            hour: '2-digit', minute: '2-digit', timeZone: settings.timezone,
          })
        : 'без времени'
      return `✅ ${time} — ${t.title}`
    })

    ctx.reply(`${lines.join('\n')}\n\n💬 ${comment}`)
  } catch (e) {
    ctx.reply('Ошибка')
  }
})

// ─── Callback кнопки (✅ Готово / ⏩ +30 мин) ─────────────────────────────────

bot.action(/done_(.+)/, async (ctx) => {
  const taskId = ctx.match[1]
  await supabase.from('tasks').update({ done: true }).eq('id', taskId)
  await ctx.answerCbQuery('✅ Выполнено!')
  await ctx.editMessageReplyMarkup(undefined)
  await ctx.reply('✅ Отмечено выполненным')
})

bot.action(/snooze_(.+)/, async (ctx) => {
  const taskId = ctx.match[1]
  const snoozeUntil = new Date(Date.now() + 30 * 60 * 1000).toISOString()
  await supabase.from('tasks').update({ snoozed_to: snoozeUntil }).eq('id', taskId)
  await ctx.answerCbQuery('⏩ Напомню через 30 минут')
  await ctx.editMessageReplyMarkup(undefined)
})

bot.action(/cancel_(.+)/, async (ctx) => {
  const taskId = ctx.match[1]
  await supabase.from('tasks').update({ done: true }).eq('id', taskId)
  await ctx.answerCbQuery('❌ Задача отменена')
  await ctx.editMessageReplyMarkup(undefined)
})

// ─── Функция для отправки напоминания ────────────────────────────────────────

export async function sendReminder(task: Task, chatId: string): Promise<void> {
  const keyboard = Markup.inlineKeyboard([
    Markup.button.callback('✅ Готово', `done_${task.id}`),
    Markup.button.callback('⏩ +30 мин', `snooze_${task.id}`),
    Markup.button.callback('❌ Отмена', `cancel_${task.id}`),
  ])

  const duration = task.estimated_min ? ` (~${task.estimated_min} мин)` : ''
  const priority = task.priority === 1 ? '🔴 ' : ''

  await bot.telegram.sendMessage(
    chatId,
    `⏰ *${priority}${task.title}*${duration}`,
    { parse_mode: 'Markdown', ...keyboard }
  )
}

// ─── Утренний опрос ───────────────────────────────────────────────────────────

export async function sendMorningPoll(settings: Settings, schedule: ScheduleLesson[]): Promise<void> {
  const { telegram_chat_id, timezone } = settings
  if (!telegram_chat_id) return

  const today = new Date().toLocaleDateString('sv', { timeZone: timezone })
  const dateDisplay = new Date().toLocaleDateString('ru', {
    weekday: 'long', day: 'numeric', month: 'long', timeZone: timezone,
  })

  let scheduleText = ''
  if (schedule.length > 0) {
    scheduleText = '\n\n🎓 *Расписание:*\n' + schedule.map(l =>
      `${l.lesson_number}. ${l.time_start} — ${l.subject}`
    ).join('\n')
  }

  await bot.telegram.sendMessage(
    telegram_chat_id,
    `☀️ *${dateDisplay}*\n\nПривет! Что планируешь сегодня?${scheduleText}\n\nПросто напиши всё что нужно сделать — расставлю по времени.`,
    { parse_mode: 'Markdown' }
  )
}
