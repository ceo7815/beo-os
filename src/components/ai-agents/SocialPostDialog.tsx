import { useEffect, useMemo, useState } from 'react'
import {
  SOCIAL_STATUS_HE,
  composeSocialCaption,
  createSocialPost,
  generateSocialImage,
  postSocialAction,
  stripHashtags,
  withHashtags,
  type SocialPost,
} from '../../lib/socialBeoApi'
import {
  FacebookFeedPreview,
  InstagramFeedPreview,
  StoryPreview,
  socialMediaSrc,
} from './SocialPlatformPreview'

type PreviewTab = 'instagram' | 'facebook' | 'story'
type FormatChoice = 'feed' | 'story' | 'both'

function israelIso(date: string, time: string) {
  const [y, m, d] = date.split('-').map(Number)
  const [hh, mm] = (time || '10:00').split(':').map(Number)
  const utc = Date.UTC(y, (m || 1) - 1, d || 1, (hh || 10) - 3, mm || 0)
  return new Date(utc).toISOString()
}

function clockFromIso(iso?: string) {
  if (!iso) return '10:00'
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Jerusalem',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date(iso))
  } catch {
    return '10:00'
  }
}

function formatsToChoice(formats?: string[]): FormatChoice {
  const set = new Set(formats || ['feed'])
  if (set.has('feed') && set.has('story')) return 'both'
  if (set.has('story')) return 'story'
  return 'feed'
}

function choiceToFormats(choice: FormatChoice): string[] {
  if (choice === 'both') return ['feed', 'story']
  return [choice]
}

const STATUS_CHIP: Record<string, string> = {
  draft: 'bg-amber-100 text-amber-900',
  pending_review: 'bg-orange-100 text-orange-900',
  scheduled: 'bg-emerald-100 text-emerald-900',
  publishing: 'bg-sky-100 text-sky-900',
  published: 'bg-blue-100 text-blue-900',
  failed: 'bg-red-100 text-red-900',
  skipped: 'bg-zinc-100 text-zinc-700',
}

function lockedStatus(status?: string) {
  return !!status && ['scheduled', 'publishing', 'published'].includes(status)
}

