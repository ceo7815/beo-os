import { useMemo, useState } from 'react'
import { FinanceTabs } from '../components/finance/FinanceTabs'
import { FinancePeriodFilter } from '../components/finance/FinancePeriodFilter'
import { AttachInvoiceModal } from '../components/finance/AttachInvoiceModal'
import { isImageDocument } from '../lib/documentKind'
import { EmptyState } from '../components/shared/EmptyState'
import { useFinancePeriodFilter } from '../hooks/useFinancePeriodFilter'
import { useFinanceAttention } from '../hooks/useFinanceAttention'
import { useFinanceExpenses } from '../hooks/useFinanceExpenses'
import { useFinanceExpenseTypes } from '../hooks/useFinanceExpenseTypes'
import { expenseTypeMap, resolveExpenseType } from '../lib/financeExpenseTypes'
import {
  isOpenReconciliationRow,
  listInvoiceWorkflowRows,
  reconciliationRowDate,
  type ReconciledExpenseRow,
} from '../lib/expenseReconciliation'
import {
  buildAccountantPackage,
  downloadBlob,
  type PackageProgress,
} from '../lib/accountantPackage'
import { formatNis, monthLabelHe } from '../lib/financeCalc'
import { formatDateIL } from '../lib/dates'
import { sortByKey, useTableSort } from '../lib/financeTableSort'
import { FinanceClickable } from '../components/finance/FinanceClickable'
import { hubSectionClass } from '../lib/hubSectionBorder'
import type { FinanceExpense } from '../types'

const ACCOUNTANT_EMAIL_KEY = 'hubpos.accountantEmail'

type FolderFilter = 'documented' | 'missing' | 'all'

const FOLDER_TABS: { id: FolderFilter; label: string }[] = [
  { id: 'documented', label: 'עם חשבונית' },
  { id: 'missing', label: 'חסרה חשבונית' },
  { id: 'all', label: 'הכל' },
]

function supplierLabel(exp: FinanceExpense): string {
  return (
    exp.supplierName?.trim() ||
    exp.name?.trim() ||
    exp.employeeName?.trim() ||
    exp.description?.trim() ||
    '—'
  )
}

/**
 * "עם חשבונית" / "חסרה" חייבים להתאים ל"סגורות" / "ממתינות" בהוצאות
 * ולתג בהתאמות בנקים — כלומר לפי סטטוס התאמה פתוח, לא לפי קיום קובץ בלבד.
 * (זיכוי / מספר חשבונית בלי קובץ נספרים כסגורים, לא כחסרים.)
 */
function rowNeedsInvoice(row: ReconciledExpenseRow): boolean {
  return isOpenReconciliationRow(row)
}

