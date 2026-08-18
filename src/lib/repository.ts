import type { Group, Membership } from '../types/groups'
import type { Character, MaterialComponent, PlayerProfile, Spell } from '../types/worldbuilding'

/**
 * Storage seam for the workshop. `firestoreRepository.ts` is the only implementation;
 * a conlang module reuses the same seam. Ids are generated client-side (`lib/id.ts`).
 */
export interface WorkshopRepository {
  getProfile(): Promise<PlayerProfile>
  saveProfile(profile: PlayerProfile): Promise<void>

  listCharacters(): Promise<Character[]>
  saveCharacter(character: Character): Promise<void>
  deleteCharacter(id: string): Promise<void>

  listComponents(): Promise<MaterialComponent[]>
  saveComponent(component: MaterialComponent): Promise<void>
  deleteComponent(id: string): Promise<void>

  listSpells(): Promise<Spell[]>
  saveSpell(spell: Spell): Promise<void>
  deleteSpell(id: string): Promise<void>
}

/**
 * Storage seam for groups, kept apart from the workshop's because the records
 * are a different shape of thing: a workshop hangs off one uid and is private to
 * it, where a group is read by two accounts at once and hangs off the root.
 * `firestoreGroupRepository.ts` is the only implementation.
 *
 * Every call is scoped to the signed-in account by the implementation, not by an
 * argument, exactly as `WorkshopRepository` scopes itself. `listGroups` returns
 * the groups this account masters; `listInvitations` the seats offered to its
 * address.
 */
export interface GroupRepository {
  /** Groups this account founded. A player's groups are read off their seats. */
  listGroups(): Promise<Group[]>
  saveGroup(group: Group): Promise<void>
  /** Renames the group and restamps the copy every seat carries, in one batch. */
  renameGroup(id: string, name: string): Promise<void>
  /** Strikes the group and its whole roster in one batch. */
  deleteGroup(id: string): Promise<void>

  /** Every seat at every group this account masters. */
  listRoster(): Promise<Membership[]>
  /** Every seat offered to this account's own address, answered or not. */
  listInvitations(): Promise<Membership[]>
  saveMembership(membership: Membership): Promise<void>
  /** Joins or reassigns a seat, atomically reserving the character for that one group. */
  assignCharacter(membership: Membership, character: Character): Promise<Membership>
  /** Leaves a seat and releases its character for another group. */
  leaveMembership(membership: Membership): Promise<Membership>
  deleteMembership(id: string): Promise<void>
}
