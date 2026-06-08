import { useMemo, useState, useEffect, type ReactNode } from 'react'
import { ClientQuickSelect } from '../components/ClientQuickSelect'
import { ProjectFinancePanel } from '../components/finance/ProjectFinancePanel'
import { ProjectQuickSelect } from '../components/ProjectQuickSelect'
import { SupplierQuickSelect } from '../components/SupplierQuickSelect'
import { ConfirmDialog } from '../components/shared/ConfirmDialog'
import { EmptyState } from '../components/shared/EmptyState'
import { HubDropdownSelect } from '../components/shared/HubDropdownSelect'
import { Modal } from '../components/shared/Modal'
import { formatDateIL, todayYmd } from '../lib/dates'
import {
  computeProfitLossRows,
  computeSummary,
  currentYm,
  addMonths,
  filterExpensesByClient,
  filterCollectionIncomes,
  filterTaxReceiptIncomes,
  formatNis,
  formatYmRangeLabel,
  monthOptions,
  INCOME_STATUS_LABEL,
  INCOME_STATUS_STYLE,
  monthLabelHe,
  PLATFORM_OPTIONS,
} from '../lib/financeCalc'
import {
  expenseTypeMap,
  expenseDisplayName,
  expensePaymentMonth,
  expenseUsesPnlAttribution,
  isOneTimeGeneralExpenseType,
  EXPENSE_TYPE_COLOR_PRESETS,
  resolveExpenseType,
} from '../lib/financeExpenseTypes'
import {
  deriveExpensePnlMonth,
  incomeLinkLabel,
  projectIncomesForExpense,
  resolveExpensePnlFields,
  resolveLinkedIncome,
  suggestLinkedIncome,
} from '../lib/financeExpensePnl'
import {
  FINANCE_INCOME_DOCUMENT_LABELS,
  incomeDocumentDateLabel,
  incomeDocumentKind,
  incomeDocumentNumberLabel,
  isTaxReceiptIncome,
} from '../lib/financeIncomeDocument'
import { toastFsSuccess } from '../lib/fsToast'
import {
  aprilPaymentDateForTarget,
  buildLegacyTaxReceiptPatch,
  findMissingKnownIncomeTargets,
  needsLegacyTaxReceiptRestore,
} from '../lib/financeIncomeLegacyMigration'
import {
  buildInvoiceFixturePatch,
  findInvoiceFixture,
  invoiceFixtureNeedsFix,
} from '../lib/financeInvoiceDateFixtures'
import { matchMonthlyRecurringExpense } from '../lib/financeRecurringCatalog'
import { hubSectionClass } from '../lib/hubSectionBorder'
import {
  defaultVatClassForExpenseType,
  EXPENSE_VAT_CLASS_LABEL,
  EXPENSE_VAT_CLASS_SHORT,
  resolveExpenseVatClass,
  suggestExpenseVatClass,
  vatClassToLiable,
} from '../lib/financeExpenseVat'
import {
  calcVatFromGross,
  calcVatFromNet,
  formatNisPlain,
  ISRAEL_VAT_PERCENT_LABEL,
  resolveExpenseRowVat,
  resolveIncomeVat,
} from '../lib/israeliVat'
import { useClients } from '../hooks/useClients'
import {
  useFinanceExpenseTypes,
  newExpenseTypeDefaults,
  type NewFinanceExpenseTypeInput,
} from '../hooks/useFinanceExpenseTypes'
import {
  useFinanceExpenses,
  type NewFinanceExpenseInput,
} from '../hooks/useFinanceExpenses'
import {
  useFinanceIncomes,
  incomeNeedsPartialConversionSplit,
  type AddIncomePaymentInput,
  type UpdateIncomePaymentInput,
  type NewFinanceIncomeInput,
  type FinanceIncomePatchInput,
} from '../hooks/useFinanceIncomes'
import { useProjects } from '../hooks/useProjects'
import { useSuppliers } from '../hooks/useSuppliers'
import {
  PAYMENT_METHOD_LABEL,
  incomeOutstandingAmount,
  incomePaymentDate,
  incomePaymentRecords,
  incomeTotalPaid,
  maxPaymentAmountForEdit,
  resolveIncomeStatusFromPayment,
  syncTaxReceiptPaymentDate,
  taxReceiptDatesOutOfSync,
} from '../lib/financeIncomePayment'
import {
  HOSTING_TYPE_LABEL,
  hostingIncomeLabel,
  hostingTypeUsesMonthPicker,
  isHostingIncome,
} from '../lib/financeHostingTypes'
import type {
  FinanceExpense,
  FinanceExpenseFieldMode,
  FinanceExpenseVatClass,
  FinanceIncome,
  FinanceIncomeDocumentKind,
  FinanceIncomeStatus,
  FinanceHostingType,
  FinancePaymentMethod,
  Project,
} from '../types'

const uiBtnSmOutline =
  'inline-flex h-9 min-w-[72px] items-center justify-center rounded-[10px] border border-[var(--border-orange-soft)] bg-[var(--dash-panel-bg)] px-3 text-xs font-semibold text-[var(--orange)] transition hover:bg-[var(--orange-light)]'
const uiBtnDanger =
  'inline-flex h-9 min-w-[72px] items-center justify-center rounded-[10px] border border-[#FECACA] bg-[#FEF2F2] px-3 text-xs font-semibold text-[#DC2626] transition hover:bg-[#FEE2E2]'

type IncomeFormState = {
  documentKind: FinanceIncomeDocumentKind
  projectId: string
  clientId: string
  amount: string
  amountIncludesVat: boolean
  invoiceNumber: string
  invoiceDate: string
  description: string
  status: FinanceIncomeStatus
  monthlyRetainer: boolean
  hostingType: FinanceHostingType | ''
  paymentMethod: FinancePaymentMethod
  paidAmount: string
  paidDate: string
}

type ExpenseFormState = {
  type: string
  clientId: string
  employeeName: string
  supplierId: string
  platformName: string
  projectId: string
  linkedIncomeId: string
  name: string
  amount: string
  vatClass: FinanceExpenseVatClass
  amountIncludesVat: boolean
  description: string
  billingMonth: string
  recurring: boolean
  supplierInvoiceReceived: boolean
}

const emptyAdditionalPayment = () => ({
  amount: '',
  paymentMethod: 'bank_transfer' as FinancePaymentMethod,
  paidDate: todayYmd(),
})

const emptyIncomeForm = (): IncomeFormState => ({
  documentKind: 'transaction_invoice',
  projectId: '',
  clientId: '',
  amount: '',
  amountIncludesVat: true,
  invoiceNumber: '',
  invoiceDate: todayYmd(),
  description: '',
  status: 'pending',
  monthlyRetainer: false,
  hostingType: '',
  paymentMethod: 'bank_transfer',
  paidAmount: '',
  paidDate: todayYmd(),
})

const emptyExpenseForm = (): ExpenseFormState => ({
  type: 'fixed',
  clientId: '',
  employeeName: '',
  supplierId: '',
  platformName: 'Google Ads',
  projectId: '',
  linkedIncomeId: '',
  name: '',
  amount: '',
  vatClass: 'vat_liable',
  amountIncludesVat: true,
  description: '',
  billingMonth: currentYm(),
  recurring: false,
  supplierInvoiceReceived: false,
})

type FinanceTab = 'receipts' | 'collection' | 'expenses' | 'pnl'

const FINANCE_TABS: { id: FinanceTab; label: string }[] = [
  { id: 'receipts', label: 'חשבוניות מס קבלה' },
  { id: 'collection', label: 'יתרה לגבייה' },
  { id: 'expenses', label: 'הוצאות' },
  { id: 'pnl', label: 'דוח רווח והפסד' },
]

function daysOpen(invoiceDate: string, today = todayYmd()): number {
  const due = invoiceDate.slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(due)) return 0
  const ms =
    new Date(today.slice(0, 10)).getTime() - new Date(due).getTime()
  return Math.max(0, Math.floor(ms / 86400000))
}

function KpiCard(props: {
  index: number
  seq: number
  label: string
  value: string
  valueClass?: string
  hint: string
}) {
  return (
    <div
      className={`flex min-h-[132px] flex-col rounded-2xl ${hubSectionClass(props.seq)} p-4 shadow-[0_2px_12px_rgba(0,0,0,0.08)]`}
    >
      <div className="flex items-center gap-2">
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-black/5 text-[10px] font-extrabold text-[var(--text-mid)]">
          {props.index}
        </span>
        <div className="text-[12px] font-bold leading-snug text-[var(--text-dark)]">
          {props.label}
        </div>
      </div>
      <div
        className={`mt-3 text-[26px] font-extrabold tabular-nums leading-none ${props.valueClass ?? 'text-[var(--text-dark)]'}`}
      >
        {props.value}
      </div>
      <div className="mt-auto pt-3 text-[11px] leading-snug text-[var(--text-mid)]">
        {props.hint}
      </div>
    </div>
  )
}

function KpiRowLabel({
  row,
  title,
  period,
}: {
  row: number
  title: string
  period?: string
}) {
  return (
    <div className="mb-3 border-b border-[var(--border)] pb-2">
      <div className="text-[13px] font-extrabold text-[var(--text-dark)]">
        שורה {row} — {title}
      </div>
      {period ? (
        <div className="mt-0.5 text-[10px] text-[var(--text-mid)]">{period}</div>
      ) : null}
    </div>
  )
}

function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <span className="mb-1 block text-[11px] font-bold text-[var(--text-mid)]">
      {children}
    </span>
  )
}

function hubInputClass() {
  return 'w-full rounded-xl border-2 border-[var(--border-orange-soft)] bg-[var(--dash-panel-bg)] px-3 py-2.5 text-sm text-[var(--text-dark)]'
}

function ExpenseFormSection({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-main)] p-4">
      <h3 className="mb-3 text-[11px] font-extrabold uppercase tracking-wide text-[var(--text-mid)]">
        {title}
      </h3>
      <div className="space-y-3">{children}</div>
    </div>
  )
}

