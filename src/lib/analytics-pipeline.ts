/**
 * Multi-step GPT analytics pipeline.
 * 
 * Architecture (5 steps):
 *   Step 0: Server-side statistics (stats.ts) — NO GPT
 *   Step 1: GPT classifies open-text answers into themes
 *   Step 2: GPT builds buyer personas from cross-tabs
 *   Step 3: GPT builds demand × willingness-to-pay matrix
 *   Step 4: GPT generates final actionable recommendations
 *
 * Each step receives the OUTPUT of previous steps, not raw data.
 * This is why it's better than a single giant prompt.
 */

import OpenAI from 'openai'
import { prisma } from './db'
import { questions } from './questions'
import { computeKeyInsights, type CrossTabResult, type FrequencyRow, type CorrelationResult } from './stats'

// ── Resilient OpenAI client — always proxy, never direct ─────────
// Сервер в России → прямой доступ к api.openai.com ВСЕГДА даёт 403.
// Единственный путь — через Cloudflare Worker прокси.
const API_KEY = process.env.OPENAI_API_KEY
const PROXY_URL = process.env.OPENAI_BASE_URL
const MODEL = process.env.OPENAI_MODEL || 'gpt-5.4'
const MAX_RETRIES = 5
const RETRY_DELAY_MS = 3000

const openai = new OpenAI({
  apiKey: API_KEY,
  baseURL: PROXY_URL || undefined,
  timeout: 300_000,       // 5 минут таймаут на запрос (GPT-5.4 reasoning долгий)
  maxRetries: 0,          // отключаем встроенные retry SDK — управляем сами
})

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

type ReasoningEffort = 'none' | 'low' | 'medium' | 'high'

