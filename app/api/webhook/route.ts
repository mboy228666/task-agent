import { NextRequest, NextResponse } from 'next/server'
import { bot } from '@/lib/bot'

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch (e) {
    console.error('[webhook] Failed to parse body:', e)
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 })
  }

  console.log('[webhook] Update received:', JSON.stringify(body).slice(0, 200))

  try {
    await bot.handleUpdate(body as Parameters<typeof bot.handleUpdate>[0])
    console.log('[webhook] handleUpdate OK')
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[webhook] handleUpdate error:', e)
    // Всё равно возвращаем 200 чтобы Telegram не повторял запрос
    return NextResponse.json({ ok: true, warning: String(e) })
  }
}

// Нужно для Vercel — без этого Next.js кэширует
export const dynamic = 'force-dynamic'
