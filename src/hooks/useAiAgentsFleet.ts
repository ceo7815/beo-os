import { useCallback, useEffect, useState } from 'react'
import {
  fetchAiAgentsFleet,
  type FleetResponse,
} from '../lib/aiAgentsFleet'

export function useAiAgentsFleet(enabled = true) {
  const [loading, setLoading] = useState(enabled)
  const [error, setError] = useState<string | null>(null)
  const [fleet, setFleet] = useState<FleetResponse | null>(null)

  const reload = useCallback(async () => {
    if (!enabled) {
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    const result = await fetchAiAgentsFleet()
    if (result.ok) {
      setFleet(result.data)
      setError(null)
    } else {
      setFleet(null)
      setError(result.error)
    }
    setLoading(false)
  }, [enabled])

  useEffect(() => {
    void reload()
  }, [reload])

  return {
    loading,
    error,
    fleet,
    fleetUp: Boolean(fleet && !error),
    reload,
  }
}
