import { db } from './firebase'
import {
  collection,
  doc,
  getDocs,
  writeBatch,
} from 'firebase/firestore'

/** מונע הרצה מקבילית (StrictMode / הודעת Target ID already exists ב-Web) */
let seedHostingInFlight: Promise<void> | null = null

// 59 אתרים מהוסטינגר — AUTO GENERATED
const hostingData = [
  { id: "sagsoget-co-il", domain: "sagsoget.co.il", server: "Hostinger", serverLocation: "חול", platform: "WordPress", status: "broken", isTemp: false, domainExpiry: "", sslExpiry: "", clientId: "", notes: "דומיין לא עובד — לבדוק" },
  { id: "bakrayot-co-il", domain: "bakrayot.co.il", server: "Hostinger", serverLocation: "חול", platform: "לא ידוע", status: "broken", isTemp: false, domainExpiry: "", sslExpiry: "", clientId: "", notes: "דומיין לא עובד — לבדוק" },
  { id: "lightgrey-stork-784952-hostingersite-com", domain: "lightgrey-stork-784952.hostingersite.com", server: "Hostinger", serverLocation: "חול", platform: "לא ידוע", status: "temp", isTemp: true, domainExpiry: "", sslExpiry: "", clientId: "", notes: "דומיין זמני — יש לחבר דומיין" },
  { id: "alu-on-co-il", domain: "alu-on.co.il", server: "Hostinger", serverLocation: "חול", platform: "לא ידוע", status: "broken", isTemp: false, domainExpiry: "", sslExpiry: "", clientId: "", notes: "דומיין לא עובד — לבדוק" },
  { id: "mediumaquamarine-kudu-169244-hostingersite-com", domain: "mediumaquamarine-kudu-169244.hostingersite.com", server: "Hostinger", serverLocation: "חול", platform: "WordPress", status: "temp", isTemp: true, domainExpiry: "", sslExpiry: "", clientId: "", notes: "דומיין זמני — יש לחבר דומיין" },
  { id: "blue-ant-955847-hostingersite-com", domain: "blue-ant-955847.hostingersite.com", server: "Hostinger", serverLocation: "חול", platform: "לא ידוע", status: "temp", isTemp: true, domainExpiry: "", sslExpiry: "", clientId: "", notes: "דומיין זמני — יש לחבר דומיין" },
  { id: "alu-bakrayot-co-il", domain: "alu.bakrayot.co.il", server: "Hostinger", serverLocation: "חול", platform: "WordPress", status: "broken", isTemp: false, domainExpiry: "", sslExpiry: "", clientId: "", notes: "דומיין לא עובד — לבדוק" },
  { id: "sienna-duck-658240-hostingersite-com", domain: "sienna-duck-658240.hostingersite.com", server: "Hostinger", serverLocation: "חול", platform: "WordPress", status: "temp", isTemp: true, domainExpiry: "", sslExpiry: "", clientId: "", notes: "דומיין זמני — יש לחבר דומיין" },
  { id: "gaz-bakrayot-co-il", domain: "gaz.bakrayot.co.il", server: "Hostinger", serverLocation: "חול", platform: "WordPress", status: "active", isTemp: false, domainExpiry: "", sslExpiry: "", clientId: "", notes: "" },
  { id: "itzik-hub-co-il", domain: "itzik.hub.co.il", server: "Hostinger", serverLocation: "חול", platform: "WordPress", status: "active", isTemp: false, domainExpiry: "", sslExpiry: "", clientId: "", notes: "" },
  { id: "silver-wolf-707500-hostingersite-com", domain: "silver-wolf-707500.hostingersite.com", server: "Hostinger", serverLocation: "חול", platform: "לא ידוע", status: "temp", isTemp: true, domainExpiry: "", sslExpiry: "", clientId: "", notes: "דומיין זמני — יש לחבר דומיין" },
  { id: "cornflowerblue-stork-110182-hostingersite-com", domain: "cornflowerblue-stork-110182.hostingersite.com", server: "Hostinger", serverLocation: "חול", platform: "WordPress", status: "temp", isTemp: true, domainExpiry: "", sslExpiry: "", clientId: "", notes: "דומיין זמני — יש לחבר דומיין" },
  { id: "gmb-bakrayot-co-il", domain: "gmb.bakrayot.co.il", server: "Hostinger", serverLocation: "חול", platform: "לא ידוע", status: "active", isTemp: false, domainExpiry: "", sslExpiry: "", clientId: "", notes: "" },
  { id: "pro-bakrayot-co-il", domain: "pro.bakrayot.co.il", server: "Hostinger", serverLocation: "חול", platform: "WordPress", status: "active", isTemp: false, domainExpiry: "", sslExpiry: "", clientId: "", notes: "" },
  { id: "beorestai-2il-co", domain: "beorestai.2il.co", server: "Hostinger", serverLocation: "חול", platform: "לא ידוע", status: "active", isTemp: false, domainExpiry: "", sslExpiry: "", clientId: "", notes: "" },
  { id: "security-bakrayot-co-il", domain: "security.bakrayot.co.il", server: "Hostinger", serverLocation: "חול", platform: "WordPress", status: "active", isTemp: false, domainExpiry: "", sslExpiry: "", clientId: "", notes: "" },
  { id: "rafi-plumber-bakrayot-co-il", domain: "rafi-plumber.bakrayot.co.il", server: "Hostinger", serverLocation: "חול", platform: "WordPress", status: "active", isTemp: false, domainExpiry: "", sslExpiry: "", clientId: "", notes: "" },
  { id: "template1-bakrayot-co-il", domain: "template1.bakrayot.co.il", server: "Hostinger", serverLocation: "חול", platform: "WordPress", status: "active", isTemp: false, domainExpiry: "", sslExpiry: "", clientId: "", notes: "" },
  { id: "moniyotplus-co-il", domain: "moniyotplus.co.il", server: "Hostinger", serverLocation: "חול", platform: "WordPress", status: "active", isTemp: false, domainExpiry: "", sslExpiry: "", clientId: "", notes: "" },
  { id: "taxi-bakrayot-co-il", domain: "taxi.bakrayot.co.il", server: "Hostinger", serverLocation: "חול", platform: "WordPress", status: "active", isTemp: false, domainExpiry: "", sslExpiry: "", clientId: "", notes: "" },
  { id: "wpmanage-hub-co-il", domain: "wpmanage.hub.co.il", server: "Hostinger", serverLocation: "חול", platform: "WordPress", status: "active", isTemp: false, domainExpiry: "", sslExpiry: "", clientId: "", notes: "" },
  { id: "hub-co-il", domain: "hub.co.il", server: "Hostinger", serverLocation: "חול", platform: "WordPress", status: "active", isTemp: false, domainExpiry: "", sslExpiry: "", clientId: "", notes: "" },
  { id: "jon-co-il", domain: "jon.co.il", server: "Hostinger", serverLocation: "חול", platform: "WordPress", status: "active", isTemp: false, domainExpiry: "", sslExpiry: "", clientId: "", notes: "" },
  { id: "marketnet-co-il", domain: "marketnet.co.il", server: "Hostinger", serverLocation: "חול", platform: "WordPress", status: "broken", isTemp: false, domainExpiry: "", sslExpiry: "", clientId: "", notes: "דומיין לא עובד — לבדוק" },
  { id: "finance-bakrayot-co-il", domain: "finance.bakrayot.co.il", server: "Hostinger", serverLocation: "חול", platform: "WordPress", status: "active", isTemp: false, domainExpiry: "", sslExpiry: "", clientId: "", notes: "" },
  { id: "services-bakrayot-co-il", domain: "services.bakrayot.co.il", server: "Hostinger", serverLocation: "חול", platform: "לא ידוע", status: "active", isTemp: false, domainExpiry: "", sslExpiry: "", clientId: "", notes: "" },
  { id: "master-org-il", domain: "master.org.il", server: "Hostinger", serverLocation: "חול", platform: "WordPress", status: "active", isTemp: false, domainExpiry: "", sslExpiry: "", clientId: "", notes: "" },
  { id: "patch-for-life-com", domain: "patch-for-life.com", server: "Hostinger", serverLocation: "חול", platform: "WordPress", status: "active", isTemp: false, domainExpiry: "2026-05-07", sslExpiry: "", clientId: "", notes: "" },
  { id: "revitalarc-co-il", domain: "revitalarc.co.il", server: "Hostinger", serverLocation: "חול", platform: "WordPress", status: "active", isTemp: false, domainExpiry: "", sslExpiry: "", clientId: "", notes: "" },
  { id: "seo-hub-co-il", domain: "seo.hub.co.il", server: "Hostinger", serverLocation: "חול", platform: "WordPress", status: "active", isTemp: false, domainExpiry: "", sslExpiry: "", clientId: "", notes: "" },
  { id: "seo-haifa-2il-co", domain: "seo-haifa.2il.co", server: "Hostinger", serverLocation: "חול", platform: "WordPress", status: "active", isTemp: false, domainExpiry: "", sslExpiry: "", clientId: "", notes: "" },
  { id: "web-master-org-il", domain: "web.master.org.il", server: "Hostinger", serverLocation: "חול", platform: "WordPress", status: "active", isTemp: false, domainExpiry: "", sslExpiry: "", clientId: "", notes: "" },
  { id: "site-2il-co", domain: "site.2il.co", server: "Hostinger", serverLocation: "חול", platform: "WordPress", status: "active", isTemp: false, domainExpiry: "", sslExpiry: "", clientId: "", notes: "" },
  { id: "iai-email", domain: "iai.email", server: "Hostinger", serverLocation: "חול", platform: "WordPress", status: "active", isTemp: false, domainExpiry: "2026-06-30", sslExpiry: "", clientId: "", notes: "" },
  { id: "print-ahouse-com", domain: "print-ahouse.com", server: "Hostinger", serverLocation: "חול", platform: "לא ידוע", status: "broken", isTemp: false, domainExpiry: "", sslExpiry: "", clientId: "", notes: "דומיין לא עובד — לבדוק" },
  { id: "ashtrom4rent-2il-co", domain: "ashtrom4rent.2il.co", server: "Hostinger", serverLocation: "חול", platform: "לא ידוע", status: "active", isTemp: false, domainExpiry: "", sslExpiry: "", clientId: "", notes: "" },
  { id: "pharmaform-hub-co-il", domain: "pharmaform.hub.co.il", server: "Hostinger", serverLocation: "חול", platform: "לא ידוע", status: "active", isTemp: false, domainExpiry: "", sslExpiry: "", clientId: "", notes: "" },
  { id: "page-2il-co", domain: "page.2il.co", server: "Hostinger", serverLocation: "חול", platform: "WordPress", status: "active", isTemp: false, domainExpiry: "", sslExpiry: "", clientId: "", notes: "" },
  { id: "zman-biz", domain: "zman.biz", server: "Hostinger", serverLocation: "חול", platform: "WordPress", status: "active", isTemp: false, domainExpiry: "", sslExpiry: "", clientId: "", notes: "" },
  { id: "hatona-co-il", domain: "hatona.co.il", server: "Hostinger", serverLocation: "חול", platform: "WordPress", status: "active", isTemp: false, domainExpiry: "", sslExpiry: "", clientId: "", notes: "" },
  { id: "ibanks-co-il", domain: "ibanks.co.il", server: "Hostinger", serverLocation: "חול", platform: "WordPress", status: "active", isTemp: false, domainExpiry: "", sslExpiry: "", clientId: "", notes: "" },
  { id: "neto-kidum-co-il", domain: "neto-kidum.co.il", server: "Hostinger", serverLocation: "חול", platform: "WordPress", status: "active", isTemp: false, domainExpiry: "", sslExpiry: "", clientId: "", notes: "" },
  { id: "capacity-co-il", domain: "capacity.co.il", server: "Hostinger", serverLocation: "חול", platform: "WordPress", status: "active", isTemp: false, domainExpiry: "", sslExpiry: "", clientId: "", notes: "" },
  { id: "1seo-co-il", domain: "1seo.co.il", server: "Hostinger", serverLocation: "חול", platform: "WordPress", status: "active", isTemp: false, domainExpiry: "", sslExpiry: "", clientId: "", notes: "" },
  { id: "kablanim-2il-co", domain: "kablanim.2il.co", server: "Hostinger", serverLocation: "חול", platform: "WordPress", status: "active", isTemp: false, domainExpiry: "", sslExpiry: "", clientId: "", notes: "" },
  { id: "brains-2il-co", domain: "brains.2il.co", server: "Hostinger", serverLocation: "חול", platform: "WordPress", status: "active", isTemp: false, domainExpiry: "", sslExpiry: "", clientId: "", notes: "" },
  { id: "dev-2il-co", domain: "dev.2il.co", server: "Hostinger", serverLocation: "חול", platform: "לא ידוע", status: "active", isTemp: false, domainExpiry: "", sslExpiry: "", clientId: "", notes: "" },
  { id: "plumber-2il-co", domain: "plumber.2il.co", server: "Hostinger", serverLocation: "חול", platform: "WordPress", status: "active", isTemp: false, domainExpiry: "", sslExpiry: "", clientId: "", notes: "" },
  { id: "gifts-2il-co", domain: "gifts.2il.co", server: "Hostinger", serverLocation: "חול", platform: "WordPress", status: "active", isTemp: false, domainExpiry: "", sslExpiry: "", clientId: "", notes: "" },
  { id: "smahot-com", domain: "smahot.com", server: "Hostinger", serverLocation: "חול", platform: "לא ידוע", status: "active", isTemp: false, domainExpiry: "", sslExpiry: "", clientId: "", notes: "" },
  { id: "ballon2u-co-il", domain: "ballon2u.co.il", server: "Hostinger", serverLocation: "חול", platform: "WordPress", status: "broken", isTemp: false, domainExpiry: "", sslExpiry: "", clientId: "", notes: "דומיין לא עובד — לבדוק" },
  { id: "2il-co", domain: "2il.co", server: "Hostinger", serverLocation: "חול", platform: "WordPress", status: "active", isTemp: false, domainExpiry: "2026-10-04", sslExpiry: "", clientId: "", notes: "" },
  { id: "down-2il-co", domain: "down.2il.co", server: "Hostinger", serverLocation: "חול", platform: "לא ידוע", status: "active", isTemp: false, domainExpiry: "", sslExpiry: "", clientId: "", notes: "" },
  { id: "loans-2il-co", domain: "loans.2il.co", server: "Hostinger", serverLocation: "חול", platform: "לא ידוע", status: "active", isTemp: false, domainExpiry: "", sslExpiry: "", clientId: "", notes: "" },
  { id: "lp-2il-co", domain: "lp.2il.co", server: "Hostinger", serverLocation: "חול", platform: "לא ידוע", status: "active", isTemp: false, domainExpiry: "", sslExpiry: "", clientId: "", notes: "" },
  { id: "nachlat-avot-2il-co", domain: "nachlat-avot.2il.co", server: "Hostinger", serverLocation: "חול", platform: "לא ידוע", status: "active", isTemp: false, domainExpiry: "", sslExpiry: "", clientId: "", notes: "" },
  { id: "pentateuch-2il-co", domain: "pentateuch.2il.co", server: "Hostinger", serverLocation: "חול", platform: "WordPress", status: "active", isTemp: false, domainExpiry: "", sslExpiry: "", clientId: "", notes: "" },
  { id: "pergolas-2il-co", domain: "pergolas.2il.co", server: "Hostinger", serverLocation: "חול", platform: "WordPress", status: "active", isTemp: false, domainExpiry: "", sslExpiry: "", clientId: "", notes: "" },
  { id: "website-2il-co", domain: "website.2il.co", server: "Hostinger", serverLocation: "חול", platform: "לא ידוע", status: "active", isTemp: false, domainExpiry: "", sslExpiry: "", clientId: "", notes: "" },
]

export async function seedHosting(): Promise<void> {
  if (seedHostingInFlight) {
    await seedHostingInFlight
    return
  }
  seedHostingInFlight = (async () => {
    const snap = await getDocs(collection(db, 'hostingRecords'))
    if (!snap.empty) {
      console.log('Hosting already seeded — skipping')
      return
    }
    const batch = writeBatch(db)
    const createdAt = new Date().toISOString()
    for (const site of hostingData) {
      batch.set(doc(db, 'hostingRecords', site.id), {
        ...site,
        createdAt,
      })
    }
    await batch.commit()
    console.log(`✅ Seeded ${hostingData.length} hosting records`)
  })()
  try {
    await seedHostingInFlight
  } finally {
    seedHostingInFlight = null
  }
}
