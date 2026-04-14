import { NextRequest, NextResponse } from 'next/server'
import { bot } from '@/lib/bot'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    await bot.handleUpdate(body)
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('Webhook error:', e)
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
