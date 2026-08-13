import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  runTransaction,
  serverTimestamp,
  setDoc,
  type CollectionReference,
  type DocumentData,
  type QueryDocumentSnapshot,
} from 'firebase/firestore'
import { isInert } from '../data/currencies'
import { buildSeedComponents } from '../data/seedComponents'
import {
  normalizeComponent,
  normalizePlayerProfile,
  normalizeSpell,
  type MaterialComponent,
  type PlayerProfile,
  type Spell,
} from '../types/worldbuilding'
import { db, requireUid } from './firebase'
import { newId } from './id'
import type { WorkshopRepository } from './repository'

/**
 * Firestore-backed workshop storage, laid out as:
 *
 *   users/{uid}                            -> { seededAt, seedVersion }
 *   users/{uid}/components/{componentId}   -> MaterialComponent
 *   users/{uid}/spells/{spellId}           -> Spell
 *
 * Ids are generated client-side (`lib/id.ts`) and used as document ids, so the `id`
 * field is stripped on write and restored from the snapshot on read.
 */

/**
 * Bumped whenever the starter catalog changes shape, so existing users get the
 * new catalog installed alongside whatever they already have — never over it,
 * so nothing they authored or edited is lost.
 */
const SEED_VERSION = 15

/** Timestamps stay plain epoch numbers, matching the types and sorting without conversion. */
type StoredComponent = Omit<MaterialComponent, 'id'>
type StoredSpell = Omit<Spell, 'id'>

/** The document id carries the id, so it isn't duplicated inside the document body. */
function stripId<T extends { id: string }>(entity: T): Omit<T, 'id'> {
  const rest = { ...entity } as Partial<T>
  delete rest.id
  return rest as Omit<T, 'id'>
}

/**
 * Normalizes a stored record. A component written before the ledger model comes
 * back with two empty ledgers, which is what `pruneInert` looks for on the way out.
 */
function toComponent(snapshot: QueryDocumentSnapshot<DocumentData>): MaterialComponent {
  return normalizeComponent({ ...(snapshot.data() as Partial<StoredComponent>), id: snapshot.id })
}

/**
 * Normalizes a stored spell. `form` indexes `FORM_META` straight from the render
 * path, so an unnormalized value this build doesn't know would crash the workshop.
 */
function toSpell(snapshot: QueryDocumentSnapshot<DocumentData>): Spell {
  return normalizeSpell({ ...(snapshot.data() as Partial<StoredSpell>), id: snapshot.id })
}

/** Profiles seeded before versioning carry only `seededAt`; treat those as version 1. */
function installedVersion(profile: DocumentData): number {
  const stored = profile.seedVersion
  if (typeof stored === 'number' && Number.isFinite(stored)) return stored
  return profile.seededAt ? 1 : 0
}

export class FirestoreWorkshopRepository implements WorkshopRepository {
  private profileRef(uid: string) {
    return doc(db, 'users', uid)
  }

  private components(uid: string): CollectionReference<DocumentData> {
    return collection(db, 'users', uid, 'components')
  }

  private spells(uid: string): CollectionReference<DocumentData> {
    return collection(db, 'users', uid, 'spells')
  }

  private inFlight: Promise<MaterialComponent[]> | null = null

  async getProfile(): Promise<PlayerProfile> {
    const snapshot = await getDoc(this.profileRef(requireUid()))
    return normalizePlayerProfile(snapshot.exists() ? (snapshot.data() as Partial<PlayerProfile>) : undefined)
  }

  async saveProfile(profile: PlayerProfile): Promise<void> {
    await setDoc(this.profileRef(requireUid()), normalizePlayerProfile(profile), { merge: true })
  }

  /**
   * Concurrent loads share one round trip. Without this, StrictMode's doubled mount
   * effect races two calls into seeding at once — correct since the claim below is
   * transactional, but a wasted transaction and log noise.
   */
  listComponents(): Promise<MaterialComponent[]> {
    if (this.inFlight) return this.inFlight
    const load = this.loadComponents()
    this.inFlight = load.finally(() => {
      this.inFlight = null
    })
    return this.inFlight
  }

  private async loadComponents(): Promise<MaterialComponent[]> {
    const uid = requireUid()
    const existing = (await getDocs(this.components(uid))).docs.map(toComponent)

    const seeded = await this.seedComponents(uid)
    if (seeded) return this.pruneInert(uid, [...existing, ...seeded])
    if (existing.length > 0) return this.pruneInert(uid, existing)

    // Empty and this call didn't write it: either StrictMode's other effect just
    // seeded, or the user deleted every component. Re-read to find out which.
    return this.pruneInert(uid, (await getDocs(this.components(uid))).docs.map(toComponent))
  }

  /**
   * Deletes components with two empty ledgers, which the reaction cannot tell from an
   * empty slot — leftovers the editor can no longer produce. Runs on every load rather
   * than a seed version so it stays idempotent.
   */
  private async pruneInert(
    uid: string,
    components: MaterialComponent[],
  ): Promise<MaterialComponent[]> {
    const dead = components.filter(isInert)
    if (dead.length === 0) return components

    await Promise.all(
      dead.map((component) => deleteDoc(doc(this.components(uid), component.id))),
    )
    return components.filter((component) => !isInert(component))
  }

  /**
   * Installs the starter catalog once per seed version. The version marker is claimed
   * inside a transaction, so concurrent loads — two tabs, or StrictMode's doubled
   * effect — can't both write it. Returns the seeds written, or null if none were.
   */
  private async seedComponents(uid: string): Promise<MaterialComponent[] | null> {
    const profileRef = this.profileRef(uid)

    return runTransaction(db, async (transaction) => {
      const profile = await transaction.get(profileRef)
      if (profile.exists() && installedVersion(profile.data()) >= SEED_VERSION) return null

      const seeded = buildSeedComponents(newId)
      for (const component of seeded) {
        transaction.set(doc(this.components(uid), component.id), stripId(component))
      }
      transaction.set(
        profileRef,
        { seedVersion: SEED_VERSION, seededAt: serverTimestamp() },
        { merge: true },
      )
      return seeded
    })
  }

  /** Normalized on write too, so any future caller of this seam can't write bad ledgers. */
  async saveComponent(component: MaterialComponent): Promise<void> {
    const uid = requireUid()
    await setDoc(doc(this.components(uid), component.id), stripId(normalizeComponent(component)))
  }

  async deleteComponent(id: string): Promise<void> {
    const uid = requireUid()
    await deleteDoc(doc(this.components(uid), id))
  }

  async listSpells(): Promise<Spell[]> {
    const uid = requireUid()
    const snapshot = await getDocs(this.spells(uid))
    return snapshot.docs.map(toSpell)
  }

  async saveSpell(spell: Spell): Promise<void> {
    const uid = requireUid()
    await setDoc(doc(this.spells(uid), spell.id), stripId(normalizeSpell(spell)))
  }

  async deleteSpell(id: string): Promise<void> {
    const uid = requireUid()
    await deleteDoc(doc(this.spells(uid), id))
  }
}

export const firestoreRepository = new FirestoreWorkshopRepository()
