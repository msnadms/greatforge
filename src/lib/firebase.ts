import { initializeApp } from 'firebase/app'
import {
  GoogleAuthProvider,
  connectAuthEmulator,
  getAuth,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type Unsubscribe,
  type User,
} from 'firebase/auth'
import {
  connectFirestoreEmulator,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore'
import { normalizeEmail } from '../types/groups'

/**
 * Firebase bootstrap. Config comes from `VITE_FIREBASE_*` env vars (see `.env.example`);
 * `VITE_USE_FIREBASE_EMULATOR=true` points auth and Firestore at the local emulator suite.
 */

const app = initializeApp({
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
})

export const auth = getAuth(app)

// Keeps the workshop readable and writable offline, syncing when the connection returns.
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
})

if (import.meta.env.VITE_USE_FIREBASE_EMULATOR === 'true') {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
  connectFirestoreEmulator(db, '127.0.0.1', 8080)
}

const googleProvider = new GoogleAuthProvider()

/** Opens the Google account chooser. Must be called from a user gesture, or popup blockers eat it. */
export async function signInWithGoogle(): Promise<void> {
  await signInWithPopup(auth, googleProvider)
}

export async function signOutOfWorkshop(): Promise<void> {
  await signOut(auth)
}

/** Fires with the restored session (or null) once, then on every sign-in and sign-out. */
export function watchUser(
  onUser: (user: User | null) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  return onAuthStateChanged(auth, onUser, onError)
}

/**
 * The uid every document path hangs off. Synchronous by design: storage is only ever
 * reached from inside the signed-in workshop, so a missing user is a bug, not a wait.
 */
export function requireUid(): string {
  const uid = auth.currentUser?.uid
  if (!uid) throw new Error('Signed out — the workshop is unreachable.')
  return uid
}

/**
 * The address this account signed in with, folded to lowercase, or null if the
 * provider handed over none.
 *
 * Groups are addressed by email rather than by uid, since a game master invites
 * a person before that person's account exists to be named (see
 * `types/groups.ts`). Nullable rather than required: a missing address costs
 * this one feature and nothing else, so it is reported where it matters instead
 * of thrown at the door the way `requireUid` throws.
 *
 * Folded through `normalizeEmail` rather than by hand, because the same fold
 * derives a seat's document id (`membershipId`). Two spellings of it would let
 * the address a query looks for drift from the address a seat was written under.
 */
export function currentEmail(): string | null {
  const email = auth.currentUser?.email
  return email ? normalizeEmail(email) : null
}
