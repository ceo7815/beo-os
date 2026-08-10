import { useMemo, useState, useEffect, type ReactNode } from 'react'
import { ClientQuickSelect } from '../components/ClientQuickSelect'
import { ProjectQuickSelect } from '../components/ProjectQuickSelect'
import { SupplierQuickSelect } from '../components/SupplierQuickSelect'
import { ConfirmDialog } from '../components/shared/ConfirmDialog'
import { EmptyState } from '../components/shared/EmptyState'
import { ExportExcelButton } from '../components/shared/ExportExcelButton'
import { ExpenseImportWizard } from '../components/finance/ExpenseImportWizard'
import { ExpenseReconciliationBadge } from '../components/finance/ExpenseReconciliationPanel'
import {
  canViewGiExpenseDocument,
} from '../lib/expenseReconciliation'
import {
  GiExpenseDocumentButton,
  resolveGiExpenseId,
  resolveGiExpenseLabel,
} from '../components/finance/GiExpenseDocumentButton'
import { HubDropdownSelect } from '../components/shared/HubDropdownSelect'
import { Modal } from '../components/shared/Modal'
import {
  currentYm,
  filterExpensesByClient,
  formatNis,
  monthLabelHe,
  PLATFORM_OPTIONS,
} from '../lib/financeCalc'
import { clientScopedProjectOptions } from '../lib/financeProjectAssign'
import { FinancePeriodFilter } from '../components/finance/FinancePeriodFilter'
import { QuickCreateProjectModal } from '../components/finance/QuickCreateProjectModal'
import { useFinancePeriodFilter } from '../hooks/useFinancePeriodFilter'
import {
  expenseTypeMap,
  expenseDisplayName,
  expensePaymentMonth,
  isOneTimeGeneralExpenseType,
  EXPENSE_TYPE_COLOR_PRESETS,
  resolveExpenseType,
} from '../lib/financeExpenseTypes'
import {
  incomeLinkLabel,
  projectIncomesForExpense,
  resolveExpensePnlFields,
  resolveLinkedIncome,
  suggestLinkedIncome,
} from '../lib/financeExpensePnl'
import { toastFsSuccess } from '../lib/fsToast'
import {
  isAccrualExpense,
  parseSalaryMonthFromText,
} from '../lib/financeSalaryMonth'
import { deriveExpensePnlMonth } from '../lib/financeExpensePnl'
import { exportExpensesToExcel } from '../lib/excelTableExports'
import {
  hasAttachedDocument,
  isGiOnlyRecord,
  isSettledReconciliationStatus,
  reconciliationRowDate,
  reconciliationRowMap,
} from '../lib/expenseReconciliation'
import { AttachInvoiceModal } from '../components/finance/AttachInvoiceModal'
import { ExpenseVatClassChip } from '../components/finance/ExpenseVatClassChip'
import { refundLinkMap } from '../lib/expenseRefunds'
import { RefundLinkNote } from '../components/finance/RefundLinkNote'
import { matchMonthlyRecurringExpense } from '../lib/financeRecurringCatalog'
import { formatDateIL } from '../lib/dates'
import {
  formatForeignAmount,
  resolveExpenseForeign,
} from '../lib/foreignCurrency'
import { FinanceTabs } from '../components/finance/FinanceTabs'
import { useFinanceAttention } from '../hooks/useFinanceAttention'
import {
  defaultVatClassForExpenseType,
  EXPENSE_VAT_CLASS_LABEL,
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
import {
  ClientFinanceCardModal,
  type ClientFinanceTarget,
} from '../components/finance/ClientFinanceCardModal'
import { FinanceClickable } from '../components/finance/FinanceClickable'
import { SortableTh } from '../components/finance/SortableTh'
import { sortByKey, useTableSort } from '../lib/financeTableSort'
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
const uiBtnAttach =
  'inline-flex h-8 items-center justify-center rounded-[10px] bg-[var(--orange)] px-3 text-[11px] font-bold text-white transition hover:brightness-95'
const uiBtnAttachGhost =
  'inline-flex h-8 items-center justify-center rounded-[10px] border border-[var(--border)] px-3 text-[11px] font-semibold text-[var(--text-mid)] transition hover:bg-[var(--surface-muted)]'
const uiBtnRowIcon =
  'inline-flex h-8 w-8 items-center justify-center rounded-[10px] border border-[var(--border-orange-soft)] bg-[var(--dash-panel-bg)] text-sm text-[var(--orange)] transition hover:bg-[var(--orange-light)]'
const uiBtnRowIconDanger =
  'inline-flex h-8 w-8 items-center justify-center rounded-[10px] border border-[#FECACA] bg-[#FEF2F2] text-sm text-[#DC2626] transition hover:bg-[#FEE2E2]'

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
  /** קוד מטבע מקור — USD / EUR וכו׳ */
  currency: string
  /** סכום במטבע המקור */
  originalAmount: string
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
  currency: '',
  originalAmount: '',
})


