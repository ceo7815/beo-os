import { useMemo, type ReactNode } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useInvoices } from '../hooks/useInvoices'
import { useUsers } from '../hooks/useUsers'
import { useHubStore } from '../store/useStore'
import type { TeamMember } from '../types'
import { HubRealtimeBubbleHost } from './HubRealtimeBubbleHost'
import { ToastHost } from './shared/Toast'
import { QuickActionsFloat } from './QuickActionsFloat'
import { QuickTasksSlider } from './QuickTasksSlider'
import { TaskDrawer } from './TaskDrawer'
import { isAdminRole } from './RequireAdmin'

const workspaceLinks = [
  { label: 'Drive', href: 'https://drive.google.com', dot: '#FCD34D' },
  { label: 'Gmail', href: 'https://mail.google.com', dot: '#FCA5A5' },
  { label: 'Calendar', href: 'https://calendar.google.com', dot: '#F97316' },
  { label: 'Meet', href: 'https://meet.google.com', dot: '#93C5FD' },
  { label: 'Docs', href: 'https://docs.google.com', dot: '#A78BFA' },
] as const

const LAYOUT_LOGO_SRC = `${import.meta.env.BASE_URL}logo-hub-pos.png?v=3`

const navBase =
  'flex items-center gap-2.5 rounded-none px-5 py-3 text-base transition'

const navIconClass =
  'h-[17px] w-[17px] shrink-0 text-current opacity-90 [&>svg]:h-full [&>svg]:w-full'

/** אייקוני קו דקים — ללא אימוג'י, מתאימים ל־RTL */
function NavGlyph({ children }: { children: ReactNode }) {
  return (
    <span className={navIconClass} aria-hidden>
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.65}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {children}
      </svg>
    </span>
  )
}

