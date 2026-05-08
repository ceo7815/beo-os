import type { Firestore } from 'firebase/firestore'
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore'
import { db } from './firebase'
import { HUB_SUPPLIER_ID, HUB_SUPPLIER_NAME } from './hubSupplier'
import type { Priority, ProjectStatus, TaskStatus } from '../types'

const SEED_CLIENT_IDS = ['seed_client_1', 'seed_client_2'] as const
const SEED_PROJECT_IDS = ['seed_project_1', 'seed_project_2'] as const
const SEED_TASK_IDS = ['seed_task_1', 'seed_task_2', 'seed_task_3', 'seed_task_4'] as const

/** לקוח יחיד עם הרבה פרויקטים ומשימות — בדיקה לפי משימת העוגן */
const PACK_CLIENT_ID = 'seed_client_hub_full_demo'
const PACK_PROJECT_IDS = [
  'seed_proj_full_1',
  'seed_proj_full_2',
  'seed_proj_full_3',
  'seed_proj_full_4',
] as const
const PACK_ANCHOR_TASK_ID = 'seed_task_full_001'
const PACK_TASK_COUNT = 48

const MERGE = { merge: true } as const

const FULL_DEMO_PROJECTS: readonly {
  id: (typeof PACK_PROJECT_IDS)[number]
  name: string
  status: ProjectStatus
  priority: Priority
  color: string
}[] = [
  {
    id: 'seed_proj_full_1',
    name: 'אתר WordPress וחנות',
    status: 'active',
    priority: 'high',
    color: '#2563EB',
  },
  {
    id: 'seed_proj_full_2',
    name: 'קמפיין ממומן רבעוני',
    status: 'active',
    priority: 'high',
    color: '#7C3AED',
  },
  {
    id: 'seed_proj_full_3',
    name: 'תחזוקה חודשית',
    status: 'paused',
    priority: 'medium',
    color: '#059669',
  },
  {
    id: 'seed_proj_full_4',
    name: 'מיתוג ואסטרטגיה',
    status: 'active',
    priority: 'medium',
    color: '#EA580C',
  },
]

/** 12 משימות לכל פרויקט (סה״כ 48) */
const FULL_DEMO_TASK_TITLES: readonly (readonly string[])[] = [
  [
    'אפיון מבנה אתר ומפת מידע',
    'התקנת WordPress ותבנית בסיס',
    'עמודי שירותים (חמישה דפים)',
    'חיבור טפסים ו־SMTP',
    'קטלוג מוצרים — ייבוא ראשוני',
    'חיבור סליקה / WooCommerce',
    'התאמות RTL לתבנית',
    'אופטימיזציה למובייל',
    'חיבור Google Analytics',
    'הטמעת תגיות ממומן',
    'בדיקות QA לפני עליה',
    'עליה לייצור ומסיר DNS',
  ],
  [
    'הגדרת חשבון מודעות',
    'מחקר מילות מפתח',
    'כתיבת מודעות סט A/B',
    'קריאייטיב באנרים',
    'קהלי רימרקטינג',
    'תקציב יומי והגבלות',
    'דוח ביצועים שבועי',
    'אופטימיזציה לפי CTR',
    'ניסוי קהלים (גיל / מיקום)',
    'עמוד נחיתה',
    'מעקב המרות',
    'סיכום רבעון',
  ],
  [
    'גיבויים שבועיים',
    'עדכוני תוספים',
    'מניעת דואר זבל',
    'תיקון שבושים דחוף',
    'דוח חודשי ללקוח',
    'ניטור זמינות',
    'עדכון תוכן בעמוד הבית',
    'SSL ותזכורות חידוש',
    'אופטימיזציה למהירות',
    'סקירת אבטחה',
    'תמיכה במיילים',
    'רשימת המלצות לחודש הבא',
  ],
  [
    'ריאיון מותג',
    'לוח מצב רוח ויזואלי',
    'טיוטת לוגו ראשונה',
    'משפחת צבעים וטיפוגרפיה',
    'שימוש בלוגו במדיה',
    'תבנית מצגות',
    'כרטיס ביקור דיגיטלי',
    'מדריך מותג PDF',
    'עיצוב רשתות חברתיות',
    'חבילת אימיילים',
    'טון דיבור',
    'מסיר מסכים ללקוח',
  ],
]

const STATUS_CYCLE: TaskStatus[] = ['todo', 'doing', 'done', 'blocked']
const PRIORITY_CYCLE: Priority[] = ['high', 'medium', 'low']

