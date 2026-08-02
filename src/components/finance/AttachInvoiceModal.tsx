import { useEffect, useMemo, useState } from 'react'
import { Modal } from '../shared/Modal'
import { DocumentPreview } from './DocumentPreview'
import { formatNis, monthLabelHe } from '../../lib/financeCalc'
import { formatDateIL } from '../../lib/dates'
import {
  attributionForInvoiceDate,
  checkInvoiceDate,
} from '../../lib/invoiceDateAttribution'
import {
  EXPENSE_DOCUMENT_ACCEPT,
  uploadExpenseDocument,
  validateExpenseDocument,
} from '../../lib/expenseDocumentStorage'
import { amountsIdentical } from '../../lib/financeMatchRules'
import {
  formatForeignAmount,
  resolveExpenseForeign,
} from '../../lib/foreignCurrency'
import { reconciliationRowDate } from '../../lib/expenseReconciliation'
import { readInvoiceFile, type InvoiceReadResult } from '../../lib/pdfText'
import { useFinanceExpenses } from '../../hooks/useFinanceExpenses'
import type { FinanceExpense } from '../../types'

function merchantLabel(exp: FinanceExpense): string {
  return (
    exp.supplierName?.trim() ||
    exp.name?.trim() ||
    exp.description?.trim() ||
    'ללא שם'
  )
}

