import {
  collection,
  deleteDoc,
  getDocs,
  query,
  where,
} from 'firebase/firestore'
import { getDb } from './firebase'

export async function deleteActivitySubcollection(taskId: string): Promise<void> {
  const db = getDb()
  const snap = await getDocs(collection(db, 'tasks', taskId, 'activity'))
  for (const d of snap.docs) {
    await deleteDoc(d.ref)
  }
}

export async function deleteTaskNotesSubcollection(taskId: string): Promise<void> {
  const db = getDb()
  const snap = await getDocs(collection(db, 'tasks', taskId, 'taskNotes'))
  for (const d of snap.docs) {
    await deleteDoc(d.ref)
  }
}

export async function deleteTasksAndDocsForProject(projectId: string): Promise<void> {
  const db = getDb()
  const tSnap = await getDocs(
    query(collection(db, 'tasks'), where('projectId', '==', projectId)),
  )
  for (const t of tSnap.docs) {
    await deleteActivitySubcollection(t.id)
    await deleteTaskNotesSubcollection(t.id)
    await deleteDoc(t.ref)
  }
  const dSnap = await getDocs(
    query(collection(db, 'docs'), where('projectId', '==', projectId)),
  )
  for (const d of dSnap.docs) {
    await deleteDoc(d.ref)
  }
}
