import { createContext } from 'react'
import type { Group, Membership } from '../types/groups'
import type { CasterLevel, Character, MaterialComponent } from '../types/worldbuilding'

/** The answer a player may give a seat offered to them. A master revokes instead. */
export type InvitationAnswer = 'joined' | 'declined'

/**
 * Groups as the signed-in account sees them, from both sides at once: the tables
 * it runs, and the tables it was asked to sit at. Every account can be either,
 * and most will be both, so this is one context rather than two.
 */
export interface GroupsValue {
  /** True until the rosters of the tables this account runs have been read. See `loadTables`. */
  loading: boolean
  /** Last storage failure, or null. Rendered by the groups dialog. */
  error: string | null
  /**
   * The address this account signed in with, folded to lowercase, or null if the
   * provider handed over none. A seat is addressed to an email, so an account
   * without one can found groups and invite people but can never be invited.
   */
  email: string | null

  /**
   * Reads the rosters of the tables this account runs, once.
   *
   * Sign-in reads the seats offered to this account and the groups it runs, and
   * nothing else. Who sits at those tables is a document per seat that a session
   * never opening the dialog would pay for nothing, so the dialog asks for it
   * itself.
   */
  loadTables: () => Promise<void>

  /** Groups this account masters, by name. */
  mastered: Group[]
  /**
   * Whether this account runs a table.
   *
   * A game master may see and distribute their singular reagents. Known at
   * sign-in rather than at the dialog, since the tray asks before anything has
   * opened one.
   */
  mastersATable: boolean
  /** The roster of one group, in the order the seats were offered. */
  rosterFor: (groupId: string) => Membership[]

  /** Seats offered to this account and not yet answered. */
  invitations: Membership[]
  /** Seats this account took: the groups it plays in. */
  playing: Membership[]

  /** Founds a group with this account as its game master. */
  createGroup: (name: string) => Promise<boolean>
  renameGroup: (id: string, name: string) => Promise<boolean>
  /** Strikes the group and every seat at it. */
  disbandGroup: (id: string) => Promise<boolean>

  /** Offers a seat at one of this account's groups to an address. */
  invitePlayer: (groupId: string, email: string) => Promise<boolean>
  /** Takes a seat back, answered or not. The game master's to call. */
  revokeSeat: (id: string) => Promise<boolean>
  /** Sets a joined player's table level. The game master's to call. */
  setPlayerLevel: (id: string, level: CasterLevel) => Promise<boolean>
  /** Adds one of the game master's singular materials to a joined player's pool. */
  grantSingularReagent: (id: string, component: MaterialComponent) => Promise<boolean>
  /** Takes a singular material back from a player's pool. */
  revokeSingularReagent: (id: string, componentId: string) => Promise<boolean>
  /** Assigns one private character to an accepted seat. */
  assignCharacter: (id: string, character: Character) => Promise<boolean>
  /** Answers a seat offered to this account. Joining requires a character. */
  answerInvitation: (id: string, answer: InvitationAnswer, character?: Character) => Promise<boolean>
}

export const GroupsContext = createContext<GroupsValue | null>(null)
