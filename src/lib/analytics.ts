import OpenAI from 'openai'
import { prisma } from './db'
import { questions } from './questions'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

interface AnalysisOutput {
  segments: Array<{ name: string; description: string; size: number; percentage: number }>
  topContent: Array<{ type: string; demand: number; description: string }>
  topPlatforms: Array<{ platform: string; reach: number; bestFor: string }>
  pricing: { sweet_spot: string; range: string; notes: string }
  recommendations: Array<{ action: string; priority: string; details: string }>
  risks: Array<{ risk: string; mitigation: string }>
  summary: string
}

function buildFrequencyTable(responses: Record<string, unknown>[], field: string): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const r of responses) {
    const val = r[field]
    if (Array.isArray(val)) {
      for (const v of val) {
        counts[v] = (counts[v] || 0) + 1
      }
    } else if (typeof val === 'string' && val) {
      counts[val] = (counts[val] || 0) + 1
    }
  }
  return counts
}

export async function runAnalysis(customPrompt?: string) {
  const responses = await prisma.surveyResponse.findMany({
    where: { isPartial: false, isSuspicious: false },
  })

  if (responses.length === 0) {
    throw new Error('No valid responses to analyze')
  }

  // Build aggregated data
  const aggregated: Record<string, Record<string, number>> = {}
  const fieldNames = questions.map((q) => q.fieldName)
  
  for (const field of fieldNames) {
    aggregated[field] = buildFrequencyTable(
      responses as unknown as Record<string, unknown>[],
      field
    )
  }

  // Collect open text answers
  const openProducts = responses
    .map((r: { openProduct: string | null }) => r.openProduct)
    .filter(Boolean)
    .slice(0, 500)
  const openCities = responses
    .map((r: { openCity: string | null }) => r.openCity)
    .filter(Boolean)
    .slice(0, 500)

  // Question labels for context
  const questionLabels = Object.fromEntries(
    questions.map((q) => [
      q.fieldName,
      {
        question_ru: q.ru,
        question_zh: q.zh,
        options: q.options?.map((o) => ({ id: o.id, zh: o.zh, ru: o.ru })),
      },
    ])
  )

  const dataPayload = JSON.stringify({
    total_responses: responses.length,
    questions: questionLabels,
    frequency_tables: aggregated,
    open_answers_product: openProducts,
    open_answers_city: openCities,
  })

  const systemPrompt = customPrompt || `Ты — аналитик маркетинговых исследований. Тебе даны результаты опроса ${responses.length} китайских респондентов (студенты во Владивостоке).

Задача: определить, какой креативный контент (музыка, фото, видео) команда из Владивостока может создавать и продавать на китайском рынке.

Выполни:
1. СЕГМЕНТАЦИЯ — раздели респондентов на 3–5 кластеров по поведению и предпочтениям
2. ТОП КОНТЕНТ — какие типы контента наиболее востребованы и почему
3. ТОП ПЛАТФОРМЫ — где публиковать для максимального охвата
4. ЦЕНОВОЙ КОРИДОР — сколько целевая аудитория готова платить за физические товары и цифровой контент
5. БИЗНЕС РЕКОМЕНДАЦИИ — 5 конкретных действий для креативной команды
6. РИСКИ — что может не сработать и как снизить риски

Ответь ТОЛЬКО валидным JSON в формате:
{
  "segments": [{"name": "...", "description": "...", "size": 0, "percentage": 0}],
  "topContent": [{"type": "...", "demand": 0, "description": "..."}],
  "topPlatforms": [{"platform": "...", "reach": 0, "bestFor": "..."}],
  "pricing": {"sweet_spot": "...", "range": "...", "notes": "..."},
  "recommendations": [{"action": "...", "priority": "high/medium/low", "details": "..."}],
  "risks": [{"risk": "...", "mitigation": "..."}],
  "summary": "..."
}`

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Вот данные опроса:\n\n${dataPayload}` },
    ],
    temperature: 0.3,
    response_format: { type: 'json_object' },
  })

  const resultText = completion.choices[0]?.message?.content || '{}'
  let parsed: AnalysisOutput
  try {
    parsed = JSON.parse(resultText) as AnalysisOutput
  } catch {
    parsed = { segments: [], topContent: [], topPlatforms: [], pricing: { sweet_spot: '', range: '', notes: '' }, recommendations: [], risks: [], summary: resultText }
  }

  // Save to DB
  const saved = await prisma.analysisResult.create({
    data: {
      prompt: systemPrompt,
      result: JSON.stringify(parsed),
      model: 'gpt-4o',
      totalResponses: responses.length,
    },
  })

  return { id: saved.id, ...parsed, totalResponses: responses.length }
}
