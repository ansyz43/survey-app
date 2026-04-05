'use client'

import { useState, useEffect } from 'react'

// ── Types matching PipelineResult ──────────────────────────────
interface FrequencyRow { value: string; label_ru: string; count: number; percent: number }
interface CorrelationResult { field1: string; field2: string; correlation: number; strength: string }
interface TextTheme { theme: string; count: number; percentage: number; examples: string[]; sentiment: string }
interface BuyerPersona {
  name: string; description: string; size_percent: number
  demographics: { age: string; gender: string; occupation: string }
  content_preferences: string[]; platforms: string[]; spending: string
  vlk_attitude: string; key_motivators: string[]
}
interface DemandCell {
  content_type: string; demand_score: number; wtp_score: number
  opportunity: string; platform_fit: string; notes: string
}
interface Recommendation {
  action: string; priority: string; expected_impact: string
  timeline: string; details: string; target_persona: string; confidence: number
}
interface Risk { risk: string; probability: string; impact: string; mitigation: string }
interface PipelineStep { step: number; name: string; tokens: number; duration_ms: number }

interface AnalysisData {
  id: string
  stats: {
    metadata: { totalResponses: number; completionRate: number; suspiciousRate: number; avgDuration: number }
    frequencyTables: Record<string, FrequencyRow[]>
    significantCrossTabs: Array<{ pair: string; cramersV: number; pValue: number; insight: string }>
    correlations: CorrelationResult[]
  }
  openTextThemes: { product_themes: TextTheme[]; city_distribution: Array<{ city: string; count: number }> }
  personas: BuyerPersona[]
  demandMatrix: DemandCell[]
  recommendations: Recommendation[]
  risks: Risk[]
  executiveSummary: string
  pipelineSteps: PipelineStep[]
}

interface HistoryItem {
  id: string; model: string; totalResponses: number; createdAt: string
  result: AnalysisData
}

// ── Step names for progress ──────────────────────────────
const STEP_LABELS = [
  'Вычисляю статистику...',
  'Классифицирую открытые ответы...',
  'Строю портреты аудитории...',
  'Анализирую спрос и готовность платить...',
  'Генерирую рекомендации...',
]

/** Маппинг системных названий полей → русский текст */
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

function fieldRu(name: string): string {
  return FIELD_RU[name] || name
}

function pairRu(pair: string): string {
  return pair.split(' × ').map(f => fieldRu(f)).join(' × ')
}

const STEP_NAME_RU: Record<string, string> = {
  Statistics: 'Статистика',
  ClassifyText: 'Классификация текста',
  BuildPersonas: 'Построение персон',
  DemandMatrix: 'Матрица спроса',
  Recommendations: 'Рекомендации',
}
function stepNameRu(name: string): string { return STEP_NAME_RU[name] || name }

function sentimentRu(s: string): string {
  return s === 'positive' ? 'позитивный' : s === 'negative' ? 'негативный' : s === 'neutral' ? 'нейтральный' : s
}

function levelRu(l: string): string {
  return l === 'high' ? 'высокая' : l === 'medium' ? 'средняя' : l === 'low' ? 'низкая' : l
}

