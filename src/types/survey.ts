export type QuestionType = 'single' | 'multiple' | 'ranking' | 'open'
export type Lang = 'zh' | 'ru'

export interface SkipRule {
  field: string        // fieldName of the question to check
  equals?: string      // skip if answer === equals
  includes?: string    // skip if answer array includes this value
}

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
  skipIf?: SkipRule     // skip this question if condition met
}

export interface SurveyAnswers {
  [questionId: string]: string | string[]
}
