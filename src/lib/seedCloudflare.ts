import { db } from './firebase'
import {
  collection,
  doc,
  getDocs,
  updateDoc,
  writeBatch,
} from 'firebase/firestore'

let seedCloudflareInFlight: Promise<void> | null = null

// 37 דומיינים מ-Cloudflare — AUTO GENERATED
const cloudflareDomains = [
  // גם ב-Hostinger — DNS דרך Cloudflare
  { domain: "alu-on.co.il",       inHostinger: true },
  { domain: "ashkara-paris.fr",   inHostinger: true },
  { domain: "bakrayot.co.il",     inHostinger: true },
  { domain: "capacity.co.il",     inHostinger: true },
  { domain: "hatona.co.il",       inHostinger: true },
  { domain: "hub.co.il",          inHostinger: true },
  { domain: "ibanks.co.il",       inHostinger: true },
  { domain: "jon.co.il",          inHostinger: true },
  { domain: "marketnet.co.il",    inHostinger: true },
  { domain: "master.org.il",      inHostinger: true },
  { domain: "moniyotplus.co.il",  inHostinger: true },
  { domain: "neto-kidum.co.il",   inHostinger: true },
  { domain: "revitalarc.co.il",   inHostinger: true },
  { domain: "segment-yg.com",     inHostinger: true },
  { domain: "smahot.com",         inHostinger: true },
  { domain: "zman.biz",           inHostinger: true },

  // רק ב-Cloudflare — שרת אחר
  { domain: "1x2totogal.co.il",   inHostinger: false },
  { domain: "2ip.co.il",          inHostinger: false },
  { domain: "ashtrombgu.co.il",   inHostinger: false },
  { domain: "betondaruch.co.il",  inHostinger: false },
  { domain: "damages.co.il",      inHostinger: false },
  { domain: "dantex.co.il",       inHostinger: false },
  { domain: "dntrade.co.il",      inHostinger: false },
  { domain: "energi.co.il",       inHostinger: false },
  { domain: "fredi-f.co.il",      inHostinger: false },
  { domain: "hub.org.il",         inHostinger: false },
  { domain: "kingsnooker.co.il",  inHostinger: false },
  { domain: "lorenzo-cafe.com",   inHostinger: false },
  { domain: "mag-or.com",         inHostinger: false },
  { domain: "my-cloud.co.il",     inHostinger: false },
  { domain: "mymoment.co.il",     inHostinger: false },
  { domain: "pizza-venice.co.il", inHostinger: false },
  { domain: "rehitea.co.il",      inHostinger: false },
  { domain: "t-bm.co.il",         inHostinger: false },
  { domain: "tof-haderech.co.il", inHostinger: false },
  { domain: "yadmerapa.co.il",    inHostinger: false },
  { domain: "zhameret.co.il",     inHostinger: false },
]

export async function seedCloudflare(): Promise<void> {
  if (seedCloudflareInFlight) {
    await seedCloudflareInFlight
    return
  }
  seedCloudflareInFlight = (async () => {
    const snap = await getDocs(collection(db, 'domainRecords'))
    if (!snap.empty) {
      console.log('Domains already seeded — skipping')
      return
    }

    const createdAt = new Date().toISOString()
    const batch = writeBatch(db)
    for (const d of cloudflareDomains) {
      const id = d.domain.replace(/\./g, '-')
      batch.set(doc(db, 'domainRecords', id), {
        id,
        domain: d.domain,
        dns: 'Cloudflare',
        hosting: d.inHostinger ? 'Hostinger' : 'לא ידוע',
        status: 'active',
        clientId: '',
        notes: d.inHostinger
          ? 'DNS: Cloudflare → אחסון: Hostinger'
          : 'DNS: Cloudflare → אחסון: לא ידוע',
        createdAt,
      })
    }
    await batch.commit()

    for (const d of cloudflareDomains) {
      if (!d.inHostinger) continue
      const hostingId = d.domain.replace(/\./g, '-')
      try {
        await updateDoc(doc(db, 'hostingRecords', hostingId), {
          dns: 'Cloudflare',
        })
      } catch (_) {}
    }

    console.log(`✅ Seeded ${cloudflareDomains.length} domain records`)
  })()
  try {
    await seedCloudflareInFlight
  } finally {
    seedCloudflareInFlight = null
  }
}
