import { useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { LeadConvertWizard } from '../components/leads/LeadConvertWizard'
import { ExportExcelButton } from '../components/shared/ExportExcelButton'
import { useAuth } from '../contexts/AuthContext'
import { useClients } from '../hooks/useClients'
import { useDealPayments } from '../hooks/useDealPayments'
import { useDeals } from '../hooks/useDeals'
import { useLeads } from '../hooks/useLeads'
import { useQuotes } from '../hooks/useQuotes'
import { useUsers } from '../hooks/useUsers'
import { downloadRtlExcel } from '../lib/excelExport'
import { todayYmd } from '../lib/dates'
import {
  LEAD_SOURCE_OPTIONS,
  LEAD_STATUS_LABELS,
  LOST_REASON_OPTIONS,
  leadSourceLabel,
  lostReasonLabel,
} from '../lib/leadStatusUi'
import {
  ARCHIVE_LEAD_STAGES,
  DEAL_STAGES,
  OPEN_DEAL_STAGES,
  OPEN_LEAD_STAGES,
  STAGE_LABELS,
  balanceDue,
  dealFaceAmount,
  dealStageOf,
  dealWeight,
  findDuplicateLead,
  leadFaceAmount,
  leadWeight,
  paymentIsOverdue,
  type DealSnap,
  type LeadSnap,
  type PaymentSnap,
  type QuoteSnap,
} from '../lib/pipelineModel'
import type { Deal, DealStage, Lead, LeadStatus } from '../types'

type ColId = string

function ils(n: number): string {
  return `₪${Math.round(n).toLocaleString('he-IL')}`
}

const COLUMNS: { id: ColId; label: string; kind: 'lead' | 'deal' | 'archive'; open: boolean }[] = [
  ...OPEN_LEAD_STAGES.map((id) => ({ id, label: STAGE_LABELS[id] ?? id, kind: 'lead' as const, open: true })),
  ...OPEN_DEAL_STAGES.map((id) => ({ id, label: STAGE_LABELS[id] ?? id, kind: 'deal' as const, open: true })),
  { id: 'paid_in_full', label: 'שולם', kind: 'deal', open: false },
]

const ARCHIVE = new Set<string>(ARCHIVE_LEAD_STAGES)

function leadColumn(status: string): ColId | null {
  if ((OPEN_LEAD_STAGES as readonly string[]).includes(status)) return status
  if (ARCHIVE.has(status)) return 'archive'
  return null
}

export function Pipeline() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { leads, updateLead, addLead } = useLeads()
  const { deals, updateDeal } = useDeals()
  const { quotes, schemaMissing: quotesMissing } = useQuotes()
  const { payments, schemaMissing: paymentsMissing } = useDealPayments()
  const { clients } = useClients()
  const { users } = useUsers()
  const today = todayYmd()

  const [view, setView] = useState<'kanban' | 'table'>('kanban')
  const [source, setSource] = useState('')
  const [ownerId, setOwnerId] = useState('')
  const [temperature, setTemperature] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [convertId, setConvertId] = useState<string | null>(null)
  const [convertStage, setConvertStage] = useState<'signed' | 'deposit_paid'>('signed')
  const [lostId, setLostId] = useState<string | null>(null)
  const [lostReason, setLostReason] = useState('price')
  const [lostNote, setLostNote] = useState('')
  const [selected, setSelected] = useState<{ kind: 'lead' | 'deal'; id: string } | null>(null)
  const [showNew, setShowNew] = useState(false)

  const ownerName = useMemo(() => {
    const m = new Map(users.map((u) => [u.id, u.name]))
    return (id?: string) => (id ? m.get(id) || 'לא משויך' : 'לא משויך')
  }, [users])
  const clientName = useMemo(() => new Map(clients.map((c) => [c.id, c.name])), [clients])

  const quoteSnaps: QuoteSnap[] = useMemo(
    () =>
      quotes.map((q) => ({
        id: q.id,
        leadId: q.leadId,
        dealId: q.dealId,
        status: q.status,
        amountPreVat: q.amountPreVat ?? null,
        period: q.period,
        sentAt: q.sentAt,
        createdAt: q.createdAt,
      })),
    [quotes],
  )
  const paymentSnaps: PaymentSnap[] = useMemo(
    () => payments.map((p) => ({ id: p.id, dealId: p.dealId, amount: p.amount, status: p.status, dueDate: p.dueDate })),
    [payments],
  )

  const filteredLeads = useMemo(() => {
    return leads.filter((l) => {
      if (source && l.source !== source) return false
      if (ownerId && l.ownerId !== ownerId) return false
      if (temperature && l.temperature !== temperature) return false
      const created = l.createdAt.slice(0, 10)
      if (from && created < from) return false
      if (to && created > to) return false
      return true
    })
  }, [leads, source, ownerId, temperature, from, to])

  const filteredDeals = useMemo(() => {
    return deals.filter((d) => {
      const lead = d.leadId ? leads.find((l) => l.id === d.leadId) : undefined
      if (source && lead?.source !== source) return false
      if (ownerId && lead && lead.ownerId !== ownerId && d.salesAgentUserId !== ownerId) return false
      if (temperature && lead?.temperature !== temperature) return false
      const created = d.createdAt.slice(0, 10)
      if (from && created < from) return false
      if (to && created > to) return false
      return true
    })
  }, [deals, leads, source, ownerId, temperature, from, to])

  const columns = useMemo(() => {
    const buckets = new Map<ColId, { leads: Lead[]; deals: Deal[] }>()
    for (const col of [...COLUMNS, { id: 'archive', label: 'לא נסגר', kind: 'archive' as const, open: false }]) {
      buckets.set(col.id, { leads: [], deals: [] })
    }
    for (const lead of filteredLeads) {
      const col = leadColumn(lead.status)
      if (!col) continue
      buckets.get(col)?.leads.push(lead)
    }
    for (const deal of filteredDeals) {
      const stage = dealStageOf(toDealSnap(deal))
      if (stage === 'cancelled') buckets.get('archive')?.deals.push(deal)
      else buckets.get(stage)?.deals.push(deal)
    }
    return buckets
  }, [filteredLeads, filteredDeals])

  const openMoney = useMemo(() => {
    let amount = 0
    let weightedAmount = 0
    let count = 0
    for (const col of COLUMNS) {
      if (!col.open) continue
      const bucket = columns.get(col.id)
      if (!bucket) continue
      for (const lead of bucket.leads) {
        const face = leadFaceAmount(toLeadSnap(lead), quoteSnaps)
        amount += face
        weightedAmount += face * leadWeight(toLeadSnap(lead))
        count += 1
      }
      for (const deal of bucket.deals) {
        const snap = toDealSnap(deal)
        const face = dealFaceAmount(snap)
        amount += face
        weightedAmount += face * dealWeight(snap)
        count += 1
      }
    }
    return { amount, weightedAmount, count }
  }, [columns, quoteSnaps])

  const onDrop = (col: (typeof COLUMNS)[number] | { id: 'archive'; kind: 'archive' }, card: string) => {
    const [kind, id] = card.split(':')
    if (!id || !kind) return
    if (kind === 'lead') {
      if (col.kind === 'lead') {
        void updateLead(id, { status: col.id as LeadStatus })
        return
      }
      if (col.id === 'signed' || col.id === 'deposit_paid') {
        setConvertStage(col.id)
        setConvertId(id)
        return
      }
      if (col.id === 'archive') {
        setLostReason('no_reply')
        setLostNote('')
        setLostId(id)
      }
      return
    }
    if (kind === 'deal') {
      if (col.id === 'archive') {
        void updateDeal(id, { stage: 'cancelled' })
        return
      }
      if (col.kind === 'deal' && (DEAL_STAGES as readonly string[]).includes(col.id)) {
        void updateDeal(id, { stage: col.id as DealStage })
      }
    }
  }

  const exportRows = () => {
    const rows: (string | number)[][] = []
    const pushLead = (l: Lead, stage: string) => {
      rows.push([
        'ליד',
        l.company || l.name,
        l.name,
        STAGE_LABELS[stage] || LEAD_STATUS_LABELS[l.status],
        leadFaceAmount(toLeadSnap(l), quoteSnaps),
        Math.round(leadFaceAmount(toLeadSnap(l), quoteSnaps) * leadWeight(toLeadSnap(l))),
        leadSourceLabel(l.source),
        ownerName(l.ownerId),
        l.nextActionAt?.slice(0, 10) || l.nextFollowUpDate || '',
        l.temperature || '',
      ])
    }
    const pushDeal = (d: Deal, stage: string) => {
      rows.push([
        'עסקה',
        d.title,
        clientName.get(d.clientId) || '',
        STAGE_LABELS[stage] || stage,
        dealFaceAmount(toDealSnap(d)),
        Math.round(dealFaceAmount(toDealSnap(d)) * dealWeight(toDealSnap(d))),
        '',
        ownerName(d.salesAgentUserId),
        d.paidInFullAt || d.depositPaidAt || '',
        '',
      ])
    }
    for (const col of COLUMNS) {
      const b = columns.get(col.id)
      b?.leads.forEach((l) => pushLead(l, col.id))
      b?.deals.forEach((d) => pushDeal(d, col.id))
    }
    const arch = columns.get('archive')
    arch?.leads.forEach((l) => pushLead(l, 'archive'))
    arch?.deals.forEach((d) => pushDeal(d, 'cancelled'))
    downloadRtlExcel({
      filenamePrefix: 'צנרת-מכירות',
      sheets: [
        {
          sheetName: 'צנרת',
          headers: ['סוג', 'שם', 'איש קשר / לקוח', 'שלב', 'סכום', 'הערכה', 'מקור', 'אחראי', 'תאריך הבא', 'טמפרטורה'],
          rows,
        },
      ],
    })
  }

  const selectedLead = selected?.kind === 'lead' ? leads.find((l) => l.id === selected.id) : undefined
  const selectedDeal = selected?.kind === 'deal' ? deals.find((d) => d.id === selected.id) : undefined

  return (
    <div className="beo-page space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-extrabold text-[var(--text-dark)]">צנרת מכירות</h1>
          <p className="mt-1 text-[13px] text-[var(--text-mid)]">
            {openMoney.count} פתוחים · {ils(openMoney.amount)} · הערכה {ils(openMoney.weightedAmount)}
            · «לא נסגר» ו«שולם» לא נספרים בסכום הפתוח
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="hub-btn-orange text-sm" onClick={() => setShowNew((v) => !v)}>
            {showNew ? 'סגירה' : '+ ליד חדש'}
          </button>
          <button type="button" className="rounded-xl border border-[var(--border)] bg-white px-3 py-2 text-sm font-semibold" onClick={() => navigate('/receivables')}>
            תקבולים
          </button>
          <ExportExcelButton onClick={exportRows} />
        </div>
      </header>

      {quotesMissing || paymentsMissing ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-950">
          טבלאות הצעות או תשלומים עדיין לא הותקנו. אחרי אישור אור מריצים את מיגרציות הצנרת, ואז העמודות והסכומים מתמלאים.
        </p>
      ) : null}

      {showNew ? (
        <NewLeadForm
          ownerId={user?.uid || ''}
          onCreate={async (input) => {
            const dup = findDuplicateLead(leads, {
              id: '',
              phone: input.phone,
              email: input.email,
              domain: input.email,
            })
            if (dup) {
              const existing = leads.find((l) => l.id === dup.id)
              const at = new Date().toISOString()
              await updateLead(dup.id, {
                activityLog: [
                  ...(existing?.activityLog ?? []),
                  { id: crypto.randomUUID(), text: 'ניסיון פתיחה כפול מטופס הצנרת — צורף לליד הקיים', at },
                ],
                lastActivityText: 'ניסיון פתיחה כפול — צורף לליד הקיים',
                lastActivityAt: at,
                lastContactAt: at,
              })
              setSelected({ kind: 'lead', id: dup.id })
              setShowNew(false)
              return
            }
            await addLead(input)
            setShowNew(false)
          }}
        />
      ) : null}

      <div className="flex flex-wrap items-end gap-2">
        <Filter label="מקור">
          <select className="mt-1" value={source} onChange={(e) => setSource(e.target.value)}>
            <option value="">הכל</option>
            {LEAD_SOURCE_OPTIONS.map((o) => (
              <option key={o.id} value={o.id}>{o.label}</option>
            ))}
          </select>
        </Filter>
        <Filter label="אחראי">
          <select className="mt-1" value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
            <option value="">הכל</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
        </Filter>
        <Filter label="טמפרטורה">
          <select className="mt-1" value={temperature} onChange={(e) => setTemperature(e.target.value)}>
            <option value="">הכל</option>
            <option value="hot">חם</option>
            <option value="warm">פושר</option>
            <option value="cold">קר</option>
          </select>
        </Filter>
        <Filter label="מ־">
          <input type="date" className="mt-1" value={from} onChange={(e) => setFrom(e.target.value)} />
        </Filter>
        <Filter label="עד">
          <input type="date" className="mt-1" value={to} onChange={(e) => setTo(e.target.value)} />
        </Filter>
        <div className="ms-auto flex rounded-xl border border-[var(--border)] bg-white p-0.5">
          <button type="button" className={`rounded-lg px-3 py-1.5 text-[12px] font-bold ${view === 'kanban' ? 'bg-[var(--brand)] text-white' : ''}`} onClick={() => setView('kanban')}>לוח</button>
          <button type="button" className={`rounded-lg px-3 py-1.5 text-[12px] font-bold ${view === 'table' ? 'bg-[var(--brand)] text-white' : ''}`} onClick={() => setView('table')}>טבלה</button>
        </div>
      </div>

      {view === 'kanban' ? (
        <div className="flex gap-3 overflow-x-auto pb-2">
          {COLUMNS.map((col) => (
            <Column
              key={col.id}
              title={col.label}
              muted={!col.open}
              cards={cardsFor(columns.get(col.id), col.id, quoteSnaps, paymentSnaps, ownerName, today)}
              onDropCard={(card) => onDrop(col, card)}
              onOpen={(kind, id) => setSelected({ kind, id })}
            />
          ))}
          <Column
            title="לא נסגר"
            muted
            cards={cardsFor(columns.get('archive'), 'archive', quoteSnaps, paymentSnaps, ownerName, today)}
            onDropCard={(card) => onDrop({ id: 'archive', kind: 'archive' }, card)}
            onOpen={(kind, id) => setSelected({ kind, id })}
          />
        </div>
      ) : (
        <PipelineTable
          columns={columns}
          quoteSnaps={quoteSnaps}
          paymentSnaps={paymentSnaps}
          ownerName={ownerName}
          clientName={clientName}
          onOpen={(kind, id) => setSelected({ kind, id })}
        />
      )}

      {selectedLead ? (
        <LeadDrawer
          lead={selectedLead}
          quotes={quotes.filter((q) => q.leadId === selectedLead.id)}
          onClose={() => setSelected(null)}
          onSave={(patch) => updateLead(selectedLead.id, patch)}
          onConvert={() => {
            setConvertStage('signed')
            setConvertId(selectedLead.id)
          }}
        />
      ) : null}
      {selectedDeal ? (
        <DealDrawer
          deal={selectedDeal}
          balance={balanceDue(toDealSnap(selectedDeal), paymentSnaps)}
          overdue={paymentSnaps.some((p) => p.dealId === selectedDeal.id && paymentIsOverdue(p, today))}
          client={clientName.get(selectedDeal.clientId) || ''}
          onClose={() => setSelected(null)}
          onStage={(stage) => updateDeal(selectedDeal.id, { stage })}
          onOpenProject={() => {
            if (selectedDeal.projectId) navigate(`/projects/${selectedDeal.projectId}`)
          }}
        />
      ) : null}

      <LeadConvertWizard
        lead={leads.find((l) => l.id === convertId) ?? null}
        open={Boolean(convertId)}
        initialStage={convertStage}
        onClose={() => setConvertId(null)}
      />

      {lostId ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/30 p-4">
          <form
            className="w-full max-w-md space-y-3 rounded-2xl bg-white p-4 shadow-xl"
            onSubmit={(e) => {
              e.preventDefault()
              void updateLead(lostId, {
                status: 'lost',
                lostReason,
                lostReasonNote: lostNote.trim() || undefined,
              }).then(() => setLostId(null))
            }}
          >
            <h2 className="text-[16px] font-extrabold">למה לא נסגר?</h2>
            <select className="w-full" value={lostReason} onChange={(e) => setLostReason(e.target.value)}>
              {LOST_REASON_OPTIONS.map((o) => (
                <option key={o.id} value={o.id}>{o.label}</option>
              ))}
            </select>
            <textarea className="w-full" rows={3} placeholder="פירוט חופשי" value={lostNote} onChange={(e) => setLostNote(e.target.value)} />
            <div className="flex justify-end gap-2">
              <button type="button" className="rounded-xl border px-3 py-2 text-sm" onClick={() => setLostId(null)}>ביטול</button>
              <button type="submit" className="rounded-xl bg-[var(--brand)] px-3 py-2 text-sm font-bold text-white">שמירה</button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  )
}

