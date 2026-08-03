import { useState } from 'react'

export type SortDir = 'asc' | 'desc'

export type SortState<K extends string> = {
  key: K
  dir: SortDir
}

/** מחליף מפתח מיון / הופך כיוון בלחיצה חוזרת על אותה עמודה */
export function nextSortState<K extends string>(
  prev: SortState<K>,
  key: K,
  defaultDir: SortDir = 'desc',
): SortState<K> {
  if (prev.key === key) {
    return { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
  }
  return { key, dir: defaultDir }
}

export function compareSortValues(
  a: string | number,
  b: string | number,
  dir: SortDir,
): number {
  const mul = dir === 'asc' ? 1 : -1
  if (typeof a === 'number' && typeof b === 'number') {
    return (a - b) * mul
  }
  return String(a).localeCompare(String(b), 'he') * mul
}

export function useTableSort<K extends string>(
  initialKey: K,
  initialDir: SortDir = 'desc',
) {
  const [sort, setSort] = useState<SortState<K>>({
    key: initialKey,
    dir: initialDir,
  })

  const toggle = (key: K, defaultDir: SortDir = 'desc') => {
    setSort((prev) => nextSortState(prev, key, defaultDir))
  }

  return { sort, toggle }
}

/** מיון לתצוגה בלבד — לא משנה את מקור הנתונים */
export function sortByKey<T, K extends string>(
  rows: readonly T[],
  sort: SortState<K>,
  getValue: (row: T, key: K) => string | number,
): T[] {
  const copy = [...rows]
  copy.sort((a, b) =>
    compareSortValues(getValue(a, sort.key), getValue(b, sort.key), sort.dir),
  )
  return copy
}