/** ערך שנקרא מהמסמך — הצבע מבטא כמה הזיהוי בטוח */
function ReadChip({
  label,
  confidence,
}: {
  label: string
  confidence: number
}) {
  const tone =
    confidence >= 80
      ? 'bg-[#D1FAE5] text-[#065F46]'
      : confidence >= 50
        ? 'bg-[#DBEAFE] text-[#1E40AF]'
        : 'bg-[#FEF3C7] text-[#92400E]'
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${tone}`}>
      {label}
    </span>
  )
}

/**
 * הצמדת חשבונית ספק לתשלום שכבר קיים בספרים.
 *
 * הסכום הנקוב בחשבונית נבדק מול הסכום שירד בבנק, לאגורה. אישור של פער
 * דורש פעולה מפורשת — כך שהצמדה שגויה של מסמך לשורה אחרת אינה יכולה
 * לקרות בהיסח הדעת.
 */
export function AttachInvoiceModal({
  expense,
  onClose,
}: {
  expense: FinanceExpense | null
  onClose: () => void
}) {
  const { updateExpense } = useFinanceExpenses()
  const [file, setFile] = useState<File | null>(null)
  const [invoiceNumber, setInvoiceNumber] = useState('')
  const [invoiceDate, setInvoiceDate] = useState('')
  const [documentAmount, setDocumentAmount] = useState('')
  const [acceptGap, setAcceptGap] = useState(false)
  const [acceptDateGap, setAcceptDateGap] = useState(false)
  const [expenseNote, setExpenseNote] = useState('')
  const [progress, setProgress] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [reading, setReading] = useState(false)
  const [read, setRead] = useState<InvoiceReadResult | null>(null)

  useEffect(() => {
    setFile(null)
    setInvoiceNumber(expense?.invoiceNumber ?? '')
    // בעסקת מט״ח נפתח עם סכום המקור — זה מה שכתוב בחשבונית שתועלה
    const fx = expense ? resolveExpenseForeign(expense) : undefined
    const suggested = fx
      ? fx.amount
      : expense
        ? Math.abs(expense.amount)
        : null
    setDocumentAmount(suggested == null ? '' : String(suggested))
    // ברירת המחדל היא מועד התשלום; שינוי לתאריך החשבונית מזיז את החודש
    setInvoiceDate(
      expense?.documentDate ?? (expense ? reconciliationRowDate(expense) : ''),
    )
    setExpenseNote(expense?.expenseNote ?? '')
    setAcceptGap(false)
    setAcceptDateGap(false)
    setProgress(null)
    setError('')
    setSaving(false)
    setReading(false)
    setRead(null)
  }, [expense])

  const parsedAmount = useMemo(() => {
    const n = Number(documentAmount.replace(/[^\d.-]/g, ''))
    return Number.isFinite(n) && n > 0 ? n : null
  }, [documentAmount])

  const foreign = useMemo(() => {
    if (!expense) return null
    return resolveExpenseForeign(expense) ?? null
  }, [expense])

  /**
   * בעסקת מט״ח החשבונית נקובה במטבע המקור, והחיוב בשקלים כולל שער ועמלה.
   * לכן התאמה מלאה נבדקת מול שני הסכומים — מי שמזין 20 עבור חיוב של $20
   * מקבל אישור, בלי לעקוף את הבדיקה ידנית.
   */
  const matchedIn = useMemo(() => {
    if (!expense || parsedAmount == null) return null
    if (amountsIdentical(parsedAmount, Math.abs(expense.amount))) return 'ILS'
    if (foreign && amountsIdentical(parsedAmount, foreign.amount)) {
      return foreign.currency
    }
    return null
  }, [expense, parsedAmount, foreign])

  const amountGap = useMemo(() => {
    if (!expense || parsedAmount == null || matchedIn) return null
    const base = foreign ? foreign.amount : Math.abs(expense.amount)
    return Math.round((parsedAmount - base) * 100) / 100
  }, [expense, parsedAmount, matchedIn, foreign])

  const paymentDate = expense ? reconciliationRowDate(expense) : ''

  const dateCheck = useMemo(
    () => checkInvoiceDate(invoiceDate, paymentDate),
    [invoiceDate, paymentDate],
  )

  const attribution = useMemo(() => {
    if (!expense || !invoiceDate) return null
    return attributionForInvoiceDate(expense, invoiceDate)
  }, [expense, invoiceDate])

  if (!expense) return null

  const blockedByGap = amountGap !== null && !acceptGap
  const blockedByDate = dateCheck.status !== 'ok' && !acceptDateGap
  const canSave =
    !saving &&
    (file != null || invoiceNumber.trim().length > 0) &&
    !blockedByGap &&
    !blockedByDate

  async function handleSave() {
    if (!expense || !canSave) return
    setSaving(true)
    setError('')
    try {
      let uploaded: { url: string; fileName: string } | null = null
      if (file) {
        setProgress(0)
        uploaded = await uploadExpenseDocument(expense.id, file, setProgress)
      }
      await updateExpense(expense.id, {
        ...(uploaded
          ? { documentUrl: uploaded.url, documentFileName: uploaded.fileName }
          : {}),
        ...(invoiceNumber.trim() ? { invoiceNumber: invoiceNumber.trim() } : {}),
        // תאריך החשבונית קובע לאיזה חודש ההוצאה נספרת ברווח והפסד
        ...(attribution
          ? {
              documentDate: invoiceDate,
              documentMonth: attribution.documentMonth,
              isLateDocument: attribution.late,
              pnlMonth: attribution.month,
            }
          : {}),
        expenseNote: expenseNote.trim() ? expenseNote.trim() : null,
        supplierInvoiceReceived: true,
      })
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ההצמדה נכשלה')
    } finally {
      setSaving(false)
      setProgress(null)
    }
  }

  function handlePick(picked: File | null) {
    setError('')
    setRead(null)
    if (!picked) {
      setFile(null)
      return
    }
    const problem = validateExpenseDocument(picked)
    if (problem) {
      setError(problem)
      setFile(null)
      return
    }
    setFile(picked)
    void autoRead(picked)
  }

  /**
   * קריאת השדות מהמסמך היא הצעה בלבד — היא ממלאת את הטפסים ומסמנת מה זוהה,
   * אבל האישור נשאר אצל המשתמש. זיהוי שגוי יזיז הוצאה לחודש הלא נכון.
   */
  async function autoRead(picked: File) {
    setReading(true)
    try {
      const result = await readInvoiceFile(picked)
      setRead(result)
      if (result.fields.date?.value) setInvoiceDate(result.fields.date.value)
      if (result.fields.amount?.value != null) {
        setDocumentAmount(String(result.fields.amount.value))
      }
      if (result.fields.invoiceNumber?.value && !invoiceNumber.trim()) {
        setInvoiceNumber(result.fields.invoiceNumber.value)
      }
      setAcceptGap(false)
      setAcceptDateGap(false)
    } catch {
      setRead({ fields: {}, hasText: false })
    } finally {
      setReading(false)
    }
  }

  return (
    <Modal isOpen onClose={onClose} title="הצמדת חשבונית לתשלום" size="lg">
      <div className="space-y-5">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-muted)]/40 px-4 py-3">
          <div className="text-[14px] font-bold text-[var(--text-dark)]">
            {merchantLabel(expense)}
          </div>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-[var(--text-mid)]">
            <span>{formatDateIL(reconciliationRowDate(expense))}</span>
            <span className="font-bold tabular-nums text-[var(--text-dark)]">
              {formatNis(expense.amount)}
            </span>
            {foreign ? (
              <span className="font-bold tabular-nums text-[#3730A3]">
                סכום העסקה {formatForeignAmount(foreign.amount, foreign.currency)}
              </span>
            ) : null}
            {expense.paymentMethod === 'credit_card' ? (
              <span>כרטיס אשראי</span>
            ) : (
              <span>עובר ושב</span>
            )}
          </div>
        </div>

        <div>
          <div className="mb-2 text-[12px] font-bold text-[var(--text-mid)]">
            קובץ החשבונית
          </div>
          <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[var(--border)] bg-[var(--surface-muted)]/40 px-6 py-8 text-center transition hover:border-[var(--orange)]">
            <span className="text-[13px] font-bold text-[var(--text-dark)]">
              {file ? file.name : 'גררו קובץ או לחצו לבחירה'}
            </span>
            <span className="text-[11px] text-[var(--text-mid)]">
              PDF או צילום · עד 15MB
            </span>
            <input
              type="file"
              accept={EXPENSE_DOCUMENT_ACCEPT}
              className="hidden"
              onChange={(e) => handlePick(e.target.files?.[0] ?? null)}
            />
          </label>

          {reading ? (
            <p className="mt-2 text-[11px] font-semibold text-[var(--text-mid)]">
              קורא את החשבונית…
            </p>
          ) : read ? (
            read.hasText ? (
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] font-bold text-[var(--text-mid)]">
                  זוהה מהמסמך:
                </span>
                {read.fields.date ? (
                  <ReadChip
                    label={`תאריך ${formatDateIL(read.fields.date.value)}`}
                    confidence={read.fields.date.confidence}
                  />
                ) : null}
                {read.fields.amount ? (
                  <ReadChip
                    label={`סכום ${read.fields.amount.value}`}
                    confidence={read.fields.amount.confidence}
                  />
                ) : null}
                {read.fields.invoiceNumber ? (
                  <ReadChip
                    label={`מספר ${read.fields.invoiceNumber.value}`}
                    confidence={read.fields.invoiceNumber.confidence}
                  />
                ) : null}
                {read.fields.supplierName ? (
                  <ReadChip
                    label={read.fields.supplierName.value}
                    confidence={read.fields.supplierName.confidence}
                  />
                ) : null}
                <span className="text-[10px] text-[var(--text-mid)]">
                  בדקו ותקנו לפני שמירה
                </span>
              </div>
            ) : (
              <p className="mt-2 text-[11px] text-[var(--text-mid)]">
                לא נמצא טקסט לקריאה במסמך (כנראה צילום או סריקה) — מלאו את
                השדות ידנית.
              </p>
            )
          ) : null}

          {file ? (
            <div className="mt-3">
              <div className="mb-1.5 text-[11px] font-bold text-[var(--text-mid)]">
                כך ייראה המסמך שיישמר
              </div>
              <DocumentPreview file={file} />
            </div>
          ) : expense.documentUrl ? (
            <div className="mt-3">
              <div className="mb-1.5 flex flex-wrap items-center gap-2 text-[11px] font-bold text-[var(--text-mid)]">
                <span className="rounded-full bg-[#D1FAE5] px-2 py-0.5 text-[10px] font-bold text-[#065F46]">
                  הקובץ שמור
                </span>
                <a
                  href={expense.documentUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="font-semibold text-[var(--orange)] underline"
                >
                  {expense.documentFileName || 'פתיחה בכרטיסייה חדשה'}
                </a>
              </div>
              <DocumentPreview
                url={expense.documentUrl}
                fileName={expense.documentFileName ?? ''}
              />
            </div>
          ) : null}

          {file && expense.documentUrl ? (
            <p className="mt-2 text-[11px] font-semibold text-[#92400E]">
              הקובץ החדש יחליף את {expense.documentFileName || 'המסמך הקיים'}
            </p>
          ) : null}
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <div className="mb-2 text-[12px] font-bold text-[var(--text-mid)]">
              תאריך החשבונית
            </div>
            <input
              type="date"
              value={invoiceDate}
              onChange={(e) => {
                setInvoiceDate(e.target.value)
                setAcceptDateGap(false)
              }}
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--dash-panel-bg)] px-3 py-2.5 text-sm font-semibold text-[var(--text-dark)]"
            />
          </div>
          <div>
            <div className="mb-2 text-[12px] font-bold text-[var(--text-mid)]">
              מספר חשבונית
            </div>
            <input
              type="text"
              value={invoiceNumber}
              onChange={(e) => setInvoiceNumber(e.target.value)}
              placeholder="לדוגמה 10432"
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--dash-panel-bg)] px-3 py-2.5 text-sm font-semibold text-[var(--text-dark)]"
            />
          </div>
          <div>
            <div className="mb-2 text-[12px] font-bold text-[var(--text-mid)]">
              סכום בחשבונית
              {foreign ? (
                <span className="font-semibold text-[#3730A3]">
                  {' '}
                  — ב{foreign.currency}
                </span>
              ) : null}
            </div>
            <input
              type="text"
              inputMode="decimal"
              value={documentAmount}
              onChange={(e) => {
                setDocumentAmount(e.target.value)
                setAcceptGap(false)
              }}
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--dash-panel-bg)] px-3 py-2.5 text-sm font-semibold tabular-nums text-[var(--text-dark)]"
            />
          </div>
        </div>

        {attribution?.moves ? (
          <p className="rounded-xl border border-[#BFDBFE] bg-[#EFF6FF] px-4 py-3 text-[12px] font-bold text-[#1E40AF]">
            לפי תאריך החשבונית ההוצאה תעבור מ{monthLabelHe(attribution.currentMonth)}{' '}
            ל{monthLabelHe(attribution.month)}.
            {attribution.late
              ? ` חודש ${monthLabelHe(attribution.documentMonth)} כבר דווח למע״מ — היא עדיין נספרת שם ומסומנת כמאחרת.`
              : ' זו ההוצאה של אותו חודש, גם אם התשלום יצא אחר כך.'}
          </p>
        ) : null}

        {dateCheck.status !== 'ok' ? (
          <div className="space-y-2 rounded-xl border border-[#FECACA] bg-[#FEF2F2] px-4 py-3">
            <p className="text-[13px] font-bold text-[#DC2626]">
              {dateCheck.status === 'future'
                ? 'תאריך החשבונית מאוחר ממועד התשלום'
                : `בין החשבונית לתשלום עברו ${dateCheck.days} ימים`}
            </p>
            <p className="text-[12px] text-[#92400E]">
              חשבונית {formatDateIL(invoiceDate)} · תשלום{' '}
              {formatDateIL(paymentDate)}
            </p>
            <label className="flex items-center gap-2 text-[12px] font-semibold text-[#92400E]">
              <input
                type="checkbox"
                checked={acceptDateGap}
                onChange={(e) => setAcceptDateGap(e.target.checked)}
              />
              זו אכן החשבונית של התשלום הזה
            </label>
          </div>
        ) : null}

        {matchedIn && matchedIn !== 'ILS' ? (
          <p className="rounded-xl border border-[#BBF7D0] bg-[#F0FDF4] px-4 py-3 text-[12px] font-bold text-[#065F46]">
            התאמה מלאה מול סכום העסקה במטבע המקור (
            {formatForeignAmount(foreign?.amount ?? 0, matchedIn)}). ההפרש מול{' '}
            {formatNis(expense.amount)} הוא שער ההמרה ועמלת הכרטיס.
          </p>
        ) : null}

        {amountGap !== null ? (
          <div className="space-y-2 rounded-xl border border-[#FECACA] bg-[#FEF2F2] px-4 py-3">
            <p className="text-[13px] font-bold text-[#DC2626]">
              {foreign
                ? 'הסכום בחשבונית אינו זהה לסכום העסקה במטבע המקור'
                : 'הסכום בחשבונית אינו זהה לסכום שירד בבנק'}
            </p>
            <p className="text-[12px] tabular-nums text-[#92400E]">
              {foreign
                ? `בעסקה ${formatForeignAmount(foreign.amount, foreign.currency)} · בחשבונית ${formatForeignAmount(parsedAmount ?? 0, foreign.currency)} · פער ${formatForeignAmount(Math.abs(amountGap), foreign.currency)}`
                : `בבנק ${formatNis(expense.amount)} · בחשבונית ${formatNis(parsedAmount ?? 0)} · פער ${formatNis(Math.abs(amountGap))}`}
            </p>
            <label className="flex items-center gap-2 text-[12px] font-semibold text-[#92400E]">
              <input
                type="checkbox"
                checked={acceptGap}
                onChange={(e) => setAcceptGap(e.target.checked)}
              />
              זו אכן החשבונית הנכונה — הפער מוסבר (תשלום חלקי, הפרשי שער וכדומה)
            </label>
          </div>
        ) : null}

        <div>
          <div className="mb-2 text-[12px] font-bold text-[var(--text-mid)]">
            הערה (תופיע באדום בשורת ההוצאה)
          </div>
          <textarea
            value={expenseNote}
            onChange={(e) => setExpenseNote(e.target.value)}
            rows={2}
            placeholder="לדוגמה: פער בגלל תשלום חלקי / חשבונית מאוחדת…"
            className="w-full resize-y rounded-xl border border-[var(--border)] bg-[var(--dash-panel-bg)] px-3 py-2.5 text-sm font-semibold text-[var(--text-dark)] placeholder:font-normal placeholder:text-[var(--text-light)]"
          />
        </div>

        {progress !== null ? (
          <div className="text-[12px] font-semibold text-[var(--text-mid)]">
            מעלה… {progress}%
          </div>
        ) : null}

        {error ? (
          <p className="rounded-xl border border-[#FECACA] bg-[#FEF2F2] px-3 py-2.5 text-[12px] text-[#DC2626]">
            {error}
          </p>
        ) : null}

        <div className="flex flex-wrap justify-end gap-2 border-t border-[var(--border)] pt-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-[var(--border)] px-4 py-2 text-sm font-semibold text-[var(--text-mid)]"
          >
            ביטול
          </button>
          <button
            type="button"
            disabled={!canSave}
            onClick={() => void handleSave()}
            className="rounded-xl bg-[var(--orange)] px-5 py-2 text-sm font-bold text-white transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? 'שומר…' : 'הצמד וסגור שורה'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
