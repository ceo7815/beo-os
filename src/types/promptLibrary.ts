import type { PromptTargetModel } from '../lib/promptModelCatalog'
export type {
  PromptModelCategory,
  PromptModelRow,
  PromptTargetModel,
} from '../lib/promptModelCatalog'
export {
  PROMPT_MODEL_CATEGORY_COLOR,
  PROMPT_MODEL_CATEGORY_LABEL_HE,
  PROMPT_MODEL_LABEL,
  PROMPT_MODEL_ROWS,
  PROMPT_TARGET_MODELS,
  getPromptModelRow,
  isPromptTargetModel,
  normalizePromptTargetModel,
  promptModelSearchHaystack,
} from '../lib/promptModelCatalog'

/** פריט בספריית הפרומפטים */
export interface PromptLibraryEntry {
  id: string
  title: string
  category: string
  targetModel: PromptTargetModel
  /** גוף הפרומפט */
  content: string
  /** שמות משתנים שזוהו מתוך {{...}} — מחושב בעת שמירה */
  variables: string[]
}
