import type { CollectionTracking } from '../types'

export type CollectionTrackingDisplayStatus = 'paid' | 'pending' | 'overdue'

export function getCollectionTrackingStatus(
  row: Pick<CollectionTracking, 'dueDate' | 'paidDate'>,
  todayYmd: string,
): CollectionTrackingDisplayStatus {
  const paid = row.paidDate?.slice(0, 10)
  if (paid && /^\d{4}-\d{2}-\d{2}$/.test(paid)) {
    return 'paid'
  }
  const due = row.dueDate.slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(due)) return 'pending'
  if (due < todayYmd) return 'overdue'
  return 'pending'
}
