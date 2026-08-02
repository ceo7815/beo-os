import { useEffect, useMemo, useState } from 'react'
import { Modal } from '../shared/Modal'
import { HubDropdownSelect } from '../shared/HubDropdownSelect'
import { formatNis } from '../../lib/financeCalc'
import {
  parseBankFile,
  SKIP_REASON_LABEL,
  type BankImportSource,
  type ParsedTransaction,
  type SkipReason,
} from '../../lib/bankImport'
import {
  existingBankRefs,
  merchantKey,
  suggestForTransaction,
  type ImportRule,
} from '../../lib/bankImport/matching'
import {
  clearImportDraft,
  loadImportDraft,
  saveImportDraft,
  type ImportDraft,
} from '../../lib/bankImport/importDraft'
import { suggestExpenseVatClass } from '../../lib/financeExpenseVat'
import {
  defaultSalaryMonthFromPayment,
  extractEmployeeFromTransfer,
  looksLikeSalaryTransfer,
  parseSalaryMonthFromText,
  resolveSalaryBillingMonth,
} from '../../lib/financeSalaryMonth'
import { matchMonthlyRecurringExpense } from '../../lib/financeRecurringCatalog'
import { openMonth, resolveAttributionMonth } from '../../lib/financePeriodLock'
import { bankBalanceControl } from '../../lib/financeControls'
import { formatForeignAmount } from '../../lib/foreignCurrency'
import { useFinanceExpenses } from '../../hooks/useFinanceExpenses'
import { useFinanceImportRules } from '../../hooks/useFinanceImportRules'
import { useProjects } from '../../hooks/useProjects'
import { useClients } from '../../hooks/useClients'
import type { NewFinanceExpenseInput } from '../../hooks/useFinanceExpenses'
import type { FinanceExpense, FinanceExpenseVatClass } from '../../types'

/** קטגוריית-על שהמשתמש בוחר לכל הוצאה */
type ExpenseCategory = 'supplier' | 'salary' | 'tax_vat' | 'bank_fee'

const CATEGORY_META: Record<
  ExpenseCategory,
  { label: string; type: string; vatClass: FinanceExpenseVatClass }
> = {
  supplier: { label: 'ספק חיצוני', type: 'supplier', vatClass: 'vat_liable' },
  salary: { label: 'משכורת', type: 'salary', vatClass: 'statutory' },
  tax_vat: {
    label: 'תשלומי מס ומע״מ',
    type: 'tax',
    vatClass: 'statutory',
  },
  bank_fee: {
    label: 'עמלות בנקים',
    type: 'bank_fee',
    vatClass: 'exempt_supplier',
  },
}

const CATEGORY_ORDER: ExpenseCategory[] = [
  'supplier',
  'salary',
  'tax_vat',
  'bank_fee',
]

/**
 * קטגוריות שנספרות בחודש שעבורו שולמו ולא בחודש התשלום:
 * משכורת יוני יורדת ביולי, וכך גם המע״מ, הניכויים והביטוח הלאומי של יוני.
 */
function isAccrualCategory(category: ExpenseCategory): boolean {
  return category === 'salary' || category === 'tax_vat'
}

const ACCRUAL_MONTH_LABEL: Record<string, string> = {
  salary: 'חודש משכורת (תקופת עבודה)',
  tax_vat: 'החודש שעבורו שולם המס',
}

/** מילות מפתח לזיהוי עמלות בנק/אשראי */
const BANK_FEE_TERMS = [
  'דמי כרטיס',
  'עמלת',
  'עמלה',
  'דמי ניהול',
  'דמי כרטיס בנק',
  'ריבית',
  'דמי חבר',
  'כרטיס בנק מרכנתיל',
  'עמלת מסלול',
  'עמלת פעולה',
]

function looksLikeBankFee(description: string): boolean {
  const t = description.trim()
  return BANK_FEE_TERMS.some((term) => t.includes(term))
}

/** YYYY-MM-DD → DD/MM/YYYY לתצוגה */
function formatDmy(ymd: string): string {
  const [y, m, d] = ymd.split('-')
  if (!y || !m || !d) return ymd
  return `${d}/${m}/${y}`
}

/** מילות מפתח לזיהוי הוצאות אחסון/שרתים/דומיינים */
const HOSTING_EXPENSE_TERMS = [
  'hostinger',
  'hetzner',
  'cloudflare',
  'digitalocean',
  'aws',
  'amazon web',
  'godaddy',
  'namecheap',
  'cpanel',
  'plesk',
  'vercel',
  'netlify',
  'domain',
  'אחסון',
  'דומיין',
  'שרת',
  'שרתים',
]

function looksLikeHostingExpense(description: string): boolean {
  const t = description.trim().toLowerCase()
  return HOSTING_EXPENSE_TERMS.some((term) => t.includes(term))
}

/** גוזר קטגוריה מתוך סיווג מע״מ / סוג שהוצע */
function categoryFromSuggestion(
  type: string | undefined,
  vatClass: FinanceExpenseVatClass | undefined,
  description?: string,
): ExpenseCategory {
  if (type === 'bank_fee') return 'bank_fee'
  if (type === 'salary') return 'salary'
  if (description && looksLikeBankFee(description)) return 'bank_fee'
  if (vatClass === 'statutory') return 'tax_vat'
  return 'supplier'
}

type RowState = {
  tx: ParsedTransaction
  include: boolean
  isDuplicate: boolean
  /** נשמר למערכת — אפשר לחזור ולהמשיך את השאר */
  saved: boolean
  category: ExpenseCategory
  /** סיווג מע״מ בפועל — לספק יכול להיות תשומות/פטור */
  vatClass: FinanceExpenseVatClass
  projectId: string
  clientId: string
  recurring: boolean
  /** true = הוצאת אחסון (שרת/דומיין) */
  hostingExpense: boolean
  name: string
  /** הערה חופשית שהמשתמש יכול לרשום על ההוצאה */
  note: string
  /** חודש משכורת (תקופת עבודה) — רק כש-category=salary */
  salaryMonth: string
  suggestion: 'rule' | 'history' | 'none' | 'auto'
}

