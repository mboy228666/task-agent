'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

type Task = {
  id: string
  title: string
  remind_at: string | null
  priority: 1 | 2 | 3
  estimated_min: number | null
  done: boolean
  date: string
}

const TZ = 'Asia/Yekaterinburg'
const PRIORITY_COLOR = { 1: '#f87171', 2: '#fbbf24', 3: '#6ee7b7' }
const PRIORITY_LABEL = { 1: '↑ высокий', 2: '→ средний', 3: '↓ низкий' }

function toLocalTime(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString('ru', {
    hour: '2-digit', minute: '2-digit', timeZone: TZ,
  })
}

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [newTitle, setNewTitle] = useState('')
  const [newTime, setNewTime] = useState('')
  const [adding, setAdding] = useState(false)

  const today = new Date().toLocaleDateString('sv', { timeZone: TZ })

  const load = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('tasks')
      .select('*')
      .eq('date', today)
      .order('remind_at', { ascending: true })
    setTasks((data ?? []) as Task[])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const toggleDone = async (task: Task) => {
    await supabase.from('tasks').update({ done: !task.done }).eq('id', task.id)
    setTasks(tasks.map(t => t.id === task.id ? { ...t, done: !t.done } : t))
  }

  const deleteTask = async (id: string) => {
    await supabase.from('tasks').delete().eq('id', id)
    setTasks(tasks.filter(t => t.id !== id))
  }

  const addTask = async () => {
    if (!newTitle.trim()) return
    setAdding(true)

    let remind_at: string | null = null
    if (newTime) {
      const [h, m] = newTime.split(':').map(Number)
      const d = new Date()
      d.setHours(h, m, 0, 0)
      remind_at = d.toISOString()
    }

    const { data } = await supabase.from('tasks').insert({
      title: newTitle.trim(),
      remind_at,
      date: today,
      priority: 2,
      source: 'web',
    }).select().single()

    if (data) setTasks([...tasks, data as Task].sort((a, b) =>
      (a.remind_at ?? '').localeCompare(b.remind_at ?? '')
    ))

    setNewTitle('')
    setNewTime('')
    setAdding(false)
  }

  const done = tasks.filter(t => t.done)
  const pending = tasks.filter(t => !t.done)

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: '32px 16px' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 32 }}>
        <div>
          <div style={{ fontSize: 11, color: 'var(--muted)', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 4 }}>
            {new Date().toLocaleDateString('ru', { weekday: 'long', day: 'numeric', month: 'long', timeZone: TZ })}
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--accent)' }}>Задачи</h1>
        </div>
        <nav style={{ display: 'flex', gap: 16, fontSize: 13, color: 'var(--muted)' }}>
          <a href="/tasks" style={{ color: 'var(--accent)' }}>Задачи</a>
          <a href="/settings">Настройки</a>
        </nav>
      </div>

      {/* Добавить задачу */}
      <div style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        padding: 16,
        marginBottom: 24,
      }}>
        <div style={{ fontSize: 11, color: 'var(--muted)', letterSpacing: 1, marginBottom: 12, textTransform: 'uppercase' }}>
          + Новая задача
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            style={{ flex: 1 }}
            placeholder="Что нужно сделать?"
            value={newTitle}
            onChange={e => setNewTitle(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addTask()}
          />
          <input
            type="time"
            style={{ width: 110 }}
            value={newTime}
            onChange={e => setNewTime(e.target.value)}
          />
          <button
            onClick={addTask}
            disabled={adding || !newTitle.trim()}
            style={{ background: 'var(--accent)', color: '#0f0f10', fontWeight: 700 }}
          >
            {adding ? '...' : 'Добавить'}
          </button>
        </div>
      </div>

      {/* Список задач */}
      {loading ? (
        <div style={{ color: 'var(--muted)', textAlign: 'center', padding: 40 }}>загрузка...</div>
      ) : (
        <>
          {pending.length === 0 && done.length === 0 && (
            <div style={{ color: 'var(--muted)', textAlign: 'center', padding: 40 }}>
              Задач на сегодня нет 🎉
            </div>
          )}

          {pending.map(task => (
            <TaskRow key={task.id} task={task} onToggle={toggleDone} onDelete={deleteTask} />
          ))}

          {done.length > 0 && (
            <>
              <div style={{ fontSize: 11, color: 'var(--muted)', letterSpacing: 2, textTransform: 'uppercase', margin: '24px 0 12px' }}>
                Выполнено ({done.length})
              </div>
              {done.map(task => (
                <TaskRow key={task.id} task={task} onToggle={toggleDone} onDelete={deleteTask} />
              ))}
            </>
          )}
        </>
      )}
    </div>
  )
}

function TaskRow({ task, onToggle, onDelete }: {
  task: Task
  onToggle: (t: Task) => void
  onDelete: (id: string) => void
}) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      padding: '12px 16px',
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderLeft: `3px solid ${PRIORITY_COLOR[task.priority]}`,
      borderRadius: 'var(--radius)',
      marginBottom: 8,
      opacity: task.done ? 0.45 : 1,
      transition: 'opacity 0.2s',
    }}>
      {/* Чекбокс */}
      <button
        onClick={() => onToggle(task)}
        style={{
          width: 20, height: 20, borderRadius: 5,
          background: task.done ? 'var(--accent)' : 'transparent',
          border: `2px solid ${task.done ? 'var(--accent)' : 'var(--border)'}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0, padding: 0,
        }}
      >
        {task.done && <span style={{ fontSize: 11, color: '#0f0f10', fontWeight: 900 }}>✓</span>}
      </button>

      {/* Время */}
      <span style={{ color: 'var(--muted)', fontSize: 13, minWidth: 42, flexShrink: 0 }}>
        {toLocalTime(task.remind_at)}
      </span>

      {/* Название */}
      <span style={{
        flex: 1,
        textDecoration: task.done ? 'line-through' : 'none',
        color: task.done ? 'var(--muted)' : 'var(--text)',
      }}>
        {task.title}
      </span>

      {/* Длительность */}
      {task.estimated_min && (
        <span style={{ fontSize: 11, color: 'var(--muted)', flexShrink: 0 }}>
          {task.estimated_min}м
        </span>
      )}

      {/* Удалить */}
      <button
        onClick={() => onDelete(task.id)}
        style={{ background: 'transparent', color: 'var(--muted)', padding: '0 4px', fontSize: 16 }}
      >
        ×
      </button>
    </div>
  )
}
