import {
  collection,
  deleteDoc,
  doc,
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
  normalizeSpell,
  type MaterialComponent,
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
 * Bumped whenever the starter catalog changes shape. A user below this version
 * gets the current catalog installed alongside whatever they already have —
 * never over it, so nothing they authored or edited is lost. Version 1 was the
 * domain/potency catalog; version 2 is the stoichiometric one; version 3 is the
 * balanced catalog — every currency sized into one band so none is erased by
 * transit, and no sinks, which could only ever lower what leaves the ring.
 * Version 4 is the current catalog, tuned against flat transit and stocking the
 * six relays; sinks are still authorable and still not shipped.
 */
const SEED_VERSION = 4

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
 * Guards against hand-edited records and against components written before the
 * ledger model. The latter come back with two empty ledgers, which is exactly what
 * `pruneInert` looks for on the way out.
 */
function toComponent(snapshot: QueryDocumentSnapshot<DocumentData>): MaterialComponent {
  return normalizeComponent({ ...(snapshot.data() as Partial<StoredComponent>), id: snapshot.id })
}

/**
 * Guards against older or hand-edited records missing newer fields. Every field
 * goes through `normalizeSpell`, not just the slots: `form` indexes `FORM_META`
 * straight from the render path, so a spell carrying one this build does not know
 * about would take the whole workshop down instead of opening as a prayer.
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
  private components(uid: string): CollectionReference<DocumentData> {
    return collection(db, 'users', uid, 'components')
  }

  private spells(uid: string): CollectionReference<DocumentData> {
    return collection(db, 'users', uid, 'spells')
  }

  private inFlight: Promise<MaterialComponent[]> | null = null

  /**
   * Concurrent loads share one round trip. Without this, React's StrictMode fires the
   * load effect twice on mount and both calls race to seed — correct, because the claim
   * below is transactional, but it costs a wasted transaction and logs its contention.
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

    // The codex is empty and this call did not write it, so either someone else just
    // seeded — React's StrictMode runs the load effect twice — or the user has deleted
    // every component. Re-read to find out which.
    return this.pruneInert(uid, (await getDocs(this.components(uid))).docs.map(toComponent))
  }

  /**
   * Deletes components with two empty ledgers, which the reaction cannot tell from an
   * empty slot. These can only be leftovers from the domain/potency model, which had no
   * ledgers to read: nothing since can save one. Runs on every load rather than being
   * tied to a seed version, so it is idempotent and costs a write only when it finds
   * something.
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
   * Installs the starter catalog once per seed version, so deleting seeds sticks until
   * the catalog itself changes. The version marker is claimed inside a transaction, so
   * concurrent loads — two tabs, or StrictMode's doubled effect — can't both write it.
   *
   * Existing components are never touched: a user coming from an older version keeps
   * everything they had and gains the new catalog beside it.
   *
   * Returns the seeds this call wrote, or null if there was nothing to install.
   */
  private async seedComponents(uid: string): Promise<MaterialComponent[] | null> {
    const profileRef = doc(db, 'users', uid)

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

  /**
   * Normalized on the way out as well as on the way in. The editor already cleans
   * what it collects, but the invariant belongs to the seam rather than to one
   * caller: anything else that ever writes a component — an importer, the conlang
   * module reusing this repository — would otherwise put zero entries, fractions
   * or out-of-range amounts straight into Firestore.
   */
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
