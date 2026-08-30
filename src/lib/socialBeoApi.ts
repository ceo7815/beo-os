export type SocialPostStatus =
  | 'draft'
  | 'pending_review'
  | 'scheduled'
  | 'publishing'
  | 'published'
  | 'failed'
  | 'skipped'
  | string

export type SocialPost = {
  id: string
  scheduled_at: string
  status: SocialPostStatus
  caption?: string
  caption_ig?: string
  caption_fb?: string
  platforms?: string[]
  formats?: string[]
  image_url?: string
  story_image_url?: string
  media_mode?: string
  user_notes?: string
  image_prompt?: string
  ai_suggestion?: string
  include_hashtags?: boolean
  caption_locked?: boolean
  approved_at?: string | null
  published_at?: string | null
  meta_ids?: Record<string, unknown> | null
  analytics?: Record<string, number>
  error?: string | null
  queue_trigger?: string | null
  queue_status?: string | null
}

export type SocialInboxItem = {
  id: string
  platform?: string
  author_name?: string | null
  body?: string
  received_at?: string
  status?: string
}

export type SocialOverview = {
  ok: boolean
  date?: string
  pending_review?: number
  scheduled?: number
  published?: number
  failed?: number
  inbox_new?: number
  meta_connected?: boolean
  instagram_connected?: boolean
  dry_run?: boolean
  settings?: {
    brand?: { name?: string; website?: string; visualLanguage?: string }
    default_publish_time?: string
    tone_guidelines?: string
  }
  status_labels?: Record<string, string>
}

async function readJsonSafe(res: Response): Promise<unknown> {
  try {
    return await res.json()
  } catch {
    return null
  }
}

export async function fetchSocialOverview(): Promise<
  { ok: true; data: SocialOverview } | { ok: false; error: string }
> {
  try {
    const res = await fetch('/api/beo-agents/social/overview')
    const data = (await readJsonSafe(res)) as SocialOverview | null
    if (!res.ok || !data?.ok) {
      return { ok: false, error: (data as { error?: string } | null)?.error || `HTTP ${res.status}` }
    }
    return { ok: true, data }
  } catch {
    return { ok: false, error: 'צי הסוכנים לא זמין' }
  }
}

export async function fetchSocialPosts(
  year: number,
  month: number,
): Promise<{ ok: true; items: SocialPost[] } | { ok: false; error: string }> {
  try {
    const res = await fetch(`/api/beo-agents/social/posts?year=${year}&month=${month}`)
    const data = (await readJsonSafe(res)) as { ok?: boolean; items?: SocialPost[]; error?: string } | null
    if (!res.ok || !data?.ok) {
      return { ok: false, error: data?.error || `HTTP ${res.status}` }
    }
    return { ok: true, items: data.items ?? [] }
  } catch {
    return { ok: false, error: 'טעינת יומן נכשלה' }
  }
}

export async function fetchSocialInbox(): Promise<
  { ok: true; items: SocialInboxItem[] } | { ok: false; error: string }
> {
  try {
    const res = await fetch('/api/beo-agents/social/inbox')
    const data = (await readJsonSafe(res)) as { ok?: boolean; items?: SocialInboxItem[]; error?: string } | null
    if (!res.ok || !data?.ok) {
      return { ok: false, error: data?.error || `HTTP ${res.status}` }
    }
    return { ok: true, items: data.items ?? [] }
  } catch {
    return { ok: false, error: 'תיבת תגובות לא זמינה' }
  }
}

