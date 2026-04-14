import { NextRequest, NextResponse } from 'next/server'
import { syncSchedule } from '@/lib/schedule'
import { getSettings } from '@/lib/bot'

// GET /api/schedule/sync?secret=xxx — ручной триггер
export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get('secret')
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const settings = await getSettings()
    await syncSchedule(settings.college_group, settings.university_group, 30)
    return NextResponse.json({ ok: true, message: 'Schedule synced for 30 days' })
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 })
  }
}
