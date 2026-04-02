'use client'

import { useEffect, useState } from 'react'
import type { Lang } from '@/types/survey'

const text = {
  zh: { title: '感谢您的参与！', body: '您的回答对我们的研究非常重要。感谢您花时间完成本问卷。', close: '您现在可以关闭此页面' },
  ru: { title: 'Спасибо за участие!', body: 'Ваши ответы очень важны для нашего исследования. Спасибо, что уделили время.', close: 'Теперь вы можете закрыть эту страницу' },
}

export default function ThankYou() {
  const [lang, setLang] = useState<Lang>('zh')
  useEffect(() => {
    const stored = sessionStorage.getItem('surveyLang') as Lang
    if (stored === 'ru' || stored === 'zh') setLang(stored)
  }, [])

  const t = text[lang]
  return (
    <main className="flex flex-col items-center justify-center min-h-screen px-6 py-12">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="text-6xl">🎉</div>
        <h1 className="text-3xl font-bold text-gray-900">{t.title}</h1>
        <p className="text-lg text-gray-600">{t.body}</p>
        <div className="pt-4">
          <p className="text-sm text-gray-400">{t.close}</p>
        </div>
      </div>
    </main>
  )
}
