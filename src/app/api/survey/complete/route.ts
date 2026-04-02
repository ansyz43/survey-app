import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { validateResponse } from '@/lib/validation'

export async function POST(request: Request) {
  try {
    const { sessionId } = await request.json()

    if (!sessionId) {
      return NextResponse.json({ error: 'Missing sessionId' }, { status: 400 })
    }

    const response = await prisma.surveyResponse.findUnique({
      where: { sessionId },
    })

    if (!response) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    const now = new Date()
    const durationSeconds = Math.round((now.getTime() - response.startedAt.getTime()) / 1000)
    const isPartial = response.completionRate < 0.7

    // Update with completion data first
    const updated = await prisma.surveyResponse.update({
      where: { sessionId },
      data: {
        completedAt: now,
        durationSeconds,
        isPartial,
      },
    })

    // Run validation
    const validation = validateResponse(updated)

    await prisma.surveyResponse.update({
      where: { sessionId },
      data: {
        isSuspicious: validation.isSuspicious,
        suspicionReasons: validation.reasons,
      },
    })

    return NextResponse.json({
      ok: true,
      duration: durationSeconds,
    })
  } catch (error) {
    console.error('Complete error:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
