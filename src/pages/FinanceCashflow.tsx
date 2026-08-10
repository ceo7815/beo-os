import { useMemo, useState } from 'react'
import { FinanceTabs } from '../components/finance/FinanceTabs'
import { FinancePeriodFilter } from '../components/finance/FinancePeriodFilter'
import { FinanceCashflowChart } from '../components/finance/FinanceCashflowChart'
import { FinanceCashflowLedgerTable } from '../components/finance/FinanceCashflowLedgerTable'
import { ExpectedCollectionCard } from '../components/finance/ExpectedCollectionCard'
import { FinanceExpectedExpensesPanel } from '../components/finance/FinanceExpectedExpensesPanel'
import { FinanceHeroCard, FinanceMiniStat } from '../components/finance/FinanceKpi'
import { EmptyState } from '../components/shared/EmptyState'
import { ExportExcelButton } from '../components/shared/ExportExcelButton'
import { useCashflowPeriodFilter } from '../hooks/useFinancePeriodFilter'
import { useFinanceAttention } from '../hooks/useFinanceAttention'
import { useFinanceCashflow } from '../hooks/useFinanceCashflow'
import { useFinanceIncomes } from '../hooks/useFinanceIncomes'
import { useFinanceFixedExpenseCatalog } from '../hooks/useFinanceFixedExpenseCatalog'
import { useFinanceExpenses } from '../hooks/useFinanceExpenses'
import { useFinanceExpenseTypes } from '../hooks/useFinanceExpenseTypes'
import { useClients } from '../hooks/useClients'
import {
  buildCashflowLedger,
  computeCashflowForecast,
} from '../lib/cashflowCompute'
import { formatNis } from '../lib/financeCalc'
import { formatDateIL, todayYmd } from '../lib/dates'
import { isOpenTransactionAccount } from '../lib/financeIncomeDocument'
import { incomeOutstandingAmount } from '../lib/financeIncomePayment'
import { hubSectionClass } from '../lib/hubSectionBorder'
import { exportCashflowLedgerToExcel } from '../lib/excelTableExports'
import { toastFsSuccess } from '../lib/fsToast'

