import { useMemo, useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useInvoices } from '../hooks/useInvoices'
import { useUsers } from '../hooks/useUsers'
import { useHubStore } from '../store/useStore'
import type { TeamMember } from '../types'
import { ToastHost } from './shared/Toast'
import { QuickTasksSlider } from './QuickTasksSlider'
import { TaskDrawer } from './TaskDrawer'
import { UserManagementSlider } from './UserManagementSlider'

const workspaceLinks = [
  { label: 'Drive', href: 'https://drive.google.com', dot: '#FCD34D' },
  { label: 'Gmail', href: 'https://mail.google.com', dot: '#FCA5A5' },
  { label: 'Calendar', href: 'https://calendar.google.com', dot: '#F97316' },
  { label: 'Meet', href: 'https://meet.google.com', dot: '#93C5FD' },
  { label: 'Docs', href: 'https://docs.google.com', dot: '#A78BFA' },
] as const

const navBase =
  'flex items-center gap-2.5 rounded-none px-5 py-3 text-base transition'

export function Layout() {
  const setSelectedClient = useHubStore((s) => s.setSelectedClient)
  const { users: teamMembers } = useUsers()
  const { invoices } = useInvoices()
  const overdueInvoiceCount = invoices.filter((i) => i.status === 'overdue').length
  const { user, signOutUser } = useAuth()
  const [userPanelOpen, setUserPanelOpen] = useState(false)

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

  return (
    <>
      <div
        dir="rtl"
        className="flex min-h-[100dvh] flex-col bg-[var(--bg-main)] md:h-screen md:flex-row"
      >
        <aside className="flex w-full shrink-0 flex-col border-b border-[rgba(255,255,255,0.1)] bg-[var(--bg-sidebar)] md:h-full md:w-[200px] md:border-b-0 md:border-l md:border-[rgba(255,255,255,0.1)]">
          <div className="flex flex-1 flex-col gap-6 p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--orange)] text-xl font-bold text-white">
                H
              </div>
              <div className="min-w-0">
                <div className="truncate text-lg font-bold leading-tight text-white">
                  האב
                </div>
                <div className="truncate text-[11px] text-[rgba(255,255,255,0.4)]">
                  מערכות מתקדמות
                </div>
              </div>
            </div>

            <nav className="flex flex-col gap-0.5">
              <NavLink
                to="/"
                end
                className={({ isActive }) =>
                  `${navBase} ${
                    isActive
                      ? 'border-r-[3px] border-[var(--orange)] bg-[rgba(255,255,255,0.12)] font-bold text-white'
                      : 'border-r-[3px] border-transparent text-[rgba(255,255,255,0.55)] hover:bg-[rgba(255,255,255,0.08)] hover:text-white'
                  }`
                }
              >
                <span
                  className="h-4 w-4 shrink-0 rounded bg-white/15"
                  aria-hidden
                />
                דשבורד
              </NavLink>
              <NavLink
                to="/projects"
                onClick={() => setSelectedClient(null)}
                className={({ isActive }) =>
                  `${navBase} ${
                    isActive
                      ? 'border-r-[3px] border-[var(--orange)] bg-[rgba(255,255,255,0.12)] font-bold text-white'
                      : 'border-r-[3px] border-transparent text-[rgba(255,255,255,0.55)] hover:bg-[rgba(255,255,255,0.08)] hover:text-white'
                  }`
                }
              >
                <span
                  className="h-4 w-4 shrink-0 rounded bg-white/15"
                  aria-hidden
                />
                פרויקטים
              </NavLink>
              <NavLink
                to="/clients"
                className={({ isActive }) =>
                  `${navBase} ${
                    isActive
                      ? 'border-r-[3px] border-[var(--orange)] bg-[rgba(255,255,255,0.12)] font-bold text-white'
                      : 'border-r-[3px] border-transparent text-[rgba(255,255,255,0.55)] hover:bg-[rgba(255,255,255,0.08)] hover:text-white'
                  }`
                }
              >
                <span
                  className="h-4 w-4 shrink-0 rounded bg-white/15"
                  aria-hidden
                />
                לקוחות
              </NavLink>
              <NavLink
                to="/collections"
                className={({ isActive }) =>
                  `${navBase} ${
                    isActive
                      ? 'border-r-[3px] border-[var(--orange)] bg-[rgba(255,255,255,0.12)] font-bold text-white'
                      : 'border-r-[3px] border-transparent text-[rgba(255,255,255,0.55)] hover:bg-[rgba(255,255,255,0.08)] hover:text-white'
                  }`
                }
              >
                <span
                  className="h-4 w-4 shrink-0 rounded bg-white/15"
                  aria-hidden
                />
                <span className="flex min-w-0 flex-1 items-center justify-between gap-2">
                  <span>גבייה 💰</span>
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
                      ? 'border-r-[3px] border-[var(--orange)] bg-[rgba(255,255,255,0.12)] font-bold text-white'
                      : 'border-r-[3px] border-transparent text-[rgba(255,255,255,0.55)] hover:bg-[rgba(255,255,255,0.08)] hover:text-white'
                  }`
                }
              >
                <span
                  className="h-4 w-4 shrink-0 rounded bg-white/15"
                  aria-hidden
                />
                ספקים
              </NavLink>
              <NavLink
                to="/tasks"
                className={({ isActive }) =>
                  `${navBase} ${
                    isActive
                      ? 'border-r-[3px] border-[var(--orange)] bg-[rgba(255,255,255,0.12)] font-bold text-white'
                      : 'border-r-[3px] border-transparent text-[rgba(255,255,255,0.55)] hover:bg-[rgba(255,255,255,0.08)] hover:text-white'
                  }`
                }
              >
                <span
                  className="h-4 w-4 shrink-0 rounded bg-white/15"
                  aria-hidden
                />
                משימות ✓
              </NavLink>

              <div className="my-2 border-t border-[rgba(255,255,255,0.1)]" />

              <button
                type="button"
                onClick={() => setUserPanelOpen(true)}
                className={`${navBase} w-full border-r-[3px] border-transparent text-right text-[rgba(255,255,255,0.55)] hover:bg-[rgba(255,255,255,0.08)] hover:text-white`}
              >
                <span
                  className="h-4 w-4 shrink-0 rounded bg-white/15"
                  aria-hidden
                />
                משתמשים
              </button>
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
                  {mainUser.role === 'superadmin'
                    ? 'מנהל על'
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

        <main className="relative min-h-0 flex-1 overflow-auto">
          <QuickTasksSlider />
          <TaskDrawer />
          <Outlet />
        </main>
      </div>
      <ToastHost />
      <UserManagementSlider
        isOpen={userPanelOpen}
        onClose={() => setUserPanelOpen(false)}
      />
    </>
  )
}
