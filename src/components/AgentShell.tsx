import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { NavLink, Outlet, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useUsers } from '../hooks/useUsers'
import { usesSalesAgentPortal } from '../lib/salesAgent'
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

export function AgentShell() {
  const { user, signOutUser } = useAuth()
  const { users, loading } = useUsers()
  const navigate = useNavigate()
  const location = useLocation()
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const member = users.find((m: TeamMember) => m.id === (user?.uid ?? ''))

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
      return { id: '', name: 'משתמש', avatar: '?', color: '#2563EB', role: '' }
    }
    const fromFs = users.find((m) => m.id === user.uid)
    if (fromFs) return fromFs
    const name =
      user.displayName?.trim() || user.email?.split('@')[0] || 'משתמש'
    return {
      id: user.uid,
      name,
      email: user.email ?? undefined,
      avatar: name.slice(0, 2),
      color: '#2563EB',
      role: 'סוכן מכירות',
    }
  }, [user, users])

  if (!user) return null
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
  if (!usesSalesAgentPortal(member)) {
    return <Navigate to="/" replace />
  }

  return (
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
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[var(--border)] bg-slate-50 text-slate-700 transition hover:bg-[var(--brand-muted)] active:scale-[0.98]"
          aria-label="פתח תפריט ניווט"
          aria-expanded={mobileNavOpen}
          aria-controls="agent-sidebar"
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
        <span className="min-w-0 flex-1 truncate text-left text-xs font-semibold text-slate-500">
          פורטל סוכן
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
        id="agent-sidebar"
        role="navigation"
        aria-label="ניווט פורטל סוכן"
        className={`flex flex-col bg-white transition-transform duration-200 ease-out max-md:fixed max-md:inset-y-0 max-md:right-0 max-md:z-[58] max-md:h-[100dvh] max-md:w-[min(100vw-0.75rem,300px)] max-md:overflow-y-auto max-md:border-l max-md:border-[var(--border)] max-md:shadow-[-10px_0_40px_rgba(15,23,42,0.12)] md:static md:z-auto md:h-full md:w-[220px] md:shrink-0 md:translate-x-0 md:overflow-y-auto md:border-b-0 md:border-l md:border-[var(--border)] md:shadow-none ${
          mobileNavOpen ? 'max-md:translate-x-0' : 'max-md:pointer-events-none max-md:translate-x-full'
        }`}
        style={{
          paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom, 0px))',
          paddingTop: 'max(0px, env(safe-area-inset-top, 0px))',
        }}
        onClick={(e) => {
          const t = e.target as HTMLElement
          if (t.closest('a[href], button')) closeMobileNav()
        }}
      >
        <div className="flex flex-1 flex-col gap-5 p-4">
          <div className="relative border-b border-[var(--border)] pb-4">
            <button
              type="button"
              onClick={closeMobileNav}
              className="absolute left-0 top-0 flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--border)] text-lg font-light leading-none text-slate-600 transition hover:bg-[var(--brand-muted)] md:hidden"
              aria-label="סגור תפריט"
            >
              ×
            </button>
            <img
              src={LAYOUT_LOGO_SRC}
              alt={brandLogoAlt()}
              className="mx-auto h-auto w-full max-w-[196px] select-none object-contain max-md:pt-1"
              width={196}
              height={72}
              decoding="async"
            />
            <p className="mt-3 text-center text-[11px] font-semibold text-slate-400">פורטל סוכן</p>
            <p className="mt-1 text-center text-[14px] font-bold leading-snug text-[var(--orange)]">
              מכירות
            </p>
          </div>

          <nav className="flex flex-col gap-0.5">
            <NavLink
              to="/agent"
              end
              className={({ isActive }) =>
                `${navBase} ${
                  isActive
                    ? 'bg-[var(--brand-muted)] font-semibold text-[var(--orange)]'
                    : 'font-medium text-slate-600 hover:bg-[var(--brand-muted)] hover:text-slate-900'
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
              to="/agent/leads"
              className={({ isActive }) =>
                `${navBase} ${
                  isActive
                    ? 'bg-[var(--brand-muted)] font-semibold text-[var(--orange)]'
                    : 'font-medium text-slate-600 hover:bg-[var(--brand-muted)] hover:text-slate-900'
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
              to="/agent/business"
              className={({ isActive }) =>
                `${navBase} ${
                  isActive
                    ? 'bg-[var(--brand-muted)] font-semibold text-[var(--orange)]'
                    : 'font-medium text-slate-600 hover:bg-[var(--brand-muted)] hover:text-slate-900'
                }`
              }
            >
              <NavGlyph>
                <path d="M3 21h18M6 21V10l6-3 6 3v11M9 10v11M9 7l3-1.5L15 7" />
              </NavGlyph>
              עסקים ועסקאות
            </NavLink>
            <NavLink
              to="/agent/finance"
              className={({ isActive }) =>
                `${navBase} ${
                  isActive
                    ? 'bg-[var(--brand-muted)] font-semibold text-[var(--orange)]'
                    : 'font-medium text-slate-600 hover:bg-[var(--brand-muted)] hover:text-slate-900'
                }`
              }
            >
              <NavGlyph>
                <rect x="2" y="5" width="20" height="14" rx="2" />
                <path d="M2 10h20" />
              </NavGlyph>
              כספים
            </NavLink>
          </nav>

          <div className="mt-auto space-y-2 border-t border-[var(--border)] pt-4">
            <p className="text-[9px] font-semibold uppercase tracking-[2px] text-slate-400">
              GOOGLE WORKSPACE
            </p>
            <ul className="space-y-2 text-[12px]">
              <li>
                <a
                  href="https://mail.google.com"
                  target="_blank"
                  rel="noreferrer"
                  className="text-slate-500 transition hover:text-slate-900"
                >
                  Gmail
                </a>
              </li>
              <li>
                <a
                  href="https://calendar.google.com"
                  target="_blank"
                  rel="noreferrer"
                  className="text-slate-500 transition hover:text-slate-900"
                >
                  Calendar
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="flex flex-col gap-2 border-t border-[var(--border)] p-4">
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
              <div className="truncate text-sm font-semibold text-slate-900">{mainUser.name}</div>
              <div className="truncate text-[11px] text-slate-500">סוכן מכירות</div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              void signOutUser().then(() => navigate('/login', { replace: true }))
            }}
            className="w-full rounded-lg border border-[var(--border)] py-1.5 text-center text-xs font-semibold text-slate-700 transition hover:bg-[var(--brand-muted)] hover:text-slate-900"
          >
            התנתקות
          </button>
        </div>
      </aside>

      <main className="relative min-h-0 w-full min-w-0 flex-1 overflow-y-auto overflow-x-hidden">
        <Outlet />
      </main>
      <ToastHost />
    </div>
  )
}
