import { useCallback } from 'react'
import { describeError } from '../lib/describeError'

/** Runs a persisted mutation and reports whether it landed. */
export type Write = (label: string, action: () => Promise<void>) => Promise<boolean>

/**
 * The convention every persisted mutation in the app goes through: local state
 * moves only once the write lands, and a failure surfaces in `error` under a
 * label naming what was being attempted.
 *
 * Shared by `WorkshopProvider` and `GroupsProvider` rather than written in each,
 * so the rule has one definition to change. `setError` comes from `useState` and
 * is stable, so the returned `write` is stable for the provider's lifetime.
 */
export function useWrite(setError: (message: string | null) => void): Write {
  return useCallback(
    async (label, action) => {
      try {
        await action()
        setError(null)
        return true
      } catch (cause) {
        setError(`${label}: ${describeError(cause)}`)
        return false
      }
    },
    [setError],
  )
}
