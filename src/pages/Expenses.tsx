import { useMemo, useState, useEffect, type ReactNode } from 'react'
import { ClientQuickSelect } from '../components/ClientQuickSelect'
import { ProjectQuickSelect } from '../components/ProjectQuickSelect'
import { SupplierQuickSelect } from '../components/SupplierQuickSelect'
import { ConfirmDialog } from '../components/shared/ConfirmDialog'
import { EmptyState } from '../components/shared/EmptyState'
import { ExpenseImportWizard } from '../components/finance/ExpenseImportWizard'
import { HubDropdownSelect } from '../components/shared/HubDropdownSelect'
import { Modal } from '../components/shared/Modal'
import {
  currentYm,
  addMonths,
  filterExpensesByClient,
  formatNis,
  formatYmRangeLabel,
  monthOptions,
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
import { toastFsSuccess } from '../lib/fsToast'
import { parseSalaryMonthFromText } from '../lib/financeSalaryMonth'
import { formatDateIL } from '../lib/dates'
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
import { useFinanceIncomes } from '../hooks/useFinanceIncomes'
import { useProjects } from '../hooks/useProjects'
import { useSuppliers } from '../hooks/useSuppliers'
import type {
  FinanceExpense,
  FinanceExpenseFieldMode,
  FinanceExpenseVatClass,
} from '../types'

const uiBtnSmOutline =
  'inline-flex h-9 min-w-[72px] items-center justify-center rounded-[10px] border border-[var(--border-orange-soft)] bg-[var(--dash-panel-bg)] px-3 text-xs font-semibold text-[var(--orange)] transition hover:bg-[var(--orange-light)]'
const uiBtnDanger =
  'inline-flex h-9 min-w-[72px] items-center justify-center rounded-[10px] border border-[#FECACA] bg-[#FEF2F2] px-3 text-xs font-semibold text-[#DC2626] transition hover:bg-[#FEE2E2]'

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
  paidDate: string
  recurring: boolean
  supplierInvoiceReceived: boolean
  hostingExpense: boolean
}

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
  paidDate: '',
  recurring: false,
  supplierInvoiceReceived: false,
  hostingExpense: false,
})


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


