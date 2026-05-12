import { useMemo, useState } from 'react'
import { Badge } from '../components/shared/Badge'
import { ConfirmDialog } from '../components/shared/ConfirmDialog'
import { Modal } from '../components/shared/Modal'
import { PromptModelQuickSelect } from '../components/PromptModelQuickSelect'
import { usePromptLibrary } from '../hooks/usePromptLibrary'
import { extractPromptVariables } from '../lib/extractPromptVariables'
import {
  PROMPT_MODEL_CATEGORY_COLOR,
  PROMPT_MODEL_LABEL,
  getPromptModelRow,
  promptModelSearchHaystack,
} from '../lib/promptModelCatalog'
import { hubSectionClass } from '../lib/hubSectionBorder'
import { useHubStore } from '../store/useStore'
import type { PromptLibraryEntry, PromptTargetModel } from '../types/promptLibrary'

const uiButtonBase =
  'inline-flex h-9 min-w-[104px] items-center justify-center rounded-[10px] px-3 text-xs font-semibold transition'
const uiButtonBrand = `${uiButtonBase} border border-transparent bg-[var(--orange)] text-white shadow-sm hover:bg-[#ea6c0a]`
const uiButtonGhost =
  `${uiButtonBase} border border-[var(--border-orange-soft)] bg-[var(--dash-panel-bg)] text-[var(--text-mid)] hover:bg-[var(--surface-muted)]`
const uiButtonDangerOutline = `${uiButtonBase} border border-[#EF4444] bg-[var(--dash-panel-bg)] text-[#DC2626] hover:bg-[#FEF2F2]`
const uiInputClass =
  'w-full rounded-xl border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2.5 text-sm text-[var(--text-dark)] outline-none ring-0 focus:border-[var(--orange)]'

const CATEGORY_BADGE_COLOR = '#64748B'

function modelBadgeColor(entry: PromptLibraryEntry): string {
  const row = getPromptModelRow(entry.targetModel)
  return row ? PROMPT_MODEL_CATEGORY_COLOR[row.category] : '#64748B'
}

function normalizeSearch(s: string): string {
  return s.trim().toLowerCase()
}

function matchesSearch(entry: PromptLibraryEntry, q: string): boolean {
  if (!q) return true
  const n = normalizeSearch(q)
  const row = getPromptModelRow(entry.targetModel)
  const modelHaystack = row
    ? promptModelSearchHaystack(row)
    : normalizeSearch(entry.targetModel)
  const modelLabel = normalizeSearch(PROMPT_MODEL_LABEL[entry.targetModel] ?? '')
  return (
    normalizeSearch(entry.title).includes(n) ||
    normalizeSearch(entry.category).includes(n) ||
    normalizeSearch(entry.content).includes(n) ||
    modelHaystack.includes(n) ||
    modelLabel.includes(n)
  )
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    try {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.left = '-9999px'
      document.body.appendChild(ta)
      ta.select()
      const ok = document.execCommand('copy')
      document.body.removeChild(ta)
      return ok
    } catch {
      return false
    }
  }
}

