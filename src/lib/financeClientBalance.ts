import { doc, getDoc, updateDoc } from 'firebase/firestore'
import { db } from './firebase'

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export async function applyClientFinanceBalanceDelta(
  clientId: string,
  delta: number,
): Promise<void> {
  if (!clientId.trim() || !delta) return
  const ref = doc(db, 'clients', clientId.trim())
  const snap = await getDoc(ref)
  if (!snap.exists()) return
  const raw = snap.data()?.financeBalance
  const current = typeof raw === 'number' && !Number.isNaN(raw) ? raw : 0
  const next = round2(current + delta)
  await updateDoc(ref, { financeBalance: next })
}
