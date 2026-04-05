import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth'
import * as XLSX from 'xlsx'

const FIELD_RU: Record<string, string> = {
  age: 'Возраст',
  gender: 'Пол',
  occupation: 'Род деятельности',
  paidContentTypes: 'Тип платного контента',
  monthlySpend: 'Расходы на контент/мес',
  platforms: 'Платформы',
  contentTopics: 'Интересные темы',
  appealFactors: 'Факторы привлекательности',
  vlkContentAware: 'Знакомство с VLK-контентом',
  desiredContent: 'Желаемый контент из VLK',
  preferredPlatform: 'Предпочтительная платформа',
  buyVlkProduct: 'Готовность купить товар VLK',
  purchaseChannels: 'Каналы покупок',
  priceWillingness: 'Готовность платить',
  purchaseFactors: 'Факторы покупки',
  openProduct: 'Открытый вопрос (продукт)',
  openCity: 'Город',
}

function fieldRu(name: string): string { return FIELD_RU[name] || name }
function pairRu(pair: string): string { return pair.split(' × ').map(f => fieldRu(f)).join(' × ') }
function levelRu(l: string): string {
  return l === 'high' ? 'Высокий' : l === 'medium' ? 'Средний' : l === 'low' ? 'Низкий' : l === 'critical' ? 'Критичный' : l
}
function strengthRu(s: string): string {
  return s === 'strong' ? 'Сильная' : s === 'moderate' ? 'Средняя' : s === 'weak' ? 'Слабая' : s
}
function sentimentRu(s: string): string {
  return s === 'positive' ? 'Позитивный' : s === 'negative' ? 'Негативный' : s === 'neutral' ? 'Нейтральный' : s
}

function autoWidth(rows: unknown[][]): Array<{ wch: number }> {
  const cols: number[] = []
  for (const row of rows) {
    row.forEach((cell, i) => {
      const len = String(cell ?? '').length
      cols[i] = Math.min(Math.max(cols[i] || 0, len), 60)
    })
  }
  return cols.map((w) => ({ wch: w + 2 }))
}

/** Escape formula injection: =, +, -, @, tab, CR at start of cell */
function sanitizeCell(val: unknown): unknown {
  if (typeof val !== 'string') return val
  if (/^[=+\-@\t\r]/.test(val)) return "'" + val
  return val
}

function addSheet(wb: XLSX.WorkBook, name: string, rows: unknown[][]) {
  const safe = rows.map(row => row.map(sanitizeCell))
  const ws = XLSX.utils.aoa_to_sheet(safe)
  ws['!cols'] = autoWidth(rows)
  XLSX.utils.book_append_sheet(wb, ws, name)
}

