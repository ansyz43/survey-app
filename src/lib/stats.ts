/**
 * Pure statistical computations — NO GPT, runs on server.
 * Cross-tabulation, chi-square, correlations, frequency analysis.
 */

import { questions } from './questions'

type RawResponse = Record<string, unknown>

// ── Frequency Table ──────────────────────────────────────────────
export interface FrequencyRow {
  value: string
  label_ru: string
  count: number
  percent: number
}

export function buildFrequencyTable(
  responses: RawResponse[],
  field: string
): FrequencyRow[] {
  const q = questions.find((q) => q.fieldName === field)
  const counts: Record<string, number> = {}
  let total = 0

  for (const r of responses) {
    const val = r[field]
    if (Array.isArray(val)) {
      for (const v of val) {
        counts[String(v)] = (counts[String(v)] || 0) + 1
        total++
      }
    } else if (typeof val === 'string' && val) {
      counts[val] = (counts[val] || 0) + 1
      total++
    }
  }

  return Object.entries(counts)
    .map(([value, count]) => ({
      value,
      label_ru: q?.options?.find((o) => o.id === value)?.ru || value,
      count,
      percent: total > 0 ? Math.round((count / total) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.count - a.count)
}

// ── Cross-Tabulation ─────────────────────────────────────────────
export interface CrossTabCell {
  rowValue: string
  colValue: string
  count: number
  rowPercent: number
  colPercent: number
}

export interface CrossTabResult {
  rowField: string
  colField: string
  cells: CrossTabCell[]
  rowTotals: Record<string, number>
  colTotals: Record<string, number>
  total: number
  chiSquare: number
  pValue: number
  cramersV: number
  significant: boolean
}

export function crossTabulate(
  responses: RawResponse[],
  rowField: string,
  colField: string
): CrossTabResult {
  const counts: Record<string, Record<string, number>> = {}
  const rowTotals: Record<string, number> = {}
  const colTotals: Record<string, number> = {}
  let total = 0

  for (const r of responses) {
    const rowVals = extractValues(r[rowField])
    const colVals = extractValues(r[colField])

    for (const rv of rowVals) {
      for (const cv of colVals) {
        if (!counts[rv]) counts[rv] = {}
        counts[rv][cv] = (counts[rv][cv] || 0) + 1
        rowTotals[rv] = (rowTotals[rv] || 0) + 1
        colTotals[cv] = (colTotals[cv] || 0) + 1
        total++
      }
    }
  }

  const cells: CrossTabCell[] = []
  for (const [rv, cols] of Object.entries(counts)) {
    for (const [cv, count] of Object.entries(cols)) {
      cells.push({
        rowValue: rv,
        colValue: cv,
        count,
        rowPercent: rowTotals[rv] ? Math.round((count / rowTotals[rv]) * 1000) / 10 : 0,
        colPercent: colTotals[cv] ? Math.round((count / colTotals[cv]) * 1000) / 10 : 0,
      })
    }
  }

  // Chi-square test
  let chiSquare = 0
  const rowKeys = Object.keys(rowTotals)
  const colKeys = Object.keys(colTotals)

  for (const rv of rowKeys) {
    for (const cv of colKeys) {
      const observed = counts[rv]?.[cv] || 0
      const expected = total > 0 ? (rowTotals[rv] * colTotals[cv]) / total : 0
      if (expected > 0) {
        chiSquare += ((observed - expected) ** 2) / expected
      }
    }
  }

  const df = Math.max((rowKeys.length - 1) * (colKeys.length - 1), 1)
  const minDim = Math.min(rowKeys.length, colKeys.length)
  const cramersV = total > 0 && minDim > 1
    ? Math.sqrt(chiSquare / (total * (minDim - 1)))
    : 0

  // Approximate p-value using chi-square CDF (Wilson-Hilferty approximation)
  const pValue = approxChiSquarePValue(chiSquare, df)

  return {
    rowField,
    colField,
    cells,
    rowTotals,
    colTotals,
    total,
    chiSquare: Math.round(chiSquare * 100) / 100,
    pValue: Math.round(pValue * 10000) / 10000,
    cramersV: Math.round(cramersV * 1000) / 1000,
    significant: pValue < 0.05,
  }
}

// ── Correlation pairs (for ordinal fields) ───────────────────────
export interface CorrelationResult {
  field1: string
  field2: string
  correlation: number
  strength: 'weak' | 'moderate' | 'strong'
}

const ORDINAL_MAPS: Record<string, Record<string, number>> = {
  monthlySpend: { '0': 0, '1-30': 1, '31-100': 2, '101-300': 3, '300plus': 4 },
  priceWillingness: { 'under50': 0, '50-150': 1, '151-300': 2, '301-500': 3, '500plus': 4 },
  buyVlkProduct: { 'no': 0, 'unlikely': 1, 'depends': 2, 'probably': 3, 'definitely': 4 },
  vlkContentAware: { 'never': 0, 'sometimes': 1, 'often': 2 },
}

export function computeCorrelations(responses: RawResponse[]): CorrelationResult[] {
  const ordinalFields = Object.keys(ORDINAL_MAPS)
  const results: CorrelationResult[] = []

  for (let i = 0; i < ordinalFields.length; i++) {
    for (let j = i + 1; j < ordinalFields.length; j++) {
      const f1 = ordinalFields[i]
      const f2 = ordinalFields[j]
      const map1 = ORDINAL_MAPS[f1]
      const map2 = ORDINAL_MAPS[f2]

      const pairs: [number, number][] = []
      for (const r of responses) {
        const v1 = map1[String(r[f1])]
        const v2 = map2[String(r[f2])]
        if (v1 !== undefined && v2 !== undefined) {
          pairs.push([v1, v2])
        }
      }

      if (pairs.length > 5) {
        const corr = spearmanRank(pairs)
        const absCorr = Math.abs(corr)
        results.push({
          field1: f1,
          field2: f2,
          correlation: Math.round(corr * 1000) / 1000,
          strength: absCorr > 0.5 ? 'strong' : absCorr > 0.3 ? 'moderate' : 'weak',
        })
      }
    }
  }

  return results.sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation))
}

// ── Key Cross-Tab Pairs (business-relevant) ──────────────────────
export interface KeyInsight {
  question: string
  insight: string
  data: Record<string, number>
  significance: 'high' | 'medium' | 'low'
}

const KEY_CROSSTAB_PAIRS: [string, string][] = [
  ['age', 'paidContentTypes'],        // What content types each age group pays for
  ['age', 'platforms'],                // Platform preference by age
  ['gender', 'contentTopics'],         // Topic interest by gender
  ['gender', 'desiredContent'],        // Vladivostok content by gender
  ['monthlySpend', 'paidContentTypes'],// What high-spenders buy
  ['occupation', 'priceWillingness'],  // Price tolerance by occupation
  ['buyVlkProduct', 'priceWillingness'],// WTP for those open to VLK products
  ['vlkContentAware', 'buyVlkProduct'],// Does awareness drive purchase intent
  ['age', 'priceWillingness'],         // Price tolerance by age
  ['platforms', 'preferredPlatform'],  // Where they consume vs subscribe
]

export function computeKeyInsights(responses: RawResponse[]): {
  crossTabs: CrossTabResult[]
  correlations: CorrelationResult[]
  frequencyTables: Record<string, FrequencyRow[]>
  metadata: {
    totalResponses: number
    completionRate: number
    suspiciousRate: number
    avgDuration: number
    topDropOff: string
  }
} {
  const totalAll = responses.length

  // Frequency tables for all questions
  const frequencyTables: Record<string, FrequencyRow[]> = {}
  for (const q of questions) {
    if (q.type !== 'open') {
      frequencyTables[q.fieldName] = buildFrequencyTable(responses, q.fieldName)
    }
  }

  // Key cross-tabs
  const crossTabs = KEY_CROSSTAB_PAIRS.map(([r, c]) => crossTabulate(responses, r, c))

  // Correlations
  const correlations = computeCorrelations(responses)

  // Metadata
  const completed = responses.filter((r) => r.completedAt).length
  const suspicious = responses.filter((r) => r.isSuspicious).length
  const durations = responses
    .map((r) => r.durationSeconds as number)
    .filter((d) => d && d > 0)
  const avgDuration = durations.length > 0
    ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
    : 0

  // Drop-off analysis
  const dropOffs: Record<string, number> = {}
  for (const r of responses) {
    const dq = r.dropOffQuestion
    if (typeof dq === 'string' && dq) {
      dropOffs[dq] = (dropOffs[dq] || 0) + 1
    }
  }
  const topDropOff = Object.entries(dropOffs).sort((a, b) => b[1] - a[1])[0]?.[0] || 'none'

  return {
    crossTabs,
    correlations,
    frequencyTables,
    metadata: {
      totalResponses: totalAll,
      completionRate: totalAll > 0 ? Math.round((completed / totalAll) * 100) : 0,
      suspiciousRate: totalAll > 0 ? Math.round((suspicious / totalAll) * 100) : 0,
      avgDuration,
      topDropOff,
    },
  }
}

// ── Helpers ──────────────────────────────────────────────────────
function extractValues(val: unknown): string[] {
  if (Array.isArray(val)) return val.map(String)
  if (typeof val === 'string' && val) return [val]
  return []
}

function spearmanRank(pairs: [number, number][]): number {
  const n = pairs.length
  if (n < 3) return 0

  const rank = (arr: number[]): number[] => {
    const sorted = arr.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v)
    const ranks = new Array(n)
    let i = 0
    while (i < n) {
      let j = i
      while (j < n - 1 && sorted[j + 1].v === sorted[j].v) j++
      const avgRank = (i + j) / 2 + 1
      for (let k = i; k <= j; k++) ranks[sorted[k].i] = avgRank
      i = j + 1
    }
    return ranks
  }

  const r1 = rank(pairs.map((p) => p[0]))
  const r2 = rank(pairs.map((p) => p[1]))

  let sumD2 = 0
  for (let i = 0; i < n; i++) sumD2 += (r1[i] - r2[i]) ** 2

  return 1 - (6 * sumD2) / (n * (n * n - 1))
}

function approxChiSquarePValue(x: number, df: number): number {
  // Wilson-Hilferty approximation for chi-square CDF → p-value
  if (x <= 0) return 1
  if (df <= 0) return 0
  const z = ((x / df) ** (1 / 3) - (1 - 2 / (9 * df))) / Math.sqrt(2 / (9 * df))
  // Approximate normal CDF
  const p = 0.5 * (1 + erf(z / Math.SQRT2))
  return Math.max(0, Math.min(1, 1 - p))
}

function erf(x: number): number {
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741
  const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911
  const sign = x < 0 ? -1 : 1
  const abs = Math.abs(x)
  const t = 1 / (1 + p * abs)
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-(abs * abs))
  return sign * y
}
