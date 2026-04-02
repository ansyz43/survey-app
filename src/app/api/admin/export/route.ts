import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { questions } from '@/lib/questions'
import * as XLSX from 'xlsx'

export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(request.url)
  const format = url.searchParams.get('format') || 'csv'

  const responses = await prisma.surveyResponse.findMany({
    orderBy: { createdAt: 'desc' },
  })

  // Build headers
  const headers = [
    'ID', 'Session ID',
    ...questions.map((q) => `${q.id}: ${q.ru}`),
    'Started At', 'Completed At', 'Duration (s)',
    'Device', 'Suspicious', 'Suspicious Reasons',
    'Completion Rate', 'Partial',
  ]

  const rows = responses.map((r: Record<string, unknown> & typeof responses[number]) => {
    const data = r as Record<string, unknown>
    return [
      r.id,
      r.sessionId,
      ...questions.map((q) => {
        const val = data[q.fieldName]
        if (Array.isArray(val)) return val.join(', ')
        return val || ''
      }),
      r.startedAt?.toISOString() || '',
      r.completedAt?.toISOString() || '',
      r.durationSeconds || '',
      r.deviceType || '',
      r.isSuspicious ? 'Да' : 'Нет',
      r.suspicionReasons.join(', '),
      r.completionRate,
      r.isPartial ? 'Да' : 'Нет',
    ]
  })

  if (format === 'xlsx') {
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
    XLSX.utils.book_append_sheet(wb, ws, 'Ответы')
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })

    return new NextResponse(buf, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="survey_responses_${new Date().toISOString().slice(0, 10)}.xlsx"`,
      },
    })
  }

  // CSV
  const BOM = '\uFEFF'
  const csvContent = BOM + [headers, ...rows]
    .map((row) =>
      row.map((cell: unknown) => {
        const str = String(cell)
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return `"${str.replace(/"/g, '""')}"`
        }
        return str
      }).join(',')
    )
    .join('\n')

  return new NextResponse(csvContent, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="survey_responses_${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  })
}
