import { useCallback, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { isAdminRole } from '../components/RequireAdmin'
import { ClockifyAdminDashboard } from '../components/clockify/ClockifyAdminDashboard'
import { ClockifyConfigCard } from '../components/clockify/ClockifyConfigCard'
import { ClockifyEmployeeDashboard } from '../components/clockify/ClockifyEmployeeDashboard'
import { useClockify } from '../hooks/useClockify'
import { useUsers } from '../hooks/useUsers'
import { todayYmd } from '../lib/dates'

function ymdFirstOfMonth(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

export function Attendance() {
  const { user } = useAuth()
  const { users } = useUsers()
  const role = users.find((m) => m.id === user?.uid)?.role ?? ''
  const admin = isAdminRole(role)
  const clockify = useClockify()

  const [filterStart, setFilterStart] = useState(() => ymdFirstOfMonth())
  const [filterEnd, setFilterEnd] = useState(() => todayYmd())

  const onFilterChange = useCallback((start: string, end: string) => {
    setFilterStart(start)
    setFilterEnd(end)
  }, [])

  return (
    <div className="mx-auto max-w-[1200px] space-y-6 px-4 py-5 md:space-y-8 md:px-8 md:py-8">
      <header className="space-y-2">
        <h1 className="text-[22px] font-extrabold leading-tight text-[var(--text-dark)] md:text-[26px]">
          נוכחות
        </h1>
        <p className="max-w-3xl text-[12px] leading-relaxed text-[var(--text-mid)] md:text-[13px]">
          אינטגרציה עם <strong className="text-[var(--text-dark)]">Clockify</strong> — תצוגת נתונים בלבד. אין כתיבה
          ל-Firestore עבור שעות עבודה; מפתח API ו-Workspace נשמרים אצל האדמין בלבד וישמשו בשלב הבא לשליפה מאובטחת
          (מומלץ Cloud Function בגלל CORS).
        </p>
      </header>

      {admin ? (
        <>
          <ClockifyConfigCard
            config={clockify.config}
            loading={clockify.configLoading}
            onSave={clockify.saveClockifyConfig}
          />
          <ClockifyAdminDashboard
            users={users}
            integrationReady={clockify.integrationReady}
            filterStart={filterStart}
            filterEnd={filterEnd}
            onFilterChange={onFilterChange}
          />
        </>
      ) : (
        <ClockifyEmployeeDashboard
          userEmail={clockify.userEmail}
          integrationReady={clockify.integrationReady}
        />
      )}
    </div>
  )
}
