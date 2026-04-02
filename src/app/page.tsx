'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import type { Lang } from '@/types/survey'

export default function Home() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [lang, setLang] = useState<Lang | null>(null)

  const startSurvey = async () => {
    if (!lang) return
    setLoading(true)
    try {
      const res = await fetch('/api/survey/start', { method: 'POST' })
      const data = await res.json()
      if (data.sessionId) {
        sessionStorage.setItem('surveySessionId', data.sessionId)
        sessionStorage.setItem('surveyLang', lang)
        router.push('/survey')
      }
    } catch {
      setLoading(false)
    }
  }

  // Step 1: Language selection
  if (!lang) {
    return (
      <main className="flex flex-col items-center justify-center min-h-screen px-6 py-12">
        <div className="max-w-md w-full text-center space-y-8">
          <div className="text-5xl">🌐</div>
          <h1 className="text-2xl font-bold text-gray-900">
            请选择语言 / Выберите язык
          </h1>
          <div className="flex flex-col gap-4">
            <button
              onClick={() => setLang('zh')}
              className="w-full py-5 px-8 bg-white border-2 border-gray-200 text-lg font-semibold rounded-2xl hover:border-blue-500 hover:bg-blue-50 transition-colors"
            >
              🇨🇳 中文
            </button>
            <button
              onClick={() => setLang('ru')}
              className="w-full py-5 px-8 bg-white border-2 border-gray-200 text-lg font-semibold rounded-2xl hover:border-blue-500 hover:bg-blue-50 transition-colors"
            >
              🇷🇺 Русский
            </button>
          </div>
        </div>
      </main>
    )
  }

  // Step 2: Welcome screen
  const t = {
    zh: {
      title: '🎨 创意内容调查',
      desc: '我们正在研究中国市场对来自海参崴（符拉迪沃斯托克）的数字服务的需求。',
      time: '本问卷大约需要5–7分钟完成，共17道题。',
      anon: '您的回答将完全匿名，仅用于市场研究目的。',
      start: '开始填写问卷 →',
      loading: '加载中...',
      consent: '点击开始即表示您同意参与本次匿名调查',
      back: '← 换语言',
    },
    ru: {
      title: '🎨 Исследование цифровых услуг',
      desc: 'Мы изучаем спрос на цифровые услуги из Владивостока на китайском рынке.',
      time: 'Опрос займёт 5–7 минут, всего 17 вопросов.',
      anon: 'Ваши ответы полностью анонимны и используются только для исследования.',
      start: 'Начать опрос →',
      loading: 'Загрузка...',
      consent: 'Нажимая «Начать», вы соглашаетесь участвовать в анонимном опросе',
      back: '← Сменить язык',
    },
  }[lang]

  return (
    <main className="flex flex-col items-center justify-center min-h-screen px-6 py-12">
      <div className="max-w-md w-full text-center space-y-8">
        <div className="space-y-4">
          <h1 className="text-3xl font-bold text-gray-900">{t.title}</h1>
          <p className="text-lg text-gray-600">{t.desc}</p>
          <p className="text-gray-500">{t.time}</p>
          <p className="text-gray-500 text-sm">{t.anon}</p>
        </div>

        <button
          onClick={startSurvey}
          disabled={loading}
          className="w-full py-4 px-8 bg-blue-600 text-white text-lg font-semibold rounded-2xl hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? t.loading : t.start}
        </button>

        <div className="flex justify-between items-center">
          <button onClick={() => setLang(null)} className="text-sm text-gray-400 hover:text-gray-600">
            {t.back}
          </button>
          <p className="text-xs text-gray-400">{t.consent}</p>
        </div>
      </div>
    </main>
  )
}
