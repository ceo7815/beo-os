import { MORNING_BASE_URLS } from '../config/env.js'
import type { MorningCredentials } from './morningCredentials.js'

/**
 * לקוח API לחשבונית ירוקה (Morning).
 * - אימות JWT דרך POST /account/token, עם cache ורענון אוטומטי (~30 דק׳).
 * - rate limiting ~3 בקשות לשנייה.
 * - retry פעם אחת על 401 (טוקן פג).
 */

export type MorningDocument = Record<string, unknown>

export type SearchDocumentsParams = {
  fromDate: string // YYYY-MM-DD
  toDate: string // YYYY-MM-DD
  types?: number[]
  page?: number
  pageSize?: number
}

export type SearchDocumentsResult = {
  items: MorningDocument[]
  total: number
  page: number
  pages: number
}

type TokenState = {
  token: string
  expiresAtMs: number
}

const RATE_LIMIT_MS = 350 // ~3 בקשות לשנייה

export class MorningClient {
  private readonly baseUrl: string
  private readonly creds: MorningCredentials
  private tokenState: TokenState | null = null
  private lastRequestAt = 0

  constructor(creds: MorningCredentials) {
    this.creds = creds
    this.baseUrl = MORNING_BASE_URLS[creds.env]
  }

  private async throttle(): Promise<void> {
    const now = Date.now()
    const wait = this.lastRequestAt + RATE_LIMIT_MS - now
    if (wait > 0) await new Promise((r) => setTimeout(r, wait))
    this.lastRequestAt = Date.now()
  }

