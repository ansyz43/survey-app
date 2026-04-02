import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function POST(request: Request) {
  const ua = request.headers.get('user-agent') || ''
  const isMobile = /mobile|android|iphone|ipad/i.test(ua)
  const sessionId = crypto.randomUUID()

  const response = await prisma.surveyResponse.create({
    data: {
      sessionId,
      deviceType: isMobile ? 'mobile' : 'desktop',
      userAgent: ua.slice(0, 500),
    },
  })

  return NextResponse.json({ sessionId: response.sessionId })
}
