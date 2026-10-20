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
import { QuickTasksSlider } from './QuickTasksSlider'
import { TaskDrawer } from './TaskDrawer'
import { CommandPalette } from './CommandPalette'
import { userIsAdmin } from './RequireAdmin'
import { BRAND, brandLogoAlt, brandLogoSrc } from '../lib/brand'
import { AI_AGENT_BOARDS } from '../lib/aiAgentsRegistry'
import { getAgentProfile } from '../lib/aiAgentProfiles'
import { useAiAgentsFleet } from '../hooks/useAiAgentsFleet'

const workspaceLinks = [
  { label: 'Drive', href: 'https://drive.google.com', dot: '#FCD34D' },
  { label: 'Gmail', href: 'https://mail.google.com', dot: '#FCA5A5' },
  { label: 'Calendar', href: 'https://calendar.google.com', dot: '#F97316' },
  { label: 'Meet', href: 'https://meet.google.com', dot: '#93C5FD' },
  { label: 'Docs', href: 'https://docs.google.com', dot: '#A78BFA' },
] as const

const LAYOUT_LOGO_SRC = `${brandLogoSrc()}?v=4`

const navBase = 'beo-nav-item'

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
    'beo-nav-sub',
    nested ? 'pe-2 ps-5' : '',
    isActive ? 'is-active' : '',
  ]
    .filter(Boolean)
    .join(' ')
}

function NavSubSectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="beo-nav-label first:pt-1">
      {children}
    </p>
  )
}

function NavSubPanel({ children }: { children: ReactNode }) {
  return (
    <div className="beo-nav-subpanel">
      <div className="beo-nav-subpanel-inner">{children}</div>
    </div>
  )
}

