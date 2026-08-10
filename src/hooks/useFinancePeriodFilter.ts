import { useMemo } from 'react'
import { create } from 'zustand'
import {
  addMonths,
  currentYm,
  formatYmRangeLabel,
  monthOptions,
} from '../lib/financeCalc'

export type MonthPreset =
  | 'month'
  | 'prev'
  | 'q'
  | 'half'
  | 'year'
  | 'all'
  | 'pick'
  | 'custom'

/**
 * החודש הראשון שממנו קיימת פעילות בספרים.
 * משמש כגבול התחתון של "מתחילת הפעילות", כדי שהטווח לא ייפרס אחורה
 * על חודשים ריקים שרק מטשטשים את התמונה.
 */
export const ACTIVITY_START_YM = '2026-03'

type FinancePeriodState = {
  filterYmFrom: string
  filterYmTo: string
  periodMode: 'single' | 'range'
  monthPreset: MonthPreset
  setFilterYmFrom: (v: string) => void
  setFilterYmTo: (v: string) => void
  setPeriodMode: (m: 'single' | 'range') => void
  setMonthPreset: (p: MonthPreset) => void
  applyMonthPreset: (
    preset: 'month' | 'prev' | 'q' | 'half' | 'year' | 'all',
  ) => void
  applySingleMonth: (ym: string) => void
}

/**
 * מצב תקופה משותף לכל מסכי הפיננסים (היסטורי) —
 * בחירת חודש נשמרת במעבר בין סקירה / הכנסות / הוצאות וכו'.
 */

function buildHistoricalPreset(
  preset: 'month' | 'prev' | 'q' | 'half' | 'year' | 'all',
  now: string,
): Partial<FinancePeriodState> {
  switch (preset) {
    case 'month':
      return {
        monthPreset: preset,
        periodMode: 'single',
        filterYmFrom: now,
        filterYmTo: now,
      }
    case 'prev':
      return {
        monthPreset: preset,
        periodMode: 'single',
        filterYmFrom: addMonths(now, -1),
        filterYmTo: addMonths(now, -1),
      }
    case 'q':
      return {
        monthPreset: preset,
        periodMode: 'range',
        filterYmFrom: addMonths(now, -2),
        filterYmTo: now,
      }
    case 'half':
      return {
        monthPreset: preset,
        periodMode: 'range',
        filterYmFrom: addMonths(now, -5),
        filterYmTo: now,
      }
    case 'year':
      return {
        monthPreset: preset,
        periodMode: 'range',
        filterYmFrom: addMonths(now, -11),
        filterYmTo: now,
      }
    case 'all':
      return {
        monthPreset: preset,
        periodMode: 'range',
        filterYmFrom: ACTIVITY_START_YM,
        filterYmTo: now,
      }
  }
}

/** תזרim — טווחים קדימה (תחזית), לא אחורה */
function buildForecastPreset(
  preset: 'month' | 'prev' | 'q' | 'half' | 'year' | 'all',
  now: string,
): Partial<FinancePeriodState> {
  switch (preset) {
    case 'month':
      return {
        monthPreset: preset,
        periodMode: 'single',
        filterYmFrom: now,
        filterYmTo: now,
      }
    case 'prev':
      return {
        monthPreset: preset,
        periodMode: 'single',
        filterYmFrom: addMonths(now, 1),
        filterYmTo: addMonths(now, 1),
      }
    case 'q':
      return {
        monthPreset: preset,
        periodMode: 'range',
        filterYmFrom: now,
        filterYmTo: addMonths(now, 2),
      }
    case 'half':
      return {
        monthPreset: preset,
        periodMode: 'range',
        filterYmFrom: now,
        filterYmTo: addMonths(now, 5),
      }
    case 'year':
      return {
        monthPreset: preset,
        periodMode: 'range',
        filterYmFrom: now,
        filterYmTo: addMonths(now, 11),
      }
    case 'all':
      return {
        monthPreset: preset,
        periodMode: 'range',
        filterYmFrom: now,
        filterYmTo: addMonths(now, 23),
      }
  }
}

const useFinancePeriodStore = create<FinancePeriodState>((set) => {
  const initial = currentYm()
  return {
    filterYmFrom: initial,
    filterYmTo: initial,
    periodMode: 'single',
    monthPreset: 'month',
    setFilterYmFrom: (v) => set({ filterYmFrom: v }),
    setFilterYmTo: (v) => set({ filterYmTo: v }),
    setPeriodMode: (m) => set({ periodMode: m }),
    setMonthPreset: (p) => set({ monthPreset: p }),
    applyMonthPreset: (preset) => {
      set(buildHistoricalPreset(preset, currentYm()))
    },
    applySingleMonth: (ym) =>
      set({
        periodMode: 'single',
        monthPreset: 'pick',
        filterYmFrom: ym,
        filterYmTo: ym,
      }),
  }
})

