import '../src/config/loadEnv.js'
import { MorningClient, MorningError } from '../src/lib/morningClient.js'
import { loadMorningCredentials } from '../src/lib/morningCredentials.js'
import { fetchMorningSyncPayload } from '../src/lib/morningSync.js'
import {
  mapMorningRecurringPayment,
  mapMorningRetainer,
} from '../src/lib/morningRecurringMapper.js'

const creds = await loadMorningCredentials()
if (!creds) {
  console.error('Morning credentials not configured')
  process.exit(1)
}

const client = new MorningClient(creds)

const recurringPage = await client.searchRecurringPayments({ page: 1, pageSize: 5 })
console.log('recurring pagination:', {
  keys: Object.keys(recurringPage),
  page: recurringPage.page,
  pages: recurringPage.pages,
  totalPages: recurringPage.totalPages,
  total: recurringPage.total,
  itemCount: recurringPage.items?.length,
})

const retainerPage = await client.searchRetainers({ page: 1, pageSize: 5 })
console.log('retainer pagination:', {
  keys: Object.keys(retainerPage),
  page: retainerPage.page,
  pages: retainerPage.pages,
  totalPages: retainerPage.totalPages,
  total: retainerPage.total,
  itemCount: retainerPage.items?.length,
})

const payload = await fetchMorningSyncPayload()
console.log('sync payload:', {
  recurring: payload.recurringPayments.length,
  retainers: payload.retainers.length,
})

const allRetainers = await client.searchAllRetainers()
console.log('retainer stats:', {
  total: allRetainers.length,
  activeFlag: allRetainers.filter((r) => r.active === true).length,
  status12: allRetainers.filter((r) => r.status === 1 || r.status === 2).length,
  mapped: allRetainers.map(mapMorningRetainer).filter(Boolean).length,
  statuses: [...new Set(allRetainers.map((r) => r.status))],
})

const allRecurring = await client.searchAllRecurringPayments()
console.log('recurring stats:', {
  total: allRecurring.length,
  status1020: allRecurring.filter((r) => r.status === 10 || r.status === 20).length,
  mapped: allRecurring.map(mapMorningRecurringPayment).filter(Boolean).length,
})
