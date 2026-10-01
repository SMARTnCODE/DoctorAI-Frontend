'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { apiFetch, ApiError } from '@/lib/api-client'

/**
 * Consistent GET data hook with loading/error/refetch.
 * Pass `null` as path to skip fetching.
 *
 * Duplicate GETs for the same path are shared by `apiFetch` (covers React
 * Strict Mode's double effect mount in development).
 */
export function useApiData<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState<boolean>(path !== null)
  const [error, setError] = useState<string | null>(null)
  const pathRef = useRef(path)
  pathRef.current = path
  const requestIdRef = useRef(0)

  const refetch = useCallback(async () => {
    if (!pathRef.current) return
    const requestId = ++requestIdRef.current
    setLoading(true)
    setError(null)
    try {
      const result = await apiFetch<T>(pathRef.current)
      if (requestId !== requestIdRef.current) return
      setData(result)
    } catch (e) {
      if (requestId !== requestIdRef.current) return
      const msg = e instanceof ApiError ? e.message : 'Something went wrong.'
      setError(msg)
    } finally {
      if (requestId === requestIdRef.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    const requestId = ++requestIdRef.current

    if (!path) {
      setData(null)
      setLoading(false)
      setError(null)
      return
    }

    setLoading(true)
    setError(null)
    apiFetch<T>(path)
      .then((result) => {
        if (requestId !== requestIdRef.current) return
        setData(result)
      })
      .catch((e: unknown) => {
        if (requestId !== requestIdRef.current) return
        setError(e instanceof ApiError ? e.message : 'Something went wrong.')
      })
      .finally(() => {
        if (requestId === requestIdRef.current) setLoading(false)
      })

    return () => {
      // Invalidate this effect's result (Strict Mode remount / path change).
      // Do not abort the shared GET — a remount may reuse the same in-flight promise.
      if (requestId === requestIdRef.current) {
        requestIdRef.current += 1
      }
    }
  }, [path])

  return { data, loading, error, refetch }
}
