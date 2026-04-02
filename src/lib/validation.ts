import { SurveyResponse } from '@prisma/client'

interface ValidationResult {
  isSuspicious: boolean
  reasons: string[]
}

export function validateResponse(response: SurveyResponse): ValidationResult {
  const reasons: string[] = []

  // Speed-run check: completed in less than 90 seconds
  if (response.durationSeconds !== null && response.durationSeconds < 90) {
    reasons.push('speed_run')
  }

  // Control mismatch: says "never pay" in B1 but spends 101+ in B2
  const neverPay = response.paidContentTypes.includes('never_pay')
  const highSpend = response.monthlySpend === '101-300' || response.monthlySpend === '300plus'
  if (neverPay && highSpend) {
    reasons.push('control_mismatch')
  }

  return {
    isSuspicious: reasons.length > 0,
    reasons,
  }
}

export function calculateCompletionRate(answers: Record<string, unknown>, totalQuestions: number): number {
  const answered = Object.values(answers).filter((v) => {
    if (v === null || v === undefined) return false
    if (Array.isArray(v) && v.length === 0) return false
    if (typeof v === 'string' && v.trim() === '') return false
    return true
  }).length
  return Math.round((answered / totalQuestions) * 100) / 100
}
