import { NextRequest, NextResponse } from 'next/server'
import { getSettings, sendMorningPoll } from '@/lib/bot'
import { syncSchedule, getScheduleForDay } from '@/lib/schedule'

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const settings = await getSettings()
    const { timezone, college_group, university_group } = settings

    // 1. Синхронизируем расписание на 14 дней вперёд
    await syncSchedule(college_group, university_group, 14)

    // 2. Проверяем время опроса
    const now = new Date()
    const localHour = parseInt(
      now.toLocaleString('en-US', { hour: '2-digit', hour12: false, timeZone: timezone })
    )
    const localMinute = parseInt(
      now.toLocaleString('en-US', { minute: '2-digit', timeZone: timezone })
    )
    const [pollHour, pollMinute] = settings.morning_poll_time.split(':').map(Number)

    // Запускаем в пределах 5 минут от запланированного времени
    const diffMin = (localHour * 60 + localMinute) - (pollHour * 60 + pollMinute)
    if (Math.abs(diffMin) > 5) {
      return NextResponse.json({ ok: true, skipped: true, reason: 'not poll time', localTime: `${localHour}:${localMinute}`, pollTime: settings.morning_poll_time })
    }

    // 3. Расписание на сегодня
    const today = now.toLocaleDateString('sv', { timeZone: timezone })
    const schedule = await getScheduleForDay(today)

    // 4. Отправляем утренний опрос
    await sendMorningPoll(settings, schedule)

    return NextResponse.json({ ok: true, date: today, lessonsCount: schedule.length })
  } catch (e) {
    console.error('Morning cron error:', e)
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 })
  }
}
