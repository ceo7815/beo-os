import { useEffect, useId, useState } from 'react'
import type { DisplayTool } from '../../lib/aiAgentsDisplay'
import {
  getAgentProfile,
  loadAgentAvatar,
  saveAgentAvatar,
} from '../../lib/aiAgentProfiles'
import { useHubStore } from '../../store/useStore'
import { ConnectionCubes } from './AgentCostsUi'

const MAX_UPLOAD_BYTES = 900 * 1024

/** מקטין תמונה ל־JPEG קטן מספיק ל־localStorage */
async function fileToAvatarDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file)
  const maxSide = 512
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
  const w = Math.max(1, Math.round(bitmap.width * scale))
  const h = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('לא ניתן לעבד את התמונה')
  ctx.drawImage(bitmap, 0, 0, w, h)
  bitmap.close()
  const dataUrl = canvas.toDataURL('image/jpeg', 0.82)
  if (!dataUrl.startsWith('data:image/')) throw new Error('עיבוד התמונה נכשל')
  return dataUrl
}

export function AgentAvatar({
  boardId,
  size = 'md',
  editable = false,
}: {
  boardId: string
  size?: 'sm' | 'md' | 'lg'
  editable?: boolean
}) {
  const pushToast = useHubStore((s) => s.pushToast)
  const profile = getAgentProfile(boardId)
  const inputId = useId()
  const [src, setSrc] = useState<string | null>(() => loadAgentAvatar(boardId))
  const [defaultIdx, setDefaultIdx] = useState(0)
  const [busy, setBusy] = useState(false)
  const [lightboxOpen, setLightboxOpen] = useState(false)

  useEffect(() => {
    setSrc(loadAgentAvatar(boardId))
    setDefaultIdx(0)
  }, [boardId])

  useEffect(() => {
    if (!lightboxOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightboxOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lightboxOpen])

  const dim =
    size === 'lg' ? 'h-[7.25rem] w-[7.25rem]' : size === 'sm' ? 'h-10 w-10' : 'h-14 w-14'
  const initials = (profile?.personName || boardId).slice(0, 2)
  const defaultCandidates = [
    profile?.defaultAvatarSrc,
    profile?.defaultAvatarSrc?.replace(/\.jpg$/i, '.png'),
    profile?.defaultAvatarSrc?.replace(/\.jpg$/i, '.webp'),
    `/ai-agents/${boardId}.jpg`,
    `/ai-agents/${boardId}.png`,
  ].filter((v, i, arr): v is string => Boolean(v) && arr.indexOf(v) === i)

  const defaultSrc =
    defaultIdx < defaultCandidates.length ? defaultCandidates[defaultIdx] : undefined
  const showImg = Boolean(src || defaultSrc)
  const displaySrc = src || defaultSrc
  const personName = profile?.personName || boardId

  const onFile = async (file: File | undefined) => {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      pushToast('יש לבחור קובץ תמונה (JPG / PNG / WEBP)', 'error')
      return
    }
    if (file.size > 8 * 1024 * 1024) {
      pushToast('התמונה גדולה מדי (עד 8MB לפני דחיסה)', 'error')
      return
    }
    setBusy(true)
    try {
      const dataUrl = await fileToAvatarDataUrl(file)
      if (dataUrl.length > MAX_UPLOAD_BYTES * 1.4) {
        throw new Error('התמונה עדיין גדולה אחרי דחיסה — נסו קובץ פשוט יותר')
      }
      saveAgentAvatar(boardId, dataUrl)
      setSrc(dataUrl)
      pushToast('תמונת הפרופיל עודכנה', 'success')
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'העלאת התמונה נכשלה'
      pushToast(msg, 'error')
    } finally {
      setBusy(false)
    }
  }

  const media = showImg ? (
    <img
      src={displaySrc}
      alt={personName}
      className="h-full w-full rounded-full object-cover"
      onError={() => {
        if (src?.startsWith('data:')) return
        if (defaultIdx + 1 < defaultCandidates.length) {
          setDefaultIdx((i) => i + 1)
        } else {
          setDefaultIdx(defaultCandidates.length)
        }
      }}
    />
  ) : (
    <div className="flex h-full w-full items-center justify-center rounded-full bg-[var(--brand-deep)] text-[18px] font-extrabold tracking-wide text-white">
      {initials}
    </div>
  )

  const lightbox =
    lightboxOpen && displaySrc ? (
      <div
        className="beo-agent-avatar-lightbox"
        role="dialog"
        aria-modal
        aria-label={`תמונת פרופיל של ${personName}`}
        onClick={() => setLightboxOpen(false)}
      >
        <div
          className="relative flex flex-col items-center gap-4"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="beo-agent-avatar-lightbox-inner">
            <img src={displaySrc} alt={personName} />
          </div>
          <p className="text-[15px] font-extrabold text-white drop-shadow">{personName}</p>
          <p className="text-[12px] text-white/75">לחיצה מחוץ לתמונה לסגירה</p>
        </div>
      </div>
    ) : null

  return (
    <>
      <div className={`beo-agent-avatar relative ${dim} shrink-0`}>
        <button
          type="button"
          className="absolute inset-0 z-[1] cursor-zoom-in rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand)]"
          aria-label={`הצגת תמונה של ${personName}`}
          onClick={() => {
            if (displaySrc) setLightboxOpen(true)
          }}
        >
          <span className="sr-only">פתח תמונה</span>
        </button>
        <div className="pointer-events-none h-full w-full">{media}</div>
        {editable ? (
          <label
            htmlFor={inputId}
            className={`absolute inset-x-1 bottom-1 z-[2] flex cursor-pointer justify-center rounded-full bg-black/65 px-2 py-1 text-center text-[9px] font-bold text-white backdrop-blur-sm ${
              busy ? 'pointer-events-none opacity-70' : ''
            }`}
            title="העלאת תמונת פרופיל"
            onClick={(e) => e.stopPropagation()}
          >
            {busy ? 'מעלה…' : 'החלף'}
            <input
              id={inputId}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="sr-only"
              disabled={busy}
              onChange={(e) => {
                const file = e.target.files?.[0]
                e.target.value = ''
                void onFile(file)
              }}
            />
          </label>
        ) : null}
      </div>
      {lightbox}
    </>
  )
}

