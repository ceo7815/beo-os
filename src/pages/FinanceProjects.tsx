import { useCallback, useMemo, useState } from 'react'
import { EmptyState } from '../components/shared/EmptyState'
import { ExportExcelButton } from '../components/shared/ExportExcelButton'
import { Modal } from '../components/shared/Modal'
import { Badge } from '../components/shared/Badge'
import {
  ClientFinanceCardModal,
  type ClientFinanceTarget,
} from '../components/finance/ClientFinanceCardModal'
import { FinanceClickable } from '../components/finance/FinanceClickable'
import { FinanceHeroCard } from '../components/finance/FinanceKpi'
import { GreenInvoiceBadge } from '../components/finance/GreenInvoiceBadge'
import { SortableTh } from '../components/finance/SortableTh'
import { FinanceTabs } from '../components/finance/FinanceTabs'
import { useFinanceAttention } from '../hooks/useFinanceAttention'
import { ProjectFinanceSection } from '../components/finance/ProjectFinanceSection'
import { HostingFinanceSection } from '../components/finance/HostingFinanceSection'
import { sortByKey, useTableSort } from '../lib/financeTableSort'
import { useClients } from '../hooks/useClients'
import { useProjects } from '../hooks/useProjects'
import { useFinanceIncomes } from '../hooks/useFinanceIncomes'
import { useFinanceExpenses } from '../hooks/useFinanceExpenses'
import { useFinanceExpenseTypes } from '../hooks/useFinanceExpenseTypes'
import { computeHostingFinance } from '../lib/financeHosting'
import { computeSummary, formatNis } from '../lib/financeCalc'
import { formatDateIL } from '../lib/dates'
import { hubSectionClass } from '../lib/hubSectionBorder'
import { exportFinanceProjectsToExcel } from '../lib/excelTableExports'
import type { Project, ProjectStatus } from '../types'

const STATUS_LABEL: Record<ProjectStatus, string> = {
  active: 'פעיל',
  paused: 'מושהה',
  done: 'הושלם',
}

const STATUS_COLOR: Record<ProjectStatus, string> = {
  active: '#2563EB',
  paused: '#64748B',
  done: '#16A34A',
}

type StatusFilter = 'all' | ProjectStatus

type ProjectFinanceRow = {
  project: Project
  clientName: string
  incomeGross: number
  expenseGross: number
  netProfit: number
  collectionBalance: number
}

