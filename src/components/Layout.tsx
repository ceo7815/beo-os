import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useInvoices } from '../hooks/useInvoices'
import { useUsers } from '../hooks/useUsers'
import { useHubStore } from '../store/useStore'
import type { TeamMember } from '../types'
import { HubRealtimeBubbleHost } from './HubRealtimeBubbleHost'
import { ToastHost } from './shared/Toast'
import { QuickActionsFloat } from './QuickActionsFloat'
import { QuickCalendarSlider } from './QuickCalendarSlider'
import { QuickTasksSlider } from './QuickTasksSlider'
import { MeetingDrawer } from './MeetingDrawer'
import { TaskDrawer } from './TaskDrawer'
import { userIsAdmin } from './RequireAdmin'

const workspaceLinks = [
  { label: 'Drive', href: 'https://drive.google.com', dot: '#FCD34D' },
  { label: 'Gmail', href: 'https://mail.google.com', dot: '#FCA5A5' },
  { label: 'Calendar', href: 'https://calendar.google.com', dot: '#F97316' },
  { label: 'Meet', href: 'https://meet.google.com', dot: '#93C5FD' },
  { label: 'Docs', href: 'https://docs.google.com', dot: '#A78BFA' },
] as const

const LAYOUT_LOGO_SRC = `${import.meta.env.BASE_URL}logo-hub-pos.png?v=3`

const navBase =
  'flex items-center gap-2.5 rounded-lg px-4 py-2.5 text-[15px] transition'

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

function navSubLinkClass(isActive: boolean, nested = false): string {
  return [
    'flex min-h-[34px] w-full items-center rounded-md text-[13px] leading-snug transition',
    nested ? 'pe-2 ps-5' : 'px-3 py-1.5',
    isActive
      ? 'bg-white/10 font-semibold text-[#F97316]'
      : 'font-medium text-white/65 hover:bg-white/[0.06] hover:text-white/90',
  ].join(' ')
}

function NavSubSectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="px-2 pb-0.5 pt-2 text-[10px] font-semibold tracking-wide text-white/35 first:pt-1">
      {children}
    </p>
  )
}

function NavSubPanel({ children }: { children: ReactNode }) {
  return (
    <div className="border-t border-white/[0.08] px-2 pb-2 pt-2">
      <div className="rounded-lg bg-black/20 p-1.5">
        {children}
      </div>
    </div>
  )
}

