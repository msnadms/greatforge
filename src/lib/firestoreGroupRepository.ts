import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  runTransaction,
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
import type { Character } from '../types/worldbuilding'

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

interface CharacterGroupAssignment {
  playerUid: string
  characterId: string
  membershipId: string
}

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

  /** One private lock per character makes membership exclusive across all groups. */
  private characterAssignment(uid: string, characterId: string) {
    return doc(db, 'users', uid, 'characterGroupAssignments', characterId)
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

  /**
   * The character lock and the public seat move together. A player cannot race
   * two browser tabs into putting the same caster at two tables, while the
   * master still only ever sees their one email-addressed seat at a table.
   */
  async assignCharacter(membership: Membership, character: Character): Promise<Membership> {
    const uid = requireUid()
    const seatRef = doc(this.memberships(), membership.id)
    const assignmentRef = this.characterAssignment(uid, character.id)

    return runTransaction(db, async (transaction) => {
      const [seatSnapshot, assignmentSnapshot] = await Promise.all([
        transaction.get(seatRef),
        transaction.get(assignmentRef),
      ])
      if (!seatSnapshot.exists()) throw new Error('That group seat is no longer available.')

      const current = normalizeMembership({
        ...(seatSnapshot.data() as Partial<StoredMembership>),
        id: seatSnapshot.id,
      })
      if (current.status !== 'invited' && current.status !== 'joined') {
        throw new Error('That group seat is no longer available.')
      }

      if (assignmentSnapshot.exists()) {
        const assignment = assignmentSnapshot.data() as CharacterGroupAssignment
        if (assignment.membershipId !== current.id) {
          const oldSeatSnapshot = await transaction.get(doc(this.memberships(), assignment.membershipId))
          if (oldSeatSnapshot.exists()) {
            const oldSeat = normalizeMembership({
              ...(oldSeatSnapshot.data() as Partial<StoredMembership>),
              id: oldSeatSnapshot.id,
            })
            if (
              oldSeat.status === 'joined' &&
              oldSeat.playerUid === uid &&
              oldSeat.characterId === character.id
            ) {
              throw new Error(`${character.name} already belongs to ${oldSeat.groupName}.`)
            }
          }
        }
      }

      const oldAssignmentRef = current.characterId
        ? this.characterAssignment(uid, current.characterId)
        : null
      const oldAssignmentSnapshot = oldAssignmentRef ? await transaction.get(oldAssignmentRef) : null
      const next: Membership = {
        ...current,
        status: 'joined',
        playerUid: uid,
        playerName: membership.playerName,
        characterId: character.id,
        characterName: character.name.trim() || 'Unnamed caster',
        respondedAt: Date.now(),
      }

      // A player may update only their answer and character fields. Do not
      // round-trip master-controlled gifts through a normalizer here: an older
      // snapshot can gain defaults and look like the player changed it.
      transaction.update(seatRef, {
        status: next.status,
        playerUid: next.playerUid,
        playerName: next.playerName,
        characterId: next.characterId,
        characterName: next.characterName,
        respondedAt: next.respondedAt,
      })
      transaction.set(assignmentRef, {
        playerUid: uid,
        characterId: character.id,
        membershipId: current.id,
      } satisfies CharacterGroupAssignment)
      if (
        oldAssignmentRef &&
        oldAssignmentRef.path !== assignmentRef.path &&
        oldAssignmentSnapshot?.exists() &&
        (oldAssignmentSnapshot.data() as CharacterGroupAssignment).membershipId === current.id
      ) {
        transaction.delete(oldAssignmentRef)
      }
      return next
    })
  }

  async leaveMembership(membership: Membership): Promise<Membership> {
    const uid = requireUid()
    const seatRef = doc(this.memberships(), membership.id)

    return runTransaction(db, async (transaction) => {
      const seatSnapshot = await transaction.get(seatRef)
      if (!seatSnapshot.exists()) throw new Error('That group seat is no longer available.')
      const current = normalizeMembership({
        ...(seatSnapshot.data() as Partial<StoredMembership>),
        id: seatSnapshot.id,
      })
      if (current.status !== 'joined' || current.playerUid !== uid) {
        throw new Error('You are no longer seated at that group.')
      }
      const assignmentRef = current.characterId
        ? this.characterAssignment(uid, current.characterId)
        : null
      const assignmentSnapshot = assignmentRef ? await transaction.get(assignmentRef) : null

      const next: Membership = {
        ...current,
        status: 'declined',
        characterId: null,
        characterName: null,
        respondedAt: Date.now(),
      }
      transaction.update(seatRef, {
        status: next.status,
        characterId: next.characterId,
        characterName: next.characterName,
        respondedAt: next.respondedAt,
      })
      // Do not remove a newer assignment if this seat was reassigned in another
      // tab before this transaction retried.
      if (
        assignmentRef &&
        assignmentSnapshot?.exists() &&
        (assignmentSnapshot.data() as CharacterGroupAssignment).membershipId === current.id
      ) {
        transaction.delete(assignmentRef)
      }
      return next
    })
  }

  async deleteMembership(id: string): Promise<void> {
    await deleteDoc(doc(this.memberships(), id))
  }
}

export const firestoreGroupRepository = new FirestoreGroupRepository()
