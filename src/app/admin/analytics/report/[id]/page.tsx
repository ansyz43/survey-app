import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { redirect } from 'next/navigation'
import PrintButton from './PrintButton'

interface Props { params: Promise<{ id: string }> }

export default async function ReportPage({ params }: Props) {
  const session = await getSession()
  if (!session) redirect('/admin')

  const { id } = await params
  const analysis = await prisma.analysisResult.findUnique({ where: { id } })
  if (!analysis) return <div className="p-8 text-red-600">Анализ не найден</div>

  const data = JSON.parse(analysis.result)
  const date = new Date(analysis.createdAt)
  const dateStr = date.toLocaleDateString('ru-RU', { day: '2-digit', month: 'long', year: 'numeric' })

  const FIELD_RU: Record<string, string> = {
    age: 'Возраст', gender: 'Пол', occupation: 'Род деятельности',
    paidContentTypes: 'Тип платного контента', monthlySpend: 'Расходы на контент/мес',
    platforms: 'Платформы', contentTopics: 'Интересные темы', appealFactors: 'Факторы привлекательности',
    vlkContentAware: 'Знакомство с VLK-контентом', desiredContent: 'Желаемый контент из VLK',
    preferredPlatform: 'Предпочтительная платформа', buyVlkProduct: 'Готовность купить товар VLK',
    purchaseChannels: 'Каналы покупок', priceWillingness: 'Готовность платить',
    purchaseFactors: 'Факторы покупки', openProduct: 'Открытый вопрос (продукт)', openCity: 'Город',
  }
  const fieldRu = (n: string) => FIELD_RU[n] || n
  const pairRu = (p: string) => p.split(' × ').map(fieldRu).join(' × ')
  const levelRu = (l: string) => l === 'high' ? 'Высокий' : l === 'medium' ? 'Средний' : l === 'low' ? 'Низкий' : l === 'critical' ? 'Критичный' : l
  const strengthRu = (s: string) => s === 'strong' ? 'Сильная' : s === 'moderate' ? 'Средняя' : 'Слабая'
  const sentimentRu = (s: string) => s === 'positive' ? 'Позитивный' : s === 'negative' ? 'Негативный' : 'Нейтральный'

  return (
    <div className="max-w-4xl mx-auto p-8 print:p-4 text-sm leading-relaxed">
      {/* Print styles */}
      <style>{`
        @media print {
          nav, .no-print { display: none !important; }
          body { font-size: 11pt; }
          .page-break { page-break-before: always; }
          table { font-size: 9pt; }
        }
      `}</style>

      {/* Header */}
      <div className="text-center border-b-2 border-gray-800 pb-4 mb-6">
        <h1 className="text-2xl font-bold">Аналитический отчёт</h1>
        <p className="text-gray-500 mt-1">vladprod.site · {dateStr} · {analysis.totalResponses} ответов · Модель: {analysis.model}</p>
      </div>

      <PrintButton />

      {/* Executive Summary */}
      {data.executiveSummary && (
        <section className="mb-8">
          <h2 className="text-lg font-bold border-b pb-1 mb-3">📋 Общий анализ</h2>
          <p className="whitespace-pre-wrap text-gray-700">{data.executiveSummary}</p>
        </section>
      )}

      {/* Recommendations */}
      {data.recommendations?.length > 0 && (
        <section className="mb-8 page-break">
          <h2 className="text-lg font-bold border-b pb-1 mb-3">✅ Рекомендации ({data.recommendations.length})</h2>
          <table className="w-full border-collapse border text-xs">
            <thead>
              <tr className="bg-gray-100">
                <th className="border p-2 text-left">Действие</th>
                <th className="border p-2 text-center w-20">Приоритет</th>
                <th className="border p-2 text-left">Персона</th>
                <th className="border p-2 text-left">Эффект</th>
                <th className="border p-2 text-center w-16">Срок</th>
                <th className="border p-2 text-center w-12">%</th>
              </tr>
            </thead>
            <tbody>
              {data.recommendations.map((r: Record<string, unknown>, i: number) => (
                <tr key={i} className="border-b">
                  <td className="border p-2">
                    <div className="font-medium">{r.action as string}</div>
                    <div className="text-gray-500 mt-1">{r.details as string}</div>
                  </td>
                  <td className="border p-2 text-center">{levelRu(r.priority as string)}</td>
                  <td className="border p-2">{r.target_persona as string}</td>
                  <td className="border p-2">{r.expected_impact as string}</td>
                  <td className="border p-2 text-center">{r.timeline as string}</td>
                  <td className="border p-2 text-center font-bold">{r.confidence as number}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {/* Risks */}
      {data.risks?.length > 0 && (
        <section className="mb-8">
          <h2 className="text-lg font-bold border-b pb-1 mb-3">⚠️ Риски ({data.risks.length})</h2>
          <table className="w-full border-collapse border text-xs">
            <thead>
              <tr className="bg-gray-100">
                <th className="border p-2 text-left">Риск</th>
                <th className="border p-2 text-center w-24">Вероятность</th>
                <th className="border p-2 text-center w-24">Влияние</th>
                <th className="border p-2 text-left">Митигация</th>
              </tr>
            </thead>
            <tbody>
              {data.risks.map((r: Record<string, unknown>, i: number) => (
                <tr key={i} className="border-b">
                  <td className="border p-2 font-medium">{r.risk as string}</td>
                  <td className="border p-2 text-center">{levelRu(r.probability as string)}</td>
                  <td className="border p-2 text-center">{levelRu(r.impact as string)}</td>
                  <td className="border p-2">{r.mitigation as string}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {/* Personas */}
      {data.personas?.length > 0 && (
        <section className="mb-8 page-break">
          <h2 className="text-lg font-bold border-b pb-1 mb-3">👥 Персоны ({data.personas.length})</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 print:grid-cols-2">
            {data.personas.map((p: Record<string, unknown>, i: number) => {
              const dem = p.demographics as Record<string, string> | undefined
              return (
                <div key={i} className="border rounded-lg p-3">
                  <div className="flex justify-between items-center mb-2">
                    <h3 className="font-bold">{p.name as string}</h3>
                    <span className="bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded">{p.size_percent as number}%</span>
                  </div>
                  <p className="text-xs text-gray-600 mb-2">{p.description as string}</p>
                  <div className="text-xs space-y-1">
                    <div><span className="text-gray-400">Демография:</span> {dem?.age}, {dem?.gender}, {dem?.occupation}</div>
                    <div><span className="text-gray-400">Контент:</span> {(p.content_preferences as string[])?.join(', ')}</div>
                    <div><span className="text-gray-400">Платформы:</span> {(p.platforms as string[])?.join(', ')}</div>
                    <div><span className="text-gray-400">Расходы:</span> {p.spending as string}</div>
                    <div><span className="text-gray-400">VLK:</span> {p.vlk_attitude as string}</div>
                    <div><span className="text-gray-400">Мотиваторы:</span> {(p.key_motivators as string[])?.join(', ')}</div>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* Demand Matrix */}
      {data.demandMatrix?.length > 0 && (
        <section className="mb-8 page-break">
          <h2 className="text-lg font-bold border-b pb-1 mb-3">📊 Матрица спроса</h2>
          <table className="w-full border-collapse border text-xs">
            <thead>
              <tr className="bg-gray-100">
                <th className="border p-2 text-left">Тип контента</th>
                <th className="border p-2 text-center w-16">Спрос</th>
                <th className="border p-2 text-center w-16">ГП</th>
                <th className="border p-2 text-center w-20">Возможность</th>
                <th className="border p-2 text-center">Платформа</th>
                <th className="border p-2 text-left">Заметки</th>
              </tr>
            </thead>
            <tbody>
              {[...data.demandMatrix]
                .sort((a: Record<string, unknown>, b: Record<string, unknown>) => {
                  const o: Record<string, number> = { high: 3, medium: 2, low: 1 }
                  return (o[b.opportunity as string] || 0) - (o[a.opportunity as string] || 0)
                })
                .map((d: Record<string, unknown>, i: number) => (
                  <tr key={i} className="border-b">
                    <td className="border p-2 font-medium">{d.content_type as string}</td>
                    <td className="border p-2 text-center">{d.demand_score as number}</td>
                    <td className="border p-2 text-center">{d.wtp_score as number}</td>
                    <td className="border p-2 text-center">{levelRu(d.opportunity as string)}</td>
                    <td className="border p-2 text-center">{d.platform_fit as string}</td>
                    <td className="border p-2 text-gray-600">{d.notes as string}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </section>
      )}

      {/* Themes */}
      {data.openTextThemes?.product_themes?.length > 0 && (
        <section className="mb-8">
          <h2 className="text-lg font-bold border-b pb-1 mb-3">💬 Темы из открытых ответов</h2>
          <table className="w-full border-collapse border text-xs">
            <thead>
              <tr className="bg-gray-100">
                <th className="border p-2 text-left">Тема</th>
                <th className="border p-2 text-center w-12">Кол-во</th>
                <th className="border p-2 text-center w-12">%</th>
                <th className="border p-2 text-center w-20">Тональность</th>
                <th className="border p-2 text-left">Примеры</th>
              </tr>
            </thead>
            <tbody>
              {data.openTextThemes.product_themes.map((t: Record<string, unknown>, i: number) => (
                <tr key={i} className="border-b">
                  <td className="border p-2 font-medium">{t.theme as string}</td>
                  <td className="border p-2 text-center">{t.count as number}</td>
                  <td className="border p-2 text-center">{t.percentage as number}%</td>
                  <td className="border p-2 text-center">{sentimentRu(t.sentiment as string)}</td>
                  <td className="border p-2 text-gray-600 italic">{(t.examples as string[])?.join('; ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {/* City distribution */}
      {data.openTextThemes?.city_distribution?.length > 0 && (
        <section className="mb-8">
          <h2 className="text-lg font-bold border-b pb-1 mb-3">🌍 География</h2>
          <div className="flex flex-wrap gap-2 text-xs">
            {data.openTextThemes.city_distribution.map((c: Record<string, unknown>, i: number) => (
              <span key={i} className="border rounded px-2 py-1">
                {c.city as string} ({c.count as number})
              </span>
            ))}
          </div>
        </section>
      )}

      {/* Statistics */}
      {data.stats && (
        <section className="mb-8 page-break">
          <h2 className="text-lg font-bold border-b pb-1 mb-3">📈 Статистика</h2>

          {data.stats.metadata && (
            <div className="grid grid-cols-4 gap-3 mb-4 text-center text-xs">
              <div className="border rounded p-2"><div className="text-lg font-bold">{data.stats.metadata.totalResponses}</div><div className="text-gray-500">Ответов</div></div>
              <div className="border rounded p-2"><div className="text-lg font-bold">{data.stats.metadata.completionRate}%</div><div className="text-gray-500">Завершённость</div></div>
              <div className="border rounded p-2"><div className="text-lg font-bold">{data.stats.metadata.suspiciousRate}%</div><div className="text-gray-500">Подозрительных</div></div>
              <div className="border rounded p-2"><div className="text-lg font-bold">{data.stats.metadata.avgDuration}с</div><div className="text-gray-500">Среднее время</div></div>
            </div>
          )}

          {data.stats.significantCrossTabs?.length > 0 && (
            <>
              <h3 className="font-bold text-sm mb-2">Значимые связи (p &lt; 0.05)</h3>
              <table className="w-full border-collapse border text-xs mb-4">
                <thead><tr className="bg-gray-100">
                  <th className="border p-2 text-left">Пара</th>
                  <th className="border p-2 text-center w-16">V</th>
                  <th className="border p-2 text-center w-16">p</th>
                  <th className="border p-2 text-left">Инсайт</th>
                </tr></thead>
                <tbody>
                  {data.stats.significantCrossTabs.map((ct: Record<string, unknown>, i: number) => (
                    <tr key={i} className="border-b">
                      <td className="border p-2 font-medium">{pairRu(ct.pair as string)}</td>
                      <td className="border p-2 text-center">{ct.cramersV as number}</td>
                      <td className="border p-2 text-center">{ct.pValue as number}</td>
                      <td className="border p-2 text-gray-600">{ct.insight as string}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          {data.stats.correlations?.length > 0 && (
            <>
              <h3 className="font-bold text-sm mb-2">Корреляции</h3>
              <table className="w-full border-collapse border text-xs">
                <thead><tr className="bg-gray-100">
                  <th className="border p-2 text-left">Поле 1</th>
                  <th className="border p-2 text-left">Поле 2</th>
                  <th className="border p-2 text-center w-20">Корреляция</th>
                  <th className="border p-2 text-center w-20">Сила</th>
                </tr></thead>
                <tbody>
                  {data.stats.correlations.map((c: Record<string, unknown>, i: number) => (
                    <tr key={i} className="border-b">
                      <td className="border p-2">{fieldRu(c.field1 as string)}</td>
                      <td className="border p-2">{fieldRu(c.field2 as string)}</td>
                      <td className="border p-2 text-center font-mono">{c.correlation as number}</td>
                      <td className="border p-2 text-center">{strengthRu(c.strength as string)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </section>
      )}

      {/* Footer */}
      <div className="text-center text-xs text-gray-400 border-t pt-4 mt-8">
        Сгенерировано {dateStr} · vladprod.site · {analysis.model} · {analysis.totalResponses} ответов
        {data.pipelineSteps && ` · ${data.pipelineSteps.reduce((s: number, p: Record<string, number>) => s + p.tokens, 0).toLocaleString()} токенов`}
      </div>
    </div>
  )
}
