/** מקור הקובץ — קובע אמצעי תשלום וברירות מחדל */
export type BankImportSource = 'credit_card' | 'bank_account'

/** עסקה גולמית שחולצה מקובץ — לפני שיוך/החלטות משתמש */
export type ParsedTransaction = {
  /** מזהה ייחודי יציב לשורה (לדה-דופ ולמפתח React) */
  ref: string
  /** YYYY-MM-DD — תאריך העסקה */
  date: string
  /** YYYY-MM-DD — מועד חיוב (אם קיים) */
  chargeDate?: string
  /** שם בית העסק / תיאור */
  description: string
  /** סכום בש״ח (חיוב חיובי; זיכוי שלילי) */
  amount: number
  /** מטבע מקור + סכום מקור אם עסקת מט״ח (לתצוגה) */
  foreignNote?: string
  /** כרטיס / חשבון מקור */
  account?: string
  /** סוג עסקה כפי שהופיע בקובץ (רכישה רגילה / הוראת קבע / זיכוי...) */
  rawType?: string
  /** true = זיכוי/החזר (סכום שלילי) */
  isCredit: boolean
}

/** פירוט סיבת דילוג — להסבר למשתמש למה שורות לא יובאו */
export type SkipReason =
  | 'summary'
  | 'pending'
  | 'empty'
  | 'header_meta'
  | 'card_settlement'
  | 'future'

export const SKIP_REASON_LABEL: Record<SkipReason, string> = {
  summary: 'שורות סיכום / סה״כ',
  pending: 'עסקאות בקליטה (טרם נסלקו)',
  empty: 'שורות ריקות / ללא סכום',
  header_meta: 'כותרות ושורות מידע',
  card_settlement: 'חיוב מרוכז כרטיס אשראי',
  future: 'תנועות עתידיות',
}

export type ParseResult = {
  source: BankImportSource
  /** שם הקובץ שנקרא */
  fileName: string
  transactions: ParsedTransaction[]
  /** שורות שדולגו (סה״כ, בקליטה, כותרות) — לדיווח */
  skipped: number
  /** פירוט סיבות הדילוג — להצגה למשתמש */
  skippedReasons: Partial<Record<SkipReason, number>>
  /** אזהרות פענוח (פורמט לא מזוהה וכו') */
  warnings: string[]
  /** נטו מחושב מהשורות: חיובים − זיכויים */
  parsedNet?: number
  /** סה״כ כפי שמופיע בשורת הסיכום בקובץ הבנק (אם זוהתה) */
  fileTotal?: number
}

/** מנשק parser — מאפשר להוסיף PDF/CSV בעתיד בלי לשנות את האשף */
export interface BankParser {
  id: string
  label: string
  /** מזהה אם הקובץ מתאים ל-parser הזה (לפי כותרות/שם) */
  canParse: (rows: unknown[][], fileName: string) => boolean
  parse: (
    rows: unknown[][],
    fileName: string,
    source: BankImportSource,
  ) => ParseResult
}
