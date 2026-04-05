import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { questions } from '@/lib/questions'
import { auditLog } from '@/lib/audit'
import * as XLSX from 'xlsx'

function optionLabel(fieldName: string, optionId: string): string {
  const q = questions.find((q) => q.fieldName === fieldName)
  return q?.options?.find((o) => o.id === optionId)?.ru || optionId
}

function fmtDate(d: Date | null | undefined): string {
  if (!d) return ''
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yy = d.getFullYear()
  const hh = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  return `${dd}.${mm}.${yy} ${hh}:${mi}`
}

/** Escape formula injection: =, +, -, @, tab, CR at start of cell */
function sanitizeCell(val: unknown): unknown {
  if (typeof val !== 'string') return val
  if (/^[=+\-@\t\r]/.test(val)) return "'" + val
  return val
}

function autoWidth(rows: unknown[][]): Array<{ wch: number }> {
  const cols: number[] = []
  for (const row of rows) {
    row.forEach((cell, i) => {
      const len = String(cell ?? '').length
      cols[i] = Math.min(Math.max(cols[i] || 0, len), 50)
    })
  }
  return cols.map((w) => ({ wch: w + 2 }))
}

export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const ip = request.headers.get('x-real-ip') || request.headers.get('x-forwarded-for')
  const url = new URL(request.url)
  const format = url.searchParams.get('format') || 'csv'

  await auditLog({ action: 'export', username: session.username, ip, details: `format=${format}` })

  const responses = await prisma.surveyResponse.findMany({
    orderBy: { createdAt: 'desc' },
  })

  const headers = [
    '№',
    ...questions.map((q) => `${q.id}: ${q.ru}`),
    'Начало', 'Завершено', 'Время (с)',
    'Устройство', 'Подозрительный', 'Причины подозрений',
    'Заполненность', 'Неполный',
  ]

  const rows = responses.map((r: Record<string, unknown> & typeof responses[number], idx: number) => {
    const data = r as Record<string, unknown>
    return [
      idx + 1,
      ...questions.map((q) => {
        const val = data[q.fieldName]
        if (Array.isArray(val)) return val.map((v: string) => optionLabel(q.fieldName, v)).join('; ')
        if (typeof val === 'string' && val) return q.options ? optionLabel(q.fieldName, val) : val
        return ''
      }),
      fmtDate(r.startedAt),
      fmtDate(r.completedAt),
      r.durationSeconds || '',
      r.deviceType || '',
      r.isSuspicious ? 'Да' : 'Нет',
      r.suspicionReasons.join('; '),
      `${Math.round(r.completionRate * 100)}%`,
      r.isPartial ? 'Да' : 'Нет',
    ]
  })

  const allRows = [headers, ...rows.map(row => row.map(sanitizeCell))]

  if (format === 'xlsx') {
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.aoa_to_sheet(allRows)
    ws['!cols'] = autoWidth(allRows)
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
  const csvContent = BOM + allRows
    .map((row) =>
      row.map((cell: unknown) => {
        const str = String(cell ?? '')
        if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes(';')) {
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