export function FinanceCashflow() {
  const period = useCashflowPeriodFilter()
  const attention = useFinanceAttention(period.filterYmFrom, period.filterYmTo)
  const {
    state,
    snapshots,
    giRecurring,
    giRetainers,
    expectedExpenses,
    vatEstimates,
    loading: cashflowLoading,
    saveBalance,
    saveSnapshot,
    addExpectedExpense,
    updateExpectedExpense,
    deleteExpectedExpense,
    updateVatEstimate,
  } = useFinanceCashflow()
  const { incomes, loading: incomesLoading, updateIncome } = useFinanceIncomes()
  const { expenses, loading: expensesLoading } = useFinanceExpenses()
  const { items: fixedExpenseCatalog } = useFinanceFixedExpenseCatalog()
  const { types: expenseTypes } = useFinanceExpenseTypes()
  const { clients } = useClients()

  const clientNameById = useMemo(() => {
    const m = new Map<string, string>()
    for (const c of clients) m.set(c.id, c.name)
    return m
  }, [clients])

  const today = todayYmd()
  const [balanceInput, setBalanceInput] = useState('')
  const [asOfInput, setAsOfInput] = useState(today)
  const [saving, setSaving] = useState(false)

  const openingBalance = state?.balance ?? 0
  const asOfDate = state?.asOfDate ?? today

  const forecast = useMemo(
    () =>
      computeCashflowForecast({
        openingBalance,
        asOfDate,
        ymFrom: period.filterYmFrom,
        ymTo: period.filterYmTo,
        giRecurring,
        giRetainers,
        incomes,
        expenses,
        expenseTypes,
        clientNames: clientNameById,
        expectedExpenses,
        vatEstimates,
        fixedExpenseCatalog,
      }),
    [
      openingBalance,
      asOfDate,
      period.filterYmFrom,
      period.filterYmTo,
      giRecurring,
      giRetainers,
      incomes,
      expenses,
      expenseTypes,
      clientNameById,
      expectedExpenses,
      vatEstimates,
      fixedExpenseCatalog,
    ],
  )

  const ledgerRows = useMemo(
    () =>
      buildCashflowLedger({
        forecast,
        asOfDate,
        incomes,
        expenses,
        expectedExpenses,
        vatEstimates,
        fixedExpenseCatalog,
      }),
    [
      forecast,
      asOfDate,
      incomes,
      expenses,
      expectedExpenses,
      vatEstimates,
      fixedExpenseCatalog,
    ],
  )

  const openTxnForEdit = useMemo(() => {
    const cutoff = new Date(`${today}T12:00:00`)
    cutoff.setMonth(cutoff.getMonth() - 6)
    const cutoffYmd = cutoff.toISOString().slice(0, 10)
    return incomes.filter((inc) => {
      if (!isOpenTransactionAccount(inc)) return false
      if (inc.invoiceDate.slice(0, 10) < cutoffYmd) return false
      return incomeOutstandingAmount(inc) > 0
    })
  }, [incomes, today])

  async function handleSaveBalance() {
    const n = Number(balanceInput.replace(/,/g, ''))
    if (!Number.isFinite(n)) return
    setSaving(true)
    try {
      await saveBalance(n, asOfInput)
      setBalanceInput('')
    } finally {
      setSaving(false)
    }
  }

  async function handleSaveSnapshot() {
    const n = Number(
      (balanceInput || String(openingBalance)).replace(/,/g, ''),
    )
    if (!Number.isFinite(n)) return
    setSaving(true)
    try {
      await saveSnapshot(n, asOfInput)
      setBalanceInput('')
    } finally {
      setSaving(false)
    }
  }

  const loading = cashflowLoading || incomesLoading || expensesLoading

  return (
    <div className="mx-auto min-w-0 w-full max-w-[1400px] space-y-5 px-4 py-6 sm:px-8">
      <header className="text-right">
        <h1 className="text-[22px] font-extrabold leading-tight text-[var(--text-dark)] md:text-[26px]">
          תזרים מזומנים
        </h1>
        <p className="mt-1 text-[12px] leading-relaxed text-[var(--text-mid)] md:text-[13px]">
          תחזית כניסות ויציאות — הוראות קבע, ריטיינרים, גבייה, הוצאות קבועות ומע״מ
        </p>
      </header>

      <FinanceTabs badges={attention} />

      <FinancePeriodFilter
        variant="forecast"
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

      <section className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <FinanceHeroCard
          label="יתרה נוכחית"
          value={formatNis(forecast.summary.openingBalance)}
          hint={state ? formatDateIL(asOfDate) : 'טרם הוזנה'}
        />
        <FinanceHeroCard
          label="יתרה צפויה בסוף תקופה"
          value={formatNis(forecast.summary.endBalance)}
          hint={period.filterRangeLabel}
          tone={forecast.summary.endBalance >= 0 ? 'profit' : 'expense'}
        />
        <FinanceHeroCard
          label="מינימום צפוי"
          value={formatNis(forecast.summary.minBalance)}
          hint={formatDateIL(forecast.summary.minBalanceDate)}
          tone={forecast.summary.minBalance >= 0 ? 'neutral' : 'expense'}
        />
        <FinanceMiniStat
          label="כניסות / יציאות צפויות"
          value={`${formatNis(forecast.summary.totalIn)} / ${formatNis(forecast.summary.totalOut)}`}
        />
      </section>

      <section
        className={`rounded-2xl ${hubSectionClass(0)} p-4 shadow-[0_1px_8px_rgba(0,0,0,0.04)] sm:p-5`}
      >
        <h2 className="mb-3 text-base font-extrabold text-[var(--text-dark)]">
          יתרת עובר ושב
        </h2>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-right">
            <span className="text-[11px] font-bold text-[var(--text-mid)]">
              סכום ₪
            </span>
            <input
              type="text"
              inputMode="decimal"
              placeholder={String(openingBalance)}
              value={balanceInput}
              onChange={(e) => setBalanceInput(e.target.value)}
              className="w-[140px] rounded-xl border border-[var(--border)] bg-[var(--dash-panel-bg)] px-3 py-2 text-[13px] tabular-nums outline-none focus:border-[var(--orange)]"
            />
          </label>
          <label className="flex flex-col gap-1 text-right">
            <span className="text-[11px] font-bold text-[var(--text-mid)]">
              נכון לתאריך
            </span>
            <input
              type="date"
              value={asOfInput}
              onChange={(e) => setAsOfInput(e.target.value)}
              className="rounded-xl border border-[var(--border)] bg-[var(--dash-panel-bg)] px-3 py-2 text-[13px] outline-none focus:border-[var(--orange)]"
            />
          </label>
          <button
            type="button"
            disabled={saving}
            onClick={() => void handleSaveBalance()}
            className="rounded-[10px] bg-[var(--orange)] px-4 py-2 text-[12px] font-bold text-white transition hover:brightness-95 disabled:opacity-50"
          >
            עדכן יתרה
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void handleSaveSnapshot()}
            className="rounded-[10px] border border-[var(--border-orange-soft)] px-4 py-2 text-[12px] font-semibold text-[var(--orange)] transition hover:bg-[var(--orange-light)] disabled:opacity-50"
          >
            שמור snapshot יומי
          </button>
        </div>
        {snapshots.length > 0 ? (
          <p className="mt-3 text-[11px] text-[var(--text-mid)]">
            Snapshots אחרונים:{' '}
            {snapshots
              .slice(0, 5)
              .map((s) => `${formatDateIL(s.asOfDate)} ${formatNis(s.balance)}`)
              .join(' · ')}
          </p>
        ) : null}
      </section>

      {loading ? (
        <p className="py-8 text-center text-sm text-[var(--text-mid)]">טוען…</p>
      ) : (
        <>
          <FinanceCashflowChart
            daily={forecast.dailyBalances}
            minBalance={forecast.summary.minBalance}
            minBalanceDate={forecast.summary.minBalanceDate}
          />

          <section
            className={`rounded-2xl ${hubSectionClass(1)} p-4 shadow-[0_1px_8px_rgba(0,0,0,0.04)] sm:p-5`}
          >
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-[15px] font-extrabold text-[var(--text-dark)]">
                יומן תזרים — כל התנועות ({ledgerRows.length - 1})
              </h3>
              <div className="flex flex-wrap items-center gap-2">
                <ExportExcelButton
                  onClick={() => exportCashflowLedgerToExcel(ledgerRows)}
                  disabled={ledgerRows.length <= 1}
                  className="px-3 py-1.5 text-xs"
                />
                {forecast.missingExpectedDates > 0 ? (
                  <span className="rounded-full bg-[#FEF3C7] px-2.5 py-1 text-[11px] font-bold text-[#92400E]">
                    {forecast.missingExpectedDates} חשבונות גבייה ללא תאריך צפי
                  </span>
                ) : null}
              </div>
            </div>
            <p className="mb-3 text-[11px] text-[var(--text-mid)]">
              צפי יומי מסודר: מה נכנס, מה יוצא, יתרה זמינה, אופן תשלום והערות — כולל
              הוראות קבע, ריטיינרים, גבייה, הוצאות קבועות, הוצאות צפויות ידניות ומע״מ.
              שורות אומדן מע״מ ניתנות לעריכה ישירה בעמודת «יצא».
            </p>
            <FinanceCashflowLedgerTable
              rows={ledgerRows}
              onVatAmountChange={(vatYm, amount) => updateVatEstimate(vatYm, { amount })}
            />
          </section>

          <section
            className={`rounded-2xl ${hubSectionClass(3)} p-4 shadow-[0_1px_8px_rgba(0,0,0,0.04)] sm:p-5`}
          >
            <div className="mb-3">
              <h3 className="text-[14px] font-extrabold text-[var(--text-dark)]">
                הוצאות צפויות ידניות ({expectedExpenses.length})
              </h3>
              <p className="mt-1 text-[11px] text-[var(--text-mid)]">
                הוצאות שאתם יודעים שיגיעו — נכנסות מיד ליומן התזרים, לגרף ולסיכום.
              </p>
            </div>
            <FinanceExpectedExpensesPanel
              items={expectedExpenses}
              onAdd={addExpectedExpense}
              onUpdate={updateExpectedExpense}
              onDelete={deleteExpectedExpense}
            />
          </section>

          <section
            className={`rounded-2xl ${hubSectionClass(2)} p-4 shadow-[0_1px_8px_rgba(0,0,0,0.04)]`}
          >
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-[14px] font-extrabold text-[var(--text-dark)]">
                גבייה — תאריך צפי ({openTxnForEdit.length})
              </h3>
              {forecast.missingExpectedDates > 0 ? (
                <span className="rounded-full bg-[#FEF3C7] px-2.5 py-1 text-[11px] font-bold text-[#92400E]">
                  {forecast.missingExpectedDates} ללא תאריך צפי
                </span>
              ) : null}
            </div>
            {openTxnForEdit.length === 0 ? (
              <EmptyState
                title="אין חשבונות עסקה פתוחים"
                description="בטווח 6 חודשים אחרונים."
              />
            ) : (
              <div className="space-y-3">
                {openTxnForEdit.map((inc) => {
                  const name =
                    clientNameById.get(inc.clientId) ||
                    inc.greenInvoiceClientName ||
                    '—'
                  const outstanding = incomeOutstandingAmount(inc)
                  return (
                    <ExpectedCollectionCard
                      key={inc.id}
                      income={inc}
                      clientName={name}
                      outstanding={outstanding}
                      onSave={async (patch) => {
                        await updateIncome(inc.id, patch, { silent: true })
                        toastFsSuccess('התשלומים נשמרו — התזרים מתעדכן')
                      }}
                    />
                  )
                })}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}
