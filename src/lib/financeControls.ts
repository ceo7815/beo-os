/**
 * בקרות שלמות — ההוכחה החשבונאית שלא נעלמה תנועה.
 *
 * ההבדל בין "המערכת מציגה מספר" לבין "אפשר לסמוך על המספר" הוא בדיוק כאן:
 * בקרה היא שוויון אריתמטי שחייב להתקיים. כשהוא לא מתקיים, יש נתון חסר או
 * שגוי — ועדיף לדעת על כך מיד ולא בסוף השנה.
 */

/** סף העיגול — פער מתחת לאגורה הוא רעש של חישוב, לא נתון חסר */
const CONTROL_EPSILON = 0.011

export type ControlStatus = 'ok' | 'mismatch' | 'insufficient_data'

export type ControlResult = {
  id: string
  label: string
  status: ControlStatus
  /** מה היה אמור להיות לפי המקור החיצוני */
  expected: number
  /** מה המערכת מחזיקה בפועל */
  actual: number
  /** actual − expected; חיובי = יש לנו יותר מדי, שלילי = חסר לנו */
  difference: number
  /** הסבר בעברית — מה לבדוק כשהבקרה נכשלת */
  detail: string
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function verdict(expected: number, actual: number): ControlStatus {
  return Math.abs(actual - expected) < CONTROL_EPSILON ? 'ok' : 'mismatch'
}

export type BankBalanceControlInput = {
  /** היתרה לפני התנועה הראשונה בתקופה */
  openingBalance?: number
  /** היתרה אחרי התנועה האחרונה בתקופה */
  closingBalance?: number
  /** תנועות התקופה: זיכוי חיובי, חיוב שלילי */
  movements: number[]
}

/**
 * בקרת יתרת בנק: יתרת פתיחה + סך התנועות = יתרת סגירה.
 *
 * זו הבקרה החזקה ביותר על חשבון העו״ש, כי היתרה נקבעת בבנק ולא אצלנו.
 * פער משמעו שתנועה לא יובאה, יובאה פעמיים, או שסכומה שגוי.
 */
export function bankBalanceControl(
  input: BankBalanceControlInput,
): ControlResult {
  const base = {
    id: 'bank_balance',
    label: 'יתרת בנק: פתיחה + תנועות = סגירה',
  }

  if (input.openingBalance == null || input.closingBalance == null) {
    return {
      ...base,
      status: 'insufficient_data',
      expected: 0,
      actual: 0,
      difference: 0,
      detail: 'הקובץ אינו כולל יתרת פתיחה וסגירה — לא ניתן לאמת שלמות',
    }
  }

  const movementSum = round2(input.movements.reduce((s, m) => s + m, 0))
  const expected = round2(input.closingBalance - input.openingBalance)
  const status = verdict(expected, movementSum)
  const difference = round2(movementSum - expected)

  return {
    ...base,
    status,
    expected,
    actual: movementSum,
    difference,
    detail:
      status === 'ok'
        ? `כל התנועות תואמות את שינוי היתרה (${input.movements.length} תנועות)`
        : difference > 0
          ? `עודף של ${Math.abs(difference).toFixed(2)} ₪ — ייתכן שתנועה נספרה פעמיים`
          : `חסר ${Math.abs(difference).toFixed(2)} ₪ — ייתכן שתנועה לא יובאה`,
  }
}

export type CardCycleControlInput = {
  /** תיאור המחזור לתצוגה, למשל "חיוב 2 ביולי" */
  cycleLabel: string
  /** עסקאות המחזור, בסכומים חיוביים; זיכוי מסומן ב-isCredit */
  transactions: { amount: number; isCredit: boolean }[]
  /** סכום החיוב המרוכז כפי שירד בפועל בחשבון הבנק */
  bankChargeAmount?: number
}

/**
 * בקרת מחזור חיוב אשראי: סכום עסקאות המחזור = החיוב המרוכז שירד בבנק.
 *
 * זו הבקרה שקושרת בין שני מקורות נפרדים — קובץ כאל וקובץ העו״ש. כל עוד היא
 * מתקיימת, אי אפשר שעסקה בכרטיס נשמטה מבלי שנדע.
 */
export function cardCycleControl(input: CardCycleControlInput): ControlResult {
  const base = {
    id: `card_cycle:${input.cycleLabel}`,
    label: `מחזור אשראי ${input.cycleLabel}`,
  }

  const cycleSum = round2(
    input.transactions.reduce(
      (s, t) => s + (t.isCredit ? -Math.abs(t.amount) : Math.abs(t.amount)),
      0,
    ),
  )

  if (input.bankChargeAmount == null) {
    return {
      ...base,
      status: 'insufficient_data',
      expected: 0,
      actual: cycleSum,
      difference: 0,
      detail:
        'לא אותר החיוב המרוכז בחשבון הבנק — יש לוודא שקובץ העו״ש מכסה את מועד החיוב',
    }
  }

  const expected = round2(Math.abs(input.bankChargeAmount))
  const status = verdict(expected, cycleSum)
  const difference = round2(cycleSum - expected)

  return {
    ...base,
    status,
    expected,
    actual: cycleSum,
    difference,
    detail:
      status === 'ok'
        ? `${input.transactions.length} עסקאות מסתכמות בדיוק לחיוב בבנק`
        : difference > 0
          ? `עסקאות הכרטיס גבוהות ב-${Math.abs(difference).toFixed(2)} ₪ מהחיוב בבנק`
          : `חסרות עסקאות בסך ${Math.abs(difference).toFixed(2)} ₪ מול החיוב בבנק`,
  }
}

export type CardTransaction = {
  /** YYYY-MM-DD — מועד החיוב המרוכז שאליו משויכת העסקה */
  chargeDate?: string
  /** YYYY-MM-DD — תאריך העסקה, משמש כשאין מועד חיוב */
  date: string
  amount: number
  isCredit: boolean
  /** הכרטיס שבו בוצעה העסקה, למשל "ויזה 0942" */
  account?: string
}

export type BankCardSettlement = {
  /** YYYY-MM-DD — מועד ירידת החיוב המרוכז בבנק */
  date: string
  amount: number
  /** תיאור השורה בעו״ש, למשל "חיוב לכרטיס ויזה 0942" */
  description?: string
}

/** חלון הסטייה בין מועד החיוב בקובץ הכרטיס לירידה בפועל בבנק */
const SETTLEMENT_DATE_TOLERANCE_DAYS = 3

function daysApart(a: string, b: string): number {
  const da = Date.parse(`${a.slice(0, 10)}T12:00:00Z`)
  const db = Date.parse(`${b.slice(0, 10)}T12:00:00Z`)
  if (Number.isNaN(da) || Number.isNaN(db)) return Number.POSITIVE_INFINITY
  return Math.abs(da - db) / (24 * 60 * 60 * 1000)
}

/** מותגי כרטיס — הזיהוי הגס כשאין ארבע ספרות בשני הצדדים */
const CARD_BRANDS: Record<string, RegExp> = {
  visa: /ויזה|visa/i,
  mastercard: /מסטרקארד|mastercard/i,
  diners: /דיינרס|diners/i,
  isracard: /ישראכרט|isracard/i,
  amex: /אמריקן|amex|american express/i,
  max: /\bmax\b|לאומי קארד/i,
}

/** זהות הכרטיס כפי שאפשר לחלץ אותה מטקסט חופשי משני הקבצים */
type CardIdentity = { digits: string | null; brands: string[] }

function cardIdentity(text: string | undefined): CardIdentity {
  const raw = (text ?? '').trim()
  if (!raw) return { digits: null, brands: [] }
  const digitMatches = raw.match(/\d{4}(?!\d)/g)
  const brands = Object.entries(CARD_BRANDS)
    .filter(([, re]) => re.test(raw))
    .map(([name]) => name)
  return { digits: digitMatches?.[digitMatches.length - 1] ?? null, brands }
}

/**
 * עד כמה שתי זהויות כרטיס מתאימות: 2 = אותן ארבע ספרות, 1 = אותו מותג,
 * 0 = אין מידע מזהה בצד אחד, ‎-1 = סתירה ודאית.
 */
function cardAffinity(a: CardIdentity, b: CardIdentity): number {
  if (a.digits && b.digits) return a.digits === b.digits ? 2 : -1
  const sharedBrand = a.brands.some((brand) => b.brands.includes(brand))
  if (sharedBrand) return 1
  if (a.brands.length > 0 && b.brands.length > 0) return -1
  return 0
}

/**
 * מקבץ את עסקאות הכרטיס למחזורי חיוב ומצליב כל מחזור מול החיוב המרוכז
 * שירד בפועל בחשבון הבנק. זהו הקשר היחיד בין שני הקבצים, ולכן זו הבקרה
 * שמונעת מצב שבו עסקה קיימת בכרטיס אך לא בספרים — או להפך.
 *
 * הקיבוץ הוא לפי כרטיס ומועד חיוב גם יחד: לשני כרטיסים יכול להיות אותו
 * מועד חיוב, וערבוב שלהם היה יוצר פער מדומה מול חיוב מרוכז אחד בלבד.
 */
export function buildCardCycleControls(
  transactions: CardTransaction[],
  settlements: BankCardSettlement[],
): ControlResult[] {
  const groups = new Map<
    string,
    { cycle: string; account: string; txs: CardTransaction[] }
  >()
  for (const t of transactions) {
    const cycle = (t.chargeDate ?? t.date).slice(0, 10)
    const account = (t.account ?? '').trim()
    const key = `${account}|${cycle}`
    const group = groups.get(key)
    if (group) group.txs.push(t)
    else groups.set(key, { cycle, account, txs: [t] })
  }

  const settlementIds = settlements.map((s) => cardIdentity(s.description))
  const usedSettlements = new Set<number>()

  return [...groups.values()]
    .sort((a, b) => a.cycle.localeCompare(b.cycle) || a.account.localeCompare(b.account))
    .map(({ cycle, account, txs }) => {
      const groupId = cardIdentity(account)
      let matchIndex = -1
      let bestScore = -1
      let bestGap = Number.POSITIVE_INFINITY
      settlements.forEach((s, i) => {
        if (usedSettlements.has(i)) return
        const gap = daysApart(cycle, s.date)
        if (gap > SETTLEMENT_DATE_TOLERANCE_DAYS) return
        const affinity = cardAffinity(groupId, settlementIds[i]!)
        if (affinity < 0) return
        if (affinity > bestScore || (affinity === bestScore && gap < bestGap)) {
          bestScore = affinity
          bestGap = gap
          matchIndex = i
        }
      })
      if (matchIndex >= 0) usedSettlements.add(matchIndex)

      return cardCycleControl({
        cycleLabel: account ? `${account} · ${cycle}` : cycle,
        transactions: txs,
        ...(matchIndex >= 0
          ? { bankChargeAmount: settlements[matchIndex]!.amount }
          : {}),
      })
    })
}

/**
 * האם מותר להציג את מספר הרווח כמאומת.
 * די בבקרה אחת שנכשלת כדי שהתשובה תהיה לא.
 */
export function controlsPassed(results: ControlResult[]): boolean {
  return results.every((r) => r.status === 'ok')
}

export function failingControls(results: ControlResult[]): ControlResult[] {
  return results.filter((r) => r.status === 'mismatch')
}
