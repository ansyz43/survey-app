import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { startAnalysisPipeline } from '@/lib/analytics-pipeline'
import { auditLog } from '@/lib/audit'

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const ip = request.headers.get('x-real-ip') || request.headers.get('x-forwarded-for')

  try {
    const body = await request.json().catch(() => ({}))
    await auditLog({ action: 'analytics_run', username: session.username, ip })
    const jobId = await startAnalysisPipeline(body.prompt || undefined)
    return NextResponse.json({ jobId })
  } catch (error) {
    console.error('Analytics pipeline error:', error)
    const message = error instanceof Error ? error.message : 'Ошибка анализа'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
