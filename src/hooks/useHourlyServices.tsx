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
  collectionGroup,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore'
import { useAuth } from '../contexts/AuthContext'
import {
  docToHourlyService,
  docToHourlyServiceEntry,
} from '../lib/firestoreMappers'
import { db, ensureFirestoreReady } from '../lib/firebase'
import { stripUndefined } from '../lib/stripUndefined'
import { toastFsError, toastFsSuccess } from '../lib/fsToast'
import {
  buildHourlyServiceSharePayload,
  generateShareToken,
  publishHourlyServiceShare,
  unpublishHourlyServiceShare,
} from '../lib/hourlyServiceShare'
import type { HourlyService, HourlyServiceEntry } from '../types'

type HourlyServicesContextValue = {
  services: HourlyService[]
  entries: HourlyServiceEntry[]
  loading: boolean
  error: Error | null
  addService: (
    data: Omit<HourlyService, 'id' | 'createdAt' | 'updatedAt'>,
  ) => Promise<string | null>
  updateService: (
    id: string,
    data: Partial<Omit<HourlyService, 'id' | 'createdAt'>>,
  ) => Promise<void>
  deleteService: (id: string) => Promise<void>
  addEntry: (
    serviceId: string,
    data: Omit<HourlyServiceEntry, 'id' | 'serviceId' | 'createdAt'>,
  ) => Promise<string | null>
  updateEntry: (
    serviceId: string,
    entryId: string,
    data: Partial<Omit<HourlyServiceEntry, 'id' | 'serviceId' | 'createdAt'>>,
  ) => Promise<void>
  deleteEntry: (serviceId: string, entryId: string) => Promise<void>
  publishServiceShare: (
    serviceId: string,
    clientName: string,
  ) => Promise<string | null>
  refreshServiceShare: (
    serviceId: string,
    clientName?: string,
    entriesOverride?: HourlyServiceEntry[],
  ) => Promise<void>
  revokeServiceShare: (serviceId: string) => Promise<void>
}

const HourlyServicesContext = createContext<HourlyServicesContextValue | null>(
  null,
)