export function AgentProfilePanel({
  boardId,
  displayName,
  handle,
  role,
  tools,
  lastActivity,
  statusLabel,
}: {
  boardId: string
  displayName: string
  handle: string
  role: string
  tools: DisplayTool[]
  lastActivity?: string | null
  statusLabel: string
}) {
  const profile = getAgentProfile(boardId)
  const personName = profile?.personName || displayName
  const title = profile?.title || role
  const connected = tools.filter((t) => t.connected).length
  const isLive =
    statusLabel === 'חי' ||
    statusLabel.includes('חי') ||
    statusLabel.includes('מחובר') ||
    statusLabel.toLowerCase().includes('live') ||
    statusLabel.toLowerCase().includes('running')

  return (
    <div className="beo-agent-profile space-y-4">
      <section className="beo-agent-panel beo-agent-panel--hero overflow-hidden">
        <div className="beo-agent-panel-grid" aria-hidden />
        <div className="relative flex flex-wrap items-start gap-5 p-5 md:p-6">
          <div className="beo-agent-avatar-wrap">
            <AgentAvatar boardId={boardId} size="lg" editable />
            <span
              className={`beo-agent-live-dot ${isLive ? '' : 'is-off'}`}
              aria-hidden
            />
          </div>

          <div className="min-w-0 flex-1">
            <p className="beo-agent-kicker">פרופיל סוכן · Beo OS</p>
            <h2 className="mt-1 text-[24px] font-extrabold tracking-tight text-[var(--text-dark)] md:text-[26px]">
              {personName}
            </h2>
            <p className="mt-1 text-[14px] font-semibold text-[var(--brand-deep)]">{title}</p>
            <p className="mt-0.5 font-mono text-[12px] text-[var(--text-light)]" dir="ltr">
              {handle}
            </p>
            {profile?.tagline ? (
              <p className="mt-3 max-w-2xl text-[13px] leading-relaxed text-[var(--text-mid)]">
                {profile.tagline}
              </p>
            ) : null}
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span
                className={`beo-agent-chip inline-flex items-center gap-1.5 ${
                  isLive ? 'beo-agent-chip--live' : 'beo-agent-chip--muted'
                }`}
              >
                <span
                  className={`beo-agent-live-dot ${isLive ? '' : 'is-off'}`}
                  aria-hidden
                />
                {statusLabel}
              </span>
              {profile?.department ? (
                <span className="beo-agent-chip beo-agent-chip--muted">
                  {profile.department}
                </span>
              ) : null}
              <span className="text-[11px] font-semibold text-[var(--text-light)]">
                {connected}/{tools.length} חיבורים פעילים
              </span>
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
        <section className="beo-agent-panel p-5 md:p-6">
          <h3 className="beo-agent-section-title">פרטי קשר</h3>
          <dl className="mt-4 divide-y divide-[var(--border)]">
            <div className="grid gap-1 py-3 first:pt-0 last:pb-0 sm:grid-cols-[9.5rem_1fr] sm:items-start sm:gap-4">
              <dt className="text-[11px] font-bold text-[var(--text-light)]">מייל שליחה</dt>
              <dd>
                <div
                  className="font-mono text-[14px] font-bold text-[var(--text-dark)]"
                  dir="ltr"
                >
                  {profile?.email || '—'}
                </div>
                {profile?.emailNote ? (
                  <p className="mt-1 text-[12px] leading-relaxed text-[var(--text-mid)]">
                    {profile.emailNote}
                  </p>
                ) : null}
              </dd>
            </div>
            <div className="grid gap-1 py-3 sm:grid-cols-[9.5rem_1fr] sm:items-center sm:gap-4">
              <dt className="text-[11px] font-bold text-[var(--text-light)]">שם תצוגה</dt>
              <dd className="text-[13px] font-bold text-[var(--text-dark)]">{displayName}</dd>
            </div>
            <div className="grid gap-1 py-3 sm:grid-cols-[9.5rem_1fr] sm:items-center sm:gap-4">
              <dt className="text-[11px] font-bold text-[var(--text-light)]">תפקיד</dt>
              <dd className="text-[13px] font-semibold text-[var(--text-dark)]">{title}</dd>
            </div>
            <div className="grid gap-1 py-3 last:pb-0 sm:grid-cols-[9.5rem_1fr] sm:items-start sm:gap-4">
              <dt className="text-[11px] font-bold text-[var(--text-light)]">פעילות אחרונה</dt>
              <dd className="text-[13px] font-semibold leading-relaxed text-[var(--text-dark)]">
                {lastActivity || 'אין דיווח עדיין מהצי'}
              </dd>
            </div>
          </dl>
        </section>

        <section className="beo-agent-panel space-y-4 p-5 md:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="beo-agent-section-title">חיבורים וכלים</h3>
            <span className="text-[11px] font-semibold text-[var(--text-light)]">
              נקודה ירוקה = מחובר
            </span>
          </div>
          <ConnectionCubes tools={tools} />
          {profile?.tools?.length ? (
            <div className="border-t border-[var(--border)] pt-4">
              <p className="mb-2 text-[11px] font-bold text-[var(--text-light)]">ארגז כלים</p>
              <div className="flex flex-wrap gap-1.5">
                {profile.tools.map((tool) => (
                  <span key={tool} className="beo-agent-chip beo-agent-chip--muted">
                    {tool}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </section>
      </div>

      {(profile?.capabilities?.length ?? 0) > 0 ? (
        <section className="beo-agent-panel space-y-3 p-5 md:p-6">
          <h3 className="beo-agent-section-title">יכולות</h3>
          <ul className="grid gap-2 sm:grid-cols-2">
            {(profile?.capabilities || []).map((cap) => (
              <li key={cap} className="beo-agent-capability">
                <span className="beo-agent-capability-mark" aria-hidden />
                <span>{cap}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}
