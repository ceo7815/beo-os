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
  filterIncomes,
  formatNis,
  formatYmRangeLabel,
  INCOME_STATUS_LABEL,
  INCOME_STATUS_STYLE,
  monthLabelHe,
  PLATFORM_OPTIONS,
} from '../lib/financeCalc'
import {
  expenseTypeMap,
  expenseTypeStyle,
  expenseDisplayName,
  expensePaymentMonth,
  expenseUsesPnlAttribution,
  isOneTimeGeneralExpenseType,
  EXPENSE_TYPE_COLOR_PRESETS,
  isRecurringExpense,
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
import { hubSectionClass } from '../lib/hubSectionBorder'
import {
  calcVatFromGross,
  calcVatFromNet,
  expenseIsVatLiable,
  formatNisPlain,
  ISRAEL_VAT_PERCENT_LABEL,
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
  incomePaymentRecords,
  incomeTotalPaid,
  maxPaymentAmountForEdit,
  resolveIncomeStatusFromPayment,
} from '../lib/financeIncomePayment'
import {
  HOSTING_TYPE_LABEL,
  hostingIncomeLabel,
  hostingIsMonthlyRecurring,
  hostingTypeUsesMonthPicker,
  isHostingIncome,
  resolveHostingType,
} from '../lib/financeHostingTypes'
import type {
  FinanceExpense,
  FinanceExpenseFieldMode,
  FinanceIncome,
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
  vatLiable: boolean
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
  vatLiable: true,
  amountIncludesVat: true,
  description: '',
  billingMonth: currentYm(),
  recurring: false,
  supplierInvoiceReceived: false,
})

