'use client'

import { useRouter } from 'next/navigation'
import { useState, useEffect, useCallback, useRef } from 'react'
import { questions } from '@/lib/questions'
import QuestionCard from '@/components/survey/QuestionCard'
import ProgressBar from '@/components/survey/ProgressBar'
import type { Lang, SkipRule } from '@/types/survey'

const UI = {
  zh: { prev: '← 上一题', next: '下一题 →', submit: '提交问卷 ✓', skip: '跳过', saving: '保存中...' },
  ru: { prev: '← Назад', next: 'Далее →', submit: 'Отправить ✓', skip: 'Пропустить', saving: 'Сохраняю...' },
}

export default function SurveyPage() {
  const router = useRouter()
  const [currentIndex, setCurrentIndex] = useState(0)
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({})
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [lang, setLang] = useState<Lang>('zh')
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Map fieldName → questionId for skip logic lookups
  const fieldToQid = useRef(
    Object.fromEntries(questions.map(q => [q.fieldName, q.id]))
  ).current

  /** Check if a question should be skipped based on current answers */
  const shouldSkip = useCallback((rule: SkipRule | undefined): boolean => {
    if (!rule) return false
    const qid = fieldToQid[rule.field]
    if (!qid) return false
    const val = answers[qid]
    if (rule.equals && val === rule.equals) return true
    if (rule.includes && Array.isArray(val) && val.includes(rule.includes)) return true
    return false
  }, [answers, fieldToQid])

  /** Find the next non-skipped index forward */
  const nextValid = useCallback((from: number): number => {
    for (let i = from + 1; i < questions.length; i++) {
      if (!shouldSkip(questions[i].skipIf)) return i
    }
    return questions.length // past last = completion
  }, [shouldSkip])

  /** Find the previous non-skipped index backward */
  const prevValid = useCallback((from: number): number => {
    for (let i = from - 1; i >= 0; i--) {
      if (!shouldSkip(questions[i].skipIf)) return i
    }
    return 0
  }, [shouldSkip])

  const [alreadyCompleted, setAlreadyCompleted] = useState(false)

  useEffect(() => {
    // Check if this browser already completed the survey
    if (localStorage.getItem('surveyCompleted')) {
      setAlreadyCompleted(true)
      return
    }
    const sid = sessionStorage.getItem('surveySessionId')
    if (!sid) { router.push('/'); return }
    setSessionId(sid)
    const storedLang = sessionStorage.getItem('surveyLang') as Lang
    if (storedLang === 'ru' || storedLang === 'zh') setLang(storedLang)
  }, [router])

  const currentQuestion = questions[currentIndex]

  const saveAnswer = useCallback(async (questionId: string, answer: string | string[]) => {
    if (!sessionId) return
    setSaving(true)
    try {
      await fetch('/api/survey/answer', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, questionId, answer }),
      })
    } catch (err) {
      console.error('Save error:', err)
    } finally {
      setSaving(false)
    }
  }, [sessionId])

  const handleAnswer = (answer: string | string[]) => {
    const qId = currentQuestion.id
    setAnswers((prev) => ({ ...prev, [qId]: answer }))

    // Debounced auto-save (500ms) — reduces server load
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      saveAnswer(qId, answer)
    }, 500)
  }

  const canNext = () => {
    const answer = answers[currentQuestion.id]
    if (!answer) return false
    if (Array.isArray(answer) && answer.length === 0) return false
    if (typeof answer === 'string' && answer.trim() === '') {
      // Open text questions are optional
      if (currentQuestion.type === 'open') return true
      return false
    }
    return true
  }

  const handleNext = async () => {
    const next = nextValid(currentIndex)
    if (next < questions.length) {
      setCurrentIndex(next)
    } else {
      // Complete survey
      try {
        await fetch('/api/survey/complete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId }),
        })
        localStorage.setItem('surveyCompleted', Date.now().toString())
      } catch (err) {
        console.error('Complete error:', err)
      }
      router.push('/survey/thank-you')
    }
  }

  const handlePrev = () => {
    const prev = prevValid(currentIndex)
    if (prev !== currentIndex) {
      setCurrentIndex(prev)
    }
  }

  const handleSkip = () => {
    if (currentQuestion.type === 'open') {
      handleNext()
    }
  }

  if (alreadyCompleted) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center px-4">
        <div className="text-center max-w-md">
          <h2 className="text-2xl font-bold mb-4">
            {lang === 'zh' ? '您已完成问卷' : 'Вы уже прошли опрос'}
          </h2>
          <p className="text-gray-500">
            {lang === 'zh' ? '感谢您的参与！每人只能填写一次。' : 'Спасибо за участие! Опрос можно пройти только один раз.'}
          </p>
        </div>
      </main>
    )
  }

  if (!sessionId || !currentQuestion) return null

  const isLast = nextValid(currentIndex) >= questions.length
  const isFirst = prevValid(currentIndex) === currentIndex
  const answer = answers[currentQuestion.id] ?? (
    currentQuestion.type === 'multiple' || currentQuestion.type === 'ranking' ? [] : ''
  )

  return (
    <main className="min-h-screen flex flex-col px-4 py-6 max-w-lg mx-auto">
      <ProgressBar current={currentIndex + 1} total={questions.length} skipped={questions.filter(q => shouldSkip(q.skipIf)).length} />

      <div className="flex-1 flex flex-col justify-center py-4">
        <QuestionCard
          question={currentQuestion}
          answer={answer || null}
          onAnswer={handleAnswer}
          lang={lang}
          showBlock={
            currentIndex === 0 ||
            questions[currentIndex - 1]?.block !== currentQuestion.block
          }
        />
      </div>

      <div className="flex gap-3 mt-6 pb-4">
        {!isFirst && (
          <button
            onClick={handlePrev}
            className="flex-1 py-3 px-6 border-2 border-gray-200 text-gray-600 font-medium rounded-xl hover:bg-gray-50 transition-colors"
          >
            ← {lang === 'zh' ? '上一题' : 'Назад'}
          </button>
        )}

        {currentQuestion.type === 'open' && !answers[currentQuestion.id] && (
          <button
            onClick={handleSkip}
            className="py-3 px-6 text-gray-400 font-medium rounded-xl hover:bg-gray-50 transition-colors"
          >
            {UI[lang].skip}
          </button>
        )}

        <button
          onClick={handleNext}
          disabled={!canNext() && currentQuestion.type !== 'open'}
          className={`flex-1 py-3 px-6 font-medium rounded-xl transition-colors ${
            canNext() || currentQuestion.type === 'open'
              ? 'bg-blue-600 text-white hover:bg-blue-700'
              : 'bg-gray-200 text-gray-400 cursor-not-allowed'
          }`}
        >
          {saving ? UI[lang].saving : isLast ? UI[lang].submit : UI[lang].next}
        </button>
      </div>
    </main>
  )
}
