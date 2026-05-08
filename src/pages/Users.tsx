import { UserManagementContent } from '../components/UserManagementContent'

export function Users() {
  return (
    <div className="mx-auto max-w-[900px] space-y-6 px-4 py-6 md:px-8 md:py-8">
      <header className="space-y-1">
        <h1 className="text-[26px] font-extrabold text-[var(--text-dark)]">משתמשים</h1>
        <p className="max-w-2xl text-[13px] leading-relaxed text-[var(--text-mid)]">
          ניהול צוות, הרשאות, יעדי שעות ולוח יום לנוכחות — הכול במסך אחד מסודר.
        </p>
      </header>

      <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-[0_2px_12px_rgba(15,23,42,0.06)] md:p-6">
        <UserManagementContent />
      </div>
    </div>
  )
}
