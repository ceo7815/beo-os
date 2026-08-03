import type { SortDir, SortState } from '../../lib/financeTableSort'

type Props<K extends string> = {
  label: string
  columnKey: K
  sort: SortState<K>
  onSort: (key: K, defaultDir?: SortDir) => void
  className?: string
  /** כיוון ברירת מחדל בלחיצה ראשונה על העמודה */
  defaultDir?: SortDir
}

/** כותרת טבלה לחיצה — מיון מקומי לתצוגה בלבד */
export function SortableTh<K extends string>({
  label,
  columnKey,
  sort,
  onSort,
  className = '',
  defaultDir = 'desc',
}: Props<K>) {
  const active = sort.key === columnKey
  const arrow = !active ? '↕' : sort.dir === 'asc' ? '↑' : '↓'
  return (
    <th className={`px-2.5 py-2.5 text-right ${className}`}>
      <button
        type="button"
        onClick={() => onSort(columnKey, defaultDir)}
        className={`inline-flex items-center gap-1 rounded-md px-0.5 transition hover:text-[var(--orange)] ${
          active
            ? 'font-extrabold text-[var(--text-dark)]'
            : 'font-bold text-[var(--text-mid)]'
        }`}
        title={`מיון לפי ${label}`}
      >
        <span>{label}</span>
        <span
          className={`text-[10px] tabular-nums ${
            active ? 'text-[var(--orange)]' : 'opacity-40'
          }`}
          aria-hidden
        >
          {arrow}
        </span>
      </button>
    </th>
  )
}
