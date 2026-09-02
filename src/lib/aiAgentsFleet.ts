export type AgentStatus = 'live' | 'planned' | 'down' | string

export type AgentConnection = {
  kind: string
  label: string
  connected: boolean
  note?: string
}

export type FleetAgent = {
  id: string
  handle: string
  display_name: string
  role: string
  purpose?: string
  status: AgentStatus
  running: boolean
  publish?: string
  connections: AgentConnection[]
}

export type FleetResponse = {
  company?: string
  counts?: {
    total?: number
    live?: number
    running?: number
    down?: number
    planned?: number
  }
  agents: FleetAgent[]
}

export const FLEET_DOWN_HE =
  'צי הסוכנים לא רץ. צריך להפעיל את Beo-agents control על פורט 8788'

async function readJsonSafe(res: Response): Promise<unknown> {
  try {
    return await res.json()
  } catch {
    return null
  }
}

/**
 * Instagram/Facebook עם publish=preview אינם «מחוברים» לפרסום —
 * גם אם ה-API יחזיר connected בטעות.
 */
export function honestConnections(agent: Pick<FleetAgent, 'connections' | 'publish'>): AgentConnection[] {
  const preview = (agent.publish ?? '').toLowerCase() === 'preview'
  return (agent.connections ?? []).map((c) => {
    const kind = (c.kind ?? '').toLowerCase()
    if (preview && (kind === 'instagram' || kind === 'facebook')) {
      return { ...c, connected: false }
    }
    return c
  })
}

export function normalizeFleetAgent(raw: FleetAgent): FleetAgent {
  return {
    ...raw,
    connections: honestConnections(raw),
  }
}

export async function fetchAiAgentsFleet(): Promise<
  { ok: true; data: FleetResponse } | { ok: false; error: string }
> {
  try {
    const res = await fetch('/api/beo-agents/fleet')
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = (await readJsonSafe(res)) as FleetResponse | null
    if (!data || !Array.isArray(data.agents)) {
      throw new Error('invalid fleet payload')
    }
    return {
      ok: true,
      data: {
        ...data,
        agents: data.agents.map(normalizeFleetAgent),
      },
    }
  } catch {
    return { ok: false, error: FLEET_DOWN_HE }
  }
}

export async function postAgentGateway(
  agentId: string,
  action: 'start' | 'stop',
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await fetch(`/api/beo-agents/agents/${agentId}/${action}`, {
      method: 'POST',
    })
    if (!res.ok) {
      const body = (await readJsonSafe(res)) as { message?: string; error?: string } | null
      return {
        ok: false,
        error: body?.message || body?.error || `HTTP ${res.status}`,
      }
    }
    return { ok: true }
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'פעולה נכשלה',
    }
  }
}

export function statusLabel(agent: Pick<FleetAgent, 'status' | 'running'>): string {
  if (agent.status === 'planned') return 'בקרוב'
  if (agent.status === 'live' && agent.running) return 'חי'
  if (agent.status === 'live') return 'כבוי'
  if (agent.status === 'down') return 'כבוי'
  return String(agent.status || '—')
}

export function statusTone(agent: Pick<FleetAgent, 'status' | 'running'>): string {
  if (agent.status === 'planned') return 'bg-[var(--brand-light)] text-[var(--brand-deep)]'
  if (agent.status === 'live' && agent.running) return 'bg-emerald-50 text-emerald-800'
  return 'bg-[var(--surface-muted)] text-[var(--text-mid)]'
}
