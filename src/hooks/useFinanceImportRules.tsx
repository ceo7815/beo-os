import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  collection,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore'
import { useAuth } from '../contexts/AuthContext'
import { db, canUseLegacyFirestore } from '../lib/firebase'
import { stripUndefined } from '../lib/stripUndefined'
import { toastFsError } from '../lib/fsToast'
import type { ImportRule } from '../lib/bankImport/matching'

const RULES_COLLECTION = 'financeImportRules'

/** מזהה מסמך בטוח מתוך merchantKey (Firestore לא מאפשר '/' ועוד) */
function ruleDocId(merchantKey: string): string {
  return encodeURIComponent(merchantKey).replace(/[.#$/[\]]/g, '_')
}

export function useFinanceImportRules() {
  const { user } = useAuth()
  const [rules, setRules] = useState<ImportRule[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) {
      setRules([])
      setLoading(false)
      return
    }
    if (!canUseLegacyFirestore()) {
      setLoading(false)
      return
    }
    setLoading(true)
    const unsub = onSnapshot(
      collection(db, RULES_COLLECTION),
      (snap) => {
        setRules(
          snap.docs.map((d) => {
            const x = d.data()
            return {
              merchantKey: String(x.merchantKey ?? ''),
              type: x.type ? String(x.type) : undefined,
              vatClass: x.vatClass ?? undefined,
              projectId: x.projectId ? String(x.projectId) : undefined,
              clientId: x.clientId ? String(x.clientId) : undefined,
              name: x.name ? String(x.name) : undefined,
              recurring:
                typeof x.recurring === 'boolean' ? x.recurring : undefined,
            } as ImportRule
          }),
        )
        setLoading(false)
      },
      (err) => {
        // כללי הלמידה אופציונליים — אם לא פורסו עדיין, הייבוא ממשיך בלי למידה
        const code =
          err && typeof err === 'object' && 'code' in err
            ? String((err as { code?: string }).code)
            : ''
        if (code !== 'permission-denied') {
          toastFsError('שגיאה בטעינת כללי ייבוא', err, 'importRules snapshot')
        }
        setRules([])
        setLoading(false)
      },
    )
    return () => unsub()
  }, [user])

  const rulesByKey = useMemo(() => {
    const m = new Map<string, ImportRule>()
    rules.forEach((r) => {
      if (r.merchantKey) m.set(r.merchantKey, r)
    })
    return m
  }, [rules])

  /** שומר/מעדכן כלל מיפוי לבית עסק — נלמד מבחירת המשתמש */
  const saveRule = useCallback(async (rule: ImportRule) => {
    if (!rule.merchantKey) return
    try {
      await setDoc(
        doc(db, RULES_COLLECTION, ruleDocId(rule.merchantKey)),
        stripUndefined({
          merchantKey: rule.merchantKey,
          type: rule.type,
          vatClass: rule.vatClass,
          projectId: rule.projectId,
          clientId: rule.clientId,
          name: rule.name,
          recurring: rule.recurring,
          updatedAt: serverTimestamp(),
        }),
        { merge: true },
      )
    } catch (e) {
      const code =
        e && typeof e === 'object' && 'code' in e
          ? String((e as { code?: string }).code)
          : ''
      if (code !== 'permission-denied') {
        toastFsError('שגיאה בשמירת כלל ייבוא', e, 'saveRule')
      }
    }
  }, [])

  const saveRulesBatch = useCallback(
    async (list: ImportRule[]) => {
      await Promise.all(list.map((r) => saveRule(r)))
    },
    [saveRule],
  )

  return { rules, rulesByKey, loading, saveRule, saveRulesBatch }
}