export function Layout() {
  const setSelectedClient = useHubStore((s) => s.setSelectedClient)
  const { users: teamMembers } = useUsers()
  const { invoices } = useInvoices()
  const overdueInvoiceCount = invoices.filter((i) => i.status === 'overdue').length
  const { user, signOutUser } = useAuth()

  const mainUser: TeamMember = useMemo(() => {
    if (!user) {
      return {
        id: '',
        name: 'משתמש',
        avatar: '?',
        color: '#2563EB',
        role: '',
      }
    }
    const fromFs = teamMembers.find((m) => m.id === user.uid)
    if (fromFs) return fromFs
    const name =
      user.displayName?.trim() ||
      user.email?.split('@')[0] ||
      'משתמש'
    return {
      id: user.uid,
      name,
      email: user.email ?? undefined,
      avatar: name.slice(0, 2),
      color: '#2563EB',
      role: 'מחובר',
    }
  }, [user, teamMembers])

  const showUsersNav = isAdminRole(mainUser.role)

  return (
    <>
      <div
        dir="rtl"
        className="flex min-h-[100dvh] flex-col bg-[var(--bg-main)] md:h-[100dvh] md:flex-row md:overflow-hidden"
      >
        <aside className="flex w-full shrink-0 flex-col border-b border-[rgba(255,255,255,0.08)] bg-[#454545] md:h-full md:w-[220px] md:overflow-y-auto md:border-b-0 md:border-l md:border-[rgba(255,255,255,0.08)]">
          <div className="flex flex-1 flex-col gap-5 p-4">
            <div className="border-b border-white/10 pb-4">
              <img
                src={LAYOUT_LOGO_SRC}
                alt="Hub-Pos"
                className="mx-auto h-auto w-full max-w-[196px] select-none object-contain"
                width={196}
                height={72}
                decoding="async"
              />
              <p className="mt-3 text-center text-[11px] font-semibold text-white/55">
                שם ארגון:
              </p>
              <p className="mt-1 text-center text-[14px] font-bold leading-snug text-[#F97316]">
                האב מערכות מתקדמות
              </p>
            </div>

            <nav className="flex flex-col gap-0.5">
              <NavLink
                to="/"
                end
                className={({ isActive }) =>
                  `${navBase} ${
                    isActive
                      ? 'border-r-[3px] border-[var(--orange)] bg-black/25 font-bold text-[#F97316]'
                      : 'border-r-[3px] border-transparent text-white/55 hover:bg-white/[0.06] hover:text-white'
                  }`
                }
              >
                <NavGlyph>
                  <rect x="3" y="3" width="7" height="7" rx="1.2" />
                  <rect x="14" y="3" width="7" height="7" rx="1.2" />
                  <rect x="3" y="14" width="7" height="7" rx="1.2" />
                  <rect x="14" y="14" width="7" height="7" rx="1.2" />
                </NavGlyph>
                דשבורד
              </NavLink>
              <NavLink
                to="/projects"
                onClick={() => setSelectedClient(null)}
                className={({ isActive }) =>
                  `${navBase} ${
                    isActive
                      ? 'border-r-[3px] border-[var(--orange)] bg-black/25 font-bold text-[#F97316]'
                      : 'border-r-[3px] border-transparent text-white/55 hover:bg-white/[0.06] hover:text-white'
                  }`
                }
              >
                <NavGlyph>
                  <path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                </NavGlyph>
                פרויקטים
              </NavLink>
              <NavLink
                to="/campaigns"
                className={({ isActive }) =>
                  `${navBase} ${
                    isActive
                      ? 'border-r-[3px] border-[var(--orange)] bg-black/25 font-bold text-[#F97316]'
                      : 'border-r-[3px] border-transparent text-white/55 hover:bg-white/[0.06] hover:text-white'
                  }`
                }
              >
                <NavGlyph>
                  <path d="M4 19V5M4 19h16M8 19v-6m4 6V8m4 11v-9m4 9v-4" />
                </NavGlyph>
                קמפיינים
              </NavLink>
              <NavLink
                to="/leads"
                className={({ isActive }) =>
                  `${navBase} ${
                    isActive
                      ? 'border-r-[3px] border-[var(--orange)] bg-black/25 font-bold text-[#F97316]'
                      : 'border-r-[3px] border-transparent text-white/55 hover:bg-white/[0.06] hover:text-white'
                  }`
                }
              >
                <NavGlyph>
                  <path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M19 8v6M22 11h-6" />
                </NavGlyph>
                לידים
              </NavLink>
              <NavLink
                to="/clients"
                className={({ isActive }) =>
                  `${navBase} ${
                    isActive
                      ? 'border-r-[3px] border-[var(--orange)] bg-black/25 font-bold text-[#F97316]'
                      : 'border-r-[3px] border-transparent text-white/55 hover:bg-white/[0.06] hover:text-white'
                  }`
                }
              >
                <NavGlyph>
                  <path d="M3 21h18M6 21V10l6-3 6 3v11M9 10v11M9 7l3-1.5L15 7" />
                </NavGlyph>
                לקוחות
              </NavLink>
              <NavLink
                to="/collections"
                className={({ isActive }) =>
                  `${navBase} ${
                    isActive
                      ? 'border-r-[3px] border-[var(--orange)] bg-black/25 font-bold text-[#F97316]'
                      : 'border-r-[3px] border-transparent text-white/55 hover:bg-white/[0.06] hover:text-white'
                  }`
                }
              >
                <NavGlyph>
                  <path d="M9 12h6m-6 4h4m8 2V7l-5-5H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2z" />
                  <path d="M14 3v4a2 2 0 002 2h4" />
                </NavGlyph>
                <span className="flex min-w-0 flex-1 items-center justify-between gap-2">
                  <span>גבייה</span>
                  {overdueInvoiceCount > 0 ? (
                    <span className="flex h-5 min-w-[20px] shrink-0 items-center justify-center rounded-full bg-[#EF4444] px-1.5 text-[10px] font-bold text-white">
                      {overdueInvoiceCount > 99 ? '99+' : overdueInvoiceCount}
                    </span>
                  ) : null}
                </span>
              </NavLink>
              <NavLink
                to="/suppliers"
                className={({ isActive }) =>
                  `${navBase} ${
                    isActive
                      ? 'border-r-[3px] border-[var(--orange)] bg-black/25 font-bold text-[#F97316]'
                      : 'border-r-[3px] border-transparent text-white/55 hover:bg-white/[0.06] hover:text-white'
                  }`
                }
              >
                <NavGlyph>
                  <path d="M1 4h15v11H1zM16 9h3l4 4v6h-7V9zM5 19a2.5 2.5 0 100 5 2.5 2.5 0 000-5zM17 19a2.5 2.5 0 100 5 2.5 2.5 0 000-5z" />
                </NavGlyph>
                ספקים
              </NavLink>
              <NavLink
                to="/hosting"
                className={({ isActive }) =>
                  `${navBase} ${
                    isActive
                      ? 'border-r-[3px] border-[var(--orange)] bg-black/25 font-bold text-[#F97316]'
                      : 'border-r-[3px] border-transparent text-white/55 hover:bg-white/[0.06] hover:text-white'
                  }`
                }
              >
                <NavGlyph>
                  <rect x="3" y="4" width="18" height="6" rx="1.2" />
                  <rect x="3" y="14" width="18" height="6" rx="1.2" />
                  <path d="M7 7h.01M7 17h.01M11 7h6M11 17h6" />
                </NavGlyph>
                אחסון ודומיינים
              </NavLink>
              <NavLink
                to="/tasks"
                className={({ isActive }) =>
                  `${navBase} ${
                    isActive
                      ? 'border-r-[3px] border-[var(--orange)] bg-black/25 font-bold text-[#F97316]'
                      : 'border-r-[3px] border-transparent text-white/55 hover:bg-white/[0.06] hover:text-white'
                  }`
                }
              >
                <NavGlyph>
                  <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" />
                  <path d="M9 5a2 2 0 012-2h2a2 2 0 012 2M9 12l2 2 4-4" />
                </NavGlyph>
                משימות
              </NavLink>
              <NavLink
                to="/attendance"
                className={({ isActive }) =>
                  `${navBase} ${
                    isActive
                      ? 'border-r-[3px] border-[var(--orange)] bg-black/25 font-bold text-[#F97316]'
                      : 'border-r-[3px] border-transparent text-white/55 hover:bg-white/[0.06] hover:text-white'
                  }`
                }
              >
                <NavGlyph>
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 7v6l4 2" />
                </NavGlyph>
                נוכחות
              </NavLink>

              <NavLink
                to="/vault"
                className={({ isActive }) =>
                  `${navBase} ${
                    isActive
                      ? 'border-r-[3px] border-[var(--orange)] bg-black/25 font-bold text-[#F97316]'
                      : 'border-r-[3px] border-transparent text-white/55 hover:bg-white/[0.06] hover:text-white'
                  }`
                }
              >
                <NavGlyph>
                  <path d="M7 11V7a5 5 0 0110 0v4M6 11h12v10a1 1 0 01-1 1H7a1 1 0 01-1-1V11z" />
                  <circle cx="12" cy="16" r="1.5" fill="currentColor" stroke="none" />
                </NavGlyph>
                כספת סיסמאות
              </NavLink>

              {showUsersNav ? (
                <>
                  <div className="my-2 border-t border-[rgba(255,255,255,0.1)]" />

                  <NavLink
                    to="/users"
                    className={({ isActive }) =>
                      `${navBase} ${
                        isActive
                          ? 'border-r-[3px] border-[var(--orange)] bg-black/25 font-bold text-[#F97316]'
                          : 'border-r-[3px] border-transparent text-white/55 hover:bg-white/[0.06] hover:text-white'
                      }`
                    }
                  >
                    <NavGlyph>
                      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
                      <circle cx="9" cy="7" r="4" />
                      <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
                    </NavGlyph>
                    משתמשים
                  </NavLink>
                </>
              ) : null}
            </nav>

            <div className="mt-auto space-y-2 border-t border-[rgba(255,255,255,0.1)] pt-4">
              <p className="text-[9px] font-semibold uppercase tracking-[2px] text-[rgba(255,255,255,0.3)]">
                GOOGLE WORKSPACE
              </p>
              <ul className="space-y-2">
                {workspaceLinks.map((l) => (
                  <li key={l.label}>
                    <a
                      href={l.href}
                      target="_blank"
                      rel="noreferrer"
                      className="group flex items-center gap-2 text-[12px] text-[rgba(255,255,255,0.55)] transition hover:text-white"
                    >
                      <span
                        className="h-1.5 w-1.5 shrink-0 rounded-full transition group-hover:brightness-125 group-hover:drop-shadow-[0_0_6px_rgba(255,255,255,0.9)]"
                        style={{ backgroundColor: l.dot }}
                      />
                      {l.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="flex flex-col gap-2 border-t border-[rgba(255,255,255,0.1)] p-4">
            <div className="flex items-center gap-2">
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                style={{
                  backgroundColor: `${mainUser.color}44`,
                  border: `1.5px solid ${mainUser.color}`,
                }}
              >
                {mainUser.avatar}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-white">
                  {mainUser.name}
                </div>
                <div className="truncate text-[11px] text-[rgba(255,255,255,0.4)]">
                  {mainUser.role === 'admin' || mainUser.role === 'superadmin'
                    ? 'מנהל מערכת'
                    : mainUser.role === 'employee'
                      ? 'עובד'
                      : mainUser.role || mainUser.email || ''}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => void signOutUser()}
              className="w-full rounded-lg border border-white/20 py-1.5 text-center text-xs font-semibold text-white/80 transition hover:bg-white/10 hover:text-white"
            >
              התנתק
            </button>
          </div>
        </aside>

        <main className="relative min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
          <QuickActionsFloat />
          <QuickTasksSlider />
          <TaskDrawer />
          <Outlet />
        </main>
      </div>
      <ToastHost />
      <HubRealtimeBubbleHost />
    </>
  )
}
