'use client'

import { QuestionOption, Lang } from '@/types/survey'

interface Props {
  options: QuestionOption[]
  value: string | null
  lang: Lang
  onChange: (value: string) => void
}

export default function SingleChoice({ options, value, lang, onChange }: Props) {
  return (
    <div className="space-y-3">
      {options.map((opt) => (
        <button
          key={opt.id}
          onClick={() => onChange(opt.id)}
          className={`w-full text-left p-4 rounded-xl border-2 transition-all ${
            value === opt.id
              ? 'border-blue-500 bg-blue-50 text-blue-900'
              : 'border-gray-200 bg-white hover:border-gray-300'
          }`}
        >
          <span className="text-base">{opt[lang]}</span>
        </button>
      ))}
    </div>
  )
}
