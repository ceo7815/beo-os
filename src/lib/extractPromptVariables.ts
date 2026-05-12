/**
 * מחלץ מחרוזות ייחודיות מתוך placeholders בסגנון {{שם_משתנה}}.
 * רווחים פנימיים מנוקים; כפילויות מוסרות לפי סדר הופעה.
 */
export function extractPromptVariables(text: string): string[] {
  const re = /\{\{\s*([^}]+?)\s*\}\}/g
  const seen = new Set<string>()
  const out: string[] = []
  let m: RegExpExecArray | null
  const s = text ?? ''
  re.lastIndex = 0
  while ((m = re.exec(s)) !== null) {
    const key = (m[1] ?? '').trim()
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(key)
  }
  return out
}