async function seedActivityIfEmpty(
  db: Firestore,
  taskId: string,
  action: string,
): Promise<void> {
  const actCol = collection(db, 'tasks', taskId, 'activity')
  const existing = await getDocs(query(actCol, limit(1)))
  if (!existing.empty) return
  await addDoc(actCol, {
    userId: 'seed',
    userName: 'מערכת',
    action,
    createdAt: serverTimestamp(),
  })
}

/** הדמו הקטן המקורי (שני לקוחות, שני פרויקטים, ארבע משימות) */
async function seedBaseFirestoreDemoIfNeeded(db: Firestore): Promise<void> {
  const seedProjectRef = doc(db, 'projects', SEED_PROJECT_IDS[0])
  const seedTaskRef = doc(db, 'tasks', SEED_TASK_IDS[0])
  const [projSnap, taskSnap] = await Promise.all([
    getDoc(seedProjectRef),
    getDoc(seedTaskRef),
  ])
  if (projSnap.exists() && taskSnap.exists()) return

  const batch = writeBatch(db)

  batch.set(
    doc(db, 'clients', SEED_CLIENT_IDS[0]),
    {
      name: 'טכנולוגיות אופק',
      contact: 'רונית כהן',
      phone: '03-5551234',
      email: 'office@ofek-tech.co.il',
      department: 'הייטק',
      status: 'active',
      createdAt: serverTimestamp(),
    },
    MERGE,
  )
  batch.set(
    doc(db, 'clients', SEED_CLIENT_IDS[1]),
    {
      name: 'מותגים פלוס',
      contact: 'דני לוי',
      phone: '052-9876543',
      email: 'hello@brandsplus.co.il',
      department: 'שיווק',
      status: 'active',
      createdAt: serverTimestamp(),
    },
    MERGE,
  )

  batch.set(
    doc(db, 'projects', SEED_PROJECT_IDS[0]),
    {
      name: 'קמפיין רבעון Q2',
      projectKind: 'client',
      clientId: SEED_CLIENT_IDS[0],
      supplierId: HUB_SUPPLIER_ID,
      status: 'active',
      priority: 'high',
      dueDate: new Date().toISOString().slice(0, 10),
      ownerId: '',
      color: '#2563EB',
      taskCount: 0,
      doneCount: 0,
      createdAt: serverTimestamp(),
    },
    MERGE,
  )
  batch.set(
    doc(db, 'projects', SEED_PROJECT_IDS[1]),
    {
      name: 'מיתוג מחדש לאתר',
      projectKind: 'client',
      clientId: SEED_CLIENT_IDS[1],
      supplierId: HUB_SUPPLIER_ID,
      status: 'active',
      priority: 'medium',
      dueDate: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
      ownerId: '',
      color: '#F97316',
      taskCount: 0,
      doneCount: 0,
      createdAt: serverTimestamp(),
    },
    MERGE,
  )

  batch.set(
    doc(db, 'suppliers', HUB_SUPPLIER_ID),
    {
      name: HUB_SUPPLIER_NAME,
      phone: '',
      email: 'admin@hub.co.il',
      createdAt: serverTimestamp(),
    },
    MERGE,
  )

  const today = new Date().toISOString().slice(0, 10)
  const taskBase = {
    description: '',
    priority: 'medium' as const,
    assigneeId: '',
    dueDate: today,
    tags: [] as string[],
    reminders: [] as { id: string; at: string }[],
    shared: false,
    createdAt: serverTimestamp(),
    createdBy: 'seed',
  }

  batch.set(
    doc(db, 'tasks', SEED_TASK_IDS[0]),
    {
      ...taskBase,
      title: 'אישור קריאייטיב ראשוני',
      status: 'todo',
      shared: true,
      projectId: SEED_PROJECT_IDS[0],
      supplierId: HUB_SUPPLIER_ID,
    },
    MERGE,
  )
  batch.set(
    doc(db, 'tasks', SEED_TASK_IDS[1]),
    {
      ...taskBase,
      title: 'הקמת קמפיין חיפוש',
      status: 'doing',
      projectId: SEED_PROJECT_IDS[0],
      supplierId: HUB_SUPPLIER_ID,
    },
    MERGE,
  )
  batch.set(
    doc(db, 'tasks', SEED_TASK_IDS[2]),
    {
      ...taskBase,
      title: 'המתנה לאישור לקוח',
      status: 'blocked',
      projectId: SEED_PROJECT_IDS[1],
    },
    MERGE,
  )
  batch.set(
    doc(db, 'tasks', SEED_TASK_IDS[3]),
    {
      ...taskBase,
      title: 'סיכום שבועי',
      status: 'done',
      projectId: SEED_PROJECT_IDS[1],
      supplierId: HUB_SUPPLIER_ID,
    },
    MERGE,
  )

  await batch.commit()

  for (const id of SEED_TASK_IDS) {
    await seedActivityIfEmpty(db, id, 'מערכת יצרה את המשימה')
  }
}

