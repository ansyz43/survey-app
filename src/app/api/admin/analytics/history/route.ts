import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth'

export async function GET() {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const analyses = await prisma.analysisResult.findMany({
    where: { status: 'completed' },
    orderBy: { createdAt: 'desc' },
    take: 20,
  })

  return NextResponse.json(
    analyses.map((a: { id: string; model: string; totalResponses: number; createdAt: Date; result: string }) => ({
      id: a.id,
      model: a.model,
      totalResponses: a.totalResponses,
      createdAt: a.createdAt,
      result: JSON.parse(a.result),
    }))
  )
}
