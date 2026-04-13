import { useEffect } from 'react'
import { collection, onSnapshot } from 'firebase/firestore'
import { useAuth } from '../contexts/AuthContext'
import { getDb } from '../lib/firebase'
import { docToDoc } from '../lib/firestoreMappers'
import { useHubStore } from '../store/useStore'

/** סנכרון אוסף `docs` ל-Zustand (מסמכי פרויקט) */
export function FirestoreDocsSync() {
  const { user } = useAuth()

  useEffect(() => {
    if (!user) {
      useHubStore.setState({ docs: [] })
      return
    }
    const db = getDb()
    const unsub = onSnapshot(
      collection(db, 'docs'),
      (snap) => {
        useHubStore.setState({
          docs: snap.docs.map((d) => docToDoc(d)),
        })
      },
      (err) => {
        console.error('docs snapshot', err)
        useHubStore.getState().pushToast('שגיאה בטעינת מסמכים', 'error')
      },
    )
    return () => unsub()
  }, [user])

  return null
}
