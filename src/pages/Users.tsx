import { UserManagementContent } from '../components/UserManagementContent'

export function Users() {
  return (
    <div className="mx-auto max-w-[1400px] space-y-5 px-4 py-5 md:px-8 md:py-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-extrabold text-[var(--text-dark)]">משתמשים</h1>
          <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-[var(--text-mid)]">
            ניהול צוות, הרשאות, יעדי שעות ולוח יום לנוכחות — טבלה מלאה ברוחב המסך.
          </p>
        </div>
      </header>

      <UserManagementContent />
    </div>
  )
}
