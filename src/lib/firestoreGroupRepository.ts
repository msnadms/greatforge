import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  setDoc,
  where,
  writeBatch,
  type CollectionReference,
  type DocumentData,
  type QueryDocumentSnapshot,
} from 'firebase/firestore'
import {
  groupName,
  normalizeGroup,
  normalizeMembership,
  type Group,
  type Membership,
} from '../types/groups'
import { currentEmail, db, requireUid } from './firebase'
import { stripId } from './firestoreDoc'
import type { GroupRepository } from './repository'

/**
 * Firestore-backed group storage, laid out as:
 *
 *   groups/{groupId}                 -> Group
 *   memberships/{groupId:email}      -> Membership
 *
 * **Both collections hang off the root**, unlike everything in
 * `firestoreRepository.ts`, which lives under `users/{uid}`. A group is read by
 * its game master and by every player they invited, so it cannot sit inside
 * either one's private tree. `firestore.rules` is what holds the line instead:
 * a group is the game master's alone, and a seat is readable by the master who
 * wrote it and by the address it names, with the player able to change only
 * their own answer.
 *
 * **Each query is shaped to match one half of that read rule.** A master queries
 * by `gameMasterUid`, a player by `email`, so the constraint alone proves the
 * query is within the rule and no document has to be fetched to find out. That
 * is also why `gameMasterUid` is stamped on every seat rather than read from the
 * group: a rule that had to look the group up would spend a document read per
 * seat, and Firestore caps those at twenty for a query.
 *
 * Ids are the document ids (`membershipId` derives a seat's), so the `id` field
 * is stripped on write and restored from the snapshot on read.
 */

type StoredGroup = Omit<Group, 'id'>
type StoredMembership = Omit<Membership, 'id'>

function toGroup(snapshot: QueryDocumentSnapshot<DocumentData>): Group {
  return normalizeGroup({ ...(snapshot.data() as Partial<StoredGroup>), id: snapshot.id })
}

function toMembership(snapshot: QueryDocumentSnapshot<DocumentData>): Membership {
  return normalizeMembership({
    ...(snapshot.data() as Partial<StoredMembership>),
    id: snapshot.id,
  })
}

export class FirestoreGroupRepository implements GroupRepository {
  private groups(): CollectionReference<DocumentData> {
    return collection(db, 'groups')
  }

  private memberships(): CollectionReference<DocumentData> {
    return collection(db, 'memberships')
  }

  async listGroups(): Promise<Group[]> {
    const snapshot = await getDocs(
      query(this.groups(), where('gameMasterUid', '==', requireUid())),
    )
    return snapshot.docs.map(toGroup)
  }

  async saveGroup(group: Group): Promise<void> {
    await setDoc(doc(this.groups(), group.id), stripId(normalizeGroup(group)))
  }

  /**
   * The name lives in two places: on the group, and copied onto every seat so an
   * invited player can read what they were offered without reading the group
   * itself. Both move in one batch, so the copies cannot drift from the original.
   */
  async renameGroup(id: string, name: string): Promise<void> {
    const uid = requireUid()
    const roster = await getDocs(
      query(this.memberships(), where('gameMasterUid', '==', uid), where('groupId', '==', id)),
    )
    const trimmed = groupName(name)
    const now = Date.now()

    const batch = writeBatch(db)
    batch.update(doc(this.groups(), id), { name: trimmed, updatedAt: now })
    for (const seat of roster.docs) batch.update(seat.ref, { groupName: trimmed })
    await batch.commit()
  }

  /**
   * Disbanding takes the roster with it. One batch, so it lands whole or not at
   * all and there is no state where seats outlive the table they were at. This
   * is `deleteCharacter`'s sweep in `firestoreRepository.ts`, for the same
   * reason and with the same 500-write ceiling, which no real roster reaches.
   */
  async deleteGroup(id: string): Promise<void> {
    const uid = requireUid()
    const roster = await getDocs(
      query(this.memberships(), where('gameMasterUid', '==', uid), where('groupId', '==', id)),
    )

    const batch = writeBatch(db)
    for (const seat of roster.docs) batch.delete(seat.ref)
    batch.delete(doc(this.groups(), id))
    await batch.commit()
  }

  async listRoster(): Promise<Membership[]> {
    const snapshot = await getDocs(
      query(this.memberships(), where('gameMasterUid', '==', requireUid())),
    )
    return snapshot.docs.map(toMembership)
  }

  /**
   * An account with no address was invited to nothing, since a seat is addressed
   * to one. Answered here rather than thrown, so a provider that hands over no
   * email costs this feature and leaves the rest of the workshop alone.
   */
  async listInvitations(): Promise<Membership[]> {
    const email = currentEmail()
    if (!email) return []
    const snapshot = await getDocs(query(this.memberships(), where('email', '==', email)))
    return snapshot.docs.map(toMembership)
  }

  async saveMembership(membership: Membership): Promise<void> {
    await setDoc(doc(this.memberships(), membership.id), stripId(normalizeMembership(membership)))
  }

  async deleteMembership(id: string): Promise<void> {
    await deleteDoc(doc(this.memberships(), id))
  }
}

export const firestoreGroupRepository = new FirestoreGroupRepository()