function toLeadSnap(l: Lead): LeadSnap {
  return {
    id: l.id,
    status: l.status,
    estimatedValue: l.estimatedValue ?? null,
    probability: l.probability ?? null,
    source: l.source,
    nextFollowUpDate: l.nextFollowUpDate,
    nextActionAt: l.nextActionAt,
    createdAt: l.createdAt,
  }
}

function toDealSnap(d: Deal): DealSnap {
  return {
    id: d.id,
    stage: d.stage,
    status: d.status,
    amountTotal: d.amountTotal ?? null,
    agreedAmount: d.agreedAmount ?? null,
    leadId: d.leadId,
    createdAt: d.createdAt,
    signedAt: d.signedAt,
  }
}

type Card = {
  key: string
  kind: 'lead' | 'deal'
  id: string
  title: string
  sub: string
  amount: number
  due: string
  overdue: boolean
  owner: string
}

function cardsFor(
  bucket: { leads: Lead[]; deals: Deal[] } | undefined,
  colId: string,
  quotes: QuoteSnap[],
  payments: PaymentSnap[],
  ownerName: (id?: string) => string,
  today: string,
): { cards: Card[]; total: number; estimate: number } {
  if (!bucket) return { cards: [], total: 0, estimate: 0 }
  const cards: Card[] = []
  let total = 0
  let estimate = 0
  for (const l of bucket.leads) {
    const snap = toLeadSnap(l)
    const face = leadFaceAmount(snap, quotes)
    total += face
    estimate += face * leadWeight(snap)
    const due = (l.nextActionAt || l.nextFollowUpDate || '').slice(0, 10)
    cards.push({
      key: `lead:${l.id}`,
      kind: 'lead',
      id: l.id,
      title: l.company || l.name,
      sub: l.company && l.name !== l.company ? l.name : leadSourceLabel(l.source),
      amount: face,
      due,
      overdue: Boolean(due && due <= today && colId !== 'archive'),
      owner: ownerName(l.ownerId),
    })
  }
  for (const d of bucket.deals) {
    const snap = toDealSnap(d)
    const face = dealFaceAmount(snap)
    total += face
    estimate += face * dealWeight(snap)
    const overdue = payments.some((p) => p.dealId === d.id && paymentIsOverdue(p, today))
    cards.push({
      key: `deal:${d.id}`,
      kind: 'deal',
      id: d.id,
      title: d.title,
      sub: 'עסקה',
      amount: face,
      due: d.depositPaidAt || '',
      overdue,
      owner: ownerName(d.salesAgentUserId),
    })
  }
  return { cards, total, estimate }
}

