/**
 * Парсер расписания УрГЭУ (USUE)
 * API возвращает JSON напрямую — cheerio не нужен
 */

import type { ScheduleLesson } from '@/types'
import { supabase } from './supabase'

// Времена пар берём из API (поле time), но оставим фолбэк
function parseTime(timeStr: string): { start: string; end: string } | null {
  // Формат: "8:30-10:00" или "10:10-11:40"
  const match = timeStr.match(/(\d{1,2}:\d{2})-(\d{1,2}:\d{2})/)
  if (!match) return null
  const pad = (t: string) => t.length === 4 ? '0' + t : t // "8:30" → "08:30"
  return { start: pad(match[1]), end: pad(match[2]) }
}

function parseType(subject: string): ScheduleLesson['type'] {
  const s = subject.toLowerCase()
  if (s.includes('лекц')) return 'lecture'
  if (s.includes('практ') || s.includes('семин')) return 'practice'
  if (s.includes('лаб')) return 'lab'
  return 'other'
}

// DD.MM.YYYY → YYYY-MM-DD
function parseDate(raw: string): string | null {
  const m = raw.match(/(\d{2})\.(\d{2})\.(\d{4})/)
  if (!m) return null
  return `${m[3]}-${m[2]}-${m[1]}`
}

interface ApiDay {
  date: string
  weekDay: string
  pairs: ApiPair[]
}

interface ApiPair {
  N: number
  time: string
  schedulePairs: ApiLesson[]
}

interface ApiLesson {
  subject: string
  teacher: string
  group: string
  aud: string
  comm: string
}

/**
 * Получить расписание с API УрГЭУ
 * URL вида: https://www.usue.ru/raspisanie/?group=24-03+ТД1&from=14.04.2026&to=28.04.2026
 * Точный endpoint уточни из DevTools → Network
 */
async function fetchScheduleJson(
  group: string,
  dateFrom: string, // DD.MM.YYYY
  dateTo: string
): Promise<ApiDay[]> {
  const params = new URLSearchParams({
    group,
    startDate: dateFrom,
    endDate: dateTo,
  })

  const url = `https://www.usue.ru/schedule/?action=show&t=${Math.random()}&${params.toString()}`

  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0',
      'Accept': 'application/json, text/javascript, */*',
      'X-Requested-With': 'XMLHttpRequest',
    },
    next: { revalidate: 0 },
  })

  if (!res.ok) throw new Error(`Schedule API error: ${res.status} ${url}`)

  const text = await res.text()

  // Сайт может вернуть JSON напрямую или обёрнутый в объект
  try {
    const data = JSON.parse(text)
    // Если массив — это и есть дни
    if (Array.isArray(data)) return data as ApiDay[]
    // Если объект с полем data/schedule/days
    if (data.data) return data.data as ApiDay[]
    if (data.schedule) return data.schedule as ApiDay[]
    if (data.days) return data.days as ApiDay[]
    // Если объект где ключи — даты
    return Object.values(data) as ApiDay[]
  } catch {
    throw new Error(`Failed to parse schedule JSON: ${text.slice(0, 200)}`)
  }
}

/**
 * Синхронизировать расписание на N дней
 */
export async function syncSchedule(
  collegeGroup: string,
  universityGroup: string,
  days = 14
): Promise<void> {
  const now = new Date()
  const from = toDMY(now)
  const to = toDMY(new Date(now.getTime() + days * 86400000))

  const sources: Array<{ group: string; source: 'college' | 'university' }> = [
    { group: collegeGroup, source: 'college' },
    { group: universityGroup, source: 'university' },
  ]

  for (const { group, source } of sources) {
    try {
      const days_data = await fetchScheduleJson(group, from, to)
      const lessons: ScheduleLesson[] = []

      for (const day of days_data) {
        const date = parseDate(day.date)
        if (!date) continue

        for (const pair of day.pairs) {
          if (!pair.schedulePairs || pair.schedulePairs.length === 0) continue
          const times = parseTime(pair.time)
          if (!times) continue

          for (const sp of pair.schedulePairs) {
            lessons.push({
              date,
              lesson_number: pair.N,
              time_start: times.start,
              time_end: times.end,
              subject: sp.subject,
              teacher: sp.teacher || null,
              room: sp.aud || null,
              type: parseType(sp.subject),
              source,
            })
          }
        }
      }

      if (lessons.length === 0) {
        console.warn(`No lessons for ${source} group ${group}`)
        continue
      }

      const { error } = await supabase
        .from('schedule_cache')
        .upsert(lessons, { onConflict: 'date,lesson_number,source' })

      if (error) throw error
      console.log(`Synced ${lessons.length} lessons for ${source}`)
    } catch (err) {
      console.error(`Failed to sync ${source}:`, err)
    }
  }
}

export async function getScheduleForDay(date: string): Promise<ScheduleLesson[]> {
  const { data, error } = await supabase
    .from('schedule_cache')
    .select('*')
    .eq('date', date)
    .order('lesson_number', { ascending: true })

  if (error) throw error
  return (data ?? []) as ScheduleLesson[]
}

export async function getFirstLessonNumber(date: string): Promise<number | null> {
  const lessons = await getScheduleForDay(date)
  if (lessons.length === 0) return null
  return lessons[0].lesson_number
}

// DD.MM.YYYY
function toDMY(d: Date): string {
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`
}