export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(request.url)
  const id = url.searchParams.get('id')
  if (!id) {
    return NextResponse.json({ error: 'Missing id parameter' }, { status: 400 })
  }

  const analysis = await prisma.analysisResult.findUnique({ where: { id } })
  if (!analysis) {
    return NextResponse.json({ error: 'Analysis not found' }, { status: 404 })
  }

  const data = JSON.parse(analysis.result)
  const wb = XLSX.utils.book_new()
  const date = new Date(analysis.createdAt)
  const dateStr = `${String(date.getDate()).padStart(2, '0')}.${String(date.getMonth() + 1).padStart(2, '0')}.${date.getFullYear()}`

  // ── Sheet 1: Итоги ──
  const summaryRows: unknown[][] = [
    ['Аналитический отчёт'],
    ['Дата', dateStr],
    ['Модель', analysis.model],
    ['Ответов', analysis.totalResponses],
    [''],
    ['Общий анализ'],
    [data.executiveSummary || ''],
  ]
  if (data.pipelineSteps?.length) {
    summaryRows.push([''])
    summaryRows.push(['Шаг', 'Название', 'Токены', 'Время (с)'])
    for (const s of data.pipelineSteps) {
      summaryRows.push([s.step, s.name, s.tokens, (s.duration_ms / 1000).toFixed(1)])
    }
  }
  addSheet(wb, 'Итоги', summaryRows)

  // ── Sheet 2: Рекомендации ──
  if (data.recommendations?.length) {
    const recRows: unknown[][] = [
      ['Действие', 'Приоритет', 'Целевая персона', 'Ожидаемый эффект', 'Срок', 'Детали', 'Уверенность %'],
    ]
    for (const r of data.recommendations) {
      recRows.push([
        r.action, levelRu(r.priority), r.target_persona,
        r.expected_impact, r.timeline, r.details, r.confidence,
      ])
    }
    addSheet(wb, 'Рекомендации', recRows)
  }

  // ── Sheet 3: Риски ──
  if (data.risks?.length) {
    const riskRows: unknown[][] = [
      ['Риск', 'Вероятность', 'Влияние', 'Митигация'],
    ]
    for (const r of data.risks) {
      riskRows.push([r.risk, levelRu(r.probability), levelRu(r.impact), r.mitigation])
    }
    addSheet(wb, 'Риски', riskRows)
  }

  // ── Sheet 4: Персоны ──
  if (data.personas?.length) {
    const pRows: unknown[][] = [
      ['Имя', 'Описание', 'Доля %', 'Возраст', 'Пол', 'Деятельность',
       'Предпочтения контента', 'Платформы', 'Расходы', 'Отношение к VLK', 'Мотиваторы'],
    ]
    for (const p of data.personas) {
      pRows.push([
        p.name, p.description, p.size_percent,
        p.demographics?.age, p.demographics?.gender, p.demographics?.occupation,
        p.content_preferences?.join('; '), p.platforms?.join('; '),
        p.spending, p.vlk_attitude, p.key_motivators?.join('; '),
      ])
    }
    addSheet(wb, 'Персоны', pRows)
  }

  // ── Sheet 5: Матрица спроса ──
  if (data.demandMatrix?.length) {
    const mRows: unknown[][] = [
      ['Тип контента', 'Спрос', 'Готовность платить', 'Возможность', 'Платформа', 'Заметки'],
    ]
    for (const d of data.demandMatrix) {
      mRows.push([d.content_type, d.demand_score, d.wtp_score, levelRu(d.opportunity), d.platform_fit, d.notes])
    }
    addSheet(wb, 'Матрица спроса', mRows)
  }

  // ── Sheet 6: Темы ──
  if (data.openTextThemes?.product_themes?.length) {
    const tRows: unknown[][] = [
      ['Тема', 'Количество', 'Процент %', 'Тональность', 'Примеры'],
    ]
    for (const t of data.openTextThemes.product_themes) {
      tRows.push([t.theme, t.count, t.percentage, sentimentRu(t.sentiment), t.examples?.join('; ')])
    }
    if (data.openTextThemes.city_distribution?.length) {
      tRows.push([''])
      tRows.push(['География респондентов'])
      tRows.push(['Город', 'Количество'])
      for (const c of data.openTextThemes.city_distribution) {
        tRows.push([c.city, c.count])
      }
    }
    addSheet(wb, 'Темы', tRows)
  }

  // ── Sheet 7: Статистика ──
  const statsRows: unknown[][] = []
  if (data.stats?.metadata) {
    const m = data.stats.metadata
    statsRows.push(['Метаданные'])
    statsRows.push(['Ответов', m.totalResponses])
    statsRows.push(['Завершённость', `${m.completionRate}%`])
    statsRows.push(['Подозрительных', `${m.suspiciousRate}%`])
    statsRows.push(['Среднее время', `${m.avgDuration}с`])
    statsRows.push([''])
  }
  if (data.stats?.significantCrossTabs?.length) {
    statsRows.push(['Значимые связи (p < 0.05)'])
    statsRows.push(['Пара', "Cramér's V", 'p-value', 'Инсайт'])
    for (const ct of data.stats.significantCrossTabs) {
      statsRows.push([pairRu(ct.pair), ct.cramersV, ct.pValue, ct.insight])
    }
    statsRows.push([''])
  }
  if (data.stats?.correlations?.length) {
    statsRows.push(['Корреляции'])
    statsRows.push(['Поле 1', 'Поле 2', 'Корреляция', 'Сила'])
    for (const c of data.stats.correlations) {
      statsRows.push([fieldRu(c.field1), fieldRu(c.field2), c.correlation, strengthRu(c.strength)])
    }
  }
  if (statsRows.length > 0) {
    addSheet(wb, 'Статистика', statsRows)
  }

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })

  return new NextResponse(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="analytics_${dateStr.replace(/\./g, '-')}.xlsx"`,
    },
  })
}
