import { useMemo, useState } from 'react'
import {
  addMonths,
  currentYm,
  formatYmRangeLabel,
  monthOptions,
} from '../lib/financeCalc'

export type MonthPreset = 'month' | 'prev' | 'q' | 'half' | 'year' | 'pick' | 'custom'

export function useFinancePeriodFilter(initialYm = currentYm()) {
  const [filterYmFrom, setFilterYmFrom] = useState(initialYm)
  const [filterYmTo, setFilterYmTo] = useState(initialYm)
  const [periodMode, setPeriodMode] = useState<'single' | 'range'>('single')
  const [monthPreset, setMonthPreset] = useState<MonthPreset>('month')

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
