'use client'

import type { Lang } from '@/types/survey'

interface Props {
  value: string
  maxLength?: number
  lang: Lang
  onChange: (value: string) => void
}

export default function OpenText({ value, maxLength, lang, onChange }: Props) {
  return (
    <div>
      <textarea
        value={value}
        onChange={(e) => {
          if (maxLength && e.target.value.length > maxLength) return
          onChange(e.target.value)
        }}
        placeholder={lang === 'zh' ? '请在此输入您的回答...' : 'Введите ваш ответ...'}
        className="w-full p-4 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none resize-none text-base min-h-[120px]"
        rows={4}
      />
      {maxLength && (
        <p className="text-sm text-gray-400 mt-1 text-right">
          {value.length}/{maxLength}
        </p>
      )}
    </div>
  )
}
