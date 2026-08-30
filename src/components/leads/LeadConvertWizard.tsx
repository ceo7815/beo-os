import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { useClients } from '../../hooks/useClients'
import { useLeads } from '../../hooks/useLeads'
import { useProjects } from '../../hooks/useProjects'
import { useHubStore } from '../../store/useStore'
import type { Lead } from '../../types'
import { Modal } from '../shared/Modal'
import { BEO_AI_LEAD_SOURCE } from '../../lib/leadStatusUi'

/** המרת ליד שנסגר → לקוח (+ פרויקט אופציונלי) */
export function LeadConvertWizard({
  lead,
  open,
  onClose,
}: {
  lead: Lead | null
  open: boolean
  onClose: () => void
}) {
  const { user } = useAuth()
  const { addClient } = useClients()
  const { updateLead } = useLeads()
  const { addProject } = useProjects()
  const pushToast = useHubStore((s) => s.pushToast)
  const navigate = useNavigate()

  const [name, setName] = useState('')
  const [contact, setContact] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [createProject, setCreateProject] = useState(true)
  const [projectName, setProjectName] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open || !lead) return
    setName(lead.company || lead.name)
    setContact(lead.name)
    setPhone(lead.phone || '')
    setEmail(lead.email || '')
    setProjectName(`פרויקט · ${lead.company || lead.name}`)
    setCreateProject(true)
  }, [open, lead])

  const submit = async () => {
    if (!lead || !user) return
    if (!name.trim()) {
      pushToast('שם לקוח חובה', 'error')
      return
    }
    setBusy(true)
    try {
      let clientId = lead.clientId
      if (!clientId) {
        clientId = await addClient({
          name: name.trim(),
          contact: contact.trim() || name.trim(),
          phone: phone.trim(),
          email: email.trim(),
          status: 'active',
          businessNotes:
            lead.clientNeeds ||
            (lead.source === BEO_AI_LEAD_SOURCE ? 'נוצר מליד Beo AI Lead Agent' : undefined),
        })
      }
      if (!clientId) throw new Error('יצירת לקוח נכשלה')

      await updateLead(lead.id, {
        clientId,
        status: 'closed',
        lastActivityText: 'הומר ללקוח · ליד נסגר',
        lastActivityAt: new Date().toISOString(),
      })

      let projectId: string | null = null
      if (createProject) {
        projectId = await addProject({
          name: projectName.trim() || `פרויקט · ${name.trim()}`,
          type: 'client',
          projectType: 'one-time',
          clientId,
          status: 'active',
          priority: 'medium',
          dueDate: '',
          ownerId: user.uid,
          color: '#5828A0',
        })
      }

      pushToast(
        projectId ? 'נוצר לקוח + פרויקט · הליד נסגר' : 'נוצר לקוח · הליד נסגר',
        'success',
      )
      onClose()
      if (projectId) navigate(`/projects/${projectId}`)
      else navigate('/clients')
    } catch (e) {
      pushToast(e instanceof Error ? e.message : 'ההמרה נכשלה', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal isOpen={open && Boolean(lead)} onClose={onClose} title="המרת ליד ללקוח">
      {!lead ? null : (
        <div className="space-y-4">
          <p className="text-[13px] leading-relaxed text-[var(--text-mid)]">
            נוצר כרטיס לקוח, הליד מסומן «נסגרה», ואפשר לפתוח פרויקט באותה פעולה.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-[11px] font-bold text-[var(--text-light)]">
              שם לקוח *
              <input
                className="mt-1 w-full"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label className="block text-[11px] font-bold text-[var(--text-light)]">
              איש קשר
              <input
                className="mt-1 w-full"
                value={contact}
                onChange={(e) => setContact(e.target.value)}
              />
            </label>
            <label className="block text-[11px] font-bold text-[var(--text-light)]">
              טלפון
              <input
                className="mt-1 w-full"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                dir="ltr"
              />
            </label>
            <label className="block text-[11px] font-bold text-[var(--text-light)]">
              אימייל
              <input
                className="mt-1 w-full"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                dir="ltr"
              />
            </label>
          </div>
          <label className="flex items-center gap-2 text-[13px] font-semibold text-[var(--text-dark)]">
            <input
              type="checkbox"
              checked={createProject}
              onChange={(e) => setCreateProject(e.target.checked)}
            />
            פתח גם פרויקט חדש
          </label>
          {createProject ? (
            <label className="block text-[11px] font-bold text-[var(--text-light)]">
              שם פרויקט
              <input
                className="mt-1 w-full"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
              />
            </label>
          ) : null}
          <div className="flex flex-wrap justify-end gap-2 border-t border-[var(--border)] pt-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-[var(--border)] bg-white px-3.5 py-2 text-[13px] font-semibold"
            >
              ביטול
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void submit()}
              className="rounded-xl bg-[var(--brand)] px-3.5 py-2 text-[13px] font-bold text-white disabled:opacity-60"
            >
              {busy ? 'שומר…' : 'המר וסגור ליד'}
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}
