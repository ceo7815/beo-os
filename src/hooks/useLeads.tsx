import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore'
import { useAuth } from '../contexts/AuthContext'
import { docToLead } from '../lib/firestoreMappers'
import { db } from '../lib/firebase'
import { stripUndefined, stripUndefinedDeep } from '../lib/stripUndefined'
import { toastFsError, toastFsSuccess } from '../lib/fsToast'
import type { Lead, LeadStatus } from '../types'

type LeadsContextValue = {
  leads: Lead[]
  loading: boolean
  error: Error | null
  addLead: (data: Omit<Lead, 'id' | 'createdAt'>) => Promise<void>
  updateLead: (id: string, data: Partial<Lead>) => Promise<void>
  deleteLead: (id: string) => Promise<void>
  updateLeadStatus: (id: string, status: LeadStatus) => Promise<void>
}

const LeadsContext = createContext<LeadsContextValue | null>(null)

export function LeadsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    if (!user) {
      setLeads([])
      setLoading(false)
      setError(null)
      return
    }
    setLoading(true)
    const unsub = onSnapshot(
      collection(db, 'leads'),
      (snap) => {
        setLeads(snap.docs.map((d) => docToLead(d)))
        setLoading(false)
        setError(null)
      },
      (err) => {
        console.error('leads snapshot', err)
        toastFsError('שגיאה בטעינת לידים', err, 'leads snapshot')
        setError(err instanceof Error ? err : new Error(String(err)))
        setLoading(false)
      },
    )
    return () => unsub()
  }, [user])

  const addLead = useCallback(async (data: Omit<Lead, 'id' | 'createdAt'>) => {
    try {
      await addDoc(
        collection(db, 'leads'),
        stripUndefined({
          ...data,
          name: data.name.trim(),
          createdAt: serverTimestamp(),
        } as Record<string, unknown>),
      )
      toastFsSuccess('הליד נוסף בהצלחה')
    } catch (e) {
      toastFsError('שגיאה בהוספת ליד', e, 'addLead')
    }
  }, [])

  const updateLead = useCallback(
    async (id: string, data: Partial<Lead> & Record<string, unknown>) => {
      try {
        const payload = Object.fromEntries(
          Object.entries(data).filter(([, v]) => v !== undefined),
        )
        const cleaned = stripUndefinedDeep(payload)
        if (
          cleaned === null ||
          typeof cleaned !== 'object' ||
          Array.isArray(cleaned)
        ) {
          throw new Error('נתוני עדכון לא תקינים')
        }
        await updateDoc(doc(db, 'leads', id), cleaned as Record<string, unknown>)
        toastFsSuccess('הליד עודכן')
      } catch (e) {
        toastFsError('שגיאה בעדכון ליד', e, 'updateLead')
      }
    },
    [],
  )

  const deleteLead = useCallback(async (id: string) => {
    try {
      await deleteDoc(doc(db, 'leads', id))
      toastFsSuccess('הליד נמחק')
    } catch (e) {
      toastFsError('שגיאה במחיקת ליד', e, 'deleteLead')
    }
  }, [])

  const updateLeadStatus = useCallback(async (id: string, status: LeadStatus) => {
    try {
      await updateDoc(doc(db, 'leads', id), { status })
      toastFsSuccess('סטטוס הליד עודכן')
    } catch (e) {
      toastFsError('שגיאה בעדכון סטטוס ליד', e, 'updateLeadStatus')
    }
  }, [])

  const value = useMemo(
    () => ({
      leads,
      loading,
      error,
      addLead,
      updateLead,
      deleteLead,
      updateLeadStatus,
    }),
    [leads, loading, error, addLead, updateLead, deleteLead, updateLeadStatus],
  )

  return <LeadsContext.Provider value={value}>{children}</LeadsContext.Provider>
}

export function useLeads(): LeadsContextValue {
  const ctx = useContext(LeadsContext)
  if (!ctx) throw new Error('useLeads חייב להיות בתוך LeadsProvider')
  return ctx
}
