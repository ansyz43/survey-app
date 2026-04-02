'use client'

import { QuestionOption, Lang } from '@/types/survey'

interface Props {
  options: QuestionOption[]
  value: string[]
  rankTop: number
  lang: Lang
  onChange: (value: string[]) => void
}

export default function Ranking({ options, value, rankTop, lang, onChange }: Props) {
  const handleSelect = (id: string) => {
    if (value.includes(id)) {
      onChange(value.filter((v) => v !== id))
    } else if (value.length < rankTop) {
      onChange([...value, id])
    }
  }

  const getPosition = (id: string) => {
    const idx = value.indexOf(id)
    return idx >= 0 ? idx + 1 : null
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-500 mb-2">
        {lang === 'zh' ? `请按顺序选择前${rankTop}名` : `Выберите ТОП-${rankTop} по порядку`}
      </p>
      {options.map((opt) => {
        const pos = getPosition(opt.id)
        const selected = pos !== null
        const disabled = !selected && value.length >= rankTop
        return (
          <button
            key={opt.id}
            onClick={() => handleSelect(opt.id)}
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
                className={`w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center font-bold text-sm ${
                  selected ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-400'
                }`}
              >
                {pos || '·'}
              </div>
              <span className="text-base">{opt[lang]}</span>
            </div>
          </button>
        )
      })}
    </div>
  )
}
