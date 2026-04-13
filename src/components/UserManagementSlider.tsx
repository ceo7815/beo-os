import { useUsers } from '../hooks/useUsers'
import type { TeamMember } from '../types'

export interface UserManagementSliderProps {
  isOpen: boolean
  onClose: () => void
}

type TeamRole = 'superadmin' | 'employee'

const roleLabels: Record<TeamRole, string> = {
  superadmin: 'מנהל על',
  employee: 'עובד',
}

function toTeamRole(role: string): TeamRole {
  return role === 'superadmin' ? 'superadmin' : 'employee'
}

export function UserManagementSlider({ isOpen, onClose }: UserManagementSliderProps) {
  const { users: teamMembers, updateUserRole, toggleUserActive } = useUsers()

  const updateRole = async (u: TeamMember, role: TeamRole) => {
    await updateUserRole(u.id, role)
  }

  const toggleActive = async (u: TeamMember, active: boolean) => {
    await toggleUserActive(u.id, active)
  }

  return (
    <div
      className={`fixed inset-0 z-[90] transition-opacity duration-300 ${
        isOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
      }`}
      aria-hidden={!isOpen}
    >
      <button
        type="button"
        className="absolute inset-0 bg-[rgba(15,23,42,0.55)] backdrop-blur-[2px]"
        aria-label="סגור"
        onClick={onClose}
      />

      <aside
        dir="rtl"
        className={`absolute top-0 right-0 flex h-full w-full max-w-[420px] flex-col bg-white shadow-[-8px_0_32px_rgba(0,0,0,0.12)] transition-transform duration-300 ease-out ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
        style={{ fontFamily: 'Rubik, sans-serif' }}
      >
        <header className="flex shrink-0 items-center justify-between border-b border-[#E2E8F0] px-5 py-4">
          <h2 className="text-lg font-bold text-[#1A2B5E]">משתמשים</h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-[#94A3B8] transition hover:bg-[#F1F5F9] hover:text-[#0F172A]"
            aria-label="סגור"
          >
            ✕
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {teamMembers.length === 0 ? (
            <p className="text-center text-sm text-[#64748B]">
              אין משתמשים ב-Firestore. לאחר התחברות ראשונה נוצר פרופיל אוטומטית.
            </p>
          ) : (
            <ul className="space-y-3">
              {teamMembers.map((u) => {
                const r = toTeamRole(u.role)
                const active = u.active !== false
                return (
                  <li
                    key={u.id}
                    className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-3"
                  >
                    <div className="flex items-start gap-3">
                      <span
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[11px] font-bold leading-tight text-white"
                        style={{ backgroundColor: u.color }}
                      >
                        {u.avatar}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-[#0F172A]">{u.name}</div>
                        <div
                          className="truncate text-xs text-[#64748B] ltr text-left"
                          dir="ltr"
                        >
                          {u.email ?? '—'}
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <select
                            value={r}
                            onChange={(e) => {
                              void updateRole(u, e.target.value as TeamRole)
                            }}
                            className="max-w-[140px] rounded-lg border border-[#E2E8F0] bg-white py-1.5 pl-2 pr-2 text-xs font-semibold text-[#1A2B5E]"
                          >
                            <option value="superadmin">
                              {roleLabels.superadmin}
                            </option>
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
                            <span
                              className="text-xs font-medium text-[#374151]"
                              dir="rtl"
                            >
                              {active ? 'פעיל' : 'מושהה'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <div className="shrink-0 border-t border-[#E2E8F0] bg-white p-4">
          <p className="text-center text-xs leading-relaxed text-[#64748B]">
            משתמשים נוצרים בהתחברות ראשונה (Firebase Auth). ניתן לערוך כאן תפקיד
            וסטטוס — השינויים נשמרים ב-Firestore.
          </p>
        </div>
      </aside>
    </div>
  )
}
