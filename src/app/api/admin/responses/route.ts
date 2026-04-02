import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth'

export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(request.url)
  const page = parseInt(url.searchParams.get('page') || '1')
  const limit = parseInt(url.searchParams.get('limit') || '50')
  const skip = (page - 1) * limit

  // Filters
  const where: Record<string, unknown> = {}
  const age = url.searchParams.get('age')
  const gender = url.searchParams.get('gender')
  const occupation = url.searchParams.get('occupation')
  const suspicious = url.searchParams.get('suspicious')

  if (age) where.age = age
  if (gender) where.gender = gender
  if (occupation) where.occupation = occupation
  if (suspicious === 'true') where.isSuspicious = true
  if (suspicious === 'false') where.isSuspicious = false

  const [responses, total] = await Promise.all([
    prisma.surveyResponse.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.surveyResponse.count({ where }),
  ])

  return NextResponse.json({
    responses,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  })
}
