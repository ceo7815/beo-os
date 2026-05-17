import { createContext, useContext, type ReactNode } from 'react'
import { useAuth } from './AuthContext'

const AgentPreviewUserIdContext = createContext<string | null>(null)

export function AgentPreviewProvider({
  agentUserId,
  children,
}: {
  agentUserId: string
  children: ReactNode
}) {
  return (
    <AgentPreviewUserIdContext.Provider value={agentUserId}>
      {children}
    </AgentPreviewUserIdContext.Provider>
  )
}

export function useAgentPreviewUserId(): string | null {
  return useContext(AgentPreviewUserIdContext)
}

/** UID של הסוכן בפורטל — בתצוגת מנהל: הסוכן שנבחר; אחרת המשתמש המחובר */
export function useAgentPortalUserId(): string {
  const previewId = useAgentPreviewUserId()
  const { user } = useAuth()
  return previewId ?? user?.uid ?? ''
}
