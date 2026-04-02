'use client'

import { Question, Lang } from '@/types/survey'
import { blockNames } from '@/lib/questions'
import SingleChoice from './SingleChoice'
import MultipleChoice from './MultipleChoice'
import Ranking from './Ranking'
import OpenText from './OpenText'

interface Props {
  question: Question
  answer: string | string[] | null
  onAnswer: (answer: string | string[]) => void
  lang: Lang
  showBlock?: boolean
}

export default function QuestionCard({ question, answer, onAnswer, lang, showBlock }: Props) {
  const blockLabel = blockNames[question.block]

  return (
    <div className="w-full max-w-lg mx-auto">
      {showBlock && (
        <div className="text-sm font-medium text-blue-600 mb-2">
          {blockLabel?.[lang]}
        </div>
      )}
      <h2 className="text-xl font-semibold mb-6 text-gray-900">
        {question[lang]}
      </h2>

      {question.type === 'single' && question.options && (
        <SingleChoice
          options={question.options}
          value={(answer as string) || null}
          lang={lang}
          onChange={(v) => onAnswer(v)}
        />
      )}

      {question.type === 'multiple' && question.options && (
        <MultipleChoice
          options={question.options}
          value={Array.isArray(answer) ? answer : []}
          maxChoices={question.maxChoices}
          lang={lang}
          onChange={(v) => onAnswer(v)}
        />
      )}

      {question.type === 'ranking' && question.options && (
        <Ranking
          options={question.options}
          value={Array.isArray(answer) ? answer : []}
          rankTop={question.rankTop || 3}
          lang={lang}
          onChange={(v) => onAnswer(v)}
        />
      )}

      {question.type === 'open' && (
        <OpenText
          value={typeof answer === 'string' ? answer : ''}
          maxLength={question.maxLength}
          lang={lang}
          onChange={(v) => onAnswer(v)}
        />
      )}
    </div>
  )
}