  /** מבקש טוקן JWT חדש מ-Morning */
  private async fetchToken(): Promise<TokenState> {
    await this.throttle()
    const res = await fetch(`${this.baseUrl}/account/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: this.creds.keyId,
        secret: this.creds.keySecret,
        // API 2.0 (יוני 2026) דורש grant_type מפורש
        grant_type: 'client_credentials',
      }),
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new MorningError(
        res.status === 401
          ? 'מפתח API לא תקין — בדקו מזהה/סוד בחשבונית ירוקה'
          : `שגיאת אימות מול חשבונית ירוקה (${res.status})`,
        res.status,
        text,
      )
    }

    const data = (await res.json()) as { token?: string; expires?: number }
    if (!data.token) {
      throw new MorningError('לא התקבל טוקן מחשבונית ירוקה', 500, JSON.stringify(data))
    }
    // expires הוא unix שניות; אם חסר — 25 דקות ברירת מחדל
    const expiresAtMs =
      typeof data.expires === 'number' && data.expires > 0
        ? data.expires * 1000
        : Date.now() + 25 * 60 * 1000
    return { token: data.token, expiresAtMs }
  }

  /** טוקן תקף (עם מרווח ביטחון של דקה) */
  private async getToken(forceRefresh = false): Promise<string> {
    const safeNow = Date.now() + 60 * 1000
    if (!forceRefresh && this.tokenState && this.tokenState.expiresAtMs > safeNow) {
      return this.tokenState.token
    }
    this.tokenState = await this.fetchToken()
    return this.tokenState.token
  }

  /** בקשה אותנטית עם retry יחיד על 401 */
  private async authedRequest<T>(
    path: string,
    init: RequestInit,
    isRetry = false,
  ): Promise<T> {
    await this.throttle()
    const token = await this.getToken(isRetry)
    const res = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...(init.headers ?? {}),
      },
    })

    if (res.status === 401 && !isRetry) {
      this.tokenState = null
      return this.authedRequest<T>(path, init, true)
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new MorningError(
        `שגיאה בקריאה ל-Morning ${path} (${res.status})`,
        res.status,
        text,
      )
    }

    return (await res.json()) as T
  }

  /** בדיקת חיבור — מאמת מפתחות ומחזיר פרטי העסק */
  async verifyConnection(): Promise<{ ok: true; business?: unknown }> {
    await this.getToken(true)
    try {
      const business = await this.authedRequest<unknown>('/businesses/me', {
        method: 'GET',
      })
      return { ok: true, business }
    } catch {
      // אם הטוקן התקבל אך /businesses/me נכשל — עדיין נחשב מחובר
      return { ok: true }
    }
  }

  /** חיפוש מסמכים בעמוד יחיד */
  async searchDocuments(
    params: SearchDocumentsParams,
  ): Promise<SearchDocumentsResult> {
    const body: Record<string, unknown> = {
      fromDate: params.fromDate,
      toDate: params.toDate,
      page: params.page ?? 1,
      pageSize: params.pageSize ?? 100,
      sort: 'documentDate',
    }
    if (params.types && params.types.length > 0) body.type = params.types

    const data = await this.authedRequest<{
      items?: MorningDocument[]
      total?: number
      page?: number
      pages?: number
    }>('/documents/search', {
      method: 'POST',
      body: JSON.stringify(body),
    })

    return {
      items: Array.isArray(data.items) ? data.items : [],
      total: typeof data.total === 'number' ? data.total : 0,
      page: typeof data.page === 'number' ? data.page : (params.page ?? 1),
      pages: typeof data.pages === 'number' ? data.pages : 1,
    }
  }

  /** שליפת כל המסמכים בטווח — עובר על כל העמודים */
  async searchAllDocuments(
    params: Omit<SearchDocumentsParams, 'page'>,
  ): Promise<MorningDocument[]> {
    const pageSize = params.pageSize ?? 100
    const all: MorningDocument[] = []
    let page = 1
    let pages = 1
    do {
      const result = await this.searchDocuments({ ...params, page, pageSize })
      all.push(...result.items)
      pages = result.pages || 1
      page += 1
      if (page > 500) break // הגנה מפני לולאה אינסופית
    } while (page <= pages)
    return all
  }

  /** חיפוש לקוחות בעמוד יחיד */
  async searchClients(params: {
    page?: number
    pageSize?: number
    active?: boolean
  }): Promise<SearchDocumentsResult> {
    const body: Record<string, unknown> = {
      page: params.page ?? 1,
      pageSize: params.pageSize ?? 100,
    }
    if (typeof params.active === 'boolean') body.active = params.active

    const data = await this.authedRequest<{
      items?: MorningDocument[]
      total?: number
      page?: number
      pages?: number
    }>('/clients/search', {
      method: 'POST',
      body: JSON.stringify(body),
    })

    return {
      items: Array.isArray(data.items) ? data.items : [],
      total: typeof data.total === 'number' ? data.total : 0,
      page: typeof data.page === 'number' ? data.page : (params.page ?? 1),
      pages: typeof data.pages === 'number' ? data.pages : 1,
    }
  }

  /** חיפוש הוצאות בעמוד יחיד */
  async searchExpenses(params: {
    fromDate: string
    toDate: string
    page?: number
    pageSize?: number
    types?: number[]
  }): Promise<SearchDocumentsResult> {
    const body: Record<string, unknown> = {
      fromDate: params.fromDate,
      toDate: params.toDate,
      page: params.page ?? 1,
      pageSize: params.pageSize ?? 100,
      sort: 'documentDate',
    }
    if (params.types && params.types.length > 0) body.type = params.types

    const data = await this.authedRequest<{
      items?: MorningDocument[]
      total?: number
      page?: number
      pages?: number
    }>('/expenses/search', {
      method: 'POST',
      body: JSON.stringify(body),
    })

    return {
      items: Array.isArray(data.items) ? data.items : [],
      total: typeof data.total === 'number' ? data.total : 0,
      page: typeof data.page === 'number' ? data.page : (params.page ?? 1),
      pages: typeof data.pages === 'number' ? data.pages : 1,
    }
  }

  /** שליפת כל ההוצאות בטווח — עובר על כל העמודים */
  async searchAllExpenses(params: {
    fromDate: string
    toDate: string
    pageSize?: number
    types?: number[]
  }): Promise<MorningDocument[]> {
    const pageSize = params.pageSize ?? 100
    const all: MorningDocument[] = []
    let page = 1
    let pages = 1
    do {
      const result = await this.searchExpenses({ ...params, page, pageSize })
      all.push(...result.items)
      pages = result.pages || 1
      page += 1
      if (page > 500) break
    } while (page <= pages)
    return all
  }

  /** שליפת הוצאה בודדת מ-GI */
  async getExpense(id: string): Promise<MorningDocument> {
    return this.authedRequest<MorningDocument>(
      `/expenses/${encodeURIComponent(id)}`,
      { method: 'GET' },
    )
  }

  /** קישור הורדה להוצאה — לעיתים זמין רק בתוצאות search */
  async findExpenseDownloadUrl(
    greenInvoiceId: string,
  ): Promise<{ url: string } | null> {
    const now = new Date()
    const toDate = now.toISOString().slice(0, 10)
    const from = new Date(now)
    from.setFullYear(from.getFullYear() - 10)
    const fromDate = from.toISOString().slice(0, 10)
    const result = await this.searchExpenses({
      fromDate,
      toDate,
      page: 1,
      pageSize: 100,
    })
    const hit = result.items.find((item) => {
      const id = item.id ?? item._id
      return typeof id === 'string' && id === greenInvoiceId
    })
    const url =
      typeof hit?.url === 'string' && /^https?:\/\//i.test(hit.url)
        ? hit.url.trim()
        : null
    return url ? { url } : null
  }

  /** הורדת קובץ מכתובת חיצונית (קישור חתום מ-GI) */
  async fetchBinaryUrl(
    url: string,
  ): Promise<{ data: ArrayBuffer; contentType: string | null }> {
    await this.throttle()
    const token = await this.getToken()
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) {
      const res2 = await fetch(url)
      if (!res2.ok) {
        throw new MorningError(
          `לא ניתן להוריד את המסמך (${res.status})`,
          res.status,
        )
      }
      return {
        data: await res2.arrayBuffer(),
        contentType: res2.headers.get('content-type'),
      }
    }
    return {
      data: await res.arrayBuffer(),
      contentType: res.headers.get('content-type'),
    }
  }

  /** שליפת כל הלקוחות בפילוח active נתון — עובר על כל העמודים */
  async searchAllClients(
    active?: boolean,
    pageSize = 100,
  ): Promise<MorningDocument[]> {
    const all: MorningDocument[] = []
    let page = 1
    let pages = 1
    do {
      const result = await this.searchClients({ page, pageSize, active })
      all.push(...result.items)
      pages = result.pages || 1
      page += 1
      if (page > 500) break
    } while (page <= pages)
    return all
  }

  /**
   * מסמכים מקושרים (למשל קבלות ששולמו כנגד חשבון עסקה).
   * נכשל בשקט → מערך ריק, כדי לא להפיל סנכרון שלם.
   */
  async getLinkedDocuments(documentId: string): Promise<MorningDocument[]> {
    try {
      const data = await this.authedRequest<unknown>(
        `/documents/${encodeURIComponent(documentId)}/linked`,
        { method: 'GET' },
      )
      if (Array.isArray(data)) return data as MorningDocument[]
      if (data && typeof data === 'object') {
        const obj = data as Record<string, unknown>
        if (Array.isArray(obj.items)) return obj.items as MorningDocument[]
        if (Array.isArray(obj.documents)) return obj.documents as MorningDocument[]
        if (Array.isArray(obj.linked)) return obj.linked as MorningDocument[]
      }
      return []
    } catch {
      return []
    }
  }
}

export class MorningError extends Error {
  readonly status: number
  readonly detail?: string
  constructor(message: string, status: number, detail?: string) {
    super(message)
    this.name = 'MorningError'
    this.status = status
    this.detail = detail
  }
}
