import { useMemo, useState } from 'react'
import { httpsCallable } from 'firebase/functions'
import { useAuth } from '../contexts/AuthContext'
import { useUsers } from '../hooks/useUsers'
import { functionsClient } from '../lib/firebase'
import { toastFsError, toastFsSuccess } from '../lib/fsToast'
import type { TeamMember } from '../types'
import { AGENT_COMMISSION_PERCENT_FALLBACK } from '../lib/agentRevenue'
import { hubSectionClass } from '../lib/hubSectionBorder'
import { Modal } from './shared/Modal'

type TeamRole = 'admin' | 'employee'

/** תפקיד כפי שמוצג בממשק — סוכן = עובד + isAgent ב-Firestore */
type UiUserRole = 'admin' | 'employee' | 'sales_agent'

type RoleFilter = 'all' | 'admin' | 'sales_agent' | 'employee'

const roleLabels: Record<UiUserRole, string> = {
  admin: 'מנהל מערכת',
  employee: 'עובד',
  sales_agent: 'סוכן מכירות',
}

function baseStoredRole(role: string): TeamRole {
  return role === 'admin' || role === 'superadmin' ? 'admin' : 'employee'
}

function memberUiRole(u: TeamMember): UiUserRole {
  if (baseStoredRole(u.role) === 'admin') return 'admin'
  if (u.isAgent === true) return 'sales_agent'
  return 'employee'
}

function scheduleCaption(u: TeamMember): string {
  const a = u.scheduleDayStart?.trim()
  const b = u.scheduleDayEnd?.trim()
  const br = u.scheduleBreakMinutes
  if (a && b && typeof br === 'number' && Number.isFinite(br)) return `${a}–${b} · ${br} דק׳`
  if (a && b) return `${a}–${b}`
  return 'לא הוגדר'
}

function UserDayScheduleModal({
  user,
  isOpen,
  onClose,
  updateUserDaySchedule,
}: {
  user: TeamMember | null
  isOpen: boolean
  onClose: () => void
  updateUserDaySchedule: (
    uid: string,
    schedule: { dayStart: string; dayEnd: string; breakMinutes: number } | null,
  ) => Promise<void>
}) {
  if (!isOpen || !user) return null

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title={`מועדי יום עבודה — ${user.name}`}
      size="md"
      bodyClassName="max-h-none overflow-visible"
    >
      <form
        className="space-y-4"
        key={`sched-modal-${user.id}-${user.scheduleDayStart ?? ''}-${user.scheduleDayEnd ?? ''}-${String(user.scheduleBreakMinutes ?? '')}`}
        onSubmit={(e) => {
          e.preventDefault()
          const fd = new FormData(e.currentTarget)
          const ds = String(fd.get('dayStart') ?? '')
          const de = String(fd.get('dayEnd') ?? '')
          const brRaw = String(fd.get('breakMin') ?? '30')
          const br = Number(brRaw)
          if (!ds || !de) return
          if (!Number.isFinite(br) || br < 0) return
          void (async () => {
            await updateUserDaySchedule(user.id, {
              dayStart: ds,
              dayEnd: de,
              breakMinutes: br,
            })
            onClose()
          })()
        }}
      >
        <p className="text-[12px] leading-relaxed text-[var(--text-mid)]">
          בדוח נוכחות יוצג האם העובד נכנס עד שעת ההתחלה (עם סבלנות קצרה) ויצא לא לפני שעת הסיום.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-[var(--text-mid)]">מ־</span>
          <input
            name="dayStart"
            type="time"
            defaultValue={user.scheduleDayStart ?? '09:00'}
            className="rounded-lg border border-[var(--border-orange-soft)] bg-[var(--bg-input)] px-2 py-2 text-sm font-semibold text-[var(--text-dark)]"
          />
          <span className="text-xs font-semibold text-[var(--text-mid)]">עד</span>
          <input
            name="dayEnd"
            type="time"
            defaultValue={user.scheduleDayEnd ?? '17:00'}
            className="rounded-lg border border-[var(--border-orange-soft)] bg-[var(--bg-input)] px-2 py-2 text-sm font-semibold text-[var(--text-dark)]"
          />
          <span className="text-xs font-semibold text-[var(--text-mid)]">הפסקה (דק׳)</span>
          <input
            name="breakMin"
            type="number"
            min={0}
            max={180}
            step={5}
            defaultValue={user.scheduleBreakMinutes ?? 30}
            className="w-20 rounded-lg border border-[var(--border-orange-soft)] bg-[var(--bg-input)] px-2 py-2 text-sm font-semibold text-[var(--text-dark)]"
          />
        </div>
        <div className="flex flex-wrap gap-2 pt-2">
          <button type="submit" className="rounded-lg px-4 py-2 text-sm hub-btn-primary">
            שמור מועדים
          </button>
          <button
            type="button"
            className="rounded-lg border border-[var(--border-orange-soft)] bg-[var(--dash-panel-bg)] px-4 py-2 text-sm font-semibold text-[var(--text-mid)] hover:bg-[var(--surface-muted)]"
            onClick={() => {
              void (async () => {
                await updateUserDaySchedule(user.id, null)
                onClose()
              })()
            }}
          >
            נקה מועדים
          </button>
          <button
            type="button"
            className="rounded-lg border border-[var(--border-orange-soft)] bg-[var(--dash-panel-bg)] px-4 py-2 text-sm font-semibold text-[var(--text-mid)] hover:bg-[var(--surface-muted)]"
            onClick={onClose}
          >
            סגור
          </button>
        </div>
      </form>
    </Modal>
  )
}

