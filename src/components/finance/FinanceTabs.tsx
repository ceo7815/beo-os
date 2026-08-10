import { NavLink } from 'react-router-dom'

export type FinanceTabBadges = {
  /** תשלומים שירדו מהחשבון ואין להם מסמך תואם */
  unmatched?: number
  /** חשבוניות פתוחות שעבר מועד התשלום שלהן */
  overdue?: number
}

type Tab = {
  to: string
  label: string
  hint: string
  badge?: number
  /** אדום = דורש טיפול; אפור = מידע בלבד */
  urgent?: boolean
}

/**
 * ניווט אחיד לכל מסכי הפיננסים.
 *
 * המטרה היא שתמיד יהיה ברור לאן ללכת: הטאב מסמן בעצמו כמה פריטים מחכים
 * לטיפול, כך שאין צורך להיכנס לכל מסך רק כדי לגלות שאין בו כלום.
 */
export function FinanceTabs({ badges = {} }: { badges?: FinanceTabBadges }) {
  // סדר זהה לסרגל הצדדי תחת «פיננסים»
  const tabs: Tab[] = [
    { to: '/finance', label: 'סקירה', hint: 'רווח, מע״מ ואמינות הנתונים' },
    { to: '/finance/income', label: 'הכנסות', hint: 'מסמכים מחשבונית ירוקה' },
    {
      to: '/finance/expenses',
      label: 'הוצאות',
      hint: 'הזנה וייבוא מהבנק',
    },
    {
      to: '/finance/reconciliation',
      label: 'התאמות בנקים',
      hint: 'תשלומים מול חשבוניות ספק',
      ...(badges.unmatched ? { badge: badges.unmatched } : {}),
      urgent: true,
    },
    {
      to: '/finance/documents',
      label: 'תיק חשבוניות',
      hint: 'ארכיון לפי חודשים ושליחה לרו״ח',
    },
    { to: '/finance/projects', label: 'פרויקטים', hint: 'רווחיות לפי פרויקט' },
    {
      to: '/finance/cashflow',
      label: 'תזרים',
      hint: 'תחזית מזומנים — כניסות ויציאות',
    },
    {
      to: '/finance/fixed-expenses',
      label: 'הוצאות קבועות',
      hint: 'ניהול הוצאות חוזרות מאושרות לתזרים',
    },
    {
      to: '/finance/standing-orders',
      label: 'הוראות קבע',
      hint: 'הוראות קבע פעילות מחשבונית ירוקה',
    },
    {
      to: '/finance/retainers',
      label: 'ריטיינרים',
      hint: 'ריטיינרים פעילים מחשבונית ירוקה',
    },
    {
      to: '/collections',
      label: 'גבייה',
      hint: 'חשבוניות פתוחות',
      ...(badges.overdue ? { badge: badges.overdue } : {}),
      urgent: true,
    },
  ]

  return (
    <nav
      aria-label="ניווט פיננסים"
      className="flex flex-wrap items-center gap-1.5 rounded-2xl border border-[var(--border)] bg-[var(--surface-muted)]/50 p-1.5"
    >
      {tabs.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end={tab.to === '/finance'}
          title={tab.hint}
          className={({ isActive }) =>
            `group flex items-center gap-1.5 rounded-xl px-3 py-2 text-[13px] font-bold transition ${
              isActive
                ? 'bg-[var(--orange)] text-white shadow-sm'
                : 'text-[var(--text-mid)] hover:bg-black/[0.04] hover:text-[var(--text-dark)]'
            }`
          }
        >
          {({ isActive }) => (
            <>
              <span>{tab.label}</span>
              {tab.badge ? (
                <span
                  className={`flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-extrabold ${
                    isActive
                      ? 'bg-white/25 text-white'
                      : tab.urgent
                        ? 'bg-[#EF4444] text-white'
                        : 'bg-black/10 text-[var(--text-mid)]'
                  }`}
                >
                  {tab.badge > 99 ? '99+' : tab.badge}
                </span>
              ) : null}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  )
}