/**
 * זיכוי נרשם כהוצאה שלילית ולא כרשומה נפרדת.
 * כך הוא מקזז אוטומטית גם את ההוצאה וגם את מע״מ התשומות באותו חודש,
 * בדיוק כמו החזר על עסקה שבוטלה.
 */
function signedAmount(tx: ParsedTransaction): number {
  const abs = Math.abs(tx.amount)
  return tx.isCredit ? -abs : abs
}

function rowToExpenseInput(
  r: RowState,
  source: BankImportSource,
): NewFinanceExpenseInput {
  const paymentMethod =
    source === 'credit_card' ? 'credit_card' : 'bank_transfer'
  const isSalary = r.category === 'salary'
  const isAccrual = isAccrualCategory(r.category)
  // חודש ההוצאה = תאריך העסקה; למשכורת ולמסים — החודש שעבורו שולמו
  const naturalMonth = isAccrual
    ? resolveSalaryBillingMonth(r.tx.date, r.note, r.salaryMonth)
    : r.tx.date.slice(0, 7)
  /**
   * קובץ שמיובא אחרי שהחודש כבר דווח אינו יכול לשנות אותו למפרע —
   * אבל רק כשמדובר במע״מ. משכורות ומסים אינם נושאים מע״מ תשומות ולכן
   * אינם מושפעים מהנעילה: הם נספרים תמיד בחודש שעבורו שולמו.
   */
  const attribution = isAccrual
    ? { month: naturalMonth, late: false, documentMonth: naturalMonth }
    : resolveAttributionMonth(`${naturalMonth}-15`)
  const billingMonth = attribution.month
  const chargeNote =
    r.tx.chargeDate && r.tx.chargeDate.slice(0, 7) !== billingMonth
      ? `חיוב ${formatDmy(r.tx.chargeDate)}`
      : undefined
  const lateNote = attribution.late
    ? `מאחר — שייך ל${attribution.documentMonth}`
    : undefined
  // סכום המט״ח נשמר בשדות ייעודיים, ולכן אינו חוזר גם בתיאור החופשי
  const description =
    [r.note.trim(), chargeNote, lateNote].filter(Boolean).join(' · ') ||
    undefined
  const employeeName = isSalary
    ? extractEmployeeFromTransfer(r.tx.description)
    : undefined
  return {
    type: CATEGORY_META[r.category].type,
    amount: signedAmount(r.tx),
    amountIncludesVat: true,
    vatClass: r.vatClass,
    recurring: r.tx.isCredit ? false : r.recurring,
    name: isSalary
      ? `משכורת — ${employeeName}`
      : r.tx.isCredit
        ? `זיכוי — ${r.name.trim() || r.tx.description}`
        : r.name.trim() || r.tx.description,
    ...(isSalary && employeeName ? { employeeName } : {}),
    description,
    billingMonth,
    documentDate: r.tx.date,
    documentMonth: attribution.documentMonth,
    ...(attribution.late ? { isLateDocument: true } : {}),
    paidDate: r.tx.date,
    ...(r.tx.chargeDate ? { chargeDate: r.tx.chargeDate } : {}),
    ...(isAccrual ? { pnlMonth: billingMonth } : {}),
    ...(r.tx.currency && r.tx.originalAmount
      ? { currency: r.tx.currency, originalAmount: r.tx.originalAmount }
      : {}),
    paymentMethod,
    bankRef: r.tx.ref,
    projectId: r.projectId || undefined,
    clientId: r.clientId || undefined,
    hostingExpense: r.hostingExpense || undefined,
  }
}

function rowToImportRule(r: RowState): ImportRule | null {
  const key = merchantKey(r.tx.description)
  if (!key) return null
  return {
    merchantKey: key,
    type: CATEGORY_META[r.category].type,
    vatClass: r.vatClass,
    projectId: r.projectId || undefined,
    clientId: r.clientId || undefined,
    recurring: r.recurring,
  }
}

function syncRowsWithExpenses(rows: RowState[], expenses: FinanceExpense[]): RowState[] {
  const refs = existingBankRefs(expenses)
  return rows.map((r) => {
    const alreadyInDb = refs.has(r.tx.ref)
    if (r.saved || alreadyInDb) {
      return { ...r, saved: true, isDuplicate: true, include: false }
    }
    return r
  })
}

