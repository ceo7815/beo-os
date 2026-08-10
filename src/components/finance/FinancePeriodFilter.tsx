import { HubDropdownSelect } from '../shared/HubDropdownSelect'
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
  /** תזרim = טווחים קדימה; שאר המסכים = אחורה */
  variant?: 'historical' | 'forecast'
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
  variant = 'historical',
}: Props) {
  const chipActive =
    'inline-flex h-8 items-center whitespace-nowrap rounded-lg border border-[var(--orange)] bg-[var(--orange)] px-2.5 text-[11px] font-bold text-white'
  const chipIdle =
    'inline-flex h-8 items-center whitespace-nowrap rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 text-[11px] font-semibold text-[var(--text-mid)] transition hover:bg-[var(--surface-muted)]'

  return (
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--dash-panel-bg)] p-4 shadow-[0_1px_8px_rgba(0,0,0,0.04)] sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <span className="ml-1 text-[12px] font-extrabold text-[var(--text-dark)]">
            תקופה
          </span>
          <button
            type="button"
            onClick={() => {
              setPeriodMode('single')
              if (filterYmFrom !== filterYmTo) {
                setFilterYmTo(filterYmFrom)
              }
              setMonthPreset('pick')
            }}
            className={periodMode === 'single' ? chipActive : chipIdle}
          >
            חודש בודד
          </button>
          <button
            type="button"
            onClick={() => setPeriodMode('range')}
            className={periodMode === 'range' ? chipActive : chipIdle}
          >
            טווח
          </button>
          <span
            className="mx-0.5 hidden h-5 w-px bg-[var(--border)] sm:block"
            aria-hidden
          />
          {(
            [
              ['month', 'חודש נוכחי'],
              ['prev', variant === 'forecast' ? 'חודש הבא' : 'חודש קודם'],
              ['q', variant === 'forecast' ? '3 חודשים קדימה' : '3 חודשים'],
              ['half', variant === 'forecast' ? '6 חודשים קדימה' : '6 חודשים'],
              ['year', variant === 'forecast' ? '12 חודשים קדימה' : '12 חודשים'],
              ['all', variant === 'forecast' ? '24 חודשים קדימה' : 'הכל'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              title={
                id === 'all'
                  ? variant === 'forecast'
                    ? '24 חודשים קדימה מהיום'
                    : 'מתחילת הפעילות'
                  : undefined
              }
              onClick={() => applyMonthPreset(id)}
              className={monthPreset === id ? chipActive : chipIdle}
            >
              {label}
            </button>
          ))}
        </div>
        <span className="text-[11px] font-semibold text-[var(--text-mid)]">
          {filterRangeLabel}
        </span>
      </div>

      <div
        className={`mt-4 grid gap-3 ${
          projectFilter || clientFilter
            ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
            : 'grid-cols-1 sm:grid-cols-2'
        }`}
      >
        <div className="min-w-0">
          {periodMode === 'single' ? (
            <>
              <FinanceFieldLabel>חודש</FinanceFieldLabel>
              <HubDropdownSelect
                value={filterYmFrom}
                onChange={applySingleMonth}
                options={monthOptions}
              />
            </>
          ) : (
            <>
              <FinanceFieldLabel>טווח חודשים</FinanceFieldLabel>
              <div className="grid grid-cols-2 gap-2">
                <div className="min-w-0">
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
                <div className="min-w-0">
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
            </>
          )}
        </div>

        {projectFilter ? (
          <div className="min-w-0">
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
          <div className="min-w-0">
            <FinanceFieldLabel>לקוח</FinanceFieldLabel>
            <HubDropdownSelect
              value={clientFilter.value}
              onChange={clientFilter.onChange}
              options={clientFilter.options}
              emptyOption={{ label: 'כל הלקוחות' }}
            />
          </div>
        ) : null}
      </div>
    </section>
  )
}
