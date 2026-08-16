import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
  type CollectionReference,
  type DocumentData,
  type QueryDocumentSnapshot,
} from 'firebase/firestore'
import { isInert } from '../data/currencies'
import { buildSeedComponents, SEED_CATALOG_SIGNATURE } from '../data/seedComponents'
import {
  normalizeCharacter,
  normalizeComponent,
  normalizePlayerProfile,
  normalizeSpell,
  type Character,
  type MaterialComponent,
  type PlayerProfile,
  type Spell,
} from '../types/worldbuilding'
import { db, requireUid } from './firebase'
import type { WorkshopRepository } from './repository'

/**
 * Firestore-backed workshop storage, laid out as:
 *
 *   users/{uid}                            -> { seededAt, seedSignature, mode, … }
 *   users/{uid}/characters/{characterId}   -> Character
 *   users/{uid}/components/{componentId}   -> MaterialComponent
 *   users/{uid}/spells/{spellId}           -> Spell
 *
 * Ids are generated client-side (`lib/id.ts`) and used as document ids, so the `id`
 * field is stripped on write and restored from the snapshot on read.
 */

/** Timestamps stay plain epoch numbers, matching the types and sorting without conversion. */
type StoredComponent = Omit<MaterialComponent, 'id'>
type StoredSpell = Omit<Spell, 'id'>
type StoredCharacter = Omit<Character, 'id'>

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

/**
 * The catalog fingerprint a profile was last seeded with. Profiles written before
 * signatures carry a `seedVersion` number instead, which never matches, so the
 * first load under this build reinstalls the catalog over what it left behind.
 */
function installedSignature(profile: DocumentData): string | null {
  const stored = profile.seedSignature
  return typeof stored === 'string' ? stored : null
}

export class FirestoreWorkshopRepository implements WorkshopRepository {
  private profileRef(uid: string) {
    return doc(db, 'users', uid)
  }

  private characters(uid: string): CollectionReference<DocumentData> {
    return collection(db, 'users', uid, 'characters')
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

  async listCharacters(): Promise<Character[]> {
    const snapshot = await getDocs(this.characters(requireUid()))
    return snapshot.docs.map((entry) =>
      normalizeCharacter({ ...(entry.data() as Partial<StoredCharacter>), id: entry.id }),
    )
  }

  async saveCharacter(character: Character): Promise<void> {
    const uid = requireUid()
    await setDoc(doc(this.characters(uid), character.id), stripId(normalizeCharacter(character)))
  }

  /**
   * Strikes the character and everything only it held: its shelf of rites, and
   * the satchel, which is a field on the character document and so goes with it.
   * The catalog is untouched — reagents are the account's, drawn on rather than
   * owned, and a carried one is a count in the satchel and nothing more.
   *
   * **The shelf and the character go in one batch**, so the sweep is a single
   * commit that either lands whole or not at all — there is no ordering to get
   * right and no state where a character stands over a shortened shelf, or
   * where rites outlive the only bench that could reach them. One batch holds
   * 500 writes, which is far more rites than a caster accumulates.
   *
   * Sandbox rites carry `characterId: null` and never match, so the equality
   * query is also what keeps them out of it.
   */
  async deleteCharacter(id: string): Promise<void> {
    const uid = requireUid()
    const shelf = await getDocs(query(this.spells(uid), where('characterId', '==', id)))
    const batch = writeBatch(db)
    for (const entry of shelf.docs) batch.delete(entry.ref)
    batch.delete(doc(this.characters(uid), id))
    await batch.commit()
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

    // The catalog is written over its old self, so the seeds read a moment ago are
    // stale the instant it installs; only what the user authored carries through.
    const seeded = await this.installCatalog(uid, existing)
    if (seeded) {
      const authored = existing.filter((component) => !component.isSeed)
      return this.pruneInert(uid, [...authored, ...seeded])
    }
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
   * Installs the starter catalog whenever this build's seeds differ from the ones on
   * record, writing each seed over the document it already occupies rather than
   * beside it. Identity is the seed's name: a reagent that kept its name keeps its
   * document id too, so a saved rite still finds what stands in its slots, and only
   * a seed this build no longer ships is withdrawn.
   *
   * Overwriting means the catalog wins. An edit to a seed survives until the catalog
   * changes and is then written over; anything the user authored (`isSeed` false) is
   * never touched, and a withdrawn seed can only ever be one the app itself shipped.
   *
   * The signature is claimed inside a transaction, so concurrent loads — two tabs, or
   * StrictMode's doubled effect — can't both install. Returns the seeds written, or
   * null if the record already matched.
   */
  private async installCatalog(
    uid: string,
    existing: MaterialComponent[],
  ): Promise<MaterialComponent[] | null> {
    const profileRef = this.profileRef(uid)
    const installed = new Map(
      existing.filter((component) => component.isSeed).map((component) => [component.name, component]),
    )
    // A seed already standing keeps its document id and the date it was first laid
    // down; a new one takes the id derived from its name.
    const catalog = buildSeedComponents().map((seed) => {
      const previous = installed.get(seed.name)
      return previous ? { ...seed, id: previous.id, createdAt: previous.createdAt } : seed
    })

    const kept = new Set(catalog.map((component) => component.id))
    const withdrawn = existing.filter((component) => component.isSeed && !kept.has(component.id))

    const seeded = await runTransaction(db, async (transaction) => {
      const profile = await transaction.get(profileRef)
      if (profile.exists() && installedSignature(profile.data()) === SEED_CATALOG_SIGNATURE) {
        return null
      }

      for (const component of catalog) {
        transaction.set(doc(this.components(uid), component.id), stripId(component))
      }
      transaction.set(
        profileRef,
        { seedSignature: SEED_CATALOG_SIGNATURE, seededAt: serverTimestamp() },
        { merge: true },
      )
      return catalog
    })
    if (!seeded) return null

    // Outside the transaction: the delete list comes from a read taken before it, so
    // it is advisory, and a stray survivor is a duplicate rather than a lost edit.
    await Promise.all(
      withdrawn.map((component) => deleteDoc(doc(this.components(uid), component.id))),
    )
    return seeded
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
