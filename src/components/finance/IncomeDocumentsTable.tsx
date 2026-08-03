import { useCallback, useMemo, useState } from 'react'
import { formatDateIL } from '../../lib/dates'
import {
  formatNis,
  INCOME_STATUS_LABEL,
  INCOME_STATUS_STYLE,
} from '../../lib/financeCalc'
import {
  FINANCE_INCOME_DOCUMENT_LABELS,
  incomeDocumentKind,
  isActualIncome,
  isReceiptOnly,
} from '../../lib/financeIncomeDocument'
import {
  hostingIncomeLabel,
  isHostingIncome,
  resolveHostingType,
} from '../../lib/financeHostingTypes'
import {
  clientScopedAssignOptionsWithHosting,
  HOSTING_ASSIGN_PREFIX,
  hourlyAssignValue,
  type HourlyAssignSource,
} from '../../lib/financeProjectAssign'
import {
  buildIncomeDocumentPairMap,
  buildInvoiceToReceiptMap,
} from '../../lib/incomeDocumentPairs'
import { incomePaymentDate } from '../../lib/financeIncomePayment'
import { sortByKey, useTableSort } from '../../lib/financeTableSort'
import { resolveIncomeVat } from '../../lib/israeliVat'
import type { FinanceIncome } from '../../types'
import type { ClientFinanceTarget } from './ClientFinanceCardModal'
import { FinanceClickable } from './FinanceClickable'
import { GreenInvoiceBadge } from './GreenInvoiceBadge'
import { QuickCreateProjectModal } from './QuickCreateProjectModal'
import { SortableTh } from './SortableTh'
import { HubDropdownSelect } from '../shared/HubDropdownSelect'

type IncomeSortKey = 'date' | 'client' | 'gross' | 'status'

export { HOSTING_ASSIGN_PREFIX, HOURLY_ASSIGN_PREFIX } from '../../lib/financeProjectAssign'

/** הערך הנבחר הנוכחי לשורה — אחסון / בנק שעות / פרויקט */
function assignValueForRow(row: FinanceIncome): string {
  if (isHostingIncome(row)) {
    const t = resolveHostingType(row)
    return t ? `${HOSTING_ASSIGN_PREFIX}${t}` : ''
  }
  if (row.hourlyServiceId?.trim()) {
    return hourlyAssignValue(row.hourlyServiceId.trim())
  }
  return row.projectId || ''
}

/** אפשרויות שיוך לשורה — אחסון + בנקי שעות פעילים + פרויקטים של הלקוח */
function assignOptionsForRow(
  projects: { id: string; name: string; clientId?: string }[],
  row: FinanceIncome,
  hourlyServices: HourlyAssignSource[],
): { value: string; label: string }[] {
  const current = assignValueForRow(row)
  return clientScopedAssignOptionsWithHosting(projects, {
    clientId: row.clientId,
    currentProjectId: row.projectId,
    currentHourlyServiceId: row.hourlyServiceId,
    currentAssignValue: current,
    hourlyServices,
  })
}

function rowDisplayDate(row: FinanceIncome): string {
  const kind = incomeDocumentKind(row)
  return kind === 'tax_invoice_receipt' || kind === 'receipt'
    ? incomePaymentDate(row)
    : row.invoiceDate
}

function rowClientLabel(
  row: FinanceIncome,
  clientNameById: Map<string, string>,
): string {
  return (
    clientNameById.get(row.clientId) ?? row.greenInvoiceClientName ?? '—'
  )
}

