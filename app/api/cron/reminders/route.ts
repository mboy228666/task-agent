import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { sendReminder, getSettings } from '@/lib/bot'
import type { Task } from '@/types'

export async function GET(req: NextRequest) {
  // Защита от случайного вызова
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const settings = await getSettings()
    const { telegram_chat_id, timezone } = settings

    if (!telegram_chat_id) {
      return NextResponse.json({ ok: true, sent: 0, reason: 'no chat_id' })
    }

    const now = new Date()
    const nowIso = now.toISOString()
    // Окно: задачи у которых remind_at прошло, но не более 90 сек назад
    const windowStart = new Date(now.getTime() - 90 * 1000).toISOString()

    // Получаем задачи в окне напоминания
    const { data: tasks, error } = await supabase
      .from('tasks')
      .select('*, reminder_log(id)')
      .eq('done', false)
      .gte('remind_at', windowStart)
      .lte('remind_at', nowIso)
      .or(`snoozed_to.is.null,snoozed_to.lte.${nowIso}`)

    if (error) throw error

    let sent = 0

    for (const task of (tasks ?? []) as (Task & { reminder_log: { id: string }[] })[]) {
      // Пропускаем если уже отправляли
      if (task.reminder_log && task.reminder_log.length > 0) continue

      await sendReminder(task, telegram_chat_id)

      // Логируем отправку
      await supabase.from('reminder_log').insert({ task_id: task.id })
      sent++
    }

    return NextResponse.json({ ok: true, sent })
  } catch (e) {
    console.error('Reminders cron error:', e)
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 })
  }
}