function NavExpandChevron({ open }: { open: boolean }) {
  return (
    <span
      className={`ms-auto shrink-0 text-white/45 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
      aria-hidden
    >
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  )
}

function NavExpandableGroup({
  label,
  icon,
  isSectionActive,
  open,
  onToggle,
  children,
}: {
  label: string
  icon: ReactNode
  isSectionActive: boolean
  open: boolean
  onToggle: () => void
  children: ReactNode
}) {
  const highlighted = open || isSectionActive
  return (
    <div
      className={`flex flex-col overflow-hidden rounded-lg transition-[background] duration-200 ${
        highlighted ? 'bg-white/[0.07]' : ''
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className={`${navBase} w-full text-right ${
          highlighted
            ? 'bg-white/10 font-semibold text-[#F97316]'
            : 'font-medium text-white/60 hover:bg-white/[0.06] hover:text-white/90'
        }`}
      >
        {icon}
        <span className="min-w-0 flex-1 truncate">{label}</span>
        <NavExpandChevron open={open} />
      </button>
      {open ? <NavSubPanel>{children}</NavSubPanel> : null}
    </div>
  )
}

function NavSubLink({
  to,
  label,
  end,
  nested,
  onClick,
  badge,
}: {
  to: string
  label: string
  end?: boolean
  nested?: boolean
  onClick?: () => void
  badge?: ReactNode
}) {
  return (
    <NavLink to={to} end={end} onClick={onClick} className={({ isActive }) => navSubLinkClass(isActive, nested)}>
      <span className="flex w-full min-w-0 items-center justify-between gap-2">
        <span className="truncate">{label}</span>
        {badge}
      </span>
    </NavLink>
  )
}

export function Layout() {
  const location = useLocation()
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const setSelectedClient = useHubStore((s) => s.setSelectedClient)
  const { users: teamMembers } = useUsers()
  const hubUser = useHubStore((s) => s.currentUser)
  const { invoices } = useInvoices()
  const overdueInvoiceCount = invoices.filter((i) => i.status === 'overdue').length
  const { user, signOutUser } = useAuth()

  const financeNavActive =
    location.pathname.startsWith('/finance') ||
    location.pathname.startsWith('/collections')
  const operationsNavActive =
    location.pathname.startsWith('/projects') ||
    location.pathname.startsWith('/campaigns') ||
    location.pathname.startsWith('/leads') ||
    location.pathname.startsWith('/tasks') ||
    location.pathname.startsWith('/hourly-services') ||
    location.pathname.startsWith('/calendar') ||
    location.pathname.startsWith('/prompts') ||
    location.pathname.startsWith('/hosting')

  const [operationsOpen, setOperationsOpen] = useState(operationsNavActive)
  const [financeOpen, setFinanceOpen] = useState(financeNavActive)

  useEffect(() => {
    if (operationsNavActive) setOperationsOpen(true)
  }, [operationsNavActive])

  useEffect(() => {
    if (financeNavActive) setFinanceOpen(true)
  }, [financeNavActive])

  useEffect(() => {
    setMobileNavOpen(false)
  }, [location.pathname])

  useEffect(() => {
    if (!mobileNavOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileNavOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [mobileNavOpen])

  useEffect(() => {
    if (!mobileNavOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [mobileNavOpen])

  const closeMobileNav = () => setMobileNavOpen(false)

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

  const showAdminNav = userIsAdmin(user?.uid, teamMembers, hubUser)
  const showFinanceNav = showAdminNav

  return (
    <>
      <div
        dir="rtl"
        className="flex min-h-[100dvh] flex-col bg-[var(--bg-main)] md:h-[100dvh] md:flex-row md:overflow-hidden"
      >
        <header
          className="sticky top-0 z-[45] flex shrink-0 items-center gap-3 border-b border-white/10 bg-[var(--bg-sidebar)] px-3 py-2.5 shadow-sm md:hidden"
          style={{ paddingTop: 'max(0.5rem, env(safe-area-inset-top, 0px))' }}
        >
          <button
            type="button"
            onClick={() => setMobileNavOpen(true)}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/15 bg-white/5 text-white transition hover:bg-white/10 active:scale-[0.98]"
            aria-label="פתח תפריט ניווט"
            aria-expanded={mobileNavOpen}
            aria-controls="app-sidebar"
          >
            <span className="sr-only">פתח תפריט</span>
            <svg
              viewBox="0 0 24 24"
              className="h-6 w-6"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              aria-hidden
            >
              <path d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          </button>
          <img
            src={LAYOUT_LOGO_SRC}
            alt=""
            className="h-9 w-auto max-w-[140px] select-none object-contain opacity-95"
            width={140}
            height={36}
            decoding="async"
          />
          <span className="min-w-0 flex-1 truncate text-left text-xs font-semibold text-white/50">
            האב מערכות מתקדמות
          </span>
        </header>

        {mobileNavOpen ? (
          <button
            type="button"
            className="fixed inset-0 z-[57] cursor-default border-0 bg-black/50 p-0 md:hidden"
            aria-label="סגור תפריט ניווט"
            onClick={closeMobileNav}
          />
        ) : null}

        <aside
          id="app-sidebar"
          role="navigation"
          aria-label="ניווט ראשי"
          className={`flex flex-col bg-[var(--bg-sidebar)] transition-transform duration-200 ease-out max-md:fixed max-md:inset-y-0 max-md:right-0 max-md:z-[58] max-md:h-[100dvh] max-md:w-[min(100vw-0.75rem,300px)] max-md:overflow-y-auto max-md:border-l max-md:border-white/[0.08] max-md:shadow-[-8px_0_32px_rgba(0,0,0,0.25)] md:static md:z-auto md:h-full md:w-[220px] md:shrink-0 md:translate-x-0 md:overflow-y-auto md:border-b-0 md:border-l md:border-white/[0.08] md:shadow-[-4px_0_24px_rgba(0,0,0,0.06)] ${
            mobileNavOpen ? 'max-md:translate-x-0' : 'max-md:pointer-events-none max-md:translate-x-full'
          }`}
          style={{
            paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom, 0px))',
            paddingTop: 'max(0px, env(safe-area-inset-top, 0px))',
          }}
          onClick={(e) => {
            const t = e.target as HTMLElement
            if (t.closest('a[href]')) closeMobileNav()
          }}
        >
          <div className="flex flex-1 flex-col gap-5 p-4">
            <div className="relative border-b border-white/10 pb-4">
              <button
                type="button"
                onClick={closeMobileNav}
                className="absolute left-0 top-0 flex h-9 w-9 items-center justify-center rounded-lg border border-white/15 text-lg font-light leading-none text-white/80 transition hover:bg-white/10 md:hidden"
                aria-label="סגור תפריט"
              >
                ×
              </button>
              <img
                src={LAYOUT_LOGO_SRC}
                alt="Hub-Pos"
                className="mx-auto h-auto w-full max-w-[196px] select-none object-contain max-md:pt-1"
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
                      ? 'bg-white/10 font-semibold text-[#F97316]'
                      : 'font-medium text-white/60 hover:bg-white/[0.06] hover:text-white/90'
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
              <NavExpandableGroup
                label="ניהול שוטף"
                isSectionActive={operationsNavActive}
                open={operationsOpen}
                onToggle={() => setOperationsOpen((v) => !v)}
                icon={
                  <NavGlyph>
                    <path d="M12 3v3M12 18v3M3 12h3M18 12h3" />
                    <circle cx="12" cy="12" r="4" />
                    <path d="M12 8v8M8 12h8" />
                  </NavGlyph>
                }
              >
                <NavSubSectionLabel>מכירות ולקוחות</NavSubSectionLabel>
                <NavSubLink to="/campaigns" label="קמפיינים" />
                <NavSubLink to="/leads" label="לידים" />

                <NavSubSectionLabel>פרויקטים וביצוע</NavSubSectionLabel>
                <NavSubLink
                  to="/projects"
                  label="פרויקטים"
                  onClick={() => setSelectedClient(null)}
                />
                <NavSubLink to="/tasks" label="משימות" />
                <NavSubLink to="/hourly-services" label="שירותי שעות" />
                <NavSubLink to="/hosting" label="אחסון ודומיינים" />

                <NavSubSectionLabel>יומן וכלים</NavSubSectionLabel>
                <NavSubLink to="/calendar" label="יומן" end />
                <NavSubLink to="/calendar/summaries" label="סיכומי פגישות" />
                <NavSubLink to="/prompts" label="ספריית פרומפטים" />
              </NavExpandableGroup>
              <NavLink
                to="/clients"
                className={({ isActive }) =>
                  `${navBase} ${
                    isActive
                      ? 'bg-white/10 font-semibold text-[#F97316]'
                      : 'font-medium text-white/60 hover:bg-white/[0.06] hover:text-white/90'
                  }`
                }
              >
                <NavGlyph>
                  <path d="M3 21h18M6 21V10l6-3 6 3v11M9 10v11M9 7l3-1.5L15 7" />
                </NavGlyph>
                לקוחות
              </NavLink>
              <NavLink
                to="/suppliers"
                className={({ isActive }) =>
                  `${navBase} ${
                    isActive
                      ? 'bg-white/10 font-semibold text-[#F97316]'
                      : 'font-medium text-white/60 hover:bg-white/[0.06] hover:text-white/90'
                  }`
                }
              >
                <NavGlyph>
                  <path d="M1 4h15v11H1zM16 9h3l4 4v6h-7V9zM5 19a2.5 2.5 0 100 5 2.5 2.5 0 000-5zM17 19a2.5 2.5 0 100 5 2.5 2.5 0 000-5z" />
                </NavGlyph>
                ספקים
              </NavLink>
              {showFinanceNav ? (
                <NavExpandableGroup
                  label="פיננסים"
                  isSectionActive={financeNavActive}
                  open={financeOpen}
                  onToggle={() => setFinanceOpen((v) => !v)}
                  icon={
                    <NavGlyph>
                      <path d="M21.21 15.89A10 10 0 118 2.83" />
                      <path d="M22 12A10 10 0 0012 2v10z" />
                    </NavGlyph>
                  }
                >
                  <NavSubLink to="/finance" label="סקירה פיננסית" />
                  <NavSubLink to="/finance/income" label="הכנסות" />
                  <NavSubLink to="/finance/expenses" label="הוצאות" />
                  <NavSubLink to="/finance/projects" label="פרויקטים" />
                  <NavSubLink
                    to="/collections"
                    label="גבייה"
                    badge={
                      overdueInvoiceCount > 0 ? (
                        <span className="flex h-5 min-w-[20px] shrink-0 items-center justify-center rounded-full bg-[#EF4444] px-1.5 text-[10px] font-bold text-white">
                          {overdueInvoiceCount > 99 ? '99+' : overdueInvoiceCount}
                        </span>
                      ) : undefined
                    }
                  />
                </NavExpandableGroup>
              ) : (
                <NavLink
                  to="/collections"
                  className={({ isActive }) =>
                    `${navBase} ${
                      isActive
                        ? 'bg-white/10 font-semibold text-[#F97316]'
                        : 'font-medium text-white/60 hover:bg-white/[0.06] hover:text-white/90'
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
              )}
              <NavLink
                to="/attendance"
                className={({ isActive }) =>
                  `${navBase} ${
                    isActive
                      ? 'bg-white/10 font-semibold text-[#F97316]'
                      : 'font-medium text-white/60 hover:bg-white/[0.06] hover:text-white/90'
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
                      ? 'bg-white/10 font-semibold text-[#F97316]'
                      : 'font-medium text-white/60 hover:bg-white/[0.06] hover:text-white/90'
                  }`
                }
              >
                <NavGlyph>
                  <path d="M7 11V7a5 5 0 0110 0v4M6 11h12v10a1 1 0 01-1 1H7a1 1 0 01-1-1V11z" />
                  <circle cx="12" cy="16" r="1.5" fill="currentColor" stroke="none" />
                </NavGlyph>
                כספת סיסמאות
              </NavLink>

              {showAdminNav ? (
                <>
                  <div className="my-2 border-t border-[rgba(255,255,255,0.1)]" />

                  <NavLink
                    to="/users"
                    className={({ isActive }) =>
                      `${navBase} ${
                        isActive
                          ? 'bg-white/10 font-semibold text-[#F97316]'
                          : 'font-medium text-white/60 hover:bg-white/[0.06] hover:text-white/90'
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
                  <NavLink
                    to="/agents"
                    className={({ isActive }) =>
                      `${navBase} ${
                        isActive
                          ? 'bg-white/10 font-semibold text-[#F97316]'
                          : 'font-medium text-white/60 hover:bg-white/[0.06] hover:text-white/90'
                      }`
                    }
                  >
                    <NavGlyph>
                      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
                      <circle cx="9" cy="7" r="4" />
                      <path d="M23 21v-2a4 4 0 00-3-3.87" />
                    </NavGlyph>
                    סוכני מכירות
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

        <main className="relative min-h-0 w-full min-w-0 flex-1 overflow-y-auto overflow-x-hidden bg-[var(--bg-main)]">
          <QuickActionsFloat />
          <QuickTasksSlider />
          <QuickCalendarSlider />
          <TaskDrawer />
          <MeetingDrawer />
          <Outlet />
        </main>
      </div>
      <ToastHost />
      <HubRealtimeBubbleHost />
    </>
  )
}
