/**
 * Парсер расписания УГГУ/УрГЭУ
 * Сайт: https://www.usue.ru/raspisanie/
 *
 * Сайт рендерит таблицу через POST-форму или AJAX.
 * При необходимости скорректируй URL и селекторы после первого запуска.
 */

import * as cheerio from 'cheerio'
import type { ScheduleLesson } from '@/types'
import { supabase } from './supabase'

// Время начала/конца каждой пары (УрГЭУ стандарт)
const LESSON_TIMES: Record<number, { start: string; end: string }> = {
  1: { start: '08:00', end: '09:30' },
  2: { start: '09:40', end: '11:10' },
  3: { start: '11:30', end: '13:00' },
  4: { start: '13:45', end: '15:15' },
  5: { start: '15:25', end: '16:55' },
  6: { start: '17:05', end: '18:35' },
  7: { start: '18:45', end: '20:15' },
  8: { start: '20:20', end: '21:50' },
}

const BASE_URL = 'https://www.usue.ru/raspisanie/'

/**
 * Получить расписание на диапазон дат для группы
 */
async function fetchScheduleHtml(
  group: string,
  dateFrom: string,
  dateTo: string
): Promise<string> {
  const params = new URLSearchParams({
    group,
    from: dateFrom,   // формат: DD.MM.YYYY
    to: dateTo,
    view: 'list',
  })

  const res = await fetch(`${BASE_URL}?${params.toString()}`, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; TaskAgent/1.0)',
      'Accept': 'text/html,application/xhtml+xml',
    },
    next: { revalidate: 0 },
  })

  if (!res.ok) throw new Error(`Schedule fetch failed: ${res.status}`)
  return res.text()
}

/**
 * Определить тип занятия по строке
 */
function parseType(raw: string): ScheduleLesson['type'] {
  const s = raw.toLowerCase()
  if (s.includes('лек')) return 'lecture'
  if (s.includes('пр') || s.includes('практ') || s.includes('сем')) return 'practice'
  if (s.includes('лаб')) return 'lab'
  return 'other'
}

/**
 * Парсит HTML расписания УГГУ в массив занятий
 * Селекторы могут потребовать корректировки после первого запуска
 */
function parseHtml(
  html: string,
  source: 'college' | 'university'
): ScheduleLesson[] {
  const $ = cheerio.load(html)
  const lessons: ScheduleLesson[] = []

  // Таблица расписания на сайте УГГУ/УрГЭУ
  // Каждая строка — одно занятие
  $('table.rasp tr, table.schedule tr, .schedule-table tr').each((_, row) => {
    const cells = $(row).find('td')
    if (cells.length < 4) return

    const dateRaw = $(cells[0]).text().trim()    // "14.04.2026"
    const lessonRaw = $(cells[1]).text().trim()  // "1" или "1 пара"
    const subjectRaw = $(cells[2]).text().trim()
    const teacherRaw = $(cells[3]).text().trim()
    const roomRaw = cells.length > 4 ? $(cells[4]).text().trim() : ''

    // Парсим дату DD.MM.YYYY → YYYY-MM-DD
    const dateParts = dateRaw.match(/(\d{2})\.(\d{2})\.(\d{4})/)
    if (!dateParts) return
    const date = `${dateParts[3]}-${dateParts[2]}-${dateParts[1]}`

    // Номер пары
    const lessonMatch = lessonRaw.match(/\d+/)
    if (!lessonMatch) return
    const lessonNumber = parseInt(lessonMatch[0])

    const times = LESSON_TIMES[lessonNumber]
    if (!times) return

    lessons.push({
      date,
      lesson_number: lessonNumber,
      time_start: times.start,
      time_end: times.end,
      subject: subjectRaw,
      teacher: teacherRaw || null,
      room: roomRaw || null,
      type: parseType(subjectRaw),
      source,
    })
  })

  return lessons
}

/**
 * Получить и закэшировать расписание на ближайшие N дней
 */
export async function syncSchedule(
  collegeGroup: string,
  universityGroup: string,
  days = 14
): Promise<void> {
  const now = new Date()
  const from = formatDate(now)
  const to = formatDate(new Date(now.getTime() + days * 86400000))

  const sources: Array<{ group: string; source: 'college' | 'university' }> = [
    { group: collegeGroup, source: 'college' },
    { group: universityGroup, source: 'university' },
  ]

  for (const { group, source } of sources) {
    try {
      const html = await fetchScheduleHtml(group, from, to)
      const lessons = parseHtml(html, source)

      if (lessons.length === 0) {
        console.warn(`No lessons parsed for ${source} group ${group}`)
        continue
      }

      // Upsert в кэш
      const { error } = await supabase
        .from('schedule_cache')
        .upsert(lessons, { onConflict: 'date,lesson_number,source' })

      if (error) throw error
      console.log(`Synced ${lessons.length} lessons for ${source}`)
    } catch (err) {
      console.error(`Failed to sync ${source} schedule:`, err)
    }
  }
}

/**
 * Получить расписание на конкретный день из кэша
 */
export async function getScheduleForDay(date: string): Promise<ScheduleLesson[]> {
  const { data, error } = await supabase
    .from('schedule_cache')
    .select('*')
    .eq('date', date)
    .order('lesson_number', { ascending: true })

  if (error) throw error
  return (data ?? []) as ScheduleLesson[]
}

/**
 * Получить номер первой пары на день (для определения времени подъёма)
 */
export async function getFirstLessonNumber(date: string): Promise<number | null> {
  const lessons = await getScheduleForDay(date)
  if (lessons.length === 0) return null
  return lessons[0].lesson_number
}

// DD.MM.YYYY
function formatDate(d: Date): string {
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`
}
