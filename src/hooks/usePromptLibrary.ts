import { useCallback, useEffect, useState } from 'react'
import { extractPromptVariables } from '../lib/extractPromptVariables'
import {
  loadPromptLibraryFromStorage,
  savePromptLibraryToStorage,
} from '../lib/promptLibraryStorage'
import { defaultPromptLibrarySeed } from '../lib/promptLibrarySeed'
import type { PromptLibraryEntry, PromptTargetModel } from '../types/promptLibrary'

export function usePromptLibrary() {
  const [entries, setEntries] = useState<PromptLibraryEntry[]>(() => {
    const loaded = loadPromptLibraryFromStorage()
    if (loaded !== null) return loaded
    return defaultPromptLibrarySeed()
  })

  useEffect(() => {
    savePromptLibraryToStorage(entries)
  }, [entries])

  const addEntry = useCallback(
    (input: {
      title: string
      category: string
      targetModel: PromptTargetModel
      content: string
    }) => {
      const title = input.title.trim()
      const category = input.category.trim()
      const content = input.content.trim()
      if (!title || !content) return false
      const variables = extractPromptVariables(content)
      const id =
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `p-${Date.now()}`
      setEntries((prev) => [
        {
          id,
          title,
          category: category || 'כללי',
          targetModel: input.targetModel,
          content,
          variables,
        },
        ...prev,
      ])
      return true
    },
    [],
  )

  const updateEntry = useCallback(
    (
      id: string,
      input: {
        title: string
        category: string
        targetModel: PromptTargetModel
        content: string
      },
    ) => {
      const title = input.title.trim()
      const category = input.category.trim()
      const content = input.content.trim()
      if (!title || !content) return false
      const variables = extractPromptVariables(content)
      let found = false
      setEntries((prev) => {
        if (!prev.some((e) => e.id === id)) return prev
        found = true
        return prev.map((e) =>
          e.id === id
            ? {
                ...e,
                title,
                category: category || 'כללי',
                targetModel: input.targetModel,
                content,
                variables,
              }
            : e,
        )
      })
      return found
    },
    [],
  )

  const deleteEntry = useCallback((id: string) => {
    setEntries((prev) => prev.filter((e) => e.id !== id))
  }, [])

  return { entries, addEntry, updateEntry, deleteEntry }
}
