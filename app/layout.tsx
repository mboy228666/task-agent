import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Task Agent',
  description: 'Личный планировщик с ИИ',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  )
}