function KpiCard(props: {
  seq: number
  label: string
  value: string
  valueClass?: string
  hint?: string
}) {
  return (
    <div
      className={`rounded-2xl ${hubSectionClass(props.seq)} p-4 shadow-[0_2px_12px_rgba(0,0,0,0.08)]`}
    >
      <div
        className={`text-[22px] font-extrabold tabular-nums ${props.valueClass ?? 'text-[var(--text-dark)]'}`}
      >
        {props.value}
      </div>
      <div className="mt-1 text-[12px] text-[var(--text-mid)]">{props.label}</div>
      {props.hint ? (
        <div className="mt-1.5 text-[10px] leading-snug text-[var(--text-light)]">
          {props.hint}
        </div>
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

function ExpenseInvoiceBadge({
  received,
  onToggle,
}: {
  received: boolean
  onToggle?: () => void
}) {
  const className = received
    ? 'inline-flex items-center gap-1 rounded-full bg-[#10B981] px-2.5 py-1 text-[10px] font-bold text-white'
    : 'inline-flex items-center gap-1 rounded-full bg-[#F59E0B] px-2.5 py-1 text-[10px] font-bold text-white'

  const label = received ? '✓ יש חשבונית' : 'ממתין לחשבונית'

  if (!onToggle) {
    return <span className={className}>{label}</span>
  }

  return (
    <button
      type="button"
      onClick={onToggle}
      className={`${className} cursor-pointer transition hover:brightness-95`}
      title="לחץ לעדכון סטטוס חשבונית"
    >
      {label}
    </button>
  )
}

export function Finance() {
  const { clients } = useClients()
  const { projects } = useProjects()
  const { suppliers, addSupplier } = useSuppliers()
  const { incomes, loading: incomesLoading, addIncome, updateIncome, addIncomePayment, updateIncomePayment, deleteIncome } =
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
  const [monthPreset, setMonthPreset] = useState<
    'month' | 'prev' | 'q' | 'half' | 'year' | 'custom'
  >('month')
  const [filterProjectId, setFilterProjectId] = useState('')
  const [filterClientId, setFilterClientId] = useState('')
  const [panelProject, setPanelProject] = useState<Project | null>(null)

  const [incomeModalOpen, setIncomeModalOpen] = useState(false)
  const [editingIncome, setEditingIncome] = useState<FinanceIncome | null>(null)
  const [incomeForm, setIncomeForm] = useState<IncomeFormState>(emptyIncomeForm)
  const [additionalPayment, setAdditionalPayment] = useState(emptyAdditionalPayment)
  const [editingPaymentId, setEditingPaymentId] = useState<string | null>(null)
  const [paymentEditForm, setPaymentEditForm] = useState(emptyAdditionalPayment)
  const [deleteIncomeId, setDeleteIncomeId] = useState<string | null>(null)

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

  const supplierNameById = useMemo(() => {
    const m = new Map<string, string>()
    suppliers.forEach((s) => m.set(s.id, s.name))
    return m
  }, [suppliers])

  const listedSuppliers = useMemo(
    () => suppliers.filter((s) => s.active !== false),
    [suppliers],
  )

  const resolveSupplierDisplay = (row: FinanceExpense): string => {
    if (row.supplierId) {
      return supplierNameById.get(row.supplierId) ?? row.supplierName ?? '—'
    }
    return row.supplierName ?? '—'
  }

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

  const resolveExpenseClientId = (row: FinanceExpense): string | undefined =>
    row.clientId ?? (row.projectId ? projectClientById.get(row.projectId) : undefined)

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
        setFilterYmFrom(now)
        setFilterYmTo(now)
        break
      case 'prev': {
        const prev = addMonths(now, -1)
        setFilterYmFrom(prev)
        setFilterYmTo(prev)
        break
      }
      case 'q':
        setFilterYmFrom(addMonths(now, -2))
        setFilterYmTo(now)
        break
      case 'half':
        setFilterYmFrom(addMonths(now, -5))
        setFilterYmTo(now)
        break
      case 'year':
        setFilterYmFrom(addMonths(now, -11))
        setFilterYmTo(now)
        break
    }
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

  const filteredIncomes = useMemo(
    () =>
      [...filterIncomes(incomes, filters)].sort((a, b) =>
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
    if (!expenseForm.vatLiable) {
      return { gross: n, net: n, vat: 0, rate: 0.18 }
    }
    return expenseForm.amountIncludesVat ? calcVatFromGross(n) : calcVatFromNet(n)
  }, [expenseForm.amount, expenseForm.amountIncludesVat, expenseForm.vatLiable])

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

  const openAddIncome = () => {
    setEditingIncome(null)
    setIncomeForm(emptyIncomeForm())
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
    setIncomeForm({
      projectId: source.projectId,
      clientId: source.clientId,
      amount: String(displayAmount),
      amountIncludesVat: includesVat,
      invoiceNumber: source.invoiceNumber,
      invoiceDate: source.invoiceDate.slice(0, 10),
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
      paidDate: source.paidDate?.slice(0, 10) ?? todayYmd(),
    })
    const outstanding = incomeOutstandingAmount(source)
    setAdditionalPayment({
      amount: outstanding > 0 ? String(outstanding) : '',
      paymentMethod: 'bank_transfer',
      paidDate: todayYmd(),
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
    if (
      (!isHosting && !incomeForm.projectId) ||
      !incomeForm.clientId ||
      !Number.isFinite(amount) ||
      amount <= 0 ||
      !incomeForm.invoiceNumber.trim() ||
      !incomeForm.invoiceDate
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
      paidDate = incomeForm.paidDate.slice(0, 10)
      finalStatus = resolveIncomeStatusFromPayment(
        gross,
        paidAmount,
        incomeForm.status,
      )
    }

    const monthlyRetainer = isHosting
      ? hostingTypeUsesMonthPicker(incomeForm.hostingType)
      : incomeForm.monthlyRetainer

    const payload: NewFinanceIncomeInput = {
      projectId: isHosting ? undefined : incomeForm.projectId,
      clientId: incomeForm.clientId,
      amount: gross,
      amountIncludesVat: incomeForm.amountIncludesVat,
      vatAmount: vatBreakdown.vat,
      amountBeforeVat: vatBreakdown.net,
      invoiceNumber: incomeForm.invoiceNumber,
      invoiceDate: incomeForm.invoiceDate,
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
        invoiceNumber: incomeForm.invoiceNumber,
        invoiceDate: incomeForm.invoiceDate,
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
      vatLiable: expenseIsVatLiable(source),
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
    const vatBreakdown = expenseForm.vatLiable
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
      vatLiable: expenseForm.vatLiable,
      amountIncludesVat: expenseForm.vatLiable
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
      recurring: typeDef.autoRecurring
        ? true
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
        vatLiable: expenseForm.vatLiable,
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

  const toggleExpenseInvoice = (row: FinanceExpense) => {
    void updateExpense(row.id, {
      supplierInvoiceReceived: !row.supplierInvoiceReceived,
    })
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

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-5 sm:gap-4">
        <KpiCard
          seq={0}
          label={'סה"כ עסקאות'}
          value={formatNis(summary.totalTransactions)}
          valueClass="text-[var(--text-dark)]"
        />
        <KpiCard
          seq={1}
          label={'סה"כ הכנסות'}
          value={formatNis(summary.totalPaidIncome)}
          valueClass="text-[#10B981]"
        />
        <KpiCard
          seq={2}
          label={'סה"כ הוצאות'}
          value={formatNis(summary.totalExpenses)}
          valueClass="text-[#EF4444]"
        />
        <KpiCard
          seq={3}
          label="רווח נקי"
          value={formatNis(summary.netProfit)}
          valueClass={
            summary.netProfit >= 0 ? 'text-[#10B981]' : 'text-[#EF4444]'
          }
        />
        <KpiCard
          seq={4}
          label="יתרה לגבייה"
          value={formatNis(summary.pendingCollection)}
          valueClass="text-[#F59E0B]"
        />
      </section>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4 sm:gap-4">
        <KpiCard
          seq={5}
          label="מע״מ הכנסות (שולם)"
          value={formatNis(summary.incomeVat)}
          valueClass="text-[#6366F1]"
          hint={`על ${formatNis(summary.totalPaidIncome)} מתוך ${formatNis(summary.totalTransactions)} · חיוב מע״מ ${ISRAEL_VAT_PERCENT_LABEL}`}
        />
        <KpiCard
          seq={6}
          label="מע״מ הוצאות (חייב)"
          value={formatNis(summary.expenseVat)}
          valueClass="text-[#8B5CF6]"
        />
        <KpiCard
          seq={7}
          label="קיזוז מע״מ"
          value={formatNis(summary.vatNet)}
          valueClass={
            summary.vatNet >= 0 ? 'text-[#6366F1]' : 'text-[#10B981]'
          }
        />
        <KpiCard
          seq={8}
          label="רווח לאחר מע״מ"
          value={formatNis(summary.profitAfterVat)}
          valueClass={
            summary.profitAfterVat >= 0 ? 'text-[#10B981]' : 'text-[#EF4444]'
          }
        />
      </section>

      <section
        className={`flex flex-col gap-3 rounded-2xl ${hubSectionClass(4)} p-4 shadow-[0_2px_12px_rgba(0,0,0,0.06)] sm:flex-row sm:flex-wrap sm:items-end`}
      >
        <div className="min-w-0 flex-[2]">
          <FieldLabel>תקופה</FieldLabel>
          <div className="mb-2 flex flex-wrap gap-1.5">
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

      {/* Incomes */}
      <section className={`rounded-2xl ${hubSectionClass(5)} p-4 shadow-[0_2px_12px_rgba(0,0,0,0.06)] sm:p-5`}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-extrabold text-[var(--text-dark)]">הכנסות</h2>
          <button type="button" onClick={openAddIncome} className="hub-btn-orange text-sm">
            + הוסף הכנסה
          </button>
        </div>
        {loading ? (
          <p className="text-sm text-[var(--text-mid)]">טוען…</p>
        ) : filteredIncomes.length === 0 ? (
          <EmptyState
            title="אין הכנסות לטווח הנבחר"
            description={`${filterRangeLabel} — הוסיפו הכנסה או שנו את הסינון`}
            icon={
              <svg viewBox="0 0 24 24" className="mx-auto h-10 w-10" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M9 12h6m-6 4h4m8 2V7l-5-5H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2z" />
              </svg>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-[11px] font-bold text-[var(--text-mid)]">
                  <th className="px-2 py-2 text-right">מס׳ חשבון עסקה</th>
                  <th className="px-2 py-2 text-right">לקוח</th>
                  <th className="px-2 py-2 text-right">פרויקט</th>
                  <th className="px-2 py-2 text-right">סכום</th>
                  <th className="px-2 py-2 text-right">תאריך חשבון עסקה</th>
                  <th className="px-2 py-2 text-right">סטטוס</th>
                  <th className="px-2 py-2 text-right">פעולות</th>
                </tr>
              </thead>
              <tbody>
                {filteredIncomes.map((row) => {
                  const badge = INCOME_STATUS_STYLE[row.status]
                  const retainer =
                    row.monthlyRetainer === true || row.isAutoOccurrence === true
                  return (
                    <tr
                      key={`${row.id}-${row.invoiceDate.slice(0, 7)}`}
                      className="border-b border-[var(--border)] transition hover:bg-[var(--surface-muted)]"
                    >
                      <td className="px-2 py-2.5 font-semibold">
                        {row.invoiceNumber || '—'}
                        {retainer ? (
                          <span
                            className="ms-1"
                            title={
                              row.isAutoOccurrence
                                ? `ריטיינר מ-${row.sourceInvoiceDate?.slice(0, 7) ?? ''}`
                                : 'ריטיינר חודשי'
                            }
                          >
                            🔁
                          </span>
                        ) : null}
                      </td>
                      <td className="px-2 py-2.5">{clientNameById.get(row.clientId) ?? '—'}</td>
                      <td className="px-2 py-2.5">
                        {isHostingIncome(row) ? (
                          <span
                            className={
                              resolveHostingType(row) === 'portal_monthly'
                                ? 'inline-flex items-center gap-1 rounded-full bg-[#EDE9FE] px-2 py-0.5 text-[10px] font-bold text-[#6D28D9]'
                                : 'inline-flex items-center gap-1 rounded-full bg-[#E0E7FF] px-2 py-0.5 text-[10px] font-bold text-[#4338CA]'
                            }
                            title={hostingIncomeLabel(row)}
                          >
                            {hostingIncomeLabel(row) ?? 'אחסון'}
                            {hostingIsMonthlyRecurring(row) ? (
                              <span title="חוזר כל חודש">🔁</span>
                            ) : null}
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => openProjectPanel(row.projectId)}
                            className="font-semibold text-[var(--orange)] underline decoration-dotted hover:text-[#ea6c0a]"
                          >
                            {projectNameById.get(row.projectId) ?? '—'}
                          </button>
                        )}
                      </td>
                      <td className="px-2 py-2.5 tabular-nums font-bold">
                        {row.status === 'partial' ? (
                          <div>
                            <div>{formatNis(row.amount)}</div>
                            <div className="text-[10px] font-semibold text-[var(--text-mid)]">
                              שולם {formatNis(incomeTotalPaid(row))}
                            </div>
                          </div>
                        ) : (
                          formatNis(row.amount)
                        )}
                      </td>
                      <td className="px-2 py-2.5 tabular-nums">{formatDateIL(row.invoiceDate)}</td>
                      <td className="px-2 py-2.5">
                        <span
                          className="inline-block rounded-full px-2 py-0.5 text-[10px] font-bold"
                          style={{ backgroundColor: badge.bg, color: badge.color }}
                        >
                          {INCOME_STATUS_LABEL[row.status]}
                        </span>
                        {row.paymentMethod &&
                        (row.status === 'paid' || row.status === 'partial') ? (
                          <div className="mt-1 text-[10px] text-[var(--text-mid)]">
                            {PAYMENT_METHOD_LABEL[row.paymentMethod]}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-2 py-2.5">
                        <div className="flex flex-wrap gap-1.5">
                          <button type="button" className={uiBtnSmOutline} onClick={() => openEditIncome(row)}>
                            עריכה
                          </button>
                          <button type="button" className={uiBtnDanger} onClick={() => setDeleteIncomeId(row.id)}>
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

      {/* Expenses */}
      <section className={`rounded-2xl ${hubSectionClass(6)} p-4 shadow-[0_2px_12px_rgba(0,0,0,0.06)] sm:p-5`}>
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
            <table className="w-full min-w-[680px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-[11px] font-bold text-[var(--text-mid)]">
                  <th className="px-3 py-2 text-right">חודש</th>
                  <th className="px-3 py-2 text-right">פרטי הוצאה</th>
                  <th className="px-3 py-2 text-right">סכום</th>
                  <th className="px-3 py-2 text-right">חשבונית</th>
                  <th className="px-3 py-2 text-right">פעולות</th>
                </tr>
              </thead>
              <tbody>
                {filteredExpenses.map((row) => {
                  const typeDef = resolveExpenseType(row.type, expenseTypeById)
                  const badge = expenseTypeStyle(typeDef)
                  const vendor =
                    typeDef.fieldMode === 'supplier'
                      ? resolveSupplierDisplay(row)
                      : typeDef.fieldMode === 'platform'
                        ? row.platformName
                        : null
                  const recurring = isRecurringExpense(row, typeDef)
                  const invoiceReceived = row.supplierInvoiceReceived === true
                  const expenseClientId = resolveExpenseClientId(row)
                  const payMonth = expensePaymentMonth(row)
                  const reportMonth = deriveExpensePnlMonth(row, incomes)
                  const pnlAttributed =
                    expenseUsesPnlAttribution(row, incomes) ||
                    row.isPnlAttribution === true
                  return (
                    <tr
                      key={`${row.id}-${row.pnlMonth ?? row.billingMonth}-${payMonth}`}
                      className="border-b border-[var(--border)] transition hover:bg-[var(--surface-muted)]"
                    >
                      <td className="px-3 py-3 align-top">
                        <div className="font-semibold text-[var(--text-dark)]">
                          {pnlAttributed ? (
                            <>
                              <span className="text-[11px] font-semibold text-[var(--text-mid)]">
                                תשלום:{' '}
                              </span>
                              {monthLabelHe(payMonth)}
                            </>
                          ) : (
                            monthLabelHe(row.billingMonth)
                          )}
                        </div>
                        {pnlAttributed ? (
                          <div className="mt-0.5 text-[10px] font-bold text-[#1D4ED8]">
                            רווח והפסד: {monthLabelHe(reportMonth)}
                          </div>
                        ) : null}
                        {row.isAutoOccurrence && row.sourceBillingMonth ? (
                          <div className="mt-0.5 text-[10px] text-[var(--text-light)]">
                            חוזר מ-{monthLabelHe(row.sourceBillingMonth)}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-3 py-3 align-top">
                        <div className="font-semibold text-[var(--text-dark)]">
                          {expenseDisplayName(row, typeDef)}
                        </div>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          <span
                            className="inline-block rounded-full px-2 py-0.5 text-[10px] font-bold"
                            style={{ backgroundColor: badge.bg, color: badge.color }}
                          >
                            {typeDef.label}
                          </span>
                          {vendor ? (
                            <span className="rounded-full bg-[var(--surface-muted)] px-2 py-0.5 text-[10px] font-semibold text-[var(--text-mid)]">
                              {vendor}
                            </span>
                          ) : null}
                          {expenseClientId ? (
                            <span className="rounded-full bg-[#EFF6FF] px-2 py-0.5 text-[10px] font-semibold text-[#1D4ED8]">
                              {clientNameById.get(expenseClientId) ?? 'לקוח'}
                            </span>
                          ) : null}
                          {row.projectId ? (
                            <button
                              type="button"
                              onClick={() => openProjectPanel(row.projectId!)}
                              className="rounded-full bg-[#FFF7ED] px-2 py-0.5 text-[10px] font-semibold text-[var(--orange)] hover:bg-[#FFEDD5]"
                            >
                              {projectNameById.get(row.projectId) ?? 'פרויקט'}
                            </button>
                          ) : null}
                          {recurring ? (
                            <span
                              className="text-[11px]"
                              title={
                                row.isAutoOccurrence
                                  ? `חוזר מ-${row.sourceBillingMonth ?? ''}`
                                  : 'הוצאה חוזרת'
                              }
                            >
                              🔁
                            </span>
                          ) : null}
                          {!expenseIsVatLiable(row) ? (
                            <span className="rounded-full bg-[#F3F4F6] px-2 py-0.5 text-[10px] font-semibold text-[#6B7280]">
                              פטור ממע״מ
                            </span>
                          ) : null}
                        </div>
                        {row.name && row.description ? (
                          <div className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-[var(--text-mid)]">
                            {row.description}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-3 py-3 align-top tabular-nums font-bold">
                        {formatNis(row.amount)}
                      </td>
                      <td className="px-3 py-3 align-top">
                        <ExpenseInvoiceBadge
                          received={invoiceReceived}
                          onToggle={() => toggleExpenseInvoice(row)}
                        />
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

      {/* P&L */}
      <section className={`rounded-2xl ${hubSectionClass(7)} p-4 shadow-[0_2px_12px_rgba(0,0,0,0.06)] sm:p-5`}>
        <h2 className="mb-4 text-lg font-extrabold text-[var(--text-dark)]">
          רווח והפסד — סיכום חודשי
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-[11px] font-bold text-[var(--text-mid)]">
                <th className="px-2 py-2 text-right">חודש</th>
                <th className="px-2 py-2 text-right">עסקאות לתשלום</th>
                <th className="px-2 py-2 text-right">קבועות</th>
                <th className="px-2 py-2 text-right">ספקים</th>
                <th className="px-2 py-2 text-right">פלטפורמות</th>
                <th className="px-2 py-2 text-right">סה״כ הוצאות</th>
                <th className="px-2 py-2 text-right">רווח נקי</th>
                <th className="px-2 py-2 text-right">יתרה לגבייה</th>
                <th className="px-2 py-2 text-right">מרווח %</th>
              </tr>
            </thead>
            <tbody>
              {pnlRows.map((row) => {
                const rowBg =
                  row.netProfit > 0
                    ? 'rgba(16,185,129,0.08)'
                    : row.netProfit < 0
                      ? 'rgba(239,68,68,0.08)'
                      : undefined
                return (
                  <tr
                    key={row.ym}
                    className="border-b border-[var(--border)] transition hover:brightness-[0.98]"
                    style={{ backgroundColor: rowBg }}
                  >
                    <td className="px-2 py-2.5 font-semibold">{row.label}</td>
                    <td className="px-2 py-2.5 tabular-nums">{formatNis(row.totalTransactions)}</td>
                    <td className="px-2 py-2.5 tabular-nums">{formatNis(row.fixedExpenses)}</td>
                    <td className="px-2 py-2.5 tabular-nums">{formatNis(row.supplierExpenses)}</td>
                    <td className="px-2 py-2.5 tabular-nums">{formatNis(row.platformExpenses)}</td>
                    <td className="px-2 py-2.5 tabular-nums font-semibold">{formatNis(row.totalExpenses)}</td>
                    <td
                      className={`px-2 py-2.5 tabular-nums font-bold ${
                        row.netProfit >= 0 ? 'text-[#10B981]' : 'text-[#EF4444]'
                      }`}
                    >
                      {formatNis(row.netProfit)}
                    </td>
                    <td className="px-2 py-2.5 tabular-nums font-semibold text-[#F59E0B]">
                      {formatNis(row.pendingCollection)}
                    </td>
                    <td className="px-2 py-2.5 tabular-nums">{row.profitMargin}%</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

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
        title={editingIncome ? 'עריכת הכנסה' : 'הוספת הכנסה'}
        size="lg"
      >
        <div className="space-y-4">
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
              <FieldLabel>מספר חשבון עסקה *</FieldLabel>
              <input
                type="text"
                value={incomeForm.invoiceNumber}
                onChange={(e) =>
                  setIncomeForm((f) => ({ ...f, invoiceNumber: e.target.value }))
                }
                placeholder="מספר חשבון עסקה — לא חשבונית מס"
                className={hubInputClass()}
              />
            </div>
            <div>
              <FieldLabel>
                {hostingTypeUsesMonthPicker(incomeForm.hostingType) ||
                incomeForm.monthlyRetainer
                  ? 'חודש התחלה *'
                  : incomeForm.hostingType === 'yearly'
                    ? 'תאריך חשבון שנתי *'
                    : 'תאריך חשבון עסקה *'}
              </FieldLabel>
              {hostingTypeUsesMonthPicker(incomeForm.hostingType) ||
              incomeForm.monthlyRetainer ? (
                <input
                  type="month"
                  value={incomeForm.invoiceDate.slice(0, 7)}
                  onChange={(e) =>
                    setIncomeForm((f) => ({
                      ...f,
                      invoiceDate: `${e.target.value}-01`,
                    }))
                  }
                  className={hubInputClass()}
                />
              ) : (
                <input
                  type="date"
                  value={incomeForm.invoiceDate}
                  onChange={(e) =>
                    setIncomeForm((f) => ({ ...f, invoiceDate: e.target.value }))
                  }
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
                          ? todayYmd()
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
                          <button
                            type="button"
                            className={uiBtnSmOutline}
                            onClick={() => openEditPayment(payment)}
                          >
                            עריכה
                          </button>
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
                    recurring: isSalary || isOneTime ? false : nextType.autoRecurring,
                    vatLiable: isSalary ? false : f.vatLiable,
                    employeeName: isSalary ? f.employeeName : '',
                    name: isSalary ? '' : f.name,
                    clientId: isSalary ? '' : f.clientId,
                    projectId: isSalary ? '' : f.projectId,
                    linkedIncomeId: isSalary ? '' : f.linkedIncomeId,
                  }))
                }}
                options={expenseTypeOptions}
              />
              {selectedExpenseType.autoRecurring ? (
                <p className="mt-2 text-[11px] leading-relaxed text-[var(--text-mid)]">
                  הוצאה מסוג זה תחול אוטומטית בכל חודש מהחודש שנבחר ועד סוף אותה שנה.
                </p>
              ) : isOneTimeGeneralExpenseType(selectedExpenseType) ? (
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
              <FieldLabel>חיוב במע״מ</FieldLabel>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setExpenseForm((f) => ({ ...f, vatLiable: true }))
                  }
                  className={
                    expenseForm.vatLiable
                      ? 'rounded-[10px] border border-[var(--orange)] bg-[var(--orange)] px-4 py-2 text-xs font-bold text-white'
                      : 'rounded-[10px] border border-[var(--border-orange-soft)] bg-[var(--dash-panel-bg)] px-4 py-2 text-xs font-semibold text-[var(--text-mid)] hover:bg-[var(--surface-muted)]'
                  }
                >
                  חייב במע״מ
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setExpenseForm((f) => ({ ...f, vatLiable: false }))
                  }
                  className={
                    !expenseForm.vatLiable
                      ? 'rounded-[10px] border border-[var(--orange)] bg-[var(--orange)] px-4 py-2 text-xs font-bold text-white'
                      : 'rounded-[10px] border border-[var(--border-orange-soft)] bg-[var(--dash-panel-bg)] px-4 py-2 text-xs font-semibold text-[var(--text-mid)] hover:bg-[var(--surface-muted)]'
                  }
                >
                  לא חייב (פטור)
                </button>
              </div>
              <p className="mt-1.5 text-[11px] leading-relaxed text-[var(--text-mid)]">
                משכורות וסוגים דומים — סמן &quot;לא חייב&quot;. רק הוצאות חייבות
                נכנסות לקיזוז מע״מ.
              </p>
            </div>
            {expenseForm.vatLiable ? (
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
                  !expenseForm.vatLiable
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
            {expenseVatPreview && expenseForm.vatLiable ? (
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
            {!selectedExpenseType.autoRecurring &&
            selectedExpenseType.fieldMode !== 'salary' &&
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
                הוצאה חוזרת (כל חודש מהתחלה ועד סוף השנה)
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