export async function createSocialPost(
  body: Partial<SocialPost> & { status?: string },
): Promise<{ ok: true; item: SocialPost } | { ok: false; error: string }> {
  try {
    const res = await fetch('/api/beo-agents/social/posts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = (await readJsonSafe(res)) as { ok?: boolean; item?: SocialPost; error?: string } | null
    if (!res.ok || !data?.ok || !data.item) {
      return { ok: false, error: data?.error || `HTTP ${res.status}` }
    }
    return { ok: true, item: data.item }
  } catch {
    return { ok: false, error: 'יצירת פוסט נכשלה' }
  }
}

export async function postSocialAction(
  id: string,
  action: 'update' | 'approve' | 'skip' | 'publish',
  body?: Record<string, unknown>,
): Promise<{ ok: true; item?: SocialPost } | { ok: false; error: string }> {
  try {
    const res = await fetch(`/api/beo-agents/social/posts/${id}/${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body ?? {}),
    })
    const data = (await readJsonSafe(res)) as {
      ok?: boolean
      item?: SocialPost
      error?: string
    } | null
    if (!res.ok || !data?.ok) {
      return { ok: false, error: data?.error || `HTTP ${res.status}` }
    }
    return { ok: true, item: data.item }
  } catch {
    return { ok: false, error: 'פעולה נכשלה' }
  }
}

export async function composeSocialCaption(body: {
  idea: string
  date?: string
  include_hashtags?: boolean
}): Promise<
  | { ok: true; body: string; caption_ig: string; caption_fb: string }
  | { ok: false; error: string }
> {
  try {
    const res = await fetch('/api/beo-agents/social/compose-caption', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = (await readJsonSafe(res)) as {
      ok?: boolean
      body?: string
      caption_ig?: string
      caption_fb?: string
      error?: string
    } | null
    if (!res.ok || !data?.ok || !data.body) {
      return { ok: false, error: data?.error || `HTTP ${res.status}` }
    }
    return {
      ok: true,
      body: data.body,
      caption_ig: data.caption_ig || data.body,
      caption_fb: data.caption_fb || data.body,
    }
  } catch {
    return { ok: false, error: 'ניסוח הפוסט נכשל' }
  }
}

export const BEO_HASHTAGS = ['#BeoSystems', '#סוכניAI', '#בינהמלאכותית', '#פיתוחתוכנה', '#BeoOS']

const TAG_TAIL = /(?:\n*(?:#[\u0590-\u05FFa-zA-Z0-9_]+(?:\s+|$))+)\s*$/

export function stripHashtags(text: string): string {
  return (text || '').replace(/\r\n/g, '\n').replace(TAG_TAIL, '').trim()
}

export function withHashtags(text: string, on: boolean): string {
  const body = stripHashtags(text)
  if (!on || !body) return body
  return `${body}\n\n${BEO_HASHTAGS.join(' ')}`
}

export async function generateSocialImage(body: {
  headline: string
  sub?: string
  format?: 'feed' | 'story'
}): Promise<{ ok: true; url: string; file: string } | { ok: false; error: string }> {
  try {
    const res = await fetch('/api/beo-agents/social/generate-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = (await readJsonSafe(res)) as {
      ok?: boolean
      url?: string
      file?: string
      error?: string
    } | null
    if (!res.ok || !data?.ok || !data.url || !data.file) {
      return { ok: false, error: data?.error || `HTTP ${res.status}` }
    }
    const url = data.url.startsWith('/api/beo-agents')
      ? data.url
      : data.url.startsWith('/api/')
        ? `/api/beo-agents${data.url.slice(4)}`
        : data.url
    return { ok: true, url, file: data.file }
  } catch {
    return { ok: false, error: 'יצירת התמונה נכשלה' }
  }
}

export async function refreshSocialInbox(): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await fetch('/api/beo-agents/social/refresh-inbox', { method: 'POST' })
    const data = (await readJsonSafe(res)) as { ok?: boolean; error?: string } | null
    if (!res.ok || !data?.ok) {
      return { ok: false, error: data?.error || `HTTP ${res.status}` }
    }
    return { ok: true }
  } catch {
    return { ok: false, error: 'רענון תגובות נכשל' }
  }
}

export const SOCIAL_STATUS_HE: Record<string, string> = {
  draft: 'טיוטה',
  pending_review: 'ממתין לאישור',
  scheduled: 'מאושר / מתוזמן',
  publishing: 'מפרסם',
  published: 'פורסם',
  failed: 'נכשל',
  skipped: 'דולג',
}

export function ilDateKey(iso: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Jerusalem',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(iso))
  } catch {
    return (iso || '').slice(0, 10)
  }
}
