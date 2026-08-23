import { useEffect, useId, useState } from 'react'
import type { DisplayTool } from '../../lib/aiAgentsDisplay'
import {
  getAgentProfile,
  loadAgentAvatar,
  saveAgentAvatar,
} from '../../lib/aiAgentProfiles'
import { useHubStore } from '../../store/useStore'

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

  useEffect(() => {
    setSrc(loadAgentAvatar(boardId))
    setDefaultIdx(0)
  }, [boardId])

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
      src={src || defaultSrc}
      alt={profile?.personName || boardId}
      className="h-full w-full rounded-2xl object-cover"
      onError={() => {
        // אל תמחק העלאת משתמש — רק נתיבי public שנכשלו
        if (src?.startsWith('data:')) return
        if (defaultIdx + 1 < defaultCandidates.length) {
          setDefaultIdx((i) => i + 1)
        } else {
          setDefaultIdx(defaultCandidates.length)
        }
      }}
    />
  ) : (
    <div className="flex h-full w-full items-center justify-center rounded-2xl bg-[var(--brand-deep)] text-[18px] font-extrabold tracking-wide text-white">
      {initials}
    </div>
  )

  if (!editable) {
    return <div className={`beo-agent-avatar relative ${dim} shrink-0`}>{media}</div>
  }

  return (
    <div className={`beo-agent-avatar relative ${dim} shrink-0`}>
      {media}
      <label
        htmlFor={inputId}
        className={`absolute inset-0 z-10 flex cursor-pointer flex-col justify-end rounded-2xl bg-gradient-to-t from-black/55 via-black/10 to-transparent p-1.5 ${
          busy ? 'pointer-events-none opacity-70' : ''
        }`}
        title="העלאת תמונת פרופיל"
      >
        <span className="rounded-lg bg-black/60 px-1.5 py-1 text-center text-[10px] font-bold text-white backdrop-blur-sm">
          {busy ? 'מעלה…' : 'החלף תמונה'}
        </span>
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
    </div>
  )
}

function ConnRow({ tool }: { tool: DisplayTool }) {
  return (
    <div className={`beo-agent-conn ${tool.connected ? 'is-on' : 'is-off'}`}>
      <span className="beo-agent-conn-led" aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-bold text-[var(--text-dark)]">{tool.label}</div>
        {tool.hint ? (
          <div className="text-[11px] text-[var(--text-light)]">{tool.hint}</div>
        ) : null}
      </div>
      <span className="beo-agent-conn-state">
        {tool.connected ? 'מחובר' : 'לא מחובר'}
      </span>
    </div>
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

  return (
    <div className="beo-agent-profile space-y-4">
      <section className="beo-agent-panel beo-agent-panel--hero overflow-hidden">
        <div className="beo-agent-panel-grid" aria-hidden />
        <div className="relative flex flex-wrap items-start gap-5 p-5 md:p-6">
          <AgentAvatar boardId={boardId} size="lg" editable />
          <div className="min-w-0 flex-1">
            <p className="beo-agent-kicker">פרופיל סוכן · Beo OS</p>
            <h2 className="mt-1 text-[24px] font-extrabold tracking-tight text-[var(--text-dark)]">
              {profile?.personName || displayName}
            </h2>
            <p className="mt-1 text-[14px] font-semibold text-[var(--brand-deep)]">
              {profile?.title || role}
            </p>
            <p className="mt-0.5 font-mono text-[12px] text-[var(--text-light)]" dir="ltr">
              {handle}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <span className="beo-agent-chip">{statusLabel}</span>
              {profile?.department ? (
                <span className="beo-agent-chip beo-agent-chip--muted">
                  {profile.department}
                </span>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="beo-agent-panel space-y-4 p-5">
          <h3 className="beo-agent-section-title">פרטי קשר</h3>
          <dl className="space-y-3 text-[13px]">
            <div>
              <dt className="text-[11px] font-semibold text-[var(--text-light)]">מייל שליחה</dt>
              <dd className="mt-0.5 font-mono text-[14px] font-bold text-[var(--text-dark)]" dir="ltr">
                {profile?.email || '—'}
              </dd>
              {profile?.emailNote ? (
                <p className="mt-1 text-[12px] text-[var(--text-mid)]">{profile.emailNote}</p>
              ) : null}
            </div>
            <div>
              <dt className="text-[11px] font-semibold text-[var(--text-light)]">שם תצוגה</dt>
              <dd className="mt-0.5 font-bold text-[var(--text-dark)]">{displayName}</dd>
            </div>
            <div>
              <dt className="text-[11px] font-semibold text-[var(--text-light)]">פעילות אחרונה</dt>
              <dd className="mt-0.5 font-semibold text-[var(--text-dark)]">
                {lastActivity || 'אין דיווח עדיין מהצי'}
              </dd>
            </div>
          </dl>
        </section>

        <section className="beo-agent-panel space-y-3 p-5">
          <h3 className="beo-agent-section-title">חיבורים וכלים</h3>
          <div className="space-y-2">
            {tools.map((t) => (
              <ConnRow key={t.kind} tool={t} />
            ))}
          </div>
          {profile?.tools?.length ? (
            <div className="border-t border-[var(--border)] pt-3">
              <p className="mb-2 text-[11px] font-semibold text-[var(--text-light)]">ארגז כלים</p>
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

      <section className="beo-agent-panel space-y-3 p-5">
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
    </div>
  )
}
