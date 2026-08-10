import { createContext } from 'react'
import type { User } from 'firebase/auth'

export interface AuthValue {
  /** Null until the first sign-in, and again after signing out. */
  user: User | null
  /** False until Firebase has restored (or ruled out) a stored session. */
  ready: boolean
  /** True while the Google account chooser is open. */
  pending: boolean
  error: string | null
  signIn: () => Promise<void>
  signOut: () => Promise<void>
}

export const AuthContext = createContext<AuthValue | null>(null)
