'use client'

import { useEffect, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
import type { PieLabelRenderProps } from 'recharts'
import { questions } from '@/lib/questions'

interface DashboardData {
  total: number
  completed: number
  suspicious: number
  partial: number
  completionRate: number
  byAge: Record<string, number>
  byGender: Record<string, number>
  byPlatform: Record<string, number>
  byContentType: Record<string, number>
  byContentTopic: Record<string, number>
  byPreferredPlatform: Record<string, number>
  byBuyIntent: Record<string, number>
  byMonthlySpend: Record<string, number>
}

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#F97316']

function optionLabel(questionId: string, optionId: string): string {
  const q = questions.find((q) => q.id === questionId)
  const opt = q?.options?.find((o) => o.id === optionId)
  return opt?.ru || optionId
}

function toChartData(record: Record<string, number>, questionId?: string) {
  return Object.entries(record)
    .map(([key, value]) => ({
      name: questionId ? optionLabel(questionId, key) : key,
      value,
    }))
    .sort((a, b) => b.value - a.value)
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/admin/dashboard')
      .then((res) => {
        if (res.status === 401) {
          window.location.href = '/admin'
          return null
        }
        return res.json()
      })
      .then((d) => d && setData(d))
      .catch(() => setError('Ошибка загрузки'))
  }, [])

  if (error) return <div className="text-red-600 p-8">{error}</div>
  if (!data) return <div className="p-8 text-gray-500">Загрузка...</div>

  const exportUrl = (fmt: string) => `/api/admin/export?format=${fmt}`

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card title="Всего ответов" value={data.total} color="blue" />
        <Card title="Завершено" value={data.completed} sub={`${data.completionRate}%`} color="green" />
        <Card title="Подозрительных" value={data.suspicious} color="red" />
        <Card title="Неполных" value={data.partial} color="yellow" />
      </div>

      {/* Export buttons */}
      <div className="flex gap-3">
        <a
          href={exportUrl('csv')}
          className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium"
        >
          📥 Экспорт CSV
        </a>
        <a
          href={exportUrl('xlsx')}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
        >
          📥 Экспорт Excel
        </a>
      </div>

      {/* Charts grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <ChartCard title="Возраст (A1)">
          <BarChartWidget data={toChartData(data.byAge, 'A1')} />
        </ChartCard>

        <ChartCard title="Пол (A2)">
          <PieChartWidget data={toChartData(data.byGender, 'A2')} />
        </ChartCard>

        <ChartCard title="Платформы контента (B3)">
          <BarChartWidget data={toChartData(data.byPlatform, 'B3')} />
        </ChartCard>

        <ChartCard title="Типы контента за которые платят (B1)">
          <BarChartWidget data={toChartData(data.byContentType, 'B1')} />
        </ChartCard>

        <ChartCard title="Интересные темы (B4)">
          <BarChartWidget data={toChartData(data.byContentTopic, 'B4')} />
        </ChartCard>

        <ChartCard title="Платформа для подписки на русского автора (C3)">
          <PieChartWidget data={toChartData(data.byPreferredPlatform, 'C3')} />
        </ChartCard>

        <ChartCard title="Готовность купить товар Дальнего Востока (C4)">
          <BarChartWidget data={toChartData(data.byBuyIntent, 'C4')} />
        </ChartCard>

        <ChartCard title="Месячные траты на контент (B2)">
          <BarChartWidget data={toChartData(data.byMonthlySpend, 'B2')} />
        </ChartCard>
      </div>
    </div>
  )
}

function Card({ title, value, sub, color }: { title: string; value: number; sub?: string; color: string }) {
  const colors: Record<string, string> = {
    blue: 'bg-blue-50 border-blue-200',
    green: 'bg-green-50 border-green-200',
    red: 'bg-red-50 border-red-200',
    yellow: 'bg-yellow-50 border-yellow-200',
  }
  return (
    <div className={`p-4 rounded-xl border ${colors[color]}`}>
      <p className="text-sm text-gray-600">{title}</p>
      <p className="text-3xl font-bold mt-1">{value.toLocaleString()}</p>
      {sub && <p className="text-sm text-gray-500 mt-1">{sub}</p>}
    </div>
  )
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white p-4 rounded-xl border">
      <h3 className="font-medium text-gray-700 mb-4">{title}</h3>
      <div className="h-64">{children}</div>
    </div>
  )
}

function BarChartWidget({ data }: { data: Array<{ name: string; value: number }> }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} layout="vertical" margin={{ left: 10, right: 20 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis type="number" />
        <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 12 }} />
        <Tooltip />
        <Bar dataKey="value" fill="#3B82F6" radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}

function PieChartWidget({ data }: { data: Array<{ name: string; value: number }> }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          outerRadius={80}
          dataKey="value"
          label={(props: PieLabelRenderProps) => `${props.name || ''} ${(((props.percent ?? 0) as number) * 100).toFixed(0)}%`}
        >
          {data.map((_, i) => (
            <Cell key={i} fill={COLORS[i % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip />
      </PieChart>
    </ResponsiveContainer>
  )
}
