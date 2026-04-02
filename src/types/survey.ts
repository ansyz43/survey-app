export type QuestionType = 'single' | 'multiple' | 'ranking' | 'open'
export type Lang = 'zh' | 'ru'

export interface QuestionOption {
  id: string
  zh: string
  ru: string
}

export interface Question {
  id: string
  block: string
  zh: string
  ru: string
  type: QuestionType
  options?: QuestionOption[]
  maxChoices?: number
  maxLength?: number
  rankTop?: number
  fieldName: string
}

export interface SurveyAnswers {
  [questionId: string]: string | string[]
}