export function SocialPostDialog({
  open,
  date,
  posts,
  initialPostId,
  defaultTime,
  onClose,
  onChanged,
}: {
  open: boolean
  date: string | null
  posts: SocialPost[]
  initialPostId?: string | null
  defaultTime: string
  onClose: () => void
  onChanged: () => Promise<void>
}) {
  const [activeId, setActiveId] = useState<string>('new')
  const [preview, setPreview] = useState<PreviewTab>('instagram')
  const [saving, setSaving] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [composing, setComposing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [aiEdit, setAiEdit] = useState('')
  const [manualCaption, setManualCaption] = useState('')
  const [useAiText, setUseAiText] = useState(true)
  const [includeHashtags, setIncludeHashtags] = useState(false)
  const [userNotes, setUserNotes] = useState('')
  const [form, setForm] = useState({
    image_url: '',
    story_image_url: '',
    time: defaultTime || '10:00',
    formats: 'feed' as FormatChoice,
    headline: '',
    sub: '',
    media_mode: 'image' as 'image' | 'video',
  })

  const current = useMemo(
    () => posts.find((p) => p.id === activeId) || null,
    [posts, activeId],
  )
  const locked = lockedStatus(current?.status)

  const rawBody = useAiText ? aiEdit : manualCaption
  const captionIg = withHashtags(rawBody, includeHashtags)
  const captionFb = stripHashtags(rawBody)

  useEffect(() => {
    if (!open) return
    setActiveId(initialPostId || 'new')
    setPreview('instagram')
    setError(null)
  }, [open, date, initialPostId])

  useEffect(() => {
    if (!open) return
    if (!current) {
      setAiEdit('')
      setManualCaption('')
      setUseAiText(true)
      setIncludeHashtags(false)
      setUserNotes('')
      setForm({
        image_url: '',
        story_image_url: '',
        time: defaultTime || '10:00',
        formats: 'feed',
        headline: '',
        sub: '',
        media_mode: 'image',
      })
      return
    }
    const stored = current.ai_suggestion || current.caption_ig || current.caption || ''
    const body = stripHashtags(stored)
    setAiEdit(body)
    setManualCaption(current.caption_locked ? stripHashtags(current.caption || stored) : '')
    setUseAiText(!current.caption_locked)
    setIncludeHashtags(Boolean(current.include_hashtags) || /#[\u0590-\u05FFa-zA-Z]/.test(current.caption_ig || ''))
    setUserNotes(current.user_notes || '')
    setForm({
      image_url: current.image_url || '',
      story_image_url: current.story_image_url || current.image_url || '',
      time: clockFromIso(current.scheduled_at),
      formats: formatsToChoice(current.formats),
      headline: current.image_prompt || '',
      sub: '',
      media_mode: current.media_mode === 'video' ? 'video' : 'image',
    })
  }, [open, current, defaultTime])

  if (!open || !date) return null

  const payload = () => ({
    scheduled_at: israelIso(date, form.time),
    caption: captionIg,
    caption_ig: captionIg,
    caption_fb: captionFb,
    image_url: form.image_url,
    story_image_url: form.story_image_url || form.image_url,
    platforms: ['facebook_page', 'instagram'],
    formats: choiceToFormats(form.formats),
    image_prompt: form.headline,
    media_mode: form.media_mode,
    user_notes: userNotes,
    ai_suggestion: stripHashtags(rawBody),
    include_hashtags: includeHashtags,
    caption_locked: !useAiText,
  })

  const persist = async (status?: 'draft' | 'pending_review') => {
    if (!stripHashtags(rawBody).trim()) {
      setError('חסר ניסוח — כתבו רעיון ולחצו «נסח פוסט לפי הרעיון»')
      return null
    }
    setSaving(true)
    setError(null)
    const body = { ...payload(), ...(status ? { status } : {}) }
    const result = current
      ? await postSocialAction(current.id, 'update', body)
      : await createSocialPost(body)
    setSaving(false)
    if (!result.ok) {
      setError(result.error)
      return null
    }
    await onChanged()
    return result.item || current
  }

  const saveDraft = async () => {
    const item = await persist(current ? undefined : 'draft')
    if (item) onClose()
  }

  const sendReview = async () => {
    const item = await persist('pending_review')
    if (item) onClose()
  }

  const runAction = async (action: 'approve' | 'skip' | 'publish', immediate = false) => {
    let id = current?.id
    if (!id) {
      const created = await persist('pending_review')
      id = created?.id
    } else {
      const saved = await persist()
      if (!saved) return
    }
    if (!id) return
    setSaving(true)
    const result = await postSocialAction(id, action, action === 'approve' ? { immediate } : {})
    setSaving(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    await onChanged()
    onClose()
  }

  const composeFromIdea = async () => {
    const idea = userNotes.trim()
    if (!idea) {
      setError('כתבו רעיון קודם')
      return
    }
    setComposing(true)
    setError(null)
    const result = await composeSocialCaption({
      idea,
      date,
      include_hashtags: includeHashtags,
    })
    setComposing(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setAiEdit(result.body)
    setUseAiText(true)
    if (!form.headline.trim()) {
      const hook = result.body.split('\n').find((line) => line.trim()) || ''
      setForm((f) => ({ ...f, headline: hook.slice(0, 80) }))
    }
  }

  const generate = async () => {
    const headline = form.headline.trim() || stripHashtags(rawBody).split('\n').find((l) => l.trim()) || ''
    if (!headline) {
      setError('כתבו כותרת לתמונה בעברית, או נסחו קודם את הפוסט')
      return
    }
    setGenerating(true)
    setError(null)
    const fmt = form.formats === 'story' ? 'story' : 'feed'
    const result = await generateSocialImage({
      headline,
      sub: form.sub,
      format: fmt,
    })
    setGenerating(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setForm((f) => {
      const next = { ...f, headline }
      if (fmt === 'story') {
        next.story_image_url = result.url
        if (!next.image_url) next.image_url = result.url
      } else {
        next.image_url = result.url
        if (!next.story_image_url) next.story_image_url = result.url
      }
      return next
    })
  }

  const applyHashtagToggle = (on: boolean) => {
    setIncludeHashtags(on)
    const currentText = useAiText ? aiEdit : manualCaption
    if (!currentText.trim()) return
    const next = withHashtags(currentText, on)
    if (useAiText) setAiEdit(next)
    else setManualCaption(next)
  }

  const previewImage = form.formats === 'story' ? form.story_image_url || form.image_url : form.image_url
  const dateLabel = new Intl.DateTimeFormat('he-IL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date(`${date}T12:00:00`))
  const busy = saving || generating || composing

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center p-3 sm:p-5"
      dir="rtl"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="absolute inset-0 bg-[rgba(15,23,42,0.55)] backdrop-blur-[5px]" />
      <div
        className="relative z-10 flex max-h-[min(94vh,920px)] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-[0_24px_80px_rgba(0,0,0,0.22)]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="social-post-title"
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--border)] px-5 py-4">
          <div>
            <h2 id="social-post-title" className="text-[18px] font-extrabold text-[var(--text-dark)]">
              פוסט ל{dateLabel}
            </h2>
            <p className="mt-0.5 text-[12px] text-[var(--text-light)]">
              תצוגות מקדימות חיות · אינסטגרם, פייסבוק וסטורי · אישור רק מכאן
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-[var(--text-light)] hover:bg-[var(--brand-light)]"
            aria-label="סגור"
          >
            ✕
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="grid gap-0 lg:grid-cols-[minmax(0,1.05fr)_minmax(320px,0.95fr)]">
            <div className="space-y-4 border-b border-[var(--border)] p-5 lg:border-b-0 lg:border-e">
              {posts.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setActiveId('new')}
                    className={`rounded-full px-3 py-1 text-[12px] font-bold ${
                      activeId === 'new'
                        ? 'bg-[var(--brand)] text-white'
                        : 'border border-[var(--border)] bg-white'
                    }`}
                  >
                    פוסט חדש
                  </button>
                  {posts.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setActiveId(p.id)}
                      className={`rounded-full px-3 py-1 text-[12px] font-bold ${
                        activeId === p.id ? 'bg-[var(--brand)] text-white' : STATUS_CHIP[p.status] || 'bg-zinc-100'
                      }`}
                    >
                      {SOCIAL_STATUS_HE[p.status] || p.status}
                    </button>
                  ))}
                </div>
              ) : null}

              {current ? (
                <span
                  className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-bold ${STATUS_CHIP[current.status] || 'bg-zinc-100'}`}
                >
                  {SOCIAL_STATUS_HE[current.status] || current.status}
                </span>
              ) : null}

              <section className="space-y-2 rounded-xl border border-[var(--border)] bg-zinc-50 p-4">
                <label className="text-[13px] font-extrabold">המלצת AI</label>
                {locked ? (
                  <p className="whitespace-pre-wrap text-[13px] leading-relaxed [overflow-wrap:anywhere]">
                    {captionIg || '—'}
                  </p>
                ) : (
                  <>
                    <textarea
                      rows={8}
                      value={aiEdit}
                      onChange={(e) => {
                        setAiEdit(e.target.value)
                        setUseAiText(true)
                      }}
                      className="min-h-[180px] w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-[13px] leading-relaxed"
                      placeholder="המלצת AI — אפשר לשנות מילים כאן…"
                    />
                    <p className="text-[11px] text-[var(--text-light)]">
                      אפשר לערוך כאן. שמירה ואישור לוקחים את הגרסה שעריכתם.
                    </p>
                  </>
                )}
              </section>

              {!locked ? (
                <>
                  <div className="flex flex-wrap gap-4 text-[13px]">
                    <label className="flex items-center gap-2">
                      <input type="radio" checked={useAiText} onChange={() => setUseAiText(true)} />
                      השתמש בניסוח ה-AI
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        checked={!useAiText}
                        onChange={() => {
                          setUseAiText(false)
                          if (!manualCaption.trim() && aiEdit.trim()) setManualCaption(stripHashtags(aiEdit))
                        }}
                      />
                      כתוב בעצמי (AI לא נוגע בטקסט)
                    </label>
                  </div>

                  <label className="flex items-start gap-2 text-[13px]">
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={includeHashtags}
                      onChange={(e) => applyHashtagToggle(e.target.checked)}
                    />
                    <span>
                      עם האשטגים בסוף הפוסט
                      <span className="mt-0.5 block text-[11px] text-[var(--text-light)]">
                        3–5 תגיות בשורה נפרדת באינסטגרם. כבוי = נקי יותר לפייסבוק.
                      </span>
                    </span>
                  </label>

                  {!useAiText ? (
                    <textarea
                      rows={5}
                      value={manualCaption}
                      onChange={(e) => setManualCaption(e.target.value)}
                      className="min-h-[120px] w-full rounded-lg border border-[var(--border)] px-3 py-2 text-[13px]"
                      placeholder="טקסט הפוסט…"
                    />
                  ) : null}

                  <section className="space-y-2 rounded-xl border border-[var(--border)] bg-white p-4">
                    <label className="text-[13px] font-extrabold" htmlFor="social-idea">
                      הרעיון שלי
                    </label>
                    <p className="text-[11px] leading-relaxed text-[var(--text-light)]">
                      כתבו נושא או רעיון — AI ינסח פוסט בשפת beosystem.com. אחר כך אפשר לאשר או לערוך.
                    </p>
                    <textarea
                      id="social-idea"
                      rows={3}
                      value={userNotes}
                      onChange={(e) => setUserNotes(e.target.value)}
                      className="min-h-[88px] w-full rounded-lg border border-[var(--border)] px-3 py-2 text-[13px]"
                      placeholder="למשל: למה עסק בינוני צריך סוכן AI במקום עוד צ׳אטבוט, או Beo OS כמרכז שליטה…"
                    />
                    <button
                      type="button"
                      disabled={composing || !userNotes.trim()}
                      onClick={() => void composeFromIdea()}
                      className="rounded-xl border border-[var(--border)] bg-zinc-50 px-3.5 py-2 text-[13px] font-semibold disabled:opacity-60"
                    >
                      {composing ? 'מנסחים…' : '✨ נסח פוסט לפי הרעיון'}
                    </button>
                  </section>

                  <div className="flex flex-wrap gap-3">
                    <label className="text-[12px] font-extrabold">
                      שעה
                      <input
                        type="time"
                        value={form.time}
                        onChange={(e) => setForm((f) => ({ ...f, time: e.target.value }))}
                        className="ms-2 rounded-lg border border-[var(--border)] px-2 py-1"
                      />
                    </label>
                    <label className="text-[12px] font-extrabold">
                      פורמט
                      <select
                        value={form.formats}
                        onChange={(e) => setForm((f) => ({ ...f, formats: e.target.value as FormatChoice }))}
                        className="ms-2 rounded-lg border border-[var(--border)] px-2 py-1"
                      >
                        <option value="feed">פיד</option>
                        <option value="story">סטורי</option>
                        <option value="both">פיד + סטורי</option>
                      </select>
                    </label>
                  </div>

                  <div className="rounded-2xl border border-[var(--border)] bg-[var(--brand-light)]/35 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-[13px] font-extrabold">יצירת ויזואל עם כיתוב בעברית</h3>
                      <span className="text-[11px] text-[var(--text-light)]">gpt-image-2 · מיתוג Beo</span>
                    </div>
                    <p className="mt-1 text-[12px] leading-relaxed text-[var(--text-mid)]">
                      מודל התמונה של OpenAI מייצר תמונות חדות עם עברית RTL — לא סרטונים.
                    </p>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      <input
                        value={form.headline}
                        onChange={(e) => setForm((f) => ({ ...f, headline: e.target.value }))}
                        className="rounded-xl border border-[var(--border)] bg-white px-3 py-2 text-[13px]"
                        placeholder="כותרת על התמונה בעברית"
                      />
                      <input
                        value={form.sub}
                        onChange={(e) => setForm((f) => ({ ...f, sub: e.target.value }))}
                        className="rounded-xl border border-[var(--border)] bg-white px-3 py-2 text-[13px]"
                        placeholder="שורה שנייה (אופציונלי)"
                      />
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={generating}
                        onClick={() => void generate()}
                        className="rounded-xl bg-[var(--brand)] px-3.5 py-2 text-[13px] font-bold text-white disabled:opacity-60"
                      >
                        {generating ? 'יוצרים תמונה…' : '✨ צור תמונה ממותגת'}
                      </button>
                      <button
                        type="button"
                        disabled
                        title="מודל התמונה לא מייצר וידאו."
                        className="rounded-xl border border-[var(--border)] bg-white px-3.5 py-2 text-[13px] font-semibold text-[var(--text-light)]"
                      >
                        סרטון — בקרוב
                      </button>
                    </div>
                    {generating ? (
                      <p className="mt-2 text-[12px] text-[var(--text-mid)]">זה לוקח עד דקה. אל תסגרו את החלון.</p>
                    ) : null}
                  </div>

                  <label className="block text-[12px] font-extrabold">קישור לתמונה (או אחרי יצירה)</label>
                  <input
                    value={form.image_url}
                    onChange={(e) => setForm((f) => ({ ...f, image_url: e.target.value }))}
                    className="w-full rounded-xl border border-[var(--border)] px-3 py-2 text-[13px]"
                    placeholder="https://… או קובץ שנוצר כאן"
                  />
                  {form.image_url ? (
                    <img
                      src={socialMediaSrc(form.image_url)}
                      alt="תמונת הפוסט"
                      className="h-20 w-20 rounded-xl object-cover"
                    />
                  ) : null}
                </>
              ) : null}

              {error ? <p className="text-[13px] font-semibold text-red-700">{error}</p> : null}
              {current?.error ? <p className="text-[12px] text-red-700">{current.error}</p> : null}
            </div>

            <div className={`p-5 ${preview === 'story' ? 'bg-zinc-950' : 'bg-[#f0f2f5]'}`}>
              <div className="mb-4 flex justify-center gap-1 rounded-xl bg-white p-1 shadow-sm">
                {(
                  [
                    ['instagram', 'אינסטגרם'],
                    ['facebook', 'פייסבוק'],
                    ['story', 'סטורי'],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setPreview(id)}
                    className={`flex-1 rounded-lg px-3 py-1.5 text-[12px] font-extrabold ${
                      preview === id
                        ? id === 'instagram'
                          ? 'bg-gradient-to-r from-[#f58529] via-[#dd2a7b] to-[#8134af] text-white'
                          : id === 'facebook'
                            ? 'bg-[#1877f2] text-white'
                            : 'bg-zinc-800 text-white'
                        : 'text-[var(--text-mid)]'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="flex min-h-[420px] items-start justify-center py-2">
                {preview === 'instagram' ? (
                  <InstagramFeedPreview caption={captionIg} imageUrl={previewImage} />
                ) : null}
                {preview === 'facebook' ? (
                  <FacebookFeedPreview
                    caption={captionFb}
                    imageUrl={previewImage}
                    publishTime={form.time}
                  />
                ) : null}
                {preview === 'story' ? (
                  <StoryPreview imageUrl={form.story_image_url || form.image_url} />
                ) : null}
              </div>
            </div>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-[var(--border)] bg-white px-5 py-3">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy || locked}
              onClick={() => void saveDraft()}
              className="rounded-xl border border-[var(--border)] bg-white px-3.5 py-2 text-[13px] font-semibold disabled:opacity-60"
            >
              שמור טיוטה
            </button>
            <button
              type="button"
              disabled={busy || locked}
              onClick={() => void sendReview()}
              className="rounded-xl border border-[var(--border)] bg-white px-3.5 py-2 text-[13px] font-semibold disabled:opacity-60"
            >
              שלח לאישור
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {current && (current.status === 'draft' || current.status === 'pending_review' || current.status === 'failed') ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void runAction('skip')}
                className="rounded-xl border border-[var(--border)] px-3.5 py-2 text-[13px] font-semibold disabled:opacity-60"
              >
                דלג
              </button>
            ) : null}
            <button
              type="button"
              disabled={busy || locked}
              onClick={() => void runAction('approve')}
              className="rounded-xl bg-emerald-600 px-3.5 py-2 text-[13px] font-bold text-white disabled:opacity-60"
            >
              אשר לתזמון
            </button>
            <button
              type="button"
              disabled={busy || locked}
              onClick={() => void runAction('publish')}
              className="rounded-xl bg-[var(--brand)] px-3.5 py-2 text-[13px] font-bold text-white disabled:opacity-60"
            >
              פרסם עכשיו
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