export function ExpenseImportWizard({
  isOpen,
  onClose,
}: {
  isOpen: boolean
  onClose: () => void
}) {
  const { expenses, addExpense, addExpensesBatch } = useFinanceExpenses()
  const { rulesByKey, saveRulesBatch } = useFinanceImportRules()
  const { projects } = useProjects()
  const { clients } = useClients()

  const [step, setStep] = useState<'upload' | 'review'>('upload')
  const [source, setSource] = useState<BankImportSource>('credit_card')
  /**
   * חודשים שכבר דווחו למע״מ סגורים לרישום, ולכן ברירת המחדל היא לייבא
   * רק מתחילת החודש הפתוח. כך קובץ שמכסה כמה חודשים אינו מכפיל רשומות
   * מול תקופות שכבר נסגרו.
   */
  const [fromDate, setFromDate] = useState(() => `${openMonth()}-01`)
  const [fileName, setFileName] = useState('')
  const [parsing, setParsing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [rows, setRows] = useState<RowState[]>([])
  const [skippedCount, setSkippedCount] = useState(0)
  const [skippedReasons, setSkippedReasons] = useState<
    Partial<Record<SkipReason, number>>
  >({})
  const [fileTotal, setFileTotal] = useState<number | null>(null)
  const [balanceCheck, setBalanceCheck] = useState<{
    openingBalance?: number
    closingBalance?: number
    movements: number[]
  } | null>(null)
  const [parseWarnings, setParseWarnings] = useState<string[]>([])
  const [savingRef, setSavingRef] = useState<string | null>(null)
  const [pendingDraft, setPendingDraft] = useState<ImportDraft | null>(null)
  const [listFilter, setListFilter] = useState<'todo' | 'done' | 'excluded'>(
    'todo',
  )
  const [detailsOpen, setDetailsOpen] = useState(false)

  /**
   * בכרטיס אשראי זיכוי הוא החזר על עסקה שבוטלה, ולכן הוא חלק מההוצאות
   * ונרשם כהוצאה שלילית. בעו״ש זיכוי הוא לרוב תקבול מלקוח — רישום שלו
   * כהוצאה שלילית היה מנפח את הרווח, ולכן שם הוא אינו מיובא.
   */
  const creditsAreRefunds = source === 'credit_card'

  const projectOptions = useMemo(
    () =>
      [...projects]
        .sort((a, b) => a.name.localeCompare(b.name, 'he'))
        .map((p) => ({ value: p.id, label: p.name })),
    [projects],
  )
  const clientOptions = useMemo(
    () =>
      [...clients]
        .sort((a, b) => a.name.localeCompare(b.name, 'he'))
        .map((c) => ({ value: c.id, label: c.name })),
    [clients],
  )

  const pendingRows = useMemo(
    () => rows.filter((r) => r.include && !r.saved && !r.isDuplicate),
    [rows],
  )
  const savedCount = rows.filter((r) => r.saved).length

  function buildDraftFromState(): ImportDraft {
    return {
      fileName,
      source,
      skippedCount,
      skippedReasons,
      fileTotal,
      parseWarnings,
      rows: rows.map(
        ({
          tx,
          include,
          isDuplicate,
          saved,
          category,
          vatClass,
          projectId,
          clientId,
          recurring,
          hostingExpense,
          name,
          note,
          salaryMonth,
          suggestion,
        }) => ({
          tx,
          include,
          isDuplicate,
          saved,
          category,
          vatClass,
          projectId,
          clientId,
          recurring,
          hostingExpense,
          name,
          note,
          salaryMonth,
          suggestion,
        }),
      ),
      updatedAt: new Date().toISOString(),
    }
  }

  function persistDraftIfNeeded() {
    if (step === 'review' && pendingRows.length > 0) {
      saveImportDraft(buildDraftFromState())
    } else if (step === 'review' && rows.length > 0 && pendingRows.length === 0) {
      clearImportDraft()
    }
  }

  function applyDraft(draft: ImportDraft) {
    setSource(draft.source)
    setFileName(draft.fileName)
    setSkippedCount(draft.skippedCount)
    setSkippedReasons(draft.skippedReasons)
    setFileTotal(draft.fileTotal)
    setParseWarnings(draft.parseWarnings)
    setRows(
      syncRowsWithExpenses(
        draft.rows.map((r) => ({
          ...r,
          vatClass: r.vatClass as FinanceExpenseVatClass,
          salaryMonth:
            r.salaryMonth ||
            (r.category === 'salary'
              ? defaultSalaryMonthFromPayment(r.tx.date)
              : ''),
        })),
        expenses,
      ),
    )
    setStep('review')
    setPendingDraft(null)
    setError('')
  }

  useEffect(() => {
    if (!isOpen) return
    const draft = loadImportDraft()
    if (draft && step === 'upload' && rows.length === 0) {
      setPendingDraft(draft)
    }
  }, [isOpen, step, rows.length])

  useEffect(() => {
    if (!isOpen || step !== 'review' || pendingRows.length === 0) return
    saveImportDraft(buildDraftFromState())
  }, [rows, isOpen, step, pendingRows.length, fileName, source])

  function reset() {
    clearImportDraft()
    setStep('upload')
    setRows([])
    setFileName('')
    setError('')
    setSkippedCount(0)
    setSkippedReasons({})
    setFileTotal(null)
    setParseWarnings([])
    setParsing(false)
    setSaving(false)
    setSavingRef(null)
    setPendingDraft(null)
  }

  function handleClose() {
    persistDraftIfNeeded()
    setStep('upload')
    setRows([])
    setFileName('')
    setError('')
    setSkippedCount(0)
    setSkippedReasons({})
    setFileTotal(null)
    setParseWarnings([])
    setParsing(false)
    setSaving(false)
    setSavingRef(null)
    onClose()
  }

  async function handleFile(file: File) {
    setParsing(true)
    setError('')
    try {
      const result = await parseBankFile(file, source)
      const refs = existingBankRefs(expenses)
      const cutoff = fromDate.trim()
      const inRange = cutoff
        ? result.transactions.filter((tx) => tx.date >= cutoff)
        : result.transactions
      const outOfRange = result.transactions.length - inRange.length
      const next: RowState[] = inRange.map((tx) => {
        const sug = suggestForTransaction(tx, rulesByKey, expenses)
        const isDuplicate = refs.has(tx.ref)

        // קטלוג הוצאות חוזרות — מסמן קבועה ומשפר ברירות מחדל
        const catalogHit = matchMonthlyRecurringExpense({
          name: tx.description,
          amount: Math.abs(tx.amount),
        })

        let source: RowState['suggestion'] = sug.source
        let vatClass = sug.vatClass
        if (!vatClass) {
          vatClass = suggestExpenseVatClass({
            name: tx.description,
            amount: Math.abs(tx.amount),
          })
          if (source === 'none') source = 'auto'
        }
        let category = categoryFromSuggestion(sug.type, vatClass, tx.description)
        if (looksLikeSalaryTransfer(tx.description) && category !== 'bank_fee') {
          category = 'salary'
          vatClass = 'statutory'
          if (source === 'none') source = 'auto'
        }
        // עמלות בנק/אשראי — פטורות ממע״מ ומסומנות קבועות
        if (category === 'bank_fee') {
          vatClass = 'exempt_supplier'
          if (source === 'none') source = 'auto'
        }
        const recurring = sug.recurring ?? (catalogHit != null || category === 'bank_fee')
        if (catalogHit && source === 'none') source = 'auto'

        return {
          tx,
          include: !isDuplicate && (!tx.isCredit || creditsAreRefunds),
          isDuplicate,
          saved: false,
          category,
          vatClass,
          projectId: sug.projectId ?? '',
          clientId: sug.clientId ?? '',
          recurring,
          hostingExpense: looksLikeHostingExpense(tx.description),
          name:
            category === 'salary'
              ? extractEmployeeFromTransfer(tx.description)
              : (sug.name ?? tx.description),
          note: '',
          salaryMonth: isAccrualCategory(category)
            ? defaultSalaryMonthFromPayment(tx.date)
            : '',
          suggestion: source,
        }
      })
      setRows(next)
      setFileName(result.fileName)
      setSkippedCount(result.skipped + outOfRange)
      setSkippedReasons({
        ...(result.skippedReasons ?? {}),
        ...(outOfRange > 0 ? { before_range: outOfRange } : {}),
      })
      setFileTotal(result.fileTotal ?? null)
      setBalanceCheck(
        result.balanceMovements
          ? {
              ...(result.openingBalance != null
                ? { openingBalance: result.openingBalance }
                : {}),
              ...(result.closingBalance != null
                ? { closingBalance: result.closingBalance }
                : {}),
              movements: result.balanceMovements,
            }
          : null,
      )
      setParseWarnings(result.warnings ?? [])
      clearImportDraft()
      if (next.length === 0) {
        setError('לא נמצאו עסקאות בקובץ. ודאו שזהו ייצוא תקין.')
      } else {
        setStep('review')
      }
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'שגיאה בקריאת הקובץ — נסו שוב',
      )
    } finally {
      setParsing(false)
    }
  }

  function updateRow(idx: number, patch: Partial<RowState>) {
    setRows((prev) =>
      prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)),
    )
  }

  const includedRows = pendingRows
  const canSave = includedRows.length > 0

  async function saveRowsAndRules(toSave: RowState[]) {
    if (toSave.length === 0) return false
    if (toSave.length === 1) {
      const ok = await addExpense(rowToExpenseInput(toSave[0], source))
      if (!ok) return false
    } else {
      const written = await addExpensesBatch(
        toSave.map((r) => rowToExpenseInput(r, source)),
      )
      if (written === 0) return false
    }
    const ruleMap = new Map<string, ImportRule>()
    for (const r of toSave) {
      const rule = rowToImportRule(r)
      if (rule) ruleMap.set(rule.merchantKey, rule)
    }
    if (ruleMap.size > 0) await saveRulesBatch([...ruleMap.values()])
    return true
  }

  async function handleSaveRow(idx: number) {
    const row = rows[idx]
    if (!row?.include || row.saved || row.isDuplicate) return
    setSavingRef(row.tx.ref)
    try {
      const ok = await saveRowsAndRules([row])
      if (!ok) return
      setRows((prev) => {
        const next = prev.map((r, i) =>
          i === idx
            ? { ...r, saved: true, isDuplicate: true, include: false }
            : r,
        )
        const stillPending = next.some(
          (r) => r.include && !r.saved && !r.isDuplicate,
        )
        if (!stillPending) {
          clearImportDraft()
        } else {
          saveImportDraft({
            fileName,
            source,
            skippedCount,
            skippedReasons,
            fileTotal,
            parseWarnings,
            rows: next.map(
              ({
                tx,
                include,
                isDuplicate,
                saved,
                category,
                vatClass,
                projectId,
                clientId,
                recurring,
                hostingExpense,
                name,
                note,
                salaryMonth,
                suggestion,
              }) => ({
                tx,
                include,
                isDuplicate,
                saved,
                category,
                vatClass,
                projectId,
                clientId,
                recurring,
                hostingExpense,
                name,
                note,
                salaryMonth,
                suggestion,
              }),
            ),
            updatedAt: new Date().toISOString(),
          })
        }
        return next
      })
    } finally {
      setSavingRef(null)
    }
  }

  async function handleSave() {
    if (!canSave) return
    setSaving(true)
    try {
      const ok = await saveRowsAndRules(includedRows)
      if (!ok) return
      clearImportDraft()
      handleClose()
    } finally {
      setSaving(false)
    }
  }

  const creditStats = useMemo(() => {
    const creditRows = rows.filter((r) => r.tx.isCredit)
    const total = creditRows.reduce((s, r) => s + Math.abs(r.tx.amount), 0)
    return { count: creditRows.length, total }
  }, [rows])

  const chargeStats = useMemo(() => {
    const chargeRows = rows.filter((r) => !r.tx.isCredit)
    const total = chargeRows.reduce((s, r) => s + Math.abs(r.tx.amount), 0)
    return { count: chargeRows.length, total }
  }, [rows])

  /** מה שייכתב בפועל — זיכויים שנבחרו מקזזים את הסכום */
  const importTotal = useMemo(
    () =>
      rows
        .filter((r) => r.include && !r.saved)
        .reduce((s, r) => s + signedAmount(r.tx), 0),
    [rows],
  )

  const includedCredits = useMemo(
    () => rows.filter((r) => r.include && !r.saved && r.tx.isCredit).length,
    [rows],
  )

  /** נטו לפי הקובץ = חיובים − זיכויים (כמו בשורת הסה״כ של הבנק) */
  const netFromRows = chargeStats.total - creditStats.total
  /**
   * כשחתכנו תנועות מוקדמות, הסה״כ של הקובץ מתייחס לטווח רחב יותר ממה
   * שיובא — והשוואה אליו הייתה מדווחת על פער שאינו קיים.
   */
  const trimmedByRange = skippedReasons.before_range ?? 0
  const totalMismatch =
    trimmedByRange === 0 && fileTotal != null && Math.abs(netFromRows - fileTotal) > 1
  const gapAmount =
    fileTotal != null ? Math.abs(netFromRows - fileTotal) : 0

  /** בקרת שלמות מול היתרה בבנק — ההוכחה שאף תנועה לא נשמטה מהקובץ */
  const balanceControl = useMemo(
    () => (balanceCheck ? bankBalanceControl(balanceCheck) : null),
    [balanceCheck],
  )

  const dateRange = useMemo(() => {
    const dates = rows.map((r) => r.tx.date).filter(Boolean).sort()
    if (dates.length === 0) return null
    return { from: dates[0], to: dates[dates.length - 1] }
  }, [rows])

  /**
   * הרשימה מחולקת לשלוש קבוצות ולא מוצגת כערימה אחת.
   * זיכויים וכפילויות אינם ניתנים לייבוא, וכשהם מעורבים בין השורות
   * שדורשות סיווג הם מסתירים את מה שבאמת צריך טיפול.
   */
  const groups = useMemo(() => {
    const todo: number[] = []
    const done: number[] = []
    const excluded: number[] = []
    rows.forEach((r, idx) => {
      if (r.saved) done.push(idx)
      else if (r.isDuplicate) excluded.push(idx)
      else if (r.tx.isCredit && !creditsAreRefunds) excluded.push(idx)
      else todo.push(idx)
    })
    return { todo, done, excluded }
  }, [rows, creditsAreRefunds])

  const visibleIndexes = groups[listFilter]

  /** מספר התנועות שנחסמו כי הן חיוב מרוכז של הכרטיס */
  const cardSettlementSkips = skippedReasons.card_settlement ?? 0

  const controlOk =
    !totalMismatch && balanceControl?.status !== 'mismatch'

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="ייבוא הוצאות מהבנק"
      size="xl"
    >
      {step === 'upload' ? (
        <div className="space-y-5">
          <div>
            <div className="mb-2 text-[12px] font-bold text-[var(--text-mid)]">
              סוג הקובץ
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setSource('credit_card')}
                className={
                  source === 'credit_card'
                    ? 'rounded-xl border-2 border-[var(--orange)] bg-[var(--orange-light)] px-4 py-2.5 text-sm font-bold text-[var(--text-dark)]'
                    : 'rounded-xl border border-[var(--border)] bg-[var(--dash-panel-bg)] px-4 py-2.5 text-sm font-semibold text-[var(--text-mid)]'
                }
              >
                כרטיס אשראי
              </button>
              <button
                type="button"
                onClick={() => setSource('bank_account')}
                className={
                  source === 'bank_account'
                    ? 'rounded-xl border-2 border-[var(--orange)] bg-[var(--orange-light)] px-4 py-2.5 text-sm font-bold text-[var(--text-dark)]'
                    : 'rounded-xl border border-[var(--border)] bg-[var(--dash-panel-bg)] px-4 py-2.5 text-sm font-semibold text-[var(--text-mid)]'
                }
              >
                עובר ושב (עו״ש)
              </button>
            </div>
          </div>

          <div>
            <div className="mb-2 text-[12px] font-bold text-[var(--text-mid)]">
              ייבוא מתאריך
            </div>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--dash-panel-bg)] px-3 py-2.5 text-sm font-semibold text-[var(--text-dark)]"
            />
            <p className="mt-1.5 text-[11px] text-[var(--text-mid)]">
              תנועות מוקדמות יותר לא ייובאו. ברירת המחדל היא תחילת החודש הפתוח,
              כדי לא לרשום לחודשים שכבר דווחו למע״מ.
            </p>
          </div>

          <label
            className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[var(--border)] bg-[var(--surface-muted)]/40 px-6 py-12 text-center transition hover:border-[var(--orange)]"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault()
              const f = e.dataTransfer.files?.[0]
              if (f) void handleFile(f)
            }}
          >
            <span className="text-[14px] font-bold text-[var(--text-dark)]">
              {parsing ? 'קורא קובץ…' : 'גררו קובץ Excel / CSV או לחצו לבחירה'}
            </span>
            <span className="text-[11px] text-[var(--text-mid)]">
              {source === 'credit_card'
                ? 'קבצי .xlsx · .xls · .csv מכאל / דיינרס'
                : 'קבצי .xlsx · .xls · .csv ממרכנתיל דיסקונט (עובר ושב)'}
            </span>
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void handleFile(f)
              }}
            />
          </label>

          {pendingDraft ? (
            <div className="rounded-xl border border-[#BBF7D0] bg-[#F0FDF4] px-4 py-3">
              <p className="text-[13px] font-bold text-[#065F46]">
                יש ייבוא שלא הושלם
              </p>
              <p className="mt-1 text-[12px] text-[#047857]">
                {pendingDraft.fileName} ·{' '}
                {
                  pendingDraft.rows.filter(
                    (r) => r.include && !r.saved && !r.isDuplicate,
                  ).length
                }{' '}
                נותרו לסיווג
                {pendingDraft.rows.some((r) => r.saved) ? (
                  <>
                    {' '}
                    · {pendingDraft.rows.filter((r) => r.saved).length} כבר נשמרו
                  </>
                ) : null}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => applyDraft(pendingDraft)}
                  className="rounded-xl bg-[#059669] px-4 py-2 text-sm font-bold text-white hover:brightness-95"
                >
                  המשך ייבוא
                </button>
                <button
                  type="button"
                  onClick={() => {
                    clearImportDraft()
                    setPendingDraft(null)
                  }}
                  className="rounded-xl border border-[var(--border)] px-4 py-2 text-sm font-semibold text-[var(--text-mid)]"
                >
                  התחל מחדש
                </button>
              </div>
            </div>
          ) : null}

          {error ? (
            <p className="rounded-xl border border-[#FECACA] bg-[#FEF2F2] px-3 py-2.5 text-[12px] text-[#DC2626]">
              {error}
            </p>
          ) : null}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-muted)]/40 px-4 py-3">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <div className="min-w-0">
                <div className="truncate text-[13px] font-bold text-[var(--text-dark)]">
                  {fileName}
                </div>
                {dateRange ? (
                  <div className="mt-0.5 text-[11px] text-[var(--text-mid)]">
                    {formatDmy(dateRange.from)} – {formatDmy(dateRange.to)}
                  </div>
                ) : null}
              </div>
              <div className="text-end">
                <div className="text-[11px] font-semibold text-[var(--text-mid)]">
                  סכום לייבוא
                </div>
                <div className="text-[20px] font-extrabold tabular-nums text-[var(--text-dark)]">
                  {formatNis(importTotal)}
                </div>
                {includedCredits > 0 ? (
                  <div className="text-[11px] font-semibold text-[#059669]">
                    אחרי קיזוז {includedCredits} זיכויים
                  </div>
                ) : null}
              </div>
            </div>

            <p
              className={`mt-3 rounded-lg px-3 py-2 text-[12px] font-semibold ${
                controlOk
                  ? 'border border-[#BBF7D0] bg-[#F0FDF4] text-[#065F46]'
                  : 'border border-[#FECACA] bg-[#FEF2F2] text-[#B91C1C]'
              }`}
            >
              {controlOk
                ? `הקובץ נקרא במלואו — ${chargeStats.count} חיובים${
                    creditStats.count > 0
                      ? ` ו-${creditStats.count} זיכויים`
                      : ''
                  } זוהו, והסכומים תואמים לשורת הסה״כ.`
                : balanceControl?.status === 'mismatch'
                  ? `יתרת הבנק אינה מסתדרת עם התנועות — פער ${formatNis(Math.abs(balanceControl.difference))}. ייתכן שהקובץ יוצא לטווח חלקי.`
                  : `הסכומים אינם תואמים לשורת הסה״כ — פער ${formatNis(gapAmount)}. בדקו את הפירוט לפני הייבוא.`}
            </p>

            {cardSettlementSkips > 0 ? (
              <p className="mt-2 rounded-lg border border-[var(--border)] bg-[var(--dash-panel-bg)] px-3 py-2 text-[12px] text-[var(--text-mid)]">
                <span className="font-bold text-[var(--text-dark)]">
                  חיוב מרוכז של כרטיס האשראי לא יובא
                </span>{' '}
                ({cardSettlementSkips} תנועות) — ההוצאות האלו נכנסות מקובץ פירוט
                הכרטיס, כדי שלא יירשמו פעמיים.
              </p>
            ) : null}

            <button
              type="button"
              onClick={() => setDetailsOpen((v) => !v)}
              className="mt-2 text-[11px] font-semibold text-[var(--text-mid)] underline"
            >
              {detailsOpen ? 'הסתר פירוט' : 'פירוט מלא של קריאת הקובץ'}
            </button>

            {detailsOpen ? (
              <div className="mt-2 space-y-1.5 border-t border-[var(--border)] pt-2 text-[11px] text-[var(--text-mid)]">
                <p className="tabular-nums">
                  {chargeStats.count} חיובים {formatNis(chargeStats.total)} −{' '}
                  {creditStats.count} זיכויים {formatNis(creditStats.total)} ={' '}
                  <span className="font-bold text-[var(--text-dark)]">
                    {formatNis(netFromRows)}
                  </span>
                  {fileTotal != null && trimmedByRange === 0
                    ? ` · בשורת הסה״כ של הבנק ${formatNis(fileTotal)}`
                    : ''}
                </p>
                {trimmedByRange > 0 ? (
                  <p>
                    {trimmedByRange} תנועות לפני {formatDmy(fromDate)} לא יובאו,
                    ולכן אין השוואה לשורת הסה״כ של הקובץ המלא.
                  </p>
                ) : null}
                {balanceControl?.status === 'ok' ? (
                  <p className="tabular-nums">
                    בקרת יתרה: פתיחה{' '}
                    {formatNis(balanceCheck?.openingBalance ?? 0)} + תנועות ={' '}
                    סגירה {formatNis(balanceCheck?.closingBalance ?? 0)} ✓
                  </p>
                ) : balanceControl?.status === 'mismatch' ? (
                  <p className="tabular-nums text-[#B45309]">
                    בקרת יתרה: פתיחה{' '}
                    {formatNis(balanceCheck?.openingBalance ?? 0)} + תנועות{' '}
                    {formatNis(balanceControl.actual)} אמור להגיע לסגירה{' '}
                    {formatNis(balanceCheck?.closingBalance ?? 0)} —{' '}
                    {balanceControl.detail}
                  </p>
                ) : null}
                {skippedCount > 0 ? (
                  <p>
                    <span className="font-semibold">שורות שדולגו:</span>{' '}
                    {(Object.keys(skippedReasons) as SkipReason[])
                      .map(
                        (reason) =>
                          `${SKIP_REASON_LABEL[reason]} (${skippedReasons[reason]})`,
                      )
                      .join(' · ')}
                  </p>
                ) : null}
                {parseWarnings.map((w) => (
                  <p key={w} className="text-[#B45309]">
                    {w}
                  </p>
                ))}
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-1.5">
            {(
              [
                ['todo', 'לסיווג', groups.todo.length],
                ['done', 'נשמרו', groups.done.length],
                ['excluded', 'לא לייבוא', groups.excluded.length],
              ] as const
            ).map(([id, label, count]) => (
              <button
                key={id}
                type="button"
                onClick={() => setListFilter(id)}
                className={
                  listFilter === id
                    ? 'rounded-[10px] border border-[var(--orange)] bg-[var(--orange)] px-3 py-1.5 text-[12px] font-bold text-white'
                    : 'rounded-[10px] border border-[var(--border)] bg-[var(--dash-panel-bg)] px-3 py-1.5 text-[12px] font-semibold text-[var(--text-mid)] hover:bg-[var(--surface-muted)]'
                }
              >
                {label} ({count})
              </button>
            ))}
          </div>

          <div className="max-h-[52vh] space-y-2 overflow-y-auto pe-1">
            {visibleIndexes.length === 0 ? (
              <p className="rounded-xl border border-dashed border-[var(--border)] px-4 py-8 text-center text-[12px] text-[var(--text-mid)]">
                {listFilter === 'todo'
                  ? 'אין הוצאות שממתינות לסיווג בקובץ הזה.'
                  : listFilter === 'done'
                    ? 'עדיין לא נשמרו הוצאות מהקובץ הזה.'
                    : 'כל שורות הקובץ ניתנות לייבוא.'}
              </p>
            ) : null}
            {visibleIndexes.map((idx) => {
              const r = rows[idx]!
              return (
              <div
                key={r.tx.ref}
                className={`rounded-xl border p-3 transition ${
                  r.saved
                    ? 'border-[#BBF7D0] bg-[#F0FDF4]/60'
                    : r.include
                      ? 'border-[var(--border)] bg-[var(--dash-panel-bg)]'
                      : 'border-dashed border-[var(--border)] bg-[var(--surface-muted)]/30 opacity-70'
                }`}
              >
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={r.include}
                    disabled={r.saved}
                    onChange={(e) => updateRow(idx, { include: e.target.checked })}
                    className="mt-1 h-4 w-4 shrink-0 accent-[var(--orange)]"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-[var(--text-dark)]">
                        {r.tx.description}
                      </span>
                      <span
                        className={`tabular-nums font-extrabold ${
                          r.tx.isCredit ? 'text-[#059669]' : 'text-[#EF4444]'
                        }`}
                      >
                        {formatNis(Math.abs(r.tx.amount))}
                      </span>
                      {r.tx.currency && r.tx.originalAmount ? (
                        <span className="rounded-full bg-[#EEF2FF] px-2 py-0.5 text-[10px] font-bold tabular-nums text-[#3730A3]">
                          {formatForeignAmount(
                            r.tx.originalAmount,
                            r.tx.currency,
                          )}
                        </span>
                      ) : null}
                      {r.tx.isCredit ? (
                        <span className="rounded-full bg-[#D1FAE5] px-2 py-0.5 text-[10px] font-bold text-[#065F46]">
                          {creditsAreRefunds
                            ? 'זיכוי — יקוזז מההוצאות'
                            : 'זיכוי — כסף שנכנס, לא הוצאה'}
                        </span>
                      ) : null}
                      {r.isDuplicate && !r.saved ? (
                        <span className="rounded-full bg-[#FEF3C7] px-2 py-0.5 text-[10px] font-bold text-[#92400E]">
                          כבר יובא
                        </span>
                      ) : null}
                      {r.saved ? (
                        <span className="rounded-full bg-[#D1FAE5] px-2 py-0.5 text-[10px] font-bold text-[#065F46]">
                          נשמר ✓
                        </span>
                      ) : null}
                      {r.suggestion === 'rule' ? (
                        <span className="rounded-full bg-[#DBEAFE] px-2 py-0.5 text-[10px] font-bold text-[#1E40AF]">
                          כלל נלמד
                        </span>
                      ) : r.suggestion === 'history' ? (
                        <span className="rounded-full bg-[#E0E7FF] px-2 py-0.5 text-[10px] font-bold text-[#3730A3]">
                          זוהה מהיסטוריה
                        </span>
                      ) : r.suggestion === 'auto' ? (
                        <span className="rounded-full bg-[#F1F5F9] px-2 py-0.5 text-[10px] font-bold text-[#475569]">
                          זוהה אוטומטית
                        </span>
                      ) : null}
                      {r.recurring ? (
                        <span className="rounded-full bg-[#FCE7F3] px-2 py-0.5 text-[10px] font-bold text-[#9D174D]">
                          קבועה
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-0.5 text-[11px] text-[var(--text-mid)]">
                      עסקה {formatDmy(r.tx.date)}
                      {r.tx.chargeDate
                        ? source === 'bank_account'
                          ? ` · יום ערך ${formatDmy(r.tx.chargeDate)}`
                          : ` · חיוב בכרטיס ${formatDmy(r.tx.chargeDate)}`
                        : ''}
                      · חודש הוצאה: {r.tx.date.slice(5, 7)}/{r.tx.date.slice(0, 4)}
                      {r.tx.account && !r.tx.account.includes('/') ? (
                        <span> · {r.tx.account}</span>
                      ) : r.tx.account ? (
                        <span> · אסמכתה {r.tx.account}</span>
                      ) : null}
                      {r.tx.currency && r.tx.originalAmount
                        ? ` · שולם ${formatForeignAmount(r.tx.originalAmount, r.tx.currency)} והומר לשקלים`
                        : ''}
                    </div>

                    {r.include && !r.saved ? (
                      <div className="mt-3 space-y-2.5">
                        <div>
                          <span className="mb-1 block text-[10px] font-bold text-[var(--text-mid)]">
                            סוג הוצאה
                          </span>
                          <div className="flex flex-wrap gap-1.5">
                            {CATEGORY_ORDER.map((cat) => (
                              <button
                                key={cat}
                                type="button"
                                onClick={() => {
                                  const patch: Partial<RowState> = {
                                    category: cat,
                                    vatClass: CATEGORY_META[cat].vatClass,
                                  }
                                  if (isAccrualCategory(cat)) {
                                    patch.salaryMonth = defaultSalaryMonthFromPayment(
                                      r.tx.date,
                                    )
                                  }
                                  if (cat === 'salary') {
                                    patch.name = extractEmployeeFromTransfer(
                                      r.tx.description,
                                    )
                                  }
                                  updateRow(idx, patch)
                                }}
                                className={
                                  r.category === cat
                                    ? 'rounded-lg border-2 border-[var(--orange)] bg-[var(--orange-light)] px-3 py-1.5 text-[12px] font-bold text-[var(--text-dark)]'
                                    : 'rounded-lg border border-[var(--border)] bg-[var(--dash-panel-bg)] px-3 py-1.5 text-[12px] font-semibold text-[var(--text-mid)]'
                                }
                              >
                                {CATEGORY_META[cat].label}
                              </button>
                            ))}
                          </div>
                        </div>
                        {isAccrualCategory(r.category) ? (
                          <div>
                            <span className="mb-1 block text-[10px] font-bold text-[var(--text-mid)]">
                              {ACCRUAL_MONTH_LABEL[r.category]}
                            </span>
                            <input
                              type="month"
                              value={r.salaryMonth}
                              onChange={(e) =>
                                updateRow(idx, { salaryMonth: e.target.value })
                              }
                              className="w-full rounded-xl border border-[var(--border)] bg-[var(--dash-panel-bg)] px-3 py-2 text-right text-[12px] text-[var(--text-dark)] outline-none focus:border-[var(--border-dark)]"
                            />
                            <p className="mt-1 text-[10px] font-semibold text-[#B45309]">
                              שולם {formatDmy(r.tx.date)} · משויך לחודש{' '}
                              {r.salaryMonth || '—'}
                            </p>
                          </div>
                        ) : null}
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                          <div>
                            <span className="mb-1 block text-[10px] font-bold text-[var(--text-mid)]">
                              פרויקט
                            </span>
                            <HubDropdownSelect
                              value={r.projectId}
                              onChange={(v) => updateRow(idx, { projectId: v })}
                              options={projectOptions}
                              emptyOption={{ label: 'ללא פרויקט' }}
                              searchable
                              searchPlaceholder="חיפוש פרויקט…"
                            />
                          </div>
                          <div>
                            <span className="mb-1 block text-[10px] font-bold text-[var(--text-mid)]">
                              לקוח
                            </span>
                            <HubDropdownSelect
                              value={r.clientId}
                              onChange={(v) => updateRow(idx, { clientId: v })}
                              options={clientOptions}
                              emptyOption={{ label: 'ללא לקוח' }}
                              searchable
                              searchPlaceholder="חיפוש לקוח…"
                            />
                          </div>
                        </div>
                        <div>
                          <span className="mb-1 block text-[10px] font-bold text-[var(--text-mid)]">
                            הערה (אופציונלי)
                          </span>
                          <input
                            type="text"
                            value={r.note}
                            onChange={(e) => {
                              const note = e.target.value
                              const patch: Partial<RowState> = { note }
                              if (r.category === 'salary') {
                                const fromNote = parseSalaryMonthFromText(note)
                                if (fromNote) patch.salaryMonth = fromNote
                              }
                              updateRow(idx, patch)
                            }}
                            placeholder="הוסיפו הערה על ההוצאה…"
                            className="w-full rounded-xl border border-[var(--border)] bg-[var(--dash-panel-bg)] px-3 py-2 text-right text-[12px] text-[var(--text-dark)] outline-none focus:border-[var(--border-dark)]"
                          />
                        </div>
                        <div className="flex flex-wrap items-center gap-4">
                          {!r.tx.isCredit ? (
                            <label className="flex items-center gap-2 text-[12px] font-semibold text-[var(--text-dark)]">
                              <input
                                type="checkbox"
                                checked={r.recurring}
                                onChange={(e) =>
                                  updateRow(idx, { recurring: e.target.checked })
                                }
                                className="h-4 w-4 accent-[var(--orange)]"
                              />
                              הוצאה קבועה (חוזרת כל חודש)
                            </label>
                          ) : null}
                          <label className="flex items-center gap-2 text-[12px] font-semibold text-[var(--text-dark)]">
                            <input
                              type="checkbox"
                              checked={r.hostingExpense}
                              onChange={(e) =>
                                updateRow(idx, {
                                  hostingExpense: e.target.checked,
                                })
                              }
                              className="h-4 w-4 accent-[#0EA5E9]"
                            />
                            הוצאת אחסון (שרת/דומיין)
                          </label>
                          {r.category === 'supplier' ? (
                            <label className="flex items-center gap-2 text-[12px] font-semibold text-[var(--text-dark)]">
                              <input
                                type="checkbox"
                                checked={r.vatClass === 'vat_liable'}
                                onChange={(e) =>
                                  updateRow(idx, {
                                    vatClass: e.target.checked
                                      ? 'vat_liable'
                                      : 'exempt_supplier',
                                  })
                                }
                                className="h-4 w-4 accent-[var(--orange)]"
                              />
                              חשבונית מס (מע״מ לקיזוז)
                            </label>
                          ) : null}
                        </div>
                        <button
                          type="button"
                          onClick={() => void handleSaveRow(idx)}
                          disabled={savingRef === r.tx.ref || saving}
                          className={`w-full rounded-xl border-2 px-4 py-2.5 text-sm font-bold transition ${
                            savingRef === r.tx.ref
                              ? 'cursor-wait border-[var(--border)] text-[var(--text-mid)]'
                              : 'border-[var(--orange)] bg-[var(--orange-light)] text-[var(--text-dark)] hover:brightness-95'
                          }`}
                        >
                          {savingRef === r.tx.ref
                            ? 'שומר…'
                            : r.tx.isCredit
                              ? 'שמור זיכוי זה'
                              : 'שמור הוצאה זו'}
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
              )
            })}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] pt-3">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={reset}
                className="rounded-xl border border-[var(--border)] px-4 py-2.5 text-sm font-semibold text-[var(--text-mid)]"
              >
                קובץ אחר
              </button>
              {pendingRows.length > 0 ? (
                <button
                  type="button"
                  onClick={handleClose}
                  className="rounded-xl border border-[var(--border)] px-4 py-2.5 text-sm font-semibold text-[var(--text-dark)]"
                >
                  שמור והמשך אחר כך
                </button>
              ) : null}
            </div>
            {canSave ? (
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={saving || savingRef != null}
                className={`rounded-xl px-5 py-2.5 text-sm font-bold text-white transition ${
                  !saving && savingRef == null
                    ? 'bg-[var(--orange)] hover:brightness-95'
                    : 'cursor-not-allowed bg-[var(--text-light)]'
                }`}
              >
                {saving
                  ? 'מייבא…'
                  : `ייבא את כל הנותרות (${includedRows.length})`}
              </button>
            ) : savedCount > 0 ? (
              <button
                type="button"
                onClick={handleClose}
                className="rounded-xl bg-[#059669] px-5 py-2.5 text-sm font-bold text-white hover:brightness-95"
              >
                סיום — הכל נשמר
              </button>
            ) : null}
          </div>
        </div>
      )}
    </Modal>
  )
}
