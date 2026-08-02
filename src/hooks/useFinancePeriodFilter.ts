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
 * מצב תקופה משותף לכל מסכי הפיננסים —
 * בחירת חודש נשמרת במעבר בין סקירה / הכנסות / הוצאות וכו'.
 */
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
      const now = currentYm()
      switch (preset) {
        case 'month':
          set({
            monthPreset: preset,
            periodMode: 'single',
            filterYmFrom: now,
            filterYmTo: now,
          })
          break
        case 'prev': {
          const prev = addMonths(now, -1)
          set({
            monthPreset: preset,
            periodMode: 'single',
            filterYmFrom: prev,
            filterYmTo: prev,
          })
          break
        }
        case 'q':
          set({
            monthPreset: preset,
            periodMode: 'range',
            filterYmFrom: addMonths(now, -2),
            filterYmTo: now,
          })
          break
        case 'half':
          set({
            monthPreset: preset,
            periodMode: 'range',
            filterYmFrom: addMonths(now, -5),
            filterYmTo: now,
          })
          break
        case 'year':
          set({
            monthPreset: preset,
            periodMode: 'range',
            filterYmFrom: addMonths(now, -11),
            filterYmTo: now,
          })
          break
        case 'all':
          set({
            monthPreset: preset,
            periodMode: 'range',
            filterYmFrom: ACTIVITY_START_YM,
            filterYmTo: now,
          })
          break
      }
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

export function useFinancePeriodFilter(_initialYm?: string) {
  const filterYmFrom = useFinancePeriodStore((s) => s.filterYmFrom)
  const filterYmTo = useFinancePeriodStore((s) => s.filterYmTo)
  const periodMode = useFinancePeriodStore((s) => s.periodMode)
  const monthPreset = useFinancePeriodStore((s) => s.monthPreset)
  const setFilterYmFrom = useFinancePeriodStore((s) => s.setFilterYmFrom)
  const setFilterYmTo = useFinancePeriodStore((s) => s.setFilterYmTo)
  const setPeriodMode = useFinancePeriodStore((s) => s.setPeriodMode)
  const setMonthPreset = useFinancePeriodStore((s) => s.setMonthPreset)
  const applyMonthPreset = useFinancePeriodStore((s) => s.applyMonthPreset)
  const applySingleMonth = useFinancePeriodStore((s) => s.applySingleMonth)

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
  }
}