function NavExpandChevron({ open }: { open: boolean }) {
  return (
    <span
      className={`ms-auto shrink-0 text-current opacity-70 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
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
  return (
    <div
      className={`beo-nav-group flex flex-col overflow-hidden ${
        open || isSectionActive ? 'is-open' : ''
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className={`${navBase} w-full text-right ${isSectionActive ? 'is-active' : ''}`}
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
    location.pathname.startsWith('/collections') ||
    location.pathname.startsWith('/clients') ||
    location.pathname.startsWith('/suppliers')
  const operationsNavActive =
    location.pathname.startsWith('/projects') ||
    location.pathname.startsWith('/campaigns') ||
    location.pathname.startsWith('/leads') ||
    location.pathname.startsWith('/pipeline') ||
    location.pathname.startsWith('/receivables') ||
    location.pathname.startsWith('/tasks') ||
    location.pathname.startsWith('/hourly-services') ||
    location.pathname.startsWith('/prompts')
  const aiAgentsNavActive = location.pathname.startsWith('/ai-agents')

  const [operationsOpen, setOperationsOpen] = useState(operationsNavActive)
  const [financeOpen, setFinanceOpen] = useState(financeNavActive)
  const [aiAgentsOpen, setAiAgentsOpen] = useState(aiAgentsNavActive)

  useEffect(() => {
    if (operationsNavActive) setOperationsOpen(true)
  }, [operationsNavActive])

  useEffect(() => {
    if (financeNavActive) setFinanceOpen(true)
  }, [financeNavActive])

  useEffect(() => {
    if (aiAgentsNavActive) setAiAgentsOpen(true)
  }, [aiAgentsNavActive])

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
  const { fleet, fleetUp } = useAiAgentsFleet(showAdminNav)

  return (
    <>
      <div
        dir="rtl"
        className="flex min-h-[100dvh] flex-col bg-[var(--bg-main)] md:h-[100dvh] md:flex-row md:overflow-hidden"
      >
        <header
          className="beo-sidebar sticky top-0 z-[45] flex shrink-0 items-center gap-3 border-b px-3 py-2.5 md:hidden"
          style={{ paddingTop: 'max(0.5rem, env(safe-area-inset-top, 0px))' }}
        >
          <button
            type="button"
            onClick={() => setMobileNavOpen(true)}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[var(--sidebar-border)] bg-[var(--surface-muted)] text-[var(--text-dark)] transition hover:bg-[var(--sidebar-hover)] active:scale-[0.98]"
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
            className="h-8 w-auto max-w-[120px] select-none object-contain"
            width={120}
            height={32}
            decoding="async"
          />
          <span className="min-w-0 flex-1 truncate text-left text-xs font-semibold text-[var(--sidebar-muted)]">
            {BRAND.companyName}
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
          className={`beo-sidebar flex flex-col border-[var(--sidebar-border)] transition-transform duration-200 ease-out max-md:fixed max-md:inset-y-0 max-md:right-0 max-md:z-[58] max-md:h-[100dvh] max-md:w-[min(100vw-0.75rem,300px)] max-md:overflow-y-auto max-md:border-l max-md:shadow-[-12px_0_32px_rgba(20,18,24,0.12)] md:static md:z-auto md:h-full md:w-[248px] md:shrink-0 md:translate-x-0 md:overflow-y-auto md:border-b-0 md:border-l ${
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
            <div className="relative border-b border-[var(--sidebar-border)] pb-4">
              <button
                type="button"
                onClick={closeMobileNav}
                className="absolute left-0 top-0 flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--sidebar-border)] text-lg font-light leading-none text-[var(--sidebar-text)] transition hover:bg-[var(--sidebar-hover)] md:hidden"
                aria-label="סגור תפריט"
              >
                ×
              </button>
              <img
                src={LAYOUT_LOGO_SRC}
                alt={brandLogoAlt()}
                className="mx-auto h-auto w-full max-w-[168px] select-none object-contain"
                width={168}
                height={62}
                decoding="async"
              />
              <p className="mt-2 text-center text-[11px] font-semibold tracking-wide text-[var(--sidebar-muted)]">
                {BRAND.tagline}
              </p>
            </div>

            <nav className="flex flex-col gap-0.5">
              <NavLink
                to="/"
                end
                className={({ isActive }) =>
                  `${navBase} ${isActive ? 'is-active' : ''}`
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
                <NavSubSectionLabel>מכירות</NavSubSectionLabel>
                <NavSubLink to="/pipeline" label="צנרת מכירות" />
                <NavSubLink to="/receivables" label="תקבולים" />
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

                <NavSubSectionLabel>כלים</NavSubSectionLabel>
                <NavSubLink to="/prompts" label="ספריית פרומפטים" />
              </NavExpandableGroup>
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
                  <NavSubLink to="/finance" label="ריווחית · מסמכים" />
                  <NavSubLink to="/finance/expenses" label="הוצאות" />
                  <NavSubLink to="/suppliers" label="ספקים" />
                  <NavSubLink to="/clients" label="לקוחות" />
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
                    `${navBase} ${isActive ? 'is-active' : ''}`
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
                to="/vault"
                className={({ isActive }) =>
                  `${navBase} ${isActive ? 'is-active' : ''}`
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
                  <div className="beo-sidebar-divider my-2 border-t" />

                  <NavExpandableGroup
                    label="סוכני AI"
                    isSectionActive={aiAgentsNavActive}
                    open={aiAgentsOpen}
                    onToggle={() => setAiAgentsOpen((v) => !v)}
                    icon={
                      <NavGlyph>
                        <path d="M12 2a4 4 0 014 4v1h1a3 3 0 010 6h-1v1a4 4 0 01-8 0v-1H7a3 3 0 010-6h1V6a4 4 0 014-4z" />
                        <circle cx="9.5" cy="10.5" r="1" fill="currentColor" stroke="none" />
                        <circle cx="14.5" cy="10.5" r="1" fill="currentColor" stroke="none" />
                      </NavGlyph>
                    }
                  >
                    <NavSubLink to="/ai-agents" label="רשת סוכנים" end />
                    <NavSubLink to="/ai-agents/overview" label="סקירה" />
                    {AI_AGENT_BOARDS.map((board) => {
                      const fromFleet = fleetUp
                        ? fleet?.agents.find((a) => a.id === board.id)
                        : undefined
                      const person = getAgentProfile(board.id)?.personName
                      const label = person
                        ? `${person} · ${board.displayName}`
                        : fromFleet?.display_name ?? board.displayName
                      const running = Boolean(fromFleet?.running)
                      return (
                        <NavSubLink
                          key={board.id}
                          to={board.path}
                          label={label}
                          badge={
                            running ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700">
                                <span className="beo-agent-live-dot" aria-hidden />
                                חי
                              </span>
                            ) : !fleetUp ? (
                              <span className="text-[10px] font-semibold text-[var(--text-light)]">
                                לא זמין
                              </span>
                            ) : undefined
                          }
                        />
                      )
                    })}
                  </NavExpandableGroup>

                  <NavLink
                    to="/users"
                    className={({ isActive }) =>
                      `${navBase} ${isActive ? 'is-active' : ''}`
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

            <div className="mt-auto space-y-2 border-t border-[var(--sidebar-border)] pt-4">
              <p className="text-[9px] font-semibold uppercase tracking-[2px] text-[var(--sidebar-muted)]">
                GOOGLE WORKSPACE
              </p>
              <ul className="space-y-2">
                {workspaceLinks.map((l) => (
                  <li key={l.label}>
                    <a
                      href={l.href}
                      target="_blank"
                      rel="noreferrer"
                      className="group flex items-center gap-2 text-[12px] text-[var(--sidebar-text)] transition hover:text-[var(--sidebar-text-strong)]"
                    >
                      <span
                      className="h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ backgroundColor: l.dot }}
                      />
                      {l.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="flex flex-col gap-2 border-t border-[var(--sidebar-border)] p-4">
            <div className="flex items-center gap-2">
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                style={{
                  backgroundColor: BRAND.color.purple,
                }}
              >
                {mainUser.avatar}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-[var(--sidebar-text-strong)]">
                  {mainUser.name}
                </div>
                <div className="truncate text-[11px] text-[var(--sidebar-muted)]">
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
              className="w-full rounded-lg border border-[var(--sidebar-border)] py-1.5 text-center text-xs font-semibold text-[var(--sidebar-text)] transition hover:bg-[var(--sidebar-hover)] hover:text-[var(--sidebar-text-strong)]"
            >
              התנתק
            </button>
          </div>
        </aside>

        <main className="relative min-h-0 w-full min-w-0 flex-1 overflow-y-auto overflow-x-hidden bg-[var(--bg-main)]">
          <QuickActionsFloat />
          <QuickTasksSlider />
          <TaskDrawer />
          <CommandPalette />
          <Outlet />
        </main>
      </div>
      <ToastHost />
      <HubRealtimeBubbleHost />
    </>
  )
}
