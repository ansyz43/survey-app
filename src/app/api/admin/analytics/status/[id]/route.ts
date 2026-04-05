import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { getJobStatus } from '@/lib/analytics-pipeline'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const job = await getJobStatus(id)
  if (!job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  }

  // Only parse full result when completed
  if (job.status === 'completed') {
    try {
      const parsed = JSON.parse(job.result)
      return NextResponse.json({
        status: 'completed',
        currentStep: job.currentStep,
        result: { id: job.id, ...parsed },
      })
    } catch {
      return NextResponse.json({
        status: 'failed',
        error: 'Ошибка парсинга результата',
      })
    }
  }

  return NextResponse.json({
    status: job.status,
    currentStep: job.currentStep,
    error: job.error || undefined,
  })
}
