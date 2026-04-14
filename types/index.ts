export type Priority = 1 | 2 | 3 // 1=высокий, 2=средний, 3=низкий

export interface Task {
  id: string
  title: string
  remind_at: string | null       // ISO timestamptz
  deadline: string | null        // YYYY-MM-DD
  priority: Priority
  estimated_min: number | null
  done: boolean
  snoozed_to: string | null
  date: string                   // YYYY-MM-DD — на какой день задача
  source: 'bot' | 'web' | 'morning' // откуда добавлена
  created_at: string
}

export interface Settings {
  id: number
  morning_poll_time: string      // "08:30"
  work_start: string             // "10:00"
  work_end: string               // "22:00"
  lunch_start: string            // "13:00"
  lunch_duration_min: number     // 60
  sport_days: string[]           // ["mon","wed","fri"]
  sport_time: string             // "19:00"
  sport_duration_min: number     // 60
  study_days: string[]           // ["tue","thu"]
  study_time: string             // "18:00"
  study_duration_min: number     // 90
  college_group: string          // "24-03 ТД1"
  university_group: string       // "Э-ОЗЭП(ППК)-25-2-у"
  wake_times: WakeTimeRule[]     // правила подъёма
  timezone: string               // "Asia/Yekaterinburg"
  telegram_chat_id: string
}

export interface WakeTimeRule {
  lesson_number: number          // номер первой пары
  wake_time: string              // "07:00"
}

export interface ScheduleLesson {
  date: string                   // YYYY-MM-DD
  lesson_number: number          // 1-8
  time_start: string             // "08:00"
  time_end: string               // "09:30"
  subject: string
  teacher: string | null
  room: string | null
  type: 'lecture' | 'practice' | 'lab' | 'other'
  source: 'college' | 'university'
}
