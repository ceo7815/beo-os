import { useEffect, useState } from 'react'
import { deleteField } from 'firebase/firestore'
import { Modal } from '../shared/Modal'
import { useLeads } from '../../hooks/useLeads'
import { todayYmd } from '../../lib/dates'
import {
  leadScheduleCaption,
  leadScheduleEditField,
  leadScheduleYmd,
} from '../../lib/leadSchedule'
import type { Lead } from '../../types'

const DATE_INPUT_YMD = /^\d{4}-\d{2}-\d{2}$/

type Props = {
  lead: Lead | null
  isOpen: boolean
  onClose: () => void
}

export function LeadScheduleDateEditorModal({ lead, isOpen, onClose }: Props) {
  const { updateLead } = useLeads()
  const [draft, setDraft] = useState('')
  const [field, setField] = useState<'nextFollowUpDate' | 'quoteReturnByDate'>('nextFollowUpDate')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!isOpen || !lead) return
    setDraft(leadScheduleYmd(lead) ?? todayYmd())
    setField(leadScheduleEditField(lead))
  }, [isOpen, lead?.id])

  const hadDate = Boolean(lead && leadScheduleYmd(lead))

  const handleSave = async () => {
    if (!lead) return
    const y = draft.slice(0, 10)
    if (!DATE_INPUT_YMD.test(y)) return
    setSaving(true)
    try {
      await updateLead(lead.id, { [field]: y } as Partial<Lead>)
      onClose()
    } catch {
      /* toast ב־updateLead */
    } finally {
      setSaving(false)
    }
  }

  const handleClear = async () => {
    if (!lead) return
    setSaving(true)
    try {
      await updateLead(lead.id, {
        [field]: deleteField(),
      } as Partial<Lead> & Record<string, unknown>)
      onClose()
    } catch {
      /* toast ב־updateLead */
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      isOpen={isOpen && Boolean(lead)}
      onClose={onClose}
      title={lead ? `תאריך חזרה · ${lead.name}` : 'תאריך חזרה'}
      size="md"
    >
      {lead ? (
        <div className="space-y-4">
          <p className="text-[12px] text-[var(--text-mid)]">
            {leadScheduleCaption(lead)} — הדחיפות בטבלה ובדשבורד מחושבות לפי התאריך שנשמר כאן.
          </p>
          <div>
            <label className="mb-1 block text-[11px] font-semibold text-[var(--text-mid)]">
              תאריך
            </label>
            <input
              type="date"
              className="max-w-[280px]"
              value={draft}
              disabled={saving}
              onChange={(e) => setDraft(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[var(--border)] pt-4">
            {hadDate ? (
              <button
                type="button"
                disabled={saving}
                className="rounded-[10px] border border-[#FECACA] bg-[#FEF2F2] px-4 py-2 text-sm font-semibold text-[#B91C1C] hover:bg-[#FEE2E2]"
                onClick={() => void handleClear()}
              >
                הסרת תאריך
              </button>
            ) : null}
            <button
              type="button"
              disabled={saving}
              className="rounded-[10px] border border-[var(--border-orange-soft)] bg-[var(--dash-panel-bg)] px-4 py-2 text-sm font-semibold text-[var(--text-mid)] hover:bg-[var(--surface-muted)]"
              onClick={onClose}
            >
              ביטול
            </button>
            <button
              type="button"
              disabled={saving || !DATE_INPUT_YMD.test(draft.slice(0, 10))}
              className="hub-btn-orange text-sm"
              onClick={() => void handleSave()}
            >
              {saving ? 'שומר…' : 'שמירה'}
            </button>
          </div>
        </div>
      ) : null}
    </Modal>
  )
}
