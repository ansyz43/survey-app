'use client'

import { QuestionOption, Lang } from '@/types/survey'

interface Props {
  options: QuestionOption[]
  value: string[]
  maxChoices?: number
  lang: Lang
  onChange: (value: string[]) => void
}

export default function MultipleChoice({ options, value, maxChoices, lang, onChange }: Props) {
  const toggle = (id: string) => {
    if (value.includes(id)) {
      onChange(value.filter((v) => v !== id))
    } else {
      if (maxChoices && value.length >= maxChoices) return
      onChange([...value, id])
    }
  }

  return (
    <div className="space-y-3">
      {maxChoices && (
        <p className="text-sm text-gray-500 mb-2">{lang === 'zh' ? `最多选${maxChoices}个` : `Макс. ${maxChoices}`}</p>
      )}
      {options.map((opt) => {
        const selected = value.includes(opt.id)
        const disabled = !selected && maxChoices !== undefined && value.length >= maxChoices
        return (
          <button
            key={opt.id}
            onClick={() => toggle(opt.id)}
            disabled={disabled}
            className={`w-full text-left p-4 rounded-xl border-2 transition-all ${
              selected
                ? 'border-blue-500 bg-blue-50 text-blue-900'
                : disabled
                ? 'border-gray-100 bg-gray-50 text-gray-400 cursor-not-allowed'
                : 'border-gray-200 bg-white hover:border-gray-300'
            }`}
          >
            <div className="flex items-center gap-3">
              <div
                className={`w-5 h-5 rounded flex-shrink-0 border-2 flex items-center justify-center ${
                  selected ? 'bg-blue-500 border-blue-500' : 'border-gray-300'
                }`}
              >
                {selected && (
                  <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </div>
              <span className="text-base">{opt[lang]}</span>
            </div>
          </button>
        )
      })}
    </div>
  )
}
