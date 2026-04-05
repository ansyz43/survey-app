import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { questions, totalQuestions } from '@/lib/questions'

const validFieldNames = new Set(questions.map((q) => q.fieldName))
const arrayFields = new Set(
  questions.filter((q) => q.type === 'multiple' || q.type === 'ranking').map((q) => q.fieldName)
)
const openFields = new Set(
  questions.filter((q) => q.type === 'open').map((q) => q.fieldName)
)
// Pre-build valid option IDs per question
const validOptions = new Map<string, Set<string>>()
for (const q of questions) {
  if (q.options && q.options.length > 0) {
    validOptions.set(q.fieldName, new Set(q.options.map((o) => o.id)))
  }
}

function validateAnswer(fieldName: string, answer: unknown): string | null {
  // Open-text: accept any string within length limit
  if (openFields.has(fieldName)) {
    if (typeof answer !== 'string') return 'Answer must be a string'
    if (answer.length > 500) return 'Answer too long'
    return null
  }

  const opts = validOptions.get(fieldName)
  if (!opts) return null // no options defined = skip validation

  if (arrayFields.has(fieldName)) {
    if (!Array.isArray(answer)) return 'Answer must be an array'
    for (const v of answer) {
      if (typeof v !== 'string' || !opts.has(v)) return `Invalid option: ${v}`
    }
  } else {
    if (typeof answer !== 'string' || !opts.has(answer as string)) return `Invalid option: ${answer}`
  }
  return null
}

export async function PUT(request: Request) {
  try {
    const body = await request.json()
    const { sessionId, questionId, answer } = body

    if (!sessionId || !questionId) {
      return NextResponse.json({ error: 'Missing sessionId or questionId' }, { status: 400 })
    }

    const question = questions.find((q) => q.id === questionId)
    if (!question) {
      return NextResponse.json({ error: 'Invalid questionId' }, { status: 400 })
    }

    const fieldName = question.fieldName

    // Validate answer values against allowed options
    const validationError = validateAnswer(fieldName, answer)
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 })
    }

    // Build update data
    const updateData: Record<string, unknown> = {}
    if (arrayFields.has(fieldName)) {
      updateData[fieldName] = Array.isArray(answer) ? answer : [answer]
    } else {
      updateData[fieldName] = typeof answer === 'string' ? answer : String(answer)
    }

    const existing = await prisma.surveyResponse.findUnique({
      where: { sessionId },
    })

    if (!existing) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    // Calculate completion rate
    const currentData = existing as Record<string, unknown>
    let answeredCount = 0
    for (const fn of validFieldNames) {
      const val = fn === fieldName ? answer : currentData[fn]
      if (val !== null && val !== undefined) {
        if (Array.isArray(val) && val.length > 0) answeredCount++
        else if (typeof val === 'string' && val.trim() !== '') answeredCount++
      }
    }
    const completionRate = Math.round((answeredCount / totalQuestions) * 100) / 100
    updateData.completionRate = completionRate
    updateData.dropOffQuestion = questionId

    await prisma.surveyResponse.update({
      where: { sessionId },
      data: updateData,
    })

    return NextResponse.json({ ok: true, completionRate })
  } catch (error) {
    console.error('Answer error:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