export function IncomeDocumentsTable({
  rows,
  clientNameById,
  projectNameById,
  projectsForAssign,
  hourlyServicesForAssign,
  onAssignProject,
  onClientClick,
}: {
  rows: FinanceIncome[]
  clientNameById: Map<string, string>
  projectNameById: Map<string, string>
  /** כשמסופק יחד עם onAssignProject — עמודת הפרויקט הופכת לנבחרת עם חיפוש (מסונן ללקוח השורה) */
  projectsForAssign?: { id: string; name: string; clientId?: string }[]
  hourlyServicesForAssign?: HourlyAssignSource[]
  onAssignProject?: (incomeId: string, projectId: string) => void
  /** לחיצה על שם לקוח — פתיחת כרטיס פיננסי */
  onClientClick?: (target: ClientFinanceTarget) => void
}) {
  const editableProjects = !!projectsForAssign && !!onAssignProject
  const hourlyServices = hourlyServicesForAssign ?? []
  const hourlyTitleById = useMemo(() => {
    const m = new Map<string, string>()
    for (const s of hourlyServices) m.set(s.id, s.title)
    return m
  }, [hourlyServices])
  const [quickCreateFor, setQuickCreateFor] = useState<{
    incomeId: string
    clientId: string
    clientName: string
  } | null>(null)
  const { sort, toggle } = useTableSort<IncomeSortKey>('date', 'desc')
  const getSortValue = useCallback(
    (row: FinanceIncome, key: IncomeSortKey): string | number => {
      if (key === 'date') return rowDisplayDate(row)
      if (key === 'client') return rowClientLabel(row, clientNameById)
      if (key === 'gross') return resolveIncomeVat(row).gross
      return row.status
    },
    [clientNameById],
  )
  const sortedRows = useMemo(
    () => sortByKey(rows, sort, getSortValue),
    [rows, sort, getSortValue],
  )
  const receiptToInvoice = useMemo(
    () => buildIncomeDocumentPairMap(rows),
    [rows],
  )
  const invoiceToReceipt = useMemo(
    () => buildInvoiceToReceiptMap(rows),
    [rows],
  )

  if (rows.length === 0) {
    return (
      <p className="text-sm text-[var(--text-mid)]">אין רשומות בטווח הנבחר</p>
    )
  }

  // סה״כ טבלה = רק מסמכי הכנסה (בלי קבלות — הן תקבול לאותה עסקה)
  const totals = rows.reduce(
    (acc, row) => {
      if (!isActualIncome(row)) return acc
      const vat = resolveIncomeVat(row)
      acc.gross += vat.gross
      acc.vat += vat.vat
      acc.net += vat.net
      acc.count += 1
      return acc
    },
    { gross: 0, vat: 0, net: 0, count: 0 },
  )
  const receiptCount = rows.filter((r) => isReceiptOnly(r)).length
  const round2 = (n: number) => Math.round(n * 100) / 100

  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
      <table className="w-full min-w-[1000px] border-collapse text-sm">
        <thead className="sticky top-0 z-[1]">
          <tr className="border-b border-[var(--border)] bg-[var(--surface-muted)]/80 text-[11px] font-bold text-[var(--text-mid)] backdrop-blur-sm">
            <th className="px-2.5 py-2.5 text-right">סוג מסמך</th>
            <SortableTh
              label="תאריך"
              columnKey="date"
              sort={sort}
              onSort={toggle}
            />
            <SortableTh
              label="לקוח"
              columnKey="client"
              sort={sort}
              onSort={toggle}
              defaultDir="asc"
            />
            <th className="px-2.5 py-2.5 text-right">פרויקט</th>
            <SortableTh
              label="ברוטו"
              columnKey="gross"
              sort={sort}
              onSort={toggle}
            />
            <th className="px-2.5 py-2.5 text-right">מע״מ</th>
            <th className="px-2.5 py-2.5 text-right">נטו</th>
            <SortableTh
              label="סטטוס"
              columnKey="status"
              sort={sort}
              onSort={toggle}
              defaultDir="asc"
            />
            <th className="px-2.5 py-2.5 text-right">מקור</th>
          </tr>
        </thead>
        <tbody>
          {sortedRows.map((row) => {
            const kind = incomeDocumentKind(row)
            const isReceipt = kind === 'receipt'
            const badge = INCOME_STATUS_STYLE[row.status]
            const vat = resolveIncomeVat(row)
            const date = rowDisplayDate(row)
            const clientLabel = rowClientLabel(row, clientNameById)
            const pairedInvoice = isReceipt
              ? receiptToInvoice.get(row.id)
              : undefined
            const pairedReceipt =
              kind === 'tax_invoice'
                ? invoiceToReceipt.get(row.id)
                : undefined
            const invoiceNum =
              pairedInvoice?.invoiceNumber ||
              pairedInvoice?.greenInvoiceNumber
            const receiptNum =
              pairedReceipt?.invoiceNumber ||
              pairedReceipt?.greenInvoiceNumber
            const docNum = row.invoiceNumber || row.greenInvoiceNumber || ''

            return (
              <tr
                key={`${row.id}-${date}`}
                className={`border-b border-[var(--border)]/80 transition ${
                  isReceipt
                    ? 'bg-[var(--surface-muted)]/50 text-[var(--text-mid)] hover:bg-[var(--surface-muted)]'
                    : 'hover:bg-[var(--surface-muted)]/70'
                }`}
              >
                <td className="px-2.5 py-3">
                  <div className="flex flex-col items-start gap-1">
                    <span
                      className={`rounded-lg px-2 py-0.5 text-[10px] font-bold ${
                        isReceipt
                          ? 'bg-[#E2E8F0] text-[#475569]'
                          : 'bg-[var(--surface-muted)] text-[var(--text-dark)]'
                      }`}
                    >
                      {FINANCE_INCOME_DOCUMENT_LABELS[kind]}
                    </span>
                    {isReceipt ? (
                      <span className="text-[10px] font-semibold text-[var(--text-light)]">
                        {invoiceNum
                          ? `תקבול לחשבונית #${invoiceNum} · לא נספר`
                          : 'תקבול · לא נספר כהכנסה'}
                      </span>
                    ) : null}
                    {pairedReceipt && receiptNum ? (
                      <span className="text-[10px] font-semibold text-[#047857]">
                        שולם בקבלה #{receiptNum}
                      </span>
                    ) : null}
                  </div>
                </td>
                <td className="px-2.5 py-3 tabular-nums">
                  <div>{formatDateIL(date)}</div>
                  <div className="mt-0.5 text-[10px] text-[var(--text-mid)]">
                    {docNum ? (
                      <FinanceClickable
                        className="text-[10px] font-semibold text-[var(--text-mid)]"
                        title="העתק מספר מסמך"
                        onClick={() => {
                          void navigator.clipboard?.writeText(docNum)
                        }}
                      >
                        #{docNum}
                      </FinanceClickable>
                    ) : (
                      '#—'
                    )}
                  </div>
                </td>
                <td className="px-2.5 py-3">
                  {clientLabel !== '—' ? (
                    <FinanceClickable
                      title="כרטיס פיננסי ללקוח"
                      onClick={
                        onClientClick
                          ? () =>
                              onClientClick({
                                clientId: row.clientId?.trim() || undefined,
                                clientName: clientLabel,
                                guestName: !row.clientId?.trim()
                                  ? clientLabel
                                  : undefined,
                              })
                          : undefined
                      }
                    >
                      {clientLabel}
                    </FinanceClickable>
                  ) : (
                    '—'
                  )}
                </td>
                <td className="px-2.5 py-3">
                  {isReceipt ? (
                    <span
                      className="text-[11px] text-[var(--text-light)]"
                      title="קבלה היא תקבול בלבד — השיוך נעשה בחשבונית"
                    >
                      —
                    </span>
                  ) : editableProjects ? (
                    <HubDropdownSelect
                      value={assignValueForRow(row)}
                      onChange={(v) => onAssignProject!(row.id, v)}
                      options={assignOptionsForRow(
                        projectsForAssign!,
                        row,
                        hourlyServices,
                      )}
                      emptyOption={{ label: 'ללא שיוך' }}
                      searchable
                      searchPlaceholder="חיפוש פרויקט / אחסון / בנק שעות…"
                      className="min-w-[160px]"
                      menuClassName="min-w-[280px]"
                      menuFooter={
                        <button
                          type="button"
                          className="w-full rounded-lg bg-[var(--orange)] px-3 py-2 text-[12px] font-bold text-white transition hover:brightness-105"
                          onClick={() =>
                            setQuickCreateFor({
                              incomeId: row.id,
                              clientId: row.clientId ?? '',
                              clientName:
                                clientNameById.get(row.clientId) ??
                                row.greenInvoiceClientName ??
                                '',
                            })
                          }
                        >
                          + פרויקט מהיר
                        </button>
                      }
                    />
                  ) : isHostingIncome(row) ? (
                    <span className="text-[11px] font-semibold text-[var(--text-mid)]">
                      {hostingIncomeLabel(row) ?? 'אחסון'}
                    </span>
                  ) : row.hourlyServiceId ? (
                    <span className="text-[11px] font-semibold text-[var(--text-mid)]">
                      ⏱{' '}
                      {hourlyTitleById.get(row.hourlyServiceId) ??
                        'בנק שעות'}
                    </span>
                  ) : (
                    projectNameById.get(row.projectId) ?? '—'
                  )}
                </td>
                <td
                  className={`px-2.5 py-3 tabular-nums font-bold ${
                    isReceipt ? 'text-[var(--text-mid)]' : ''
                  }`}
                >
                  {formatNis(vat.gross)}
                </td>
                <td
                  className={`px-2.5 py-3 tabular-nums ${
                    isReceipt ? 'text-[var(--text-light)]' : 'text-[#4F46E5]'
                  }`}
                >
                  {formatNis(vat.vat)}
                </td>
                <td
                  className={`px-2.5 py-3 tabular-nums font-bold ${
                    isReceipt ? 'text-[var(--text-mid)]' : 'text-[#059669]'
                  }`}
                >
                  {formatNis(vat.net)}
                </td>
                <td className="px-2.5 py-3">
                  <span
                    className="inline-block rounded-lg px-2 py-0.5 text-[10px] font-bold"
                    style={{ backgroundColor: badge.bg, color: badge.color }}
                  >
                    {INCOME_STATUS_LABEL[row.status]}
                  </span>
                </td>
                <td className="px-2.5 py-3">
                  {row.source === 'green_invoice' ? (
                    <GreenInvoiceBadge />
                  ) : (
                    <span className="text-[10px] text-[var(--text-mid)]">
                      ידני
                    </span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-[var(--border)] bg-[var(--surface-muted)]/70 text-[13px] font-extrabold text-[var(--text-dark)]">
            <td className="px-2.5 py-3" colSpan={4}>
              סה״כ הכנסה ({totals.count} מסמכים
              {receiptCount > 0
                ? ` · ${receiptCount} קבלות לא נספרות`
                : ''}
              )
            </td>
            <td className="px-2.5 py-3 tabular-nums">
              {formatNis(round2(totals.gross))}
            </td>
            <td className="px-2.5 py-3 tabular-nums text-[#4F46E5]">
              {formatNis(round2(totals.vat))}
            </td>
            <td className="px-2.5 py-3 tabular-nums text-[#059669]">
              {formatNis(round2(totals.net))}
            </td>
            <td className="px-2.5 py-3" colSpan={2} />
          </tr>
        </tfoot>
      </table>

      <QuickCreateProjectModal
        open={quickCreateFor != null}
        onClose={() => setQuickCreateFor(null)}
        clientId={quickCreateFor?.clientId}
        clientName={quickCreateFor?.clientName}
        onCreated={(projectId) => {
          if (quickCreateFor && onAssignProject) {
            onAssignProject(quickCreateFor.incomeId, projectId)
          }
          setQuickCreateFor(null)
        }}
      />
    </div>
  )
}
