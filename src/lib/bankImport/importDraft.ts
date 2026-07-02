import type { BankImportSource, ParsedTransaction, SkipReason } from './types'

const DRAFT_KEY = 'hub-pos:expense-import-draft'

export type ImportDraftRow = {
  tx: ParsedTransaction
  include: boolean
  isDuplicate: boolean
  saved: boolean
  category: 'supplier' | 'salary' | 'tax_vat' | 'bank_fee'
  vatClass: string
  projectId: string
  clientId: string
  recurring: boolean
  hostingExpense: boolean
  name: string
  note: string
  salaryMonth?: string
  suggestion: 'rule' | 'history' | 'none' | 'auto'
}

export type ImportDraft = {
  fileName: string
  source: BankImportSource
  skippedCount: number
  skippedReasons: Partial<Record<SkipReason, number>>
  fileTotal: number | null
  parseWarnings: string[]
  rows: ImportDraftRow[]
  updatedAt: string
}

export function loadImportDraft(): ImportDraft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as ImportDraft
    if (!parsed?.fileName || !Array.isArray(parsed.rows)) return null
    return parsed
  } catch {
    return null
  }
}

export function saveImportDraft(draft: ImportDraft): void {
  try {
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({ ...draft, updatedAt: new Date().toISOString() }),
    )
  } catch {
    /* quota / private mode */
  }
}

export function clearImportDraft(): void {
  try {
    localStorage.removeItem(DRAFT_KEY)
  } catch {
    /* ignore */
  }
}
