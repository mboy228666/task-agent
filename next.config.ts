import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Vercel cron jobs требуют что маршруты не кэшировались
  experimental: {
    serverActions: { allowedOrigins: ['localhost:3000'] },
  },
}

export default nextConfig
