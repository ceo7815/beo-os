/** ערכים לשדה «סוג ספק» — בחירה מרשימה סגורה */
export const SUPPLIER_TYPE_OPTIONS = [
  'מפתח אתרים',
  'איש SEO',
  'מנהל Google Ads',
  'מנהל Meta Ads',
  'קופירייטר',
  'מעצב גרפי דיגיטלי',
  'מנהל רשתות חברתיות',
  'כותב תוכן',
  'מנהל שיווק דיגיטלי',
  'אנליסט דיגיטלי',
  'מעצב UX/UI',
  'מנהל אימייל מרקטינג',
  'יוצר תוכן וידאו',
  'מנהל TikTok Ads',
  'מומחה Automation',
  'מנהל אי־קומרס',
  'מומחה CRO',
  'מנהל Affiliate',
  'מומחה LinkedIn',
  'מנהל Growth Hacking',
] as const

export type SupplierTypeOption = (typeof SUPPLIER_TYPE_OPTIONS)[number]

const allowedSet = new Set<string>(SUPPLIER_TYPE_OPTIONS as unknown as string[])

/** נרמול לשמירה ב-Firestore — רק ערכים מהרשימה, ללא כפילויות */
export function normalizeSupplierTypesForSave(input: string[] | undefined): string[] {
  if (!input?.length) return []
  const out: string[] = []
  for (const v of input) {
    const t = typeof v === 'string' ? v.trim() : ''
    if (!t || !allowedSet.has(t) || out.includes(t)) continue
    out.push(t)
  }
  return out
}

/** קריאה ממסמך Firestore — תומך ב־supplierTypes (מערך) או בשדה ישן supplierType */
export function parseFirestoreSupplierTypes(
  x: Record<string, unknown>,
): string[] | undefined {
  const raw = x.supplierTypes
  if (Array.isArray(raw)) {
    const out: string[] = []
    for (const v of raw) {
      if (typeof v !== 'string') continue
      const t = v.trim()
      if (!t || out.includes(t)) continue
      if (allowedSet.has(t)) out.push(t)
    }
    return out.length ? out : undefined
  }
  const leg = x.supplierType
  if (typeof leg === 'string' && leg.trim()) {
    const t = leg.trim()
    if (allowedSet.has(t)) return [t]
    return [t]
  }
  return undefined
}
