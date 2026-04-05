import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth'
import type { Prisma } from '@prisma/client'

type GroupByField = Prisma.SurveyResponseScalarFieldEnum

async function groupByField(field: GroupByField) {
  const rows = await prisma.surveyResponse.groupBy({
    by: [field],
    _count: { _all: true },
    where: { completedAt: { not: null }, [field]: { not: null } },
  })
  const result: Record<string, number> = {}
  for (const r of rows) {
    const key = r[field] as string | null
    if (key) result[key] = r._count._all
  }
  return result
}

export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Parallel count queries — fast SQL aggregation
  const [total, completed, suspicious, partial, byAge, byGender, byOccupation, byPreferredPlatform, byBuyIntent, byMonthlySpend] = await Promise.all([
    prisma.surveyResponse.count(),
    prisma.surveyResponse.count({ where: { completedAt: { not: null } } }),
    prisma.surveyResponse.count({ where: { isSuspicious: true } }),
    prisma.surveyResponse.count({ where: { isPartial: true } }),
    groupByField('age'),
    groupByField('gender'),
    groupByField('occupation'),
    groupByField('preferredPlatform'),
    groupByField('buyVlkProduct'),
    groupByField('monthlySpend'),
  ])

  // Array fields need in-memory counting, but we select only those fields
  const arrayData = await prisma.surveyResponse.findMany({
    where: { completedAt: { not: null } },
    select: {
      platforms: true,
      paidContentTypes: true,
      contentTopics: true,
      dropOffQuestion: true,
      completionRate: true,
    },
  })

  const byPlatform: Record<string, number> = {}
  const byContentType: Record<string, number> = {}
  const byContentTopic: Record<string, number> = {}
  const dropOffCounts: Record<string, number> = {}

  for (const r of arrayData) {
    for (const p of r.platforms) byPlatform[p] = (byPlatform[p] || 0) + 1
    for (const ct of r.paidContentTypes) byContentType[ct] = (byContentType[ct] || 0) + 1
    for (const t of r.contentTopics) byContentTopic[t] = (byContentTopic[t] || 0) + 1
    if (r.completionRate < 1 && r.dropOffQuestion) {
      dropOffCounts[r.dropOffQuestion] = (dropOffCounts[r.dropOffQuestion] || 0) + 1
    }
  }

  return NextResponse.json({
    total,
    completed,
    suspicious,
    partial,
    completionRate: total > 0 ? Math.round((completed / total) * 100) : 0,
    byAge,
    byGender,
    byOccupation,
    byPlatform,
    byContentType,
    byContentTopic,
    byPreferredPlatform,
    byBuyIntent,
    byMonthlySpend,
    dropOffCounts,
  })
}