function TaxReceiptTable({
  rows,
  clientNameById,
  projectNameById,
  onEdit,
  onDelete,
  onOpenProject,
}: {
  rows: FinanceIncome[]
  clientNameById: Map<string, string>
  projectNameById: Map<string, string>
  onEdit: (row: FinanceIncome) => void
  onDelete: (id: string) => void
  onOpenProject: (projectId: string) => void
}) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-[var(--text-mid)]">אין רשומות בטווח הנבחר</p>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[960px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-[var(--border)] text-[11px] font-bold text-[var(--text-mid)]">
            <th className="px-2 py-2 text-right">תאריך תשלום</th>
            <th className="px-2 py-2 text-right">לקוח</th>
            <th className="px-2 py-2 text-right">פרויקט</th>
            <th className="px-2 py-2 text-right">ברוטו</th>
            <th className="px-2 py-2 text-right">מע״מ</th>
            <th className="px-2 py-2 text-right">נטו</th>
            <th className="px-2 py-2 text-right">אמצעי תשלום</th>
            <th className="px-2 py-2 text-right">סטטוס</th>
            <th className="px-2 py-2 text-right">פעולות</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const badge = INCOME_STATUS_STYLE[row.status]
            const vat = resolveIncomeVat(row)
            return (
              <tr
                key={`${row.id}-${incomePaymentDate(row)}`}
                className="border-b border-[var(--border)] transition hover:bg-[var(--surface-muted)]"
              >
                <td className="px-2 py-2.5 tabular-nums">
                  <div>{formatDateIL(incomePaymentDate(row))}</div>
                  <div className="mt-0.5 text-[10px] text-[var(--text-mid)]">
                    #{row.invoiceNumber || '—'}
                  </div>
                </td>
                <td className="px-2 py-2.5">
                  {clientNameById.get(row.clientId) ?? '—'}
                </td>
                <td className="px-2 py-2.5">
                  {isHostingIncome(row) ? (
                    <span className="text-[11px] font-semibold text-[var(--text-mid)]">
                      {hostingIncomeLabel(row) ?? 'אחסון'}
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onOpenProject(row.projectId)}
                      className="font-semibold text-[var(--orange)] underline decoration-dotted hover:text-[#ea6c0a]"
                    >
                      {projectNameById.get(row.projectId) ?? '—'}
                    </button>
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
                <td className="px-2 py-2.5 text-[11px]">
                  {row.paymentMethod
                    ? PAYMENT_METHOD_LABEL[row.paymentMethod]
                    : '—'}
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
                  <div className="flex flex-wrap gap-1.5">
                    <button type="button" className={uiBtnSmOutline} onClick={() => onEdit(row)}>
                      עריכה
                    </button>
                    <button type="button" className={uiBtnDanger} onClick={() => onDelete(row.id)}>
                      מחק
                    </button>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function CollectionTable({
  rows,
  clientNameById,
  projectNameById,
  onEdit,
  onDelete,
  onConvert,
  onOpenProject,
}: {
  rows: FinanceIncome[]
  clientNameById: Map<string, string>
  projectNameById: Map<string, string>
  onEdit: (row: FinanceIncome) => void
  onDelete: (id: string) => void
  onConvert: (id: string) => void
  onOpenProject: (projectId: string) => void
}) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-[var(--text-mid)]">אין רשומות בטווח הנבחר</p>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[860px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-[var(--border)] text-[11px] font-bold text-[var(--text-mid)]">
            <th className="px-2 py-2 text-right">תאריך מסמך</th>
            <th className="px-2 py-2 text-right">לקוח</th>
            <th className="px-2 py-2 text-right">פרויקט</th>
            <th className="px-2 py-2 text-right">סכום</th>
            <th className="px-2 py-2 text-right">ימים פתוח</th>
            <th className="px-2 py-2 text-right">סטטוס</th>
            <th className="px-2 py-2 text-right">פעולות</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const badge = INCOME_STATUS_STYLE[row.status]
            const openDays = daysOpen(row.invoiceDate)
            const outstanding = incomeOutstandingAmount(row)
            return (
              <tr
                key={`${row.id}-${row.invoiceDate.slice(0, 7)}`}
                className="border-b border-[var(--border)] transition hover:bg-[var(--surface-muted)]"
              >
                <td className="px-2 py-2.5 tabular-nums">
                  <div>{formatDateIL(row.invoiceDate)}</div>
                  <div className="mt-0.5 text-[10px] text-[var(--text-mid)]">
                    #{row.invoiceNumber || '—'}
                  </div>
                </td>
                <td className="px-2 py-2.5">
                  {clientNameById.get(row.clientId) ?? '—'}
                </td>
                <td className="px-2 py-2.5">
                  <button
                    type="button"
                    onClick={() => onOpenProject(row.projectId)}
                    className="font-semibold text-[var(--orange)] underline decoration-dotted hover:text-[#ea6c0a]"
                  >
                    {projectNameById.get(row.projectId) ?? '—'}
                  </button>
                </td>
                <td className="px-2 py-2.5 tabular-nums font-bold">
                  {row.status === 'partial' ? (
                    <div>
                      <div>{formatNis(row.amount)}</div>
                      <div className="text-[10px] font-semibold text-[#F59E0B]">
                        יתרה {formatNis(outstanding)}
                      </div>
                    </div>
                  ) : (
                    formatNis(row.amount)
                  )}
                </td>
                <td className="px-2 py-2.5 tabular-nums">
                  <span
                    className={
                      openDays > 30
                        ? 'font-bold text-[#EF4444]'
                        : openDays > 14
                          ? 'font-semibold text-[#F59E0B]'
                          : ''
                    }
                  >
                    {openDays} ימים
                  </span>
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
                  <div className="flex flex-wrap gap-1.5">
                    {row.isAutoOccurrence !== true ? (
                      <button
                        type="button"
                        className="inline-flex h-9 items-center justify-center rounded-[10px] border border-[#A7F3D0] bg-[#ECFDF5] px-3 text-xs font-semibold text-[#059669] transition hover:bg-[#D1FAE5]"
                        onClick={() => onConvert(row.id)}
                      >
                        המר למס קבלה
                      </button>
                    ) : null}
                    <button type="button" className={uiBtnSmOutline} onClick={() => onEdit(row)}>
                      עריכה
                    </button>
                    <button type="button" className={uiBtnDanger} onClick={() => onDelete(row.id)}>
                      מחק
                    </button>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export function Finance() {
  const { clients } = useClients()
  const { projects } = useProjects()
  const { suppliers, addSupplier } = useSuppliers()
  const { incomes, loading: incomesLoading, addIncome, updateIncome, convertToTaxReceipt, addIncomePayment, updateIncomePayment, deleteIncomePayment, deleteIncome } =
    useFinanceIncomes()
  const {
    expenses,
    loading: expensesLoading,
    addExpense,
    updateExpense,
    deleteExpense,
  } = useFinanceExpenses()
  const { types: expenseTypes, addExpenseType } = useFinanceExpenseTypes()

  const expenseTypeById = useMemo(
    () => expenseTypeMap(expenseTypes),
    [expenseTypes],
  )

  const [filterYmFrom, setFilterYmFrom] = useState(currentYm())
  const [filterYmTo, setFilterYmTo] = useState(currentYm())
  const [periodMode, setPeriodMode] = useState<'single' | 'range'>('single')
  const [monthPreset, setMonthPreset] = useState<
    'month' | 'prev' | 'q' | 'half' | 'year' | 'pick' | 'custom'
  >('month')
  const [filterProjectId, setFilterProjectId] = useState('')
  const [filterClientId, setFilterClientId] = useState('')
  const [activeTab, setActiveTab] = useState<FinanceTab>('receipts')
  const [panelProject, setPanelProject] = useState<Project | null>(null)

  const [incomeModalOpen, setIncomeModalOpen] = useState(false)
  const [editingIncome, setEditingIncome] = useState<FinanceIncome | null>(null)
  const [incomeForm, setIncomeForm] = useState<IncomeFormState>(emptyIncomeForm)
  const [additionalPayment, setAdditionalPayment] = useState(emptyAdditionalPayment)
  const [editingPaymentId, setEditingPaymentId] = useState<string | null>(null)
  const [deletePaymentTarget, setDeletePaymentTarget] = useState<{
    incomeId: string
    paymentId: string
  } | null>(null)
  const [paymentEditForm, setPaymentEditForm] = useState(emptyAdditionalPayment)
  const [deleteIncomeId, setDeleteIncomeId] = useState<string | null>(null)
  const [convertIncomeId, setConvertIncomeId] = useState<string | null>(null)
  const [convertTaxReceiptNumber, setConvertTaxReceiptNumber] = useState('')
  const [convertTaxReceiptDate, setConvertTaxReceiptDate] = useState('')

  const convertIncomeTarget = useMemo(
    () =>
      convertIncomeId
        ? incomes.find((i) => i.id === convertIncomeId) ?? null
        : null,
    [convertIncomeId, incomes],
  )

  const convertIsPartialSplit = useMemo(
    () =>
      convertIncomeTarget
        ? incomeNeedsPartialConversionSplit(convertIncomeTarget)
        : false,
    [convertIncomeTarget],
  )

  const openConvertDialog = (id: string) => {
    setConvertIncomeId(id)
    setConvertTaxReceiptNumber('')
    setConvertTaxReceiptDate('')
  }

  const closeConvertDialog = () => {
    setConvertIncomeId(null)
    setConvertTaxReceiptNumber('')
    setConvertTaxReceiptDate('')
  }

  const canSubmitConvert =
    !!convertTaxReceiptDate.trim() &&
    (!convertIsPartialSplit || !!convertTaxReceiptNumber.trim())

  const submitConvertToTaxReceipt = () => {
    if (!convertIncomeId || !canSubmitConvert) return
    void convertToTaxReceipt(convertIncomeId, {
      taxReceiptNumber: convertTaxReceiptNumber.trim() || undefined,
      taxReceiptDate: convertTaxReceiptDate.trim(),
    }).then(closeConvertDialog)
  }
  const [expenseModalOpen, setExpenseModalOpen] = useState(false)
  const [editingExpense, setEditingExpense] = useState<FinanceExpense | null>(null)
  const [expenseForm, setExpenseForm] = useState<ExpenseFormState>(emptyExpenseForm)
  const [deleteExpenseId, setDeleteExpenseId] = useState<string | null>(null)
  const [addTypeModalOpen, setAddTypeModalOpen] = useState(false)
  const [typeForm, setTypeForm] = useState<NewFinanceExpenseTypeInput>(
    newExpenseTypeDefaults(),
  )

  const openProjects = useMemo(
    () =>
      projects.filter(
        (p) => p.status === 'active' || p.status === 'paused',
      ),
    [projects],
  )

  const clientNameById = useMemo(() => {
    const m = new Map<string, string>()
    clients.forEach((c) => m.set(c.id, c.name))
    return m
  }, [clients])

  const listedSuppliers = useMemo(
    () => suppliers.filter((s) => s.active !== false),
    [suppliers],
  )

  const projectNameById = useMemo(() => {
    const m = new Map<string, string>()
    projects.forEach((p) => m.set(p.id, p.name))
    return m
  }, [projects])

  const projectClientById = useMemo(() => {
    const m = new Map<string, string>()
    projects.forEach((p) => {
      if (p.clientId) m.set(p.id, p.clientId)
    })
    return m
  }, [projects])

  const projectIdsForClient = useMemo(() => {
    if (!filterClientId) return new Set<string>()
    return new Set(
      projects.filter((p) => p.clientId === filterClientId).map((p) => p.id),
    )
  }, [projects, filterClientId])

  const filters = useMemo(
    () => ({
      ymFrom: filterYmFrom,
      ymTo: filterYmTo,
      projectId: filterProjectId,
      clientId: filterClientId,
    }),
    [filterYmFrom, filterYmTo, filterProjectId, filterClientId],
  )

  const filterRangeLabel = useMemo(
    () => formatYmRangeLabel(filterYmFrom, filterYmTo),
    [filterYmFrom, filterYmTo],
  )

  const applyMonthPreset = (
    preset: 'month' | 'prev' | 'q' | 'half' | 'year',
  ) => {
    const now = currentYm()
    setMonthPreset(preset)
    switch (preset) {
      case 'month':
        setPeriodMode('single')
        setFilterYmFrom(now)
        setFilterYmTo(now)
        break
      case 'prev': {
        const prev = addMonths(now, -1)
        setPeriodMode('single')
        setFilterYmFrom(prev)
        setFilterYmTo(prev)
        break
      }
      case 'q':
        setPeriodMode('range')
        setFilterYmFrom(addMonths(now, -2))
        setFilterYmTo(now)
        break
      case 'half':
        setPeriodMode('range')
        setFilterYmFrom(addMonths(now, -5))
        setFilterYmTo(now)
        break
      case 'year':
        setPeriodMode('range')
        setFilterYmFrom(addMonths(now, -11))
        setFilterYmTo(now)
        break
    }
  }

  const applySingleMonth = (ym: string) => {
    setPeriodMode('single')
    setMonthPreset('pick')
    setFilterYmFrom(ym)
    setFilterYmTo(ym)
  }

  const summary = useMemo(
    () =>
      computeSummary(
        incomes,
        expenses,
        filters,
        projectIdsForClient,
        expenseTypes,
      ),
    [incomes, expenses, filters, projectIdsForClient, expenseTypes],
  )

  useEffect(() => {
    const SYNC_KEY = 'hub-finance-data-sync-v3'
    if (expensesLoading || expenses.length === 0) return
    if (sessionStorage.getItem(SYNC_KEY)) return

    let cancelled = false
    void (async () => {
      let recurringCount = 0
      let oneTimeCount = 0
      let vatCount = 0
      for (const exp of expenses) {
        if (cancelled) return
        const shouldRecur = matchMonthlyRecurringExpense(exp) != null
        const suggestedVat = suggestExpenseVatClass(exp)
        const currentVat = resolveExpenseVatClass(exp)
        const needsRecur = exp.recurring !== shouldRecur
        const needsVat = currentVat !== suggestedVat

        if (!needsRecur && !needsVat) continue

        await updateExpense(exp.id, {
          ...(needsRecur ? { recurring: shouldRecur } : {}),
          ...(needsVat
            ? {
                vatClass: suggestedVat,
                vatLiable: vatClassToLiable(suggestedVat),
              }
            : {}),
        })
        if (needsRecur) {
          if (shouldRecur) recurringCount += 1
          else oneTimeCount += 1
        }
        if (needsVat) vatCount += 1
      }
      if (cancelled) return
      sessionStorage.setItem(SYNC_KEY, '1')
      if (recurringCount > 0 || oneTimeCount > 0 || vatCount > 0) {
        const parts: string[] = []
        if (recurringCount > 0 || oneTimeCount > 0) {
          parts.push(`${recurringCount} חוזרות, ${oneTimeCount} חד־פעמיות`)
        }
        if (vatCount > 0) parts.push(`${vatCount} סיווגי מע״מ`)
        toastFsSuccess(`סונכרנו הוצאות: ${parts.join(' · ')}`)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [expensesLoading, expenses, updateExpense])

  useEffect(() => {
    const SYNC_KEY = 'hub-finance-income-restore-v1'
    if (incomesLoading) return
    if (sessionStorage.getItem(SYNC_KEY)) return

    let cancelled = false
    void (async () => {
      let restored = 0
      let recreated = 0

      for (const inc of incomes) {
        if (cancelled) return

        if (needsLegacyTaxReceiptRestore(inc)) {
          await updateIncome(inc.id, buildLegacyTaxReceiptPatch(inc))
          restored += 1
        }
      }

      for (const target of findMissingKnownIncomeTargets(incomes)) {
        if (cancelled) return
        const payD = aprilPaymentDateForTarget(target)
        const row: NewFinanceIncomeInput = {
          clientId: target.clientId,
          amount: target.amount,
          amountIncludesVat: true,
          documentKind: 'tax_receipt',
          invoiceNumber: `שחזור-${target.paymentYm}`,
          invoiceDate: payD,
          paidDate: payD,
          status: 'paid',
          description: target.label,
        }
        await addIncome(row)
        recreated += 1
      }

      if (cancelled) return
      sessionStorage.setItem(SYNC_KEY, '1')
      if (restored > 0 || recreated > 0) {
        const parts: string[] = []
        if (restored > 0) parts.push(`${restored} הומרו למס קבלה`)
        if (recreated > 0) parts.push(`${recreated} שוחזרו`)
        toastFsSuccess(`הכנסות: ${parts.join(' · ')}`)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [incomesLoading, incomes, updateIncome, addIncome])

  useEffect(() => {
    const SYNC_KEY = 'hub-finance-income-dates-v2'
    if (incomesLoading) return
    if (sessionStorage.getItem(SYNC_KEY)) return

    let cancelled = false
    void (async () => {
      let fixed = 0
      for (const inc of incomes) {
        if (cancelled) return
        if (!isTaxReceiptIncome(inc) || !taxReceiptDatesOutOfSync(inc)) continue
        const docDate = inc.invoiceDate.trim().slice(0, 10)
        const synced = syncTaxReceiptPaymentDate(docDate, inc.payments)
        await updateIncome(inc.id, {
          invoiceDate: synced.invoiceDate,
          paidDate: synced.paidDate,
          ...(synced.payments ? { payments: synced.payments } : {}),
        })
        fixed += 1
      }
      if (cancelled) return
      sessionStorage.setItem(SYNC_KEY, '1')
      if (fixed > 0) {
        toastFsSuccess(`תוקנו ${fixed} תאריכי מס קבלה לפי תאריך המסמך`)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [incomesLoading, incomes, updateIncome])

  useEffect(() => {
    const SYNC_KEY = 'hub-finance-invoice-fixtures-v1'
    if (incomesLoading) return
    if (sessionStorage.getItem(SYNC_KEY)) return

    let cancelled = false
    void (async () => {
      let fixed = 0
      for (const inc of incomes) {
        if (cancelled) return
        const fixture = findInvoiceFixture(inc)
        if (!fixture || !invoiceFixtureNeedsFix(inc, fixture)) continue
        const patch = buildInvoiceFixturePatch(inc, fixture)
        await updateIncome(inc.id, patch)
        fixed += 1
      }
      if (cancelled) return
      sessionStorage.setItem(SYNC_KEY, '1')
      if (fixed > 0) {
        toastFsSuccess(`תוקנו ${fixed} חשבוניות — תאריך וחודש נכונים`)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [incomesLoading, incomes, updateIncome])

  const filteredTaxReceipts = useMemo(
    () =>
      [...filterTaxReceiptIncomes(incomes, filters)].sort((a, b) =>
        incomePaymentDate(b).localeCompare(incomePaymentDate(a)),
      ),
    [incomes, filters],
  )

  const filteredTransactionInvoices = useMemo(
    () =>
      [...filterCollectionIncomes(incomes, filters)].sort((a, b) =>
        b.invoiceDate.localeCompare(a.invoiceDate),
      ),
    [incomes, filters],
  )

  const filteredExpenses = useMemo(
    () =>
      [
        ...filterExpensesByClient(
          expenses,
          filters,
          projectIdsForClient,
          expenseTypes,
          incomes,
        ),
      ].sort((a, b) => b.billingMonth.localeCompare(a.billingMonth)),
    [expenses, filters, projectIdsForClient, expenseTypes, incomes],
  )

  const pnlRows = useMemo(
    () => computeProfitLossRows(incomes, expenses, expenseTypes),
    [incomes, expenses, expenseTypes],
  )

  const expenseTypeOptions = useMemo(
    () => expenseTypes.map((t) => ({ value: t.id, label: t.label })),
    [expenseTypes],
  )

  const selectedExpenseType = useMemo(
    () => resolveExpenseType(expenseForm.type, expenseTypeById),
    [expenseForm.type, expenseTypeById],
  )

  const expenseProjectIncomes = useMemo(
    () =>
      expenseForm.projectId.trim()
        ? projectIncomesForExpense(incomes, expenseForm.projectId.trim())
        : [],
    [incomes, expenseForm.projectId],
  )

  const expensePnlMonthPreview = useMemo(() => {
    if (!expenseForm.projectId.trim() || selectedExpenseType.fieldMode === 'salary') {
      return ''
    }
    return deriveExpensePnlMonth(
      {
        id: '',
        type: expenseForm.type,
        amount: 0,
        billingMonth: expenseForm.billingMonth,
        recurring: false,
        createdAt: '',
        projectId: expenseForm.projectId.trim(),
        linkedIncomeId: expenseForm.linkedIncomeId || undefined,
      },
      incomes,
    )
  }, [
    incomes,
    expenseForm.type,
    expenseForm.projectId,
    expenseForm.linkedIncomeId,
    expenseForm.billingMonth,
    selectedExpenseType.fieldMode,
  ])

  const expenseVatPreview = useMemo(() => {
    const n = Number.parseFloat(expenseForm.amount.replace(/,/g, ''))
    if (!Number.isFinite(n) || n <= 0) return null
    if (expenseForm.vatClass !== 'vat_liable') {
      return { gross: n, net: n, vat: 0, rate: 0.18 }
    }
    return expenseForm.amountIncludesVat ? calcVatFromGross(n) : calcVatFromNet(n)
  }, [expenseForm.amount, expenseForm.amountIncludesVat, expenseForm.vatClass])

  const incomeVatPreview = useMemo(() => {
    const n = Number.parseFloat(incomeForm.amount.replace(/,/g, ''))
    if (!Number.isFinite(n) || n <= 0) return null
    return incomeForm.amountIncludesVat ? calcVatFromGross(n) : calcVatFromNet(n)
  }, [incomeForm.amount, incomeForm.amountIncludesVat])

  const incomeGrossAmount = incomeVatPreview?.gross ?? 0

  const incomePaymentPreview = useMemo(() => {
    if (incomeForm.status !== 'paid') return null
    const gross = incomeGrossAmount
    const paid = Number.parseFloat(incomeForm.paidAmount.replace(/,/g, ''))
    if (!gross || !Number.isFinite(paid) || paid <= 0) return null
    return {
      gross,
      paid,
      remaining: Math.max(0, Math.round((gross - paid) * 100) / 100),
    }
  }, [incomeForm.status, incomeForm.paidAmount, incomeGrossAmount])

  const selectedClientBalance = useMemo(() => {
    const c = clients.find((x) => x.id === incomeForm.clientId)
    return c?.financeBalance ?? 0
  }, [clients, incomeForm.clientId])

  const editingPaymentRecords = useMemo(
    () => (editingIncome ? incomePaymentRecords(editingIncome) : []),
    [editingIncome],
  )

  const editingTotalPaid = useMemo(
    () => (editingIncome ? incomeTotalPaid(editingIncome) : 0),
    [editingIncome],
  )

  const editingOutstanding = useMemo(
    () => (editingIncome ? incomeOutstandingAmount(editingIncome) : 0),
    [editingIncome],
  )

  const hasPaymentHistory = editingPaymentRecords.length > 0

  useEffect(() => {
    if (!editingIncome) return
    const fresh = incomes.find((i) => i.id === editingIncome.id)
    if (!fresh) return
    const paidChanged = incomeTotalPaid(fresh) !== incomeTotalPaid(editingIncome)
    const statusChanged = fresh.status !== editingIncome.status
    if (!paidChanged && !statusChanged) return
    setEditingIncome(fresh)
    const outstanding = incomeOutstandingAmount(fresh)
    setAdditionalPayment((prev) => ({
      ...prev,
      amount: outstanding > 0 ? String(outstanding) : '',
    }))
  }, [incomes, editingIncome])

  const projectFilterOptions = useMemo(
    () =>
      [...projects]
        .sort((a, b) => a.name.localeCompare(b.name, 'he'))
        .map((p) => ({ value: p.id, label: p.name })),
    [projects],
  )
  const clientFilterOptions = useMemo(
    () =>
      [...clients]
        .sort((a, b) => a.name.localeCompare(b.name, 'he'))
        .map((c) => ({ value: c.id, label: c.name })),
    [clients],
  )

  const openProjectPanel = (projectId: string) => {
    const p = projects.find((x) => x.id === projectId)
    if (p) setPanelProject(p)
  }

  const openAddIncome = (documentKind: FinanceIncomeDocumentKind = 'transaction_invoice') => {
    setEditingIncome(null)
    setIncomeForm({ ...emptyIncomeForm(), documentKind })
    setAdditionalPayment(emptyAdditionalPayment())
    setEditingPaymentId(null)
    setPaymentEditForm(emptyAdditionalPayment())
    setIncomeModalOpen(true)
  }

  const openEditIncome = (row: FinanceIncome) => {
    const source =
      incomes.find((i) => i.id === row.id) ??
      ({
        ...row,
        invoiceDate: row.sourceInvoiceDate ?? row.invoiceDate,
      } as FinanceIncome)
    setEditingIncome(source)
    const includesVat = source.amountIncludesVat !== false
    const displayAmount = includesVat
      ? source.amount
      : (source.amountBeforeVat ?? calcVatFromGross(source.amount).net)
    const docDate = source.invoiceDate.slice(0, 10)
    setIncomeForm({
      documentKind: incomeDocumentKind(source),
      projectId: source.projectId,
      clientId: source.clientId,
      amount: String(displayAmount),
      amountIncludesVat: includesVat,
      invoiceNumber: source.invoiceNumber,
      invoiceDate: docDate,
      description: source.description ?? '',
      status: source.status === 'partial' ? 'paid' : source.status,
      monthlyRetainer: source.monthlyRetainer === true,
      hostingType:
        source.hostingType ??
        (source.hostingClient
          ? source.monthlyRetainer
            ? 'monthly'
            : 'yearly'
          : ''),
      paymentMethod: source.paymentMethod ?? 'bank_transfer',
      paidAmount:
        source.status === 'paid' || source.status === 'partial'
          ? String(source.paidAmount ?? source.amount)
          : '',
      paidDate: isTaxReceiptIncome(source)
        ? docDate
        : incomePaymentDate(source),
    })
    const outstanding = incomeOutstandingAmount(source)
    setAdditionalPayment({
      amount: outstanding > 0 ? String(outstanding) : '',
      paymentMethod: 'bank_transfer',
      paidDate: isTaxReceiptIncome(source) ? docDate : todayYmd(),
    })
    setEditingPaymentId(null)
    setPaymentEditForm(emptyAdditionalPayment())
    setIncomeModalOpen(true)
  }

  const openEditPayment = (payment: (typeof editingPaymentRecords)[number]) => {
    setEditingPaymentId(payment.id)
    setPaymentEditForm({
      amount: String(payment.amount),
      paymentMethod: payment.paymentMethod,
      paidDate: payment.paidDate.slice(0, 10),
    })
  }

  const cancelEditPayment = () => {
    setEditingPaymentId(null)
    setPaymentEditForm(emptyAdditionalPayment())
  }

  const requestDeletePayment = (paymentId: string) => {
    if (!editingIncome) return
    if (editingPaymentId === paymentId) cancelEditPayment()
    setDeletePaymentTarget({
      incomeId: editingIncome.id,
      paymentId,
    })
  }

  const confirmDeletePayment = () => {
    if (!deletePaymentTarget) return
    void deleteIncomePayment(
      deletePaymentTarget.incomeId,
      deletePaymentTarget.paymentId,
    ).then(() => setDeletePaymentTarget(null))
  }

  const submitPaymentEdit = () => {
    if (!editingIncome || !editingPaymentId) return
    const amount = Number.parseFloat(paymentEditForm.amount.replace(/,/g, ''))
    const maxAmount = maxPaymentAmountForEdit(
      editingIncome.amount,
      editingPaymentRecords,
      editingPaymentId,
    )
    if (!Number.isFinite(amount) || amount <= 0 || amount > maxAmount + 0.001) return
    const payload: UpdateIncomePaymentInput = {
      amount,
      paymentMethod: paymentEditForm.paymentMethod,
      paidDate: paymentEditForm.paidDate.slice(0, 10),
    }
    void updateIncomePayment(editingIncome.id, editingPaymentId, payload).then(() => {
      cancelEditPayment()
    })
  }

  const submitAdditionalPayment = () => {
    if (!editingIncome) return
    const amount = Number.parseFloat(additionalPayment.amount.replace(/,/g, ''))
    if (!Number.isFinite(amount) || amount <= 0) return
    if (amount > editingOutstanding + 0.001) return
    const payload: AddIncomePaymentInput = {
      amount,
      paymentMethod: additionalPayment.paymentMethod,
      paidDate: additionalPayment.paidDate.slice(0, 10),
    }
    void addIncomePayment(editingIncome.id, payload)
  }

  const submitIncome = () => {
    const amount = Number.parseFloat(incomeForm.amount.replace(/,/g, ''))
    const isHosting = incomeForm.hostingType !== ''
    const isTaxReceipt = incomeForm.documentKind === 'tax_receipt'
    if (
      (!isHosting && !incomeForm.projectId) ||
      !incomeForm.clientId ||
      !Number.isFinite(amount) ||
      amount <= 0 ||
      !incomeForm.invoiceNumber.trim() ||
      !incomeForm.invoiceDate.trim()
    ) {
      return
    }
    const vatBreakdown = incomeForm.amountIncludesVat
      ? calcVatFromGross(amount)
      : calcVatFromNet(amount)
    const gross = vatBreakdown.gross

    let finalStatus = incomeForm.status
    let paidAmount: number | undefined
    let paymentMethod: FinancePaymentMethod | undefined
    let paidDate: string | undefined

    if (incomeForm.status === 'paid') {
      paidAmount = Number.parseFloat(incomeForm.paidAmount.replace(/,/g, ''))
      if (!Number.isFinite(paidAmount) || paidAmount <= 0 || paidAmount > gross) {
        return
      }
      paymentMethod = incomeForm.paymentMethod
      paidDate = isTaxReceipt
        ? incomeForm.invoiceDate.slice(0, 10)
        : incomeForm.paidDate.slice(0, 10)
      finalStatus = resolveIncomeStatusFromPayment(
        gross,
        paidAmount,
        incomeForm.status,
      )
    }

    const monthlyRetainer = isHosting
      ? hostingTypeUsesMonthPicker(incomeForm.hostingType)
      : incomeForm.monthlyRetainer

    const invoiceDate = incomeForm.invoiceDate.slice(0, 10)
    if (isTaxReceipt) {
      paidDate = invoiceDate
    }

    const payload: NewFinanceIncomeInput = {
      projectId: isHosting ? undefined : incomeForm.projectId,
      clientId: incomeForm.clientId,
      amount: gross,
      amountIncludesVat: incomeForm.amountIncludesVat,
      vatAmount: vatBreakdown.vat,
      amountBeforeVat: vatBreakdown.net,
      documentKind: incomeForm.documentKind,
      invoiceNumber: incomeForm.invoiceNumber,
      invoiceDate,
      description: incomeForm.description.trim() || undefined,
      status: finalStatus,
      monthlyRetainer,
      hostingClient: isHosting,
      ...(isHosting
        ? { hostingType: incomeForm.hostingType as FinanceHostingType }
        : {}),
      paidAmount,
      paymentMethod,
      paidDate,
    }
    if (editingIncome) {
      const updatePatch: FinanceIncomePatchInput = {
        projectId: isHosting ? undefined : incomeForm.projectId,
        clientId: incomeForm.clientId,
        amount: gross,
        amountIncludesVat: incomeForm.amountIncludesVat,
        vatAmount: vatBreakdown.vat,
        amountBeforeVat: vatBreakdown.net,
        documentKind: incomeForm.documentKind,
        invoiceNumber: incomeForm.invoiceNumber,
        invoiceDate,
        description: incomeForm.description.trim() || null,
        status: hasPaymentHistory ? editingIncome.status : finalStatus,
        monthlyRetainer,
        hostingClient: isHosting,
        hostingType: isHosting
          ? (incomeForm.hostingType as FinanceHostingType)
          : null,
      }
      if (!hasPaymentHistory) {
        updatePatch.paidAmount = paidAmount ?? null
        updatePatch.paymentMethod = paymentMethod ?? null
        updatePatch.paidDate = paidDate ?? null
      } else if (isTaxReceipt && editingIncome) {
        const synced = syncTaxReceiptPaymentDate(
          invoiceDate,
          editingIncome.payments,
        )
        updatePatch.invoiceDate = synced.invoiceDate
        updatePatch.paidDate = synced.paidDate
        if (synced.payments) updatePatch.payments = synced.payments
      }
      void updateIncome(editingIncome.id, updatePatch).then(() =>
        setIncomeModalOpen(false),
      )
    } else {
      void addIncome(payload).then(() => setIncomeModalOpen(false))
    }
  }

  const openAddExpense = () => {
    setEditingExpense(null)
    setExpenseForm({
      ...emptyExpenseForm(),
      clientId: filterClientId,
    })
    setExpenseModalOpen(true)
  }

  const openEditExpense = (row: FinanceExpense) => {
    const source =
      expenses.find((e) => e.id === row.id) ??
      ({
        ...row,
        billingMonth: row.sourceBillingMonth ?? row.billingMonth,
      } as FinanceExpense)
    setEditingExpense(source)
    const includesVat = source.amountIncludesVat !== false
    const displayAmount = includesVat
      ? source.amount
      : (source.amountBeforeVat ?? calcVatFromGross(source.amount).net)
    setExpenseForm({
      type: source.type,
      clientId:
        source.clientId ??
        (source.projectId ? projectClientById.get(source.projectId) ?? '' : ''),
      employeeName:
        source.employeeName ??
        (resolveExpenseType(source.type, expenseTypeById).fieldMode === 'salary' &&
        source.name?.startsWith('משכורת — ')
          ? source.name.slice('משכורת — '.length)
          : ''),
      supplierId:
        source.supplierId ??
        suppliers.find((s) => s.name === source.supplierName)?.id ??
        '',
      platformName: source.platformName ?? 'Google Ads',
      projectId: source.projectId ?? '',
      linkedIncomeId:
        source.linkedIncomeId ??
        resolveLinkedIncome(source, incomes)?.id ??
        '',
      name: source.name ?? source.description ?? '',
      amount: String(displayAmount),
      vatClass: resolveExpenseVatClass(source),
      amountIncludesVat: includesVat,
      description: source.description ?? '',
      billingMonth: source.billingMonth,
      recurring: source.recurring,
      supplierInvoiceReceived: source.supplierInvoiceReceived === true,
    })
    setExpenseModalOpen(true)
  }

  const submitExpense = () => {
    const parsed = Number.parseFloat(expenseForm.amount.replace(/,/g, ''))
    const typeDef = resolveExpenseType(expenseForm.type, expenseTypeById)
    if (!Number.isFinite(parsed) || parsed <= 0 || !expenseForm.billingMonth) {
      return
    }
    if (typeDef.fieldMode === 'salary') {
      if (!expenseForm.employeeName.trim()) return
    } else if (!expenseForm.name.trim()) {
      return
    }
    if (typeDef.fieldMode === 'supplier' && !expenseForm.supplierId.trim()) {
      return
    }
    const isVatLiable = expenseForm.vatClass === 'vat_liable'
    const vatBreakdown = isVatLiable
      ? expenseForm.amountIncludesVat
        ? calcVatFromGross(parsed)
        : calcVatFromNet(parsed)
      : {
          gross: Math.round(parsed * 100) / 100,
          net: Math.round(parsed * 100) / 100,
          vat: 0,
          rate: 0.18,
        }
    const selectedSupplier = suppliers.find(
      (s) => s.id === expenseForm.supplierId,
    )
    const employeeNameTrimmed = expenseForm.employeeName.trim()
    const projectIdTrimmed =
      typeDef.fieldMode === 'salary' ? '' : expenseForm.projectId.trim()
    const pnlFields = resolveExpensePnlFields(
      projectIdTrimmed || undefined,
      expenseForm.linkedIncomeId,
      expenseForm.billingMonth,
      incomes,
    )
    const payload: NewFinanceExpenseInput = {
      type: expenseForm.type,
      supplierId:
        typeDef.fieldMode === 'supplier'
          ? expenseForm.supplierId.trim()
          : undefined,
      supplierName:
        typeDef.fieldMode === 'supplier'
          ? selectedSupplier?.name ?? undefined
          : undefined,
      platformName:
        typeDef.fieldMode === 'platform'
          ? expenseForm.platformName.trim()
          : undefined,
      projectId: projectIdTrimmed || undefined,
      clientId:
        typeDef.fieldMode === 'salary'
          ? undefined
          : expenseForm.clientId.trim() || undefined,
      ...pnlFields,
      amount: vatBreakdown.gross,
      vatClass: expenseForm.vatClass,
      vatLiable: vatClassToLiable(expenseForm.vatClass),
      amountIncludesVat: isVatLiable
        ? expenseForm.amountIncludesVat
        : true,
      vatAmount: vatBreakdown.vat,
      amountBeforeVat: vatBreakdown.net,
      name:
        typeDef.fieldMode === 'salary'
          ? `משכורת — ${employeeNameTrimmed}`
          : expenseForm.name.trim(),
      employeeName:
        typeDef.fieldMode === 'salary' ? employeeNameTrimmed : undefined,
      description: expenseForm.description.trim() || undefined,
      billingMonth: expenseForm.billingMonth,
      recurring:
        typeDef.fieldMode === 'salary'
          ? expenseForm.recurring
          : isOneTimeGeneralExpenseType(typeDef)
            ? false
            : expenseForm.recurring,
      supplierInvoiceReceived: expenseForm.supplierInvoiceReceived,
    }
    if (editingExpense) {
      void updateExpense(editingExpense.id, {
        ...payload,
        supplierId:
          typeDef.fieldMode === 'supplier' ? expenseForm.supplierId.trim() : null,
        supplierName:
          typeDef.fieldMode === 'supplier'
            ? (selectedSupplier?.name ?? null)
            : null,
        projectId:
          typeDef.fieldMode === 'salary' ? null : projectIdTrimmed || null,
        clientId:
          typeDef.fieldMode === 'salary'
            ? null
            : expenseForm.clientId.trim() || null,
        linkedIncomeId: projectIdTrimmed ? (pnlFields.linkedIncomeId ?? null) : null,
        pnlMonth: projectIdTrimmed ? (pnlFields.pnlMonth ?? null) : null,
        employeeName:
          typeDef.fieldMode === 'salary' ? employeeNameTrimmed : null,
        vatClass: expenseForm.vatClass,
        vatLiable: vatClassToLiable(expenseForm.vatClass),
        supplierInvoiceReceived: expenseForm.supplierInvoiceReceived,
      }).then(() => setExpenseModalOpen(false))
    } else {
      void addExpense(payload).then(() => setExpenseModalOpen(false))
    }
  }

  const submitNewExpenseType = async () => {
    const label = typeForm.label.trim()
    if (!label) return
    const newId = await addExpenseType(typeForm)
    if (newId) {
      setExpenseForm((f) => ({ ...f, type: newId }))
      setAddTypeModalOpen(false)
      setTypeForm(newExpenseTypeDefaults())
    }
  }

  const loading = incomesLoading || expensesLoading

  return (
    <div className="mx-auto min-w-0 w-full max-w-[1400px] space-y-6 px-4 py-8 sm:px-8">
      <header className="flex flex-col gap-4 md:flex-row md:flex-wrap md:items-center md:justify-between">
        <div className="min-w-0 text-right md:order-2 md:flex-1">
          <h1 className="text-[22px] font-extrabold leading-tight text-[var(--text-dark)] md:text-[26px]">
            פיננסים
          </h1>
          <p className="mt-1.5 text-[12px] leading-relaxed text-[var(--text-mid)] md:text-[13px]">
            ניהול הכנסות, הוצאות ורווחיות — אדמין בלבד
          </p>
        </div>
      </header>

      <section
        className={`flex flex-col gap-3 rounded-2xl ${hubSectionClass(4)} p-4 shadow-[0_2px_12px_rgba(0,0,0,0.06)] sm:flex-row sm:flex-wrap sm:items-end`}
      >
        <div className="min-w-0 flex-[2]">
          <FieldLabel>תקופה</FieldLabel>
          <div className="mb-2 flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => {
                setPeriodMode('single')
                if (filterYmFrom !== filterYmTo) {
                  setFilterYmTo(filterYmFrom)
                }
                setMonthPreset('pick')
              }}
              className={
                periodMode === 'single'
                  ? 'rounded-[10px] border border-[var(--orange)] bg-[var(--orange)] px-3 py-1.5 text-[11px] font-bold text-white'
                  : 'rounded-[10px] border border-[var(--border-orange-soft)] bg-[var(--dash-panel-bg)] px-3 py-1.5 text-[11px] font-semibold text-[var(--text-mid)] hover:bg-[var(--surface-muted)]'
              }
            >
              חודש בודד
            </button>
            <button
              type="button"
              onClick={() => setPeriodMode('range')}
              className={
                periodMode === 'range'
                  ? 'rounded-[10px] border border-[var(--orange)] bg-[var(--orange)] px-3 py-1.5 text-[11px] font-bold text-white'
                  : 'rounded-[10px] border border-[var(--border-orange-soft)] bg-[var(--dash-panel-bg)] px-3 py-1.5 text-[11px] font-semibold text-[var(--text-mid)] hover:bg-[var(--surface-muted)]'
              }
            >
              טווח
            </button>
            <span className="mx-1 hidden h-6 w-px self-center bg-[var(--border)] sm:inline" />
            {(
              [
                ['month', 'חודש נוכחי'],
                ['prev', 'חודש קודם'],
                ['q', '3 חודשים'],
                ['half', '6 חודשים'],
                ['year', '12 חודשים'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => applyMonthPreset(id)}
                className={
                  monthPreset === id
                    ? 'rounded-[10px] border border-[var(--orange)] bg-[var(--orange)] px-3 py-1.5 text-[11px] font-bold text-white'
                    : 'rounded-[10px] border border-[var(--border-orange-soft)] bg-[var(--dash-panel-bg)] px-3 py-1.5 text-[11px] font-semibold text-[var(--text-mid)] hover:bg-[var(--surface-muted)]'
                }
              >
                {label}
              </button>
            ))}
          </div>
          {periodMode === 'single' ? (
            <div>
              <span className="mb-1 block text-[10px] font-semibold text-[var(--text-light)]">
                בחר חודש
              </span>
              <HubDropdownSelect
                value={filterYmFrom}
                onChange={applySingleMonth}
                options={monthOptions(36)}
              />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <span className="mb-1 block text-[10px] font-semibold text-[var(--text-light)]">
                  מ-
                </span>
                <input
                  type="month"
                  value={filterYmFrom}
                  onChange={(e) => {
                    setMonthPreset('custom')
                    setFilterYmFrom(e.target.value)
                  }}
                  className={hubInputClass()}
                />
              </div>
              <div>
                <span className="mb-1 block text-[10px] font-semibold text-[var(--text-light)]">
                  עד
                </span>
                <input
                  type="month"
                  value={filterYmTo}
                  onChange={(e) => {
                    setMonthPreset('custom')
                    setFilterYmTo(e.target.value)
                  }}
                  className={hubInputClass()}
                />
              </div>
            </div>
          )}
          <p className="mt-1.5 text-[11px] font-semibold text-[var(--text-mid)]">
            {filterRangeLabel}
          </p>
        </div>
        <div className="min-w-[180px] flex-1">
          <FieldLabel>פרויקט</FieldLabel>
          <HubDropdownSelect
            value={filterProjectId}
            onChange={setFilterProjectId}
            options={projectFilterOptions}
            emptyOption={{ label: 'כל הפרויקטים' }}
          />
        </div>
        <div className="min-w-[180px] flex-1">
          <FieldLabel>לקוח</FieldLabel>
          <HubDropdownSelect
            value={filterClientId}
            onChange={setFilterClientId}
            options={clientFilterOptions}
            emptyOption={{ label: 'כל הלקוחות' }}
          />
        </div>
      </section>

      {filterClientId &&
      (clients.find((c) => c.id === filterClientId)?.financeBalance ?? 0) > 0 ? (
        <div className="rounded-xl border border-[#F59E0B] bg-[#FFFBEB] px-4 py-3 text-sm text-[#92400E]">
          <span className="font-bold">יתרת לקוח: </span>
          {formatNis(
            clients.find((c) => c.id === filterClientId)?.financeBalance ?? 0,
          )}
          <span className="text-[12px]"> — חוב פתוח מתשלומים חלקיים</span>
        </div>
      ) : null}

      <section
        className={`rounded-2xl ${hubSectionClass(1)} border-2 border-[#F59E0B] p-4 shadow-[0_2px_12px_rgba(0,0,0,0.06)] sm:p-5`}
        aria-label="יתרה לגבייה"
      >
        <div className="mb-2 text-[10px] font-bold uppercase tracking-wide text-[#92400E]">
          תמיד בראש · לא מושפע מפילטר תאריך
        </div>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-xl">
            <div className="text-[14px] font-extrabold text-[#92400E]">
              יתרה לגבייה
            </div>
            <div className="mt-2 text-[11px] leading-snug text-[var(--text-mid)]">
              מה שלקוחות עדיין חייבים לי — לא נספר כהכנסה ולא נכנס לרווח
            </div>
          </div>
          <div className="text-[32px] font-extrabold tabular-nums leading-none text-[#F59E0B]">
            {formatNis(summary.collectionBalance)}
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface-muted)]/40 p-4 sm:p-5">
        <KpiRowLabel row={1} title="הכנסות" period={filterRangeLabel} />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <KpiCard
            index={1}
            seq={0}
            label="הכנסות ברוטו"
            value={formatNis(summary.incomeGross)}
            valueClass="text-[#10B981]"
            hint="כולל מע״מ שגביתי מלקוחות (מס קבלה לפי תאריך תשלום)"
          />
          <KpiCard
            index={2}
            seq={1}
            label="מע״מ עסקאות"
            value={formatNis(summary.incomeVat)}
            valueClass="text-[#6366F1]"
            hint="שייך למדינה — לא שלי"
          />
          <KpiCard
            index={3}
            seq={2}
            label="הכנסות נטו"
            value={formatNis(summary.incomeNet)}
            valueClass="text-[#059669]"
            hint="מה שבאמת שלי — ברוטו פחות מע״מ עסקאות"
          />
        </div>
      </section>

      <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface-muted)]/40 p-4 sm:p-5">
        <KpiRowLabel row={2} title="הוצאות" period={filterRangeLabel} />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <KpiCard
            index={4}
            seq={3}
            label="הוצאות חייבות מע״מ — ברוטו"
            value={formatNis(summary.expenseVatLiableGross)}
            valueClass="text-[#EF4444]"
            hint="חשבוניות מס מספקים — לפני קיזוז מע״מ תשומות"
          />
          <KpiCard
            index={5}
            seq={4}
            label="מע״מ תשומות"
            value={formatNis(summary.expenseInputVat)}
            valueClass="text-[#8B5CF6]"
            hint="שהמדינה מחזירה לי בקיזוז מול מע״מ עסקאות"
          />
          <KpiCard
            index={6}
            seq={5}
            label="הוצאות ללא מע״מ"
            value={formatNis(summary.expenseNonVatTotal)}
            valueClass="text-[#64748B]"
            hint="ביטוח לאומי, מסים, ספקים פטורים וכו׳ — סכום מלא"
          />
        </div>
      </section>

      <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface-muted)]/40 p-4 sm:p-5">
        <KpiRowLabel row={3} title="תוצאה" period={filterRangeLabel} />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <KpiCard
            index={7}
            seq={6}
            label="מע״מ לתשלום"
            value={formatNis(summary.vatPayable)}
            valueClass="text-[#6366F1]"
            hint="מע״מ עסקאות פחות מע״מ תשומות — מה שאני משלם לרשות המסים"
          />
          <KpiCard
            index={8}
            seq={7}
            label="רווח גולמי"
            value={formatNis(summary.grossProfit)}
            valueClass={
              summary.grossProfit >= 0 ? 'text-[#10B981]' : 'text-[#EF4444]'
            }
            hint="הכנסות נטו פחות כל ההוצאות נטו (חייבות + ללא מע״מ)"
          />
          <KpiCard
            index={9}
            seq={8}
            label="רווח נקי אמיתי"
            value={formatNis(summary.trueNetProfit)}
            valueClass={
              summary.trueNetProfit >= 0 ? 'text-[#10B981]' : 'text-[#EF4444]'
            }
            hint="רווח גולמי פחות מע״מ לתשלום — מה שנשאר לי בפועל"
          />
        </div>
      </section>

      <div className="flex flex-wrap gap-2 border-b border-[var(--border)] pb-1">
        {FINANCE_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={
              activeTab === tab.id
                ? 'rounded-t-[10px] border border-b-0 border-[var(--orange)] bg-[var(--orange)] px-4 py-2.5 text-xs font-bold text-white'
                : 'rounded-t-[10px] border border-transparent px-4 py-2.5 text-xs font-semibold text-[var(--text-mid)] hover:bg-[var(--surface-muted)]'
            }
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'receipts' ? (
      <section className={`rounded-2xl ${hubSectionClass(5)} p-4 shadow-[0_2px_12px_rgba(0,0,0,0.06)] sm:p-5`}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-extrabold text-[var(--text-dark)]">
              חשבוניות מס קבלה
            </h2>
            <p className="mt-1 text-[12px] text-[var(--text-mid)]">
              הכנסה בפועל — נספרת לרווח האמיתי
            </p>
          </div>
          <button
            type="button"
            onClick={() => openAddIncome('tax_receipt')}
            className="hub-btn-orange text-sm"
          >
            + הוסף מס קבלה
          </button>
        </div>
        {loading ? (
          <p className="text-sm text-[var(--text-mid)]">טוען…</p>
        ) : filteredTaxReceipts.length === 0 ? (
          <EmptyState
            title="אין חשבוניות מס קבלה לטווח הנבחר"
            description={`${filterRangeLabel} — הוסיפו מס קבלה או המירו מחשבונית עסקה`}
            icon={
              <svg viewBox="0 0 24 24" className="mx-auto h-10 w-10" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            }
          />
        ) : (
          <TaxReceiptTable
            rows={filteredTaxReceipts}
            clientNameById={clientNameById}
            projectNameById={projectNameById}
            onEdit={openEditIncome}
            onDelete={setDeleteIncomeId}
            onOpenProject={openProjectPanel}
          />
        )}
      </section>
      ) : null}

      {activeTab === 'collection' ? (
      <section className={`rounded-2xl ${hubSectionClass(6)} p-4 shadow-[0_2px_12px_rgba(0,0,0,0.06)] sm:p-5`}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-extrabold text-[var(--text-dark)]">
              יתרה לגבייה — פירוט
            </h2>
            <p className="mt-1 text-[12px] text-[var(--text-mid)]">
              לפי תקופה שנבחרה · סה״כ כל החודשים בקובייה למעלה
            </p>
          </div>
          <button
            type="button"
            onClick={() => openAddIncome('transaction_invoice')}
            className="hub-btn-orange text-sm"
          >
            + הוסף ליתרה לגבייה
          </button>
        </div>
        {loading ? (
          <p className="text-sm text-[var(--text-mid)]">טוען…</p>
        ) : filteredTransactionInvoices.length === 0 ? (
          <EmptyState
            title="אין רשומות ליתרה לגבייה בטווח הנבחר"
            description={`${filterRangeLabel} — הוסיפו רשומה או שנו את הסינון`}
            icon={
              <svg viewBox="0 0 24 24" className="mx-auto h-10 w-10" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M9 12h6m-6 4h4m8 2V7l-5-5H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2z" />
              </svg>
            }
          />
        ) : (
          <CollectionTable
            rows={filteredTransactionInvoices}
            clientNameById={clientNameById}
            projectNameById={projectNameById}
            onEdit={openEditIncome}
            onDelete={setDeleteIncomeId}
            onConvert={openConvertDialog}
            onOpenProject={openProjectPanel}
          />
        )}
      </section>
      ) : null}

      {activeTab === 'expenses' ? (
      <section className={`rounded-2xl ${hubSectionClass(7)} p-4 shadow-[0_2px_12px_rgba(0,0,0,0.06)] sm:p-5`}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-extrabold text-[var(--text-dark)]">הוצאות</h2>
          <button type="button" onClick={openAddExpense} className="hub-btn-orange text-sm">
            + הוסף הוצאה
          </button>
        </div>
        {loading ? (
          <p className="text-sm text-[var(--text-mid)]">טוען…</p>
        ) : filteredExpenses.length === 0 ? (
          <EmptyState
            title="אין הוצאות לטווח הנבחר"
            description={`${filterRangeLabel} — הוסיפו הוצאה או שנו את הסינון`}
            icon={
              <svg viewBox="0 0 24 24" className="mx-auto h-10 w-10" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M12 8v8m-4-4h8M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-[11px] font-bold text-[var(--text-mid)]">
                  <th className="px-3 py-2 text-right">תאריך</th>
                  <th className="px-3 py-2 text-right">שם הוצאה</th>
                  <th className="px-3 py-2 text-right">סוג</th>
                  <th className="px-3 py-2 text-right">ברוטו</th>
                  <th className="px-3 py-2 text-right">מע״מ</th>
                  <th className="px-3 py-2 text-right">נטו</th>
                  <th className="px-3 py-2 text-right">פרויקט</th>
                  <th className="px-3 py-2 text-right">פעולות</th>
                </tr>
              </thead>
              <tbody>
                {filteredExpenses.map((row) => {
                  const typeDef = resolveExpenseType(row.type, expenseTypeById)
                  const vatClass = resolveExpenseVatClass(row)
                  const breakdown = resolveExpenseRowVat(row)
                  const payMonth = expensePaymentMonth(row)
                  const pnlAttributed =
                    expenseUsesPnlAttribution(row, incomes) ||
                    row.isPnlAttribution === true
                  return (
                    <tr
                      key={`${row.id}-${row.pnlMonth ?? row.billingMonth}-${payMonth}`}
                      className="border-b border-[var(--border)] transition hover:bg-[var(--surface-muted)]"
                    >
                      <td className="px-3 py-3 align-top tabular-nums">
                        {monthLabelHe(pnlAttributed ? payMonth : row.billingMonth)}
                      </td>
                      <td className="px-3 py-3 align-top">
                        <div className="font-semibold text-[var(--text-dark)]">
                          {expenseDisplayName(row, typeDef)}
                        </div>
                        <div className="mt-0.5 text-[10px] text-[var(--text-mid)]">
                          {typeDef.label}
                        </div>
                      </td>
                      <td className="px-3 py-3 align-top">
                        <span className="rounded-full bg-[var(--surface-muted)] px-2 py-0.5 text-[10px] font-bold text-[var(--text-mid)]">
                          {EXPENSE_VAT_CLASS_SHORT[vatClass]}
                        </span>
                      </td>
                      <td className="px-3 py-3 align-top tabular-nums font-bold">
                        {formatNis(breakdown.gross)}
                      </td>
                      <td className="px-3 py-3 align-top tabular-nums text-[#8B5CF6]">
                        {vatClass === 'vat_liable' ? formatNis(breakdown.vat) : '—'}
                      </td>
                      <td className="px-3 py-3 align-top tabular-nums font-bold text-[#EF4444]">
                        {formatNis(breakdown.net)}
                      </td>
                      <td className="px-3 py-3 align-top">
                        {row.projectId ? (
                          <button
                            type="button"
                            onClick={() => openProjectPanel(row.projectId!)}
                            className="text-[11px] font-semibold text-[var(--orange)] underline decoration-dotted"
                          >
                            {projectNameById.get(row.projectId) ?? '—'}
                          </button>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-3 py-3 align-top">
                        <div className="flex flex-wrap gap-1.5">
                          <button type="button" className={uiBtnSmOutline} onClick={() => openEditExpense(row)}>
                            עריכה
                          </button>
                          <button type="button" className={uiBtnDanger} onClick={() => setDeleteExpenseId(row.id)}>
                            מחק
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
      ) : null}

      {activeTab === 'pnl' ? (
      <section className={`rounded-2xl ${hubSectionClass(8)} p-4 shadow-[0_2px_12px_rgba(0,0,0,0.06)] sm:p-5`}>
        <h2 className="mb-4 text-lg font-extrabold text-[var(--text-dark)]">
          דוח רווח והפסד — סיכום חודשי
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-[11px] font-bold text-[var(--text-mid)]">
                <th className="px-2 py-2 text-right">חודש</th>
                <th className="px-2 py-2 text-right">הכנסות נטו</th>
                <th className="px-2 py-2 text-right">הוצאות נטו</th>
                <th className="px-2 py-2 text-right">מע״מ לתשלום</th>
                <th className="px-2 py-2 text-right">רווח נקי</th>
              </tr>
            </thead>
            <tbody>
              {pnlRows.map((row) => {
                const rowBg =
                  row.trueNetProfit > 0
                    ? 'rgba(16,185,129,0.08)'
                    : row.trueNetProfit < 0
                      ? 'rgba(239,68,68,0.08)'
                      : undefined
                return (
                  <tr
                    key={row.ym}
                    className="border-b border-[var(--border)] transition hover:brightness-[0.98]"
                    style={{ backgroundColor: rowBg }}
                  >
                    <td className="px-2 py-2.5 font-semibold">{row.label}</td>
                    <td className="px-2 py-2.5 tabular-nums text-[#10B981]">
                      {formatNis(row.incomeNet)}
                    </td>
                    <td className="px-2 py-2.5 tabular-nums text-[#EF4444]">
                      {formatNis(row.expenseNet)}
                    </td>
                    <td className="px-2 py-2.5 tabular-nums text-[#6366F1]">
                      {formatNis(row.vatPayable)}
                    </td>
                    <td
                      className={`px-2 py-2.5 tabular-nums font-bold ${
                        row.trueNetProfit >= 0 ? 'text-[#10B981]' : 'text-[#EF4444]'
                      }`}
                    >
                      {formatNis(row.trueNetProfit)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>
      ) : null}

      {panelProject ? (
        <ProjectFinancePanel
          project={panelProject}
          client={
            panelProject.clientId
              ? clients.find((c) => c.id === panelProject.clientId)
              : undefined
          }
          incomes={incomes}
          expenses={expenses}
          onClose={() => setPanelProject(null)}
        />
      ) : null}

      <Modal
        isOpen={incomeModalOpen}
        onClose={() => setIncomeModalOpen(false)}
        title={
          editingIncome
            ? `עריכת ${FINANCE_INCOME_DOCUMENT_LABELS[incomeForm.documentKind]}`
            : incomeForm.documentKind === 'tax_receipt'
              ? 'הוספת חשבונית מס קבלה'
              : 'הוספת חשבונית עסקה'
        }
        size="lg"
      >
        <div className="space-y-4">
          <div>
            <FieldLabel>סוג מסמך</FieldLabel>
            {editingIncome ? (
              <div
                className={`inline-flex rounded-full px-3 py-1.5 text-xs font-bold ${
                  incomeForm.documentKind === 'tax_receipt'
                    ? 'bg-[#ECFDF5] text-[#059669]'
                    : 'bg-[#EEF2FF] text-[#6366F1]'
                }`}
              >
                {FINANCE_INCOME_DOCUMENT_LABELS[incomeForm.documentKind]}
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    'transaction_invoice',
                    'tax_receipt',
                  ] as FinanceIncomeDocumentKind[]
                ).map((kind) => (
                  <button
                    key={kind}
                    type="button"
                    onClick={() =>
                      setIncomeForm((f) => ({ ...f, documentKind: kind }))
                    }
                    className={
                      incomeForm.documentKind === kind
                        ? 'rounded-[10px] border border-[var(--orange)] bg-[var(--orange)] px-4 py-2 text-xs font-bold text-white'
                        : 'rounded-[10px] border border-[var(--border-orange-soft)] bg-[var(--dash-panel-bg)] px-4 py-2 text-xs font-semibold text-[var(--text-mid)] hover:bg-[var(--surface-muted)]'
                    }
                  >
                    {FINANCE_INCOME_DOCUMENT_LABELS[kind]}
                  </button>
                ))}
              </div>
            )}
            <p className="mt-2 text-[11px] leading-relaxed text-[var(--text-mid)]">
              {incomeForm.documentKind === 'tax_receipt'
                ? 'נספר לרווח בפועל לפי סכום המסמך המלא.'
                : 'יתרה לגבייה — המירו למס קבלה כשמתקבל תשלום.'}
            </p>
          </div>
          <div>
            <FieldLabel>סוג הכנסה</FieldLabel>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() =>
                  setIncomeForm((f) => ({
                    ...f,
                    hostingType: '',
                    projectId: f.projectId,
                  }))
                }
                className={
                  incomeForm.hostingType === ''
                    ? 'rounded-[10px] border border-[var(--orange)] bg-[var(--orange)] px-4 py-2 text-xs font-bold text-white'
                    : 'rounded-[10px] border border-[var(--border-orange-soft)] bg-[var(--dash-panel-bg)] px-4 py-2 text-xs font-semibold text-[var(--text-mid)] hover:bg-[var(--surface-muted)]'
                }
              >
                פרויקט
              </button>
              <button
                type="button"
                onClick={() =>
                  setIncomeForm((f) => ({
                    ...f,
                    hostingType: 'monthly',
                    projectId: '',
                    monthlyRetainer: true,
                    invoiceDate: `${f.invoiceDate.slice(0, 7)}-01`,
                  }))
                }
                className={
                  incomeForm.hostingType === 'monthly'
                    ? 'rounded-[10px] border border-[var(--orange)] bg-[var(--orange)] px-4 py-2 text-xs font-bold text-white'
                    : 'rounded-[10px] border border-[var(--border-orange-soft)] bg-[var(--dash-panel-bg)] px-4 py-2 text-xs font-semibold text-[var(--text-mid)] hover:bg-[var(--surface-muted)]'
                }
              >
                {HOSTING_TYPE_LABEL.monthly}
              </button>
              <button
                type="button"
                onClick={() =>
                  setIncomeForm((f) => ({
                    ...f,
                    hostingType: 'yearly',
                    projectId: '',
                    monthlyRetainer: false,
                  }))
                }
                className={
                  incomeForm.hostingType === 'yearly'
                    ? 'rounded-[10px] border border-[var(--orange)] bg-[var(--orange)] px-4 py-2 text-xs font-bold text-white'
                    : 'rounded-[10px] border border-[var(--border-orange-soft)] bg-[var(--dash-panel-bg)] px-4 py-2 text-xs font-semibold text-[var(--text-mid)] hover:bg-[var(--surface-muted)]'
                }
              >
                {HOSTING_TYPE_LABEL.yearly}
              </button>
              <button
                type="button"
                onClick={() =>
                  setIncomeForm((f) => ({
                    ...f,
                    hostingType: 'portal_monthly',
                    projectId: '',
                    monthlyRetainer: true,
                    invoiceDate: `${f.invoiceDate.slice(0, 7)}-01`,
                  }))
                }
                className={
                  incomeForm.hostingType === 'portal_monthly'
                    ? 'rounded-[10px] border border-[var(--orange)] bg-[var(--orange)] px-4 py-2 text-xs font-bold text-white'
                    : 'rounded-[10px] border border-[var(--border-orange-soft)] bg-[var(--dash-panel-bg)] px-4 py-2 text-xs font-semibold text-[var(--text-mid)] hover:bg-[var(--surface-muted)]'
                }
              >
                {HOSTING_TYPE_LABEL.portal_monthly}
              </button>
            </div>
          </div>
          {incomeForm.hostingType === '' ? (
            <div>
              <FieldLabel>פרויקט *</FieldLabel>
              <ProjectQuickSelect
                projects={openProjects}
                value={incomeForm.projectId}
                clientNameById={clientNameById}
                onChange={(projectId) => {
                  const p = projects.find((x) => x.id === projectId)
                  setIncomeForm((f) => ({
                    ...f,
                    projectId,
                    clientId: p?.clientId ?? f.clientId,
                    monthlyRetainer:
                      p?.projectType === 'retainer' ? true : f.monthlyRetainer,
                  }))
                }}
              />
            </div>
          ) : (
            <p className="rounded-lg border border-[var(--border)] bg-[var(--bg-main)] px-3 py-2 text-[12px] text-[var(--text-mid)]">
              {incomeForm.hostingType === 'monthly'
                ? 'אחסון אתר חודשי — חוזר אוטומטית בכל חודש מהתחלה ועד סוף השנה.'
                : incomeForm.hostingType === 'portal_monthly'
                  ? 'פורטל BizBakrayot — ריטיינר חודשי, חוזר אוטומטית בכל חודש מהתחלה ועד סוף השנה.'
                  : 'אחסון אתר שנתי — רשומה חד־פעמית לפי תאריך החשבון.'}
            </p>
          )}
          <div>
            <FieldLabel>לקוח *</FieldLabel>
            <ClientQuickSelect
              clients={clients}
              value={incomeForm.clientId}
              onChange={(clientId) =>
                setIncomeForm((f) => ({ ...f, clientId }))
              }
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <FieldLabel>סוג סכום</FieldLabel>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setIncomeForm((f) => ({ ...f, amountIncludesVat: true }))
                  }
                  className={
                    incomeForm.amountIncludesVat
                      ? 'rounded-[10px] border border-[var(--orange)] bg-[var(--orange)] px-4 py-2 text-xs font-bold text-white'
                      : 'rounded-[10px] border border-[var(--border-orange-soft)] bg-[var(--dash-panel-bg)] px-4 py-2 text-xs font-semibold text-[var(--text-mid)] hover:bg-[var(--surface-muted)]'
                  }
                >
                  כולל מע״מ
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setIncomeForm((f) => ({ ...f, amountIncludesVat: false }))
                  }
                  className={
                    !incomeForm.amountIncludesVat
                      ? 'rounded-[10px] border border-[var(--orange)] bg-[var(--orange)] px-4 py-2 text-xs font-bold text-white'
                      : 'rounded-[10px] border border-[var(--border-orange-soft)] bg-[var(--dash-panel-bg)] px-4 py-2 text-xs font-semibold text-[var(--text-mid)] hover:bg-[var(--surface-muted)]'
                  }
                >
                  לפני מע״מ
                </button>
              </div>
            </div>
            <div>
              <FieldLabel>
                {incomeForm.amountIncludesVat
                  ? `סכום כולל מע״מ (₪) *`
                  : `סכום לפני מע״מ (₪) *`}
              </FieldLabel>
              <input
                type="number"
                min={0}
                step="0.01"
                value={incomeForm.amount}
                onChange={(e) =>
                  setIncomeForm((f) => ({ ...f, amount: e.target.value }))
                }
                className={hubInputClass()}
              />
              {incomeVatPreview ? (
                <div className="mt-2 space-y-0.5 rounded-lg border border-[var(--border)] bg-[var(--bg-main)] px-3 py-2 text-[11px] text-[var(--text-mid)]">
                  <div className="flex justify-between gap-2">
                    <span>לפני מע״מ</span>
                    <span className="tabular-nums font-semibold text-[var(--text-dark)]">
                      {formatNisPlain(incomeVatPreview.net)}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span>מע״מ ({ISRAEL_VAT_PERCENT_LABEL})</span>
                    <span className="tabular-nums font-semibold text-[var(--text-dark)]">
                      {formatNisPlain(incomeVatPreview.vat)}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2 border-t border-[var(--border)] pt-1 font-bold text-[var(--text-dark)]">
                    <span>סה״כ כולל מע״מ</span>
                    <span className="tabular-nums">
                      {formatNisPlain(incomeVatPreview.gross)}
                    </span>
                  </div>
                </div>
              ) : null}
            </div>
            <div>
              <FieldLabel>
                {incomeDocumentNumberLabel(incomeForm.documentKind)}
              </FieldLabel>
              <input
                type="text"
                value={incomeForm.invoiceNumber}
                onChange={(e) =>
                  setIncomeForm((f) => ({ ...f, invoiceNumber: e.target.value }))
                }
                placeholder={
                  incomeForm.documentKind === 'tax_receipt'
                    ? 'מספר חשבונית מס קבלה'
                    : 'מספר חשבונית עסקה'
                }
                className={hubInputClass()}
              />
            </div>
            <div>
              <FieldLabel>
                {hostingTypeUsesMonthPicker(incomeForm.hostingType) ||
                incomeForm.monthlyRetainer
                  ? incomeForm.documentKind === 'tax_receipt'
                    ? 'חודש מס קבלה (= תשלום) *'
                    : 'חודש התחלה *'
                  : incomeForm.hostingType === 'yearly'
                    ? 'תאריך חשבון שנתי *'
                    : incomeDocumentDateLabel(incomeForm.documentKind)}
              </FieldLabel>
              {hostingTypeUsesMonthPicker(incomeForm.hostingType) ||
              incomeForm.monthlyRetainer ? (
                <input
                  type="month"
                  value={incomeForm.invoiceDate.slice(0, 7)}
                  onChange={(e) => {
                    const d = `${e.target.value}-01`
                    setIncomeForm((f) =>
                      f.documentKind === 'tax_receipt'
                        ? { ...f, invoiceDate: d, paidDate: d }
                        : { ...f, invoiceDate: d },
                    )
                  }}
                  className={hubInputClass()}
                />
              ) : (
                <input
                  type="date"
                  value={incomeForm.invoiceDate}
                  onChange={(e) => {
                    const d = e.target.value
                    setIncomeForm((f) =>
                      f.documentKind === 'tax_receipt'
                        ? { ...f, invoiceDate: d, paidDate: d }
                        : { ...f, invoiceDate: d },
                    )
                  }}
                  className={hubInputClass()}
                />
              )}
            </div>
            <div>
              <FieldLabel>סטטוס</FieldLabel>
              <HubDropdownSelect
                value={incomeForm.status === 'partial' ? 'paid' : incomeForm.status}
                onChange={(status) =>
                  setIncomeForm((f) => {
                    const nextStatus = status as FinanceIncomeStatus
                    const gross =
                      (incomeVatPreview?.gross ??
                        Number.parseFloat(f.amount.replace(/,/g, ''))) ||
                      0
                    return {
                      ...f,
                      status: nextStatus === 'partial' ? 'paid' : nextStatus,
                      paidAmount:
                        nextStatus === 'paid' && !f.paidAmount
                          ? gross > 0
                            ? String(gross)
                            : f.paidAmount
                          : nextStatus === 'paid'
                            ? f.paidAmount
                            : '',
                      paidDate:
                        nextStatus === 'paid' && !f.paidDate
                          ? f.documentKind === 'tax_receipt' && f.invoiceDate
                            ? f.invoiceDate
                            : todayYmd()
                          : nextStatus === 'paid' &&
                              f.documentKind === 'tax_receipt'
                            ? f.invoiceDate || f.paidDate
                            : f.paidDate,
                    }
                  })
                }
                options={[
                  { value: 'paid', label: 'שולם' },
                  { value: 'pending', label: 'ממתין' },
                  { value: 'overdue', label: 'באיחור' },
                ]}
              />
            </div>
          </div>
          {incomeForm.status === 'paid' && !hasPaymentHistory ? (
            <div className="space-y-4 rounded-xl border border-[var(--border-orange-soft)] bg-[var(--orange-light)]/30 p-4">
              <div>
                <FieldLabel>אופן התשלום *</FieldLabel>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setIncomeForm((f) => ({
                        ...f,
                        paymentMethod: 'bank_transfer',
                      }))
                    }
                    className={
                      incomeForm.paymentMethod === 'bank_transfer'
                        ? 'rounded-[10px] border border-[var(--orange)] bg-[var(--orange)] px-4 py-2 text-xs font-bold text-white'
                        : 'rounded-[10px] border border-[var(--border-orange-soft)] bg-white px-4 py-2 text-xs font-semibold text-[var(--text-mid)] hover:bg-[var(--surface-muted)]'
                    }
                  >
                    {PAYMENT_METHOD_LABEL.bank_transfer}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setIncomeForm((f) => ({
                        ...f,
                        paymentMethod: 'credit_card',
                      }))
                    }
                    className={
                      incomeForm.paymentMethod === 'credit_card'
                        ? 'rounded-[10px] border border-[var(--orange)] bg-[var(--orange)] px-4 py-2 text-xs font-bold text-white'
                        : 'rounded-[10px] border border-[var(--border-orange-soft)] bg-white px-4 py-2 text-xs font-semibold text-[var(--text-mid)] hover:bg-[var(--surface-muted)]'
                    }
                  >
                    {PAYMENT_METHOD_LABEL.credit_card}
                  </button>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <FieldLabel>סכום ששולם (₪) *</FieldLabel>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    max={incomeGrossAmount || undefined}
                    value={incomeForm.paidAmount}
                    onChange={(e) =>
                      setIncomeForm((f) => ({ ...f, paidAmount: e.target.value }))
                    }
                    placeholder={
                      incomeGrossAmount > 0 ? String(incomeGrossAmount) : '0'
                    }
                    className={hubInputClass()}
                  />
                  {incomeGrossAmount > 0 ? (
                    <p className="mt-1 text-[11px] text-[var(--text-mid)]">
                      סה״כ חשבון: {formatNisPlain(incomeGrossAmount)}
                    </p>
                  ) : null}
                </div>
                {incomeForm.documentKind !== 'tax_receipt' ? (
                  <div>
                    <FieldLabel>תאריך תשלום</FieldLabel>
                    <input
                      type="date"
                      value={incomeForm.paidDate}
                      onChange={(e) =>
                        setIncomeForm((f) => ({ ...f, paidDate: e.target.value }))
                      }
                      className={hubInputClass()}
                    />
                  </div>
                ) : null}
              </div>
              {incomePaymentPreview && incomePaymentPreview.remaining > 0 ? (
                <div className="rounded-lg border border-[#F59E0B] bg-[#FFFBEB] px-3 py-2 text-[11px] text-[#92400E]">
                  <div className="font-bold">
                    תשלום חלקי — יתרה של {formatNisPlain(incomePaymentPreview.remaining)}{' '}
                    תיכנס ליתרת הלקוח
                  </div>
                  {selectedClientBalance > 0 ? (
                    <div className="mt-1">
                      יתרת לקוח נוכחית: {formatNisPlain(selectedClientBalance)}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
          {hasPaymentHistory ? (
            <div className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--bg-main)] p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <FieldLabel>תשלומים שנרשמו</FieldLabel>
                <div className="text-[11px] font-semibold text-[var(--text-mid)]">
                  שולם: {formatNisPlain(editingTotalPaid)} · יתרה:{' '}
                  {formatNisPlain(editingOutstanding)}
                </div>
              </div>
              <ul className="space-y-2">
                {editingPaymentRecords.map((payment) => {
                  const isEditing = editingPaymentId === payment.id
                  const maxEditAmount = editingIncome
                    ? maxPaymentAmountForEdit(
                        editingIncome.amount,
                        editingPaymentRecords,
                        payment.id,
                      )
                    : 0
                  return (
                    <li
                      key={payment.id}
                      className="rounded-lg border border-[var(--border)] bg-white px-3 py-2.5 text-sm"
                    >
                      {isEditing ? (
                        <div className="space-y-3">
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                setPaymentEditForm((f) => ({
                                  ...f,
                                  paymentMethod: 'bank_transfer',
                                }))
                              }
                              className={
                                paymentEditForm.paymentMethod === 'bank_transfer'
                                  ? 'rounded-[10px] border border-[var(--orange)] bg-[var(--orange)] px-3 py-1.5 text-[11px] font-bold text-white'
                                  : 'rounded-[10px] border border-[var(--border-orange-soft)] bg-[var(--dash-panel-bg)] px-3 py-1.5 text-[11px] font-semibold text-[var(--text-mid)]'
                              }
                            >
                              {PAYMENT_METHOD_LABEL.bank_transfer}
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setPaymentEditForm((f) => ({
                                  ...f,
                                  paymentMethod: 'credit_card',
                                }))
                              }
                              className={
                                paymentEditForm.paymentMethod === 'credit_card'
                                  ? 'rounded-[10px] border border-[var(--orange)] bg-[var(--orange)] px-3 py-1.5 text-[11px] font-bold text-white'
                                  : 'rounded-[10px] border border-[var(--border-orange-soft)] bg-[var(--dash-panel-bg)] px-3 py-1.5 text-[11px] font-semibold text-[var(--text-mid)]'
                              }
                            >
                              {PAYMENT_METHOD_LABEL.credit_card}
                            </button>
                          </div>
                          <div className="grid gap-3 sm:grid-cols-2">
                            <div>
                              <FieldLabel>סכום (₪)</FieldLabel>
                              <input
                                type="number"
                                min={0}
                                step="0.01"
                                max={maxEditAmount || undefined}
                                value={paymentEditForm.amount}
                                onChange={(e) =>
                                  setPaymentEditForm((f) => ({
                                    ...f,
                                    amount: e.target.value,
                                  }))
                                }
                                className={hubInputClass()}
                              />
                            </div>
                            <div>
                              <FieldLabel>תאריך</FieldLabel>
                              <input
                                type="date"
                                value={paymentEditForm.paidDate}
                                onChange={(e) =>
                                  setPaymentEditForm((f) => ({
                                    ...f,
                                    paidDate: e.target.value,
                                  }))
                                }
                                className={hubInputClass()}
                              />
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              className="hub-btn-orange text-xs"
                              onClick={submitPaymentEdit}
                            >
                              שמור תשלום
                            </button>
                            <button
                              type="button"
                              className="hub-btn-secondary text-xs"
                              onClick={cancelEditPayment}
                            >
                              ביטול
                            </button>
                            <button
                              type="button"
                              className={uiBtnDanger}
                              onClick={() => requestDeletePayment(payment.id)}
                            >
                              מחק
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <div className="font-bold tabular-nums text-[var(--text-dark)]">
                              {formatNisPlain(payment.amount)}
                            </div>
                            <div className="text-[11px] text-[var(--text-mid)]">
                              {PAYMENT_METHOD_LABEL[payment.paymentMethod]} ·{' '}
                              {formatDateIL(payment.paidDate)}
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            <button
                              type="button"
                              className={uiBtnSmOutline}
                              onClick={() => openEditPayment(payment)}
                            >
                              עריכה
                            </button>
                            <button
                              type="button"
                              className={uiBtnDanger}
                              onClick={() => requestDeletePayment(payment.id)}
                            >
                              מחק
                            </button>
                          </div>
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
            </div>
          ) : null}
          {editingIncome && editingOutstanding > 0.001 ? (
            <div className="space-y-4 rounded-xl border border-[var(--border-orange-soft)] bg-[var(--orange-light)]/30 p-4">
              <FieldLabel>תשלום נוסף</FieldLabel>
              <div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setAdditionalPayment((p) => ({
                        ...p,
                        paymentMethod: 'bank_transfer',
                      }))
                    }
                    className={
                      additionalPayment.paymentMethod === 'bank_transfer'
                        ? 'rounded-[10px] border border-[var(--orange)] bg-[var(--orange)] px-4 py-2 text-xs font-bold text-white'
                        : 'rounded-[10px] border border-[var(--border-orange-soft)] bg-white px-4 py-2 text-xs font-semibold text-[var(--text-mid)] hover:bg-[var(--surface-muted)]'
                    }
                  >
                    {PAYMENT_METHOD_LABEL.bank_transfer}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setAdditionalPayment((p) => ({
                        ...p,
                        paymentMethod: 'credit_card',
                      }))
                    }
                    className={
                      additionalPayment.paymentMethod === 'credit_card'
                        ? 'rounded-[10px] border border-[var(--orange)] bg-[var(--orange)] px-4 py-2 text-xs font-bold text-white'
                        : 'rounded-[10px] border border-[var(--border-orange-soft)] bg-white px-4 py-2 text-xs font-semibold text-[var(--text-mid)] hover:bg-[var(--surface-muted)]'
                    }
                  >
                    {PAYMENT_METHOD_LABEL.credit_card}
                  </button>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <FieldLabel>סכום תשלום (₪) *</FieldLabel>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    max={editingOutstanding}
                    value={additionalPayment.amount}
                    onChange={(e) =>
                      setAdditionalPayment((p) => ({ ...p, amount: e.target.value }))
                    }
                    className={hubInputClass()}
                  />
                  <p className="mt-1 text-[11px] text-[var(--text-mid)]">
                    יתרה לתשלום: {formatNisPlain(editingOutstanding)}
                  </p>
                </div>
                <div>
                  <FieldLabel>תאריך תשלום</FieldLabel>
                  <input
                    type="date"
                    value={additionalPayment.paidDate}
                    onChange={(e) =>
                      setAdditionalPayment((p) => ({ ...p, paidDate: e.target.value }))
                    }
                    className={hubInputClass()}
                  />
                </div>
              </div>
              <button
                type="button"
                className="hub-btn-orange text-sm"
                onClick={submitAdditionalPayment}
              >
                + רשום תשלום נוסף
              </button>
            </div>
          ) : null}
          {incomeForm.hostingType === '' ? (
            <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-[var(--text-dark)]">
              <input
                type="checkbox"
                checked={incomeForm.monthlyRetainer}
                onChange={(e) =>
                  setIncomeForm((f) => ({
                    ...f,
                    monthlyRetainer: e.target.checked,
                    invoiceDate: e.target.checked
                      ? `${f.invoiceDate.slice(0, 7)}-01`
                      : f.invoiceDate,
                  }))
                }
                className="h-4 w-4 accent-[var(--orange)]"
              />
              ריטיינר חודשי (חוזר כל חודש מהתחלה ועד סוף השנה)
            </label>
          ) : null}
          <div>
            <FieldLabel>תיאור</FieldLabel>
            <textarea
              rows={3}
              value={incomeForm.description}
              onChange={(e) =>
                setIncomeForm((f) => ({ ...f, description: e.target.value }))
              }
              className={hubInputClass()}
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              className="hub-btn-secondary text-sm"
              onClick={() => setIncomeModalOpen(false)}
            >
              ביטול
            </button>
            <button type="button" className="hub-btn-orange text-sm" onClick={submitIncome}>
              שמור
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={expenseModalOpen}
        onClose={() => setExpenseModalOpen(false)}
        title={editingExpense ? 'עריכת הוצאה' : 'הוספת הוצאה'}
        size="lg"
      >
        <div className="space-y-4">
          <ExpenseFormSection title="סוג וזיהוי">
            <div>
              <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
                <FieldLabel>סוג הוצאה *</FieldLabel>
                <button
                  type="button"
                  className={uiBtnSmOutline}
                  onClick={() => {
                    setTypeForm(newExpenseTypeDefaults())
                    setAddTypeModalOpen(true)
                  }}
                >
                  + הוסף סוג הוצאה
                </button>
              </div>
              <HubDropdownSelect
                value={expenseForm.type}
                onChange={(type) => {
                  const nextType = resolveExpenseType(type, expenseTypeById)
                  const isSalary = nextType.fieldMode === 'salary'
                  const isOneTime = isOneTimeGeneralExpenseType(nextType)
                  setExpenseForm((f) => ({
                    ...f,
                    type,
                    recurring: isSalary || isOneTime ? false : f.recurring,
                    vatClass: defaultVatClassForExpenseType(type),
                    employeeName: isSalary ? f.employeeName : '',
                    name: isSalary ? '' : f.name,
                    clientId: isSalary ? '' : f.clientId,
                    projectId: isSalary ? '' : f.projectId,
                    linkedIncomeId: isSalary ? '' : f.linkedIncomeId,
                  }))
                }}
                options={expenseTypeOptions}
              />
              {isOneTimeGeneralExpenseType(selectedExpenseType) ? (
                <p className="mt-2 text-[11px] leading-relaxed text-[var(--text-mid)]">
                  הוצאה חד פעמית — רשומה לחודש שנבחר בלבד, ללא חזרה אוטומטית.
                </p>
              ) : null}
            </div>
            {selectedExpenseType.fieldMode === 'salary' ? (
              <div>
                <FieldLabel>שם העובד *</FieldLabel>
                <input
                  type="text"
                  value={expenseForm.employeeName}
                  onChange={(e) =>
                    setExpenseForm((f) => ({ ...f, employeeName: e.target.value }))
                  }
                  placeholder="למשל: יוסי כהן"
                  className={hubInputClass()}
                />
              </div>
            ) : (
              <div>
                <FieldLabel>שם הוצאה *</FieldLabel>
                <input
                  type="text"
                  value={expenseForm.name}
                  onChange={(e) =>
                    setExpenseForm((f) => ({ ...f, name: e.target.value }))
                  }
                  placeholder="למשל: חשבונית ירוקה, שכירות משרד, Google Ads"
                  className={hubInputClass()}
                />
              </div>
            )}
            {selectedExpenseType.fieldMode === 'salary' ? (
              <div>
                <FieldLabel>סוג משכורת</FieldLabel>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setExpenseForm((f) => ({ ...f, recurring: false }))
                    }
                    className={
                      !expenseForm.recurring
                        ? 'rounded-[10px] border border-[var(--orange)] bg-[var(--orange)] px-4 py-2 text-xs font-bold text-white'
                        : 'rounded-[10px] border border-[var(--border-orange-soft)] bg-[var(--dash-panel-bg)] px-4 py-2 text-xs font-semibold text-[var(--text-mid)] hover:bg-[var(--surface-muted)]'
                    }
                  >
                    חד פעמית
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setExpenseForm((f) => ({ ...f, recurring: true }))
                    }
                    className={
                      expenseForm.recurring
                        ? 'rounded-[10px] border border-[var(--orange)] bg-[var(--orange)] px-4 py-2 text-xs font-bold text-white'
                        : 'rounded-[10px] border border-[var(--border-orange-soft)] bg-[var(--dash-panel-bg)] px-4 py-2 text-xs font-semibold text-[var(--text-mid)] hover:bg-[var(--surface-muted)]'
                    }
                  >
                    קבועה חודשית
                  </button>
                </div>
                <p className="mt-2 text-[11px] leading-relaxed text-[var(--text-mid)]">
                  {expenseForm.recurring
                    ? 'משכורת קבועה — חוזרת אוטומטית בכל חודש מהחודש שנבחר ועד סוף השנה.'
                    : 'משכורת חד פעמית — רשומה לחודש שנבחר בלבד.'}
                </p>
              </div>
            ) : null}
            {selectedExpenseType.fieldMode === 'supplier' ? (
              <div>
                <FieldLabel>ספק *</FieldLabel>
                <div className={`${hubInputClass()} px-3 py-2.5`}>
                  <SupplierQuickSelect
                    id="finance-expense-supplier"
                    suppliers={listedSuppliers}
                    value={expenseForm.supplierId}
                    onChange={(supplierId) =>
                      setExpenseForm((f) => ({ ...f, supplierId }))
                    }
                    quickAdd
                    onQuickAdd={async (name) =>
                      addSupplier({
                        name,
                        phone: '',
                        email: '',
                        supplierTypes: [],
                        active: true,
                      })
                    }
                  />
                </div>
              </div>
            ) : null}
            {selectedExpenseType.fieldMode === 'platform' ? (
              <div>
                <FieldLabel>פלטפורמה *</FieldLabel>
                <HubDropdownSelect
                  value={expenseForm.platformName}
                  onChange={(platformName) =>
                    setExpenseForm((f) => ({ ...f, platformName }))
                  }
                  options={PLATFORM_OPTIONS.map((o) => ({
                    value: o.value,
                    label: o.label,
                  }))}
                />
              </div>
            ) : null}
            {selectedExpenseType.fieldMode !== 'salary' ? (
              <>
                <div>
                  <FieldLabel>לקוח (אופציונלי)</FieldLabel>
                  <ClientQuickSelect
                    clients={clients}
                    value={expenseForm.clientId}
                    onChange={(clientId) =>
                      setExpenseForm((f) => ({ ...f, clientId }))
                    }
                  />
                </div>
                <div>
                  <FieldLabel>קישור לפרויקט (אופציונלי)</FieldLabel>
                  <ProjectQuickSelect
                    projects={projects}
                    value={expenseForm.projectId}
                    clientNameById={clientNameById}
                    onChange={(projectId) => {
                      const p = projects.find((x) => x.id === projectId)
                      const list = projectId
                        ? projectIncomesForExpense(incomes, projectId)
                        : []
                      const suggested =
                        projectId && list.length > 0
                          ? suggestLinkedIncome(
                              incomes,
                              projectId,
                              expenseForm.billingMonth,
                            )
                          : undefined
                      setExpenseForm((f) => ({
                        ...f,
                        projectId,
                        clientId: p?.clientId ?? f.clientId,
                        linkedIncomeId: suggested?.id ?? '',
                      }))
                    }}
                  />
                </div>
                {expenseForm.projectId ? (
                  <div>
                    <FieldLabel>שיוך לעסקה — חודש לרווח והפסד</FieldLabel>
                    {expenseProjectIncomes.length > 0 ? (
                      <>
                        <HubDropdownSelect
                          value={expenseForm.linkedIncomeId}
                          onChange={(linkedIncomeId) =>
                            setExpenseForm((f) => ({ ...f, linkedIncomeId }))
                          }
                          options={expenseProjectIncomes.map((inc) => ({
                            value: inc.id,
                            label: incomeLinkLabel(inc),
                          }))}
                          emptyOption={{ label: 'בחר עסקה…' }}
                        />
                        {expensePnlMonthPreview &&
                        expensePnlMonthPreview !== expenseForm.billingMonth ? (
                          <p className="mt-2 text-[11px] leading-relaxed text-[#1D4ED8]">
                            ההוצאה תיספר ב
                            <span className="font-bold">
                              {monthLabelHe(expensePnlMonthPreview)}
                            </span>
                            {' '}ברווח והפסד — גם אם התשלום ב
                            {monthLabelHe(expenseForm.billingMonth)}.
                          </p>
                        ) : expensePnlMonthPreview ? (
                          <p className="mt-2 text-[11px] text-[var(--text-mid)]">
                            רווח והפסד: {monthLabelHe(expensePnlMonthPreview)} (זהה
                            לחודש התשלום)
                          </p>
                        ) : null}
                      </>
                    ) : (
                      <p className="rounded-lg border border-[#F59E0B] bg-[#FFFBEB] px-3 py-2 text-[11px] text-[#92400E]">
                        אין עסקאות לפרויקט — ההוצאה תיספר לפי חודש התשלום בלבד.
                      </p>
                    )}
                  </div>
                ) : null}
              </>
            ) : null}
          </ExpenseFormSection>

          <ExpenseFormSection title="סכום ותקופה">
            <div>
              <FieldLabel>סיווג מע״מ *</FieldLabel>
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    'vat_liable',
                    'statutory',
                    'exempt_supplier',
                  ] as FinanceExpenseVatClass[]
                ).map((vatClass) => (
                  <button
                    key={vatClass}
                    type="button"
                    onClick={() =>
                      setExpenseForm((f) => ({ ...f, vatClass }))
                    }
                    className={
                      expenseForm.vatClass === vatClass
                        ? 'rounded-[10px] border border-[var(--orange)] bg-[var(--orange)] px-4 py-2 text-xs font-bold text-white'
                        : 'rounded-[10px] border border-[var(--border-orange-soft)] bg-[var(--dash-panel-bg)] px-4 py-2 text-xs font-semibold text-[var(--text-mid)] hover:bg-[var(--surface-muted)]'
                    }
                  >
                    {EXPENSE_VAT_CLASS_LABEL[vatClass]}
                  </button>
                ))}
              </div>
              <p className="mt-1.5 text-[11px] leading-relaxed text-[var(--text-mid)]">
                תשומות — מע״מ לקיזוז · חוקי — ביטוח לאומי, מס · פטור — עוסק פטור
              </p>
            </div>
            {expenseForm.vatClass === 'vat_liable' ? (
              <div>
                <FieldLabel>סוג סכום</FieldLabel>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setExpenseForm((f) => ({ ...f, amountIncludesVat: true }))
                    }
                    className={
                      expenseForm.amountIncludesVat
                        ? 'rounded-[10px] border border-[var(--orange)] bg-[var(--orange)] px-4 py-2 text-xs font-bold text-white'
                        : 'rounded-[10px] border border-[var(--border-orange-soft)] bg-[var(--dash-panel-bg)] px-4 py-2 text-xs font-semibold text-[var(--text-mid)] hover:bg-[var(--surface-muted)]'
                    }
                  >
                    כולל מע״מ
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setExpenseForm((f) => ({ ...f, amountIncludesVat: false }))
                    }
                    className={
                      !expenseForm.amountIncludesVat
                        ? 'rounded-[10px] border border-[var(--orange)] bg-[var(--orange)] px-4 py-2 text-xs font-bold text-white'
                        : 'rounded-[10px] border border-[var(--border-orange-soft)] bg-[var(--dash-panel-bg)] px-4 py-2 text-xs font-semibold text-[var(--text-mid)] hover:bg-[var(--surface-muted)]'
                    }
                  >
                    לפני מע״מ
                  </button>
                </div>
              </div>
            ) : null}
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <FieldLabel>
                  {selectedExpenseType.fieldMode === 'salary' ||
                  expenseForm.vatClass !== 'vat_liable'
                    ? `סכום (₪) *`
                    : expenseForm.amountIncludesVat
                      ? `סכום כולל מע״מ (₪) *`
                      : `סכום לפני מע״מ (₪) *`}
                </FieldLabel>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={expenseForm.amount}
                  onChange={(e) =>
                    setExpenseForm((f) => ({ ...f, amount: e.target.value }))
                  }
                  className={hubInputClass()}
                />
              </div>
              <div>
                <FieldLabel>
                  {selectedExpenseType.fieldMode === 'salary'
                    ? expenseForm.recurring
                      ? 'חודש התחלה *'
                      : 'חודש משכורת *'
                    : expenseForm.projectId.trim()
                      ? 'חודש תשלום *'
                      : isOneTimeGeneralExpenseType(selectedExpenseType)
                        ? 'חודש הוצאה *'
                        : 'חודש התחלה *'}
                </FieldLabel>
                <input
                  type="month"
                  value={expenseForm.billingMonth}
                  onChange={(e) => {
                    const billingMonth = e.target.value
                    setExpenseForm((f) => {
                      if (!f.projectId.trim() || f.linkedIncomeId) {
                        return { ...f, billingMonth }
                      }
                      const suggested = suggestLinkedIncome(
                        incomes,
                        f.projectId.trim(),
                        billingMonth,
                      )
                      return {
                        ...f,
                        billingMonth,
                        linkedIncomeId: suggested?.id ?? '',
                      }
                    })
                  }}
                  className={hubInputClass()}
                />
              </div>
            </div>
            {expenseVatPreview && expenseForm.vatClass === 'vat_liable' ? (
              <div className="space-y-0.5 rounded-lg border border-[var(--border)] bg-[var(--dash-panel-bg)] px-3 py-2 text-[11px] text-[var(--text-mid)]">
                <div className="flex justify-between gap-2">
                  <span>לפני מע״מ</span>
                  <span className="tabular-nums font-semibold text-[var(--text-dark)]">
                    {formatNisPlain(expenseVatPreview.net)}
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span>מע״מ ({ISRAEL_VAT_PERCENT_LABEL})</span>
                  <span className="tabular-nums font-semibold text-[var(--text-dark)]">
                    {formatNisPlain(expenseVatPreview.vat)}
                  </span>
                </div>
                <div className="flex justify-between gap-2 border-t border-[var(--border)] pt-1 font-bold text-[var(--text-dark)]">
                  <span>סה״כ כולל מע״מ</span>
                  <span className="tabular-nums">
                    {formatNisPlain(expenseVatPreview.gross)}
                  </span>
                </div>
              </div>
            ) : null}
            {selectedExpenseType.fieldMode !== 'salary' &&
            !isOneTimeGeneralExpenseType(selectedExpenseType) ? (
              <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-[var(--text-dark)]">
                <input
                  type="checkbox"
                  checked={expenseForm.recurring}
                  onChange={(e) =>
                    setExpenseForm((f) => ({ ...f, recurring: e.target.checked }))
                  }
                  className="h-4 w-4 accent-[var(--orange)]"
                />
                חוזרת כל חודש (מהחודש שנבחר ועד סוף אותה שנה)
              </label>
            ) : null}
          </ExpenseFormSection>

          <ExpenseFormSection title="חשבונית">
            <FieldLabel>סטטוס חשבונית</FieldLabel>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() =>
                  setExpenseForm((f) => ({ ...f, supplierInvoiceReceived: true }))
                }
                className={
                  expenseForm.supplierInvoiceReceived
                    ? 'rounded-[10px] border border-[#10B981] bg-[#10B981] px-4 py-2 text-xs font-bold text-white'
                    : 'rounded-[10px] border border-[var(--border)] bg-[var(--dash-panel-bg)] px-4 py-2 text-xs font-semibold text-[var(--text-mid)] hover:bg-[var(--surface-muted)]'
                }
              >
                ✓ יש חשבונית
              </button>
              <button
                type="button"
                onClick={() =>
                  setExpenseForm((f) => ({ ...f, supplierInvoiceReceived: false }))
                }
                className={
                  !expenseForm.supplierInvoiceReceived
                    ? 'rounded-[10px] border border-[#F59E0B] bg-[#F59E0B] px-4 py-2 text-xs font-bold text-white'
                    : 'rounded-[10px] border border-[var(--border)] bg-[var(--dash-panel-bg)] px-4 py-2 text-xs font-semibold text-[var(--text-mid)] hover:bg-[var(--surface-muted)]'
                }
              >
                ממתין לחשבונית
              </button>
            </div>
            <p className="text-[11px] leading-relaxed text-[var(--text-mid)]">
              ניתן לעדכן גם ישירות מהטבלה — לחיצה על התג מחליפה את הסטטוס.
            </p>
          </ExpenseFormSection>

          <ExpenseFormSection title="הערות">
            <textarea
              rows={3}
              value={expenseForm.description}
              onChange={(e) =>
                setExpenseForm((f) => ({ ...f, description: e.target.value }))
              }
              placeholder="פרטים נוספים, מספר חשבונית, הערות פנימיות…"
              className={hubInputClass()}
            />
          </ExpenseFormSection>

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              className="hub-btn-secondary text-sm"
              onClick={() => setExpenseModalOpen(false)}
            >
              ביטול
            </button>
            <button type="button" className="hub-btn-orange text-sm" onClick={submitExpense}>
              שמור
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={addTypeModalOpen}
        onClose={() => setAddTypeModalOpen(false)}
        title="הוספת סוג הוצאה"
        size="md"
      >
        <div className="space-y-4">
          <div>
            <FieldLabel>שם הסוג *</FieldLabel>
            <input
              type="text"
              value={typeForm.label}
              onChange={(e) =>
                setTypeForm((f) => ({ ...f, label: e.target.value }))
              }
              placeholder="למשל: שכירות, ביטוח, קמפיין"
              className={hubInputClass()}
            />
          </div>
          <div>
            <FieldLabel>שדות נוספים</FieldLabel>
            <HubDropdownSelect
              value={typeForm.fieldMode}
              onChange={(fieldMode) => {
                const mode = fieldMode as FinanceExpenseFieldMode
                setTypeForm((f) => ({
                  ...f,
                  fieldMode: mode,
                  autoRecurring: mode === 'none' || mode === 'salary' ? f.autoRecurring : false,
                  pnlCategory:
                    mode === 'supplier'
                      ? 'supplier'
                      : mode === 'platform'
                        ? 'platform'
                        : 'fixed',
                }))
              }}
              options={[
                { value: 'none', label: 'ללא (קבועה / כללית)' },
                { value: 'salary', label: 'משכורת — שם עובד + שכר' },
                { value: 'supplier', label: 'שם ספק' },
                { value: 'platform', label: 'שם פלטפורמה' },
              ]}
            />
          </div>
          <div>
            <FieldLabel>צבע תגית</FieldLabel>
            <div className="flex flex-wrap gap-2">
              {EXPENSE_TYPE_COLOR_PRESETS.map((color) => (
                <button
                  key={color}
                  type="button"
                  title={color}
                  onClick={() => setTypeForm((f) => ({ ...f, color }))}
                  className={`h-8 w-8 rounded-full border-2 transition ${
                    typeForm.color === color
                      ? 'border-[var(--text-dark)] scale-110'
                      : 'border-transparent'
                  }`}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-[var(--text-dark)]">
            <input
              type="checkbox"
              checked={typeForm.autoRecurring}
              onChange={(e) =>
                setTypeForm((f) => ({
                  ...f,
                  autoRecurring: e.target.checked,
                }))
              }
              className="h-4 w-4 accent-[var(--orange)]"
            />
            חוזר אוטומטית כל חודש (כמו הוצאה קבועה)
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              className="hub-btn-secondary text-sm"
              onClick={() => setAddTypeModalOpen(false)}
            >
              ביטול
            </button>
            <button
              type="button"
              className="hub-btn-orange text-sm"
              onClick={() => void submitNewExpenseType()}
            >
              הוסף סוג
            </button>
          </div>
        </div>
      </Modal>

      {convertIncomeTarget ? (
        <Modal
          isOpen={!!convertIncomeId}
          onClose={closeConvertDialog}
          title={
            convertIsPartialSplit
              ? 'המרת תשלום חלקי למס קבלה'
              : 'המרה לחשבונית מס קבלה'
          }
          size="md"
        >
          <div className="space-y-4">
            {convertIsPartialSplit ? (
              <p className="text-sm leading-relaxed text-[var(--text-mid)]">
                שולם{' '}
                <span className="font-bold text-[#10B981]">
                  {formatNis(incomeTotalPaid(convertIncomeTarget))}
                </span>{' '}
                מתוך{' '}
                <span className="font-bold text-[var(--text-dark)]">
                  {formatNis(convertIncomeTarget.amount)}
                </span>
                . הסכום ששולם יירשם כ<strong>חשבונית מס קבלה</strong> (הכנסה
                בפועל), והיתרה{' '}
                <span className="font-bold text-[#6366F1]">
                  {formatNis(incomeOutstandingAmount(convertIncomeTarget))}
                </span>{' '}
                תישאר כ<strong>חשבונית עסקה</strong>.
              </p>
            ) : (
              <p className="text-sm leading-relaxed text-[var(--text-mid)]">
                הסכום המלא (
                <span className="font-bold text-[var(--text-dark)]">
                  {formatNis(convertIncomeTarget.amount)}
                </span>
                ) ייספר כהכנסה בפועל ברווח ובמע״מ.
              </p>
            )}
            <p className="rounded-lg border border-[#F59E0B] bg-[#FFFBEB] px-3 py-2 text-[11px] leading-snug text-[#92400E]">
              תאריך מס הקבלה נקבע ידנית — לא נלקח מתאריך חשבון העסקה (
              {formatDateIL(convertIncomeTarget.invoiceDate)}).
            </p>
            <div>
              <FieldLabel>תאריך מס קבלה (= תאריך תשלום) *</FieldLabel>
              <input
                type="date"
                value={convertTaxReceiptDate}
                onChange={(e) => setConvertTaxReceiptDate(e.target.value)}
                className={hubInputClass()}
                autoFocus
              />
            </div>
            {convertIsPartialSplit ? (
              <div>
                <FieldLabel>מספר חשבונית מס קבלה *</FieldLabel>
                <input
                  type="text"
                  value={convertTaxReceiptNumber}
                  onChange={(e) => setConvertTaxReceiptNumber(e.target.value)}
                  placeholder="מספר מהחשבונית שהוצאת בחשבונית ירוקה"
                  className={hubInputClass()}
                />
              </div>
            ) : null}
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={closeConvertDialog}
                className="hub-btn-secondary text-sm"
              >
                ביטול
              </button>
              <button
                type="button"
                onClick={submitConvertToTaxReceipt}
                disabled={!canSubmitConvert}
                className="rounded-[10px] bg-[#059669] px-5 py-2 text-sm font-semibold text-white transition hover:bg-[#047857] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {convertIsPartialSplit
                  ? 'צור מס קבלה על הסכום ששולם'
                  : 'המר למס קבלה'}
              </button>
            </div>
          </div>
        </Modal>
      ) : null}

      <ConfirmDialog
        isOpen={!!deletePaymentTarget}
        onClose={() => setDeletePaymentTarget(null)}
        onConfirm={confirmDeletePayment}
        message="למחוק את התשלום? הסכום יורד מהחשבון ויתרת הלקוח תתעדכן."
      />

      <ConfirmDialog
        isOpen={!!deleteIncomeId}
        onClose={() => setDeleteIncomeId(null)}
        onConfirm={() => {
          if (deleteIncomeId) void deleteIncome(deleteIncomeId)
          setDeleteIncomeId(null)
        }}
        message="למחוק את ההכנסה? פעולה זו לא ניתנת לביטול."
      />

      <ConfirmDialog
        isOpen={!!deleteExpenseId}
        onClose={() => setDeleteExpenseId(null)}
        onConfirm={() => {
          if (deleteExpenseId) void deleteExpense(deleteExpenseId)
          setDeleteExpenseId(null)
        }}
        message="למחוק את ההוצאה? פעולה זו לא ניתנת לביטול."
      />
    </div>
  )
}
