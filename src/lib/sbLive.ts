import { requireSupabase } from './supabase'

export function subscribeTable(
  table: string,
  onRows: (rows: Record<string, unknown>[]) => void,
  onError: (err: Error) => void,
): () => void {
  const sb = requireSupabase()
  let cancelled = false

  const load = async () => {
    const { data, error } = await sb.from(table).select('*')
    if (cancelled) return
    if (error) {
      onError(new Error(error.message))
      return
    }
    onRows((data ?? []) as Record<string, unknown>[])
  }

  void load()
  const channel = sb
    .channel(`${table}-live`)
    .on('postgres_changes', { event: '*', schema: 'public', table }, () => {
      void load()
    })
    .subscribe()

  return () => {
    cancelled = true
    void sb.removeChannel(channel)
  }
}

export function emptyToNull(value: string | null | undefined): string | null {
  const t = value?.trim()
  return t ? t : null
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function uuidOrNull(value: string | null | undefined): string | null {
  const t = value?.trim()
  if (!t) return null
  return UUID_RE.test(t) ? t : null
}

export function uuidList(ids: string[] | undefined | null): string[] {
  if (!ids?.length) return []
  return ids.map((id) => uuidOrNull(id)).filter((id): id is string => Boolean(id))
}

export function isMissingRelation(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false
  const msg = error.message ?? ''
  return (
    error.code === '42P01' ||
    error.code === 'PGRST205' ||
    /does not exist|schema cache|could not find the table/i.test(msg)
  )
}

export function isDeleteSentinel(value: unknown): boolean {
  return Boolean(value && typeof value === 'object' && '_methodName' in (value as object))
}
