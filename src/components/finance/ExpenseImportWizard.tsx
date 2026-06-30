import { useMemo, useState } from 'react'
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
import { suggestExpenseVatClass } from '../../lib/financeExpenseVat'
import { matchMonthlyRecurringExpense } from '../../lib/financeRecurringCatalog'
import { useFinanceExpenses } from '../../hooks/useFinanceExpenses'
import { useFinanceImportRules } from '../../hooks/useFinanceImportRules'
import { useProjects } from '../../hooks/useProjects'
import { useClients } from '../../hooks/useClients'
import type { NewFinanceExpenseInput } from '../../hooks/useFinanceExpenses'
import type { FinanceExpenseVatClass } from '../../types'

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
  suggestion: 'rule' | 'history' | 'none' | 'auto'
}

export function ExpenseImportWizard({
  isOpen,
  onClose,
}: {
  isOpen: boolean
  onClose: () => void
}) {
  const { expenses, addExpensesBatch } = useFinanceExpenses()
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

  function reset() {
    setStep('upload')
    setRows([])
    setFileName('')
    setError('')
    setSkippedCount(0)
    setSkippedReasons({})
    setParsing(false)
    setSaving(false)
  }

  function handleClose() {
    reset()
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
        const category = categoryFromSuggestion(sug.type, vatClass, tx.description)
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
          category,
          vatClass,
          projectId: sug.projectId ?? '',
          clientId: sug.clientId ?? '',
          recurring,
          hostingExpense: looksLikeHostingExpense(tx.description),
          name: sug.name ?? tx.description,
          note: '',
          suggestion: source,
        }
      })
      setRows(next)
      setFileName(result.fileName)
      setSkippedCount(result.skipped)
      setSkippedReasons(result.skippedReasons ?? {})
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

  const includedRows = rows.filter((r) => r.include)
  const includedTotal = includedRows.reduce((s, r) => s + r.tx.amount, 0)
  const duplicateCount = rows.filter((r) => r.isDuplicate).length
  const canSave = includedRows.length > 0

  const dateRange = useMemo(() => {
    const dates = rows.map((r) => r.tx.date).filter(Boolean).sort()
    if (dates.length === 0) return null
    return { from: dates[0], to: dates[dates.length - 1] }
  }, [rows])

  async function handleSave() {
    if (!canSave) return
    setSaving(true)
    try {
      const paymentMethod =
        source === 'credit_card' ? 'credit_card' : 'bank_transfer'
      const inputs: NewFinanceExpenseInput[] = includedRows.map((r) => {
        const billingDate = r.tx.chargeDate || r.tx.date
        const description =
          [r.note.trim(), r.tx.foreignNote].filter(Boolean).join(' · ') ||
          undefined
        return {
          type: CATEGORY_META[r.category].type,
          amount: Math.abs(r.tx.amount),
          amountIncludesVat: true,
          vatClass: r.vatClass,
          recurring: r.recurring,
          name: r.name.trim() || r.tx.description,
          description,
          billingMonth: billingDate.slice(0, 7),
          paidDate: r.tx.date,
          paymentMethod,
          bankRef: r.tx.ref,
          projectId: r.projectId || undefined,
          clientId: r.clientId || undefined,
          hostingExpense: r.hostingExpense || undefined,
        }
      })
      await addExpensesBatch(inputs)

      // למידה — שומר כלל מיפוי לכל בית עסק שהוקצה
      const ruleMap = new Map<string, ImportRule>()
      for (const r of includedRows) {
        const key = merchantKey(r.tx.description)
        if (!key) continue
        ruleMap.set(key, {
          merchantKey: key,
          type: CATEGORY_META[r.category].type,
          vatClass: r.vatClass,
          projectId: r.projectId || undefined,
          clientId: r.clientId || undefined,
          recurring: r.recurring,
        })
      }
      await saveRulesBatch([...ruleMap.values()])
      handleClose()
    } finally {
      setSaving(false)
    }
  }

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
              קבצי .xlsx · .xls · .csv מהבנק / חברת האשראי
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
                {includedRows.length} לייבוא · {duplicateCount} כבר קיימות ·{' '}
                {skippedCount} דולגו
              </span>
              {dateRange ? (
                <span className="rounded-full bg-[var(--dash-panel-bg)] px-2.5 py-0.5 font-semibold text-[var(--text-dark)]">
                  טווח: {formatDmy(dateRange.from)} – {formatDmy(dateRange.to)}
                </span>
              ) : null}
              <span className="ms-auto font-extrabold text-[#EF4444]">
                סה״כ: {formatNis(includedTotal)}
              </span>
            </div>
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
                  r.include
                    ? 'border-[var(--border)] bg-[var(--dash-panel-bg)]'
                    : 'border-dashed border-[var(--border)] bg-[var(--surface-muted)]/30 opacity-70'
                }`}
              >
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={r.include}
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
                      {r.isDuplicate ? (
                        <span className="rounded-full bg-[#FEF3C7] px-2 py-0.5 text-[10px] font-bold text-[#92400E]">
                          כבר יובא
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
                      {r.tx.date}
                      {r.tx.chargeDate ? ` · חיוב ${r.tx.chargeDate}` : ''}
                      {r.tx.account ? ` · ${r.tx.account}` : ''}
                      {r.tx.foreignNote ? ` · ${r.tx.foreignNote}` : ''}
                    </div>

                    {r.include ? (
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
                                onClick={() =>
                                  updateRow(idx, {
                                    category: cat,
                                    vatClass: CATEGORY_META[cat].vatClass,
                                  })
                                }
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
                            onChange={(e) =>
                              updateRow(idx, { note: e.target.value })
                            }
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
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-[var(--border)] pt-3">
            <button
              type="button"
              onClick={reset}
              className="rounded-xl border border-[var(--border)] px-4 py-2.5 text-sm font-semibold text-[var(--text-mid)]"
            >
              קובץ אחר
            </button>
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={!canSave || saving}
              className={`rounded-xl px-5 py-2.5 text-sm font-bold text-white transition ${
                canSave && !saving
                  ? 'bg-[var(--orange)] hover:brightness-95'
                  : 'cursor-not-allowed bg-[var(--text-light)]'
              }`}
            >
              {saving
                ? 'מייבא…'
                : `ייבא ${includedRows.length} הוצאות`}
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}
