import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useClients } from '../hooks/useClients'
import { usePasswordVault } from '../hooks/usePasswordVault'
import { useUsers } from '../hooks/useUsers'
import { useHubStore } from '../store/useStore'
import { PASSWORD_VAULT_CATEGORIES } from '../lib/passwordVaultCategories'
import { formatDateTimeIL } from '../lib/dates'
import { hubSectionClass } from '../lib/hubSectionBorder'
import { isAdminRole } from '../components/RequireAdmin'
import { ClientQuickSelect } from '../components/ClientQuickSelect'
import { Modal } from '../components/shared/Modal'
import { ConfirmDialog } from '../components/shared/ConfirmDialog'
import { EmptyState } from '../components/shared/EmptyState'
import type { Client, PasswordVaultEntry, PasswordVaultWrite, TeamMember } from '../types'

const EMPTY_VAULT_FORM: PasswordVaultWrite = {
  title: '',
  category: PASSWORD_VAULT_CATEGORIES[0],
  username: '',
  password: '',
  loginType: 'password',
  url: '',
  notes: '',
  visibleUserIds: [],
  clientId: '',
}

function maskPass(): string {
  return '••••••••'
}

/** פיצול חיפוש למילים — רווחים, פסיקים, | ; */
function tokenizeVaultSearch(raw: string): string[] {
  const t = raw.trim().toLowerCase()
  if (!t) return []
  return t.split(/[\s,|;]+/).filter(Boolean)
}

/** טקסט אחד לחיפוש מכל השדות שהמשתמש מילא */
function buildVaultHaystack(
  e: PasswordVaultEntry,
  opts: {
    client?: Client
    visibleUserNames: string
    updaterDisplayName: string
  },
): string {
  const c = opts.client
  const authSearch =
    e.loginType === 'google'
      ? 'google gmail google_workspace oauth התחברות אוטומטית התחברות עם גוגל signin'
      : e.password
  let urlHost = ''
  let urlPath = ''
  try {
    const raw = e.url.trim()
    if (raw) {
      const u = new URL(raw.includes('://') ? raw : `https://${raw}`)
      urlHost = u.hostname.replace(/^www\./i, '')
      urlPath = `${u.pathname}${u.search}${u.hash}`
    }
  } catch {
    /* ignore malformed URLs */
  }

  const parts = [
    e.title,
    e.username,
    authSearch,
    e.loginType,
    e.notes,
    e.category,
    e.url,
    urlHost,
    urlPath,
    c?.name,
    c?.contact,
    c?.phone,
    c?.email,
    c?.department ?? '',
    opts.visibleUserNames,
    opts.updaterDisplayName,
    e.updatedBy,
  ]
  return parts
    .filter((x) => x != null && String(x).trim() !== '')
    .map((x) => String(x).toLowerCase())
    .join(' ')
}

function haystackMatchesTokens(haystack: string, tokens: string[]): boolean {
  if (tokens.length === 0) return true
  return tokens.every((tok) => haystack.includes(tok))
}