/** Вызов GPT с retry через прокси (5 попыток, экспоненциальный backoff) */
async function callGPT(opts: {
  systemPrompt: string
  userContent: string
  effort: ReasoningEffort
}) {
  let lastError: unknown

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      console.log(`[GPT] attempt ${attempt + 1}/${MAX_RETRIES} via proxy`)

      const response = await openai.responses.create({
        model: MODEL,
        instructions: opts.systemPrompt,
        input: [{ role: 'user', content: opts.userContent + '\n\nRespond with valid JSON only.' }],
        reasoning: { effort: opts.effort },
        text: { format: { type: 'json_object' } },
      })

      const text = response.output_text || '{}'
      const tokens = response.usage?.total_tokens || 0

      console.log(`[GPT] success on attempt ${attempt + 1}, tokens: ${tokens}`)
      return { content: text, tokens }
    } catch (err) {
      lastError = err
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[GPT] attempt ${attempt + 1} failed:`, msg)

      // Если ошибка "unsupported country" — прокси не помог, но direct тоже не поможет.
      // Ретраим — возможно CF Worker edge сменится на другую локацию.
      if (attempt < MAX_RETRIES - 1) {
        const delay = RETRY_DELAY_MS * Math.pow(2, attempt) // 3s, 6s, 12s, 24s
        console.log(`[GPT] retrying in ${delay}ms...`)
        await sleep(delay)
      }
    }
  }

  throw lastError || new Error('All GPT retries exhausted')
}

// ── Types ────────────────────────────────────────────────────────
export interface TextTheme {
  theme: string
  count: number
  percentage: number
  examples: string[]
  sentiment: 'positive' | 'neutral' | 'negative'
}

export interface BuyerPersona {
  name: string
  description: string
  size_percent: number
  demographics: { age: string; gender: string; occupation: string }
  content_preferences: string[]
  platforms: string[]
  spending: string
  vlk_attitude: string
  key_motivators: string[]
}

export interface DemandCell {
  content_type: string
  demand_score: number
  wtp_score: number
  opportunity: 'high' | 'medium' | 'low'
  platform_fit: string
  notes: string
}

export interface Recommendation {
  action: string
  priority: 'critical' | 'high' | 'medium' | 'low'
  expected_impact: string
  timeline: string
  details: string
  target_persona: string
  confidence: number
}

export interface Risk {
  risk: string
  probability: 'high' | 'medium' | 'low'
  impact: 'high' | 'medium' | 'low'
  mitigation: string
}

export interface PipelineResult {
  // Step 0: Stats
  stats: {
    metadata: { totalResponses: number; completionRate: number; suspiciousRate: number; avgDuration: number }
    frequencyTables: Record<string, FrequencyRow[]>
    significantCrossTabs: Array<{ pair: string; cramersV: number; pValue: number; insight: string }>
    correlations: CorrelationResult[]
  }
  // Step 1: Themes
  openTextThemes: {
    product_themes: TextTheme[]
    city_distribution: Array<{ city: string; count: number }>
  }
  // Step 2: Personas
  personas: BuyerPersona[]
  // Step 3: Demand matrix
  demandMatrix: DemandCell[]
  // Step 4: Recommendations
  recommendations: Recommendation[]
  risks: Risk[]
  executiveSummary: string
  // Meta
  pipelineSteps: Array<{ step: number; name: string; tokens: number; duration_ms: number }>
}

// ── Async job launcher ───────────────────────────────────────────
// Creates a DB record immediately, runs pipeline in background,
// updates DB on progress/completion/failure.

/** Start pipeline asynchronously. Returns jobId immediately. */
export async function startAnalysisPipeline(customPrompt?: string): Promise<string> {
  // Prevent duplicate runs
  const running = await prisma.analysisResult.findFirst({
    where: { status: 'running' },
    select: { id: true, currentStep: true },
  })
  if (running) {
    throw new Error(`Анализ уже запущен (шаг ${running.currentStep}/5). Дождитесь завершения.`)
  }

  const count = await prisma.surveyResponse.count({
    where: { isPartial: false, isSuspicious: false },
  })
  if (count === 0) throw new Error('Нет валидных ответов для анализа')

  const job = await prisma.analysisResult.create({
    data: {
      prompt: customPrompt || 'pipeline-v2',
      model: MODEL,
      totalResponses: count,
      status: 'running',
      currentStep: 0,
    },
  })

  // Fire-and-forget — do NOT await
  runPipelineInBackground(job.id, customPrompt).catch((err) => {
    console.error('[Pipeline] unhandled:', err)
  })

  return job.id
}

/** Get current job status from DB (works across cluster instances). */
export async function getJobStatus(jobId: string) {
  return prisma.analysisResult.findUnique({
    where: { id: jobId },
    select: { id: true, status: true, currentStep: true, error: true, result: true, totalResponses: true },
  })
}

async function updateStep(jobId: string, step: number) {
  await prisma.analysisResult.update({ where: { id: jobId }, data: { currentStep: step } })
}

async function runPipelineInBackground(jobId: string, customPrompt?: string) {
  try {
    const responses = await prisma.surveyResponse.findMany({
      where: { isPartial: false, isSuspicious: false },
    })

    const raw = responses as unknown as Record<string, unknown>[]
    const pipelineSteps: PipelineResult['pipelineSteps'] = []

    // ═══════════════ STEP 0: Server-side Stats ═══════════════
    await updateStep(jobId, 0)
    const t0 = Date.now()
    const insights = computeKeyInsights(raw)

    const significantCrossTabs = insights.crossTabs
      .filter((ct) => ct.significant || ct.cramersV > 0.15)
      .map((ct) => ({
        pair: `${ct.rowField} × ${ct.colField}`,
        cramersV: ct.cramersV,
        pValue: ct.pValue,
        insight: summarizeCrossTab(ct),
      }))

    pipelineSteps.push({ step: 0, name: 'Statistics', tokens: 0, duration_ms: Date.now() - t0 })

    const openProducts = responses
      .map((r) => r.openProduct)
      .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
    const openCities = responses
      .map((r) => r.openCity)
      .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)

    // ═══════════════ STEP 1: Classify Open Text ═══════════════
    await updateStep(jobId, 1)
    const step1 = await runStep1_ClassifyText(openProducts, openCities)
    pipelineSteps.push(step1.meta)

    // ═══════════════ STEP 2: Build Personas ═══════════════
    await updateStep(jobId, 2)
    const step2 = await runStep2_BuildPersonas(
      insights.frequencyTables,
      significantCrossTabs,
      insights.correlations,
      responses.length
    )
    pipelineSteps.push(step2.meta)

    // ═══════════════ STEP 3: Demand Matrix ═══════════════
    await updateStep(jobId, 3)
    const step3 = await runStep3_DemandMatrix(
      insights.frequencyTables,
      significantCrossTabs,
      step2.personas,
      responses.length,
      customPrompt
    )
    pipelineSteps.push(step3.meta)

    // ═══════════════ STEP 4: Recommendations ═══════════════
    await updateStep(jobId, 4)
    const step4 = await runStep4_Recommendations(
      step2.personas,
      step3.demandMatrix,
      step1.themes,
      significantCrossTabs,
      insights.correlations,
      responses.length,
      customPrompt
    )
    pipelineSteps.push(step4.meta)

    // ═══════════════ Assemble & save ═══════════════
    const result: PipelineResult = {
      stats: {
        metadata: insights.metadata,
        frequencyTables: insights.frequencyTables,
        significantCrossTabs,
        correlations: insights.correlations,
      },
      openTextThemes: step1.themes,
      personas: step2.personas,
      demandMatrix: step3.demandMatrix,
      recommendations: step4.recommendations,
      risks: step4.risks,
      executiveSummary: step4.executiveSummary,
      pipelineSteps,
    }

    await prisma.analysisResult.update({
      where: { id: jobId },
      data: {
        result: JSON.stringify(result),
        totalResponses: responses.length,
        status: 'completed',
        currentStep: 5,
      },
    })
    console.log(`[Pipeline] job ${jobId} completed`)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[Pipeline] job ${jobId} failed:`, msg)
    await prisma.analysisResult.update({
      where: { id: jobId },
      data: { status: 'failed', error: msg },
    }).catch(() => {})
  }
}

