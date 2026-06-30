import { formatDateIL } from '../../lib/dates'
import {
  formatNis,
  INCOME_STATUS_LABEL,
  INCOME_STATUS_STYLE,
} from '../../lib/financeCalc'
import {
  FINANCE_INCOME_DOCUMENT_LABELS,
  incomeDocumentKind,
} from '../../lib/financeIncomeDocument'
import {
  hostingIncomeLabel,
  isHostingIncome,
  resolveHostingType,
  HOSTING_TYPE_LABEL,
} from '../../lib/financeHostingTypes'
import { incomePaymentDate } from '../../lib/financeIncomePayment'
import { resolveIncomeVat } from '../../lib/israeliVat'
import type { FinanceIncome } from '../../types'
import { GreenInvoiceBadge } from './GreenInvoiceBadge'
import { HubDropdownSelect } from '../shared/HubDropdownSelect'

/** קידומת ערך-שיוך לאחסון בבורר השיוך */
export const HOSTING_ASSIGN_PREFIX = 'hosting:'

const HOSTING_ASSIGN_OPTIONS = [
  { value: `${HOSTING_ASSIGN_PREFIX}monthly`, label: `☁ ${HOSTING_TYPE_LABEL.monthly}` },
  { value: `${HOSTING_ASSIGN_PREFIX}yearly`, label: `☁ ${HOSTING_TYPE_LABEL.yearly}` },
  {
    value: `${HOSTING_ASSIGN_PREFIX}portal_monthly`,
    label: `☁ ${HOSTING_TYPE_LABEL.portal_monthly}`,
  },
]

/** הערך הנבחר הנוכחי לשורה — אחסון (לפי סוג) או מזהה פרויקט */
function assignValueForRow(row: FinanceIncome): string {
  if (isHostingIncome(row)) {
    const t = resolveHostingType(row)
    return t ? `${HOSTING_ASSIGN_PREFIX}${t}` : ''
  }
  return row.projectId || ''
}

/** אפשרויות שיוך לשורה — אחסון + רק פרויקטים של אותו לקוח (+ הפרויקט המשויך כעת) */
function assignOptionsForRow(
  projects: { id: string; name: string; clientId?: string }[],
  row: FinanceIncome,
): { value: string; label: string }[] {
  const clientId = row.clientId?.trim()
  const matches = projects.filter((p) =>
    clientId ? p.clientId === clientId : true,
  )
  if (row.projectId && !matches.some((p) => p.id === row.projectId)) {
    const current = projects.find((p) => p.id === row.projectId)
    if (current) matches.push(current)
  }
  const projectOpts = matches
    .sort((a, b) => a.name.localeCompare(b.name, 'he'))
    .map((p) => ({ value: p.id, label: p.name }))
  return [...HOSTING_ASSIGN_OPTIONS, ...projectOpts]
}

