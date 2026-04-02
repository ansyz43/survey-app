'use client'

import { useEffect, useState } from 'react'
import { questions } from '@/lib/questions'

interface Response {
  id: string
  sessionId: string
  age: string | null
  gender: string | null
  occupation: string | null
  completedAt: string | null
  durationSeconds: number | null
  isSuspicious: boolean
  completionRate: number
  isPartial: boolean
  [key: string]: unknown
}

interface ResponsesData {
  responses: Response[]
  total: number
  page: number
  totalPages: number
}

function optionLabel(fieldName: string, optionId: string): string {
  const q = questions.find((q) => q.fieldName === fieldName)
  const opt = q?.options?.find((o) => o.id === optionId)
  return opt?.ru || optionId
}

export default function ResponsesPage() {
  const [data, setData] = useState<ResponsesData | null>(null)
  const [page, setPage] = useState(1)
  const [filters, setFilters] = useState({ age: '', gender: '', suspicious: '' })
  const [selected, setSelected] = useState<Response | null>(null)

  useEffect(() => {
    const params = new URLSearchParams({ page: String(page), limit: '50' })
    if (filters.age) params.set('age', filters.age)
    if (filters.gender) params.set('gender', filters.gender)
    if (filters.suspicious) params.set('suspicious', filters.suspicious)

    fetch(`/api/admin/responses?${params}`)
      .then((res) => {
        if (res.status === 401) {
          window.location.href = '/admin'
          return null
        }
        return res.json()
      })
      .then((d) => d && setData(d))
  }, [page, filters])

  if (!data) return <div className="p-8 text-gray-500">Загрузка...</div>

  const ageOptions = questions.find((q) => q.id === 'A1')?.options || []
  const genderOptions = questions.find((q) => q.id === 'A2')?.options || []

  return (
    <div className="max-w-7xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Ответы ({data.total})</h1>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <select
          value={filters.age}
          onChange={(e) => { setFilters({ ...filters, age: e.target.value }); setPage(1) }}
          className="px-3 py-2 border rounded-lg text-sm"
        >
          <option value="">Все возрасты</option>
          {ageOptions.map((o) => (
            <option key={o.id} value={o.id}>{o.ru}</option>
          ))}
        </select>
        <select
          value={filters.gender}
          onChange={(e) => { setFilters({ ...filters, gender: e.target.value }); setPage(1) }}
          className="px-3 py-2 border rounded-lg text-sm"
        >
          <option value="">Все полы</option>
          {genderOptions.map((o) => (
            <option key={o.id} value={o.id}>{o.ru}</option>
          ))}
        </select>
        <select
          value={filters.suspicious}
          onChange={(e) => { setFilters({ ...filters, suspicious: e.target.value }); setPage(1) }}
          className="px-3 py-2 border rounded-lg text-sm"
        >
          <option value="">Все ответы</option>
          <option value="true">Подозрительные</option>
          <option value="false">Обычные</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50">
              <th className="text-left p-3">№</th>
              <th className="text-left p-3">Возраст</th>
              <th className="text-left p-3">Пол</th>
              <th className="text-left p-3">Деятельность</th>
              <th className="text-left p-3">Время (с)</th>
              <th className="text-left p-3">%</th>
              <th className="text-left p-3">Статус</th>
            </tr>
          </thead>
          <tbody>
            {data.responses.map((r, i) => (
              <tr
                key={r.id}
                onClick={() => setSelected(r)}
                className="border-b hover:bg-blue-50 cursor-pointer transition-colors"
              >
                <td className="p-3 text-gray-500">{(page - 1) * 50 + i + 1}</td>
                <td className="p-3">{r.age ? optionLabel('age', r.age) : '—'}</td>
                <td className="p-3">{r.gender ? optionLabel('gender', r.gender) : '—'}</td>
                <td className="p-3">{r.occupation ? optionLabel('occupation', r.occupation) : '—'}</td>
                <td className="p-3">{r.durationSeconds || '—'}</td>
                <td className="p-3">{Math.round(r.completionRate * 100)}%</td>
                <td className="p-3">
                  {r.isSuspicious && <span className="text-red-600 font-medium">⚠️</span>}
                  {r.isPartial && <span className="text-yellow-600 font-medium">⏸</span>}
                  {!r.isSuspicious && !r.isPartial && r.completedAt && <span className="text-green-600">✓</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-500">
          Страница {data.page} из {data.totalPages}
        </span>
        <div className="flex gap-2">
          <button
            onClick={() => setPage(Math.max(1, page - 1))}
            disabled={page === 1}
            className="px-3 py-1 border rounded text-sm disabled:opacity-50"
          >
            ←
          </button>
          <button
            onClick={() => setPage(Math.min(data.totalPages, page + 1))}
            disabled={page >= data.totalPages}
            className="px-3 py-1 border rounded text-sm disabled:opacity-50"
          >
            →
          </button>
        </div>
      </div>

      {/* Detail modal */}
      {selected && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setSelected(null)}>
          <div className="bg-white rounded-xl max-w-2xl w-full max-h-[80vh] overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold">Детали ответа</h2>
              <button onClick={() => setSelected(null)} className="text-gray-500 hover:text-gray-700">✕</button>
            </div>
            <div className="space-y-3">
              {questions.map((q) => {
                const val = selected[q.fieldName]
                let display = '—'
                if (Array.isArray(val) && val.length > 0) {
                  display = val.map((v: string) => optionLabel(q.fieldName, v)).join(', ')
                } else if (typeof val === 'string' && val) {
                  display = q.options ? optionLabel(q.fieldName, val) : val
                }
                return (
                  <div key={q.id} className="border-b pb-2">
                    <p className="text-xs text-gray-500">{q.id}: {q.ru}</p>
                    <p className="text-sm font-medium">{display}</p>
                  </div>
                )
              })}
              <div className="border-b pb-2">
                <p className="text-xs text-gray-500">Время прохождения</p>
                <p className="text-sm font-medium">{selected.durationSeconds ? `${selected.durationSeconds} сек` : '—'}</p>
              </div>
              {selected.isSuspicious && (
                <div className="p-3 bg-red-50 rounded-lg">
                  <p className="text-sm text-red-700 font-medium">⚠️ Подозрительный ответ</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
