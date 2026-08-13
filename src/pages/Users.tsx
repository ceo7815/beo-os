import { UserManagementContent } from '../components/UserManagementContent'

export function Users() {
  return (
    <div className="beo-page space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-extrabold text-[var(--text-dark)]">משתמשים</h1>
          <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-[var(--text-mid)]">
            ניהול צוות, הרשאות ויעדי שעות — טבלה מלאה ברוחב המסך.
          </p>
        </div>
      </header>

      <UserManagementContent />
    </div>
  )
}