function Column({
  title,
  muted,
  cards,
  onDropCard,
  onOpen,
}: {
  title: string
  muted?: boolean
  cards: { cards: Card[]; total: number; estimate: number }
  onDropCard: (card: string) => void
  onOpen: (kind: 'lead' | 'deal', id: string) => void
}) {
  return (
    <section
      className={`flex w-[min(100%,17.5rem)] shrink-0 flex-col rounded-2xl border bg-[var(--surface-muted)]/40 ${muted ? 'border-dashed border-[var(--border)]' : 'border-[var(--border)]'}`}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault()
        const id = e.dataTransfer.getData('text/pipeline-card')
        if (id) onDropCard(id)
      }}
    >
      <header className="border-b border-[var(--border)] px-3 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-[12px] font-extrabold text-[var(--text-dark)]">{title}</h3>
          <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-bold tabular-nums">{cards.cards.length}</span>
        </div>
        <p className="mt-1 text-[12px] font-bold tabular-nums text-[var(--text-dark)]">{ils(cards.total)}</p>
        <p className="text-[11px] font-semibold tabular-nums text-[var(--text-mid)]">הערכה {ils(cards.estimate)}</p>
      </header>
      <ul className="flex max-h-[min(70vh,560px)] flex-col gap-2 overflow-y-auto p-2">
        {cards.cards.length === 0 ? (
          <li className="rounded-xl border border-dashed border-[var(--border)] px-3 py-6 text-center text-[11px] text-[var(--text-light)]">ריק</li>
        ) : (
          cards.cards.map((c) => (
            <li key={c.key}>
              <button
                type="button"
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('text/pipeline-card', c.key)
                  e.dataTransfer.effectAllowed = 'move'
                }}
                onClick={() => onOpen(c.kind, c.id)}
                className="w-full rounded-xl border border-[var(--border)] bg-white p-3 text-right shadow-sm hover:border-[var(--brand)]/35"
              >
                <div className="text-[13px] font-bold">{c.title}</div>
                {c.sub ? <div className="mt-0.5 text-[11px] text-[var(--text-mid)]">{c.sub}</div> : null}
                <div className="mt-2 flex items-center justify-between text-[11px]">
                  <span className="font-bold tabular-nums">{ils(c.amount)}</span>
                  <span className="text-[var(--text-light)]">{c.owner}</span>
                </div>
                {c.due ? (
                  <p className={`mt-1 text-[10px] font-semibold ${c.overdue ? 'text-red-700' : 'text-amber-800'}`}>
                    {c.overdue ? 'באיחור · ' : ''}{c.due}
                  </p>
                ) : null}
              </button>
            </li>
          ))
        )}
      </ul>
    </section>
  )
}

