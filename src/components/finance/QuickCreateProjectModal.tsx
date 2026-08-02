import { useEffect, useState } from 'react'
import { Modal } from '../shared/Modal'
import { useProjects } from '../../hooks/useProjects'
import { useHubStore } from '../../store/useStore'
import { todayYmd } from '../../lib/dates'

const PROJECT_COLORS = [
  '#F97316',
  '#0EA5E9',
  '#10B981',
  '#8B5CF6',
  '#EF4444',
  '#64748B',
] as const

type Props = {
  open: boolean
  onClose: () => void
  /** לקוח משויך מראש מהשורה */
  clientId?: string
  clientName?: string
  /** אחרי יצירה מוצלחת — מזהה הפרויקט החדש */
  onCreated: (projectId: string) => void
}

/**
 * הקמת פרויקט מינימלית ממסך הכנסות/הוצאות —
 * בלי לעבור למסך ניהול הפרויקטים.
 */
export function QuickCreateProjectModal({
  open,
  onClose,
  clientId,
  clientName,
  onCreated,
}: Props) {
  const { addProject } = useProjects()
  const currentUser = useHubStore((s) => s.currentUser)
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setName('')
    setSaving(false)
  }, [open])

  const handleSave = async () => {
    const trimmed = name.trim()
    if (!trimmed || saving) return
    setSaving(true)
    try {
      const ownerId =
        typeof currentUser?.id === 'string' && currentUser.id.trim()
          ? currentUser.id.trim()
          : 'system'
      const id = await addProject({
        name: trimmed,
        type: 'client',
        status: 'active',
        priority: 'medium',
        ownerId,
        color: PROJECT_COLORS[0],
        projectType: 'one-time',
        dueDate: todayYmd(),
        ...(clientId?.trim() ? { clientId: clientId.trim() } : {}),
      })
      if (!id) return
      onCreated(id)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      isOpen={open}
      onClose={() => {
        if (!saving) onClose()
      }}
      title="פרויקט מהיר"
      size="md"
    >
      <div className="space-y-4 text-right">
        <p className="text-[12px] leading-relaxed text-[var(--text-mid)]">
          פתיחת פרויקט חדש לשיוך מיידי
          {clientName ? (
            <>
              {' '}
              ללקוח{' '}
              <span className="font-bold text-[var(--text-dark)]">
                {clientName}
              </span>
            </>
          ) : null}
          .
        </p>
        <label className="block text-[12px] font-semibold text-[var(--text-mid)]">
          שם הפרויקט *
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                void handleSave()
              }
            }}
            autoFocus
            placeholder="לדוגמה: בניית אתר תדמית"
            className="mt-1 w-full rounded-[10px] border border-[var(--border)] bg-[var(--dash-panel-bg)] px-3 py-2.5 text-[13px] text-[var(--text-dark)]"
          />
        </label>
        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            disabled={saving}
            onClick={onClose}
            className="rounded-[10px] border border-[var(--border)] px-4 py-2 text-[12px] font-semibold text-[var(--text-mid)] disabled:opacity-50"
          >
            ביטול
          </button>
          <button
            type="button"
            disabled={saving || !name.trim()}
            onClick={() => void handleSave()}
            className="rounded-[10px] bg-[var(--orange)] px-4 py-2 text-[12px] font-bold text-white disabled:opacity-50"
          >
            {saving ? 'יוצר…' : 'צור ושייך'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