/**
 * לקוח דמו אחד + ארבעה פרויקטים + 48 משימות (נפרד מהדמו הקטן).
 * רץ גם כשהדמו הקטן כבר קיים ב-Firestore.
 */
async function seedRichSingleClientPackIfNeeded(db: Firestore): Promise<void> {
  const anchor = await getDoc(doc(db, 'tasks', PACK_ANCHOR_TASK_ID))
  if (anchor.exists()) return

  const batch = writeBatch(db)
  const todayMs = Date.now()

  batch.set(
    doc(db, 'suppliers', HUB_SUPPLIER_ID),
    {
      name: HUB_SUPPLIER_NAME,
      phone: '',
      email: 'admin@hub.co.il',
      createdAt: serverTimestamp(),
    },
    MERGE,
  )

  batch.set(
    doc(db, 'clients', PACK_CLIENT_ID),
    {
      name: 'דמו מלא — קליינט יחיד (זריעה)',
      contact: 'מערכת הדגמה',
      phone: '050-0000000',
      email: 'demo-pack@hub.local',
      department: 'דמו',
      status: 'active',
      createdAt: serverTimestamp(),
    },
    MERGE,
  )

  for (const p of FULL_DEMO_PROJECTS) {
    batch.set(
      doc(db, 'projects', p.id),
      {
        name: p.name,
        projectKind: 'client',
        clientId: PACK_CLIENT_ID,
        supplierId: HUB_SUPPLIER_ID,
        status: p.status,
        priority: p.priority,
        dueDate: new Date(todayMs + 21 * 86400000).toISOString().slice(0, 10),
        ownerId: '',
        color: p.color,
        taskCount: 0,
        doneCount: 0,
        createdAt: serverTimestamp(),
      },
      MERGE,
    )
  }

  const taskBase = {
    description: '',
    assigneeId: '',
    tags: [] as string[],
    reminders: [] as { id: string; at: string }[],
    shared: false,
    sharedWithUserIds: [] as string[],
    createdAt: serverTimestamp(),
    createdBy: 'seed',
    clientId: PACK_CLIENT_ID,
  }

  let globalIdx = 0
  for (let pi = 0; pi < FULL_DEMO_TASK_TITLES.length; pi++) {
    const titles = FULL_DEMO_TASK_TITLES[pi]!
    const projectId = PACK_PROJECT_IDS[pi]!
    for (let ti = 0; ti < titles.length; ti++) {
      globalIdx++
      const taskId = `seed_task_full_${String(globalIdx).padStart(3, '0')}`
      const status = STATUS_CYCLE[globalIdx % STATUS_CYCLE.length]!
      const priority = PRIORITY_CYCLE[globalIdx % PRIORITY_CYCLE.length]!
      const dueDate = new Date(todayMs + (globalIdx % 18) * 86400000)
        .toISOString()
        .slice(0, 10)
      const withSupplier = globalIdx % 3 !== 0

      batch.set(
        doc(db, 'tasks', taskId),
        {
          ...taskBase,
          title: titles[ti]!,
          status,
          priority,
          dueDate,
          projectId,
          ...(withSupplier ? { supplierId: HUB_SUPPLIER_ID } : {}),
          ...(globalIdx % 7 === 0 ? { shared: true as const } : {}),
        },
        MERGE,
      )
    }
  }

  await batch.commit()

  for (let n = 1; n <= PACK_TASK_COUNT; n++) {
    const taskId = `seed_task_full_${String(n).padStart(3, '0')}`
    await seedActivityIfEmpty(db, taskId, 'מערכת יצרה את המשימה')
  }

  console.log(
    `✅ Seeded rich demo: 1 client, ${PACK_PROJECT_IDS.length} projects, ${PACK_TASK_COUNT} tasks`,
  )
}

/**
 * מילוי נתוני דמו (לקוחות seed, פרויקטים, משימות) — אידמפוטנטי.
 * כולל חבילה עשירה ללקוח אחד (רצה גם אם הדמו הקטן כבר קיים).
 */
export async function seedFirestore(): Promise<void> {
  try {
    await seedBaseFirestoreDemoIfNeeded(db)
    await seedRichSingleClientPackIfNeeded(db)
  } catch (e) {
    console.error('seedFirestore', e)
  }
}

if (typeof window !== 'undefined' && import.meta.env.VITE_ENABLE_FIRESTORE_SEED === 'true') {
  ;(window as Window & { hubRestoreSeedDemo?: () => Promise<void> }).hubRestoreSeedDemo =
    () => seedFirestore()
}