function PipelineTable({
  columns,
  quoteSnaps,
  paymentSnaps,
  ownerName,
  clientName,
  onOpen,
}: {
  columns: Map<string, { leads: Lead[]; deals: Deal[] }>
  quoteSnaps: QuoteSnap[]
  paymentSnaps: PaymentSnap[]
  ownerName: (id?: string) => string
  clientName: Map<string, string>
  onOpen: (kind: 'lead' | 'deal', id: string) => void
}) {
  const rows: { kind: 'lead' | 'deal'; id: string; cells: string[] }[] = []
  for (const [col, bucket] of columns) {
    for (const l of bucket.leads) {
      rows.push({
        kind: 'lead',
        id: l.id,
        cells: [
          'ליד',
          l.company || l.name,
          STAGE_LABELS[col] || l.status,
          ils(leadFaceAmount(toLeadSnap(l), quoteSnaps)),
          ils(leadFaceAmount(toLeadSnap(l), quoteSnaps) * leadWeight(toLeadSnap(l))),
          leadSourceLabel(l.source),
          ownerName(l.ownerId),
          lostReasonLabel(l.lostReason),
        ],
      })
    }
    for (const d of bucket.deals) {
      rows.push({
        kind: 'deal',
        id: d.id,
        cells: [
          'עסקה',
          d.title,
          STAGE_LABELS[col] || dealStageOf(toDealSnap(d)),
          ils(dealFaceAmount(toDealSnap(d))),
          ils(dealFaceAmount(toDealSnap(d)) * dealWeight(toDealSnap(d))),
          clientName.get(d.clientId) || '',
          ownerName(d.salesAgentUserId),
          ils(balanceDue(toDealSnap(d), paymentSnaps)),
        ],
      })
    }
  }
  return (
    <div className="overflow-x-auto rounded-2xl border border-[var(--border)] bg-white">
      <table className="w-full min-w-[720px] text-right text-[13px]">
        <thead className="bg-[var(--surface-muted)] text-[11px] font-bold text-[var(--text-light)]">
          <tr>
            {['סוג', 'שם', 'שלב', 'סכום', 'הערכה', 'מקור / לקוח', 'אחראי', 'הערה'].map((h) => (
              <th key={h} className="px-3 py-2">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={`${r.kind}:${r.id}`} className="cursor-pointer border-t border-[var(--border)] hover:bg-[var(--surface-muted)]" onClick={() => onOpen(r.kind, r.id)}>
              {r.cells.map((c, i) => (
                <td key={i} className="px-3 py-2">{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Filter({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="text-[11px] font-bold text-[var(--text-light)]">
      {label}
      <div>{children}</div>
    </label>
  )
}

function NewLeadForm({
  ownerId,
  onCreate,
}: {
  ownerId: string
  onCreate: (data: Omit<Lead, 'id' | 'createdAt'>) => Promise<void>
}) {
  const [name, setName] = useState('')
  const [company, setCompany] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [source, setSource] = useState('manual')
  const [value, setValue] = useState('')
  return (
    <form
      className="grid gap-3 rounded-2xl border border-[var(--border)] bg-white p-4 sm:grid-cols-3"
      onSubmit={(e) => {
        e.preventDefault()
        if (!name.trim() || !ownerId) return
        const estimated = value.trim() === '' ? undefined : Number(value)
        void onCreate({
          name: name.trim(),
          company: company.trim() || undefined,
          phone: phone.trim() || undefined,
          email: email.trim() || undefined,
          source,
          status: 'new',
          ownerId,
          estimatedValue: estimated != null && Number.isFinite(estimated) ? estimated : undefined,
          nextAction: 'ליצור קשר',
        })
      }}
    >
      <input required placeholder="שם" value={name} onChange={(e) => setName(e.target.value)} />
      <input placeholder="חברה" value={company} onChange={(e) => setCompany(e.target.value)} />
      <input placeholder="טלפון" dir="ltr" value={phone} onChange={(e) => setPhone(e.target.value)} />
      <input placeholder="אימייל" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} />
      <select value={source} onChange={(e) => setSource(e.target.value)}>
        {LEAD_SOURCE_OPTIONS.map((o) => (
          <option key={o.id} value={o.id}>{o.label}</option>
        ))}
      </select>
      <input placeholder="שווי משוער ₪" dir="ltr" value={value} onChange={(e) => setValue(e.target.value)} />
      <button type="submit" className="hub-btn-orange text-sm sm:col-span-3">שמירת ליד</button>
    </form>
  )
}

function LeadDrawer({
  lead,
  quotes,
  onClose,
  onSave,
  onConvert,
}: {
  lead: Lead
  quotes: { id: string; number?: string; url?: string; status: string; amountPreVat?: number; slug?: string }[]
  onClose: () => void
  onSave: (patch: Partial<Lead>) => Promise<void>
  onConvert: () => void
}) {
  const [nextAction, setNextAction] = useState(lead.nextAction || '')
  const [estimated, setEstimated] = useState(lead.estimatedValue != null ? String(lead.estimatedValue) : '')
  const [note, setNote] = useState('')
  return (
    <aside className="fixed inset-y-0 left-0 z-[70] w-[min(100%,24rem)] overflow-y-auto border-r border-[var(--border)] bg-white p-4 shadow-xl">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-[18px] font-extrabold">{lead.company || lead.name}</h2>
          <p className="text-[12px] text-[var(--text-mid)]">{LEAD_STATUS_LABELS[lead.status]}</p>
        </div>
        <button type="button" onClick={onClose} className="text-sm font-bold">סגירה</button>
      </div>
      <div className="mt-4 space-y-3 text-[13px]">
        <label className="block text-[11px] font-bold text-[var(--text-light)]">
          שווי משוער
          <input className="mt-1 w-full" dir="ltr" value={estimated} onChange={(e) => setEstimated(e.target.value)} />
        </label>
        <label className="block text-[11px] font-bold text-[var(--text-light)]">
          פעולה הבאה
          <input className="mt-1 w-full" value={nextAction} onChange={(e) => setNextAction(e.target.value)} />
        </label>
        <button
          type="button"
          className="rounded-xl border px-3 py-2 text-[12px] font-bold"
          onClick={() =>
            void onSave({
              estimatedValue: estimated.trim() === '' ? undefined : Number(estimated),
              nextAction: nextAction.trim() || undefined,
            })
          }
        >
          שמירת שדות
        </button>
        <button
          type="button"
          className="block rounded-xl border border-cyan-200 bg-cyan-50 px-3 py-2 text-[12px] font-bold text-cyan-900"
          onClick={() => void onSave({ status: 'replied', repliedAt: lead.repliedAt || new Date().toISOString() })}
        >
          סמן «חזר אלינו»
        </button>
        <button type="button" className="hub-btn-orange text-sm" onClick={onConvert}>המר לעסקה</button>
        <section>
          <h3 className="text-[12px] font-bold text-[var(--text-light)]">הצעות</h3>
          {quotes.length === 0 ? <p className="text-[12px] text-[var(--text-mid)]">אין הצעות מקושרות</p> : (
            <ul className="mt-1 space-y-1">
              {quotes.map((q) => (
                <li key={q.id} className="text-[12px]">
                  {q.url ? <a className="font-semibold text-[var(--brand)]" href={q.url} target="_blank" rel="noreferrer">{q.number || q.slug || 'הצעה'}</a> : (q.number || q.slug || 'הצעה')}
                  {' · '}{q.status}{q.amountPreVat != null ? ` · ${ils(q.amountPreVat)}` : ''}
                </li>
              ))}
            </ul>
          )}
        </section>
        <section>
          <h3 className="text-[12px] font-bold text-[var(--text-light)]">ציר זמן</h3>
          <ul className="mt-1 space-y-2">
            {(lead.activityLog ?? []).slice().reverse().slice(0, 12).map((a) => (
              <li key={a.id} className="rounded-lg bg-[var(--surface-muted)] px-2 py-1.5 text-[12px]">
                <div className="text-[10px] text-[var(--text-light)]">{a.at.slice(0, 16).replace('T', ' ')} {a.actorName || ''}</div>
                {a.text}
              </li>
            ))}
          </ul>
          <textarea className="mt-2 w-full" rows={2} placeholder="הערה לפעילות" value={note} onChange={(e) => setNote(e.target.value)} />
          <button
            type="button"
            className="mt-1 text-[12px] font-bold text-[var(--brand)]"
            onClick={() => {
              if (!note.trim()) return
              const entry = { id: crypto.randomUUID(), text: note.trim(), at: new Date().toISOString() }
              void onSave({
                activityLog: [...(lead.activityLog ?? []), entry],
                lastActivityText: note.trim(),
                lastActivityAt: entry.at,
                lastContactAt: entry.at,
              }).then(() => setNote(''))
            }}
          >
            הוספת הערה
          </button>
        </section>
      </div>
    </aside>
  )
}

function DealDrawer({
  deal,
  balance,
  overdue,
  client,
  onClose,
  onStage,
  onOpenProject,
}: {
  deal: Deal
  balance: number
  overdue: boolean
  client: string
  onClose: () => void
  onStage: (stage: DealStage) => void
  onOpenProject: () => void
}) {
  const stage = deal.stage || dealStageOf(toDealSnap(deal))
  return (
    <aside className="fixed inset-y-0 left-0 z-[70] w-[min(100%,24rem)] overflow-y-auto border-r border-[var(--border)] bg-white p-4 shadow-xl">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-[18px] font-extrabold">{deal.title}</h2>
          <p className="text-[12px] text-[var(--text-mid)]">{client} · {STAGE_LABELS[stage]}</p>
        </div>
        <button type="button" onClick={onClose} className="text-sm font-bold">סגירה</button>
      </div>
      <p className="mt-3 text-[14px] font-bold">{ils(dealFaceAmount(toDealSnap(deal)))}</p>
      <p className={`text-[12px] ${overdue ? 'font-bold text-red-700' : 'text-[var(--text-mid)]'}`}>
        יתרה {ils(balance)}{overdue ? ' · יש תשלום באיחור' : ''}
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        {DEAL_STAGES.map((s) => (
          <button key={s} type="button" className="rounded-lg border px-2 py-1 text-[11px] font-bold" onClick={() => onStage(s)}>
            {STAGE_LABELS[s]}
          </button>
        ))}
      </div>
      {deal.projectId ? (
        <button type="button" className="mt-4 text-[13px] font-bold text-[var(--brand)]" onClick={onOpenProject}>
          לפרויקט
        </button>
      ) : null}
    </aside>
  )
}
