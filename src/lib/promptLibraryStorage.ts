import type { PromptLibraryEntry } from '../types/promptLibrary'
import { normalizePromptTargetModel } from './promptModelCatalog'
import { extractPromptVariables } from './extractPromptVariables'

const STORAGE_KEY = 'hub_pos_prompt_library_v1'

export function loadPromptLibraryFromStorage(): PromptLibraryEntry[] | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return null
    const out: PromptLibraryEntry[] = []
    for (const x of parsed) {
      const e = normalizeStoredEntry(x)
      if (e) out.push(e)
    }
    return out
  } catch {
    return null
  }
}

export function savePromptLibraryToStorage(entries: PromptLibraryEntry[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries))
  } catch {
    // אחסון מלא / מצב פרטי
  }
}

function normalizeStoredEntry(x: unknown): PromptLibraryEntry | null {
  if (!x || typeof x !== 'object') return null
  const o = x as Record<string, unknown>
  if (
    typeof o.id !== 'string' ||
    typeof o.title !== 'string' ||
    typeof o.category !== 'string' ||
    typeof o.targetModel !== 'string' ||
    typeof o.content !== 'string'
  ) {
    return null
  }
  const content = o.content
  const variables = Array.isArray(o.variables)
    ? o.variables.filter((v): v is string => typeof v === 'string')
    : extractPromptVariables(content)
  const rawModel = o.targetModel
  const targetModel = normalizePromptTargetModel(String(rawModel))
  return {
    id: o.id,
    title: o.title,
    category: o.category,
    targetModel,
    content,
    variables,
  }
}