export function PromptLibrary() {
  const { entries, addEntry, updateEntry, deleteEntry } = usePromptLibrary()
  const pushToast = useHubStore((s) => s.pushToast)
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [viewEntry, setViewEntry] = useState<PromptLibraryEntry | null>(null)
  const [formTitle, setFormTitle] = useState('')
  const [formCategory, setFormCategory] = useState('')
  const [formModel, setFormModel] = useState<PromptTargetModel>('gpt-5-5')
  const [formContent, setFormContent] = useState('')

  const filtered = useMemo(
    () => entries.filter((e) => matchesSearch(e, search)),
    [entries, search],
  )

  const previewVariables = useMemo(
    () => extractPromptVariables(formContent),
    [formContent],
  )

  const resetForm = () => {
    setFormTitle('')
    setFormCategory('')
    setFormModel('gpt-5-5')
    setFormContent('')
  }

  const closeModal = () => {
    setModalOpen(false)
    setEditingId(null)
    resetForm()
  }

  const openAddModal = () => {
    setEditingId(null)
    resetForm()
    setModalOpen(true)
  }

  const beginEdit = (entry: PromptLibraryEntry) => {
    setEditingId(entry.id)
    setFormTitle(entry.title)
    setFormCategory(entry.category)
    setFormModel(entry.targetModel)
    setFormContent(entry.content)
    setModalOpen(true)
  }

  const submitForm = () => {
    const payload = {
      title: formTitle,
      category: formCategory,
      targetModel: formModel,
      content: formContent,
    }
    if (editingId) {
      const ok = updateEntry(editingId, payload)
      if (ok) {
        pushToast('הפרומפט עודכן', 'success')
        closeModal()
      } else {
        pushToast(
          !formTitle.trim() || !formContent.trim()
            ? 'נא למלא כותרת ותוכן פרומפט'
            : 'הפרומפט לא נמצא',
          'error',
        )
      }
      return
    }
    const ok = addEntry(payload)
    if (ok) {
      pushToast('הפרומפט נוסף לספרייה', 'success')
      closeModal()
    } else {
      pushToast('נא למלא כותרת ותוכן פרומפט', 'error')
    }
  }

  const confirmDelete = () => {
    if (!deleteConfirmId) return
    deleteEntry(deleteConfirmId)
    pushToast('הפרומפט נמחק', 'success')
    if (editingId === deleteConfirmId) closeModal()
    setDeleteConfirmId(null)
  }

  const onCopy = async (entry: PromptLibraryEntry) => {
    const success = await copyToClipboard(entry.content)
    if (success) pushToast('הועתק ללוח', 'success')
    else pushToast('לא ניתן להעתיק — נסו שוב או הרשאות דפדפן', 'error')
  }

  return (
    <div className="mx-auto max-w-[1400px] space-y-6 px-8 py-8" dir="rtl">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-[26px] font-extrabold text-[var(--text-dark)]">
            ספריית פרומפטים
          </h1>
          <p className="mt-1 text-[13px] text-[var(--text-mid)]">
            פרומפטים לפי קטגוריה ומודל — העתקה בלחיצה אחת. משתנים ב־{'{{'}…{'}}'}{' '}
            מסומנים בכרטיס.
          </p>
        </div>
        <button
          type="button"
          onClick={openAddModal}
          className={uiButtonBrand}
        >
          + פרומפט חדש
        </button>
      </header>

      <div>
        <label className="mb-1 block text-[11px] font-bold text-[var(--text-mid)]">
          חיפוש לפי שם, קטגוריה או תוכן
        </label>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="הקלד לסינון…"
          className={uiInputClass}
          autoComplete="off"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--border-orange-soft)] bg-[var(--dash-panel-bg)] p-10 text-center text-[var(--text-mid)]">
          לא נמצאו פרומפטים התואמים לחיפוש.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {filtered.map((entry, idx) => (
            <article
              key={entry.id}
              className={`flex flex-col rounded-2xl ${hubSectionClass(idx)} p-5 text-right transition hover:brightness-[1.02]`}
            >
              <div
                role="button"
                tabIndex={0}
                className="min-w-0 flex-1 cursor-pointer rounded-xl outline-none ring-0 transition hover:bg-black/[0.03] focus-visible:ring-2 focus-visible:ring-[var(--orange)]"
                onClick={() => setViewEntry(entry)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    setViewEntry(entry)
                  }
                }}
                aria-label={`פתח תצוגת פרומפט: ${entry.title}`}
              >
                <h2 className="text-lg font-bold leading-snug text-[var(--text-dark)]">
                  {entry.title}
                </h2>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Badge label={entry.category} color={CATEGORY_BADGE_COLOR} />
                  <Badge
                    label={PROMPT_MODEL_LABEL[entry.targetModel]}
                    color={modelBadgeColor(entry)}
                  />
                  {entry.variables.length > 0 ? (
                    <span
                      className="inline-flex items-center gap-1 rounded-full border border-[#F59E0B]/50 bg-[#FFFBEB] px-2.5 py-1 text-[10px] font-bold text-[#B45309]"
                      title={entry.variables.join(', ')}
                    >
                      <svg
                        viewBox="0 0 24 24"
                        className="h-3.5 w-3.5 shrink-0"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        aria-hidden
                      >
                        <path d="M4 7V4h16v3M9 20h6M12 4v16" />
                      </svg>
                      משתנים ({entry.variables.length})
                    </span>
                  ) : null}
                </div>
                <p
                  className="mt-3 line-clamp-3 text-start text-[12px] leading-relaxed text-[var(--text-mid)]"
                  dir="auto"
                >
                  {entry.content}
                </p>
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border)] pt-4">
                <button
                  type="button"
                  onClick={() => void onCopy(entry)}
                  className={`${uiButtonBrand} w-full sm:w-auto`}
                >
                  העתק
                </button>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => beginEdit(entry)}
                    className={uiButtonGhost}
                  >
                    עריכה
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteConfirmId(entry.id)}
                    className={uiButtonDangerOutline}
                  >
                    מחיקה
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      <Modal
        isOpen={modalOpen}
        onClose={closeModal}
        title={editingId ? 'עריכת פרומפט' : 'הוספת פרומפט'}
        size="lg"
      >
        <div className="space-y-4 text-right">
          <div>
            <label className="mb-1 block text-[11px] font-bold text-[var(--text-mid)]">
              כותרת *
            </label>
            <input
              value={formTitle}
              onChange={(e) => setFormTitle(e.target.value)}
              className={uiInputClass}
              placeholder="למשל: מייל מעקב אחרי הצעת מחיר"
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-bold text-[var(--text-mid)]">
              קטגוריה
            </label>
            <input
              value={formCategory}
              onChange={(e) => setFormCategory(e.target.value)}
              className={uiInputClass}
              placeholder="שיווק, פיתוח, מכירות…"
              list="prompt-categories-suggestions"
            />
            <datalist id="prompt-categories-suggestions">
              <option value="שיווק" />
              <option value="פיתוח" />
              <option value="מכירות" />
              <option value="תמיכה" />
              <option value="ניהול" />
            </datalist>
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-bold text-[var(--text-mid)]">
              מודל / כלי יעד
            </label>
            <PromptModelQuickSelect
              id="prompt-library-model"
              value={formModel}
              onChange={setFormModel}
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-bold text-[var(--text-mid)]">
              תוכן הפרומפט * — ניתן להשתמש ב־{'{{'}שם_משתנה{'}}'}
            </label>
            <textarea
              value={formContent}
              onChange={(e) => setFormContent(e.target.value)}
              rows={10}
              className={`${uiInputClass} min-h-[200px] resize-y font-mono text-[13px]`}
              placeholder={'דוגמה: כתוב מייל קצר ללקוח {{שם_הלקוח}} בנושא {{נושא}}.'}
              dir="auto"
            />
            {previewVariables.length > 0 ? (
              <p className="mt-2 text-[11px] text-[var(--text-mid)]">
                משתנים שזוהו:{' '}
                <span className="font-mono font-semibold text-[var(--text-dark)]">
                  {previewVariables.join(' · ')}
                </span>
              </p>
            ) : (
              <p className="mt-2 text-[11px] text-[var(--text-light)]">
                אין עדיין placeholders בפורמט {'{{'}…{'}}'}
              </p>
            )}
          </div>
          <div className="flex flex-wrap justify-end gap-2 border-t border-[var(--border)] pt-4">
            <button
              type="button"
              onClick={closeModal}
              className={uiButtonGhost}
            >
              ביטול
            </button>
            <button type="button" onClick={submitForm} className={uiButtonBrand}>
              {editingId ? 'שמור שינויים' : 'שמור לספרייה'}
            </button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={deleteConfirmId !== null}
        onClose={() => setDeleteConfirmId(null)}
        onConfirm={confirmDelete}
        message="למחוק את הפרומפט מהספרייה? לא ניתן לשחזר את הפעולה."
      />

      <Modal
        isOpen={viewEntry !== null}
        onClose={() => setViewEntry(null)}
        title={viewEntry?.title ?? 'פרומפט'}
        size="lg"
      >
        {viewEntry ? (
          <div className="space-y-4 text-right">
            <div className="flex flex-wrap gap-2">
              <Badge label={viewEntry.category} color={CATEGORY_BADGE_COLOR} />
              <Badge
                label={PROMPT_MODEL_LABEL[viewEntry.targetModel]}
                color={modelBadgeColor(viewEntry)}
              />
            </div>
            <pre
              className="max-h-[min(55vh,480px)] overflow-auto whitespace-pre-wrap break-words rounded-xl border border-[var(--border)] bg-[var(--bg-input)] p-4 text-start font-mono text-[13px] leading-relaxed text-[var(--text-dark)]"
              dir="auto"
            >
              {viewEntry.content}
            </pre>
            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => setViewEntry(null)}
                className={uiButtonGhost}
              >
                סגור
              </button>
              <button
                type="button"
                onClick={() => void onCopy(viewEntry)}
                className={uiButtonBrand}
              >
                העתק פרומפט
              </button>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  )
}
