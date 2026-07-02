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
    type: 'one_time',
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

function rowToExpenseInput(
  r: RowState,
  source: BankImportSource,
): NewFinanceExpenseInput {
  const paymentMethod =
    source === 'credit_card' ? 'credit_card' : 'bank_transfer'
  // חודש ההוצאה = תאריך העסקה; למשכורת — חודש משכורת (לא תאריך התשלום)
  const billingMonth =
    r.category === 'salary'
      ? resolveSalaryBillingMonth(r.tx.date, r.note, r.salaryMonth)
      : r.tx.date.slice(0, 7)
  const chargeNote =
    r.tx.chargeDate && r.tx.chargeDate.slice(0, 7) !== billingMonth
      ? `חיוב ${formatDmy(r.tx.chargeDate)}`
      : undefined
  const description =
    [r.note.trim(), chargeNote, r.tx.foreignNote].filter(Boolean).join(' · ') ||
    undefined
  const isSalary = r.category === 'salary'
  const employeeName = isSalary
    ? extractEmployeeFromTransfer(r.tx.description)
    : undefined
  return {
    type: CATEGORY_META[r.category].type,
    amount: Math.abs(r.tx.amount),
    amountIncludesVat: true,
    vatClass: r.vatClass,
    recurring: r.recurring,
    name: isSalary
      ? `משכורת — ${employeeName}`
      : r.name.trim() || r.tx.description,
    ...(isSalary && employeeName ? { employeeName } : {}),
    description,
    billingMonth,
    paidDate: r.tx.date,
    ...(isSalary ? { pnlMonth: billingMonth } : {}),
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
  const [parseWarnings, setParseWarnings] = useState<string[]>([])
  const [savingRef, setSavingRef] = useState<string | null>(null)
  const [pendingDraft, setPendingDraft] = useState<ImportDraft | null>(null)

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
      const next: RowState[] = result.transactions.map((tx) => {
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
          include: !isDuplicate && !tx.isCredit,
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
          salaryMonth:
            category === 'salary'
              ? defaultSalaryMonthFromPayment(tx.date)
              : '',
          suggestion: source,
        }
      })
      setRows(next)
      setFileName(result.fileName)
      setSkippedCount(result.skipped)
      setSkippedReasons(result.skippedReasons ?? {})
      setFileTotal(result.fileTotal ?? null)
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
  const duplicateCount = rows.filter((r) => r.isDuplicate && !r.saved).length
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
    const included = chargeRows
      .filter((r) => r.include)
      .reduce((s, r) => s + Math.abs(r.tx.amount), 0)
    return { count: chargeRows.length, total, included }
  }, [rows])

  /** נטו לפי הקובץ = חיובים − זיכויים (כמו בשורת הסה״כ של הבנק) */
  const netFromRows = chargeStats.total - creditStats.total
  const totalMismatch =
    fileTotal != null && Math.abs(netFromRows - fileTotal) > 1
  const gapAmount =
    fileTotal != null ? Math.abs(netFromRows - fileTotal) : 0

  const dateRange = useMemo(() => {
    const dates = rows.map((r) => r.tx.date).filter(Boolean).sort()
    if (dates.length === 0) return null
    return { from: dates[0], to: dates[dates.length - 1] }
  }, [rows])

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
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-muted)]/40 px-4 py-3 text-[12px]">
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-bold text-[var(--text-dark)]">{fileName}</span>
              <span className="text-[var(--text-mid)]">
                {includedRows.length} נותרו · {savedCount} נשמרו · {duplicateCount}{' '}
                כבר קיימות · {skippedCount} דולגו
              </span>
              {dateRange ? (
                <span className="rounded-full bg-[var(--dash-panel-bg)] px-2.5 py-0.5 font-semibold text-[var(--text-dark)]">
                  טווח: {formatDmy(dateRange.from)} – {formatDmy(dateRange.to)}
                </span>
              ) : null}
              <span className="ms-auto font-extrabold text-[#EF4444]">
                לייבוא: {formatNis(chargeStats.included)}
              </span>
              {fileTotal != null ? (
                <span
                  className={`text-[11px] font-semibold ${
                    totalMismatch ? 'text-[#DC2626]' : 'text-[#10B981]'
                  }`}
                >
                  בקובץ: {formatNis(fileTotal)}
                  {totalMismatch ? ' · לא תואם' : ' · תואם'}
                </span>
              ) : null}
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-[var(--border)] pt-2 text-[11px] text-[var(--text-mid)]">
              <span>
                <span className="font-semibold text-[var(--text-dark)]">
                  {chargeStats.count} חיובים
                </span>{' '}
                · {formatNis(chargeStats.total)}
              </span>
              {creditStats.count > 0 ? (
                <span className="rounded-full bg-[#D1FAE5] px-2 py-0.5 font-semibold text-[#065F46]">
                  {creditStats.count} זיכויים · {formatNis(creditStats.total)}{' '}
                  (לא ייובאו)
                </span>
              ) : (
                <span className="text-[var(--text-light)]">אין זיכויים בקובץ</span>
              )}
              <span className="font-semibold text-[var(--text-dark)]">
                נטו בקובץ: {formatNis(netFromRows)}
                {fileTotal != null && !totalMismatch ? ' ✓' : ''}
              </span>
            </div>

            {totalMismatch ? (
              <div className="mt-2 space-y-1.5 rounded-lg border border-[#FECACA] bg-[#FEF2F2] px-3 py-2 text-[11px]">
                <p className="font-semibold text-[#DC2626]">
                  אין התאמה מדויקת — פער {formatNis(gapAmount)}
                </p>
                <p className="tabular-nums leading-snug text-[#92400E]">
                  {formatNis(chargeStats.total)} חיובים − {formatNis(creditStats.total)}{' '}
                  זיכויים = {formatNis(netFromRows)} · בקובץ {formatNis(fileTotal!)}
                </p>
                <p className="leading-snug text-[#92400E]">
                  ייתכן שזיכוי/החזר מופיע בקובץ כסכום חיובי (ללא סימון זיכוי).
                  גלול ברשימה ובדוק שורות חשודות, או שלח את הקובץ לתיקון הפענוח.
                </p>
                {parseWarnings.map((w) => (
                  <p key={w} className="text-[10px] text-[#B45309]">
                    {w}
                  </p>
                ))}
              </div>
            ) : (
              <p className="mt-2 rounded-lg border border-[#BBF7D0] bg-[#F0FDF4] px-3 py-2 text-[11px] font-semibold text-[#065F46]">
                התאמה מדויקת לקובץ ✓ — {formatNis(chargeStats.total)} חיובים −{' '}
                {formatNis(creditStats.total)} זיכויים = {formatNis(netFromRows)}{' '}
                (כמו בשורת הסה״כ)
              </p>
            )}
            {skippedCount > 0 ? (
              <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-[var(--border)] pt-2 text-[11px] text-[var(--text-mid)]">
                <span className="font-semibold">למה דולגו:</span>
                {(Object.keys(skippedReasons) as SkipReason[]).map((reason) => (
                  <span
                    key={reason}
                    className="rounded-full bg-[var(--dash-panel-bg)] px-2 py-0.5"
                  >
                    {SKIP_REASON_LABEL[reason]}: {skippedReasons[reason]}
                  </span>
                ))}
                <span className="text-[var(--text-light)]">
                  · שורות אלו אינן הוצאות (סיכומים, כותרות ועסקאות שטרם נסלקו)
                </span>
              </div>
            ) : null}
          </div>

          <div className="max-h-[52vh] space-y-2 overflow-y-auto pe-1">
            {rows.map((r, idx) => (
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
                      <span className="tabular-nums font-extrabold text-[#EF4444]">
                        {formatNis(Math.abs(r.tx.amount))}
                      </span>
                      {r.tx.isCredit ? (
                        <span className="rounded-full bg-[#D1FAE5] px-2 py-0.5 text-[10px] font-bold text-[#065F46]">
                          זיכוי
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
                      {r.tx.foreignNote ? ` · ${r.tx.foreignNote}` : ''}
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
                                  if (cat === 'salary') {
                                    patch.salaryMonth = defaultSalaryMonthFromPayment(
                                      r.tx.date,
                                    )
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
                        {r.category === 'salary' ? (
                          <div>
                            <span className="mb-1 block text-[10px] font-bold text-[var(--text-mid)]">
                              חודש משכורת (תקופת עבודה)
                            </span>
                            <input
                              type="month"
                              value={r.salaryMonth}
                              onChange={(e) =>
                                updateRow(idx, { salaryMonth: e.target.value })
                              }
                              className="w-full rounded-xl border border-[var(--border)] bg-[var(--dash-panel-bg)] px-3 py-2 text-right text-[12px] text-[var(--text-dark)] outline-none focus:border-[var(--border-dark)]"
                            />
                            <p className="mt-1 text-[10px] text-[var(--text-mid)]">
                              תשלום בפועל: {formatDmy(r.tx.date)} — לא חייב להיות
                              באותו חודש
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
                          {savingRef === r.tx.ref ? 'שומר…' : 'שמור הוצאה זו'}
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            ))}
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