export default function AnalyticsPage() {
  const [analysis, setAnalysis] = useState<AnalysisData | null>(null)
  const [history, setHistory] = useState<HistoryItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [customPrompt, setCustomPrompt] = useState('')
  const [showPrompt, setShowPrompt] = useState(false)
  const [activeTab, setActiveTab] = useState<'summary' | 'personas' | 'matrix' | 'themes' | 'stats'>('summary')

  const [currentStep, setCurrentStep] = useState(0)

  useEffect(() => {
    fetch('/api/admin/analytics/history')
      .then((res) => { if (res.status === 401) { window.location.href = '/admin'; return null } return res.json() })
      .then((d) => d && setHistory(d))
  }, [])

  const runAnalysis = async () => {
    setLoading(true); setError(''); setCurrentStep(0)
    try {
      const res = await fetch('/api/admin/analytics/run', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: customPrompt || undefined }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Ошибка анализа'); setLoading(false); return }

      // Poll for completion
      const jobId = data.jobId
      const poll = async () => {
        for (;;) {
          await new Promise((r) => setTimeout(r, 3000))
          try {
            const sr = await fetch(`/api/admin/analytics/status/${jobId}`)
            if (sr.status === 401) { window.location.href = '/admin'; return }
            const st = await sr.json()
            setCurrentStep(st.currentStep || 0)

            if (st.status === 'completed') {
              setAnalysis(st.result); setActiveTab('summary')
              const histRes = await fetch('/api/admin/analytics/history')
              const histData = await histRes.json()
              setHistory(histData)
              return
            }
            if (st.status === 'failed') {
              setError(st.error || 'Ошибка анализа')
              return
            }
          } catch {
            // Network hiccup — keep polling
          }
        }
      }
      await poll()
    } catch { setError('Ошибка соединения') }
    finally { setLoading(false) }
  }

  const loadFromHistory = (item: HistoryItem) => {
    setAnalysis({ ...item.result, id: item.id })
    setActiveTab('summary')
  }

  const totalTokens = analysis?.pipelineSteps?.reduce((s, p) => s + p.tokens, 0) || 0
  const totalTime = analysis?.pipelineSteps?.reduce((s, p) => s + p.duration_ms, 0) || 0

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-bold">AI Аналитика v2</h1>
          <p className="text-sm text-gray-500">5-шаговый пайплайн: статистика → темы → персоны → матрица → рекомендации</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowPrompt(!showPrompt)} className="px-4 py-2 border rounded-lg text-sm hover:bg-gray-50">
            {showPrompt ? 'Скрыть' : 'Свой фокус'}
          </button>
          <button onClick={runAnalysis} disabled={loading}
            className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 font-medium">
            {loading ? '⏳ Анализирую...' : '🚀 Запустить анализ'}
          </button>
        </div>
      </div>

      {showPrompt && (
        <textarea value={customPrompt} onChange={(e) => setCustomPrompt(e.target.value)}
          placeholder="Добавьте фокус анализа, например: 'Сфокусируйся на музыкальном контенте' или 'Сравни студентов и работающих'"
          className="w-full p-4 border rounded-xl min-h-[100px] text-sm" />
      )}

      {error && <div className="p-4 bg-red-50 text-red-700 rounded-xl">{error}</div>}

      {/* Loading with steps */}
      {loading && (
        <div className="p-8 bg-white border rounded-xl">
          <div className="space-y-3">
            {STEP_LABELS.map((label, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                  i < currentStep ? 'bg-green-100 text-green-600' :
                  i === currentStep ? 'bg-purple-100 text-purple-600 animate-pulse' :
                  'bg-gray-100 text-gray-400'
                }`}>
                  {i < currentStep ? '✓' : i}
                </div>
                <span className={`text-sm ${
                  i < currentStep ? 'text-green-600' :
                  i === currentStep ? 'text-purple-700 font-medium' :
                  'text-gray-400'
                }`}>{label}</span>
              </div>
            ))}
          </div>
          <div className="mt-6 flex items-center gap-3">
            <div className="animate-spin w-5 h-5 border-2 border-purple-300 border-t-purple-600 rounded-full" />
            <span className="text-sm text-gray-500">Это может занять 30–90 секунд...</span>
          </div>
        </div>
      )}

      {/* Results */}
      {analysis && !loading && (
        <>
          {/* Pipeline meta + export buttons */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex gap-4 text-sm text-gray-500 flex-wrap">
              <span>{analysis.stats?.metadata?.totalResponses || 0} ответов</span>
              <span>{totalTokens.toLocaleString()} токенов</span>
              <span>{(totalTime / 1000).toFixed(1)}с</span>
              <span>{analysis.pipelineSteps?.length || 0} шагов</span>
            </div>
            <div className="flex gap-2">
              <a
                href={`/api/admin/analytics/export?id=${analysis.id}`}
                className="px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 text-xs font-medium"
              >
                📥 Excel
              </a>
              <a
                href={`/api/admin/analytics/pdf?id=${analysis.id}`}
                className="px-3 py-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700 text-xs font-medium"
              >
                📄 PDF
              </a>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 bg-gray-100 p-1 rounded-xl overflow-x-auto">
            {([
              ['summary', '📋 Итоги'],
              ['personas', '👥 Персоны'],
              ['matrix', '📊 Матрица'],
              ['themes', '💬 Темы'],
              ['stats', '📈 Статистика'],
            ] as const).map(([key, label]) => (
              <button key={key} onClick={() => setActiveTab(key)}
                className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${activeTab === key ? 'bg-white shadow text-purple-700' : 'text-gray-600 hover:text-gray-900'}`}>
                {label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          {activeTab === 'summary' && <SummaryTab data={analysis} />}
          {activeTab === 'personas' && <PersonasTab personas={analysis.personas} />}
          {activeTab === 'matrix' && <MatrixTab matrix={analysis.demandMatrix} />}
          {activeTab === 'themes' && <ThemesTab themes={analysis.openTextThemes} />}
          {activeTab === 'stats' && <StatsTab stats={analysis.stats} />}
        </>
      )}

      {/* History */}
      {history.length > 0 && (
        <div>
          <h2 className="font-bold text-lg mb-3">📜 История</h2>
          <div className="space-y-2">
            {history.map((item) => (
              <button key={item.id} onClick={() => loadFromHistory(item)}
                className="w-full text-left bg-white border rounded-xl p-4 hover:bg-gray-50 transition-colors">
                <div className="flex justify-between">
                  <span className="font-medium">Анализ от {new Date(item.createdAt).toLocaleString('ru-RU')}</span>
                  <span className="text-sm text-gray-500">{item.totalResponses} ответов · {item.model}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════
// TAB: Summary (executive summary + recommendations + risks)
// ══════════════════════════════════════════════════════════════════
function SummaryTab({ data }: { data: AnalysisData }) {
  return (
    <div className="space-y-6">
      {/* Executive summary */}
      {data.executiveSummary && (
        <div className="bg-purple-50 border border-purple-200 rounded-xl p-6">
          <h2 className="font-bold text-purple-900 mb-3">📋 Общий анализ</h2>
          <p className="text-gray-700 whitespace-pre-wrap leading-relaxed">{data.executiveSummary}</p>
        </div>
      )}

      {/* Recommendations */}
      {data.recommendations?.length > 0 && (
        <div>
          <h2 className="font-bold text-lg mb-3">✅ Рекомендации ({data.recommendations.length})</h2>
          <div className="space-y-3">
            {data.recommendations.map((rec, i) => (
              <div key={i} className="bg-white border rounded-xl p-4">
                <div className="flex items-start gap-3 mb-2">
                  <PriorityBadge priority={rec.priority} />
                  <div className="flex-1">
                    <h3 className="font-semibold">{rec.action}</h3>
                    <p className="text-sm text-gray-600 mt-1">{rec.details}</p>
                  </div>
                  <ConfidenceBadge value={rec.confidence} />
                </div>
                <div className="flex gap-4 mt-3 text-xs text-gray-500 flex-wrap">
                  <span>👤 {rec.target_persona}</span>
                  <span>📈 {rec.expected_impact}</span>
                  <span>⏱ {rec.timeline}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Risks */}
      {data.risks?.length > 0 && (
        <div>
          <h2 className="font-bold text-lg mb-3">⚠️ Риски ({data.risks.length})</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {data.risks.map((risk, i) => (
              <div key={i} className="bg-white border border-orange-200 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className={`w-2 h-2 rounded-full ${risk.probability === 'high' ? 'bg-red-500' : risk.probability === 'medium' ? 'bg-yellow-500' : 'bg-green-500'}`} />
                  <h3 className="font-semibold text-sm">{risk.risk}</h3>
                </div>
                <p className="text-xs text-gray-500 mb-1">
                  Вероятность: {levelRu(risk.probability)} · Влияние: {levelRu(risk.impact)}
                </p>
                <p className="text-sm text-gray-600">Митигация: {risk.mitigation}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pipeline steps */}
      {data.pipelineSteps?.length > 0 && (
        <div className="bg-gray-50 rounded-xl p-4">
          <h3 className="text-sm font-bold text-gray-500 mb-2">Шаги пайплайна</h3>
          <div className="flex gap-2 flex-wrap">
            {data.pipelineSteps.map((s) => (
              <span key={s.step} className="text-xs bg-white border rounded-lg px-3 py-1">
                Шаг {s.step}: {stepNameRu(s.name)} · {s.tokens} ток · {(s.duration_ms / 1000).toFixed(1)}с
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════
// TAB: Personas
// ══════════════════════════════════════════════════════════════════
function PersonasTab({ personas }: { personas: BuyerPersona[] }) {
  if (!personas?.length) return <p className="text-gray-500">Нет данных о персонах</p>
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {personas.map((p, i) => (
        <div key={i} className="bg-white border rounded-xl p-5 space-y-3">
          <div className="flex justify-between items-start">
            <h3 className="font-bold text-lg">{p.name}</h3>
            <span className="bg-blue-100 text-blue-700 text-sm px-2 py-1 rounded font-medium">{p.size_percent}%</span>
          </div>
          <p className="text-sm text-gray-600">{p.description}</p>

          <div className="grid grid-cols-3 gap-2 text-xs">
            <div className="bg-gray-50 rounded p-2">
              <span className="text-gray-400 block">Возраст</span>
              <span className="font-medium">{p.demographics.age}</span>
            </div>
            <div className="bg-gray-50 rounded p-2">
              <span className="text-gray-400 block">Пол</span>
              <span className="font-medium">{p.demographics.gender}</span>
            </div>
            <div className="bg-gray-50 rounded p-2">
              <span className="text-gray-400 block">Деятельность</span>
              <span className="font-medium">{p.demographics.occupation}</span>
            </div>
          </div>

          <div>
            <span className="text-xs text-gray-400">Предпочтения контента</span>
            <div className="flex flex-wrap gap-1 mt-1">
              {p.content_preferences.map((c, j) => (
                <span key={j} className="bg-purple-50 text-purple-700 text-xs px-2 py-0.5 rounded">{c}</span>
              ))}
            </div>
          </div>

          <div>
            <span className="text-xs text-gray-400">Платформы</span>
            <div className="flex flex-wrap gap-1 mt-1">
              {p.platforms.map((pl, j) => (
                <span key={j} className="bg-green-50 text-green-700 text-xs px-2 py-0.5 rounded">{pl}</span>
              ))}
            </div>
          </div>

          <div className="flex gap-4 text-xs text-gray-500">
            <span>💰 {p.spending}</span>
            <span>🏙 {p.vlk_attitude}</span>
          </div>

          <div>
            <span className="text-xs text-gray-400">Мотиваторы</span>
            <ul className="mt-1 space-y-1">
              {p.key_motivators.map((m, j) => (
                <li key={j} className="text-xs text-gray-600">• {m}</li>
              ))}
            </ul>
          </div>
        </div>
      ))}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════
// TAB: Demand Matrix
// ══════════════════════════════════════════════════════════════════
function MatrixTab({ matrix }: { matrix: DemandCell[] }) {
  if (!matrix?.length) return <p className="text-gray-500">Нет данных матрицы</p>

  const sorted = [...matrix].sort((a, b) => {
    const opOrder: Record<string, number> = { high: 3, medium: 2, low: 1 }
    return (opOrder[b.opportunity] || 0) - (opOrder[a.opportunity] || 0)
  })

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">Матрица «Спрос × Готовность платить» — чем выше оба показателя, тем выше возможность.</p>

      {/* Visual matrix */}
      <div className="bg-white border rounded-xl p-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b">
              <th className="text-left py-2 px-3">Тип контента</th>
              <th className="text-center py-2 px-3">Спрос</th>
              <th className="text-center py-2 px-3">Готовность платить</th>
              <th className="text-center py-2 px-3">Возможность</th>
              <th className="text-center py-2 px-3">Платформа</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((cell, i) => (
              <tr key={i} className="border-b last:border-0 hover:bg-gray-50">
                <td className="py-3 px-3 font-medium">{cell.content_type}</td>
                <td className="py-3 px-3">
                  <ScoreBar value={cell.demand_score} color="blue" />
                </td>
                <td className="py-3 px-3">
                  <ScoreBar value={cell.wtp_score} color="green" />
                </td>
                <td className="py-3 px-3 text-center">
                  <OpportunityBadge level={cell.opportunity} />
                </td>
                <td className="py-3 px-3 text-center text-xs">{cell.platform_fit}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Notes */}
      <div className="space-y-2">
        {sorted.filter((c) => c.notes).map((cell, i) => (
          <div key={i} className="bg-gray-50 rounded-lg p-3 text-sm">
            <span className="font-medium">{cell.content_type}:</span>{' '}
            <span className="text-gray-600">{cell.notes}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════
// TAB: Open Text Themes
// ══════════════════════════════════════════════════════════════════
function ThemesTab({ themes }: { themes: AnalysisData['openTextThemes'] }) {
  return (
    <div className="space-y-6">
      {/* Product themes */}
      {themes?.product_themes?.length > 0 && (
        <div>
          <h2 className="font-bold text-lg mb-3">💬 Темы из открытых ответов (E1)</h2>
          <p className="text-sm text-gray-500 mb-3">&quot;Какой продукт/контент из Владивостока хотели бы видеть?&quot;</p>
          <div className="space-y-3">
            {themes.product_themes.map((t, i) => (
              <div key={i} className="bg-white border rounded-xl p-4">
                <div className="flex justify-between items-start mb-2">
                  <h3 className="font-semibold">{t.theme}</h3>
                  <div className="flex gap-2">
                    <span className={`text-xs px-2 py-0.5 rounded ${t.sentiment === 'positive' ? 'bg-green-100 text-green-700' : t.sentiment === 'negative' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'}`}>
                      {t.sentiment === 'positive' ? '😊' : t.sentiment === 'negative' ? '😟' : '😐'} {sentimentRu(t.sentiment)}
                    </span>
                    <span className="bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded">{t.percentage}%</span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1 mt-2">
                  {t.examples.map((ex, j) => (
                    <span key={j} className="bg-gray-50 text-gray-600 text-xs px-2 py-1 rounded italic">&quot;{ex}&quot;</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* City distribution */}
      {themes?.city_distribution?.length > 0 && (
        <div>
          <h2 className="font-bold text-lg mb-3">🌍 География респондентов</h2>
          <div className="bg-white border rounded-xl p-4">
            <div className="flex flex-wrap gap-2">
              {themes.city_distribution.slice(0, 20).map((c, i) => (
                <span key={i} className="bg-gray-50 border rounded-lg px-3 py-1 text-sm">
                  {c.city} <span className="text-gray-400">({c.count})</span>
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════
// TAB: Statistics (server-computed)
// ══════════════════════════════════════════════════════════════════
function StatsTab({ stats }: { stats: AnalysisData['stats'] }) {
  return (
    <div className="space-y-6">
      {/* Metadata cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Ответов" value={stats.metadata.totalResponses} />
        <StatCard label="Завершённость" value={`${stats.metadata.completionRate}%`} />
        <StatCard label="Подозрительных" value={`${stats.metadata.suspiciousRate}%`} />
        <StatCard label="Среднее время" value={`${stats.metadata.avgDuration}с`} />
      </div>

      {/* Significant cross-tabs */}
      {stats.significantCrossTabs?.length > 0 && (
        <div>
          <h2 className="font-bold text-lg mb-3">🔗 Значимые связи (p &lt; 0.05)</h2>
          <div className="space-y-2">
            {stats.significantCrossTabs.map((ct, i) => (
              <div key={i} className="bg-white border rounded-xl p-4">
                <div className="flex justify-between items-start mb-1">
                  <h3 className="font-medium text-sm">{pairRu(ct.pair)}</h3>
                  <div className="flex gap-2 text-xs">
                    <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded">V={ct.cramersV}</span>
                    <span className="bg-green-50 text-green-700 px-2 py-0.5 rounded">p={ct.pValue}</span>
                  </div>
                </div>
                <p className="text-xs text-gray-500">{ct.insight}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Correlations */}
      {stats.correlations?.length > 0 && (
        <div>
          <h2 className="font-bold text-lg mb-3">📐 Корреляции</h2>
          <div className="bg-white border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead><tr className="border-b bg-gray-50">
                <th className="text-left py-2 px-3">Поле 1</th>
                <th className="text-left py-2 px-3">Поле 2</th>
                <th className="text-center py-2 px-3">Корреляция</th>
                <th className="text-center py-2 px-3">Сила</th>
              </tr></thead>
              <tbody>
                {stats.correlations.map((c, i) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="py-2 px-3">{fieldRu(c.field1)}</td>
                    <td className="py-2 px-3">{fieldRu(c.field2)}</td>
                    <td className="py-2 px-3 text-center font-mono">{c.correlation}</td>
                    <td className="py-2 px-3 text-center">
                      <span className={`text-xs px-2 py-0.5 rounded ${c.strength === 'strong' ? 'bg-red-100 text-red-700' : c.strength === 'moderate' ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-500'}`}>
                        {c.strength === 'strong' ? 'Сильная' : c.strength === 'moderate' ? 'Средняя' : 'Слабая'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════
// UI Components
// ══════════════════════════════════════════════════════════════════
function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-white border rounded-xl p-4 text-center">
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs text-gray-500 mt-1">{label}</div>
    </div>
  )
}

function PriorityBadge({ priority }: { priority: string }) {
  const cfg: Record<string, { bg: string; label: string }> = {
    critical: { bg: 'bg-red-600 text-white', label: 'КРИТИЧНО' },
    high: { bg: 'bg-red-100 text-red-700', label: 'ВЫСОКИЙ' },
    medium: { bg: 'bg-yellow-100 text-yellow-700', label: 'СРЕДНИЙ' },
    low: { bg: 'bg-gray-100 text-gray-600', label: 'НИЗКИЙ' },
  }
  const c = cfg[priority] || cfg.medium
  return <span className={`px-2 py-1 rounded text-xs font-bold shrink-0 ${c.bg}`}>{c.label}</span>
}

function ConfidenceBadge({ value }: { value: number }) {
  const color = value >= 80 ? 'text-green-600' : value >= 60 ? 'text-yellow-600' : 'text-red-600'
  return (
    <div className="text-center shrink-0">
      <div className={`text-lg font-bold ${color}`}>{value}%</div>
      <div className="text-[10px] text-gray-400">уверенность</div>
    </div>
  )
}

function ScoreBar({ value, color }: { value: number; color: 'blue' | 'green' }) {
  const bg = color === 'blue' ? 'bg-blue-500' : 'bg-green-500'
  const bgLight = color === 'blue' ? 'bg-blue-100' : 'bg-green-100'
  return (
    <div className="flex items-center gap-2">
      <div className={`h-2 rounded-full ${bgLight} w-20`}>
        <div className={`h-2 rounded-full ${bg}`} style={{ width: `${Math.min(value, 100)}%` }} />
      </div>
      <span className="text-xs font-mono w-8">{value}</span>
    </div>
  )
}

function OpportunityBadge({ level }: { level: string }) {
  const cfg: Record<string, string> = {
    high: 'bg-green-100 text-green-700 border-green-200',
    medium: 'bg-yellow-100 text-yellow-700 border-yellow-200',
    low: 'bg-gray-100 text-gray-500 border-gray-200',
  }
  return (
    <span className={`text-xs font-bold px-2 py-1 rounded border ${cfg[level] || cfg.medium}`}>
      {level === 'high' ? '🟢 ВЫСОКИЙ' : level === 'medium' ? '🟡 СРЕДНИЙ' : '⚪ НИЗКИЙ'}
    </span>
  )
}
