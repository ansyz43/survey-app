import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth'

export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const total = await prisma.surveyResponse.count()
  const completed = await prisma.surveyResponse.count({ where: { completedAt: { not: null } } })
  const suspicious = await prisma.surveyResponse.count({ where: { isSuspicious: true } })
  const partial = await prisma.surveyResponse.count({ where: { isPartial: true } })

  // Age distribution
  const allResponses = await prisma.surveyResponse.findMany({
    where: { completedAt: { not: null } },
    select: {
      age: true,
      gender: true,
      occupation: true,
      paidContentTypes: true,
      platforms: true,
      contentTopics: true,
      preferredPlatform: true,
      buyVlkProduct: true,
      monthlySpend: true,
      dropOffQuestion: true,
      completionRate: true,
    },
  })

  const byAge: Record<string, number> = {}
  const byGender: Record<string, number> = {}
  const byOccupation: Record<string, number> = {}
  const byPlatform: Record<string, number> = {}
  const byContentType: Record<string, number> = {}
  const byContentTopic: Record<string, number> = {}
  const byPreferredPlatform: Record<string, number> = {}
  const byBuyIntent: Record<string, number> = {}
  const byMonthlySpend: Record<string, number> = {}
  const dropOffCounts: Record<string, number> = {}

  for (const r of allResponses) {
    if (r.age) byAge[r.age] = (byAge[r.age] || 0) + 1
    if (r.gender) byGender[r.gender] = (byGender[r.gender] || 0) + 1
    if (r.occupation) byOccupation[r.occupation] = (byOccupation[r.occupation] || 0) + 1
    if (r.monthlySpend) byMonthlySpend[r.monthlySpend] = (byMonthlySpend[r.monthlySpend] || 0) + 1
    if (r.preferredPlatform) byPreferredPlatform[r.preferredPlatform] = (byPreferredPlatform[r.preferredPlatform] || 0) + 1
    if (r.buyVlkProduct) byBuyIntent[r.buyVlkProduct] = (byBuyIntent[r.buyVlkProduct] || 0) + 1

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
