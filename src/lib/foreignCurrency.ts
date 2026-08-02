/**
 * עסקאות במטבע חוץ.
 *
 * חברת האשראי מחייבת בשקלים לפי שער שהיא קובעת, אבל החשבונית של הספק
 * נקובה במטבע המקור. בלי לשמור את הסכום המקורי אי אפשר להצליב ביניהם:
 * חשבונית על 20$ לעולם לא תיראה זהה לחיוב של 74.32₪.
 */

export const CURRENCY_SYMBOL: Record<string, string> = {
  USD: '$',
  EUR: '€',
  GBP: '£',
  ILS: '₪',
}

const SYMBOL_TO_CODE: Record<string, string> = {
  $: 'USD',
  '€': 'EUR',
  '£': 'GBP',
  '₪': 'ILS',
}

const WORD_TO_CODE: [RegExp, string][] = [
  [/דולר|usd/i, 'USD'],
  [/אירו|יורו|eur/i, 'EUR'],
  [/שטרלינג|לירה|gbp/i, 'GBP'],
  [/שקל|ש״ח|ש"ח|ils|nis/i, 'ILS'],
]

export function normalizeCurrencyCode(raw: string | undefined): string | undefined {
  const s = raw?.trim()
  if (!s) return undefined
  if (SYMBOL_TO_CODE[s]) return SYMBOL_TO_CODE[s]
  const upper = s.toUpperCase()
  if (/^[A-Z]{3}$/.test(upper)) return upper
  for (const [re, code] of WORD_TO_CODE) {
    if (re.test(s)) return code
  }
  return undefined
}

export function isForeignCurrencyCode(code: string | undefined): boolean {
  const c = normalizeCurrencyCode(code)
  return !!c && c !== 'ILS'
}

export type ForeignAmount = {
  currency: string
  amount: number
}

/**
 * מחלץ מטבע וסכום מהערת חברת האשראי, למשל:
 * "סכום העסקה הוא 20.00 $" · "$20.00" · "20 דולר" · "USD 15.99"
 * מוחזר רק כשהמטבע אינו שקל — חיוב שקלי אינו זקוק לתרגום.
 */
export function parseForeignNote(
  note: string | undefined,
): ForeignAmount | undefined {
  if (!note?.trim()) return undefined
  const text = note.replace(/\u00a0/g, ' ')
  const patterns: RegExp[] = [
    // 20.00 $ · 20 USD · 20 דולר
    /(\d[\d,]*(?:\.\d+)?)\s*([$€£₪]|USD|EUR|GBP|ILS|NIS|דולר|אירו|יורו|שטרלינג)/i,
    // $20.00 · €15.99
    /([$€£])\s*(\d[\d,]*(?:\.\d+)?)/,
    // USD 20.00 · EUR 15
    /\b(USD|EUR|GBP)\s*(\d[\d,]*(?:\.\d+)?)/i,
  ]
  for (const re of patterns) {
    const m = text.match(re)
    if (!m) continue
    const a = m[1]!
    const b = m[2]!
    const amountRaw = /\d/.test(a) ? a : b
    const currencyRaw = /\d/.test(a) ? b : a
    const amount = Number(amountRaw.replace(/,/g, ''))
    const currency = normalizeCurrencyCode(currencyRaw)
    if (!Number.isFinite(amount) || amount <= 0) continue
    if (!currency || currency === 'ILS') continue
    return { currency, amount }
  }
  return undefined
}

/** מט״ח שמור בשדות, או מחולץ מתיאור/הערה ישנים */
export function resolveExpenseForeign(exp: {
  currency?: string
  originalAmount?: number
  description?: string
  name?: string
}): ForeignAmount | undefined {
  if (
    isForeignCurrencyCode(exp.currency) &&
    typeof exp.originalAmount === 'number' &&
    Number.isFinite(exp.originalAmount) &&
    exp.originalAmount !== 0
  ) {
    return {
      currency: normalizeCurrencyCode(exp.currency)!,
      amount: Math.abs(exp.originalAmount),
    }
  }
  return (
    parseForeignNote(exp.description) ?? parseForeignNote(exp.name)
  )
}

export function formatForeignAmount(
  amount: number,
  currency: string | undefined,
): string {
  const code = normalizeCurrencyCode(currency) ?? currency ?? ''
  const symbol = CURRENCY_SYMBOL[code]
  const abs = Math.abs(amount)
  const digits = Number.isInteger(abs) ? 0 : 2
  const num = abs.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: 2,
  })
  const sign = amount < 0 ? '-' : ''
  return symbol ? `${sign}${symbol}${num}` : `${sign}${num} ${code}`.trim()
}

/**
 * הסכום שחשבונית אמורה להיות מושווית מולו.
 *
 * בעסקת מט״ח זה סכום המקור — הוא היחיד שיכול להיות זהה לנקוב בחשבונית,
 * כי החיוב בשקלים כולל את שער ההמרה ואת עמלת הכרטיס.
 */
export function documentComparisonAmounts(exp: {
  amount: number
  currency?: string
  originalAmount?: number
}): number[] {
  const out = [Math.abs(exp.amount)]
  if (isForeignCurrencyCode(exp.currency) && exp.originalAmount) {
    out.push(Math.abs(exp.originalAmount))
  }
  return out
}
