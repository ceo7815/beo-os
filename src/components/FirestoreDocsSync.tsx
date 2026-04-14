import { useEffect } from 'react'
import { collection, getDocsFromServer } from 'firebase/firestore'
import { useAuth } from '../contexts/AuthContext'
import { db } from '../lib/firebase'
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
    let cancelled = false

    const load = async () => {
      try {
        const snap = await getDocsFromServer(collection(db, 'docs'))
        if (cancelled) return
        useHubStore.setState({
          docs: snap.docs.map((d) => docToDoc(d)),
        })
      } catch (err) {
        if (cancelled) return
        console.error('docs snapshot', err)
        useHubStore.getState().pushToast('שגיאה בטעינת מסמכים', 'error')
      }
    }

    void load()
    const timer = window.setInterval(() => {
      void load()
    }, 15000)

    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [user])

  return null
}
