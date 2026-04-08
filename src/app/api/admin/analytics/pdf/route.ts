import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth'
import PDFDocument from 'pdfkit'
import path from 'path'

const FIELD_RU: Record<string, string> = {
  age: 'Возраст', gender: 'Пол', occupation: 'Род деятельности',
  paidContentTypes: 'Тип платного контента', monthlySpend: 'Расходы на контент/мес',
  platforms: 'Платформы', contentTopics: 'Интересные темы',
  appealFactors: 'Факторы привлекательности', vlkContentAware: 'Знакомство с креативным контентом ДВ',
  desiredContent: 'Желаемый контент из ДВ', preferredPlatform: 'Предпочтительная платформа',
  buyVlkProduct: 'Готовность купить товар ДВ', purchaseChannels: 'Каналы покупок',
  priceWillingness: 'Готовность платить', purchaseFactors: 'Факторы покупки',
}

function fieldRu(name: string): string { return FIELD_RU[name] || name }
function levelRu(l: string): string {
  return l === 'high' ? 'Высокий' : l === 'medium' ? 'Средний' : l === 'low' ? 'Низкий' : l === 'critical' ? 'Критичный' : l
}

export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(request.url)
  const id = url.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const analysis = await prisma.analysisResult.findUnique({ where: { id } })
  if (!analysis || !analysis.result) {
    return NextResponse.json({ error: 'Analysis not found' }, { status: 404 })
  }

  const data = JSON.parse(analysis.result)
  const date = new Date(analysis.createdAt)
  const dateStr = `${String(date.getDate()).padStart(2, '0')}.${String(date.getMonth() + 1).padStart(2, '0')}.${date.getFullYear()}`

  // Build PDF in memory
  const fontDir = path.join(process.cwd(), 'fonts')
  const doc = new PDFDocument({ size: 'A4', margin: 50, bufferPages: true })
  doc.registerFont('Sans', path.join(fontDir, 'DejaVuSans.ttf'))
  doc.registerFont('Sans-Bold', path.join(fontDir, 'DejaVuSans-Bold.ttf'))
  doc.font('Sans')
  const chunks: Buffer[] = []
  doc.on('data', (c: Buffer) => chunks.push(c))

  // ── Title ──
  doc.fontSize(22).text('Аналитический отчёт', { align: 'center' })
  doc.moveDown(0.5)
  doc.fontSize(11).fillColor('#666').text(`Дата: ${dateStr}  |  Модель: ${analysis.model}  |  Ответов: ${analysis.totalResponses}`, { align: 'center' })
  doc.moveDown(1)
  doc.fillColor('#000')

  // ── Executive Summary ──
  if (data.executiveSummary) {
    heading(doc, 'Общий анализ')
    doc.fontSize(10).text(data.executiveSummary, { lineGap: 3 })
    doc.moveDown(1)
  }

  // ── Recommendations ──
  if (data.recommendations?.length) {
    heading(doc, 'Рекомендации')
    for (const r of data.recommendations) {
      checkPage(doc)
      doc.fontSize(10).font('Sans-Bold').text(`● ${r.action}`, { continued: false })
      doc.font('Sans').fontSize(9).fillColor('#555')
      doc.text(`  Приоритет: ${levelRu(r.priority)}  |  Персона: ${r.target_persona || '–'}  |  Срок: ${r.timeline || '–'}`)
      if (r.details) doc.text(`  ${r.details}`, { lineGap: 2 })
      doc.fillColor('#000').moveDown(0.4)
    }
    doc.moveDown(0.6)
  }

  // ── Risks ──
  if (data.risks?.length) {
    heading(doc, 'Риски')
    for (const r of data.risks) {
      checkPage(doc)
      doc.fontSize(10).font('Sans-Bold').text(`▲ ${r.risk}`)
      doc.font('Sans').fontSize(9).fillColor('#555')
      doc.text(`  Вероятность: ${levelRu(r.probability)}  |  Влияние: ${levelRu(r.impact)}`)
      if (r.mitigation) doc.text(`  Митигация: ${r.mitigation}`, { lineGap: 2 })
      doc.fillColor('#000').moveDown(0.4)
    }
    doc.moveDown(0.6)
  }

  // ── Personas ──
  if (data.personas?.length) {
    heading(doc, 'Целевые персоны')
    for (const p of data.personas) {
      checkPage(doc)
      doc.fontSize(11).font('Sans-Bold').text(`${p.name} (${p.size_percent}%)`)
      doc.font('Sans').fontSize(9).fillColor('#555')
      if (p.description) doc.text(p.description)
      const demo = [p.demographics?.age, p.demographics?.gender, p.demographics?.occupation].filter(Boolean).join(', ')
      if (demo) doc.text(`Демография: ${demo}`)
      if (p.platforms?.length) doc.text(`Платформы: ${p.platforms.join(', ')}`)
      if (p.spending) doc.text(`Расходы: ${p.spending}`)
      if (p.key_motivators?.length) doc.text(`Мотиваторы: ${p.key_motivators.join(', ')}`)
      doc.fillColor('#000').moveDown(0.6)
    }
    doc.moveDown(0.4)
  }

  // ── Demand Matrix ──
  if (data.demandMatrix?.length) {
    heading(doc, 'Матрица спроса')
    for (const d of data.demandMatrix) {
      checkPage(doc)
      doc.fontSize(10).font('Sans-Bold').text(d.content_type, { continued: true })
      doc.font('Sans').fontSize(9).text(`  — спрос: ${d.demand_score}, WTP: ${d.wtp_score}, возможность: ${levelRu(d.opportunity)}`)
      if (d.notes) doc.fontSize(9).fillColor('#555').text(`  ${d.notes}`).fillColor('#000')
      doc.moveDown(0.3)
    }
    doc.moveDown(0.6)
  }

  // ── Open Text Themes ──
  if (data.openTextThemes?.product_themes?.length) {
    heading(doc, 'Темы открытых ответов')
    for (const t of data.openTextThemes.product_themes) {
      checkPage(doc)
      doc.fontSize(10).text(`• ${t.theme} — ${t.count} (${t.percentage}%)`)
    }
    doc.moveDown(0.6)
  }

  // ── Stats: Cross-tabs ──
  if (data.stats?.significantCrossTabs?.length) {
    heading(doc, 'Значимые статистические связи')
    for (const ct of data.stats.significantCrossTabs) {
      checkPage(doc)
      const pair = ct.pair.split(' × ').map((f: string) => fieldRu(f)).join(' × ')
      doc.fontSize(9).text(`${pair}: V=${ct.cramersV}, p=${ct.pValue}`)
      if (ct.insight) doc.fontSize(9).fillColor('#555').text(`  ${ct.insight}`).fillColor('#000')
    }
    doc.moveDown(0.6)
  }

  // ── Footer on every page ──
  const pages = doc.bufferedPageRange()
  for (let i = 0; i < pages.count; i++) {
    doc.switchToPage(i)
    doc.fontSize(8).fillColor('#999').text(
      `VladProd Analytics — стр. ${i + 1}/${pages.count}`,
      50, doc.page.height - 40,
      { align: 'center', width: doc.page.width - 100 }
    )
  }

  doc.end()

  // Wait for PDF to finish writing
  const buf = await new Promise<Buffer>((resolve) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)))
  })

  return new NextResponse(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="analytics_${dateStr.replace(/\./g, '-')}.pdf"`,
    },
  })
}

function heading(doc: PDFKit.PDFDocument, text: string) {
  checkPage(doc)
  doc.fontSize(14).font('Sans-Bold').fillColor('#1a56db').text(text)
  doc.moveDown(0.3).fillColor('#000').font('Sans')
}

function checkPage(doc: PDFKit.PDFDocument) {
  if (doc.y > doc.page.height - 100) doc.addPage()
}
