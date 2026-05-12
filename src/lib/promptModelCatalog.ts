/** קבוצת כלי / מודל — לתצוגה ולצבעי באדג' */
export type PromptModelCategory =
  | 'language'
  | 'image'
  | 'video'
  | 'code'
  | 'automation'
  | 'open_source'

export const PROMPT_MODEL_CATEGORY_LABEL_HE: Record<PromptModelCategory, string> = {
  language: 'שפה',
  image: 'תמונה',
  video: 'וידאו',
  code: 'קוד',
  automation: 'אוטומציות',
  open_source: 'קוד פתוח / API',
}

export type PromptTargetModel =
  | 'gpt-5-5'
  | 'claude-sonnet-opus'
  | 'gemini-3-pro'
  | 'midjourney'
  | 'gpt-image'
  | 'flux'
  | 'sora'
  | 'runway'
  | 'kling'
  | 'cursor'
  | 'antigravity'
  | 'claude-code-windsurf'
  | 'n8n'
  | 'make'
  | 'zapier'
  | 'lindy'
  | 'deepseek'
  | 'mistral'
  | 'llama'
  | 'qwen'
  | 'kodi-ai'
  | 'clodeflair-ai'

export type PromptModelRow = {
  id: PromptTargetModel
  label: string
  category: PromptModelCategory
}

export const PROMPT_MODEL_ROWS: readonly PromptModelRow[] = [
  { id: 'gpt-5-5', label: 'GPT-5.5', category: 'language' },
  { id: 'claude-sonnet-opus', label: 'Claude Sonnet / Opus', category: 'language' },
  { id: 'gemini-3-pro', label: 'Gemini 3 Pro', category: 'language' },
  { id: 'kodi-ai', label: 'Kodi Ai', category: 'language' },
  { id: 'clodeflair-ai', label: 'Clodeflair Ai', category: 'language' },
  { id: 'midjourney', label: 'Midjourney', category: 'image' },
  { id: 'gpt-image', label: 'GPT Image', category: 'image' },
  { id: 'flux', label: 'FLUX', category: 'image' },
  { id: 'sora', label: 'Sora', category: 'video' },
  { id: 'runway', label: 'Runway', category: 'video' },
  { id: 'kling', label: 'Kling', category: 'video' },
  { id: 'cursor', label: 'Cursor', category: 'code' },
  { id: 'antigravity', label: 'Antigravity', category: 'code' },
  { id: 'claude-code-windsurf', label: 'Claude Code / Windsurf', category: 'code' },
  { id: 'n8n', label: 'n8n', category: 'automation' },
  { id: 'make', label: 'Make', category: 'automation' },
  { id: 'zapier', label: 'Zapier', category: 'automation' },
  { id: 'lindy', label: 'Lindy', category: 'automation' },
  { id: 'deepseek', label: 'DeepSeek', category: 'open_source' },
  { id: 'mistral', label: 'Mistral', category: 'open_source' },
  { id: 'llama', label: 'Llama', category: 'open_source' },
  { id: 'qwen', label: 'Qwen', category: 'open_source' },
] as const

export const PROMPT_TARGET_MODELS: readonly PromptTargetModel[] = PROMPT_MODEL_ROWS.map(
  (r) => r.id,
)

export const PROMPT_MODEL_LABEL: Record<PromptTargetModel, string> =
  PROMPT_MODEL_ROWS.reduce(
    (acc, r) => {
      acc[r.id] = r.label
      return acc
    },
    {} as Record<PromptTargetModel, string>,
  )

const MODEL_BY_ID: Map<string, PromptModelRow> = new Map(
  PROMPT_MODEL_ROWS.map((r) => [r.id, r]),
)

export function getPromptModelRow(id: string): PromptModelRow | undefined {
  return MODEL_BY_ID.get(id)
}

/** צבע באדג' לפי קבוצת כלי */
export const PROMPT_MODEL_CATEGORY_COLOR: Record<PromptModelCategory, string> = {
  language: '#0D9488',
  image: '#7C3AED',
  video: '#DB2777',
  code: '#2563EB',
  automation: '#CA8A04',
  open_source: '#4B5563',
}

const LEGACY_TARGET_MODEL: Record<string, PromptTargetModel> = {
  'gpt-4o': 'gpt-5-5',
  'claude-3-5': 'claude-sonnet-opus',
  midjourney: 'midjourney',
}

export function isPromptTargetModel(s: string): s is PromptTargetModel {
  return MODEL_BY_ID.has(s)
}

export function normalizePromptTargetModel(raw: string): PromptTargetModel {
  const t = raw.trim()
  if (isPromptTargetModel(t)) return t
  const mapped = LEGACY_TARGET_MODEL[t]
  if (mapped) return mapped
  return 'gpt-5-5'
}

/** חיפוש חכם: שם תצוגה, מזהה, קטגוריה בעברית ובאנגלית, מילות מפתח */
export function promptModelSearchHaystack(row: PromptModelRow): string {
  const catHe = PROMPT_MODEL_CATEGORY_LABEL_HE[row.category]
  const parts = [
    row.label,
    row.id,
    catHe,
    row.category,
    'api',
    'openai',
    'anthropic',
    'google',
    'gemini',
    'gpt',
    'claude',
    'mj',
    'image',
    'video',
    'code',
    'automation',
    'zapier',
    'make',
    'n8n',
  ]
  const extra =
    row.id === 'kodi-ai'
      ? 'kody kodiai hostinger hpanel'
      : row.id === 'clodeflair-ai'
        ? 'claude flair clodeflair'
        : ''
  return `${parts.join(' ')} ${extra}`.trim().toLowerCase()
}