export function FinanceDocuments() {
  const { expenses, loading } = useFinanceExpenses()
  const { types: expenseTypes } = useFinanceExpenseTypes()
  const period = useFinancePeriodFilter()
  const attention = useFinanceAttention(period.filterYmFrom, period.filterYmTo)

  const [folderFilter, setFolderFilter] = useState<FolderFilter>('documented')
  const [search, setSearch] = useState('')
  const { sort: docSort, toggle: toggleDocSort } = useTableSort<
    'date' | 'amount'
  >('date', 'desc')
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [attaching, setAttaching] = useState<FinanceExpense | null>(null)
  const [progress, setProgress] = useState<PackageProgress | null>(null)
  const [packageNote, setPackageNote] = useState<string | null>(null)
  const [packageError, setPackageError] = useState<string | null>(null)
  const [accountantEmail, setAccountantEmail] = useState(
    () => localStorage.getItem(ACCOUNTANT_EMAIL_KEY) ?? '',
  )

  const typeById = useMemo(() => expenseTypeMap(expenseTypes), [expenseTypes])

  /** רק שורות שדורשות חשבונית — בלי משכורת / מיסים / עמלות */
  const periodRows = useMemo(
    () =>
      listInvoiceWorkflowRows(
        expenses,
        period.filterYmFrom,
        period.filterYmTo,
        typeById,
      ),
    [expenses, period.filterYmFrom, period.filterYmTo, typeById],
  )

  const periodExpenses = useMemo(
    () => periodRows.map((r) => r.expense),
    [periodRows],
  )

  const stats = useMemo(() => {
    let documented = 0
    let documentedAmount = 0
    let missing = 0
    let missingAmount = 0
    let withFile = 0
    for (const row of periodRows) {
      if (rowNeedsInvoice(row)) {
        missing += 1
        missingAmount += row.expense.amount
      } else {
        documented += 1
        documentedAmount += row.expense.amount
        if (row.expense.documentUrl?.trim()) withFile += 1
      }
    }
    return { documented, documentedAmount, missing, missingAmount, withFile }
  }, [periodRows])

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return periodRows.filter((row) => {
      const needsInvoice = rowNeedsInvoice(row)
      if (folderFilter === 'documented' && needsInvoice) return false
      if (folderFilter === 'missing' && !needsInvoice) return false
      if (!term) return true
      const exp = row.expense
      return [supplierLabel(exp), exp.invoiceNumber, exp.description]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(term))
    })
  }, [periodRows, folderFilter, search])

  const folders = useMemo(() => {
    const byMonth = new Map<string, FinanceExpense[]>()
    for (const row of filtered) {
      const exp = row.expense
      const ym = reconciliationRowDate(exp).slice(0, 7)
      const list = byMonth.get(ym)
      if (list) list.push(exp)
      else byMonth.set(ym, [exp])
    }
    return [...byMonth.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([ym, items]) => ({
        ym,
        items: sortByKey(items, docSort, (exp, key) =>
          key === 'amount' ? exp.amount : reconciliationRowDate(exp),
        ),
        amount: items.reduce((sum, e) => sum + e.amount, 0),
      }))
  }, [filtered, docSort])

  async function handleExport() {
    setPackageError(null)
    setPackageNote(null)
    setProgress({ done: 0, total: 0, currentLabel: 'מתחיל…' })
    try {
      const result = await buildAccountantPackage(
        periodExpenses,
        period.filterRangeLabel,
        { typeById, onProgress: setProgress },
      )
      downloadBlob(result.blob, result.fileName)
      const parts = [`${result.included} חשבוניות נארזו בקובץ ${result.fileName}`]
      if (stats.missing > 0) {
        parts.push(`${stats.missing} תשלומים בתקופה עדיין בלי חשבונית`)
      }
      setPackageNote(parts.join(' · '))
      if (result.failed.length > 0) {
        setPackageError(
          `${result.failed.length} מסמכים לא נכללו: ${result.failed
            .slice(0, 3)
            .map((f) => f.label)
            .join(', ')}${result.failed.length > 3 ? '…' : ''}`,
        )
      }
    } catch (e) {
      setPackageError(
        e instanceof Error ? e.message : 'בניית החבילה נכשלה. נסו שוב.',
      )
    } finally {
      setProgress(null)
    }
  }

  function handleEmail() {
    localStorage.setItem(ACCOUNTANT_EMAIL_KEY, accountantEmail.trim())
    const subject = `חשבוניות ספקים — ${period.filterRangeLabel}`
    const body = [
      'שלום,',
      '',
      `מצורפות ${stats.withFile} חשבוניות ספקים לתקופה ${period.filterRangeLabel}.`,
      `סכום כולל (תשלומים מתועדים): ${formatNis(stats.documentedAmount)}.`,
      'בקובץ קיים גם "מפתח-מסמכים.csv" עם פירוט מלא של כל חשבונית.',
      '',
      'תודה',
    ].join('\n')
    window.location.href = `mailto:${encodeURIComponent(
      accountantEmail.trim(),
    )}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
  }

  const busy = progress !== null

  return (
    <div className="mx-auto min-w-0 w-full max-w-[1400px] space-y-6 px-4 py-8 sm:px-8">
      <header className="flex flex-col gap-4 md:flex-row md:flex-wrap md:items-center md:justify-between">
        <div className="min-w-0 text-right md:order-2 md:flex-1">
          <h1 className="text-[22px] font-extrabold leading-tight text-[var(--text-dark)] md:text-[26px]">
            תיק חשבוניות
          </h1>
          <p className="mt-1.5 text-[12px] leading-relaxed text-[var(--text-mid)] md:text-[13px]">
            חשבוניות ספקים בלבד — משכורת, מיסים ועמלות בנק לא נכללים כאן
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2 md:order-1">
          <button
            type="button"
            onClick={handleExport}
            disabled={busy || stats.withFile === 0}
            className="rounded-xl bg-[var(--orange)] px-4 py-2 text-sm font-bold text-white transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? 'אורז…' : `הורד תיק (${stats.withFile})`}
          </button>
        </div>
      </header>

      <FinanceTabs badges={attention} />

      <FinancePeriodFilter
        periodMode={period.periodMode}
        setPeriodMode={period.setPeriodMode}
        monthPreset={period.monthPreset}
        setMonthPreset={period.setMonthPreset}
        filterYmFrom={period.filterYmFrom}
        filterYmTo={period.filterYmTo}
        setFilterYmFrom={period.setFilterYmFrom}
        setFilterYmTo={period.setFilterYmTo}
        filterRangeLabel={period.filterRangeLabel}
        applyMonthPreset={period.applyMonthPreset}
        applySingleMonth={period.applySingleMonth}
        monthOptions={period.monthOptions}
      />

      <section
        className={`min-w-0 rounded-2xl ${hubSectionClass(2)} p-4 shadow-[0_2px_12px_rgba(0,0,0,0.06)]`}
      >
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div className="min-w-0 text-right">
            <h2 className="text-[15px] font-extrabold text-[var(--text-dark)]">
              שליחה לרואה החשבון
            </h2>
            <p className="mt-1 text-[12px] leading-relaxed text-[var(--text-mid)]">
              הכפתור מוריד קובץ ZIP עם תיקייה לכל חודש, שם קובץ שכולל תאריך, ספק
              וסכום, וקובץ מפתח לאקסל. את הקובץ שהורדתם צריך לצרף למייל ידנית.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <input
              type="email"
              dir="ltr"
              value={accountantEmail}
              onChange={(e) => setAccountantEmail(e.target.value)}
              placeholder="מייל רואה החשבון"
              className="w-[220px] rounded-xl border border-[var(--border)] bg-[var(--dash-panel-bg)] px-3 py-2 text-[13px] text-[var(--text-dark)] outline-none focus:border-[var(--orange)]"
            />
            <button
              type="button"
              onClick={handleEmail}
              disabled={!accountantEmail.trim()}
              className="rounded-xl border border-[var(--border-orange-soft)] bg-[var(--dash-panel-bg)] px-4 py-2 text-sm font-bold text-[var(--text-mid)] transition hover:bg-[var(--surface-muted)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              פתח מייל מוכן
            </button>
          </div>
        </div>

        {progress && (
          <p className="mt-3 rounded-xl border border-[var(--border-orange-soft)] bg-[var(--surface-muted)] px-3 py-2 text-[12px] font-semibold text-[var(--text-mid)]">
            אורז {progress.done}/{progress.total} — {progress.currentLabel}
          </p>
        )}
        {packageNote && (
          <p className="mt-3 rounded-xl border border-[#BBF7D0] bg-[#F0FDF4] px-3 py-2 text-[12px] font-semibold text-[#15803D]">
            {packageNote}
          </p>
        )}
        {packageError && (
          <p className="mt-3 rounded-xl border border-[#FECACA] bg-[#FEF2F2] px-3 py-2 text-[12px] font-semibold text-[#B91C1C]">
            {packageError}
          </p>
        )}
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <StatCard
          label="חשבוניות בתיק"
          value={String(stats.documented)}
          sub={formatNis(stats.documentedAmount)}
          tone="good"
        />
        <StatCard
          label="חסרות חשבונית"
          value={String(stats.missing)}
          sub={formatNis(stats.missingAmount)}
          tone={stats.missing > 0 ? 'alert' : 'neutral'}
        />
        <StatCard
          label="תיקיות"
          value={String(folders.length)}
          sub={period.filterRangeLabel}
        />
      </section>

      <section
        className={`min-w-0 rounded-2xl ${hubSectionClass(4)} p-4 shadow-[0_2px_12px_rgba(0,0,0,0.06)]`}
      >
        <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap gap-1.5">
            {FOLDER_TABS.map((tab) => {
              const count =
                tab.id === 'documented'
                  ? stats.documented
                  : tab.id === 'missing'
                    ? stats.missing
                    : periodRows.length
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setFolderFilter(tab.id)}
                  className={
                    folderFilter === tab.id
                      ? 'rounded-[10px] border border-[var(--orange)] bg-[var(--orange)] px-3 py-1.5 text-[11px] font-bold text-white'
                      : 'rounded-[10px] border border-[var(--border-orange-soft)] bg-[var(--dash-panel-bg)] px-3 py-1.5 text-[11px] font-semibold text-[var(--text-mid)] hover:bg-[var(--surface-muted)]'
                  }
                >
                  {tab.label} ({count})
                </button>
              )
            })}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap gap-1 rounded-xl border border-[var(--border)] bg-[var(--bg-main)] p-1">
              {(
                [
                  ['date', 'תאריך'],
                  ['amount', 'סכום'],
                ] as const
              ).map(([key, label]) => {
                const active = docSort.key === key
                const arrow = !active
                  ? '↕'
                  : docSort.dir === 'asc'
                    ? '↑'
                    : '↓'
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => toggleDocSort(key)}
                    className={
                      active
                        ? 'rounded-[8px] bg-[var(--orange)] px-2.5 py-1.5 text-[11px] font-bold text-white'
                        : 'rounded-[8px] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--text-mid)] hover:bg-black/[0.03]'
                    }
                    title={`מיון לפי ${label}`}
                  >
                    {label} {arrow}
                  </button>
                )
              })}
            </div>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="חיפוש ספק או מספר חשבונית"
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--dash-panel-bg)] px-3 py-2 text-[13px] text-[var(--text-dark)] outline-none focus:border-[var(--orange)] md:w-[260px]"
            />
          </div>
        </div>

        {loading ? (
          <p className="py-8 text-center text-[13px] text-[var(--text-mid)]">
            טוען…
          </p>
        ) : folders.length === 0 ? (
          <EmptyState
            title="אין מסמכים להצגה"
            description="שנו את התקופה או את הסינון, או הצמידו חשבוניות במסך התאמות בנקים."
          />
        ) : (
          <div className="space-y-3">
            {folders.map((folder) => {
              const isCollapsed = collapsed[folder.ym] ?? false
              return (
                <div
                  key={folder.ym}
                  className="overflow-hidden rounded-xl border border-[var(--border)]"
                >
                  <button
                    type="button"
                    onClick={() =>
                      setCollapsed((prev) => ({
                        ...prev,
                        [folder.ym]: !isCollapsed,
                      }))
                    }
                    className="flex w-full items-center justify-between gap-3 bg-[var(--surface-muted)] px-4 py-2.5 text-right transition hover:brightness-[0.98]"
                  >
                    <span className="text-[12px] font-semibold tabular-nums text-[var(--text-mid)]">
                      {folder.items.length} מסמכים · {formatNis(folder.amount)}
                    </span>
                    <span className="text-[13px] font-extrabold text-[var(--text-dark)]">
                      {isCollapsed ? '▸' : '▾'} {monthLabelHe(folder.ym)}
                    </span>
                  </button>

                  {!isCollapsed && (
                    <ul className="divide-y divide-[var(--border)]">
                      {folder.items.map((exp) => {
                        const typeDef = resolveExpenseType(exp.type, typeById)
                        const hasDoc = Boolean(exp.documentUrl?.trim())
                        return (
                          <li
                            key={exp.id}
                            className="flex flex-wrap items-center gap-3 px-4 py-2.5"
                          >
                            <DocumentThumb
                              url={exp.documentUrl}
                              fileName={exp.documentFileName}
                              onOpen={() => setAttaching(exp)}
                            />
                            <span className="w-[86px] shrink-0 text-[12px] tabular-nums text-[var(--text-mid)]">
                              {formatDateIL(reconciliationRowDate(exp))}
                            </span>
                            <FinanceClickable
                              className="min-w-0 flex-1 truncate text-[13px]"
                              title="סנן לפי ספק"
                              onClick={() => setSearch(supplierLabel(exp))}
                            >
                              {supplierLabel(exp)}
                            </FinanceClickable>
                            <span className="hidden w-[130px] shrink-0 truncate text-[12px] text-[var(--text-mid)] md:block">
                              {typeDef?.label ?? exp.type}
                            </span>
                            <span className="w-[100px] shrink-0 text-left text-[13px] font-bold tabular-nums text-[var(--text-dark)]">
                              {formatNis(exp.amount)}
                            </span>
                            <span className="w-[120px] shrink-0 truncate text-[12px] text-[var(--text-mid)]">
                              {exp.invoiceNumber?.trim()
                                ? `חשבונית ${exp.invoiceNumber.trim()}`
                                : hasDoc
                                  ? 'ללא מספר'
                                  : '—'}
                            </span>
                            <span className="flex shrink-0 gap-2">
                              {hasDoc && (
                                <a
                                  href={exp.documentUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-[11px] font-semibold text-[var(--text-mid)] transition hover:bg-[var(--surface-muted)]"
                                >
                                  צפייה
                                </a>
                              )}
                              <button
                                type="button"
                                onClick={() => setAttaching(exp)}
                                className={
                                  hasDoc
                                    ? 'rounded-lg border border-[var(--border)] px-3 py-1.5 text-[11px] font-semibold text-[var(--text-mid)] transition hover:bg-[var(--surface-muted)]'
                                    : 'rounded-lg bg-[var(--orange)] px-3 py-1.5 text-[11px] font-bold text-white transition hover:brightness-95'
                                }
                              >
                                {hasDoc ? 'החלף' : 'העלה'}
                              </button>
                            </span>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </section>

      <AttachInvoiceModal
        expense={attaching}
        onClose={() => setAttaching(null)}
      />
    </div>
  )
}

function StatCard({
  label,
  value,
  sub,
  tone = 'neutral',
}: {
  label: string
  value: string
  sub: string
  tone?: 'neutral' | 'good' | 'alert'
}) {
  const toneClass =
    tone === 'good'
      ? 'border-[#BBF7D0] bg-[#F0FDF4]'
      : tone === 'alert'
        ? 'border-[#FECACA] bg-[#FEF2F2]'
        : 'border-[var(--border)] bg-[var(--dash-panel-bg)]'
  return (
    <div className={`rounded-2xl border px-4 py-3 ${toneClass}`}>
      <div className="text-[11px] font-semibold text-[var(--text-mid)]">
        {label}
      </div>
      <div className="mt-1 text-[22px] font-extrabold tabular-nums text-[var(--text-dark)]">
        {value}
      </div>
      <div className="mt-0.5 text-[12px] font-semibold tabular-nums text-[var(--text-mid)]">
        {sub}
      </div>
    </div>
  )
}

function DocumentThumb({
  url,
  fileName,
  onOpen,
}: {
  url?: string
  fileName?: string
  onOpen: () => void
}) {
  if (!url?.trim()) {
    return (
      <button
        type="button"
        onClick={onOpen}
        className="flex h-12 w-10 shrink-0 items-center justify-center rounded-lg border border-dashed border-[var(--border)] bg-[var(--surface-muted)] text-[10px] font-bold text-[var(--text-light)]"
        title="העלה חשבונית"
      >
        —
      </button>
    )
  }
  if (isImageDocument(fileName)) {
    return (
      <button type="button" onClick={onOpen} className="shrink-0" title="צפייה">
        <img
          src={url}
          alt=""
          className="h-12 w-10 rounded-lg border border-[var(--border)] object-cover"
        />
      </button>
    )
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="flex h-12 w-10 shrink-0 items-center justify-center rounded-lg border border-[var(--border)] bg-[#FEF2F2] text-[10px] font-extrabold text-[#B91C1C]"
      title="PDF"
    >
      PDF
    </a>
  )
}
