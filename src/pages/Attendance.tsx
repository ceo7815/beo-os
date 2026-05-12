import { useCallback, useMemo, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { isAdminRole } from '../components/RequireAdmin'
import { ClockifyAdminDashboard } from '../components/clockify/ClockifyAdminDashboard'
import { ClockifyConfigCard } from '../components/clockify/ClockifyConfigCard'
import { ClockifyEmployeeDashboard } from '../components/clockify/ClockifyEmployeeDashboard'
import { useClockify } from '../hooks/useClockify'
import {
  mergeAdminAttendance,
  useClockifyAdminAttendance,
  useClockifyEmployeeAttendance,
} from '../hooks/useClockifyAttendance'
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

  const adminAtt = useClockifyAdminAttendance({
    workspaceId: clockify.workspaceId,
    enabled: admin && clockify.integrationReady,
    filterStart,
    filterEnd,
  })

  const mergedRows = useMemo(() => mergeAdminAttendance(users, adminAtt.report), [users, adminAtt.report])

  const empAtt = useClockifyEmployeeAttendance({
    workspaceId: clockify.workspaceId,
    userEmail: clockify.userEmail,
    enabled: !admin && clockify.integrationReady,
  })

  return (
    <div className="mx-auto max-w-[1200px] space-y-6 px-4 py-5 md:space-y-8 md:px-8 md:py-8">
      <header className="space-y-2">
        <h1 className="text-[22px] font-extrabold leading-tight text-[var(--text-dark)] md:text-[26px]">
          נוכחות
        </h1>
        <p className="max-w-3xl text-[12px] leading-relaxed text-[var(--text-mid)] md:text-[13px]">
          אינטגרציה עם <strong className="text-[var(--text-dark)]">Clockify</strong> — תצוגת נתונים בלבד. הקריאות ל-API
          עוברות דרך <strong className="text-[var(--text-dark)]">Firebase Cloud Function</strong>{' '}
          <code className="rounded bg-[var(--bg-input)] px-1 text-[11px]">clockifyProxy</code> (Callable Gen2 +
          httpsCallable). מפתח ה-API נשמר בשרת; מזהה Workspace זמין לעובדים דרך{' '}
          <code className="rounded bg-[var(--bg-input)] px-1 text-[11px]">attendanceConfig/settings</code>.
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
            rows={mergedRows}
            loading={adminAtt.loading}
            error={adminAtt.error}
            workspaceId={clockify.workspaceId}
            integrationReady={clockify.integrationReady}
            filterStart={filterStart}
            filterEnd={filterEnd}
            onFilterChange={onFilterChange}
            onRefresh={() => void adminAtt.refresh()}
          />
        </>
      ) : (
        <ClockifyEmployeeDashboard
          userEmail={clockify.userEmail}
          workspaceId={clockify.workspaceId}
          integrationReady={clockify.integrationReady}
          state={empAtt.state}
          onRefresh={() => void empAtt.refresh()}
        />
      )}
    </div>
  )
}