export function Expenses() {
  const { clients } = useClients()
  const { projects } = useProjects()
  const { suppliers, addSupplier } = useSuppliers()
  const { incomes, loading: incomesLoading } = useFinanceIncomes()
  const {
    expenses,
    loading: expensesLoading,
    addExpense,
    updateExpense,
    deleteExpense,
    deleteAllExpenses,
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
  const [activeTab] = useState<'expenses'>('expenses')
  const [recurringFilter, setRecurringFilter] = useState<
    'all' | 'fixed' | 'variable'
  >('all')

  const [expenseModalOpen, setExpenseModalOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [editingExpense, setEditingExpense] = useState<FinanceExpense | null>(null)
  const [expenseForm, setExpenseForm] = useState<ExpenseFormState>(emptyExpenseForm)
  const [deleteExpenseId, setDeleteExpenseId] = useState<string | null>(null)
  const [deleteAllOpen, setDeleteAllOpen] = useState(false)
  const [addTypeModalOpen, setAddTypeModalOpen] = useState(false)
  const [typeForm, setTypeForm] = useState<NewFinanceExpenseTypeInput>(
    newExpenseTypeDefaults(),
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

  const filteredExpenses = useMemo(() => {
    let rows = [
      ...filterExpensesByClient(
        expenses,
        filters,
        projectIdsForClient,
        expenseTypes,
        incomes,
      ),
    ]
    if (recurringFilter === 'fixed') {
      rows = rows.filter((e) => e.recurring === true)
    } else if (recurringFilter === 'variable') {
      rows = rows.filter((e) => e.recurring !== true)
    }
    return rows.sort((a, b) => b.billingMonth.localeCompare(a.billingMonth))
  }, [
    expenses,
    filters,
    projectIdsForClient,
    expenseTypes,
    incomes,
    recurringFilter,
  ])

  const expenseTotals = useMemo(() => {
    let gross = 0
    let vat = 0
    let net = 0
    for (const row of filteredExpenses) {
      const breakdown = resolveExpenseRowVat(row)
      gross += breakdown.gross
      net += breakdown.net
      if (resolveExpenseVatClass(row) === 'vat_liable') vat += breakdown.vat
    }
    return {
      gross: Math.round(gross * 100) / 100,
      vat: Math.round(vat * 100) / 100,
      net: Math.round(net * 100) / 100,
    }
  }, [filteredExpenses])

  // סיכומי KPI — לפי תקופה/לקוח/פרויקט בלבד (בלתי תלוי בכפתורי קבועות/משתנות)
  const expenseKpis = useMemo(() => {
    const base = filterExpensesByClient(
      expenses,
      filters,
      projectIdsForClient,
      expenseTypes,
      incomes,
    )
    const r2 = (n: number) => Math.round(n * 100) / 100
    let allGross = 0
    let fixedGross = 0
    let variableGross = 0
    let inputVat = 0
    let fixedCount = 0
    let variableCount = 0
    for (const row of base) {
      const breakdown = resolveExpenseRowVat(row)
      allGross += breakdown.gross
      if (resolveExpenseVatClass(row) === 'vat_liable') inputVat += breakdown.vat
      if (row.recurring === true) {
        fixedGross += breakdown.gross
        fixedCount += 1
      } else {
        variableGross += breakdown.gross
        variableCount += 1
      }
    }
    return {
      allGross: r2(allGross),
      fixedGross: r2(fixedGross),
      variableGross: r2(variableGross),
      inputVat: r2(inputVat),
      total: base.length,
      fixedCount,
      variableCount,
    }
  }, [expenses, filters, projectIdsForClient, expenseTypes, incomes])

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
    const typeDef = resolveExpenseType(source.type, expenseTypeById)
    const noteMonth =
      typeDef.fieldMode === 'salary'
        ? parseSalaryMonthFromText(source.description ?? '')
        : null
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
      billingMonth: noteMonth ?? source.billingMonth,
      paidDate: source.paidDate ?? '',
      recurring: source.recurring,
      supplierInvoiceReceived: source.supplierInvoiceReceived === true,
      hostingExpense: source.hostingExpense === true,
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
    const isSalary = typeDef.fieldMode === 'salary'
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
        isSalary
          ? undefined
          : expenseForm.clientId.trim() || undefined,
      ...(isSalary ? { pnlMonth: expenseForm.billingMonth } : pnlFields),
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
      paidDate: expenseForm.paidDate.trim() || undefined,
      recurring:
        typeDef.fieldMode === 'salary'
          ? expenseForm.recurring
          : isOneTimeGeneralExpenseType(typeDef)
            ? false
            : expenseForm.recurring,
      supplierInvoiceReceived: expenseForm.supplierInvoiceReceived,
      hostingExpense: expenseForm.hostingExpense,
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
        linkedIncomeId: isSalary ? null : projectIdTrimmed ? (pnlFields.linkedIncomeId ?? null) : null,
        pnlMonth: isSalary
          ? expenseForm.billingMonth
          : projectIdTrimmed
            ? (pnlFields.pnlMonth ?? null)
            : null,
        employeeName:
          typeDef.fieldMode === 'salary' ? employeeNameTrimmed : null,
        paidDate: expenseForm.paidDate.trim() || null,
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
            הוצאות
          </h1>
          <p className="mt-1.5 text-[12px] leading-relaxed text-[var(--text-mid)] md:text-[13px]">
            ניהול הוצאות קבועות ומשתנות — אדמין בלבד
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

      {activeTab === 'expenses' ? (
      <section aria-label="סיכום הוצאות" className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {(
          [
            {
              id: 'all' as const,
              label: 'סה״כ הוצאות',
              value: expenseKpis.allGross,
              count: expenseKpis.total,
              valueClass: 'text-[#EF4444]',
            },
            {
              id: 'fixed' as const,
              label: 'קבועות',
              value: expenseKpis.fixedGross,
              count: expenseKpis.fixedCount,
              valueClass: 'text-[#F59E0B]',
            },
            {
              id: 'variable' as const,
              label: 'משתנות',
              value: expenseKpis.variableGross,
              count: expenseKpis.variableCount,
              valueClass: 'text-[#6366F1]',
            },
          ]
        ).map((card) => (
          <button
            key={card.id}
            type="button"
            onClick={() => setRecurringFilter(card.id)}
            className={`flex flex-col rounded-2xl border p-4 text-right shadow-[0_2px_12px_rgba(0,0,0,0.06)] transition hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(0,0,0,0.1)] ${
              recurringFilter === card.id
                ? 'border-2 border-[var(--orange)] bg-[var(--orange-light)]'
                : 'border-[var(--border)] bg-[var(--dash-panel-bg)]'
            }`}
          >
            <span className="flex items-center justify-between text-[12px] font-bold text-[var(--text-mid)]">
              {card.label}
              <span className="rounded-full bg-black/5 px-2 py-0.5 text-[10px] font-extrabold">
                {card.count}
              </span>
            </span>
            <span
              className={`mt-2.5 text-[26px] font-extrabold tabular-nums leading-none ${card.valueClass}`}
            >
              {formatNis(card.value)}
            </span>
            <span className="mt-2 text-[11px] text-[var(--text-mid)]">
              כולל מע״מ
            </span>
          </button>
        ))}
        <div className="flex flex-col rounded-2xl border border-[var(--border)] bg-[var(--surface-muted)]/40 p-4 text-right">
          <span className="text-[12px] font-bold text-[var(--text-mid)]">
            מע״מ תשומות
          </span>
          <span className="mt-2.5 text-[26px] font-extrabold tabular-nums leading-none text-[#8B5CF6]">
            {formatNis(expenseKpis.inputVat)}
          </span>
          <span className="mt-2 text-[11px] text-[var(--text-mid)]">
            ניתן לקיזוז מול מע״מ עסקאות
          </span>
        </div>
      </section>
      ) : null}

      {activeTab === 'expenses' ? (
      <section className={`rounded-2xl ${hubSectionClass(7)} p-4 shadow-[0_2px_12px_rgba(0,0,0,0.06)] sm:p-5`}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-extrabold text-[var(--text-dark)]">הוצאות</h2>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  ['all', 'הכל'],
                  ['fixed', 'קבועות'],
                  ['variable', 'משתנות'],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setRecurringFilter(id)}
                  className={
                    recurringFilter === id
                      ? 'rounded-[10px] border border-[var(--orange)] bg-[var(--orange)] px-3 py-1.5 text-[11px] font-bold text-white'
                      : 'rounded-[10px] border border-[var(--border-orange-soft)] bg-[var(--dash-panel-bg)] px-3 py-1.5 text-[11px] font-semibold text-[var(--text-mid)]'
                  }
                >
                  {label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setImportOpen(true)}
              className="rounded-[10px] border border-[var(--border-orange-soft)] bg-[var(--dash-panel-bg)] px-3 py-2 text-sm font-semibold text-[var(--orange)] transition hover:bg-[var(--orange-light)]"
            >
              ⬆ ייבוא מהבנק
            </button>
            {expenses.length > 0 ? (
              <button
                type="button"
                onClick={() => setDeleteAllOpen(true)}
                className="rounded-[10px] border border-[#FECACA] bg-[#FEF2F2] px-3 py-2 text-sm font-semibold text-[#DC2626] transition hover:bg-[#FEE2E2]"
              >
                מחק הכל
              </button>
            ) : null}
            <button type="button" onClick={openAddExpense} className="hub-btn-orange text-sm">
              + הוסף הוצאה
            </button>
          </div>
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
                  const isSalaryRow = typeDef.fieldMode === 'salary'
                  const vatClass = resolveExpenseVatClass(row)
                  const breakdown = resolveExpenseRowVat(row)
                  const payMonth = expensePaymentMonth(row)
                  const pnlAttributed =
                    !isSalaryRow &&
                    (expenseUsesPnlAttribution(row, incomes) ||
                      row.isPnlAttribution === true)
                  const displayMonth = isSalaryRow
                    ? row.billingMonth
                    : pnlAttributed
                      ? payMonth
                      : row.billingMonth
                  return (
                    <tr
                      key={`${row.id}-${row.pnlMonth ?? row.billingMonth}-${payMonth}`}
                      className="border-b border-[var(--border)] transition hover:bg-[var(--surface-muted)]"
                    >
                      <td className="px-3 py-3 align-top tabular-nums">
                        <div>{monthLabelHe(displayMonth)}</div>
                        {isSalaryRow && row.paidDate ? (
                          <div className="mt-0.5 text-[10px] font-normal text-[var(--text-mid)]">
                            שולם {formatDateIL(row.paidDate)}
                          </div>
                        ) : null}
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
                        {row.projectId
                          ? (projectNameById.get(row.projectId) ?? '—')
                          : '—'}
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
              <tfoot>
                <tr className="border-t-2 border-[var(--border)] bg-[var(--surface-muted)]/60 text-[13px] font-extrabold text-[var(--text-dark)]">
                  <td className="px-3 py-3" colSpan={3}>
                    סה״כ ({filteredExpenses.length})
                  </td>
                  <td className="px-3 py-3 tabular-nums">
                    {formatNis(expenseTotals.gross)}
                  </td>
                  <td className="px-3 py-3 tabular-nums text-[#8B5CF6]">
                    {formatNis(expenseTotals.vat)}
                  </td>
                  <td className="px-3 py-3 tabular-nums text-[#EF4444]">
                    {formatNis(expenseTotals.net)}
                  </td>
                  <td className="px-3 py-3" colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>
      ) : null}

      <ExpenseImportWizard
        isOpen={importOpen}
        onClose={() => setImportOpen(false)}
      />

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
                {selectedExpenseType.fieldMode === 'salary' ? (
                  <p className="mt-1.5 text-[11px] leading-relaxed text-[var(--text-mid)]">
                    חודש המשכורת = תקופת העבודה (למשל מאי). התשלום בבנק יכול
                    להיות בחודש הבא (למשל יוני).
                  </p>
                ) : null}
              </div>
              {selectedExpenseType.fieldMode === 'salary' ? (
                <div className="sm:col-span-2">
                  <FieldLabel>תאריך תשלום בפועל (בבנק)</FieldLabel>
                  <input
                    type="date"
                    value={expenseForm.paidDate}
                    onChange={(e) =>
                      setExpenseForm((f) => ({ ...f, paidDate: e.target.value }))
                    }
                    className={hubInputClass()}
                  />
                </div>
              ) : null}
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
            <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-[var(--text-dark)]">
              <input
                type="checkbox"
                checked={expenseForm.hostingExpense}
                onChange={(e) =>
                  setExpenseForm((f) => ({
                    ...f,
                    hostingExpense: e.target.checked,
                  }))
                }
                className="h-4 w-4 accent-[#0EA5E9]"
              />
              הוצאת אחסון (שרת/דומיין) — תשויך ל״אחסון אתרים״
            </label>
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
        isOpen={!!deleteExpenseId}
        onClose={() => setDeleteExpenseId(null)}
        onConfirm={() => {
          if (deleteExpenseId) void deleteExpense(deleteExpenseId)
          setDeleteExpenseId(null)
        }}
        message="למחוק את ההוצאה? פעולה זו לא ניתנת לביטול."
      />

      <ConfirmDialog
        isOpen={deleteAllOpen}
        onClose={() => setDeleteAllOpen(false)}
        onConfirm={() => {
          void deleteAllExpenses()
          setDeleteAllOpen(false)
        }}
        message={`למחוק את כל ${expenses.length} ההוצאות במערכת? פעולה זו לא ניתנת לביטול — מומלץ לפני מעבר לעבודה עם ייבוא קבצים בלבד.`}
      />
    </div>
  )
}
