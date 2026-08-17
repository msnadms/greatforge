import { FirebaseError } from 'firebase/app'
import type { User } from 'firebase/auth'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { describeError } from '../lib/describeError'
import { signInWithGoogle, signOutOfWorkshop, watchUser } from '../lib/firebase'
import { AuthContext, type AuthValue } from './authContext'

/** Codes that mean "the user changed their mind", which is not worth reporting back to them. */
const SILENT_CODES = new Set([
  'auth/popup-closed-by-user',
  'auth/cancelled-popup-request',
  'auth/user-cancelled',
])

function describe(error: unknown): string | null {
  if (error instanceof FirebaseError) {
    if (SILENT_CODES.has(error.code)) return null
    if (error.code === 'auth/popup-blocked') {
      return 'Your browser blocked the sign-in window. Allow popups for this site and try again.'
    }
    if (error.code === 'auth/operation-not-allowed') {
      return 'Google sign-in is not enabled on this Firebase project.'
    }
    if (error.code === 'auth/unauthorized-domain') {
      return 'This domain is not in the Firebase project’s authorized list.'
    }
  }
  return describeError(error)
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [ready, setReady] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(
    () =>
      watchUser(
        (next) => {
          setUser(next)
          setReady(true)
        },
        (cause) => {
          setError(describe(cause))
          setReady(true)
        },
      ),
    [],
  )

  const signIn = useCallback(async () => {
    setPending(true)
    setError(null)
    try {
      await signInWithGoogle()
    } catch (cause) {
      setError(describe(cause))
    } finally {
      setPending(false)
    }
  }, [])

  const signOut = useCallback(async () => {
    try {
      await signOutOfWorkshop()
    } catch (cause) {
      setError(describe(cause))
    }
  }, [])

  const value: AuthValue = useMemo(
    () => ({ user, ready, pending, error, signIn, signOut }),
    [user, ready, pending, error, signIn, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
