import { formatDateIL, todayYmd } from '../../lib/dates'
import { hubSectionClass } from '../../lib/hubSectionBorder'

type Props = {
  userEmail: string
  integrationReady: boolean
}

export function ClockifyEmployeeDashboard({ userEmail, integrationReady }: Props) {
  return (
    <div className="space-y-5">
      <section className={`rounded-2xl ${hubSectionClass(2)} p-4 md:p-6`}>
        <h2 className="text-[15px] font-extrabold text-[var(--text-dark)] md:text-[17px]">הנוכחות שלי</h2>
        <p className="mt-2 max-w-2xl text-[12px] leading-relaxed text-[var(--text-mid)] md:text-[13px]">
          הנתונים מגיעים מ-Clockify לפי <strong className="text-[var(--text-dark)]">אותו אימייל</strong> כמו בחשבון
          Firebase. אין עריכה כאן — תצוגה בלבד.
        </p>
        <dl className="mt-4 grid gap-3 text-[13px] sm:grid-cols-2">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-input)]/50 p-3">
            <dt className="text-[11px] font-bold text-[var(--text-light)]">אימייל לזיהוי</dt>
            <dd className="mt-1 font-mono text-[var(--text-dark)]" dir="ltr">
              {userEmail || '—'}
            </dd>
          </div>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-input)]/50 p-3">
            <dt className="text-[11px] font-bold text-[var(--text-light)]">תאריך היום</dt>
            <dd className="mt-1 font-semibold text-[var(--text-dark)]">{formatDateIL(todayYmd())}</dd>
          </div>
        </dl>
      </section>

      <section className={`rounded-2xl ${hubSectionClass(3)} p-4 md:p-6`}>
        <h3 className="text-[14px] font-extrabold text-[var(--text-dark)]">שעות החודש הנוכחי</h3>
        <p className="mt-2 text-[12px] text-[var(--text-mid)]">
          placeholder: סה״כ שעות מ-Clockify לחודש הנוכחי (אחרי חיבור API).
        </p>
        <div className="mt-4 flex items-baseline gap-2">
          <span className="text-[34px] font-black tabular-nums text-[var(--text-dark)]">—</span>
          <span className="text-[14px] text-[var(--text-mid)]">שעות</span>
        </div>
      </section>

      <section className={`rounded-2xl ${hubSectionClass(4)} p-4 md:p-6`}>
        <h3 className="text-[14px] font-extrabold text-[var(--text-dark)]">מצב מעקב עכשיו</h3>
        <p className="mt-2 text-[12px] text-[var(--text-mid)]">
          האם יש entry פתוח ב-Clockify (timer רץ) — יתעדכן מה-API.
        </p>
        <div className="mt-4">
          <span className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--bg-input)] px-4 py-2 text-[13px] font-semibold text-[var(--text-mid)]">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[var(--text-light)]" aria-hidden />
            {integrationReady ? 'לא זמין עד חיבור API' : 'המערכת ממתינה להגדרת אדמין'}
          </span>
        </div>
      </section>

      <section className={`rounded-2xl ${hubSectionClass(5)} p-4 md:p-6`}>
        <h3 className="text-[14px] font-extrabold text-[var(--text-dark)]">היסטוריית ימים</h3>
        <p className="mt-2 text-[12px] text-[var(--text-mid)]">placeholder: רשימת ימים עם סה״כ שעות לכל יום.</p>
        <div className="mt-4 rounded-xl border border-dashed border-[var(--border)] p-8 text-center text-[12px] text-[var(--text-light)]">
          placeholder: day history (Clockify reports / summary)
        </div>
      </section>
    </div>
  )
}
