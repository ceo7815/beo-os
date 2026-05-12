import { useCallback, useEffect, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { useAuth } from '../contexts/AuthContext'
import { isAdminRole } from '../components/RequireAdmin'
import { db } from '../lib/firebase'
import { parseClockifyConfig, saveClockifyConfigToFirestore } from '../lib/clockifyService'
import { toastFsError, toastFsSuccess } from '../lib/fsToast'
import type { ClockifyIntegrationConfig } from '../types'
import { useUsers } from './useUsers'

export function useClockify() {
  const { user } = useAuth()
  const { users } = useUsers()
  const role = users.find((m) => m.id === user?.uid)?.role ?? ''
  const isAdmin = isAdminRole(role)

  const [config, setConfig] = useState<ClockifyIntegrationConfig | null>(null)
  const [configLoading, setConfigLoading] = useState(true)

  useEffect(() => {
    if (!user || !isAdmin) {
      setConfig(null)
      setConfigLoading(false)
      return
    }
    setConfigLoading(true)
    const ref = doc(db, 'attendanceConfig', 'clockify')
    const unsub = onSnapshot(
      ref,
      (snap) => {
        setConfig(snap.exists() ? parseClockifyConfig(snap.data() as Record<string, unknown>) : {})
        setConfigLoading(false)
      },
      (err) => {
        console.error('clockify config snapshot', err)
        toastFsError('שגיאה בטעינת הגדרות Clockify', err, 'clockifyConfig')
        setConfigLoading(false)
      },
    )
    return () => unsub()
  }, [user, isAdmin])

  const saveClockifyConfig = useCallback(
    async (payload: { apiKey: string; workspaceId: string; apiBaseUrl?: string }) => {
      if (!isAdmin || !user) return
      try {
        await saveClockifyConfigToFirestore(payload)
        toastFsSuccess('הגדרות Clockify נשמרו')
      } catch (e) {
        toastFsError('שמירת הגדרות נכשלה', e, 'clockify save')
      }
    },
    [isAdmin, user],
  )

  const integrationReady = Boolean(config?.apiKey?.trim() && config?.workspaceId?.trim())

  return {
    isAdmin,
    userEmail: user?.email?.trim() ?? '',
    config,
    configLoading,
    saveClockifyConfig,
    integrationReady,
  }
}
