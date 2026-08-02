import { HubDropdownSelect } from '../shared/HubDropdownSelect'
import { hubSectionClass } from '../../lib/hubSectionBorder'
import type { MonthPreset } from '../../hooks/useFinancePeriodFilter'
import { FinanceFieldLabel, financeHubInputClass } from './FinanceKpi'

type Props = {
  periodMode: 'single' | 'range'
  setPeriodMode: (m: 'single' | 'range') => void
  monthPreset: MonthPreset
  setMonthPreset: (p: MonthPreset) => void
  filterYmFrom: string
  filterYmTo: string
  setFilterYmFrom: (v: string) => void
  setFilterYmTo: (v: string) => void
  filterRangeLabel: string
  applyMonthPreset: (
    preset: 'month' | 'prev' | 'q' | 'half' | 'year' | 'all',
  ) => void
  applySingleMonth: (ym: string) => void
  monthOptions: { value: string; label: string }[]
  projectFilter?: {
    value: string
    onChange: (v: string) => void
    options: { value: string; label: string }[]
  }
  clientFilter?: {
    value: string
    onChange: (v: string) => void
    options: { value: string; label: string }[]
  }
}

export function FinancePeriodFilter({
  periodMode,
  setPeriodMode,
  monthPreset,
  setMonthPreset,
  filterYmFrom,
  filterYmTo,
  setFilterYmFrom,
  setFilterYmTo,
  filterRangeLabel,
  applyMonthPreset,
  applySingleMonth,
  monthOptions,
  projectFilter,
  clientFilter,
}: Props) {
  return (
    <section
      className={`flex flex-col gap-3 rounded-2xl ${hubSectionClass(4)} p-4 shadow-[0_2px_12px_rgba(0,0,0,0.06)] sm:flex-row sm:flex-wrap sm:items-end`}
    >
      <div className="min-w-0 flex-[2]">
        <FinanceFieldLabel>תקופה</FinanceFieldLabel>
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
              ['all', 'מתחילת הפעילות'],
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
              options={monthOptions}
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
                className={financeHubInputClass()}
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
                className={financeHubInputClass()}
              />
            </div>
          </div>
        )}
        <p className="mt-1.5 text-[11px] font-semibold text-[var(--text-mid)]">
          {filterRangeLabel}
        </p>
      </div>
      {projectFilter ? (
        <div className="min-w-[180px] flex-1">
          <FinanceFieldLabel>פרויקט</FinanceFieldLabel>
          <HubDropdownSelect
            value={projectFilter.value}
            onChange={projectFilter.onChange}
            options={projectFilter.options}
            emptyOption={{ label: 'כל הפרויקטים' }}
          />
        </div>
      ) : null}
      {clientFilter ? (
        <div className="min-w-[180px] flex-1">
          <FinanceFieldLabel>לקוח</FinanceFieldLabel>
          <HubDropdownSelect
            value={clientFilter.value}
            onChange={clientFilter.onChange}
            options={clientFilter.options}
            emptyOption={{ label: 'כל הלקוחות' }}
          />
        </div>
      ) : null}
    </section>
  )
}
