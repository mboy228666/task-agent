'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const TZ = 'Asia/Yekaterinburg'

type Lesson = {
  id: string
  date: string
  lesson_number: number
  time_start: string
  time_end: string
  subject: string
  teacher: string | null
  room: string | null
  type: string
  source: 'college' | 'university'
}

type Task = {
  id: string
  title: string
  remind_at: string | null
  done: boolean
  priority: 1 | 2 | 3
}

const SOURCE_COLOR = {
  college: '#6ee7b7',
  university: '#a78bfa',
}

const LESSON_TYPE_LABEL: Record<string, string> = {
  lecture: 'лек',
  practice: 'пр',
  lab: 'лаб',
  other: '',
}

const DAY_NAMES = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб']
const DAY_NAMES_FULL = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота']

function getWeekDates(offset = 0): string[] {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: TZ }))
  const day = now.getDay()
  const monday = new Date(now)
  monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1) + offset * 7)
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return d.toLocaleDateString('sv')
  })
}

export default function SchedulePage() {
  const [weekOffset, setWeekOffset] = useState(0)
  const [lessons, setLessons] = useState<Lesson[]>([])
  const [tasks, setTasks] = useState<Record<string, Task[]>>({})
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)

  const dates = getWeekDates(weekOffset)
  const today = new Date().toLocaleDateString('sv', { timeZone: TZ })

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const from = dates[0]
      const to = dates[6]

      // Расписание
      const res = await fetch(`/api/schedule?from=${from}&to=${to}`)
      const json = await res.json()
      setLessons(json.data ?? [])

      // Задачи на неделю
      const { data: taskData } = await supabase
        .from('tasks')
        .select('id,title,remind_at,done,priority,date')
        .gte('date', from)
        .lte('date', to)
        .order('remind_at', { ascending: true })

      const grouped: Record<string, Task[]> = {}
      for (const t of taskData ?? []) {
        const d = (t as Task & { date: string }).date
        if (!grouped[d]) grouped[d] = []
        grouped[d].push(t as Task)
      }
      setTasks(grouped)
      setLoading(false)
    }
    load()
  }, [weekOffset])

  const triggerSync = async () => {
    setSyncing(true)
    const secret = prompt('CRON_SECRET:')
    if (!secret) { setSyncing(false); return }
    await fetch(`/api/schedule/sync?secret=${secret}`)
    setSyncing(false)
    setWeekOffset(w => w) // перезагрузка
    window.location.reload()
  }

  const weekLabel = weekOffset === 0 ? 'Эта неделя'
    : weekOffset === 1 ? 'Следующая неделя'
    : weekOffset === -1 ? 'Прошлая неделя'
    : `${dates[0]} — ${dates[6]}`

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '32px 16px' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 }}>
        <div>
          <div style={{ fontSize: 11, color: 'var(--muted)', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 4 }}>
            Расписание
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--accent)' }}>{weekLabel}</h1>
        </div>
        <nav style={{ display: 'flex', gap: 16, fontSize: 13, color: 'var(--muted)', alignItems: 'center' }}>
          <a href="/tasks">Задачи</a>
          <a href="/settings">Настройки</a>
          <a href="/schedule" style={{ color: 'var(--accent)' }}>Расписание</a>
        </nav>
      </div>

      {/* Навигация по неделям */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24, alignItems: 'center' }}>
        <button
          onClick={() => setWeekOffset(w => w - 1)}
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', padding: '6px 14px' }}
        >
          ← Назад
        </button>
        <button
          onClick={() => setWeekOffset(0)}
          style={{ background: weekOffset === 0 ? 'var(--accent-dim)' : 'var(--surface)', border: `1px solid ${weekOffset === 0 ? 'var(--accent)' : 'var(--border)'}`, color: weekOffset === 0 ? 'var(--accent)' : 'var(--muted)', padding: '6px 14px' }}
        >
          Сегодня
        </button>
        <button
          onClick={() => setWeekOffset(w => w + 1)}
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', padding: '6px 14px' }}
        >
          Вперёд →
        </button>
        <button
          onClick={triggerSync}
          disabled={syncing}
          style={{ marginLeft: 'auto', background: 'transparent', border: '1px solid var(--border)', color: 'var(--muted)', padding: '6px 14px' }}
        >
          {syncing ? 'Синхронизация...' : '↻ Обновить расписание'}
        </button>
      </div>

      {/* Легенда */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 20, fontSize: 12 }}>
        <span style={{ color: SOURCE_COLOR.college }}>● Колледж</span>
        <span style={{ color: SOURCE_COLOR.university }}>● Университет</span>
      </div>

      {/* Дни недели */}
      {loading ? (
        <div style={{ color: 'var(--muted)', textAlign: 'center', padding: 60 }}>загрузка...</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {dates.map(date => {
            const dayLessons = lessons.filter(l => l.date === date)
            const dayTasks = tasks[date] ?? []
            const isToday = date === today
            const d = new Date(date + 'T00:00:00')
            const weekday = DAY_NAMES[d.getDay()]
            const dayNum = d.getDate()
            const monthName = d.toLocaleDateString('ru', { month: 'short' })

            const isEmpty = dayLessons.length === 0 && dayTasks.length === 0
            if (isEmpty && !isToday) return null

            return (
              <div
                key={date}
                style={{
                  background: 'var(--surface)',
                  border: `1px solid ${isToday ? 'var(--accent)' : 'var(--border)'}`,
                  borderRadius: 'var(--radius)',
                  overflow: 'hidden',
                }}
              >
                {/* Заголовок дня */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '10px 16px',
                  borderBottom: dayLessons.length + dayTasks.length > 0 ? '1px solid var(--border)' : 'none',
                  background: isToday ? 'var(--accent-dim)' : 'transparent',
                }}>
                  <span style={{ fontWeight: 700, color: isToday ? 'var(--accent)' : 'var(--text)', minWidth: 28 }}>
                    {weekday}
                  </span>
                  <span style={{ color: 'var(--muted)', fontSize: 13 }}>
                    {dayNum} {monthName}
                  </span>
                  {isToday && (
                    <span style={{ fontSize: 11, color: 'var(--accent)', marginLeft: 4, letterSpacing: 1 }}>
                      СЕГОДНЯ
                    </span>
                  )}
                  <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--muted)' }}>
                    {dayLessons.length > 0 && `${dayLessons.length} пар`}
                    {dayLessons.length > 0 && dayTasks.length > 0 && ' · '}
                    {dayTasks.length > 0 && `${dayTasks.length} задач`}
                  </span>
                </div>

                {/* Пары */}
                {dayLessons.map(l => (
                  <div
                    key={l.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '10px 16px',
                      borderBottom: '1px solid var(--border)',
                      borderLeft: `3px solid ${SOURCE_COLOR[l.source]}`,
                    }}
                  >
                    <span style={{ minWidth: 36, color: 'var(--muted)', fontSize: 13 }}>
                      {l.lesson_number}
                    </span>
                    <span style={{ minWidth: 105, color: 'var(--muted)', fontSize: 12 }}>
                      {l.time_start}–{l.time_end}
                    </span>
                    <span style={{ flex: 1, fontSize: 13 }}>{l.subject}</span>
                    {LESSON_TYPE_LABEL[l.type] && (
                      <span style={{ fontSize: 11, color: 'var(--muted)', background: 'var(--border)', padding: '2px 6px', borderRadius: 4 }}>
                        {LESSON_TYPE_LABEL[l.type]}
                      </span>
                    )}
                    {l.room && (
                      <span style={{ fontSize: 12, color: 'var(--muted)' }}>ауд. {l.room}</span>
                    )}
                  </div>
                ))}

                {/* Задачи */}
                {dayTasks.map(t => (
                  <div
                    key={t.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '8px 16px',
                      borderBottom: '1px solid var(--border)',
                      opacity: t.done ? 0.4 : 1,
                    }}
                  >
                    <span style={{ minWidth: 36, fontSize: 13 }}>
                      {t.priority === 1 ? '🔴' : t.priority === 2 ? '🟡' : '🟢'}
                    </span>
                    <span style={{ minWidth: 105, color: 'var(--muted)', fontSize: 12 }}>
                      {t.remind_at
                        ? new Date(t.remind_at).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit', timeZone: TZ })
                        : '—'}
                    </span>
                    <span style={{
                      flex: 1,
                      fontSize: 13,
                      textDecoration: t.done ? 'line-through' : 'none',
                      color: t.done ? 'var(--muted)' : 'var(--text)',
                    }}>
                      {t.title}
                    </span>
                    {t.done && (
                      <span style={{ fontSize: 11, color: 'var(--green)' }}>✓</span>
                    )}
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