export function IncomeDocumentsTable({
  rows,
  clientNameById,
  projectNameById,
  projectsForAssign,
  onAssignProject,
}: {
  rows: FinanceIncome[]
  clientNameById: Map<string, string>
  projectNameById: Map<string, string>
  /** כשמסופק יחד עם onAssignProject — עמודת הפרויקט הופכת לנבחרת עם חיפוש (מסונן ללקוח השורה) */
  projectsForAssign?: { id: string; name: string; clientId?: string }[]
  onAssignProject?: (incomeId: string, projectId: string) => void
}) {
  const editableProjects = !!projectsForAssign && !!onAssignProject
  if (rows.length === 0) {
    return (
      <p className="text-sm text-[var(--text-mid)]">אין רשומות בטווח הנבחר</p>
    )
  }

  const totals = rows.reduce(
    (acc, row) => {
      const vat = resolveIncomeVat(row)
      acc.gross += vat.gross
      acc.vat += vat.vat
      acc.net += vat.net
      return acc
    },
    { gross: 0, vat: 0, net: 0 },
  )
  const round2 = (n: number) => Math.round(n * 100) / 100

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1000px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-[var(--border)] text-[11px] font-bold text-[var(--text-mid)]">
            <th className="px-2 py-2 text-right">סוג מסמך</th>
            <th className="px-2 py-2 text-right">תאריך</th>
            <th className="px-2 py-2 text-right">לקוח</th>
            <th className="px-2 py-2 text-right">פרויקט</th>
            <th className="px-2 py-2 text-right">ברוטו</th>
            <th className="px-2 py-2 text-right">מע״מ</th>
            <th className="px-2 py-2 text-right">נטו</th>
            <th className="px-2 py-2 text-right">סטטוס</th>
            <th className="px-2 py-2 text-right">מקור</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const kind = incomeDocumentKind(row)
            const badge = INCOME_STATUS_STYLE[row.status]
            const vat = resolveIncomeVat(row)
            const date =
              kind === 'tax_invoice_receipt' || kind === 'receipt'
                ? incomePaymentDate(row)
                : row.invoiceDate
            return (
              <tr
                key={`${row.id}-${date}`}
                className="border-b border-[var(--border)] transition hover:bg-[var(--surface-muted)]"
              >
                <td className="px-2 py-2.5">
                  <span className="rounded-full bg-[var(--surface-muted)] px-2 py-0.5 text-[10px] font-bold text-[var(--text-dark)]">
                    {FINANCE_INCOME_DOCUMENT_LABELS[kind]}
                  </span>
                </td>
                <td className="px-2 py-2.5 tabular-nums">
                  <div>{formatDateIL(date)}</div>
                  <div className="mt-0.5 text-[10px] text-[var(--text-mid)]">
                    #{row.invoiceNumber || row.greenInvoiceNumber || '—'}
                  </div>
                </td>
                <td className="px-2 py-2.5">
                  {clientNameById.get(row.clientId) ??
                    row.greenInvoiceClientName ??
                    '—'}
                </td>
                <td className="px-2 py-2.5">
                  {editableProjects ? (
                    <HubDropdownSelect
                      value={assignValueForRow(row)}
                      onChange={(v) => onAssignProject!(row.id, v)}
                      options={assignOptionsForRow(projectsForAssign!, row)}
                      emptyOption={{ label: 'ללא שיוך' }}
                      searchable
                      searchPlaceholder="חיפוש פרויקט / אחסון…"
                      className="min-w-[160px]"
                    />
                  ) : isHostingIncome(row) ? (
                    <span className="text-[11px] font-semibold text-[var(--text-mid)]">
                      {hostingIncomeLabel(row) ?? 'אחסון'}
                    </span>
                  ) : (
                    projectNameById.get(row.projectId) ?? '—'
                  )}
                </td>
                <td className="px-2 py-2.5 tabular-nums font-bold">
                  {formatNis(vat.gross)}
                </td>
                <td className="px-2 py-2.5 tabular-nums text-[#6366F1]">
                  {formatNis(vat.vat)}
                </td>
                <td className="px-2 py-2.5 tabular-nums font-bold text-[#10B981]">
                  {formatNis(vat.net)}
                </td>
                <td className="px-2 py-2.5">
                  <span
                    className="inline-block rounded-full px-2 py-0.5 text-[10px] font-bold"
                    style={{ backgroundColor: badge.bg, color: badge.color }}
                  >
                    {INCOME_STATUS_LABEL[row.status]}
                  </span>
                </td>
                <td className="px-2 py-2.5">
                  {row.source === 'green_invoice' ? (
                    <GreenInvoiceBadge />
                  ) : (
                    <span className="text-[10px] text-[var(--text-mid)]">ידני</span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-[var(--border)] bg-[var(--surface-muted)]/60 text-[13px] font-extrabold text-[var(--text-dark)]">
            <td className="px-2 py-3" colSpan={4}>
              סה״כ ({rows.length})
            </td>
            <td className="px-2 py-3 tabular-nums">
              {formatNis(round2(totals.gross))}
            </td>
            <td className="px-2 py-3 tabular-nums text-[#6366F1]">
              {formatNis(round2(totals.vat))}
            </td>
            <td className="px-2 py-3 tabular-nums text-[#10B981]">
              {formatNis(round2(totals.net))}
            </td>
            <td className="px-2 py-3" colSpan={2} />
          </tr>
        </tfoot>
      </table>
    </div>
  )
}
