import { UserManagementContent } from '../components/UserManagementContent'
import { hubSectionClass } from '../lib/hubSectionBorder'

export function Users() {
  return (
    <div className="mx-auto max-w-[900px] space-y-6 px-4 py-6 md:px-8 md:py-8">
      <header className="space-y-1">
        <h1 className="text-[26px] font-extrabold text-[var(--text-dark)]">משתמשים</h1>
        <p className="max-w-2xl text-[13px] leading-relaxed text-[var(--text-mid)]">
          ניהול צוות, הרשאות, יעדי שעות ולוח יום לנוכחות — הכול במסך אחד מסודר.
        </p>
      </header>

      <div className={`rounded-2xl ${hubSectionClass(0)} p-4 shadow-none md:p-6`}>
        <UserManagementContent />
      </div>
    </div>
  )
}
