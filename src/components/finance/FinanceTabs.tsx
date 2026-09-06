import { NavLink } from 'react-router-dom'

export type FinanceTabBadges = {
  unmatched?: number
  overdue?: number
}

/**
 * ניווט פיננסים v2 — ריווחית בלבד.
 * המסכים הישנים (ירוקה / התאמות / תזרים) הוסרו מהניווט.
 * `badges` נשאר אופציונלי לתאימות עם דפים ישנים שעדיין מעבירים אותו.
 */
export function FinanceTabs(_props?: { badges?: FinanceTabBadges }) {
  const tabs = [
    { to: '/finance', label: 'ריווחית', hint: 'לקוח · הזמנה · חשבונית מס קבלה', end: true },
  ] as const

  return (
    <nav
      aria-label="ניווט פיננסים"
      className="flex w-full min-w-0 flex-wrap items-center gap-1 rounded-2xl border border-[var(--border)] bg-white p-1.5 shadow-[var(--shadow-sm)]"
    >
      {tabs.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end={tab.end}
          title={tab.hint}
          className={({ isActive }) =>
            `rounded-xl px-3 py-2 text-[13px] font-bold transition ${
              isActive
                ? 'bg-[var(--orange)] text-white shadow-sm'
                : 'text-[var(--text-mid)] hover:bg-black/[0.04] hover:text-[var(--text-dark)]'
            }`
          }
        >
          {tab.label}
        </NavLink>
      ))}
    </nav>
  )
}
