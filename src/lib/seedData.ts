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
import { getDb } from './firebase'
import { HUB_SUPPLIER_ID, HUB_SUPPLIER_NAME } from './hubSupplier'

const SEED_CLIENT_IDS = ['seed_client_1', 'seed_client_2'] as const
const SEED_PROJECT_IDS = ['seed_project_1', 'seed_project_2'] as const
const SEED_TASK_IDS = ['seed_task_1', 'seed_task_2', 'seed_task_3', 'seed_task_4'] as const

const MERGE = { merge: true } as const

/**
 * מילוי נתוני דמו (לקוחות seed, פרויקטים, משימות) — אידמפוטנטי.
 * בעבר: אם seedClients מילא לקוחות מ-CSV, seedFirestore יצא מוקדם ולא יצר פרויקטים/משימות.
 * עכשיו: בודקים לפי מסמכי seed קבועים; merge:true לא דורס לקוחות אחרים (מזהים נפרדים).
 */
export async function seedFirestore(): Promise<void> {
  try {
    const db = getDb()
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
        status: 'planning',
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

    const seedActivityIfEmpty = async (taskId: string, action: string) => {
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

    await seedActivityIfEmpty(SEED_TASK_IDS[0], 'מערכת יצרה את המשימה')
    await seedActivityIfEmpty(SEED_TASK_IDS[1], 'מערכת יצרה את המשימה')
    await seedActivityIfEmpty(SEED_TASK_IDS[2], 'מערכת יצרה את המשימה')
    await seedActivityIfEmpty(SEED_TASK_IDS[3], 'מערכת יצרה את המשימה')
  } catch (e) {
    console.error('seedFirestore', e)
  }
}

if (typeof window !== 'undefined' && import.meta.env.VITE_ENABLE_FIRESTORE_SEED === 'true') {
  ;(window as Window & { hubRestoreSeedDemo?: () => Promise<void> }).hubRestoreSeedDemo =
    () => seedFirestore()
}
