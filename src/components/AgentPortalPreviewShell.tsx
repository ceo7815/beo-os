import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, NavLink, Outlet, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom'
import { AgentPreviewProvider } from '../contexts/AgentPreviewContext'
import { useUsers } from '../hooks/useUsers'
import { memberIsSalesAgentFlag } from '../lib/salesAgent'
import type { TeamMember } from '../types'
import { ToastHost } from './shared/Toast'
import { brandLogoAlt, brandLogoSrc } from '../lib/brand'

const LAYOUT_LOGO_SRC = `${brandLogoSrc()}?v=3`

const navBase =
  'flex items-center gap-2.5 rounded-none px-5 py-3 text-base transition'

const navIconClass =
  'h-[17px] w-[17px] shrink-0 text-current opacity-90 [&>svg]:h-full [&>svg]:w-full'

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

function previewBase(agentUserId: string) {
  return `/agents/preview/${agentUserId}`
}

export function AgentPortalPreviewShell() {
  const { agentUserId = '' } = useParams<{ agentUserId: string }>()
  const { users, loading } = useUsers()
  const navigate = useNavigate()
  const location = useLocation()
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  const agent = users.find((m) => m.id === agentUserId) ?? null
  const base = previewBase(agentUserId)

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

  const displayUser: TeamMember = useMemo(() => {
    if (agent) return agent
    return {
      id: agentUserId,
      name: 'סוכן',
      avatar: '?',
      color: '#2563EB',
      role: 'סוכן מכירות',
    }
  }, [agent, agentUserId])

  if (loading) {
    return (
      <div
        dir="rtl"
        className="flex min-h-[100dvh] items-center justify-center bg-[var(--bg-main)] text-sm font-semibold text-[var(--text-mid)]"
      >
        טוען…
      </div>
    )
  }

  if (!agentUserId || !agent || !memberIsSalesAgentFlag(agent) || agent.active === false) {
    return <Navigate to="/agents" replace />
  }

  const navClass = (isActive: boolean) =>
    `${navBase} ${
      isActive
        ? 'border-r-[3px] border-[var(--orange)] bg-[var(--brand-muted)] font-bold text-[var(--orange)]'
        : 'border-r-[3px] border-transparent text-slate-600 hover:bg-[var(--brand-muted)] hover:text-slate-900'
    }`

  return (
    <AgentPreviewProvider agentUserId={agentUserId}>
      <div
        dir="rtl"
        className="flex min-h-[100dvh] flex-col bg-[var(--bg-main)] md:h-[100dvh] md:flex-row md:overflow-hidden"
      >
        <header
          className="sticky top-0 z-[45] flex shrink-0 items-center gap-3 border-b border-[var(--border)] bg-white px-3 py-2.5 shadow-sm md:hidden"
          style={{ paddingTop: 'max(0.5rem, env(safe-area-inset-top, 0px))' }}
        >
          <button
            type="button"
            onClick={() => setMobileNavOpen(true)}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[var(--border)] bg-slate-50 text-slate-700 transition hover:bg-[var(--brand-muted)]"
            aria-label="פתח תפריט ניווט"
            aria-expanded={mobileNavOpen}
          >
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.75">
              <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
            </svg>
          </button>
          <img src={LAYOUT_LOGO_SRC} alt="" className="h-9 w-auto max-w-[140px] object-contain opacity-95" />
          <span className="min-w-0 flex-1 truncate text-left text-xs font-semibold text-slate-500">
            תצוגת סוכן
          </span>
        </header>

        {mobileNavOpen ? (
          <button
            type="button"
            className="fixed inset-0 z-[57] cursor-default border-0 bg-black/50 p-0 md:hidden"
            aria-label="סגור תפריט"
            onClick={closeMobileNav}
          />
        ) : null}

        <aside
          className={`flex flex-col bg-white transition-transform duration-200 max-md:fixed max-md:inset-y-0 max-md:right-0 max-md:z-[58] max-md:h-[100dvh] max-md:w-[min(100vw-0.75rem,300px)] max-md:overflow-y-auto md:static md:h-full md:w-[220px] md:shrink-0 md:overflow-y-auto md:border-l md:border-[var(--border)] ${
            mobileNavOpen ? 'max-md:translate-x-0' : 'max-md:pointer-events-none max-md:translate-x-full'
          }`}
        >
          <div className="flex flex-1 flex-col gap-5 p-4">
            <div className="border-b border-[var(--border)] pb-4">
              <img
                src={LAYOUT_LOGO_SRC}
                alt={brandLogoAlt()}
                className="mx-auto h-auto w-full max-w-[196px] object-contain"
              />
              <p className="mt-3 text-center text-[11px] font-semibold text-slate-400">פורטל סוכן — תצוגת מנהל</p>
              <p className="mt-1 text-center text-[14px] font-bold text-[var(--orange)]">{displayUser.name}</p>
            </div>

            <nav className="flex flex-col gap-0.5">
              <NavLink to={base} end className={({ isActive }) => navClass(isActive)}>
                <NavGlyph>
                  <rect x="3" y="3" width="7" height="7" rx="1.2" />
                  <rect x="14" y="3" width="7" height="7" rx="1.2" />
                  <rect x="3" y="14" width="7" height="7" rx="1.2" />
                  <rect x="14" y="14" width="7" height="7" rx="1.2" />
                </NavGlyph>
                דשבורד
              </NavLink>
              <NavLink to={`${base}/leads`} className={({ isActive }) => navClass(isActive)}>
                <NavGlyph>
                  <path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M19 8v6M22 11h-6" />
                </NavGlyph>
                לידים
              </NavLink>
              <NavLink to={`${base}/business`} className={({ isActive }) => navClass(isActive)}>
                <NavGlyph>
                  <path d="M3 21h18M6 21V10l6-3 6 3v11M9 10v11M9 7l3-1.5L15 7" />
                </NavGlyph>
                עסקים ועסקאות
              </NavLink>
              <NavLink to={`${base}/finance`} className={({ isActive }) => navClass(isActive)}>
                <NavGlyph>
                  <rect x="2" y="5" width="20" height="14" rx="2" />
                  <path d="M2 10h20" />
                </NavGlyph>
                כספים
              </NavLink>
            </nav>
          </div>

          <div className="flex flex-col gap-2 border-t border-[var(--border)] p-4">
            <div className="flex items-center gap-2">
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                style={{
                  backgroundColor: `${displayUser.color}44`,
                  border: `1.5px solid ${displayUser.color}`,
                }}
              >
                {displayUser.avatar}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-slate-900">{displayUser.name}</div>
                <div className="truncate text-[11px] text-slate-500">סוכן מכירות</div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => navigate('/agents', { replace: false })}
              className="w-full rounded-lg border border-[var(--orange)]/40 bg-[var(--orange)]/10 py-1.5 text-center text-xs font-bold text-[var(--orange)] transition hover:bg-[var(--orange)]/20"
            >
              חזרה לדשבורד מנהל
            </button>
          </div>
        </aside>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="sticky top-0 z-40 flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[var(--border-orange-soft)] bg-[var(--brand-light)] px-4 py-2.5 shadow-sm">
            <p className="text-[12px] font-semibold text-[var(--text-dark)]">
              תצוגת מנהל — רואים את הפורטל בדיוק כמו{' '}
              <strong className="text-[var(--orange)]">{displayUser.name}</strong>
            </p>
            <Link
              to="/agents"
              className="rounded-lg border border-[var(--border)] bg-white px-3 py-1.5 text-xs font-bold text-[var(--text-dark)] shadow-sm transition hover:bg-[var(--surface-muted)]"
            >
              חזרה לדשבורד מנהל
            </Link>
          </div>
          <main className="relative min-h-0 w-full min-w-0 flex-1 overflow-y-auto overflow-x-hidden">
            <Outlet />
          </main>
        </div>
        <ToastHost />
      </div>
    </AgentPreviewProvider>
  )
}
