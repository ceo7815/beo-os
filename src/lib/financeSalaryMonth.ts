import { addMonths } from './financeMonthRange'

/** משכורת — חודש ברירת מחדל = חודש לפני תאריך התשלום (תשלום ביוני = משכורת מאי) */
export function defaultSalaryMonthFromPayment(paidDateYmd: string): string {
  const ym = paidDateYmd.trim().slice(0, 7)
  if (!/^\d{4}-\d{2}$/.test(ym)) return ym
  return addMonths(ym, -1)
}

/**
 * רמז לאשף הייבוא בלבד — מציע סיווג משכורת למשתמש.
 * לא משמש לשיוך חודשי: התבנית רחבה מדי (כל "העברה") ושיוך אוטומטי לפיה
 * היה מזיז הוצאות ספק חודש אחורה.
 */
export function looksLikeSalaryTransfer(description: string): boolean {
  const t = description.trim()
  return (
    /הו["״']?ק/i.test(t) ||
    /^העברה\s/i.test(t) ||
    /משכורת/i.test(t)
  )
}

/** שולף שם מהעברה: "העברה לאמה חן בנק..." → "אמה חן" */
export function extractEmployeeFromTransfer(description: string): string {
  const t = description.trim()
  const hk = t.match(/^הו"ק\s+(?:ל)?(.+?)(?:\s+ל(?:סניף|בנק)|$)/i)
  if (hk?.[1]) return hk[1].trim()
  const tr = t.match(/^העברה\s+ל(.+?)(?:\s+בנק|,|$)/i)
  if (tr?.[1]) return tr[1].trim()
  return t
}

/** מפרק MM.YYYY / MM/YYYY / MM-YYYY מתוך הערה */
export function parseSalaryMonthFromText(text: string): string | null {
  const t = text.trim()
  const m = t.match(/(?:^|\D)(0?[1-9]|1[0-2])[./-](20\d{2})(?:\D|$)/)
  if (!m) return null
  return `${m[2]}-${m[1].padStart(2, '0')}`
}

export function resolveSalaryBillingMonth(
  paidDateYmd: string,
  note?: string,
  explicit?: string,
): string {
  if (explicit?.trim().slice(0, 7).match(/^\d{4}-\d{2}$/)) {
    return explicit.trim().slice(0, 7)
  }
  const fromNote = note ? parseSalaryMonthFromText(note) : null
  if (fromNote) return fromNote
  return defaultSalaryMonthFromPayment(paidDateYmd)
}

/** משכורת — תמיד נספרת לפי חודש המשכורת (billingMonth), לא תאריך התשלום */
export function isSalaryExpense(
  exp: { type?: string },
  typeDef?: { fieldMode?: string },
): boolean {
  return exp.type === 'salary' || typeDef?.fieldMode === 'salary'
}

/** משכורת / העברה לעובד — גם אם נשמרה בטעות כספק */
export function isSalaryLikeExpense(
  exp: {
    type?: string
    name?: string
    description?: string
    employeeName?: string
    paidDate?: string
  },
  typeDef?: { fieldMode?: string },
): boolean {
  if (isSalaryExpense(exp, typeDef)) return true
  if (exp.employeeName?.trim()) return true
  const text = `${exp.description ?? ''} ${exp.name ?? ''}`
  if (/משכורת/i.test(text)) return true
  return false
}

/**
 * תשלומי חובה לרשויות. כמו משכורת, הם משולמים בחודש שאחרי התקופה
 * שעבורה הם נגבים: מע״מ, ניכויים וביטוח לאומי של יוני יורדים ביולי.
 *
 * הצירופים מלאים ולא מילה בודדת, מפני ש«מע״מ» לבדו מופיע בתיאורים
 * רגילים («כולל מע״מ») והיה גורר הוצאות ספק תמימות לחודש הקודם.
 */
const TAX_AUTHORITY_PATTERNS: RegExp[] = [
  /ביטוח\s*לאומי/,
  /מס\s*הכנסה/,
  /נציבות\s*מס/,
  /מקדמות\s*מס/,
  /רשות\s*המי?סים/,
  /(?:^|\s)מ["״']?ה\s*ניכויים/,
  /(?:^|\s)ניכויים(?:\s|$)/,
  /שע["״']?מ(?:\s|$)/,
  /גביית\s*מע["״']?מ/,
  /תשלום\s*מע["״']?מ/,
  /מע["״']?מ\s*לתשלום/,
]

/** תשלום לרשות מס — לפי צירוף מזהה בשם התנועה */
export function looksLikeTaxAuthorityPayment(text: string): boolean {
  const t = text.trim()
  if (!t) return false
  return TAX_AUTHORITY_PATTERNS.some((re) => re.test(t))
}

export function isTaxExpense(
  exp: {
    type?: string
    name?: string
    description?: string
    vatClass?: string
  },
  typeDef?: { id?: string },
): boolean {
  if (exp.type === 'tax' || typeDef?.id === 'tax') return true
  /**
   * רשומות שנוצרו לפני שהיה סוג "מסים" נשמרו כהוצאה כללית, כפטורה או
   * כספק. הן מזוהות לפי שם הרשות — ובלבד שלא נדרש עליהן מע״מ תשומות,
   * שהרי לתשלום לרשות אין חשבונית מס לקיזוז.
   */
  if (exp.vatClass === 'vat_liable') return false
  return looksLikeTaxAuthorityPayment(
    `${exp.name ?? ''} ${exp.description ?? ''}`,
  )
}

const VAT_REMITTANCE_PATTERNS: RegExp[] = [
  /גביית\s*מע["״']?מ/,
  /תשלום\s*מע["״']?מ/,
  /מע["״']?מ\s*לתשלום/,
]

/**
 * תשלום מע״מ לרשות המסים — סילוק חוב מע״מ, לא הוצאה תפעולית.
 *
 * ברווח הנקי המע״מ כבר מטופל דרך הכנסות/הוצאות נטו + שורת «מע״מ לתשלום».
 * אם גם התשלום בפועל נספר בהוצאות, המע״מ נגרע פעמיים מהרווח.
 * ביטוח לאומי / מס הכנסה / ניכויים נשארים ברווח (עלות אמיתית).
 */
export function isVatRemittanceExpense(
  exp: {
    type?: string
    name?: string
    description?: string
    vatClass?: string
  },
  typeDef?: { id?: string },
): boolean {
  if (exp.vatClass === 'vat_liable') return false
  const text = `${exp.name ?? ''} ${exp.description ?? ''}`
  if (VAT_REMITTANCE_PATTERNS.some((re) => re.test(text))) return true

  if (/ביטוח\s*לאומי|מס\s*הכנסה|מקדמות\s*מס|(?:^|\s)ניכויים(?:\s|$)/.test(text)) {
    return false
  }

  const taxType = exp.type === 'tax' || typeDef?.id === 'tax'
  const authority = looksLikeTaxAuthorityPayment(text)
  if (!taxType && !authority) return false

  // אזכור מע״מ, או רשות המסים/שע״מ בלי סימן שזה מס אחר
  return (
    /מע["״']?מ|מעמ/.test(text) ||
    /רשות\s*המי?סים|נציבות\s*מס|שע["״']?מ/.test(text)
  )
}

/** הוצאות שנספרות בחודש שעבורו שולמו, ולא בחודש התשלום */
export function isAccrualExpense(
  exp: {
    type?: string
    name?: string
    description?: string
    employeeName?: string
    vatClass?: string
    paidDate?: string
  },
  typeDef?: { id?: string; fieldMode?: string },
): boolean {
  return isSalaryLikeExpense(exp, typeDef) || isTaxExpense(exp, typeDef)
}

/**
 * חודש שבו ההוצאה נספרת ברווח והפסד.
 * משכורת או מס ששולמו ביולי שייכים ליוני — גם אם התשלום בפועל היה ביולי.
 */
export function expenseAccrualMonth(exp: {
  type?: string
  name?: string
  description?: string
  employeeName?: string
  billingMonth?: string
  pnlMonth?: string
  documentMonth?: string
  isLateDocument?: boolean
  vatClass?: string
  paidDate?: string
}): string {
  const text = `${exp.description ?? ''} ${exp.name ?? ''} ${exp.employeeName ?? ''}`
  const fromText = parseSalaryMonthFromText(text)

  if (fromText && (isSalaryLikeExpense(exp) || /משכורת/i.test(text))) {
    return fromText
  }

  if (isAccrualExpense(exp)) {
    /**
     * נעילת החודש נועדה להגן על דוח המע״מ, ומשכורות ומסים אינם נושאים
     * מע״מ תשומות. כשהנעילה הזיזה רשומה לחודש הפתוח, documentMonth שמר
     * את החודש הנכון — ולכן הוא גובר על pnlMonth שנדרס.
     */
    if (exp.isLateDocument && exp.documentMonth?.trim()) {
      return exp.documentMonth.trim().slice(0, 7)
    }
    if (exp.pnlMonth?.trim()) return exp.pnlMonth.trim().slice(0, 7)
    const bm = (exp.billingMonth ?? '').slice(0, 7)
    const pay = exp.paidDate?.trim().slice(0, 7)
    if (bm && pay && bm < pay) return bm
    if (pay) return defaultSalaryMonthFromPayment(exp.paidDate!)
    if (bm) return bm
  }

  return (exp.billingMonth ?? '').slice(0, 7)
}

/** @deprecated use expenseAccrualMonth */
export function salaryPnlMonth(exp: { billingMonth?: string }): string {
  return (exp.billingMonth ?? '').slice(0, 7)
}
