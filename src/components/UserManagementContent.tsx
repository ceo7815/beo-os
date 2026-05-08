import { useMemo, useState } from 'react'
import { httpsCallable } from 'firebase/functions'
import { useAuth } from '../contexts/AuthContext'
import { useUsers } from '../hooks/useUsers'
import { functionsClient } from '../lib/firebase'
import { toastFsError, toastFsSuccess } from '../lib/fsToast'
import type { TeamMember } from '../types'

type TeamRole = 'admin' | 'employee'

const roleLabels: Record<TeamRole, string> = {
  admin: 'מנהל מערכת',
  employee: 'עובד',
}

function toTeamRole(role: string): TeamRole {
  return role === 'admin' || role === 'superadmin' ? 'admin' : 'employee'
}

/** תוכן ניהול משתמשים — לשימוש בדף מלא */
export function UserManagementContent() {
  const { user } = useAuth()
  const {
    users: teamMembers,
    updateUserRole,
    toggleUserActive,
    updateUserProfile,
    updateUserMonthlyWorkHours,
    updateUserDaySchedule,
  } = useUsers()
  const myRole =
    teamMembers.find((m) => m.id === (user?.uid ?? ''))?.role ?? 'employee'
  const canManageAuth = myRole === 'admin' || myRole === 'superadmin'
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState<'name' | 'role' | 'status'>('status')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftName, setDraftName] = useState('')
  const [draftAvatar, setDraftAvatar] = useState('')
  const [draftColor, setDraftColor] = useState('#2563EB')
  const [newEmail, setNewEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newName, setNewName] = useState('')
  const [newRole, setNewRole] = useState<TeamRole>('employee')

  const updateRole = async (u: TeamMember, role: TeamRole) => {
    await updateUserRole(u.id, role)
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
    { email: string; password: string; name: string; role: TeamRole },
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
      await createManagedUser({ email, password, name, role: newRole })
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
      if (!q) return true
      return (
        u.name.toLowerCase().includes(q) ||
        (u.email ?? '').toLowerCase().includes(q) ||
        toTeamRole(u.role).includes(q)
      )
    })
    const rankByRole = (role: TeamRole) => (role === 'admin' ? 0 : 1)
    return filtered.sort((a, b) => {
      const ar = toTeamRole(a.role)
      const br = toTeamRole(b.role)
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
  }, [teamMembers, search, sortBy])

  return (
    <div className="space-y-4" style={{ fontFamily: 'Rubik, sans-serif' }}>
      {canManageAuth ? (
        <div className="space-y-2 rounded-2xl border border-[#BFDBFE] bg-[#EFF6FF] p-4">
          <div className="text-sm font-bold text-[#1E3A8A]">יצירת משתמש חדש</div>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="שם מלא"
              className="rounded-lg border border-[#DBEAFE] bg-white px-3 py-2 text-sm"
            />
            <input
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="אימייל להתחברות"
              dir="ltr"
              className="rounded-lg border border-[#DBEAFE] bg-white px-3 py-2 text-sm"
            />
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="סיסמה זמנית"
              dir="ltr"
              className="rounded-lg border border-[#DBEAFE] bg-white px-3 py-2 text-sm"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={newRole}
              onChange={(e) => setNewRole(e.target.value as TeamRole)}
              className="rounded-lg border border-[#DBEAFE] bg-white py-2 pl-2 pr-2 text-xs font-semibold text-[#1A2B5E]"
            >
              <option value="admin">{roleLabels.admin}</option>
              <option value="employee">{roleLabels.employee}</option>
            </select>
            <button
              type="button"
              onClick={() => void createUser()}
              className="rounded-lg bg-[#2563EB] px-4 py-2 text-xs font-semibold text-white"
            >
              הוסף משתמש
            </button>
          </div>
        </div>
      ) : null}

      <div className="space-y-2 rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC] p-4">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="חיפוש לפי שם, מייל או הרשאה"
          className="w-full rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-sm outline-none ring-0 focus:border-[#93C5FD]"
        />
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-[#334155]">סידור:</span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as 'name' | 'role' | 'status')}
            className="rounded-lg border border-[#E2E8F0] bg-white py-1.5 pl-2 pr-2 text-xs font-semibold text-[#1A2B5E]"
          >
            <option value="status">פעילים קודם</option>
            <option value="role">לפי הרשאה</option>
            <option value="name">לפי שם</option>
          </select>
        </div>
      </div>

      {teamMembers.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-[#CBD5E1] bg-white py-12 text-center text-sm text-[#64748B]">
          אין משתמשים ב-Firestore. לאחר התחברות ראשונה נוצר פרופיל אוטומטית.
        </p>
      ) : visibleMembers.length === 0 ? (
        <p className="text-center text-sm text-[#64748B]">לא נמצאו משתמשים לפי החיפוש.</p>
      ) : (
        <ul className="space-y-3">
          {visibleMembers.map((u) => {
            const r = toTeamRole(u.role)
            const active = u.active !== false
            const isEditing = editingId === u.id
            return (
              <li
                key={u.id}
                className="rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC] p-4 shadow-sm"
              >
                <div className="flex items-start gap-3">
                  <span
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-xs font-bold leading-tight text-white"
                    style={{ backgroundColor: u.color }}
                  >
                    {isEditing ? draftAvatar.slice(0, 2) || '??' : u.avatar}
                  </span>
                  <div className="min-w-0 flex-1">
                    {isEditing ? (
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                        <input
                          value={draftName}
                          onChange={(e) => setDraftName(e.target.value)}
                          placeholder="שם משתמש"
                          className="rounded-lg border border-[#E2E8F0] bg-white px-2 py-1.5 text-xs sm:col-span-2"
                        />
                        <input
                          value={draftAvatar}
                          onChange={(e) => setDraftAvatar(e.target.value.slice(0, 2))}
                          placeholder="ראשי תיבות"
                          className="rounded-lg border border-[#E2E8F0] bg-white px-2 py-1.5 text-xs"
                        />
                      </div>
                    ) : (
                      <div className="font-semibold text-[#0F172A]">{u.name}</div>
                    )}
                    <div
                      className="truncate text-xs text-[#64748B] ltr text-left"
                      dir="ltr"
                    >
                      {u.email ?? '—'}
                    </div>
                    {canManageAuth ? (
                      <div className="mt-2 rounded-lg border border-dashed border-[#CBD5E1] bg-white/80 px-2.5 py-2">
                        <label className="mb-1 block text-[10px] font-bold text-[#475569]">
                          יעד שעות עבודה בחודש (קלנדרי)
                        </label>
                        <div className="flex flex-wrap items-center gap-2">
                          <input
                            type="number"
                            min={0}
                            max={400}
                            step={0.5}
                            placeholder="למשל 182"
                            dir="ltr"
                            className="w-[88px] rounded-lg border border-[#E2E8F0] bg-white px-2 py-1 text-xs font-semibold text-[#0F172A]"
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
                          <span className="text-[10px] leading-snug text-[#64748B]">
                            שעות. ריק = ללא יעד. נשמר בלחיצה מחוץ לשדה.
                          </span>
                        </div>
                      </div>
                    ) : null}
                    {canManageAuth ? (
                      <form
                        className="mt-2 rounded-lg border border-dashed border-[#A7F3D0] bg-[#ECFDF5] px-2.5 py-2"
                        key={`sched-${u.id}-${u.scheduleDayStart ?? ''}-${u.scheduleDayEnd ?? ''}-${u.scheduleBreakMinutes ?? ''}`}
                        onSubmit={(e) => {
                          e.preventDefault()
                          const fd = new FormData(e.currentTarget)
                          const ds = String(fd.get('dayStart') ?? '')
                          const de = String(fd.get('dayEnd') ?? '')
                          const brRaw = String(fd.get('breakMin') ?? '30')
                          const br = Number(brRaw)
                          if (!ds || !de) return
                          if (!Number.isFinite(br) || br < 0) return
                          void updateUserDaySchedule(u.id, {
                            dayStart: ds,
                            dayEnd: de,
                            breakMinutes: br,
                          })
                        }}
                      >
                        <div className="mb-1 text-[10px] font-bold text-[#065F46]">
                          יום עבודה מקובל (כניסה/יציאה בזמן)
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[10px] text-[#047857]">מ־</span>
                          <input
                            name="dayStart"
                            type="time"
                            defaultValue={u.scheduleDayStart ?? '09:00'}
                            className="rounded-lg border border-[#A7F3D0] bg-white px-1.5 py-1 text-xs font-semibold text-[#0F172A]"
                          />
                          <span className="text-[10px] text-[#047857]">עד</span>
                          <input
                            name="dayEnd"
                            type="time"
                            defaultValue={u.scheduleDayEnd ?? '17:00'}
                            className="rounded-lg border border-[#A7F3D0] bg-white px-1.5 py-1 text-xs font-semibold text-[#0F172A]"
                          />
                          <span className="text-[10px] text-[#047857]">הפסקה</span>
                          <input
                            name="breakMin"
                            type="number"
                            min={0}
                            max={180}
                            step={5}
                            defaultValue={u.scheduleBreakMinutes ?? 30}
                            className="w-14 rounded-lg border border-[#A7F3D0] bg-white px-1.5 py-1 text-xs font-semibold text-[#0F172A]"
                          />
                          <span className="text-[10px] text-[#047857]">דק׳</span>
                          <button
                            type="submit"
                            className="rounded-lg bg-[#059669] px-2 py-1 text-[10px] font-bold text-white"
                          >
                            שמור מועדים
                          </button>
                          <button
                            type="button"
                            className="rounded-lg border border-[#6EE7B7] bg-white px-2 py-1 text-[10px] font-semibold text-[#065F46]"
                            onClick={() => void updateUserDaySchedule(u.id, null)}
                          >
                            נקה
                          </button>
                        </div>
                        <p className="mt-1 text-[9px] leading-snug text-[#047857]">
                          בדוח נוכחות יוצג האם העובד נכנס עד שעת ההתחלה (עם סבלנות קצרה) ויצא לא
                          לפני שעת הסיום.
                        </p>
                      </form>
                    ) : null}
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {isEditing ? (
                        <input
                          type="color"
                          value={draftColor}
                          onChange={(e) => setDraftColor(e.target.value)}
                          className="h-8 w-10 cursor-pointer rounded border border-[#E2E8F0] bg-white p-0.5"
                          aria-label="צבע אווטאר"
                        />
                      ) : null}
                      <select
                        value={r}
                        onChange={(e) => {
                          void updateRole(u, e.target.value as TeamRole)
                        }}
                        className="max-w-[140px] rounded-lg border border-[#E2E8F0] bg-white py-1.5 pl-2 pr-2 text-xs font-semibold text-[#1A2B5E]"
                      >
                        <option value="admin">{roleLabels.admin}</option>
                        <option value="employee">{roleLabels.employee}</option>
                      </select>
                      <div className="flex items-center gap-2" dir="ltr">
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
                        <span className="text-xs font-medium text-[#374151]" dir="rtl">
                          {active ? 'פעיל' : 'מושהה'}
                        </span>
                      </div>
                      {isEditing ? (
                        <>
                          <button
                            type="button"
                            onClick={() => void saveEdit(u)}
                            disabled={!draftName.trim()}
                            className="rounded-lg bg-[#2563EB] px-2.5 py-1.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            שמור
                          </button>
                          <button
                            type="button"
                            onClick={cancelEdit}
                            className="rounded-lg border border-[#CBD5E1] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#475569]"
                          >
                            ביטול
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() => startEdit(u)}
                          className="rounded-lg border border-[#CBD5E1] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#1E293B]"
                        >
                          עריכה
                        </button>
                      )}
                      {canManageAuth ? (
                        <>
                          <button
                            type="button"
                            onClick={() => void changeUserEmail(u)}
                            className="rounded-lg border border-[#BFDBFE] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#1D4ED8]"
                          >
                            אימייל
                          </button>
                          <button
                            type="button"
                            onClick={() => void changeUserPassword(u)}
                            className="rounded-lg border border-[#FBCFE8] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#BE185D]"
                          >
                            סיסמה
                          </button>
                        </>
                      ) : null}
                    </div>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <footer className="rounded-2xl border border-[#E2E8F0] bg-white px-4 py-3">
        <p className="text-center text-xs leading-relaxed text-[#64748B]">
          ניהול משתמשים מלא (כולל יצירה/אימייל/סיסמה) דורש Cloud Functions עם הרשאות Admin.
        </p>
      </footer>
    </div>
  )
}
