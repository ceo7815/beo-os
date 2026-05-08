import { useEffect, useState, type FormEvent } from 'react'
import {
  firstWeeklyOnOrAfter,
  formatDateIL,
  todayYmd,
} from '../lib/dates'
import type { Priority, TaskRecurrence, TeamMember } from '../types'
import { Modal } from './shared/Modal'

const WEEKDAY_OPTIONS: { value: number; label: string }[] = [
  { value: 0, label: 'יום ראשון' },
  { value: 1, label: 'יום שני' },
  { value: 2, label: 'יום שלישי' },
  { value: 3, label: 'יום רביעי' },
  { value: 4, label: 'יום חמישי' },
  { value: 5, label: 'יום שישי' },
  { value: 6, label: 'יום שבת' },
]

export type RecurringTaskFormValues = {
  title: string
  description: string
  assigneeId: string
  frequency: TaskRecurrence
  weeklyDayOfWeek?: number
  firstDueYmd: string
  priority: Priority
}

type Props = {
  isOpen: boolean
  onClose: () => void
  teamMembers: TeamMember[]
  defaultAssigneeId: string
  onSave: (values: RecurringTaskFormValues) => Promise<boolean>
}

export function RecurringTaskModal({
  isOpen,
  onClose,
  teamMembers,
  defaultAssigneeId,
  onSave,
}: Props) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [assigneeId, setAssigneeId] = useState(defaultAssigneeId)
  const [frequency, setFrequency] = useState<TaskRecurrence>('daily')
  const [weeklyDayOfWeek, setWeeklyDayOfWeek] = useState(0)
  const [anchorYmd, setAnchorYmd] = useState(() => todayYmd())
  const [priority, setPriority] = useState<Priority>('medium')
  const [submitting, setSubmitting] = useState(false)
  const [localError, setLocalError] = useState('')

  useEffect(() => {
    if (!isOpen) return
    setTitle('')
    setDescription('')
    setAssigneeId(defaultAssigneeId)
    setFrequency('daily')
    setWeeklyDayOfWeek(0)
    setAnchorYmd(todayYmd())
    setPriority('medium')
    setLocalError('')
    setSubmitting(false)
  }, [isOpen, defaultAssigneeId])

  const computedFirstDue =
    frequency === 'daily'
      ? anchorYmd
      : firstWeeklyOnOrAfter(anchorYmd, weeklyDayOfWeek)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const t = title.trim()
    if (!t) {
      setLocalError('נא למלא כותרת למשימה')
      return
    }
    if (!assigneeId) {
      setLocalError('נא לבחור עובד')
      return
    }
    setLocalError('')
    setSubmitting(true)
    try {
      const ok = await onSave({
        title: t,
        description: description.trim(),
        assigneeId,
        frequency,
        ...(frequency === 'weekly' ? { weeklyDayOfWeek } : {}),
        firstDueYmd: computedFirstDue,
        priority,
      })
      if (ok) onClose()
    } finally {
      setSubmitting(false)
    }
  }

  const sortedMembers = [...teamMembers].sort((a, b) =>
    a.name.localeCompare(b.name, 'he'),
  )

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        if (!submitting) onClose()
      }}
      title="משימה קבועה לעובד"
      size="md"
    >
      <form className="space-y-4 text-start" onSubmit={(e) => void submit(e)}>
        <p className="text-[12px] leading-relaxed text-[var(--text-mid)]">
          כשהעובד מסמן את המשימה כהושלמה — נוצרת אוטומטית{' '}
          <strong className="text-[var(--text-dark)]">משימה קבועה</strong> חדשה:{' '}
          <strong className="text-[var(--text-dark)]">יומית</strong> למחר, או{' '}
          <strong className="text-[var(--text-dark)]">שבועית</strong> לפי יום השבוע שבחרת.
        </p>

        {localError ? (
          <p className="rounded-[8px] bg-[#FEF2F2] px-3 py-2 text-[12px] text-[#B91C1C]">
            {localError}
          </p>
        ) : null}

        <label className="block">
          <span className="mb-1 block text-[11px] font-bold text-[var(--text-mid)]">
            כותרת המשימה *
          </span>
          <input
            className="w-full"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="למשל: עדכון דוח יומי"
            disabled={submitting}
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-[11px] font-bold text-[var(--text-mid)]">
            תיאור (אופציונלי)
          </span>
          <textarea
            className="min-h-[72px] w-full resize-y"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={submitting}
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-[11px] font-bold text-[var(--text-mid)]">
            משויך לעובד *
          </span>
          <select
            className="w-full"
            value={assigneeId}
            onChange={(e) => setAssigneeId(e.target.value)}
            disabled={submitting}
          >
            <option value="">בחרו עובד</option>
            {sortedMembers.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>

        <fieldset className="space-y-2">
          <legend className="mb-2 block text-[11px] font-bold text-[var(--text-mid)]">
            תדירות
          </legend>
          <label className="flex cursor-pointer items-center gap-2 text-[13px]">
            <input
              type="radio"
              name="recfreq"
              checked={frequency === 'daily'}
              onChange={() => setFrequency('daily')}
              disabled={submitting}
            />
            משימה קבועה יומית — ההמשך ייפתח מחר אחרי השלמה
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-[13px]">
            <input
              type="radio"
              name="recfreq"
              checked={frequency === 'weekly'}
              onChange={() => setFrequency('weekly')}
              disabled={submitting}
            />
            משימה קבועה שבועית — ההמשך באותו יום בשבוע הבא
          </label>
        </fieldset>

        {frequency === 'weekly' ? (
          <label className="block">
            <span className="mb-1 block text-[11px] font-bold text-[var(--text-mid)]">
              יום בשבוע למשימה הקבועה
            </span>
            <select
              className="w-full"
              value={weeklyDayOfWeek}
              onChange={(e) => setWeeklyDayOfWeek(Number(e.target.value))}
              disabled={submitting}
            >
              {WEEKDAY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <label className="block">
          <span className="mb-1 block text-[11px] font-bold text-[var(--text-mid)]">
            {frequency === 'daily' ? 'תאריך יעד למשימה הראשונה' : 'החל מתאריך (חיפוש מופע שבועי ראשון אחרי התאריך)'}
          </span>
          <input
            type="date"
            className="w-full"
            value={anchorYmd}
            onChange={(e) => {
              const v = e.target.value
              if (v && /^\d{4}-\d{2}-\d{2}$/.test(v)) setAnchorYmd(v)
            }}
            disabled={submitting}
          />
        </label>

        <p className="rounded-[10px] bg-[#F8FAFC] px-3 py-2 text-[11px] text-[var(--text-mid)]">
          תאריך יעד למשימה הראשונה בלוח:{' '}
          <strong className="text-[var(--text-dark)]">{formatDateIL(computedFirstDue)}</strong>
        </p>

        <label className="block">
          <span className="mb-1 block text-[11px] font-bold text-[var(--text-mid)]">
            עדיפות
          </span>
          <select
            className="w-full"
            value={priority}
            onChange={(e) => setPriority(e.target.value as Priority)}
            disabled={submitting}
          >
            <option value="high">גבוהה</option>
            <option value="medium">בינונית</option>
            <option value="low">נמוכה</option>
          </select>
        </label>

        <div className="flex flex-wrap justify-end gap-2 pt-2">
          <button
            type="button"
            className="hub-btn-secondary text-sm"
            disabled={submitting}
            onClick={() => onClose()}
          >
            ביטול
          </button>
          <button type="submit" className="hub-btn-primary text-sm" disabled={submitting}>
            {submitting ? 'שומר…' : 'יצירת משימה קבועה'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
