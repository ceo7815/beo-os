import { describe, expect, it } from 'vitest'
import {
  balanceDue,
  buildPipelineSummary,
  findDuplicateLead,
  leadFaceAmount,
  monthlyRecurring,
  paymentIsOverdue,
  shayReplyPatch,
  weekStartSunday,
} from '../pipelineModel.js'

describe('pipeline summary', () => {
  const today = '2026-10-20'

  it('starts the Israel week on Sunday', () => {
    expect(weekStartSunday('2026-10-20')).toBe('2026-10-18')
  })

  it('uses the estimate, then the newest live quote', () => {
    expect(
      leadFaceAmount(
        { id: 'l1', status: 'quote_sent', estimatedValue: 2990 },
        [{ id: 'q', leadId: 'l1', status: 'sent', amountPreVat: 100 }],
      ),
    ).toBe(2990)
    expect(
      leadFaceAmount({ id: 'l1', status: 'quote_sent', estimatedValue: null }, [
        { id: 'old', leadId: 'l1', status: 'sent', amountPreVat: 100, sentAt: '2026-01-01' },
        { id: 'new', leadId: 'l1', status: 'sent', amountPreVat: 1799, sentAt: '2026-10-20' },
        { id: 'dead', leadId: 'l1', status: 'rejected', amountPreVat: 9000, sentAt: '2026-10-21' },
      ]),
    ).toBe(1799)
  })

  it('keeps lost and paid work out of the open total', () => {
    const summary = buildPipelineSummary({
      today,
      leads: [
        {
          id: 'open',
          status: 'quote_sent',
          estimatedValue: 2990,
          probability: 50,
          source: 'organic_seo',
          nextFollowUpDate: '2026-10-19',
          createdAt: '2026-10-19T00:00:00Z',
        },
        {
          id: 'lost',
          status: 'lost',
          estimatedValue: 15000,
          source: 'meta_ads',
          createdAt: '2026-10-01T00:00:00Z',
        },
        {
          id: 'cold',
          status: 'cold',
          estimatedValue: 100,
          source: 'cold_email',
          createdAt: '2026-08-30T00:00:00Z',
        },
      ],
      quotes: [],
      deals: [
        {
          id: 'd1',
          stage: 'delivered',
          amountTotal: 1799,
          leadId: 'won-lead',
          createdAt: '2026-10-02T00:00:00Z',
        },
        {
          id: 'd2',
          stage: 'paid_in_full',
          agreedAmount: 8000,
          createdAt: '2026-10-03T00:00:00Z',
        },
        {
          id: 'd3',
          stage: 'cancelled',
          amountTotal: 500,
          createdAt: '2026-10-04T00:00:00Z',
        },
      ],
      payments: [
        { id: 'p1', dealId: 'd1', amount: 500, status: 'scheduled', dueDate: '2026-10-01' },
        { id: 'p2', dealId: 'd1', amount: 200, status: 'invoiced', dueDate: '2026-10-28' },
        { id: 'p3', dealId: 'd2', amount: 8000, status: 'paid', dueDate: '2026-10-03', paidAt: '2026-10-03' },
      ],
      recurring: [
        { id: 'r1', amount: 350, interval: 'monthly', active: true, startDate: '2026-08-01' },
        { id: 'r2', amount: 1200, interval: 'yearly', active: true, startDate: '2026-01-01' },
        { id: 'r3', amount: 999, interval: 'monthly', active: false, startDate: '2026-01-01' },
      ],
    })

    expect(summary.openPipelineAmount).toBe(2990 + 1799)
    expect(summary.openPipelineWeighted).toBe(2990 * 0.5 + 1799)
    const archive = summary.stages.find((s) => s.stage === 'archive')
    expect(archive?.count).toBe(2)
    expect(archive?.countsTowardOpen).toBe(false)
    expect(summary.stages.find((s) => s.stage === 'paid_in_full')?.countsTowardOpen).toBe(false)
    expect(summary.wonThisMonth).toEqual({ count: 2, amount: 1799 + 8000 })
    expect(summary.followUpsDue.count).toBe(1)
    expect(summary.overduePayments).toEqual({ count: 1, amount: 500 })
    expect(summary.upcomingPayments).toEqual({ count: 1, amount: 200 })
    expect(summary.mrr).toBe(350 + 100)
    expect(summary.leadsBySourceThisWeek).toEqual([{ source: 'organic_seo', count: 1 }])
    expect(balanceDue({ id: 'd1', stage: 'delivered', amountTotal: 1799 }, summary ? [
      { id: 'p3', dealId: 'd1', amount: 500, status: 'paid', dueDate: '2026-10-01' },
    ] : [])).toBe(1299)
  })

  it('flags scheduled payments before today as overdue', () => {
    expect(
      paymentIsOverdue(
        { id: 'p', amount: 1, status: 'scheduled', dueDate: '2026-10-01' },
        '2026-10-20',
      ),
    ).toBe(true)
    expect(
      paymentIsOverdue(
        { id: 'p', amount: 1, status: 'paid', dueDate: '2026-10-01' },
        '2026-10-20',
      ),
    ).toBe(false)
  })

  it('turns a yearly retainer into monthly revenue and skips ended rows', () => {
    expect(
      monthlyRecurring(
        [{ id: 'r', amount: 1200, interval: 'yearly', active: true, endDate: '2026-01-01', startDate: '2025-01-01' }],
        '2026-10-20',
      ),
    ).toBe(0)
  })
})

describe('lead dedup', () => {
  const leads = [
    { id: 'a', phone: '050-123-4567', email: 'a@liba.co.il', domain: null },
    { id: 'b', phone: null, email: 'b@example.com', domain: 'ffla.co.il' },
  ]

  it('matches Israeli phone formats and email domains', () => {
    expect(findDuplicateLead(leads, { id: '', phone: '+972501234567' })?.id).toBe('a')
    expect(findDuplicateLead(leads, { id: '', email: 'B@Example.com' })?.id).toBe('b')
    expect(findDuplicateLead(leads, { id: '', domain: 'https://www.ffla.co.il/offer' })?.id).toBe('b')
    expect(findDuplicateLead(leads, { id: '', phone: '123' })).toBeNull()
  })
})

describe('Shay reply mapping', () => {
  it('marks a human reply as replied and does not rewind a sent quote', () => {
    expect(shayReplyPatch({ currentStatus: 'cold', replyKind: 'human' })?.status).toBe('replied')
    expect(shayReplyPatch({ currentStatus: 'quote_sent', replyKind: 'human' })).toBeNull()
    expect(shayReplyPatch({ currentStatus: 'cold', replyKind: 'bounce' })?.status).toBe('not_relevant')
    expect(shayReplyPatch({ currentStatus: 'cold', replyKind: 'ooo' })?.status).toBeUndefined()
  })
})