// ══════════════════════════════════════════════════════════════════
// STEP 1: Classify open-text answers
// ══════════════════════════════════════════════════════════════════
async function runStep1_ClassifyText(
  openProducts: string[],
  openCities: string[]
) {
  const t = Date.now()

  // City clustering (server-side, no GPT needed)
  const cityCount: Record<string, number> = {}
  for (const c of openCities) {
    const norm = c.trim().toLowerCase()
    cityCount[norm] = (cityCount[norm] || 0) + 1
  }
  const cityDist = Object.entries(cityCount)
    .map(([city, count]) => ({ city, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 30)

  if (openProducts.length === 0) {
    return {
      themes: {
        product_themes: [] as TextTheme[],
        city_distribution: cityDist,
      },
      meta: { step: 1, name: 'ClassifyText', tokens: 0, duration_ms: Date.now() - t },
    }
  }

  // Sample up to 200 answers for GPT (save tokens)
  const sampled = openProducts.length > 200
    ? openProducts.sort(() => Math.random() - 0.5).slice(0, 200)
    : openProducts

  // Step 1: effort=none — классификация тем для B2B-питча
  const { content: step1Content, tokens } = await callGPT({
    effort: 'none',
    systemPrompt: `Ты — B2B-аналитик для ПРОДАКШН-СТУДИИ из Владивостока. Студия ПРОДАЁТ ПРОДАКШН-УСЛУГИ КИТАЙСКИМ КОМПАНИЯМ: съёмка коммерческих роликов, документалок, бренд-фильмов, дизайн-пакетов — всё НА ЗАКАЗ.

Контекст: проведён опрос ${sampled.length} китайских студентов во Владивостоке. Открытый вопрос: "Какой продукт/контент из Владивостока вы хотели бы видеть на китайском рынке?". Ответы на китайском.

Задача: выдели 5–10 ключевых тем. Каждую тему интерпретируй КАК ПОТЕНЦИАЛЬНЫЙ ПРОДАКШН-ЗАКАЗ от китайской компании. Например:
- Если студенты пишут про еду → это аргумент для питча китайским фуд-брендам/ресторанам: "мы снимем вам ролик про русскую кухню — вот спрос"
- Если про туризм → аргумент для китайских турагентств: "закажите у нас промо-ролик Владивостока"

Для каждой темы: название, % от ответов, примеры, тональность.

ЗАПРЕЩЕНО: интерпретировать темы как "что нам выложить в свой блог". Интерпретируй ТОЛЬКО как "что китайские компании могут заказать у нас".

ЯЗЫК: ВСЁ на русском. Названия тем — на русском. Примеры ответов — ПЕРЕВЕДИ на русский (оригиналы на китайском не нужны). Не используй английские и китайские слова, иероглифы запрещены.

Ответь ТОЛЬКО JSON:
{
  "themes": [
    {
      "theme": "название темы по-русски",
      "count": число ответов в этой теме,
      "percentage": процент,
      "examples": ["пример 1", "пример 2"],
      "sentiment": "positive|neutral|negative"
    }
  ]
}`,
    userContent: sampled.join('\n---\n'),
  })
  let parsed: { themes: TextTheme[] } = { themes: [] }
  try {
    parsed = JSON.parse(step1Content)
  } catch { /* ignore */ }

  return {
    themes: {
      product_themes: parsed.themes || [],
      city_distribution: cityDist,
    },
    meta: { step: 1, name: 'ClassifyText', tokens, duration_ms: Date.now() - t },
  }
}

// ══════════════════════════════════════════════════════════════════
// STEP 2: Build buyer personas from cross-tabulations
// ══════════════════════════════════════════════════════════════════
async function runStep2_BuildPersonas(
  freqTables: Record<string, FrequencyRow[]>,
  crossTabs: PipelineResult['stats']['significantCrossTabs'],
  correlations: CorrelationResult[],
  totalResponses: number
) {
  const t = Date.now()

  // Build a compact data summary for GPT
  const dataForGPT = {
    total: totalResponses,
    demographics: {
      age: freqTables.age,
      gender: freqTables.gender,
      occupation: freqTables.occupation,
    },
    behavior: {
      paidContentTypes: freqTables.paidContentTypes,
      monthlySpend: freqTables.monthlySpend,
      platforms: freqTables.platforms,
      contentTopics: freqTables.contentTopics,
    },
    vlk_attitude: {
      vlkContentAware: freqTables.vlkContentAware,
      desiredContent: freqTables.desiredContent,
      buyVlkProduct: freqTables.buyVlkProduct,
      priceWillingness: freqTables.priceWillingness,
    },
    significant_crosstabs: crossTabs,
    correlations: correlations.filter((c) => c.strength !== 'weak'),
  }

  // Step 2: effort=high — сегментация аудитории для B2B-питча клиентам
  const { content: step2Content, tokens } = await callGPT({
    effort: 'high',
    systemPrompt: `Ты — B2B-стратег для ПРОДАКШН-СТУДИИ из Владивостока. Бизнес-модель студии: они ПРОДАЮТ ПРОДАКШН-УСЛУГИ КИТАЙСКИМ КОМПАНИЯМ (снимают видео, документалки, бренд-фильмы, делают дизайн — всё НА ЗАКАЗ).

Зачем нужен этот анализ: студия хочет ПОКАЗАТЬ потенциальным КЛИЕНТАМ-ЗАКАЗЧИКАМ (китайским компаниям), что она понимает их целевую аудиторию. Данные опроса — это АРГУМЕНТ при продаже продакшн-услуг.

Тебе даны ПРЕДВЫЧИСЛЕННЫЕ статистики опроса ${totalResponses} китайских студентов во Владивостоке: частотные таблицы, кросс-табуляции (хи-квадрат, Cramér's V), корреляции.

Задача: выдели 3–5 АУДИТОРНЫХ СЕГМЕНТОВ. Но описывай их С ТОЧКИ ЗРЕНИЯ B2B-КЛИЕНТА — чтобы студия могла сказать клиенту:
"Вот сегмент X — они любят Y и тратят Z. Мы снимем для вас ролик, который попадёт именно в них."

Каждый сегмент ОБОСНУЙ данными:
- Конкретные % из таблиц
- На основе какой кросс-табуляции вывод
- Сегменты НЕ должны пересекаться

Для каждого сегмента ответь: какой ТИП КОМПАНИИ-ЗАКАЗЧИКА заинтересован в этой аудитории (турфирмы, фуд-бренды, EdTech, fashion, девелоперы и т.д.).

ЗАПРЕЩЕНО: рекомендовать студии вести блог, набирать подписчиков, монетизировать трафик. Фокус ТОЛЬКО на продажу продакшн-услуг компаниям.

ЯЗЫК: ВЕСЬ ответ на русском. Названия компаний, платформ и терминов — пиши кириллицей (например: «Билибили» вместо Bilibili, «Красная книга» вместо RED/小红书). Не используй английские слова, иероглифы и латиницу.

Ответь ТОЛЬКО JSON:
{
  "personas": [
    {
      "name": "Имя Сегмента",
      "description": "2-3 предложения — кто эти люди и какой контент потребляют",
      "size_percent": число,
      "demographics": { "age": "основной возраст", "gender": "пол", "occupation": "род деятельности" },
      "content_preferences": ["тип контента 1", "тип контента 2"],
      "platforms": ["платформа 1", "платформа 2"],
      "spending": "сколько тратят на контент/продукты в месяц",
      "vlk_attitude": "отношение к контенту/продуктам из Владивостока",
      "key_motivators": ["что привлекает 1", "мотивация 2"]
    }
  ]
}`,
    userContent: JSON.stringify(dataForGPT),
  })

  let parsed: { personas: BuyerPersona[] } = { personas: [] }
  try {
    parsed = JSON.parse(step2Content)
  } catch { /* ignore */ }

  return {
    personas: parsed.personas || [],
    meta: { step: 2, name: 'BuildPersonas', tokens, duration_ms: Date.now() - t },
  }
}

// ══════════════════════════════════════════════════════════════════
// STEP 3: Demand × Willingness-to-Pay matrix
// ══════════════════════════════════════════════════════════════════
async function runStep3_DemandMatrix(
  freqTables: Record<string, FrequencyRow[]>,
  crossTabs: PipelineResult['stats']['significantCrossTabs'],
  personas: BuyerPersona[],
  totalResponses: number,
  customPrompt?: string
) {
  const t = Date.now()

  const dataForGPT = {
    total: totalResponses,
    content_demand: freqTables.paidContentTypes,
    topic_interest: freqTables.contentTopics,
    desired_vlk_content: freqTables.desiredContent,
    monthly_spend: freqTables.monthlySpend,
    price_willingness: freqTables.priceWillingness,
    platforms: freqTables.platforms,
    preferred_platform: freqTables.preferredPlatform,
    appeal_factors: freqTables.appealFactors,
    purchase_channels: freqTables.purchaseChannels,
    purchase_factors: freqTables.purchaseFactors,
    buy_vlk_product: freqTables.buyVlkProduct,
    cross_tab_insights: crossTabs,
    personas: personas.map((p) => ({ name: p.name, size_percent: p.size_percent, content_preferences: p.content_preferences, spending: p.spending })),
  }

  const extraContext = customPrompt
    ? `\n\nДополнительный контекст от аналитика: ${customPrompt}`
    : ''

  // Step 3: effort=medium — B2B матрица услуг для продажи китайским компаниям
  const { content: step3Content, tokens } = await callGPT({
    effort: 'medium',
    systemPrompt: `Ты — B2B-аналитик для ПРОДАКШН-СТУДИИ из Владивостока.

БИЗНЕС-МОДЕЛЬ: студия НЕ ведёт блог и НЕ монетизирует трафик. Студия ПРОДАЁТ ПРОДАКШН-УСЛУГИ КИТАЙСКИМ КОМПАНИЯМ:
— Коммерческие видеоролики для брендов (реклама, промо)
— Документальные фильмы/сериалы на заказ (для стримингов, турфирм, гос. туризма)
— Бренд-фильмы и имиджевые ролики для компаний
— Дизайн-пакеты (визуальная айдентика, оформление, графика)
— Локейшн-сервисы (помощь китайским съёмочным группам во Владивостоке)
— Ко-продакшн (совместное производство с китайскими студиями)
— Контент-пакеты для лицензирования (готовые серии для платформ)

КОНТЕКСТ ИЗ ПРЕДЫДУЩЕГО ШАГА: уже построены аудиторные сегменты (персоны) — это ваша база для аргументации перед клиентами.

Тебе даны: частотные таблицы опроса, персоны, кросс-табуляции.

Задача: построй матрицу "Спрос аудитории × Коммерческая привлекательность для B2B-заказчика". Каждая строка = ТИП ПРОДАКШН-УСЛУГИ, которую студия может продать.

Для каждой услуги:
- demand_score (0-100): насколько аудитория (из опроса) заинтересована в этом контенте
- wtp_score (0-100): насколько КИТАЙСКИЕ КОМПАНИИ готовы ПЛАТИТЬ за такой продакшн (коммерческая ценность заказа)
- platform_fit: где этот контент будет дистрибутироваться (платформа/канал)
- opportunity: high/medium/low

ВАЖНО: wtp_score — это НЕ сколько зрители заплатят за просмотр. Это оценка того, насколько КОМПАНИИ-ЗАКАЗЧИКИ (бренды, турфирмы, стриминги) готовы заплатить студии за производство.

ЗАПРЕЩЕНО: matrix с форматами типа "влог", "лайв-стрим" — это B2C контент. Давай ТОЛЬКО продакшн-услуги, которые ПОКУПАЮТ компании.

ЯЗЫК: ВЕСЬ ответ на русском. Названия платформ, компаний и терминов — пиши кириллицей (например: «Доуинь» вместо Douyin, «ВиЧат» вместо WeChat, «Билибили» вместо Bilibili). Не используй английские слова, иероглифы и латиницу.

Ответь ТОЛЬКО JSON:
{
  "matrix": [
    {
      "content_type": "Тип продакшн-услуги",
      "demand_score": 0-100,
      "wtp_score": 0-100,
      "opportunity": "high|medium|low",
      "platform_fit": "где будет использоваться",
      "notes": "обоснование + какой тип компании закажет + ссылка на данные опроса"
    }
  ]
}${extraContext}`,
    userContent: JSON.stringify(dataForGPT),
  })

  let parsed: { matrix: DemandCell[] } = { matrix: [] }
  try {
    parsed = JSON.parse(step3Content)
  } catch { /* ignore */ }

  return {
    demandMatrix: parsed.matrix || [],
    meta: { step: 3, name: 'DemandMatrix', tokens, duration_ms: Date.now() - t },
  }
}

// ══════════════════════════════════════════════════════════════════
// STEP 4: Final recommendations + executive summary
// ══════════════════════════════════════════════════════════════════
async function runStep4_Recommendations(
  personas: BuyerPersona[],
  demandMatrix: DemandCell[],
  themes: PipelineResult['openTextThemes'],
  crossTabs: PipelineResult['stats']['significantCrossTabs'],
  correlations: CorrelationResult[],
  totalResponses: number,
  customPrompt?: string
) {
  const t = Date.now()

  const dataForGPT = {
    total: totalResponses,
    personas,
    demand_matrix: demandMatrix,
    open_text_themes: themes.product_themes,
    significant_insights: crossTabs,
    correlations: correlations.filter((c) => c.strength !== 'weak'),
  }

  const extraContext = customPrompt
    ? `\n\nДополнительный фокус: ${customPrompt}`
    : ''

  // Step 4: effort=high — B2B стратегия: что продавать китайским компаниям
  const { content: step4Content, tokens } = await callGPT({
    effort: 'high',
    systemPrompt: `Ты — стратегический B2B-консультант по продаже продакшн-услуг на китайский рынок.

КЛИЕНТ: продакшн-студия из Владивостока. Они ПРОДАЮТ УСЛУГИ КИТАЙСКИМ КОМПАНИЯМ: снимают коммерческие ролики, документалки, бренд-фильмы, делают дизайн — всё НА ЗАКАЗ. Они НЕ блогеры, НЕ инфлюенсеры, НЕ продают курсы.

ЧТО ОНИ ХОТЯТ ЗНАТЬ: каким конкретно китайским компаниям идти продавать свои продакшн-услуги, с каким предложением (что снимем), и какими данными из опроса подкрепить питч.

Ты получил результаты анализа опроса ${totalResponses} китайских студентов:
- Аудиторные сегменты (персоны с %, предпочтениями, платформами)
- B2B-матрица продакшн-услуг (спрос аудитории × коммерческая ценность)
- Темы из открытых ответов (что аудитория хочет видеть)
- Статистические кросс-табуляции и корреляции

Задача:
1. 7–10 КОНКРЕТНЫХ B2B-рекомендаций в формате: "Идите к [тип компании], предложите [конкретную услугу], аргумент из данных: [факт из опроса]"

Примеры хороших рекомендаций:
- "Предложите китайским турагентствам снять промо-серию о Владивостоке (3×5 мин) — 67% респондентов интересуются туризмом во Владивостоке"
- "Продайте фуд-брендам серию коротких роликов про русскую кухню — тема еды #1 в открытых ответах (23%)"
- "Предложите стримингу (Bilibili/iQIYI) лицензию на документалку о жизни китайских студентов в РФ"

Примеры ПЛОХИХ рекомендаций (ЗАПРЕЩЕНО):
- "Заведите аккаунт на Douyin и набирайте подписчиков" — это B2C
- "Монетизируйте через донаты/просмотры" — студия не блогер
- "Делайте коллаборации с инфлюенсерами" — студия продаёт услуги, а не трафик

2. Для каждой рекомендации: тип клиента-заказчика, конкретная услуга, аргумент из данных, timeline, confidence
3. 5 рисков ПРОДАЖИ ПРОДАКШН-УСЛУГ В КИТАЙ с митигацией (языковой барьер, оплата, конкуренция с местными студиями, цензура, логистика съёмок)
4. Executive summary на 200–300 слов: КОМУ продавать, ЧТО предлагать, какие данные использовать как аргумент при продаже

ЯЗЫК: ВЕСЬ ответ СТРОГО на русском. Все названия компаний, платформ, форматов пиши КИРИЛЛИЦЕЙ: «Доуинь» вместо Douyin, «Красная книга» вместо RED/小红书, «ВиЧат» вместо WeChat, «Билибили» вместо Bilibili, «ай-Цюй-И» вместо iQIYI, «Тмолл» вместо Tmall. Запрещены: английские слова, латиница, иероглифы. Если нужно упомянуть китайскую компанию — транслитерируй кириллицей.

Ответь ТОЛЬКО JSON:
{
  "recommendations": [
    {
      "action": "кому идти + что предложить (конкретная B2B-услуга)",
      "priority": "critical|high|medium|low",
      "expected_impact": "ожидаемый результат для студии",
      "timeline": "срок",
      "details": "детали: тип клиента, формат продакшна, аргумент из данных опроса",
      "target_persona": "аудиторный сегмент, который получит этот контент",
      "confidence": 0-100
    }
  ],
  "risks": [
    {
      "risk": "описание риска",
      "probability": "high|medium|low",
      "impact": "high|medium|low",
      "mitigation": "как снизить"
    }
  ],
  "executive_summary": "итог: кому продавать, что предлагать, как аргументировать данными"
}${extraContext}`,
    userContent: JSON.stringify(dataForGPT),
  })

  let parsed: { recommendations: Recommendation[]; risks: Risk[]; executive_summary: string } = {
    recommendations: [],
    risks: [],
    executive_summary: '',
  }
  try {
    parsed = JSON.parse(step4Content)
  } catch { /* ignore */ }

  return {
    recommendations: parsed.recommendations || [],
    risks: parsed.risks || [],
    executiveSummary: parsed.executive_summary || '',
    meta: { step: 4, name: 'Recommendations', tokens, duration_ms: Date.now() - t },
  }
}

// ── Helper: summarize a cross-tab for GPT ────────────────────────
function summarizeCrossTab(ct: CrossTabResult): string {
  const qRow = questions.find((q) => q.fieldName === ct.rowField)
  const qCol = questions.find((q) => q.fieldName === ct.colField)

  // Find the most over-represented cell
  let maxDiff = 0
  let topCell = ''
  for (const cell of ct.cells) {
    const expected = ct.total > 0
      ? ((ct.rowTotals[cell.rowValue] || 0) * (ct.colTotals[cell.colValue] || 0)) / ct.total
      : 0
    const diff = expected > 0 ? (cell.count - expected) / expected : 0
    if (diff > maxDiff) {
      maxDiff = diff
      const rowLabel = qRow?.options?.find((o) => o.id === cell.rowValue)?.ru || cell.rowValue
      const colLabel = qCol?.options?.find((o) => o.id === cell.colValue)?.ru || cell.colValue
      topCell = `${rowLabel} → ${colLabel} (+${Math.round(diff * 100)}% выше ожидаемого)`
    }
  }

  return `${qRow?.ru || ct.rowField} × ${qCol?.ru || ct.colField}: Cramér's V=${ct.cramersV}, p=${ct.pValue}. Главный паттерн: ${topCell}`
}