/** תוכן ניהול משתמשים — לשימוש בדף מלא */
export function UserManagementContent() {
  const { user } = useAuth()
  const {
    users: teamMembers,
    toggleUserActive,
    updateUserProfile,
    updateUserMonthlyWorkHours,
    updateUserDaySchedule,
    setUserRoleAndAgent,
    updateUserAgentCommissionPercent,
  } = useUsers()
  const myRole =
    teamMembers.find((m) => m.id === (user?.uid ?? ''))?.role ?? 'employee'
  const canManageAuth = myRole === 'admin' || myRole === 'superadmin'
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState<'name' | 'role' | 'status'>('status')
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all')
  const [createOpen, setCreateOpen] = useState(true)
  const [scheduleUserId, setScheduleUserId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftName, setDraftName] = useState('')
  const [draftAvatar, setDraftAvatar] = useState('')
  const [draftColor, setDraftColor] = useState('#2563EB')
  const [newEmail, setNewEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newName, setNewName] = useState('')
  const [newRole, setNewRole] = useState<UiUserRole>('employee')

  const roleStats = useMemo(() => {
    let admins = 0
    let salesAgents = 0
    let employees = 0
    for (const m of teamMembers) {
      const r = memberUiRole(m)
      if (r === 'admin') admins += 1
      else if (r === 'sales_agent') salesAgents += 1
      else employees += 1
    }
    return {
      total: teamMembers.length,
      admins,
      salesAgents,
      employees,
    }
  }, [teamMembers])

  const scheduleModalUser = useMemo(
    () => teamMembers.find((m) => m.id === scheduleUserId) ?? null,
    [teamMembers, scheduleUserId],
  )

  const applyUiRole = async (u: TeamMember, ui: UiUserRole) => {
    if (ui === 'admin') {
      await setUserRoleAndAgent(u.id, 'admin', false)
    } else if (ui === 'sales_agent') {
      await setUserRoleAndAgent(u.id, 'employee', true)
    } else {
      await setUserRoleAndAgent(u.id, 'employee', false)
    }
  }

  const toggleActive = async (u: TeamMember, active: boolean) => {
    await toggleUserActive(u.id, active)
  }

  const startEdit = (u: TeamMember) => {
    setEditingId(u.id)
    setDraftName(u.name)
    setDraftAvatar(u.avatar)
    setDraftColor(u.color || '#2563EB')
  }

  const cancelEdit = () => {
    setEditingId(null)
    setDraftName('')
    setDraftAvatar('')
    setDraftColor('#2563EB')
  }

  const saveEdit = async (u: TeamMember) => {
    const cleanName = draftName.trim()
    const cleanAvatar = draftAvatar.trim().slice(0, 2)
    if (!cleanName) return
    await updateUserProfile(u.id, {
      name: cleanName,
      avatar: cleanAvatar || cleanName.slice(0, 2),
      color: draftColor,
    })
    cancelEdit()
  }

  const createManagedUser = httpsCallable<
    { email: string; password: string; name: string; role: TeamRole; isAgent?: boolean },
    { uid: string }
  >(functionsClient, 'createManagedUser')
  const updateManagedUserEmail = httpsCallable<
    { uid: string; email: string },
    { ok: true }
  >(functionsClient, 'updateManagedUserEmail')
  const updateManagedUserPassword = httpsCallable<
    { uid: string; password: string },
    { ok: true }
  >(functionsClient, 'updateManagedUserPassword')

  const createUser = async () => {
    const email = newEmail.trim()
    const password = newPassword.trim()
    const name = newName.trim()
    if (!email || !password || !name) return
    try {
      await createManagedUser({
        email,
        password,
        name,
        role: newRole === 'admin' ? 'admin' : 'employee',
        isAgent: newRole === 'sales_agent',
      })
      toastFsSuccess('משתמש חדש נוצר בהצלחה')
      setNewEmail('')
      setNewPassword('')
      setNewName('')
      setNewRole('employee')
    } catch (e) {
      toastFsError('שגיאה ביצירת משתמש חדש', e, 'createManagedUser')
    }
  }

  const changeUserEmail = async (u: TeamMember) => {
    const nextEmail = window.prompt('אימייל חדש למשתמש:', u.email ?? '')
    if (!nextEmail) return
    try {
      await updateManagedUserEmail({ uid: u.id, email: nextEmail.trim() })
      await updateUserProfile(u.id, { name: u.name })
      toastFsSuccess('האימייל עודכן')
    } catch (e) {
      toastFsError('שגיאה בעדכון אימייל', e, 'updateManagedUserEmail')
    }
  }

  const changeUserPassword = async (u: TeamMember) => {
    const nextPassword = window.prompt('סיסמה חדשה למשתמש (לפחות 6 תווים):', '')
    if (!nextPassword) return
    try {
      await updateManagedUserPassword({ uid: u.id, password: nextPassword.trim() })
      toastFsSuccess('הסיסמה עודכנה')
    } catch (e) {
      toastFsError('שגיאה בעדכון סיסמה', e, 'updateManagedUserPassword')
    }
  }

  const visibleMembers = useMemo(() => {
    const q = search.trim().toLowerCase()
    const filtered = teamMembers.filter((u) => {
      if (roleFilter !== 'all' && memberUiRole(u) !== roleFilter) return false
      if (!q) return true
      return (
        u.name.toLowerCase().includes(q) ||
        (u.email ?? '').toLowerCase().includes(q) ||
        roleLabels[memberUiRole(u)].toLowerCase().includes(q)
      )
    })
    const rankByRole = (ui: UiUserRole) =>
      ui === 'admin' ? 0 : ui === 'sales_agent' ? 1 : 2
    return filtered.sort((a, b) => {
      const ar = memberUiRole(a)
      const br = memberUiRole(b)
      const aa = a.active !== false
      const ba = b.active !== false
      if (sortBy === 'status') {
        if (aa !== ba) return aa ? -1 : 1
        return a.name.localeCompare(b.name, 'he')
      }
      if (sortBy === 'role') {
        const diff = rankByRole(ar) - rankByRole(br)
        if (diff !== 0) return diff
        return a.name.localeCompare(b.name, 'he')
      }
      return a.name.localeCompare(b.name, 'he')
    })
  }, [teamMembers, search, sortBy, roleFilter])

  const kpiBtn = (sel: boolean) =>
    `flex flex-col items-stretch gap-1 rounded-[12px] border px-3 py-2.5 text-right transition ${
      sel
        ? 'border-[var(--orange)] bg-[var(--orange-light)] shadow-[0_1px_4px_rgba(249,115,22,0.18)]'
        : 'border-[var(--border-orange-soft)] bg-[var(--dash-panel-bg)] hover:bg-[var(--surface-muted)]'
    }`

  return (
    <div className="space-y-5" style={{ fontFamily: 'Rubik, sans-serif' }}>
      {teamMembers.length > 0 ? (
        <section
          className="grid grid-cols-2 gap-3 sm:grid-cols-4"
          aria-label="סיכום משתמשים לפי תפקיד"
        >
          <button
            type="button"
            className={kpiBtn(roleFilter === 'all')}
            onClick={() => setRoleFilter('all')}
          >
            <span className="text-[11px] font-semibold text-[var(--text-mid)]">סה״כ במערכת</span>
            <span className="text-[22px] font-extrabold tabular-nums text-[var(--text-dark)]">
              {roleStats.total}
            </span>
          </button>
          <button
            type="button"
            className={kpiBtn(roleFilter === 'admin')}
            onClick={() => setRoleFilter('admin')}
          >
            <span className="text-[11px] font-semibold text-[var(--text-mid)]">מנהלי מערכת</span>
            <span className="text-[22px] font-extrabold tabular-nums text-[#2563EB]">
              {roleStats.admins}
            </span>
          </button>
          <button
            type="button"
            className={kpiBtn(roleFilter === 'sales_agent')}
            onClick={() => setRoleFilter('sales_agent')}
          >
            <span className="text-[11px] font-semibold text-[var(--text-mid)]">סוכני מכירות</span>
            <span className="text-[22px] font-extrabold tabular-nums text-[var(--orange)]">
              {roleStats.salesAgents}
            </span>
          </button>
          <button
            type="button"
            className={kpiBtn(roleFilter === 'employee')}
            onClick={() => setRoleFilter('employee')}
          >
            <span className="text-[11px] font-semibold text-[var(--text-mid)]">עובדים</span>
            <span className="text-[22px] font-extrabold tabular-nums text-[#64748B]">
              {roleStats.employees}
            </span>
          </button>
        </section>
      ) : null}

      {canManageAuth ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            className="hub-btn-orange text-sm"
            onClick={() => setCreateOpen((v) => !v)}
          >
            {createOpen ? 'סגירת טופס משתמש חדש' : '+ משתמש חדש'}
          </button>
        </div>
      ) : null}

      {canManageAuth && createOpen ? (
        <div className={`${hubSectionClass(0)} space-y-3 rounded-2xl p-4 shadow-[0_2px_8px_rgba(0,0,0,0.06)] md:p-5`}>
          <div className="text-sm font-extrabold text-[var(--text-dark)]">יצירת משתמש חדש</div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="שם מלא"
              className="rounded-lg border border-[var(--border-orange-soft)] bg-[var(--bg-input)] px-3 py-2 text-sm"
            />
            <input
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="אימייל להתחברות"
              dir="ltr"
              className="rounded-lg border border-[var(--border-orange-soft)] bg-[var(--bg-input)] px-3 py-2 text-sm"
            />
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="סיסמה זמנית"
              dir="ltr"
              className="rounded-lg border border-[var(--border-orange-soft)] bg-[var(--bg-input)] px-3 py-2 text-sm"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={newRole}
              onChange={(e) => setNewRole(e.target.value as UiUserRole)}
              className="min-w-[10rem] rounded-lg border border-[var(--border-orange-soft)] bg-[var(--bg-input)] py-2 ps-2 pe-2 text-xs font-semibold text-[var(--text-dark)]"
            >
              <option value="admin">{roleLabels.admin}</option>
              <option value="employee">{roleLabels.employee}</option>
              <option value="sales_agent">{roleLabels.sales_agent}</option>
            </select>
            <button
              type="button"
              onClick={() => void createUser()}
              className="rounded-lg px-4 py-2 text-xs hub-btn-primary"
            >
              הוסף משתמש
            </button>
          </div>
        </div>
      ) : null}

      <div
        className={`${hubSectionClass(canManageAuth && createOpen ? 1 : 0)} flex flex-col gap-3 rounded-2xl p-4 shadow-[0_2px_8px_rgba(0,0,0,0.06)] md:flex-row md:items-center md:justify-between`}
      >
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="חיפוש לפי שם, מייל או הרשאה"
          className="min-w-0 flex-1 rounded-lg border border-[var(--border-orange-soft)] bg-[var(--bg-input)] px-3 py-2 text-sm outline-none ring-0 focus:border-[var(--orange)] md:max-w-md"
        />
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-[var(--text-mid)]">סידור:</span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as 'name' | 'role' | 'status')}
            className="rounded-lg border border-[var(--border-orange-soft)] bg-[var(--bg-input)] py-1.5 ps-2 pe-2 text-xs font-semibold text-[var(--text-dark)]"
          >
            <option value="status">פעילים קודם</option>
            <option value="role">לפי הרשאה</option>
            <option value="name">לפי שם</option>
          </select>
          {roleFilter !== 'all' ? (
            <button
              type="button"
              className="rounded-[10px] border border-[var(--border-orange-soft)] bg-[var(--dash-panel-bg)] px-3 py-1.5 text-xs font-semibold text-[var(--orange)] hover:bg-[var(--surface-muted)]"
              onClick={() => setRoleFilter('all')}
            >
              ביטול סינון תפקיד
            </button>
          ) : null}
        </div>
      </div>

      {teamMembers.length === 0 ? (
        <p className="hub-empty-dashed rounded-2xl py-12 text-center text-sm text-[var(--text-mid)]">
          אין משתמשים ב-Firestore. לאחר התחברות ראשונה נוצר פרופיל אוטומטית.
        </p>
      ) : visibleMembers.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-[var(--border-orange-soft)] bg-[var(--dash-panel-bg)] py-10 text-center text-sm text-[var(--text-mid)]">
          {search.trim()
            ? 'לא נמצאו משתמשים לפי החיפוש.'
            : roleFilter !== 'all'
              ? 'אין משתמשים בסינון התפקיד הזה.'
              : 'לא נמצאו משתמשים.'}
        </p>
      ) : (
        <section
          className={`rounded-2xl shadow-[0_2px_8px_rgba(0,0,0,0.06)] ${hubSectionClass(canManageAuth && createOpen ? 2 : 1)}`}
        >
          <div className="hidden min-w-0 overflow-x-auto md:block">
            <table className="w-full min-w-[1060px] table-fixed border-collapse text-sm" dir="rtl">
              <thead className="bg-[var(--surface-muted)]">
                <tr className="text-right text-[11px] font-bold text-[var(--text-light)]">
                  <th className="px-3 py-3">משתמש</th>
                  <th className="w-[190px] px-3 py-3">אימייל</th>
                  <th className="w-[132px] px-3 py-3">תפקיד</th>
                  {canManageAuth ? (
                    <th
                      className="w-[104px] px-2 py-3"
                      title="אחוז מסכום ששולם ללקוחות — לחישובי עמלה בפורטל «כספים». ריק = ברירת מחדל מהמערכת."
                    >
                      עמלה % (כספים)
                    </th>
                  ) : null}
                  <th className="w-[108px] px-3 py-3">סטטוס</th>
                  {canManageAuth ? (
                    <th className="w-[88px] px-3 py-3">יעד ש׳/חודש</th>
                  ) : null}
                  {canManageAuth ? (
                    <th className="w-[140px] px-3 py-3">יום עבודה</th>
                  ) : null}
                  <th className="w-[9.5rem] min-w-[9.5rem] max-w-[9.5rem] px-2 py-3">פעולות</th>
                </tr>
              </thead>
              <tbody>
                {visibleMembers.map((u) => {
                  const uiRole = memberUiRole(u)
                  const active = u.active !== false
                  const isEditing = editingId === u.id
                  return (
                    <tr key={u.id} className="border-t border-[var(--border)] align-top">
                      <td className="px-3 py-3">
                        <div className="flex items-start gap-2">
                          <span
                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
                            style={{ backgroundColor: isEditing ? draftColor : u.color }}
                          >
                            {isEditing ? draftAvatar.slice(0, 2) || '??' : u.avatar}
                          </span>
                          <div className="min-w-0 flex-1 space-y-1">
                            {isEditing ? (
                              <>
                                <input
                                  value={draftName}
                                  onChange={(e) => setDraftName(e.target.value)}
                                  placeholder="שם"
                                  className="w-full rounded-lg border border-[var(--border-orange-soft)] bg-[var(--bg-input)] px-2 py-1 text-xs"
                                />
                                <div className="flex flex-wrap items-center gap-1">
                                  <input
                                    value={draftAvatar}
                                    onChange={(e) =>
                                      setDraftAvatar(e.target.value.slice(0, 2))
                                    }
                                    placeholder="ר״ת"
                                    className="w-12 rounded border border-[var(--border-orange-soft)] bg-[var(--bg-input)] px-1 py-0.5 text-[10px]"
                                  />
                                  <input
                                    type="color"
                                    value={draftColor}
                                    onChange={(e) => setDraftColor(e.target.value)}
                                    className="h-6 w-8 cursor-pointer rounded border border-[var(--border-orange-soft)] p-0"
                                    aria-label="צבע"
                                  />
                                </div>
                              </>
                            ) : (
                              <div className="font-semibold leading-snug text-[var(--text-dark)]">
                                {u.name}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <div
                          className="line-clamp-2 break-all text-xs text-[var(--text-mid)] ltr text-left"
                          dir="ltr"
                          title={u.email ?? ''}
                        >
                          {u.email ?? '—'}
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <select
                          value={uiRole}
                          onChange={(e) => {
                            void applyUiRole(u, e.target.value as UiUserRole)
                          }}
                          className="w-full rounded-lg border border-[var(--border-orange-soft)] bg-[var(--bg-input)] py-1 ps-1 pe-1 text-[11px] font-semibold text-[var(--text-dark)]"
                        >
                          <option value="admin">{roleLabels.admin}</option>
                          <option value="employee">{roleLabels.employee}</option>
                          <option value="sales_agent">{roleLabels.sales_agent}</option>
                        </select>
                      </td>
                      {canManageAuth ? (
                        <td className="px-2 py-3 align-top">
                          {u.isAgent === true ? (
                            <div className="space-y-0.5">
                              <input
                                type="number"
                                min={0}
                                max={100}
                                step={1}
                                dir="ltr"
                                title="שמירה ביציאה מהשדה · ריק = ברירת מחדל"
                                placeholder={String(AGENT_COMMISSION_PERCENT_FALLBACK)}
                                className="w-full rounded-lg border border-[var(--border-orange-soft)] bg-[var(--bg-input)] px-1.5 py-1 text-center text-xs font-semibold text-[var(--text-dark)]"
                                defaultValue={
                                  typeof u.agentCommissionPercent === 'number' &&
                                  Number.isFinite(u.agentCommissionPercent)
                                    ? u.agentCommissionPercent
                                    : ''
                                }
                                key={`ac-${u.id}-${String(u.agentCommissionPercent ?? '')}-${String(u.isAgent)}`}
                                onBlur={(e) => {
                                  const raw = e.target.value.trim().replace(',', '.')
                                  const prev =
                                    typeof u.agentCommissionPercent === 'number' &&
                                    Number.isFinite(u.agentCommissionPercent)
                                      ? Math.round(u.agentCommissionPercent)
                                      : null
                                  if (raw === '') {
                                    if (prev !== null)
                                      void updateUserAgentCommissionPercent(u.id, null)
                                    return
                                  }
                                  const n = Math.round(Number(raw))
                                  if (!Number.isFinite(n) || n < 0 || n > 100) return
                                  if (prev !== null && prev === n) return
                                  void updateUserAgentCommissionPercent(u.id, n)
                                }}
                              />
                              <p className="text-[9px] leading-tight text-[var(--text-mid)]">
                                פורטל סוכן
                              </p>
                            </div>
                          ) : (
                            <span className="text-xs text-[var(--text-mid)]">—</span>
                          )}
                        </td>
                      ) : null}
                      <td className="px-3 py-3">
                        <div className="flex flex-col items-end gap-1" dir="ltr">
                          <button
                            type="button"
                            role="switch"
                            aria-checked={active}
                            onClick={() => void toggleActive(u, !active)}
                            className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                              active ? 'bg-[#10B981]' : 'bg-[#CBD5E1]'
                            }`}
                          >
                            <span
                              className={`absolute left-0.5 top-0.5 block h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 ${
                                active ? 'translate-x-5' : 'translate-x-0'
                              }`}
                            />
                          </button>
                          <span className="text-[10px] font-medium text-[var(--text-mid)]" dir="rtl">
                            {active ? 'פעיל' : 'מושהה'}
                          </span>
                        </div>
                      </td>
                      {canManageAuth ? (
                        <td className="px-3 py-3">
                          <input
                            type="number"
                            min={0}
                            max={400}
                            step={0.5}
                            placeholder="—"
                            dir="ltr"
                            title="שעות · ריק = ללא יעד · שמירה ביציאה מהשדה"
                            className="w-full rounded-lg border border-[var(--border-orange-soft)] bg-[var(--bg-input)] px-1.5 py-1 text-center text-xs font-semibold text-[var(--text-dark)]"
                            defaultValue={
                              u.monthlyWorkHours != null && u.monthlyWorkHours !== undefined
                                ? u.monthlyWorkHours
                                : ''
                            }
                            key={`mh-${u.id}-${String(u.monthlyWorkHours ?? '')}`}
                            onBlur={(e) => {
                              const raw = e.target.value.trim().replace(',', '.')
                              const prev = u.monthlyWorkHours ?? null
                              if (raw === '') {
                                if (prev !== null) void updateUserMonthlyWorkHours(u.id, null)
                                return
                              }
                              const n = Number(raw)
                              if (!Number.isFinite(n) || n < 0) return
                              if (prev !== null && Math.abs(prev - n) < 0.0001) return
                              void updateUserMonthlyWorkHours(u.id, n)
                            }}
                          />
                        </td>
                      ) : null}
                      {canManageAuth ? (
                        <td className="px-3 py-3">
                          <div className="space-y-1.5">
                            <p className="text-[10px] leading-snug text-[var(--text-mid)]" dir="ltr">
                              {scheduleCaption(u)}
                            </p>
                            <button
                              type="button"
                              className="w-full rounded-[8px] border border-[var(--border-orange-soft)] bg-[var(--orange-light)] px-2 py-1 text-[10px] font-semibold text-[var(--orange)]"
                              onClick={() => setScheduleUserId(u.id)}
                            >
                              מועדים
                            </button>
                          </div>
                        </td>
                      ) : null}
                      <td className="px-2 py-3">
                        <div className="flex min-w-0 flex-col gap-1.5">
                          {isEditing ? (
                            <>
                              <button
                                type="button"
                                onClick={() => void saveEdit(u)}
                                disabled={!draftName.trim()}
                                className="w-full rounded-[8px] px-2 py-1.5 text-[11px] hub-btn-primary disabled:opacity-50"
                              >
                                שמור
                              </button>
                              <button
                                type="button"
                                onClick={cancelEdit}
                                className="w-full rounded-[8px] border border-[var(--border-orange-soft)] bg-[var(--dash-panel-bg)] py-1.5 text-[11px] font-semibold text-[var(--text-mid)] hover:bg-[var(--surface-muted)]"
                              >
                                ביטול
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              onClick={() => startEdit(u)}
                              className="w-full rounded-[8px] border border-[var(--border-orange-soft)] bg-[var(--orange-light)] py-1.5 text-[11px] font-semibold text-[var(--orange)]"
                            >
                              עריכת פרופיל
                            </button>
                          )}
                          {canManageAuth ? (
                            <>
                              <button
                                type="button"
                                onClick={() => void changeUserEmail(u)}
                                className="w-full rounded-[8px] border border-[var(--border-orange-soft)] bg-[var(--dash-panel-bg)] py-1.5 text-[11px] font-semibold text-[var(--blue-mid)] hover:bg-[var(--surface-muted)]"
                              >
                                אימייל
                              </button>
                              <button
                                type="button"
                                onClick={() => void changeUserPassword(u)}
                                className="w-full rounded-[8px] border border-[var(--border-orange-soft)] bg-[var(--dash-panel-bg)] py-1.5 text-[11px] font-semibold text-[var(--danger)] hover:bg-[var(--surface-muted)]"
                              >
                                סיסמה
                              </button>
                            </>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="space-y-3 p-3 md:hidden">
            {visibleMembers.map((u) => {
              const uiRole = memberUiRole(u)
              const active = u.active !== false
              const isEditing = editingId === u.id
              return (
                <article
                  key={u.id}
                  className="rounded-xl border border-[var(--border)] bg-[var(--dash-panel-bg)] p-3 shadow-sm"
                >
                  <div className="flex items-start gap-2">
                    <span
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
                      style={{ backgroundColor: isEditing ? draftColor : u.color }}
                    >
                      {isEditing ? draftAvatar.slice(0, 2) || '??' : u.avatar}
                    </span>
                    <div className="min-w-0 flex-1">
                      {isEditing ? (
                        <div className="space-y-2">
                          <input
                            value={draftName}
                            onChange={(e) => setDraftName(e.target.value)}
                            className="w-full rounded-lg border border-[var(--border-orange-soft)] bg-[var(--bg-input)] px-2 py-1 text-sm"
                          />
                          <div className="flex gap-2">
                            <input
                              value={draftAvatar}
                              onChange={(e) => setDraftAvatar(e.target.value.slice(0, 2))}
                              className="w-14 rounded border bg-[var(--bg-input)] px-1 text-xs"
                            />
                            <input
                              type="color"
                              value={draftColor}
                              onChange={(e) => setDraftColor(e.target.value)}
                              className="h-8 w-10 rounded border p-0"
                            />
                          </div>
                        </div>
                      ) : (
                        <div className="font-bold text-[var(--text-dark)]">{u.name}</div>
                      )}
                      <div className="mt-0.5 break-all text-xs text-[var(--text-mid)]" dir="ltr">
                        {u.email ?? '—'}
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <select
                      value={uiRole}
                      onChange={(e) => void applyUiRole(u, e.target.value as UiUserRole)}
                      className="rounded-lg border bg-[var(--bg-input)] px-2 py-1 text-xs font-semibold"
                    >
                      <option value="admin">{roleLabels.admin}</option>
                      <option value="employee">{roleLabels.employee}</option>
                      <option value="sales_agent">{roleLabels.sales_agent}</option>
                    </select>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={active}
                      onClick={() => void toggleActive(u, !active)}
                      className={`relative h-6 w-11 rounded-full ${active ? 'bg-[#10B981]' : 'bg-[#CBD5E1]'}`}
                      dir="ltr"
                    >
                      <span
                        className={`absolute left-0.5 top-0.5 block h-5 w-5 rounded-full bg-white shadow transition-transform ${
                          active ? 'translate-x-5' : ''
                        }`}
                      />
                    </button>
                  </div>
                  {canManageAuth && u.isAgent === true ? (
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-semibold text-[var(--text-mid)]">עמלה % (כספים):</span>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        step={1}
                        dir="ltr"
                        title="שמירה ביציאה · ריק = ברירת מחדל"
                        placeholder={String(AGENT_COMMISSION_PERCENT_FALLBACK)}
                        className="w-20 rounded border border-[var(--border-orange-soft)] bg-[var(--bg-input)] px-2 py-1 text-xs"
                        defaultValue={
                          typeof u.agentCommissionPercent === 'number' &&
                          Number.isFinite(u.agentCommissionPercent)
                            ? u.agentCommissionPercent
                            : ''
                        }
                        key={`ac-m-${u.id}-${String(u.agentCommissionPercent ?? '')}`}
                        onBlur={(e) => {
                          const raw = e.target.value.trim().replace(',', '.')
                          const prev =
                            typeof u.agentCommissionPercent === 'number' &&
                            Number.isFinite(u.agentCommissionPercent)
                              ? Math.round(u.agentCommissionPercent)
                              : null
                          if (raw === '') {
                            if (prev !== null) void updateUserAgentCommissionPercent(u.id, null)
                            return
                          }
                          const n = Math.round(Number(raw))
                          if (!Number.isFinite(n) || n < 0 || n > 100) return
                          if (prev !== null && prev === n) return
                          void updateUserAgentCommissionPercent(u.id, n)
                        }}
                      />
                    </div>
                  ) : null}
                  {canManageAuth ? (
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-semibold text-[var(--text-mid)]">יעד ש׳/חודש:</span>
                      <input
                        type="number"
                        min={0}
                        max={400}
                        step={0.5}
                        dir="ltr"
                        className="w-20 rounded border border-[var(--border-orange-soft)] bg-[var(--bg-input)] px-2 py-1 text-xs"
                        defaultValue={
                          u.monthlyWorkHours != null && u.monthlyWorkHours !== undefined
                            ? u.monthlyWorkHours
                            : ''
                        }
                        key={`mh-m-${u.id}-${String(u.monthlyWorkHours ?? '')}`}
                        onBlur={(e) => {
                          const raw = e.target.value.trim().replace(',', '.')
                          const prev = u.monthlyWorkHours ?? null
                          if (raw === '') {
                            if (prev !== null) void updateUserMonthlyWorkHours(u.id, null)
                            return
                          }
                          const n = Number(raw)
                          if (!Number.isFinite(n) || n < 0) return
                          if (prev !== null && Math.abs(prev - n) < 0.0001) return
                          void updateUserMonthlyWorkHours(u.id, n)
                        }}
                      />
                    </div>
                  ) : null}
                  {canManageAuth ? (
                    <div className="mt-2 flex flex-wrap gap-2 text-xs">
                      <span className="text-[var(--text-mid)]">{scheduleCaption(u)}</span>
                      <button
                        type="button"
                        className="rounded-md bg-[var(--orange-light)] px-2 py-1 font-semibold text-[var(--orange)]"
                        onClick={() => setScheduleUserId(u.id)}
                      >
                        מועדים
                      </button>
                    </div>
                  ) : null}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {isEditing ? (
                      <>
                        <button
                          type="button"
                          disabled={!draftName.trim()}
                          className="hub-btn-primary rounded-lg px-3 py-1.5 text-xs disabled:opacity-50"
                          onClick={() => void saveEdit(u)}
                        >
                          שמור
                        </button>
                        <button
                          type="button"
                          className="rounded-lg border px-3 py-1.5 text-xs"
                          onClick={cancelEdit}
                        >
                          ביטול
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        className="rounded-lg border px-3 py-1.5 text-xs font-semibold"
                        onClick={() => startEdit(u)}
                      >
                        עריכה
                      </button>
                    )}
                    {canManageAuth ? (
                      <>
                        <button
                          type="button"
                          className="rounded-lg border px-3 py-1.5 text-xs text-[var(--blue-mid)]"
                          onClick={() => void changeUserEmail(u)}
                        >
                          אימייל
                        </button>
                        <button
                          type="button"
                          className="rounded-lg border px-3 py-1.5 text-xs text-[var(--danger)]"
                          onClick={() => void changeUserPassword(u)}
                        >
                          סיסמה
                        </button>
                      </>
                    ) : null}
                  </div>
                </article>
              )
            })}
          </div>
        </section>
      )}

      <UserDayScheduleModal
        user={scheduleModalUser}
        isOpen={scheduleUserId !== null}
        onClose={() => setScheduleUserId(null)}
        updateUserDaySchedule={updateUserDaySchedule}
      />

      <footer className={`${hubSectionClass(4)} rounded-2xl px-4 py-3`}>
        <p className="text-center text-xs leading-relaxed text-[var(--text-mid)]">
          ניהול משתמשים מלא (כולל יצירה/אימייל/סיסמה) דורש Cloud Functions עם הרשאות Admin.
        </p>
      </footer>
    </div>
  )
}
