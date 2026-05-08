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
import { docToCampaign } from '../lib/firestoreMappers'
import { db, ensureFirestoreReady } from '../lib/firebase'
import { stripUndefined } from '../lib/stripUndefined'
import { toastFsError, toastFsSuccess } from '../lib/fsToast'
import type { Campaign, CampaignStatus } from '../types'

type CampaignsContextValue = {
  campaigns: Campaign[]
  loading: boolean
  error: Error | null
  addCampaign: (data: Omit<Campaign, 'id' | 'createdAt'>) => Promise<void>
  updateCampaign: (id: string, data: Partial<Campaign>) => Promise<void>
  updateCampaignStatus: (id: string, status: CampaignStatus) => Promise<void>
  deleteCampaign: (id: string) => Promise<void>
}

const CampaignsContext = createContext<CampaignsContextValue | null>(null)

export function CampaignsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    if (!user) {
      setCampaigns([])
      setLoading(false)
      setError(null)
      return
    }
    setLoading(true)
    const unsub = onSnapshot(
      collection(db, 'campaigns'),
      (snap) => {
        setCampaigns(snap.docs.map((d) => docToCampaign(d)))
        setLoading(false)
        setError(null)
      },
      (err) => {
        console.error('campaigns snapshot', err)
        toastFsError('שגיאה בטעינת קמפיינים', err, 'campaigns snapshot')
        setError(err instanceof Error ? err : new Error(String(err)))
        setLoading(false)
      },
    )
    return () => unsub()
  }, [user])

  const addCampaign = useCallback(async (data: Omit<Campaign, 'id' | 'createdAt'>) => {
    try {
      await addDoc(
        collection(db, 'campaigns'),
        stripUndefined({
          ...data,
          name: data.name.trim(),
          createdAt: serverTimestamp(),
        } as Record<string, unknown>),
      )
      toastFsSuccess('הקמפיין נוסף')
    } catch (e) {
      toastFsError('שגיאה בהוספת קמפיין', e, 'addCampaign')
    }
  }, [])

  const updateCampaign = useCallback(async (id: string, data: Partial<Campaign>) => {
    try {
      await ensureFirestoreReady()
      /** שומר גם ערכי deleteField לניקוי שדות אופציונליים ב-Firestore */
      const raw = data as Record<string, unknown>
      await updateDoc(
        doc(db, 'campaigns', id),
        Object.fromEntries(Object.entries(raw).filter(([, v]) => v !== undefined)),
      )
      toastFsSuccess('הקמפיין עודכן')
    } catch (e) {
      toastFsError('שגיאה בעדכון קמפיין', e, 'updateCampaign')
    }
  }, [])

  const updateCampaignStatus = useCallback(async (id: string, status: CampaignStatus) => {
    try {
      await updateDoc(doc(db, 'campaigns', id), { status })
      toastFsSuccess('סטטוס קמפיין עודכן')
    } catch (e) {
      toastFsError('שגיאה בעדכון סטטוס קמפיין', e, 'updateCampaignStatus')
    }
  }, [])

  const deleteCampaign = useCallback(async (id: string) => {
    try {
      await deleteDoc(doc(db, 'campaigns', id))
      toastFsSuccess('הקמפיין נמחק')
    } catch (e) {
      toastFsError('שגיאה במחיקת קמפיין', e, 'deleteCampaign')
    }
  }, [])

  const value = useMemo(
    () => ({
      campaigns,
      loading,
      error,
      addCampaign,
      updateCampaign,
      updateCampaignStatus,
      deleteCampaign,
    }),
    [campaigns, loading, error, addCampaign, updateCampaign, updateCampaignStatus, deleteCampaign],
  )

  return (
    <CampaignsContext.Provider value={value}>{children}</CampaignsContext.Provider>
  )
}

export function useCampaigns(): CampaignsContextValue {
  const ctx = useContext(CampaignsContext)
  if (!ctx) throw new Error('useCampaigns חייב להיות בתוך CampaignsProvider')
  return ctx
}
