import { useCallback, useEffect, useMemo, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { useAuth } from '../contexts/AuthContext'
import { isAdminRole } from '../components/RequireAdmin'
import { db, canUseLegacyFirestore } from '../lib/firebase'
import {
  parseClockifyConfig,
  parseClockifyPublicSettings,
  saveClockifyConfigToFirestore,
} from '../lib/clockifyService'
import { toastFsError, toastFsSuccess } from '../lib/fsToast'
import type { ClockifyIntegrationConfig, ClockifyPublicSettings } from '../types'
import { useUsers } from './useUsers'

export function useClockify() {
  const { user } = useAuth()
  const { users } = useUsers()
  const role = users.find((m) => m.id === user?.uid)?.role ?? ''
  const isAdmin = isAdminRole(role)

  const [config, setConfig] = useState<ClockifyIntegrationConfig | null>(null)
  const [configLoading, setConfigLoading] = useState(true)

  const [publicSettings, setPublicSettings] = useState<ClockifyPublicSettings | null>(null)
  const [settingsLoading, setSettingsLoading] = useState(true)

  useEffect(() => {
    if (!user || !isAdmin || !canUseLegacyFirestore()) {
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

  useEffect(() => {
    if (!user || !canUseLegacyFirestore()) {
      setPublicSettings(null)
      setSettingsLoading(false)
      return
    }
    setSettingsLoading(true)
    const ref = doc(db, 'attendanceConfig', 'settings')
    const unsub = onSnapshot(
      ref,
      (snap) => {
        setPublicSettings(
          snap.exists() ? parseClockifyPublicSettings(snap.data() as Record<string, unknown>) : {},
        )
        setSettingsLoading(false)
      },
      (err) => {
        console.error('clockify settings snapshot', err)
        toastFsError('שגיאה בטעינת הגדרות נוכחות', err, 'clockifySettings')
        setSettingsLoading(false)
      },
    )
    return () => unsub()
  }, [user])

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

  const workspaceId = useMemo(() => {
    const fromSettings = publicSettings?.workspaceId?.trim() ?? ''
    if (fromSettings) return fromSettings
    if (isAdmin) return config?.workspaceId?.trim() ?? ''
    return ''
  }, [publicSettings?.workspaceId, isAdmin, config?.workspaceId])

  /** אדמין: נדרש גם מפתח בשרת; עובד: מספיק workspace ב-settings */
  const integrationReady = Boolean(
    workspaceId && (isAdmin ? Boolean(config?.apiKey?.trim()) : true),
  )

  return {
    isAdmin,
    userEmail: user?.email?.trim() ?? '',
    config,
    configLoading,
    settingsLoading,
    workspaceId,
    saveClockifyConfig,
    integrationReady,
  }
}