export function FinanceProjects() {
  const { projects } = useProjects()
  const { clients } = useClients()
  const { incomes } = useFinanceIncomes()
  const { expenses } = useFinanceExpenses()
  const attention = useFinanceAttention()
  const { types: expenseTypes } = useFinanceExpenseTypes()

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [openProjectId, setOpenProjectId] = useState<string | null>(null)
  const [hostingOpen, setHostingOpen] = useState(false)
  const [portalOpen, setPortalOpen] = useState(false)
  const [clientCard, setClientCard] = useState<ClientFinanceTarget | null>(null)
  const { sort, toggle } = useTableSort<
    'client' | 'income' | 'expense' | 'profit' | 'collection'
  >('income', 'desc')

  // אחסון אתרים — חודשי + שנתי (ללא פורטל); הוצאות אחסון מיוחסות לכאן
  const hosting = useMemo(
    () =>
      computeHostingFinance(incomes, expenses, {
        types: ['monthly', 'yearly'],
      }),
    [incomes, expenses],
  )
  // פורטל BizBakrayot — פורטל חודשי בלבד (צד הכנסות)
  const portal = useMemo(
    () =>
      computeHostingFinance(incomes, expenses, {
        types: ['portal_monthly'],
        includeExpenses: false,
      }),
    [incomes, expenses],
  )

  const clientNameById = useMemo(() => {
    const m = new Map<string, string>()
    clients.forEach((c) => m.set(c.id, c.name))
    return m
  }, [clients])

  const rows = useMemo<ProjectFinanceRow[]>(() => {
    return projects.map((project) => {
      const summary = computeSummary(
        incomes,
        expenses,
        { ymFrom: '', ymTo: '', projectId: project.id, clientId: '' },
        new Set<string>(),
        expenseTypes,
      )
      const expenseGross =
        summary.expenseVatLiableGross + summary.expenseNonVatTotal
      return {
        project,
        clientName: project.clientId
          ? clientNameById.get(project.clientId) ?? 'לקוח לא ידוע'
          : project.type === 'internal'
            ? 'פנימי'
            : 'ללא לקוח',
        incomeGross: summary.incomeGross,
        expenseGross,
        netProfit: summary.trueNetProfit,
        collectionBalance: summary.collectionBalance,
      }
    })
  }, [projects, incomes, expenses, expenseTypes, clientNameById])

  const getProjectSortValue = useCallback(
    (
      r: ProjectFinanceRow,
      key: 'client' | 'income' | 'expense' | 'profit' | 'collection',
    ): string | number => {
      if (key === 'client') return r.clientName
      if (key === 'income') return r.incomeGross
      if (key === 'expense') return r.expenseGross
      if (key === 'profit') return r.netProfit
      return r.collectionBalance
    },
    [],
  )

  const filteredRows = useMemo(() => {
    const list =
      statusFilter === 'all'
        ? rows
        : rows.filter((r) => r.project.status === statusFilter)
    return sortByKey(list, sort, getProjectSortValue)
  }, [rows, statusFilter, sort, getProjectSortValue])

  const totals = useMemo(
    () =>
      filteredRows.reduce(
        (acc, r) => {
          acc.income += r.incomeGross
          acc.expense += r.expenseGross
          acc.profit += r.netProfit
          acc.collection += r.collectionBalance
          return acc
        },
        { income: 0, expense: 0, profit: 0, collection: 0 },
      ),
    [filteredRows],
  )
  const round2 = (n: number) => Math.round(n * 100) / 100

  const openRow = filteredRows.find((r) => r.project.id === openProjectId)
  const openClient = openRow?.project.clientId
    ? clients.find((c) => c.id === openRow.project.clientId)
    : undefined

  const statusButtons: { key: StatusFilter; label: string }[] = [
    { key: 'all', label: 'הכל' },
    { key: 'active', label: 'פעיל' },
    { key: 'paused', label: 'מושהה' },
    { key: 'done', label: 'הושלם' },
  ]

  return (
    <div className="mx-auto min-w-0 w-full max-w-[1400px] space-y-6 px-4 py-8 sm:px-8">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-[22px] font-extrabold text-[var(--text-dark)] md:text-[26px]">
            פרויקטים — פיננסים
          </h1>
          <p className="mt-1.5 text-[12px] text-[var(--text-mid)] md:text-[13px]">
            רווח והפסד, הכנסות, הוצאות וגבייה לכל פרויקט — לחיצה פותחת פירוט מלא
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ExportExcelButton
            onClick={() =>
              exportFinanceProjectsToExcel(
                filteredRows.map((r) => ({
                  projectName: r.project.name,
                  clientName: r.clientName,
                  status: STATUS_LABEL[r.project.status],
                  incomeGross: r.incomeGross,
                  expenseGross: r.expenseGross,
                  netProfit: r.netProfit,
                  collectionBalance: r.collectionBalance,
                  dueDate: r.project.dueDate,
                })),
              )
            }
            disabled={filteredRows.length === 0}
          />
          <GreenInvoiceBadge />
        </div>
      </header>

      <FinanceTabs badges={attention} />

      <section className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <FinanceHeroCard
          tone="income"
          label='הכנסות (כולל מע"מ)'
          value={formatNis(round2(totals.income))}
          hint="סך כל הפרויקטים בתצוגה"
        />
        <FinanceHeroCard
          tone="expense"
          label='הוצאות (כולל מע"מ)'
          value={formatNis(round2(totals.expense))}
          hint="הוצאות משויכות לפרויקטים"
        />
        <FinanceHeroCard
          emphasis
          tone={totals.profit >= 0 ? 'profit' : 'expense'}
          label="רווח נקי אמיתי"
          value={formatNis(round2(totals.profit))}
          hint="אחרי קיזוז מע״מ לתשלום"
        />
        <FinanceHeroCard
          tone="neutral"
          label="יתרה לגבייה"
          value={formatNis(round2(totals.collection))}
          hint="חשבוניות עסקה פתוחות"
        />
      </section>

      <button
        type="button"
        onClick={() => setHostingOpen(true)}
        className="flex w-full flex-col gap-3 rounded-2xl border-2 border-[#0EA5E9] bg-[#F0F9FF] p-5 text-right transition hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(14,165,233,0.18)] sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#0EA5E9] text-[20px] text-white">
            ☁
          </span>
          <div>
            <div className="flex items-center gap-1.5 text-[15px] font-extrabold text-[var(--text-dark)]">
              אחסון אתרים
              <span className="text-[10px] font-normal text-[var(--text-light)]">ⓘ</span>
            </div>
            <div className="text-[12px] text-[var(--text-mid)]">
              {hosting.activeClients} לקוחות · MRR {formatNis(hosting.mrr)} · ARR{' '}
              {formatNis(hosting.arr)}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-4 [direction:rtl]">
          <div className="text-right">
            <div className="text-[10px] font-bold text-[var(--text-mid)]">הכנסות</div>
            <div className="text-[16px] font-extrabold tabular-nums text-[#10B981]">
              {formatNis(hosting.incomeGross)}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] font-bold text-[var(--text-mid)]">הוצאות</div>
            <div className="text-[16px] font-extrabold tabular-nums text-[#EF4444]">
              {formatNis(hosting.expenseGross)}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] font-bold text-[var(--text-mid)]">רווח נקי</div>
            <div
              className={`text-[16px] font-extrabold tabular-nums ${
                hosting.trueNetProfit >= 0 ? 'text-[#10B981]' : 'text-[#EF4444]'
              }`}
            >
              {formatNis(hosting.trueNetProfit)}
            </div>
          </div>
        </div>
      </button>

      <button
        type="button"
        onClick={() => setPortalOpen(true)}
        className="flex w-full flex-col gap-3 rounded-2xl border-2 border-[#7C3AED] bg-[#F5F3FF] p-5 text-right transition hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(124,58,237,0.18)] sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#7C3AED] text-[20px] text-white">
            🗂
          </span>
          <div>
            <div className="flex items-center gap-1.5 text-[15px] font-extrabold text-[var(--text-dark)]">
              Biz.bakrayot — פורטל
              <span className="text-[10px] font-normal text-[var(--text-light)]">ⓘ</span>
            </div>
            <div className="text-[12px] text-[var(--text-mid)]">
              {portal.activeClients} לקוחות · MRR {formatNis(portal.mrr)} · ARR{' '}
              {formatNis(portal.arr)}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-4 [direction:rtl]">
          <div className="text-right">
            <div className="text-[10px] font-bold text-[var(--text-mid)]">הכנסות</div>
            <div className="text-[16px] font-extrabold tabular-nums text-[#10B981]">
              {formatNis(portal.incomeGross)}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] font-bold text-[var(--text-mid)]">מע״מ</div>
            <div className="text-[16px] font-extrabold tabular-nums text-[#6366F1]">
              {formatNis(portal.incomeVat)}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] font-bold text-[var(--text-mid)]">נטו</div>
            <div className="text-[16px] font-extrabold tabular-nums text-[#10B981]">
              {formatNis(portal.incomeNet)}
            </div>
          </div>
        </div>
      </button>

      <section className={`rounded-2xl ${hubSectionClass(0)} p-4 shadow-[0_2px_12px_rgba(0,0,0,0.06)] sm:p-5`}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-extrabold text-[var(--text-dark)]">
            רשימת פרויקטים
          </h2>
          <div className="flex flex-wrap gap-1.5">
            {statusButtons.map((b) => (
              <button
                key={b.key}
                type="button"
                onClick={() => setStatusFilter(b.key)}
                className={
                  statusFilter === b.key
                    ? 'rounded-[10px] border border-[var(--orange)] bg-[var(--orange)] px-3 py-1.5 text-[11px] font-bold text-white'
                    : 'rounded-[10px] border border-[var(--border-orange-soft)] bg-[var(--dash-panel-bg)] px-3 py-1.5 text-[11px] font-semibold text-[var(--text-mid)]'
                }
              >
                {b.label}
              </button>
            ))}
          </div>
        </div>

        {filteredRows.length === 0 ? (
          <EmptyState
            title="אין פרויקטים להצגה"
            description="כשירשמו הכנסות/הוצאות לפרויקט הם יופיעו כאן."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-[11px] font-bold text-[var(--text-mid)]">
                  <th className="px-2 py-2 text-right">פרויקט</th>
                  <SortableTh
                    label="לקוח"
                    columnKey="client"
                    sort={sort}
                    onSort={toggle}
                    defaultDir="asc"
                    className="!px-2 !py-2"
                  />
                  <th className="px-2 py-2 text-right">סטטוס</th>
                  <th className="px-2 py-2 text-right">תאריך תחילה</th>
                  <SortableTh
                    label="הכנסות"
                    columnKey="income"
                    sort={sort}
                    onSort={toggle}
                    className="!px-2 !py-2"
                  />
                  <SortableTh
                    label="הוצאות"
                    columnKey="expense"
                    sort={sort}
                    onSort={toggle}
                    className="!px-2 !py-2"
                  />
                  <SortableTh
                    label="רווח נקי"
                    columnKey="profit"
                    sort={sort}
                    onSort={toggle}
                    className="!px-2 !py-2"
                  />
                  <SortableTh
                    label="יתרה לגבייה"
                    columnKey="collection"
                    sort={sort}
                    onSort={toggle}
                    className="!px-2 !py-2"
                  />
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((r) => (
                  <tr
                    key={r.project.id}
                    onClick={() => setOpenProjectId(r.project.id)}
                    className="cursor-pointer border-b border-[var(--border)] transition hover:bg-[var(--surface-muted)]"
                  >
                    <td className="px-2 py-3">
                      <div className="flex items-center gap-2">
                        <span
                          className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: r.project.color }}
                        />
                        <span className="font-bold text-[var(--text-dark)]">
                          {r.project.name}
                        </span>
                      </div>
                    </td>
                    <td className="px-2 py-3 text-[var(--text-mid)]">
                      {r.project.clientId &&
                      r.clientName !== 'לקוח לא ידוע' &&
                      r.clientName !== 'פנימי' &&
                      r.clientName !== 'ללא לקוח' ? (
                        <FinanceClickable
                          title="כרטיס פיננסי ללקוח"
                          onClick={() =>
                            setClientCard({
                              clientId: r.project.clientId,
                              clientName: r.clientName,
                            })
                          }
                        >
                          {r.clientName}
                        </FinanceClickable>
                      ) : (
                        r.clientName
                      )}
                    </td>
                    <td className="px-2 py-3">
                      <Badge
                        label={STATUS_LABEL[r.project.status]}
                        color={STATUS_COLOR[r.project.status]}
                      />
                    </td>
                    <td className="px-2 py-3 tabular-nums text-[var(--text-mid)]">
                      {formatDateIL(
                        r.project.startDate ?? r.project.createdAt,
                      )}
                    </td>
                    <td className="px-2 py-3 tabular-nums font-bold text-[#10B981]">
                      {formatNis(r.incomeGross)}
                    </td>
                    <td className="px-2 py-3 tabular-nums font-bold text-[#EF4444]">
                      {formatNis(r.expenseGross)}
                    </td>
                    <td
                      className={`px-2 py-3 tabular-nums font-extrabold ${
                        r.netProfit >= 0 ? 'text-[#10B981]' : 'text-[#EF4444]'
                      }`}
                    >
                      {formatNis(r.netProfit)}
                    </td>
                    <td className="px-2 py-3 tabular-nums text-[#F59E0B]">
                      {formatNis(r.collectionBalance)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-[var(--border)] bg-[var(--surface-muted)]/60 text-[13px] font-extrabold text-[var(--text-dark)]">
                  <td className="px-2 py-3" colSpan={4}>
                    סה״כ ({filteredRows.length})
                  </td>
                  <td className="px-2 py-3 tabular-nums text-[#10B981]">
                    {formatNis(round2(totals.income))}
                  </td>
                  <td className="px-2 py-3 tabular-nums text-[#EF4444]">
                    {formatNis(round2(totals.expense))}
                  </td>
                  <td
                    className={`px-2 py-3 tabular-nums ${
                      totals.profit >= 0 ? 'text-[#10B981]' : 'text-[#EF4444]'
                    }`}
                  >
                    {formatNis(round2(totals.profit))}
                  </td>
                  <td className="px-2 py-3 tabular-nums text-[#F59E0B]">
                    {formatNis(round2(totals.collection))}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>

      <Modal
        isOpen={openRow != null}
        onClose={() => setOpenProjectId(null)}
        title={openRow ? `פיננסים — ${openRow.project.name}` : ''}
        size="xl"
      >
        {openRow ? (
          <ProjectFinanceSection
            project={openRow.project}
            client={openClient}
            onClientClick={setClientCard}
          />
        ) : null}
      </Modal>

      <Modal
        isOpen={hostingOpen}
        onClose={() => setHostingOpen(false)}
        title="אחסון אתרים — פיננסים"
        size="xl"
      >
        {hostingOpen ? (
          <HostingFinanceSection
            filterTypes={['monthly', 'yearly']}
            onClientClick={setClientCard}
          />
        ) : null}
      </Modal>

      <Modal
        isOpen={portalOpen}
        onClose={() => setPortalOpen(false)}
        title="Biz.bakrayot — פורטל — פיננסים"
        size="xl"
      >
        {portalOpen ? (
          <HostingFinanceSection
            filterTypes={['portal_monthly']}
            includeExpenses={false}
            noun="פורטל"
            onClientClick={setClientCard}
          />
        ) : null}
      </Modal>

      <ClientFinanceCardModal
        target={clientCard}
        onClose={() => setClientCard(null)}
        clientNameById={clientNameById}
      />
    </div>
  )
}
