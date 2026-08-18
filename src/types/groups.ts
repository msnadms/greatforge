/**
 * Groups: the one thing in the app two accounts share.
 *
 * A group is a table. It has exactly one game master, the account that founded
 * it, and any number of players who were invited to it by address. Everything
 * else in the workshop (the catalog, the characters, the shelf of rites) stays
 * private to a single uid; only this file's two records cross that line, which
 * is why they hang off the root of the database rather than under `users/{uid}`.
 *
 * No React or storage. A group holds characters; a membership also carries the
 * two table rules a game master sets for the character a player assigned to it.
 */

import {
  MAX_CASTER_LEVEL,
  normalizeCasterLevel,
  normalizeComponent,
  type CasterLevel,
  type MaterialComponent,
} from './worldbuilding'

/**
 * Where a person stands with a group.
 *
 * `invited` is a seat offered and unanswered, `joined` a player at the table,
 * `declined` a seat turned down or given up. A declined seat is kept rather
 * than deleted so the game master can see the answer, and offering the seat
 * again writes the same document back to `invited`.
 */
export const MEMBERSHIP_STATUSES = ['invited', 'joined', 'declined'] as const

export type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number]

/** Longest a group's name may be. Long enough for a campaign title, no more. */
export const MAX_GROUP_NAME = 60

export interface Group {
  id: string
  name: string
  /** The account that founded it. A group has one game master and never changes it. */
  gameMasterUid: string
  /** Their display name, stamped so a player can read who runs the table. */
  gameMasterName: string
  createdAt: number
  updatedAt: number
}

/**
 * One player's standing in one group, and the character they assigned to it.
 *
 * **Keyed by email address, not by uid.** A game master invites a person before
 * that person's account is knowable, so the address is what the record is
 * addressed to and half of its document id (see `membershipId`). The uid is
 * stamped only when the invitation is answered, which is the first moment it
 * exists.
 *
 * `groupName` and `gameMasterName` are copies. An invited player cannot read the
 * group document itself (the rules give that to the game master alone), so the
 * invitation has to carry enough to be read on its own. `renameGroup` restamps
 * every seat in the same batch, so the copies never drift.
 */
export interface Membership {
  id: string
  groupId: string
  groupName: string
  gameMasterUid: string
  gameMasterName: string
  /** Normalized lowercase. The address invited, which is not always an account yet. */
  email: string
  status: MembershipStatus
  /** The account that answered, or null while the seat is unanswered. */
  playerUid: string | null
  playerName: string | null
  /** The player's private character selected for this seat, or null before it is assigned. */
  characterId: string | null
  /** A snapshot for the game master's roster; character records remain private. */
  characterName: string | null
  /** The highest scale this character may work at for this table. The master sets it. */
  playerLevel: CasterLevel
  /** Singular materials this table's master has placed in the player's pool. */
  singularReagents: MaterialComponent[]
  createdAt: number
  respondedAt: number | null
}

/** Addresses are compared and stored folded, so one person is one seat. */
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase()
}

/**
 * Loose on purpose. The real check is whether the address reaches somebody who
 * signs in with it, which nothing here can answer, so this only catches a
 * typed-in string that is plainly not an address.
 */
export function isEmailAddress(raw: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(raw))
}

/**
 * The document id for one address's seat at one group.
 *
 * Derived rather than minted, so inviting the same person twice writes the same
 * document instead of leaving two seats to reconcile, and so revoking one needs
 * nothing looked up first. Emails cannot contain a colon or a slash, and neither
 * can the ids `lib/id.ts` mints, so the two halves stay separable by eye.
 */
export function membershipId(groupId: string, email: string): string {
  return `${groupId}:${normalizeEmail(email)}`
}

/**
 * A group's name as it will be stored: trimmed and capped at `MAX_GROUP_NAME`.
 * Empty comes back empty rather than defaulted, so a caller can tell "nothing was
 * typed" from "a name was typed" — the provider refuses the first, and
 * `normalizeGroup` supplies the default for a stored record that lost its name.
 *
 * The one statement of the rule. It used to be written at both provider call
 * sites and re-derived in the repository by round-tripping a whole `Group`.
 */
export function groupName(raw: string | undefined): string {
  return raw?.trim().slice(0, MAX_GROUP_NAME) ?? ''
}

export function normalizeGroup(input: Partial<Group> & { id: string }): Group {
  const now = Date.now()
  return {
    id: input.id,
    name: groupName(input.name) || 'Unnamed group',
    gameMasterUid: input.gameMasterUid ?? '',
    gameMasterName: input.gameMasterName?.trim() || 'The game master',
    createdAt: input.createdAt ?? now,
    updatedAt: input.updatedAt ?? now,
  }
}

/**
 * Fills in anything a stored seat is missing, the way `normalizeComponent` does
 * for a reagent. An unknown status reads as `invited`: a seat whose answer this
 * build cannot understand is one that has not been answered.
 */
export function normalizeMembership(input: Partial<Membership> & { id: string }): Membership {
  const now = Date.now()
  return {
    id: input.id,
    groupId: input.groupId ?? '',
    groupName: input.groupName?.trim() || 'Unnamed group',
    gameMasterUid: input.gameMasterUid ?? '',
    gameMasterName: input.gameMasterName?.trim() || 'The game master',
    email: normalizeEmail(input.email ?? ''),
    status: MEMBERSHIP_STATUSES.includes(input.status as MembershipStatus)
      ? (input.status as MembershipStatus)
      : 'invited',
    playerUid: typeof input.playerUid === 'string' ? input.playerUid : null,
    playerName: typeof input.playerName === 'string' ? input.playerName : null,
    characterId: typeof input.characterId === 'string' ? input.characterId : null,
    characterName: typeof input.characterName === 'string' ? input.characterName : null,
    // A seat made before table controls existed leaves the caster unconstrained.
    playerLevel: normalizeCasterLevel(input.playerLevel ?? MAX_CASTER_LEVEL),
    // These are snapshots because a player's private catalog is not readable by
    // their game master. Only singular materials belong in a table gift.
    singularReagents: Array.isArray(input.singularReagents)
      ? input.singularReagents
          .filter((component) => Boolean(component) && typeof component.id === 'string')
          .map((component) => normalizeComponent(component))
          .filter((component) => component.rarity === 'singular')
      : [],
    createdAt: input.createdAt ?? now,
    respondedAt: typeof input.respondedAt === 'number' ? input.respondedAt : null,
  }
}

/** How a seat reads in the roster. The status is the whole of it. */
export const MEMBERSHIP_LABEL: Record<MembershipStatus, string> = {
  invited: 'Invited',
  joined: 'Playing',
  declined: 'Declined',
}

/**
 * The two slices of a seat list worth naming, so the status literals live beside
 * `MEMBERSHIP_STATUSES` rather than being spelled out again in the provider and
 * a third time in the markup.
 */

/** Who is actually at the table, game master aside. */
export function seatedPlayers(seats: Membership[]): Membership[] {
  return seats.filter((seat) => seat.status === 'joined')
}

/** Seats offered and not yet answered. */
export function offeredSeats(seats: Membership[]): Membership[] {
  return seats.filter((seat) => seat.status === 'invited')
}