export function Vault() {
  const { user } = useAuth()
  const { users, loading: usersLoading } = useUsers()
  const { clients } = useClients()
  const hubUser = useHubStore((s) => s.currentUser)

  /** תפקיד גולמי מ-Firestore (כמו ב-security rules) — לא רק המיפוי מ-useUsers */
  const roleFromTeam = users.find((m) => m.id === user?.uid)?.role ?? ''
  const hubUid = hubUser?.uid
  const hubRoleRaw = hubUser?.role
  const rawRoleForVault =
    hubUid === user?.uid && typeof hubRoleRaw === 'string' && hubRoleRaw.trim() !== ''
      ? hubRoleRaw
      : roleFromTeam
  const vaultAdmin = isAdminRole(rawRoleForVault)

  const { entries, loading, addEntry, updateEntry, removeEntry } = usePasswordVault({
    uid: user?.uid,
    usersReady: !usersLoading,
    isVaultAdmin: vaultAdmin,
  })

  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<string>('')
  /** סינון מפורש לפי לקוח משויך — מציג את כל הפריטים עם אותו clientId */
  const [clientFilterId, setClientFilterId] = useState('')

  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  const [deleteId, setDeleteId] = useState<string | null>(null)

  const [revealed, setRevealed] = useState<Record<string, boolean>>({})

  const nameByUid = useMemo(() => {
    const m = new Map<string, string>()
    for (const u of users) m.set(u.id, u.name)
    return m
  }, [users])

  const clientNameById = useMemo(() => {
    const m = new Map<string, string>()
    for (const c of clients) m.set(c.id, c.name)
    return m
  }, [clients])

  const clientById = useMemo(() => {
    const m = new Map<string, Client>()
    for (const c of clients) m.set(c.id, c)
    return m
  }, [clients])

  const filtered = useMemo(() => {
    const tokens = tokenizeVaultSearch(search)
    return entries.filter((e) => {
      if (categoryFilter && e.category !== categoryFilter) return false
      if (clientFilterId && e.clientId !== clientFilterId) return false
      const client = e.clientId ? clientById.get(e.clientId) : undefined
      const visibleUserNames = e.visibleUserIds
        .map((id) => nameByUid.get(id))
        .filter(Boolean)
        .join(' ')
      const updaterDisplayName = nameByUid.get(e.updatedBy) ?? ''
      const haystack = buildVaultHaystack(e, {
        client,
        visibleUserNames,
        updaterDisplayName,
      })
      return haystackMatchesTokens(haystack, tokens)
    })
  }, [entries, search, categoryFilter, clientFilterId, clientById, nameByUid])

  const openCreate = () => {
    setEditingId(null)
    setModalOpen(true)
  }

  const openEdit = (id: string) => {
    setEditingId(id)
    setModalOpen(true)
  }

  const toggleReveal = (id: string) => {
    setRevealed((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      /* ignore */
    }
  }

  const editing = editingId ? entries.find((x) => x.id === editingId) : undefined

  const emptyTitle =
    entries.length === 0
      ? 'אין עדיין פריטים להצגה'
      : filtered.length === 0 && clientFilterId
        ? 'אין פריטים משויכים ללקוח הזה'
        : 'לא נמצאו תוצאות'

  const emptyDescription =
    entries.length === 0
      ? vaultAdmin
        ? 'לחץ על «פריט חדש» כדי להוסיף את הרשומה הראשונה.'
        : 'לחץ על «פריט חדש» כדי להוסיף רשומה, או המתן שמנהל ישתף איתך פריטים ספציפיים (רק מי שמסומן ברשימת החשיפה רואה אותם).'
      : filtered.length === 0 && clientFilterId
        ? `לא נמצאו רשומות עם שיוך ל«${clientNameById.get(clientFilterId) ?? 'לקוח'}» — נסה לנקות את חיפוש הטקסט או את סינון הקטגוריה.`
        : 'נסה לשנות את החיפוש או הסינון.'

  return (
    <div className="beo-page space-y-4 md:space-y-6">
      <header className="space-y-1">
        <h1 className="text-[22px] font-extrabold leading-tight text-[var(--text-dark)] md:text-[26px]">
          כספת סיסמאות
        </h1>
        <p className="max-w-2xl text-[12px] leading-relaxed text-[var(--text-mid)] md:text-[13px]">
          {vaultAdmin
            ? 'ניהול מרכזי של סיסמאות ופרטי גישה — בחר מי ברשימת המשתמשים חשוף לכל רשומה. הסיסמה מוסתרת עד לחיצה על «הצג».'
            : 'אפשר להוסיף ולערוך פריטים שאתה רואה, ולבחור מי יראה אותם. תראה כאן פריטים שמנהל שיתף איתך, ששיתפת עם הצוות, או שבהם «שם משתמש / אימייל» תואם לאימייל ההתחברות שלך. פריט שמוגבל לרשימת משתמשים — לא יופיע אם לא נכללת ברשימה וגם האימייל בשדה שם המשתמש אינו שלך. הסיסמה מוסתרת עד לחיצה על «הצג».'}
        </p>
      </header>

      <div className={`space-y-3 rounded-2xl ${hubSectionClass(0)} p-3 md:space-y-4 md:p-6`}>
        <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-end md:justify-between md:gap-4">
          <div className="flex min-w-0 flex-1 flex-col gap-2 md:max-w-md">
            <label className="text-[10px] font-bold uppercase tracking-wide text-[var(--text-light)] md:text-[11px]">
              חיפוש
            </label>
            <input
              type="search"
              placeholder="חיפוש בכל השדות — מילה אחת או כמה מילים (רווח מצמצם). כולל סיסמה, לקוח, הערות, קטגוריה…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full"
            />
          </div>
          <div className="flex w-full min-w-0 flex-col gap-2 md:w-auto md:min-w-[220px]">
            <label className="text-[10px] font-bold uppercase tracking-wide text-[var(--text-light)] md:text-[11px]">
              קטגוריה
            </label>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="w-full"
            >
              <option value="">כל הקטגוריות</option>
              {PASSWORD_VAULT_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <button type="button" onClick={openCreate} className="hub-btn-orange w-full shrink-0 md:w-auto">
            + פריט חדש
          </button>
        </div>

        <div className="border-t border-[var(--border)] pt-3 md:pt-4">
          <label
            className="text-[10px] font-bold uppercase tracking-wide text-[var(--text-light)] md:text-[11px]"
            htmlFor="vault-filter-client"
          >
            חיפוש לפי לקוח
          </label>
          <p className="mt-1 text-[10px] leading-relaxed text-[var(--text-mid)] md:text-[11px]">
            הקלד שם (או אימייל / טלפון) — בחר לקוח מהרשימה. יוצגו{' '}
            <span className="font-semibold text-[var(--text-dark)]">כל</span> הסיסמאות המשויכות ללקוח (ניתן לשלב עם
            החיפוש והקטגוריה למעלה).
          </p>
          <div className="mt-2 min-w-0 max-w-2xl">
            <ClientQuickSelect
              id="vault-filter-client"
              clients={clients}
              value={clientFilterId}
              onChange={setClientFilterId}
            />
          </div>
        </div>
      </div>

      {loading ? (
        <p className="text-center text-sm text-[var(--text-mid)]">טוען…</p>
      ) : filtered.length === 0 ? (
        <EmptyState title={emptyTitle} description={emptyDescription} />
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
          {filtered.map((row, idx) => (
            <li
              key={row.id}
              className={`flex flex-col gap-3 rounded-xl p-3 sm:rounded-2xl sm:gap-4 sm:p-5 ${hubSectionClass((idx % 4) + 1)}`}
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between sm:gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--orange)] md:text-[11px]">
                    {row.category || 'ללא קטגוריה'}
                  </p>
                  <h2 className="mt-1 break-words text-[15px] font-extrabold leading-snug text-[var(--text-dark)] md:text-[17px]">
                    {row.title || 'ללא כותרת'}
                  </h2>
                  {row.clientId ? (
                    <p className="mt-1 break-words text-[11px] font-semibold text-[var(--text-mid)] md:text-[12px]">
                      לקוח: {clientNameById.get(row.clientId) ?? row.clientId}
                    </p>
                  ) : null}
                </div>
                <div className="flex w-full min-w-0 flex-col gap-2 sm:w-auto sm:shrink-0 sm:flex-row sm:gap-2">
                  <button
                    type="button"
                    onClick={() => openEdit(row.id)}
                    className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-[12px] font-semibold text-[var(--text-mid)] transition hover:bg-[var(--bg-input)] sm:w-auto sm:py-1.5"
                  >
                    עריכה
                  </button>
                  {vaultAdmin ? (
                    <button
                      type="button"
                      onClick={() => setDeleteId(row.id)}
                      className="w-full rounded-lg border border-[var(--danger)]/40 px-3 py-2 text-[12px] font-semibold text-[var(--danger)] transition hover:bg-red-50 sm:w-auto sm:py-1.5"
                    >
                      מחק
                    </button>
                  ) : null}
                </div>
              </div>

              {vaultAdmin ? (
                <p className="break-words text-[10px] leading-snug text-[var(--text-light)] md:text-[11px]">
                  חשיפה לפרטי גישה:{' '}
                  {row.visibleUserIds.length === 0 ? (
                    <span className="font-semibold text-[var(--text-mid)]">רק מנהלי מערכת</span>
                  ) : (
                    <span className="font-semibold text-[var(--text-mid)]">
                      {row.visibleUserIds.map((id) => nameByUid.get(id) ?? id.slice(0, 6)).join(', ')}
                    </span>
                  )}
                </p>
              ) : null}

              <dl className="space-y-1.5 text-[12px] md:space-y-2 md:text-[13px]">
                <div className="min-w-0">
                  <dt className="text-[10px] font-semibold text-[var(--text-light)] md:text-[11px]">
                    שם משתמש
                  </dt>
                  <dd className="mt-0.5 break-all font-medium text-[var(--text-dark)]">
                    {row.username || '—'}
                  </dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-[10px] font-semibold text-[var(--text-light)] md:text-[11px]">
                    {row.loginType === 'google' || !row.password.trim()
                      ? 'כניסה'
                      : 'סיסמה'}
                  </dt>
                  <dd className="mt-1 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                    {row.loginType === 'google' || !row.password.trim() ? (
                      <p
                        className={`w-full text-[13px] font-extrabold leading-snug text-[var(--text-dark)] md:text-[14px] ${
                          row.loginType === 'google'
                            ? 'rounded-lg border border-[var(--border)] bg-[var(--bg-input)]/60 px-3 py-2 md:py-2.5'
                            : 'rounded-lg border border-dashed border-[var(--border)] bg-[var(--bg-input)]/40 px-3 py-2 md:py-2.5'
                        }`}
                      >
                        כניסה מהירה עם חשבון Google
                      </p>
                    ) : (
                      <>
                        <span className="w-full min-w-0 break-all rounded-lg bg-[var(--bg-input)] px-3 py-2 font-mono text-[12px] text-[var(--text-dark)] sm:w-auto md:text-[13px]">
                          {revealed[row.id] ? row.password || '—' : maskPass()}
                        </span>
                        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
                        <button
                          type="button"
                          className="min-h-[2.25rem] flex-1 rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--text-mid)] hover:bg-[var(--orange-light)] sm:flex-initial sm:min-h-0"
                          onClick={() => toggleReveal(row.id)}
                          aria-pressed={revealed[row.id]}
                        >
                          {revealed[row.id] ? 'הסתר' : 'הצג'}
                        </button>
                        <button
                          type="button"
                          className="min-h-[2.25rem] flex-1 rounded-lg border border-[var(--blue-mid)]/40 px-2.5 py-1.5 text-[11px] font-semibold text-[var(--blue-mid)] hover:bg-[var(--blue-light)] sm:flex-initial sm:min-h-0"
                          onClick={() => void copyText(row.password)}
                        >
                          העתק
                        </button>
                        </div>
                      </>
                    )}
                  </dd>
                </div>
                {row.url ? (
                  <div className="min-w-0">
                    <dt className="text-[10px] font-semibold text-[var(--text-light)] md:text-[11px]">
                      קישור לדף כניסה
                    </dt>
                    <dd className="mt-0.5 min-w-0">
                      <a
                        href={row.url}
                        target="_blank"
                        rel="noreferrer"
                        className="break-all font-medium text-[var(--blue-mid)] underline-offset-2 hover:underline md:block md:truncate md:break-normal"
                      >
                        {row.url}
                      </a>
                    </dd>
                  </div>
                ) : null}
                {row.notes ? (
                  <div className="min-w-0">
                    <dt className="text-[10px] font-semibold text-[var(--text-light)] md:text-[11px]">הערות</dt>
                    <dd className="mt-0.5 whitespace-pre-wrap break-words text-[12px] leading-relaxed text-[var(--text-mid)] md:text-[13px]">
                      {row.notes}
                    </dd>
                  </div>
                ) : null}
              </dl>

              <p className="border-t border-[var(--border)] pt-2 text-[10px] text-[var(--text-light)] md:pt-3 md:text-[11px]">
                עודכן {formatDateTimeIL(row.updatedAt) || '—'} ·{' '}
                {nameByUid.get(row.updatedBy) ?? (row.updatedBy ? row.updatedBy.slice(0, 8) : '—')}
              </p>
            </li>
          ))}
        </ul>
      )}

      {modalOpen ? (
        <VaultEntryModal
          key={editingId ?? 'create'}
          isOpen={modalOpen}
          onClose={() => setModalOpen(false)}
          initial={editing}
          teamUsers={users}
          clients={clients}
          isVaultAdmin={vaultAdmin}
          onSave={async (payload) => {
            if (editingId) await updateEntry(editingId, payload)
            else await addEntry(payload)
            setModalOpen(false)
            setEditingId(null)
          }}
        />
      ) : null}

      <ConfirmDialog
        isOpen={deleteId != null}
        onClose={() => setDeleteId(null)}
        message="למחוק פריט זה מכספת הסיסמאות? לא ניתן לשחזר."
        onConfirm={() => {
          if (deleteId) void removeEntry(deleteId)
          setDeleteId(null)
        }}
      />
    </div>
  )
}

