'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const DAYS = [
  { key: 'mon', label: 'Пн' },
  { key: 'tue', label: 'Вт' },
  { key: 'wed', label: 'Ср' },
  { key: 'thu', label: 'Чт' },
  { key: 'fri', label: 'Пт' },
  { key: 'sat', label: 'Сб' },
  { key: 'sun', label: 'Вс' },
]

type WakeRule = { lesson_number: number; wake_time: string }

type Settings = {
  morning_poll_time: string
  work_start: string
  work_end: string
  lunch_start: string
  lunch_duration_min: number
  sport_days: string[]
  sport_time: string
  sport_duration_min: number
  study_days: string[]
  study_time: string
  study_duration_min: number
  college_group: string
  university_group: string
  wake_times: WakeRule[]
  timezone: string
  telegram_chat_id: string
}

export default function SettingsPage() {
  const [s, setS] = useState<Settings | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    supabase.from('settings').select('*').eq('id', 1).single().then(({ data }) => {
      if (data) setS(data as Settings)
    })
  }, [])

  const save = async () => {
    if (!s) return
    setSaving(true)
    await supabase.from('settings').update(s).eq('id', 1)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const update = (key: keyof Settings, value: unknown) =>
    setS(prev => prev ? { ...prev, [key]: value } : prev)

  const toggleDay = (field: 'sport_days' | 'study_days', day: string) => {
    if (!s) return
    const arr = s[field]
    update(field, arr.includes(day) ? arr.filter(d => d !== day) : [...arr, day])
  }

  const updateWake = (index: number, time: string) => {
    if (!s) return
    const wt = [...s.wake_times]
    wt[index] = { ...wt[index], wake_time: time }
    update('wake_times', wt)
  }

  if (!s) return (
    <div style={{ maxWidth: 640, margin: '80px auto', textAlign: 'center', color: 'var(--muted)' }}>
      загрузка...
    </div>
  )

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: '32px 16px 80px' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 32 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--accent)' }}>Настройки</h1>
        <nav style={{ display: 'flex', gap: 16, fontSize: 13, color: 'var(--muted)' }}>
          <a href="/tasks">Задачи</a>
          <a href="/settings" style={{ color: 'var(--accent)' }}>Настройки</a>
        </nav>
      </div>

      {/* Секции */}
      <Section title="Telegram">
        <Field label="Chat ID (твой Telegram ID)">
          <input
            value={s.telegram_chat_id}
            onChange={e => update('telegram_chat_id', e.target.value)}
            placeholder="1196076630"
            style={{ width: '100%' }}
          />
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
            Узнай у @userinfobot в Telegram
          </div>
        </Field>
      </Section>

      <Section title="Расписание (УГГУ/УрГЭУ)">
        <Field label="Группа колледжа">
          <input
            value={s.college_group}
            onChange={e => update('college_group', e.target.value)}
            style={{ width: '100%' }}
          />
        </Field>
        <Field label="Группа университета (заочка)">
          <input
            value={s.university_group}
            onChange={e => update('university_group', e.target.value)}
            style={{ width: '100%' }}
          />
        </Field>
      </Section>

      <Section title="Режим дня">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Начало рабочего дня">
            <input type="time" value={s.work_start} onChange={e => update('work_start', e.target.value)} style={{ width: '100%' }} />
          </Field>
          <Field label="Конец рабочего дня">
            <input type="time" value={s.work_end} onChange={e => update('work_end', e.target.value)} style={{ width: '100%' }} />
          </Field>
          <Field label="Начало обеда">
            <input type="time" value={s.lunch_start} onChange={e => update('lunch_start', e.target.value)} style={{ width: '100%' }} />
          </Field>
          <Field label="Длительность обеда (мин)">
            <input type="number" min={15} max={180} value={s.lunch_duration_min} onChange={e => update('lunch_duration_min', +e.target.value)} style={{ width: '100%' }} />
          </Field>
        </div>
        <Field label="Время утреннего опроса">
          <input type="time" value={s.morning_poll_time} onChange={e => update('morning_poll_time', e.target.value)} />
        </Field>
      </Section>

      <Section title="Время подъёма по парам">
        <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>
          Во сколько вставать если первая пара в этот номер
        </div>
        {s.wake_times.map((rule, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <span style={{ minWidth: 80, color: 'var(--muted)', fontSize: 13 }}>
              {rule.lesson_number} пара
            </span>
            <input
              type="time"
              value={rule.wake_time}
              onChange={e => updateWake(i, e.target.value)}
            />
          </div>
        ))}
      </Section>

      <Section title="Спорт / прогулки">
        <DayPicker days={s.sport_days} onToggle={d => toggleDay('sport_days', d)} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
          <Field label="Время">
            <input type="time" value={s.sport_time} onChange={e => update('sport_time', e.target.value)} style={{ width: '100%' }} />
          </Field>
          <Field label="Длительность (мин)">
            <input type="number" min={15} max={300} value={s.sport_duration_min} onChange={e => update('sport_duration_min', +e.target.value)} style={{ width: '100%' }} />
          </Field>
        </div>
      </Section>

      <Section title="Учёба (олимпиады, курсы)">
        <DayPicker days={s.study_days} onToggle={d => toggleDay('study_days', d)} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
          <Field label="Время">
            <input type="time" value={s.study_time} onChange={e => update('study_time', e.target.value)} style={{ width: '100%' }} />
          </Field>
          <Field label="Длительность (мин)">
            <input type="number" min={15} max={360} value={s.study_duration_min} onChange={e => update('study_duration_min', +e.target.value)} style={{ width: '100%' }} />
          </Field>
        </div>
      </Section>

      {/* Save button */}
      <div style={{ position: 'fixed', bottom: 24, right: 24 }}>
        <button
          onClick={save}
          disabled={saving}
          style={{
            background: saved ? '#4ade80' : 'var(--accent)',
            color: '#0f0f10',
            fontWeight: 700,
            padding: '12px 28px',
            fontSize: 14,
            boxShadow: '0 4px 20px rgba(110,231,183,0.3)',
          }}
        >
          {saving ? 'Сохраняю...' : saved ? '✓ Сохранено' : 'Сохранить'}
        </button>
      </div>
    </div>
  )
}

// ── Компоненты ────────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius)',
      padding: 20,
      marginBottom: 16,
    }}>
      <div style={{ fontSize: 11, color: 'var(--accent)', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 16 }}>
        {title}
      </div>
      {children}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>{label}</div>
      {children}
    </div>
  )
}

function DayPicker({ days, onToggle }: { days: string[]; onToggle: (d: string) => void }) {
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      {DAYS.map(d => (
        <button
          key={d.key}
          onClick={() => onToggle(d.key)}
          style={{
            background: days.includes(d.key) ? 'var(--accent)' : 'transparent',
            color: days.includes(d.key) ? '#0f0f10' : 'var(--muted)',
            border: `1px solid ${days.includes(d.key) ? 'var(--accent)' : 'var(--border)'}`,
            borderRadius: 6,
            padding: '6px 10px',
            fontWeight: days.includes(d.key) ? 700 : 400,
          }}
        >
          {d.label}
        </button>
      ))}
    </div>
  )
}