export function HourlyServicesProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [services, setServices] = useState<HourlyService[]>([])
  const [entries, setEntries] = useState<HourlyServiceEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    if (!user) {
      setServices([])
      setEntries([])
      setLoading(false)
      return
    }
    let cancelled = false
    let unsubServices = () => {}
    let unsubEntries = () => {}

    void ensureFirestoreReady().then(() => {
      if (cancelled) return
      unsubServices = onSnapshot(
        query(collection(db, 'hourlyServices')),
        (snap) => {
          if (cancelled) return
          setServices(snap.docs.map(docToHourlyService))
          setLoading(false)
        },
        (err) => {
          if (cancelled) return
          setError(err)
          setLoading(false)
        },
      )
      unsubEntries = onSnapshot(
        collectionGroup(db, 'entries'),
        (snap) => {
          if (cancelled) return
          setEntries(
            snap.docs.map((d) => {
              const serviceId = d.ref.parent.parent?.id ?? ''
              return docToHourlyServiceEntry(d, serviceId)
            }),
          )
        },
        (err) => {
          if (cancelled) return
          setError(err)
        },
      )
    })

    return () => {
      cancelled = true
      unsubServices()
      unsubEntries()
    }
  }, [user])

  const refreshServiceShare = useCallback(
    async (
      serviceId: string,
      clientName?: string,
      entriesOverride?: HourlyServiceEntry[],
    ): Promise<void> => {
      const service = services.find((s) => s.id === serviceId)
      if (!service?.shareEnabled || !service.shareToken) return
      let name = clientName?.trim() ?? ''
      if (!name) {
        const clientSnap = await getDoc(doc(db, 'clients', service.clientId))
        name = clientSnap.exists()
          ? String(clientSnap.data().name ?? '')
          : ''
      }
      const serviceEntries =
        entriesOverride ?? entries.filter((e) => e.serviceId === serviceId)
      const payload = buildHourlyServiceSharePayload(
        service,
        serviceEntries,
        name,
      )
      await publishHourlyServiceShare(service.shareToken, payload)
    },
    [services, entries],
  )

  const publishServiceShare = useCallback(
    async (serviceId: string, clientName: string): Promise<string | null> => {
      try {
        const service = services.find((s) => s.id === serviceId)
        if (!service) return null
        const token = service.shareToken ?? generateShareToken()
        const serviceEntries = entries.filter((e) => e.serviceId === serviceId)
        const payload = buildHourlyServiceSharePayload(
          service,
          serviceEntries,
          clientName,
        )
        await publishHourlyServiceShare(token, payload)
        await updateDoc(doc(db, 'hourlyServices', serviceId), {
          shareToken: token,
          shareEnabled: true,
          updatedAt: serverTimestamp(),
        })
        toastFsSuccess('קישור שיתוף ללקוח מוכן')
        return token
      } catch (e) {
        toastFsError('יצירת קישור שיתוף נכשלה', e)
        return null
      }
    },
    [services, entries],
  )

  const revokeServiceShare = useCallback(
    async (serviceId: string): Promise<void> => {
      try {
        const service = services.find((s) => s.id === serviceId)
        if (!service?.shareToken) return
        await unpublishHourlyServiceShare(service.shareToken)
        await updateDoc(doc(db, 'hourlyServices', serviceId), {
          shareEnabled: false,
          updatedAt: serverTimestamp(),
        })
        toastFsSuccess('שיתוף עם הלקוח בוטל')
      } catch (e) {
        toastFsError('ביטול שיתוף נכשל', e)
      }
    },
    [services],
  )

  const addService = useCallback(
    async (
      data: Omit<HourlyService, 'id' | 'createdAt' | 'updatedAt'>,
    ): Promise<string | null> => {
      try {
        const payload = stripUndefined({
          clientId: data.clientId.trim(),
          title: data.title.trim(),
          status: data.status,
          serviceKind: data.serviceKind,
          hourlyRate: data.hourlyRate,
          hoursPackageTotal: data.hoursPackageTotal,
          projectId: data.projectId?.trim() || undefined,
          notes: data.notes?.trim() || undefined,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        })
        const ref = await addDoc(collection(db, 'hourlyServices'), payload)
        toastFsSuccess('חשבון שירות שעות נוצר')
        return ref.id
      } catch (e) {
        toastFsError('יצירת חשבון שירות נכשלה', e)
        return null
      }
    },
    [],
  )

  const updateService = useCallback(
    async (
      id: string,
      data: Partial<Omit<HourlyService, 'id' | 'createdAt'>>,
    ): Promise<void> => {
      try {
        const payload = stripUndefined({
          ...data,
          title: data.title?.trim(),
          clientId: data.clientId?.trim(),
          projectId: data.projectId?.trim() || undefined,
          notes: data.notes?.trim() || undefined,
          updatedAt: serverTimestamp(),
        })
        await updateDoc(doc(db, 'hourlyServices', id), payload)
        toastFsSuccess('חשבון שירות עודכן')
      } catch (e) {
        toastFsError('עדכון חשבון שירות נכשל', e)
      }
    },
    [],
  )

  const deleteService = useCallback(
    async (id: string): Promise<void> => {
      try {
        const serviceEntries = entries.filter((e) => e.serviceId === id)
        await Promise.all(
          serviceEntries.map((e) =>
            deleteDoc(doc(db, 'hourlyServices', id, 'entries', e.id)),
          ),
        )
        await deleteDoc(doc(db, 'hourlyServices', id))
        toastFsSuccess('חשבון שירות נמחק')
      } catch (e) {
        toastFsError('מחיקת חשבון שירות נכשלה', e)
      }
    },
    [entries],
  )

  const addEntry = useCallback(
    async (
      serviceId: string,
      data: Omit<HourlyServiceEntry, 'id' | 'serviceId' | 'createdAt'>,
    ): Promise<string | null> => {
      try {
        const payload = stripUndefined({
          serviceId,
          clientId: data.clientId.trim(),
          performerId: data.performerId,
          performerName: data.performerName.trim(),
          workDate: data.workDate.slice(0, 10),
          startTime: data.startTime,
          endTime: data.endTime,
          hours: data.hours,
          taskTitle: data.taskTitle.trim(),
          description: data.description?.trim() || undefined,
          workCategory: data.workCategory,
          billable: data.billable,
          status: data.status,
          createdAt: serverTimestamp(),
        })
        const ref = await addDoc(
          collection(db, 'hourlyServices', serviceId, 'entries'),
          payload,
        )
        toastFsSuccess('רשומת שעות נוספה')
        const svc = services.find((s) => s.id === serviceId)
        if (svc?.shareEnabled && svc.shareToken) {
          void refreshServiceShare(serviceId, undefined, [
            ...entries.filter((e) => e.serviceId === serviceId),
            {
              id: ref.id,
              serviceId,
              ...data,
              createdAt: new Date().toISOString(),
            } as HourlyServiceEntry,
          ])
        }
        return ref.id
      } catch (e) {
        toastFsError('הוספת רשומת שעות נכשלה', e)
        return null
      }
    },
    [services, entries, refreshServiceShare],
  )

  const updateEntry = useCallback(
    async (
      serviceId: string,
      entryId: string,
      data: Partial<Omit<HourlyServiceEntry, 'id' | 'serviceId' | 'createdAt'>>,
    ): Promise<void> => {
      try {
        const payload = stripUndefined({
          ...data,
          taskTitle: data.taskTitle?.trim(),
          description: data.description?.trim() || undefined,
          workDate: data.workDate?.slice(0, 10),
        })
        await updateDoc(
          doc(db, 'hourlyServices', serviceId, 'entries', entryId),
          payload,
        )
        toastFsSuccess('רשומת שעות עודכנה')
        const svc = services.find((s) => s.id === serviceId)
        if (svc?.shareEnabled && svc.shareToken) {
          void refreshServiceShare(
            serviceId,
            undefined,
            entries
              .filter((e) => e.serviceId === serviceId)
              .map((e) =>
                e.id === entryId
                  ? {
                      ...e,
                      ...data,
                      taskTitle: data.taskTitle?.trim() ?? e.taskTitle,
                      workDate: data.workDate?.slice(0, 10) ?? e.workDate,
                    }
                  : e,
              ),
          )
        }
      } catch (e) {
        toastFsError('עדכון רשומת שעות נכשל', e)
      }
    },
    [services, entries, refreshServiceShare],
  )

  const deleteEntry = useCallback(
    async (serviceId: string, entryId: string): Promise<void> => {
      try {
        await deleteDoc(
          doc(db, 'hourlyServices', serviceId, 'entries', entryId),
        )
        toastFsSuccess('רשומת שעות נמחקה')
        const svc = services.find((s) => s.id === serviceId)
        if (svc?.shareEnabled && svc.shareToken) {
          void refreshServiceShare(
            serviceId,
            undefined,
            entries.filter(
              (e) => e.serviceId === serviceId && e.id !== entryId,
            ),
          )
        }
      } catch (e) {
        toastFsError('מחיקת רשומת שעות נכשלה', e)
      }
    },
    [services, entries, refreshServiceShare],
  )

  const value = useMemo(
    () => ({
      services,
      entries,
      loading,
      error,
      addService,
      updateService,
      deleteService,
      addEntry,
      updateEntry,
      deleteEntry,
      publishServiceShare,
      refreshServiceShare,
      revokeServiceShare,
    }),
    [
      services,
      entries,
      loading,
      error,
      addService,
      updateService,
      deleteService,
      addEntry,
      updateEntry,
      deleteEntry,
      publishServiceShare,
      refreshServiceShare,
      revokeServiceShare,
    ],
  )

  return (
    <HourlyServicesContext.Provider value={value}>
      {children}
    </HourlyServicesContext.Provider>
  )
}

export function useHourlyServices(): HourlyServicesContextValue {
  const ctx = useContext(HourlyServicesContext)
  if (!ctx) {
    throw new Error('useHourlyServices חייב להיות בתוך HourlyServicesProvider')
  }
  return ctx
}