function VaultEntryModal({
  isOpen,
  onClose,
  initial,
  teamUsers,
  clients,
  isVaultAdmin,
  onSave,
}: {
  isOpen: boolean
  onClose: () => void
  initial?: PasswordVaultEntry
  teamUsers: TeamMember[]
  clients: Client[]
  isVaultAdmin: boolean
  onSave: (p: PasswordVaultWrite) => Promise<void>
}) {
  const sortedTeam = useMemo(
    () => [...teamUsers].sort((a, b) => a.name.localeCompare(b.name, 'he')),
    [teamUsers],
  )

  const [form, setForm] = useState<PasswordVaultWrite>(() =>
    initial
      ? {
          title: initial.title,
          category: initial.category || PASSWORD_VAULT_CATEGORIES[0],
          username: initial.username,
          password: initial.loginType === 'google' ? '' : initial.password,
          loginType: initial.loginType === 'google' ? 'google' : 'password',
          url: initial.url,
          notes: initial.notes,
          visibleUserIds: [...initial.visibleUserIds],
          clientId: initial.clientId,
        }
      : EMPTY_VAULT_FORM,
  )

  useEffect(() => {
    if (!isOpen) return
    setForm(
      initial
        ? {
            title: initial.title,
            category: initial.category || PASSWORD_VAULT_CATEGORIES[0],
            username: initial.username,
            password: initial.loginType === 'google' ? '' : initial.password,
            loginType: initial.loginType === 'google' ? 'google' : 'password',
            url: initial.url,
            notes: initial.notes,
            visibleUserIds: [...initial.visibleUserIds],
            clientId: initial.clientId,
          }
        : { ...EMPTY_VAULT_FORM },
    )
  }, [isOpen, initial?.id])

  const toggleUserVisibility = (uid: string) => {
    setForm((f) => ({
      ...f,
      visibleUserIds: f.visibleUserIds.includes(uid)
        ? f.visibleUserIds.filter((x) => x !== uid)
        : [...f.visibleUserIds, uid],
    }))
  }

  const selectAllTeam = () => {
    setForm((f) => ({
      ...f,
      visibleUserIds: sortedTeam.map((u) => u.id),
    }))
  }

  const clearTeamVisibility = () => {
    setForm((f) => ({ ...f, visibleUserIds: [] }))
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.title.trim()) return
    await onSave({
      title: form.title,
      category: form.category,
      username: form.username,
      password: form.loginType === 'google' ? '' : form.password,
      loginType: form.loginType,
      url: form.url,
      notes: form.notes,
      visibleUserIds: form.visibleUserIds,
      clientId: form.clientId,
    })
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={initial ? 'עריכת פריט' : 'פריט חדש בכספת'}
      size="lg"
    >
      <form onSubmit={(e) => void submit(e)} className="space-y-4">
        <div>
          <label className="mb-1 block text-[12px] font-semibold text-[var(--text-mid)]">כותרת *</label>
          <input
            required
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            placeholder="למשל: Facebook Ads — לקוח X"
          />
        </div>
        <div>
          <label className="mb-1 block text-[12px] font-semibold text-[var(--text-mid)]">קטגוריה</label>
          <select
            value={form.category}
            onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
          >
            {PASSWORD_VAULT_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-[12px] font-semibold text-[var(--text-mid)]">
            חשיפת הסיסמה לעובדים
          </label>
          <p className="mb-2 text-[11px] leading-relaxed text-[var(--text-light)]">
            {isVaultAdmin ? (
              <>
                סמן מי יראה את הרשומה ואת פרטי הגישה (סיסמה או Google). עובד שאימייל ההתחברות שלו זהה לשדה «שם
                משתמש / אימייל» רואה את הפריט גם בלי סימון ברשימה. עובד אחר שלא מסומן — לא יראה. ריק = רק מנהלי
                מערכת.
              </>
            ) : (
              <>
                סמן מי יראה את הרשומה ואת פרטי הגישה. עובד שלא מסומן לא יראה, אלא אם אימייל ההתחברות שלו תואם לשדה
                «שם משתמש / אימייל». אם לא תסמן אף אחד — הפריט יישמר כאישי (רק אתה ומנהלי המערכת).
              </>
            )}
          </p>
          <div className="mb-2 flex flex-wrap gap-2">
            <button type="button" className="hub-btn-secondary text-[12px] py-1 px-2" onClick={selectAllTeam}>
              בחר כולם
            </button>
            <button type="button" className="hub-btn-secondary text-[12px] py-1 px-2" onClick={clearTeamVisibility}>
              נקה רשימה
            </button>
          </div>
          <div className="max-h-[min(200px,40vh)] space-y-2 overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--bg-input)]/40 p-3">
            {sortedTeam.map((u) => (
              <label
                key={u.id}
                className="flex cursor-pointer items-center gap-3 rounded-lg px-1 py-1.5 text-[13px] hover:bg-[var(--bg-input)]"
              >
                <input
                  type="checkbox"
                  className="h-4 w-4 shrink-0 accent-[var(--orange)]"
                  checked={form.visibleUserIds.includes(u.id)}
                  onChange={() => toggleUserVisibility(u.id)}
                />
                <span className="min-w-0 flex-1 font-medium text-[var(--text-dark)]">{u.name}</span>
                {u.role ? (
                  <span className="shrink-0 text-[10px] text-[var(--text-light)]">{u.role}</span>
                ) : null}
              </label>
            ))}
          </div>
        </div>

        <div>
          <label className="mb-1 block text-[12px] font-semibold text-[var(--text-mid)]">שיוך ללקוח (אופציונלי)</label>
          <ClientQuickSelect
            id="vault-client"
            clients={clients}
            value={form.clientId}
            onChange={(clientId) => setForm((f) => ({ ...f, clientId }))}
          />
        </div>

        <div>
          <label className="mb-1 block text-[12px] font-semibold text-[var(--text-mid)]">
            שם משתמש / אימייל
          </label>
          <input
            value={form.username}
            onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
            autoComplete="off"
            placeholder="למשל: user@gmail.com"
            dir="ltr"
            className="text-left"
          />
        </div>

        <div>
          <span className="mb-1 block text-[12px] font-semibold text-[var(--text-mid)]">אופן כניסה</span>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg-input)]/30 px-3 py-2.5 text-[13px] has-[:checked]:border-[var(--orange)] has-[:checked]:bg-[var(--orange-light)]/50">
              <input
                type="radio"
                name="vault-login-type"
                className="h-4 w-4 accent-[var(--orange)]"
                checked={form.loginType === 'password'}
                onChange={() =>
                  setForm((f) => ({
                    ...f,
                    loginType: 'password',
                  }))
                }
              />
              <span className="font-medium text-[var(--text-dark)]">סיסמה (נשמרת בכספת)</span>
            </label>
            <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg-input)]/30 px-3 py-2.5 text-[13px] has-[:checked]:border-[var(--orange)] has-[:checked]:bg-[var(--orange-light)]/50">
              <input
                type="radio"
                name="vault-login-type"
                className="h-4 w-4 accent-[var(--orange)]"
                checked={form.loginType === 'google'}
                onChange={() =>
                  setForm((f) => ({
                    ...f,
                    loginType: 'google',
                    password: '',
                  }))
                }
              />
              <span className="font-medium text-[var(--text-dark)]">Google / Gmail — ללא סיסמה</span>
            </label>
          </div>
        </div>

        {form.loginType === 'password' ? (
          <div>
            <label className="mb-1 block text-[12px] font-semibold text-[var(--text-mid)]">סיסמה</label>
            <input
              type="password"
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              autoComplete="new-password"
            />
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--bg-input)]/40 px-3 py-2.5">
            <p className="text-[14px] font-extrabold text-[var(--text-dark)]">כניסה מהירה עם חשבון Google</p>
          </div>
        )}
        <div>
          <label className="mb-1 block text-[12px] font-semibold text-[var(--text-mid)]">כתובת כניסה (URL)</label>
          <input
            type="text"
            inputMode="url"
            dir="ltr"
            value={form.url}
            onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
            placeholder="https://"
          />
        </div>
        <div>
          <label className="mb-1 block text-[12px] font-semibold text-[var(--text-mid)]">הערות</label>
          <textarea
            rows={3}
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            className="resize-y"
          />
        </div>
        <div className="flex flex-wrap justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="hub-btn-secondary">
            ביטול
          </button>
          <button type="submit" className="hub-btn-orange">
            שמירה
          </button>
        </div>
      </form>
    </Modal>
  )
}
