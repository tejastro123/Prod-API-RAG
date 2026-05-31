import { useState, useEffect } from 'react'
import { subscribeToMetrics } from '@/lib/metrics'
import type { MetricsResponse, HealthResponse, CacheStats } from '@/types'

const BASE_URL = import.meta.env.VITE_API_URL || '/api'

export function useLiveMetrics() {
  const [metrics, setMetrics]   = useState<MetricsResponse | null>(null)
  const [health, setHealth]     = useState<HealthResponse | null>(null)
  const [cache, setCache]       = useState<CacheStats | null>(null)
  const [connected, setConnected] = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  useEffect(() => {
    const unsub = subscribeToMetrics(BASE_URL, (event) => {
      setLastUpdated(new Date())
      setError(null)
      if (event.type === 'metrics')   setMetrics(event.data)
      if (event.type === 'health')    setHealth(event.data)
      if (event.type === 'cache')     setCache(event.data)
      if (event.type === 'connected') setConnected(true)
      if (event.type === 'error')     setError(event.message)
    }, 5000)

    setConnected(true)
    return unsub
  }, [])

  return { metrics, health, cache, connected, error, lastUpdated }
}
