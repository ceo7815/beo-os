import { describe, expect, it } from 'vitest'
import {
  clientScopedAssignOptionsWithHosting,
  clientScopedHourlyOptions,
  clientScopedProjectOptions,
  HOURLY_ASSIGN_PREFIX,
  HOSTING_ASSIGN_PREFIX,
} from '../financeProjectAssign'

const projects = [
  { id: 'p1', name: 'אתר א', clientId: 'c1' },
  { id: 'p2', name: 'אתר ב', clientId: 'c2' },
  { id: 'p3', name: 'פנימי', clientId: 'c1' },
]

const hourlyServices = [
  {
    id: 'h1',
    title: 'חבילת 10 שעות',
    clientId: 'c1',
    status: 'active' as const,
  },
  {
    id: 'h2',
    title: 'חבילה ישנה',
    clientId: 'c1',
    status: 'closed' as const,
  },
  {
    id: 'h3',
    title: 'של לקוח אחר',
    clientId: 'c2',
    status: 'active' as const,
  },
]

describe('clientScopedProjectOptions', () => {
  it('returns only projects of the client', () => {
    const opts = clientScopedProjectOptions(projects, { clientId: 'c1' })
    expect(opts.map((o) => o.value).sort()).toEqual(['p1', 'p3'])
  })

  it('does not dump all projects when client is missing', () => {
    expect(clientScopedProjectOptions(projects, {})).toEqual([])
  })

  it('keeps the currently assigned project even if client differs', () => {
    const opts = clientScopedProjectOptions(projects, {
      clientId: 'c1',
      currentProjectId: 'p2',
    })
    expect(opts.map((o) => o.value)).toContain('p2')
  })
})

describe('clientScopedHourlyOptions', () => {
  it('returns only active hour banks of the client', () => {
    const opts = clientScopedHourlyOptions(hourlyServices, { clientId: 'c1' })
    expect(opts.map((o) => o.value)).toEqual([
      `${HOURLY_ASSIGN_PREFIX}h1`,
    ])
  })

  it('keeps currently assigned bank even if closed', () => {
    const opts = clientScopedHourlyOptions(hourlyServices, {
      clientId: 'c1',
      currentHourlyServiceId: 'h2',
    })
    expect(opts.map((o) => o.value)).toContain(`${HOURLY_ASSIGN_PREFIX}h2`)
  })
})

describe('clientScopedAssignOptionsWithHosting', () => {
  it('includes hosting, active hour banks and client projects', () => {
    const opts = clientScopedAssignOptionsWithHosting(projects, {
      clientId: 'c1',
      hourlyServices,
    })
    const values = opts.map((o) => o.value)
    expect(values).toContain(`${HOSTING_ASSIGN_PREFIX}monthly`)
    expect(values).toContain(`${HOSTING_ASSIGN_PREFIX}yearly`)
    expect(values).toContain(`${HOSTING_ASSIGN_PREFIX}portal_monthly`)
    expect(values).toContain(`${HOURLY_ASSIGN_PREFIX}h1`)
    expect(values).not.toContain(`${HOURLY_ASSIGN_PREFIX}h2`)
    expect(values).not.toContain(`${HOURLY_ASSIGN_PREFIX}h3`)
    expect(values).toContain('p1')
    expect(values).not.toContain('p2')
  })
})
