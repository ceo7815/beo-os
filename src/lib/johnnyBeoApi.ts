export type JohnnyOverview = {
  ok: boolean
  on?: boolean
  os_connected?: boolean
  telegram?: boolean
  openai?: boolean
  gmail?: boolean
  calendar?: boolean
  actor_id?: string
  pending?: { id?: string; kind?: string; summary?: string } | null
  open_tasks?: number
  due_today?: number
  shay_pending?: number
  adi_pending?: number
  mailbox?: string
  calendar_master?: string
  actions?: Array<{ at?: string; kind?: string; detail?: string }>
}

async function readJsonSafe(res: Response): Promise<unknown> {
  try {
    return await res.json()
  } catch {
    return null
  }
}

export async function fetchJohnnyOverview(): Promise<
  { ok: true; data: JohnnyOverview } | { ok: false; error: string }
> {
  try {
    const res = await fetch('/api/beo-agents/johnny/overview')
    const data = (await readJsonSafe(res)) as JohnnyOverview | null
    if (!res.ok || !data?.ok) {
      return { ok: false, error: (data as { error?: string } | null)?.error || `HTTP ${res.status}` }
    }
    return { ok: true, data }
  } catch {
    return { ok: false, error: 'צי הסוכנים לא זמין' }
  }
}