const useCashflowPeriodStore = create<FinancePeriodState>((set) => {
  const initial = currentYm()
  return {
    filterYmFrom: initial,
    filterYmTo: addMonths(initial, 2),
    periodMode: 'range',
    monthPreset: 'q',
    setFilterYmFrom: (v) => set({ filterYmFrom: v }),
    setFilterYmTo: (v) => set({ filterYmTo: v }),
    setPeriodMode: (m) => set({ periodMode: m }),
    setMonthPreset: (p) => set({ monthPreset: p }),
    applyMonthPreset: (preset) => {
      set(buildForecastPreset(preset, currentYm()))
    },
    applySingleMonth: (ym) =>
      set({
        periodMode: 'single',
        monthPreset: 'pick',
        filterYmFrom: ym,
        filterYmTo: ym,
      }),
  }
})

export type FinancePeriodDirection = 'historical' | 'forecast'

function usePeriodStoreSelectors(direction: FinancePeriodDirection) {
  const historicalFrom = useFinancePeriodStore((s) => s.filterYmFrom)
  const historicalTo = useFinancePeriodStore((s) => s.filterYmTo)
  const historicalMode = useFinancePeriodStore((s) => s.periodMode)
  const historicalPreset = useFinancePeriodStore((s) => s.monthPreset)
  const setHistoricalFrom = useFinancePeriodStore((s) => s.setFilterYmFrom)
  const setHistoricalTo = useFinancePeriodStore((s) => s.setFilterYmTo)
  const setHistoricalMode = useFinancePeriodStore((s) => s.setPeriodMode)
  const setHistoricalPreset = useFinancePeriodStore((s) => s.setMonthPreset)
  const applyHistoricalPreset = useFinancePeriodStore((s) => s.applyMonthPreset)
  const applyHistoricalSingle = useFinancePeriodStore((s) => s.applySingleMonth)

  const forecastFrom = useCashflowPeriodStore((s) => s.filterYmFrom)
  const forecastTo = useCashflowPeriodStore((s) => s.filterYmTo)
  const forecastMode = useCashflowPeriodStore((s) => s.periodMode)
  const forecastPreset = useCashflowPeriodStore((s) => s.monthPreset)
  const setForecastFrom = useCashflowPeriodStore((s) => s.setFilterYmFrom)
  const setForecastTo = useCashflowPeriodStore((s) => s.setFilterYmTo)
  const setForecastMode = useCashflowPeriodStore((s) => s.setPeriodMode)
  const setForecastPreset = useCashflowPeriodStore((s) => s.setMonthPreset)
  const applyForecastPreset = useCashflowPeriodStore((s) => s.applyMonthPreset)
  const applyForecastSingle = useCashflowPeriodStore((s) => s.applySingleMonth)

  if (direction === 'forecast') {
    return {
      filterYmFrom: forecastFrom,
      filterYmTo: forecastTo,
      periodMode: forecastMode,
      monthPreset: forecastPreset,
      setFilterYmFrom: setForecastFrom,
      setFilterYmTo: setForecastTo,
      setPeriodMode: setForecastMode,
      setMonthPreset: setForecastPreset,
      applyMonthPreset: applyForecastPreset,
      applySingleMonth: applyForecastSingle,
    }
  }

  return {
    filterYmFrom: historicalFrom,
    filterYmTo: historicalTo,
    periodMode: historicalMode,
    monthPreset: historicalPreset,
    setFilterYmFrom: setHistoricalFrom,
    setFilterYmTo: setHistoricalTo,
    setPeriodMode: setHistoricalMode,
    setMonthPreset: setHistoricalPreset,
    applyMonthPreset: applyHistoricalPreset,
    applySingleMonth: applyHistoricalSingle,
  }
}

export function useFinancePeriodFilter(options?: {
  direction?: FinancePeriodDirection
}) {
  const direction = options?.direction ?? 'historical'
  const {
    filterYmFrom,
    filterYmTo,
    periodMode,
    monthPreset,
    setFilterYmFrom,
    setFilterYmTo,
    setPeriodMode,
    setMonthPreset,
    applyMonthPreset,
    applySingleMonth,
  } = usePeriodStoreSelectors(direction)

  const filterRangeLabel = useMemo(
    () => formatYmRangeLabel(filterYmFrom, filterYmTo),
    [filterYmFrom, filterYmTo],
  )

  return {
    filterYmFrom,
    filterYmTo,
    setFilterYmFrom,
    setFilterYmTo,
    periodMode,
    setPeriodMode,
    monthPreset,
    setMonthPreset,
    filterRangeLabel,
    applyMonthPreset,
    applySingleMonth,
    monthOptions: monthOptions(36),
    direction,
  }
}

/** תזרim — סינון קדימה (ברירת מחדל: 3 חודשים קדימה) */
export function useCashflowPeriodFilter() {
  return useFinancePeriodFilter({ direction: 'forecast' })
}
