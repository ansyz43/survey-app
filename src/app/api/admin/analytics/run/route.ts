import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { runAnalysisPipeline } from '@/lib/analytics-pipeline'

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json().catch(() => ({}))
    const result = await runAnalysisPipeline(body.prompt || undefined)
    return NextResponse.json(result)
  } catch (error) {
    console.error('Analytics pipeline error:', error)
    const message = error instanceof Error ? error.message : 'Ошибка анализа'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