/** YYYY-MM → MM/YYYY — קצר מספיק כדי להציג שני חודשים באותה שורה */
function ymShort(ym: string): string {
  const [y, m] = ym.slice(0, 7).split('-')
  return y && m ? `${m}/${y}` : ym
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

  const attention = useFinanceAttention()
  const period = useFinancePeriodFilter()
  const {
    filterYmFrom,
    filterYmTo,
    filterRangeLabel,
  } = period
  const [filterProjectId, setFilterProjectId] = useState('')
  const [filterClientId, setFilterClientId] = useState('')
  const [activeTab] = useState<'expenses'>('expenses')
  const [recurringFilter, setRecurringFilter] = useState<
    'all' | 'fixed' | 'variable'
  >('all')
  const [settlementFilter, setSettlementFilter] = useState<
    'all' | 'open' | 'closed'
  >('all')
  /** סינון מהיר בלחיצה על שם הוצאה/ספק — UX בלבד */
  const [nameQuickFilter, setNameQuickFilter] = useState('')
  const [clientCard, setClientCard] = useState<ClientFinanceTarget | null>(null)
  const { sort: expenseSort, toggle: toggleExpenseSort } = useTableSort<
    'date' | 'name' | 'gross'
  >('date', 'desc')

  const [expenseModalOpen, setExpenseModalOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [editingExpense, setEditingExpense] = useState<FinanceExpense | null>(null)
  const [expenseForm, setExpenseForm] = useState<ExpenseFormState>(emptyExpenseForm)
  const [expenseFormError, setExpenseFormError] = useState('')
  const [deleteExpenseId, setDeleteExpenseId] = useState<string | null>(null)
  const [attachingExpense, setAttachingExpense] =
    useState<FinanceExpense | null>(null)
  const [deleteAllOpen, setDeleteAllOpen] = useState(false)
  const [addTypeModalOpen, setAddTypeModalOpen] = useState(false)
  const [typeForm, setTypeForm] = useState<NewFinanceExpenseTypeInput>(
    newExpenseTypeDefaults(),
  )
  const [quickCreateFor, setQuickCreateFor] = useState<{
    expenseId: string
    clientId: string
    clientName: string
  } | null>(null)

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

  /** שיוך פרויקט לפי לקוח השורה — לא כל הפרויקטים במערכת */
  const projectOptionsForExpense = (row: {
    clientId?: string
    projectId?: string
  }) => {
    const clientId =
      row.clientId?.trim() ||
      (row.projectId ? projectClientById.get(row.projectId) : '') ||
      ''
    return clientScopedProjectOptions(projects, {
      clientId,
      currentProjectId: row.projectId,
      clientNameById,
    })
  }

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

  useEffect(() => {
    const SYNC_KEY = 'hub-finance-data-sync-v4'
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
        const needsRecur = exp.recurring !== shouldRecur
        // רק כשאין סיווג שמור — אחרת בחירה ידנית מהטבלה תידרס ברענון
        const needsVat = !exp.vatClass

        if (!needsRecur && !needsVat) continue

        // silent — בלי toast לכל שורה; סיכום אחד בסוף
        await updateExpense(
          exp.id,
          {
            ...(needsRecur ? { recurring: shouldRecur } : {}),
            ...(needsVat
              ? {
                  vatClass: suggestedVat,
                  vatLiable: vatClassToLiable(suggestedVat),
                }
              : {}),
          },
          { silent: true },
        )
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

  const refundLinks = useMemo(() => refundLinkMap(expenses), [expenses])

  const reconciliationById = useMemo(
    () =>
      reconciliationRowMap(
        expenses,
        filterYmFrom,
        filterYmTo,
        expenseTypeById,
      ),
    [expenses, filterYmFrom, filterYmTo, expenseTypeById],
  )

  const filteredExpenses = useMemo(() => {
    let rows = [
      ...filterExpensesByClient(
        expenses,
        filters,
        projectIdsForClient,
        expenseTypes,
      ),
    ]
    rows = rows.filter((e) => !isGiOnlyRecord(e))
    if (recurringFilter === 'fixed') {
      rows = rows.filter((e) => e.recurring === true)
    } else if (recurringFilter === 'variable') {
      rows = rows.filter((e) => e.recurring !== true)
    }
    /**
     * מיון לפי התאריך שבו הכסף באמת יצא, מהחדש לישן — כך ה-1 בחודש נמצא
     * בתחתית והרשימה נקראת כמו דף בנק. מיון לפי חודש בלבד השאיר את
     * הסדר בתוך החודש אקראי.
     */
    return rows.sort((a, b) => {
      const byDate = reconciliationRowDate(b).localeCompare(
        reconciliationRowDate(a),
      )
      if (byDate !== 0) return byDate
      return (b.createdAt ?? '').localeCompare(a.createdAt ?? '')
    })
  }, [
    expenses,
    filters,
    projectIdsForClient,
    expenseTypes,
    recurringFilter,
  ])

  /** סגירה לתצוגה בלבד — חשבונית / זיכוי / פטור ממסמך */
  const isRowClosed = (row: FinanceExpense): boolean => {
    // זיכוי עצמו אינו אירוע מס — לא ממתין לחשבונית
    if (row.amount < 0) return true
    if (refundLinks.get(row.id)?.fully === true) return true
    return isSettledReconciliationStatus(
      reconciliationById.get(row.id)?.status,
    )
  }

  const visibleExpenses = useMemo(() => {
    let rows =
      settlementFilter === 'all'
        ? filteredExpenses
        : filteredExpenses.filter((row) => {
            const closed = isRowClosed(row)
            return settlementFilter === 'closed' ? closed : !closed
          })
    const q = nameQuickFilter.trim().toLowerCase()
    if (q) {
      rows = rows.filter((row) => {
        const typeDef = resolveExpenseType(row.type, expenseTypeById)
        const label = expenseDisplayName(row, typeDef).toLowerCase()
        return (
          label.includes(q) ||
          (row.supplierName ?? '').toLowerCase().includes(q) ||
          (row.name ?? '').toLowerCase().includes(q)
        )
      })
    }
    return sortByKey(rows, expenseSort, (row, key) => {
      if (key === 'date') return reconciliationRowDate(row)
      if (key === 'gross') return row.amount
      const typeDef = resolveExpenseType(row.type, expenseTypeById)
      return expenseDisplayName(row, typeDef)
    })
  }, [
    filteredExpenses,
    settlementFilter,
    refundLinks,
    reconciliationById,
    nameQuickFilter,
    expenseSort,
    expenseTypeById,
  ])

  const settlementCounts = useMemo(() => {
    let closed = 0
    for (const row of filteredExpenses) {
      if (isRowClosed(row)) closed += 1
    }
    return {
      closed,
      open: filteredExpenses.length - closed,
      total: filteredExpenses.length,
    }
  }, [filteredExpenses, refundLinks, reconciliationById])

  const expenseTotals = useMemo(() => {
    let gross = 0
    let vat = 0
    let net = 0
    for (const row of visibleExpenses) {
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
  }, [visibleExpenses])

  // סיכומי KPI — לפי תקופה/לקוח/פרויקט בלבד (בלתי תלוי בכפתורי קבועות/משתנות)
  const expenseKpis = useMemo(() => {
    const base = filterExpensesByClient(
      expenses,
      filters,
      projectIdsForClient,
      expenseTypes,
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
  }, [expenses, filters, projectIdsForClient, expenseTypes])

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
    setExpenseFormError('')
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
    setExpenseFormError('')
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
      currency: resolveExpenseForeign(source)?.currency ?? source.currency ?? '',
      originalAmount: (() => {
        const fx = resolveExpenseForeign(source)
        if (fx) return String(fx.amount)
        if (source.originalAmount) return String(Math.abs(source.originalAmount))
        return ''
      })(),
    })
    setExpenseModalOpen(true)
  }

  const submitExpense = () => {
    setExpenseFormError('')
    const parsed = Number.parseFloat(expenseForm.amount.replace(/,/g, ''))
    const typeDef = resolveExpenseType(expenseForm.type, expenseTypeById)
    if (!Number.isFinite(parsed) || parsed <= 0 || !expenseForm.billingMonth) {
      setExpenseFormError('יש למלא סכום וחודש תקינים')
      return
    }
    if (typeDef.fieldMode === 'salary') {
      if (!expenseForm.employeeName.trim()) {
        setExpenseFormError('יש למלא שם עובד')
        return
      }
    } else if (!expenseForm.name.trim()) {
      setExpenseFormError('יש למלא שם הוצאה')
      return
    }
    // ייבוא בנק לרוב בלי ספק מקושר — לא חוסמים עריכה בגלל זה
    if (
      typeDef.fieldMode === 'supplier' &&
      !expenseForm.supplierId.trim() &&
      !editingExpense
    ) {
      setExpenseFormError('יש לבחור ספק')
      return
    }
    if (
      expenseForm.currency.trim() &&
      expenseForm.currency.trim().toUpperCase() !== 'ILS' &&
      !Number.parseFloat(expenseForm.originalAmount.replace(/,/g, ''))
    ) {
      setExpenseFormError('נבחר מטבע מקור — יש למלא גם סכום במט״ח')
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
      ...( (() => {
        const code = expenseForm.currency.trim().toUpperCase()
        const fx = Number.parseFloat(expenseForm.originalAmount.replace(/,/g, ''))
        if (code && code !== 'ILS' && Number.isFinite(fx) && fx !== 0) {
          return { currency: code, originalAmount: Math.abs(fx) }
        }
        return {}
      })() ),
    }
    if (editingExpense) {
      const fxCode = expenseForm.currency.trim().toUpperCase()
      const fxAmt = Number.parseFloat(
        expenseForm.originalAmount.replace(/,/g, ''),
      )
      const hasFx =
        !!fxCode &&
        fxCode !== 'ILS' &&
        Number.isFinite(fxAmt) &&
        fxAmt !== 0
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
        pnlMonth: isSalary ? expenseForm.billingMonth : null,
        employeeName:
          typeDef.fieldMode === 'salary' ? employeeNameTrimmed : null,
        paidDate: expenseForm.paidDate.trim() || null,
        vatClass: expenseForm.vatClass,
        vatLiable: vatClassToLiable(expenseForm.vatClass),
        supplierInvoiceReceived: expenseForm.supplierInvoiceReceived,
        currency: hasFx ? fxCode : null,
        originalAmount: hasFx ? Math.abs(fxAmt) : null,
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
    <div className="mx-auto min-w-0 w-full max-w-[1400px] space-y-5 px-4 py-6 sm:px-8">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 text-right">
          <h1 className="text-[22px] font-extrabold leading-tight text-[var(--text-dark)] md:text-[26px]">
            הוצאות
          </h1>
          <p className="mt-1 text-[12px] leading-relaxed text-[var(--text-mid)] md:text-[13px]">
            ייבוא מהבנק · צירוף חשבונית · שיוך לפרויקט — שורה ירוקה = סגורה
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ExportExcelButton
            onClick={() =>
              exportExpensesToExcel({
                expenses: visibleExpenses,
                expenseTypeById,
                clientNameById,
                projectNameById,
                supplierNameById: new Map(
                  suppliers.map((s) => [s.id, s.name] as const),
                ),
                reconciliationStatusById: reconciliationById,
                isClosed: isRowClosed,
              })
            }
            disabled={visibleExpenses.length === 0}
          />
          <button
            type="button"
            onClick={() => setImportOpen(true)}
            className="rounded-[10px] border border-[var(--border-orange-soft)] bg-[var(--dash-panel-bg)] px-3 py-2 text-sm font-semibold text-[var(--orange)] transition hover:bg-[var(--orange-light)]"
          >
            ⬆ ייבוא מהבנק
          </button>
          <button type="button" onClick={openAddExpense} className="hub-btn-orange text-sm">
            + הוסף הוצאה
          </button>
        </div>
      </header>

      <FinanceTabs badges={attention} />

      <FinancePeriodFilter
        {...period}
        projectFilter={{
          value: filterProjectId,
          onChange: setFilterProjectId,
          options: projectFilterOptions,
        }}
        clientFilter={{
          value: filterClientId,
          onChange: setFilterClientId,
          options: clientFilterOptions,
        }}
      />

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
      <section aria-label="סיכום הוצאות" className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        {(
          [
            {
              id: 'all' as const,
              label: 'סה״כ הוצאות',
              value: expenseKpis.allGross,
              count: expenseKpis.total,
              valueClass: 'text-[#DC2626]',
            },
            {
              id: 'fixed' as const,
              label: 'קבועות',
              value: expenseKpis.fixedGross,
              count: expenseKpis.fixedCount,
              valueClass: 'text-[#D97706]',
            },
            {
              id: 'variable' as const,
              label: 'משתנות',
              value: expenseKpis.variableGross,
              count: expenseKpis.variableCount,
              valueClass: 'text-[#4F46E5]',
            },
          ]
        ).map((card) => (
          <button
            key={card.id}
            type="button"
            onClick={() => setRecurringFilter(card.id)}
            className={`flex flex-col rounded-xl border p-3.5 text-right transition ${
              recurringFilter === card.id
                ? 'border-[var(--orange)] bg-[var(--orange-light)] shadow-[0_0_0_1px_var(--orange)]'
                : 'border-[var(--border)] bg-[var(--dash-panel-bg)] hover:border-[var(--border-orange-soft)]'
            }`}
          >
            <span className="flex items-center justify-between text-[11px] font-bold text-[var(--text-mid)]">
              {card.label}
              <span className="rounded-full bg-black/[0.04] px-2 py-0.5 text-[10px] font-extrabold tabular-nums">
                {card.count}
              </span>
            </span>
            <span
              className={`mt-2 text-[22px] font-extrabold tabular-nums leading-none ${card.valueClass}`}
            >
              {formatNis(card.value)}
            </span>
            <span className="mt-1.5 text-[10px] text-[var(--text-mid)]">
              כולל מע״מ
            </span>
          </button>
        ))}
        <div className="flex flex-col rounded-xl border border-[var(--border)] bg-[var(--surface-muted)]/35 p-3.5 text-right">
          <span className="text-[11px] font-bold text-[var(--text-mid)]">
            מע״מ תשומות
          </span>
          <span className="mt-2 text-[22px] font-extrabold tabular-nums leading-none text-[#7C3AED]">
            {formatNis(expenseKpis.inputVat)}
          </span>
          <span className="mt-1.5 text-[10px] text-[var(--text-mid)]">
            לקיזוז מול מע״מ עסקאות
          </span>
        </div>
      </section>
      ) : null}

      {activeTab === 'expenses' ? (
      <section className="rounded-2xl border border-[var(--border)] bg-[var(--dash-panel-bg)] p-4 shadow-[0_1px_8px_rgba(0,0,0,0.04)] sm:p-5">
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <h2 className="text-base font-extrabold text-[var(--text-dark)]">
              רשימת הוצאות
            </h2>
            <p className="mt-0.5 text-[11px] text-[var(--text-mid)]">
              {filterRangeLabel}
              {settlementCounts.open > 0
                ? ` · ${settlementCounts.open} ממתינות לחשבונית`
                : ' · הכל סגור'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap gap-1 rounded-xl border border-[var(--border)] bg-[var(--bg-main)] p-1">
              {(
                [
                  ['all', `הכל (${settlementCounts.total})`],
                  ['open', `ממתינות (${settlementCounts.open})`],
                  ['closed', `סגורות (${settlementCounts.closed})`],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setSettlementFilter(id)}
                  className={
                    settlementFilter === id
                      ? id === 'closed'
                        ? 'rounded-[8px] bg-[#DCFCE7] px-2.5 py-1.5 text-[11px] font-bold text-[#166534]'
                        : id === 'open'
                          ? 'rounded-[8px] bg-[#FEF3C7] px-2.5 py-1.5 text-[11px] font-bold text-[#92400E]'
                          : 'rounded-[8px] bg-[var(--orange)] px-2.5 py-1.5 text-[11px] font-bold text-white'
                      : 'rounded-[8px] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--text-mid)] hover:bg-black/[0.03]'
                  }
                >
                  {label}
                </button>
              ))}
            </div>
            {nameQuickFilter.trim() ? (
              <button
                type="button"
                onClick={() => setNameQuickFilter('')}
                className="rounded-[8px] border border-[var(--orange)] bg-[var(--orange-light)] px-2.5 py-1.5 text-[11px] font-bold text-[var(--orange)]"
                title="נקה סינון שם"
              >
                שם: {nameQuickFilter} ×
              </button>
            ) : null}
            <div className="flex flex-wrap gap-1 rounded-xl border border-[var(--border)] bg-[var(--bg-main)] p-1">
              {(
                [
                  ['all', 'סוג: הכל'],
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
                      ? 'rounded-[8px] bg-[var(--text-dark)] px-2.5 py-1.5 text-[11px] font-bold text-white'
                      : 'rounded-[8px] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--text-mid)] hover:bg-black/[0.03]'
                  }
                >
                  {label}
                </button>
              ))}
            </div>
            {expenses.length > 0 ? (
              <button
                type="button"
                onClick={() => setDeleteAllOpen(true)}
                className="rounded-[10px] border border-[#FECACA] bg-[#FEF2F2] px-3 py-2 text-[11px] font-semibold text-[#DC2626] transition hover:bg-[#FEE2E2]"
              >
                מחק הכל
              </button>
            ) : null}
          </div>
        </div>
        {loading ? (
          <p className="text-sm text-[var(--text-mid)]">טוען…</p>
        ) : visibleExpenses.length === 0 ? (
          <EmptyState
            title={
              filteredExpenses.length === 0
                ? 'אין הוצאות לטווח הנבחר'
                : settlementFilter === 'open'
                  ? 'אין הוצאות ממתינות'
                  : 'אין הוצאות סגורות בסינון'
            }
            description={
              filteredExpenses.length === 0
                ? `${filterRangeLabel} — הוסיפו הוצאה או שנו את הסינון`
                : 'נסו לשנות את סינון הסגירה או סוג ההוצאה'
            }
            icon={
              <svg viewBox="0 0 24 24" className="mx-auto h-10 w-10" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M12 8v8m-4-4h8M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            }
          />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
            <table className="w-full border-collapse text-sm">
              <thead className="sticky top-0 z-[1]">
                <tr className="border-b border-[var(--border)] bg-[var(--surface-muted)]/80 text-[11px] font-bold text-[var(--text-mid)] backdrop-blur-sm">
                  <SortableTh
                    label="תאריך"
                    columnKey="date"
                    sort={expenseSort}
                    onSort={toggleExpenseSort}
                  />
                  <SortableTh
                    label="שם הוצאה"
                    columnKey="name"
                    sort={expenseSort}
                    onSort={toggleExpenseSort}
                    defaultDir="asc"
                  />
                  <SortableTh
                    label="ברוטו"
                    columnKey="gross"
                    sort={expenseSort}
                    onSort={toggleExpenseSort}
                  />
                  <th className="px-2.5 py-2.5 text-right">מע״מ</th>
                  <th className="px-2.5 py-2.5 text-right">נטו</th>
                  <th className="px-2.5 py-2.5 text-right">פרויקט</th>
                  <th className="px-2.5 py-2.5 text-right">סטטוס · חשבונית</th>
                  <th className="px-2.5 py-2.5 text-right" />
                </tr>
              </thead>
              <tbody>
                {visibleExpenses.map((row) => {
                  const typeDef = resolveExpenseType(row.type, expenseTypeById)
                  /** משכורת ומסים נספרים בחודש שעבורו שולמו, לא בחודש התשלום */
                  const accrualRow = isAccrualExpense(row, typeDef)
                  /** חודש רו״ה = תאריך החשבונית (לא תאריך התשלום) */
                  const reportMonth = deriveExpensePnlMonth(row)
                  const vatClass = resolveExpenseVatClass(row)
                  const breakdown = resolveExpenseRowVat(row)
                  const payMonth = expensePaymentMonth(row)
                  const paymentDate = row.paidDate?.trim() || ''
                  const invoiceDate = row.documentDate?.trim() || ''
                  const monthMismatch =
                    !accrualRow &&
                    !!paymentDate &&
                    payMonth !== reportMonth
                  const refundLink = refundLinks.get(row.id)
                  const closed = isRowClosed(row)
                  const openPending =
                    !closed &&
                    (reconciliationById.get(row.id)?.status ===
                      'bank_missing_document' ||
                      reconciliationById.get(row.id)?.status ===
                        'manual_pending' ||
                      refundLink?.fully === false)
                  return (
                    <tr
                      key={`${row.id}-${reportMonth}-${payMonth}`}
                      className={`border-b border-[var(--border)]/80 transition ${
                        closed
                          ? 'bg-[#DCFCE7] hover:bg-[#BBF7D0]'
                          : openPending
                            ? 'bg-[#FFFBEB]/55 hover:bg-[#FEF3C7]/50'
                            : 'hover:bg-[var(--surface-muted)]/70'
                      }`}
                    >
                      <td className="whitespace-nowrap px-2.5 py-3 align-top tabular-nums">
                        <div
                          className="font-semibold text-[var(--text-dark)]"
                          title="חודש לפי תאריך החשבונית"
                        >
                          {monthLabelHe(reportMonth)}
                        </div>
                        <div className="mt-0.5 space-y-0.5 text-[10px] font-semibold text-[var(--text-mid)]">
                          {paymentDate ? (
                            <div>
                              תשלום {formatDateIL(paymentDate)}
                              {row.chargeDate &&
                              row.chargeDate !== paymentDate ? (
                                <span className="block">
                                  חיוב {formatDateIL(row.chargeDate)}
                                </span>
                              ) : null}
                            </div>
                          ) : null}
                          {invoiceDate ? (
                            <div>חשבונית {formatDateIL(invoiceDate)}</div>
                          ) : (
                            <div className="text-[var(--text-light)]">
                              חשבונית —
                            </div>
                          )}
                        </div>
                        {accrualRow && paymentDate ? (
                          <div className="mt-1 inline-block rounded-md bg-[#FEF3C7] px-1.5 py-0.5 text-[10px] font-semibold text-[#92400E]">
                            שולם {ymShort(paymentDate.slice(0, 7))} · משויך{' '}
                            {ymShort(reportMonth)}
                          </div>
                        ) : null}
                        {monthMismatch ? (
                          <div className="mt-1 inline-block rounded-md bg-[#E0E7FF] px-1.5 py-0.5 text-[10px] font-semibold text-[#3730A3]">
                            שולם {ymShort(payMonth)} · לפי חשבונית{' '}
                            {ymShort(reportMonth)}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-2.5 py-3 align-top">
                        <FinanceClickable
                          className="font-semibold text-[var(--text-dark)] hover:text-[var(--orange)]"
                          title="סנן לפי שם זה"
                          onClick={() =>
                            setNameQuickFilter(expenseDisplayName(row, typeDef))
                          }
                        >
                          {expenseDisplayName(row, typeDef)}
                        </FinanceClickable>
                        {row.clientId && clientNameById.get(row.clientId) ? (
                          <div className="mt-0.5">
                            <FinanceClickable
                              className="text-[10px]"
                              title="כרטיס פיננסי ללקוח"
                              onClick={() =>
                                setClientCard({
                                  clientId: row.clientId,
                                  clientName: clientNameById.get(row.clientId!)!,
                                })
                              }
                            >
                              {clientNameById.get(row.clientId)}
                            </FinanceClickable>
                          </div>
                        ) : null}
                        <div className="mt-0.5 flex flex-wrap items-center gap-1 text-[10px] text-[var(--text-mid)]">
                          <span>{typeDef.label}</span>
                          <span aria-hidden>·</span>
                          <ExpenseVatClassChip
                            value={vatClass}
                            onChange={(next) => {
                              void updateExpense(row.id, {
                                vatClass: next,
                                vatLiable: vatClassToLiable(next),
                              })
                            }}
                          />
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-2.5 py-3 align-top tabular-nums font-bold text-[var(--text-dark)]">
                        {formatNis(breakdown.gross)}
                        {/* בעסקת מט״ח הסכום בשקלים תלוי בשער — הנקוב בחשבונית הוא סכום המקור */}
                        {(() => {
                          const fx = resolveExpenseForeign(row)
                          if (!fx) return null
                          return (
                            <span className="mt-0.5 block text-[10px] font-bold text-[#3730A3]">
                              {formatForeignAmount(fx.amount, fx.currency)}
                            </span>
                          )
                        })()}
                      </td>
                      <td className="whitespace-nowrap px-2.5 py-3 align-top tabular-nums text-[#7C3AED]">
                        {vatClass === 'vat_liable' ? formatNis(breakdown.vat) : '—'}
                      </td>
                      <td className="whitespace-nowrap px-2.5 py-3 align-top tabular-nums font-bold text-[#DC2626]">
                        {formatNis(breakdown.net)}
                      </td>
                      <td className="px-2.5 py-3 align-top">
                        {typeDef.fieldMode === 'salary' ? (
                          <span className="text-[11px] text-[var(--text-mid)]">
                            —
                          </span>
                        ) : (
                          <div
                            className="w-[128px]"
                            title={
                              row.projectId
                                ? (projectNameById.get(row.projectId) ??
                                  'פרויקט שנמחק')
                                : 'ללא שיוך לפרויקט'
                            }
                          >
                            <HubDropdownSelect
                              value={row.projectId ?? ''}
                              onChange={(projectId) => {
                                const p = projectId
                                  ? projects.find((x) => x.id === projectId)
                                  : undefined
                                void updateExpense(row.id, {
                                  projectId: projectId || null,
                                  ...(p?.clientId
                                    ? { clientId: p.clientId }
                                    : {}),
                                })
                              }}
                              options={projectOptionsForExpense(row)}
                              emptyOption={{ label: 'ללא שיוך' }}
                              searchable
                              searchPlaceholder={
                                row.clientId ||
                                (row.projectId &&
                                  projectClientById.get(row.projectId))
                                  ? 'חיפוש פרויקט של הלקוח…'
                                  : 'בחרו לקוח / פרויקט קיים…'
                              }
                              menuClassName="min-w-[280px]"
                              menuFooter={
                                <button
                                  type="button"
                                  className="w-full rounded-lg bg-[var(--orange)] px-3 py-2 text-[12px] font-bold text-white transition hover:brightness-105"
                                  onClick={() =>
                                    setQuickCreateFor({
                                      expenseId: row.id,
                                      clientId:
                                        row.clientId?.trim() ||
                                        (row.projectId
                                          ? (projectClientById.get(
                                              row.projectId,
                                            ) ?? '')
                                          : ''),
                                      clientName:
                                        clientNameById.get(
                                          row.clientId ??
                                            (row.projectId
                                              ? (projectClientById.get(
                                                  row.projectId,
                                                ) ?? '')
                                              : ''),
                                        ) ?? '',
                                    })
                                  }
                                >
                                  + פרויקט מהיר
                                </button>
                              }
                            />
                            {row.projectId &&
                            !projectNameById.has(row.projectId) ? (
                              <div className="mt-1 text-[10px] font-semibold text-[#B45309]">
                                פרויקט שנמחק
                              </div>
                            ) : null}
                          </div>
                        )}
                      </td>
                      <td className="px-2.5 py-3 align-top">
                        <div className="flex min-w-[140px] flex-col items-start gap-1.5">
                          {refundLink ? (
                            <RefundLinkNote link={refundLink} />
                          ) : (
                            <ExpenseReconciliationBadge
                              status={reconciliationById.get(row.id)?.status}
                              linkedGi={reconciliationById.get(row.id)?.linkedGi}
                              expense={row}
                            />
                          )}
                          {row.expenseNote?.trim() ? (
                            <div className="max-w-[220px] rounded-lg border border-[#FECACA] bg-[#FEF2F2] px-2 py-1 text-[11px] font-bold leading-snug text-[#DC2626]">
                              הערה: {row.expenseNote.trim()}
                            </div>
                          ) : null}
                          <div className="flex flex-wrap items-center gap-1.5">
                            {hasAttachedDocument(row) && row.documentUrl ? (
                              <a
                                href={row.documentUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="text-[10px] font-bold text-[var(--orange)] underline decoration-[var(--orange)]/40 underline-offset-2"
                              >
                                {row.invoiceNumber?.trim()
                                  ? `#${row.invoiceNumber.trim()}`
                                  : 'צפייה במסמך'}
                              </a>
                            ) : null}
                            {(() => {
                              const linkedGi = reconciliationById.get(row.id)
                                ?.linkedGi
                              if (!canViewGiExpenseDocument(row, linkedGi)) {
                                return null
                              }
                              const giId = resolveGiExpenseId(linkedGi)
                              const giMeta = resolveGiExpenseLabel(linkedGi!)
                              const bankMerchant =
                                row.name ?? row.supplierName ?? row.description
                              return (
                                <GiExpenseDocumentButton
                                  key={`gi-doc-${giId}`}
                                  greenInvoiceId={giId!}
                                  invoiceNumber={giMeta.invoiceNumber}
                                  supplierName={giMeta.supplierName}
                                  bankMerchantName={bankMerchant}
                                />
                              )
                            })()}
                            <button
                              type="button"
                              onClick={() => setAttachingExpense(row)}
                              className={
                                hasAttachedDocument(row)
                                  ? uiBtnAttachGhost
                                  : uiBtnAttach
                              }
                            >
                              {hasAttachedDocument(row) ? 'החלף' : 'צרף חשבונית'}
                            </button>
                          </div>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-2.5 py-3 align-top">
                        <div className="flex gap-1">
                          <button
                            type="button"
                            className={uiBtnRowIcon}
                            title="עריכה"
                            onClick={() => openEditExpense(row)}
                          >
                            ✎
                          </button>
                          <button
                            type="button"
                            className={uiBtnRowIconDanger}
                            title="מחיקה"
                            onClick={() => setDeleteExpenseId(row.id)}
                          >
                            ✕
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-[var(--border)] bg-[var(--surface-muted)]/70 text-[13px] font-extrabold text-[var(--text-dark)]">
                  <td className="px-2.5 py-3" colSpan={2}>
                    סה״כ ({visibleExpenses.length})
                  </td>
                  <td className="px-2.5 py-3 tabular-nums">
                    {formatNis(expenseTotals.gross)}
                  </td>
                  <td className="px-2.5 py-3 tabular-nums text-[#7C3AED]">
                    {formatNis(expenseTotals.vat)}
                  </td>
                  <td className="px-2.5 py-3 tabular-nums text-[#DC2626]">
                    {formatNis(expenseTotals.net)}
                  </td>
                  <td className="px-2.5 py-3" colSpan={3} />
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

      <AttachInvoiceModal
        expense={attachingExpense}
        onClose={() => setAttachingExpense(null)}
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
                <FieldLabel>
                  ספק{editingExpense ? ' (אופציונלי)' : ' *'}
                </FieldLabel>
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
                      setExpenseForm((f) => {
                        const projectStillValid =
                          !f.projectId ||
                          projects.find((p) => p.id === f.projectId)
                            ?.clientId === clientId
                        return {
                          ...f,
                          clientId,
                          projectId: projectStillValid ? f.projectId : '',
                          linkedIncomeId: projectStillValid
                            ? f.linkedIncomeId
                            : '',
                        }
                      })
                    }
                  />
                </div>
                <div>
                  <FieldLabel>קישור לפרויקט (אופציונלי)</FieldLabel>
                  <ProjectQuickSelect
                    projects={projects}
                    value={expenseForm.projectId}
                    scopeByClient
                    clientId={expenseForm.clientId}
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
                  {!expenseForm.clientId ? (
                    <p className="mt-1 text-[11px] text-[var(--text-mid)]">
                      בחרו לקוח כדי לראות רק את הפרויקטים שלו
                    </p>
                  ) : null}
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
                        <p className="mt-2 text-[11px] leading-relaxed text-[var(--text-mid)]">
                          הקישור לעסקה משמש לרווחיות הפרויקט בלבד. ברווח והפסד
                          ההוצאה נספרת ב
                          {monthLabelHe(expenseForm.billingMonth)}.
                        </p>
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
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <FieldLabel>מטבע מקור</FieldLabel>
                  <select
                    value={expenseForm.currency}
                    onChange={(e) =>
                      setExpenseForm((f) => ({
                        ...f,
                        currency: e.target.value,
                      }))
                    }
                    className={hubInputClass()}
                  >
                    <option value="">שקל בלבד</option>
                    <option value="USD">USD $</option>
                    <option value="EUR">EUR €</option>
                    <option value="GBP">GBP £</option>
                  </select>
                </div>
                <div>
                  <FieldLabel>סכום במט״ח</FieldLabel>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={expenseForm.originalAmount}
                    disabled={!expenseForm.currency}
                    onChange={(e) =>
                      setExpenseForm((f) => ({
                        ...f,
                        originalAmount: e.target.value,
                      }))
                    }
                    placeholder="20"
                    className={hubInputClass()}
                  />
                </div>
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

          {expenseFormError ? (
            <p className="rounded-xl border border-[#FECACA] bg-[#FEF2F2] px-3 py-2.5 text-[12px] font-bold text-[#DC2626]">
              {expenseFormError}
            </p>
          ) : null}

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

      <QuickCreateProjectModal
        open={!!quickCreateFor}
        onClose={() => setQuickCreateFor(null)}
        clientId={quickCreateFor?.clientId}
        clientName={quickCreateFor?.clientName}
        onCreated={(projectId) => {
          if (!quickCreateFor) return
          void updateExpense(quickCreateFor.expenseId, {
            projectId,
            ...(quickCreateFor.clientId
              ? { clientId: quickCreateFor.clientId }
              : {}),
          })
          setQuickCreateFor(null)
        }}
      />

      <ClientFinanceCardModal
        target={clientCard}
        onClose={() => setClientCard(null)}
        clientNameById={clientNameById}
      />
    </div>
  )
}
