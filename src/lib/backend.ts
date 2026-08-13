export function isSupabaseConfigured(): boolean {
  const url = String(import.meta.env.VITE_SUPABASE_URL ?? '').trim()
  const key = String(import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim()
  return url.startsWith('https://') && key.length > 20
}

/** Firestore של החברה הישנה — כבוי כשסופה בייס מוגדר. */
export function isLegacyFirestoreEnabled(): boolean {
  return !isSupabaseConfigured()
}
