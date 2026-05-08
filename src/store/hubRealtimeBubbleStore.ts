import { create } from 'zustand'

export type HubRealtimeBubbleItem = {
  id: string
  title: string
  body: string
}

type HubRealtimeBubbleStore = {
  items: HubRealtimeBubbleItem[]
  pushBubble: (item: Omit<HubRealtimeBubbleItem, 'id'>) => void
  dismissBubble: (id: string) => void
}

const MAX_VISIBLE = 5
const AUTO_DISMISS_MS = 9000

export const useHubRealtimeBubbleStore = create<HubRealtimeBubbleStore>(
  (set, get) => ({
    items: [],
    pushBubble: ({ title, body }) => {
      const id = crypto.randomUUID()
      set((s) => ({
        items: [...s.items.slice(-(MAX_VISIBLE - 1)), { id, title, body }],
      }))
      window.setTimeout(() => {
        get().dismissBubble(id)
      }, AUTO_DISMISS_MS)
    },
    dismissBubble: (id) =>
      set((s) => ({ items: s.items.filter((x) => x.id !== id) })),
  }),
)
