import { useHubRealtimeBubbleStore } from '../store/hubRealtimeBubbleStore'

/** כותרת ברירת המחדל של הטאב — חייב להתאים ל־index.html */
export const HUB_TAB_TITLE_BASE = 'האב — ניהול סוכנות'

let tabUnreadCount = 0

export function getHubTabUnreadCount(): number {
  return tabUnreadCount
}

export function clearHubTabUnread(): void {
  tabUnreadCount = 0
  document.title = HUB_TAB_TITLE_BASE
}

/** מונה בכותרת הטאב כשהדף ברקע */
export function bumpHubTabUnreadIfHidden(): void {
  if (typeof document === 'undefined') return
  if (document.visibilityState !== 'hidden') return
  tabUnreadCount += 1
  document.title = `(${tabUnreadCount}) ${HUB_TAB_TITLE_BASE}`
}

export function requestHubNotificationPermissionLater(delayMs = 2000): void {
  if (typeof window === 'undefined' || !('Notification' in window)) return
  if (Notification.permission !== 'default') return
  window.setTimeout(() => {
    if (Notification.permission !== 'default') return
    void Notification.requestPermission().catch(() => {
      /* המשתמש דחה או דפדפן חוסם */
    })
  }, delayMs)
}

export type HubDesktopNotifyArgs = {
  title: string
  body: string
  /** מונע כפילות — אותו tag מחליף התראה קודמת בחלק מהמערכות */
  tag: string
}

/**
 * התראת מערכת — עיצוב מלא כמו בדף אי אפשר; משתמשים באייקון האתר ו־RTL.
 * מוצג כשהטאב לא פעיל (כדי לא להציק כשעובדים באותו טאב).
 */
export function showHubDesktopNotification(args: HubDesktopNotifyArgs): void {
  if (typeof window === 'undefined' || !('Notification' in window)) return
  if (Notification.permission !== 'granted') return
  if (document.visibilityState !== 'hidden') return
  try {
    new Notification(args.title, {
      body: args.body,
      icon: `${window.location.origin}/favicon.svg`,
      badge: `${window.location.origin}/favicon.svg`,
      tag: args.tag,
      lang: 'he',
      dir: 'rtl',
      silent: false,
    })
  } catch {
    /* חלק מהדפדפנים חוסמים התראה */
  }
}

export function notifyHubBackground(args: HubDesktopNotifyArgs): void {
  bumpHubTabUnreadIfHidden()
  showHubDesktopNotification(args)
  useHubRealtimeBubbleStore.getState().pushBubble({
    title: args.title,
    body: args.body,
  })
}

export function truncateNotifyText(s: string, maxLen: number): string {
  const t = s.replace(/\s+/g, ' ').trim()
  if (t.length <= maxLen) return t
  return `${t.slice(0, Math.max(0, maxLen - 1))}…`
}
