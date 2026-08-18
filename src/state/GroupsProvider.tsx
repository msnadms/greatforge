import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { describeError } from '../lib/describeError'
import { firestoreGroupRepository } from '../lib/firestoreGroupRepository'
import { newId } from '../lib/id'
import type { GroupRepository } from '../lib/repository'
import {
  groupName,
  isEmailAddress,
  membershipId,
  normalizeEmail,
  offeredSeats,
  seatedPlayers,
  type Group,
  type Membership,
} from '../types/groups'
import {
  MAX_CASTER_LEVEL,
  type CasterLevel,
  type MaterialComponent,
} from '../types/worldbuilding'
import { useAuth } from './useAuth'
import { GroupsContext, type GroupsValue, type InvitationAnswer } from './groupsContext'
import { useWrite } from './useWrite'

function byGroupName(a: Group, b: Group): number {
  return a.name.localeCompare(b.name)
}

/** A roster reads in the order seats were offered, so a new invite lands at the foot. */
function byOffered(a: Membership, b: Membership): number {
  return a.createdAt - b.createdAt
}

const NO_SEATS: Membership[] = []

interface GroupsProviderProps {
  children: ReactNode
  /** Overridable so a preview entry point can supply a stand-in for Firestore. */
  repository?: GroupRepository
}

/**
 * Groups, from both sides: the tables this account runs and the tables it was
 * asked to sit at.
 *
 * Kept apart from `WorkshopProvider` because it shares none of its state and
 * none of its rules. A group holds people, the workshop holds rites, and
 * nothing in the resolver has ever heard of either. The two providers sit side
 * by side under the same gate rather than one inside the other.
 *
 * The name and address stamped on what this account writes come from the signed
 * in user, which is why this provider reads `useAuth()` where `WorkshopProvider`
 * reads nothing: a seat has to name the person who offered it, and a uid is not
 * a name.
 *
 * **Sign-in reads the seats offered to this account and the tables it runs.** The
 * first is what the badge on the button counts. The second decides whether the
 * codex shows its singular reagents, which the tray asks for long before anything
 * opens the dialog. Who sits at those tables is a document per seat that most
 * sessions never look at, so the rosters wait for the dialog itself.
 */
export function GroupsProvider({
  children,
  repository = firestoreGroupRepository,
}: GroupsProviderProps) {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [mastered, setMastered] = useState<Group[]>([])
  const [roster, setRoster] = useState<Membership[]>([])
  // Table controls can be pressed again before their previous write returns. The
  // ref gives their per-seat queue the last successful seat immediately, rather
  // than waiting for React to render the matching roster state.
  const rosterRef = useRef<Membership[]>([])
  // Every seat addressed to this account, answered or not. What the dialog shows
  // is the two slices below.
  const [seats, setSeats] = useState<Membership[]>([])

  // Plain values rather than memos: each is a string compared by value, so it
  // settles a dependency array on its own.
  const uid = user?.uid ?? null
  const email = user?.email ? normalizeEmail(user.email) : null
  const displayName = user?.displayName?.trim() || user?.email || 'A caster'

  /** Keeps state and the control-write snapshot in lockstep. */
  const replaceRoster = useCallback(
    (update: Membership[] | ((current: Membership[]) => Membership[])) => {
      const next = typeof update === 'function' ? update(rosterRef.current) : update
      rosterRef.current = next
      setRoster(next)
    },
    [],
  )

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const [invited, founded] = await Promise.all([
          repository.listInvitations(),
          repository.listGroups(),
        ])
        if (cancelled) return
        setSeats(invited)
        setMastered(founded)
      } catch (cause) {
        if (!cancelled) setError(`Could not read your groups: ${describeError(cause)}`)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [repository])

  // Guards the deferred read against a second mount (StrictMode invokes the
  // dialog's effect twice) and against reopening the dialog.
  const tablesRead = useRef(false)

  /** Reads who sits at the tables this account runs. Called by the dialog, once. */
  const loadTables = useCallback(async () => {
    if (tablesRead.current) return
    tablesRead.current = true
    try {
      replaceRoster(await repository.listRoster())
    } catch (cause) {
      tablesRead.current = false
      setError(`Could not read your rosters: ${describeError(cause)}`)
    } finally {
      setLoading(false)
    }
  }, [replaceRoster, repository])

  /** Local state moves only once the write lands; failures surface in `error`. */
  const write = useWrite(setError)

  // Sorted once where they are read, rather than re-sorted at every write site.
  const groups = useMemo(() => [...mastered].sort(byGroupName), [mastered])
  const seatsByOffer = useMemo(() => [...seats].sort(byOffered), [seats])

  /**
   * The roster split by group in one pass, so a dialog showing several tables
   * does not walk the whole roster once per table.
   */
  const rosterByGroup = useMemo(() => {
    const byGroup = new Map<string, Membership[]>()
    for (const seat of [...roster].sort(byOffered)) {
      const seated = byGroup.get(seat.groupId)
      if (seated) seated.push(seat)
      else byGroup.set(seat.groupId, [seat])
    }
    return byGroup
  }, [roster])

  const rosterFor = useCallback(
    (groupId: string) => rosterByGroup.get(groupId) ?? NO_SEATS,
    [rosterByGroup],
  )

  const invitations = useMemo(() => offeredSeats(seatsByOffer), [seatsByOffer])
  const playing = useMemo(() => seatedPlayers(seatsByOffer), [seatsByOffer])
  const grantedSingulars = useMemo(() => {
    const byId = new Map<string, MaterialComponent>()
    for (const seat of playing) {
      for (const component of seat.singularReagents) byId.set(component.id, component)
    }
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name))
  }, [playing])
  const groupCasterLevel = useMemo<CasterLevel | null>(() => {
    if (playing.length === 0) return null
    return playing.reduce<CasterLevel>(
      (lowest, seat) => Math.min(lowest, seat.playerLevel) as CasterLevel,
      MAX_CASTER_LEVEL,
    )
  }, [playing])

  // Founding a table hands the account its singular reagents, and disbanding the
  // last one takes them back, both without a further read.
  const mastersATable = mastered.length > 0

  const createGroup = useCallback(
    async (name: string) => {
      if (!uid) return false
      const trimmed = groupName(name)
      if (!trimmed) {
        setError('A group needs a name.')
        return false
      }
      const now = Date.now()
      const group: Group = {
        id: newId(),
        name: trimmed,
        // Stamped at founding and never moved. A group has one game master, and
        // it is whoever founded it.
        gameMasterUid: uid,
        gameMasterName: displayName,
        createdAt: now,
        updatedAt: now,
      }
      const ok = await write('Could not found the group', () => repository.saveGroup(group))
      if (!ok) return false
      setMastered((current) => [...current, group])
      return true
    },
    [displayName, repository, uid, write],
  )

  const renameGroup = useCallback(
    async (id: string, name: string) => {
      const trimmed = groupName(name)
      if (!trimmed) {
        setError('A group needs a name.')
        return false
      }
      // A rename to the name it already carries would otherwise write the group
      // and restamp every seat at it for nothing.
      if (mastered.some((group) => group.id === id && group.name === trimmed)) return true

      const ok = await write('Could not rename the group', () => repository.renameGroup(id, trimmed))
      if (!ok) return false

      const now = Date.now()
      setMastered((current) =>
        current.map((group) => (group.id === id ? { ...group, name: trimmed, updatedAt: now } : group)),
      )
      // Each seat carries a copy of the name so an invited player can read it
      // without reading the group. The repository restamps them in the same
      // batch; this is the local half of that write.
      replaceRoster((current) =>
        current.map((seat) => (seat.groupId === id ? { ...seat, groupName: trimmed } : seat)),
      )
      return true
    },
    [mastered, replaceRoster, repository, write],
  )

  const disbandGroup = useCallback(
    async (id: string) => {
      const ok = await write('Could not disband the group', () => repository.deleteGroup(id))
      if (!ok) return false
      setMastered((current) => current.filter((group) => group.id !== id))
      replaceRoster((current) => current.filter((seat) => seat.groupId !== id))
      return true
    },
    [replaceRoster, repository, write],
  )

  /**
   * Offers a seat to an address.
   *
   * The document id is derived from the group and the address, so offering the
   * same seat twice writes over the first offer rather than leaving two. That is
   * also what lets a declined seat be offered again: the same document goes back
   * to `invited`, and the player sees one invitation rather than a pile.
   */
  const invitePlayer = useCallback(
    async (groupId: string, address: string) => {
      if (!uid) return false
      const group = mastered.find((entry) => entry.id === groupId)
      if (!group) return false
      const invited = normalizeEmail(address)
      if (!isEmailAddress(invited)) {
        setError('That does not read as an email address.')
        return false
      }
      if (invited === email) {
        setError('You run this group already.')
        return false
      }
      const existing = roster.find((seat) => seat.groupId === groupId && seat.email === invited)
      if (existing && existing.status !== 'declined') {
        setError(
          existing.status === 'joined'
            ? `${invited} plays in this group already.`
            : `${invited} has an invitation to this group already.`,
        )
        return false
      }

      const seat: Membership = {
        id: membershipId(groupId, invited),
        groupId,
        // Copied so the invitation can be read on its own. An invited player
        // cannot read the group document itself.
        groupName: group.name,
        gameMasterUid: uid,
        gameMasterName: displayName,
        email: invited,
        status: 'invited',
        // The uid is unknown until the seat is answered, and may never exist:
        // an address can be invited before anyone signs in with it.
        playerUid: null,
        playerName: null,
        playerLevel: MAX_CASTER_LEVEL,
        singularReagents: [],
        createdAt: Date.now(),
        respondedAt: null,
      }
      const ok = await write('Could not send the invitation', () => repository.saveMembership(seat))
      if (!ok) return false
      replaceRoster((current) => [...current.filter((entry) => entry.id !== seat.id), seat])
      return true
    },
    [displayName, email, mastered, replaceRoster, repository, roster, uid, write],
  )

  const revokeSeat = useCallback(
    async (id: string) => {
      const ok = await write('Could not withdraw the seat', () => repository.deleteMembership(id))
      if (!ok) return false
      replaceRoster((current) => current.filter((seat) => seat.id !== id))
      return true
    },
    [replaceRoster, repository, write],
  )

  // Serializes controls for one seat. Each write starts from the preceding
  // successful result, so a level click and a gift click cannot restore the
  // other field from a stale render. Different seats remain independent.
  const pendingSeatWrites = useRef(new Map<string, Promise<boolean>>())
  const updateSeatControl = useCallback(
    (
      id: string,
      failure: string,
      change: (seat: Membership) => Membership,
    ): Promise<boolean> => {
      const previous = pendingSeatWrites.current.get(id) ?? Promise.resolve(true)
      const task = previous.then(async () => {
        const seat = rosterRef.current.find((entry) => entry.id === id)
        if (!seat || seat.status !== 'joined') return false
        const next = change(seat)
        if (next === seat) return true
        const ok = await write(failure, () => repository.saveMembership(next))
        if (!ok) return false
        replaceRoster((current) => current.map((entry) => (entry.id === id ? next : entry)))
        return true
      })
      pendingSeatWrites.current.set(id, task)
      void task.then(() => {
        if (pendingSeatWrites.current.get(id) === task) pendingSeatWrites.current.delete(id)
      })
      return task
    },
    [replaceRoster, repository, write],
  )

  /** The three table-control writes replace one normalized seat, in order. */
  const setPlayerLevel = useCallback(
    (id: string, playerLevel: CasterLevel) =>
      updateSeatControl(id, 'Could not set the player level', (seat) =>
        seat.playerLevel === playerLevel ? seat : { ...seat, playerLevel },
      ),
    [updateSeatControl],
  )

  const grantSingularReagent = useCallback(
    (id: string, component: MaterialComponent) => {
      if (component.rarity !== 'singular') return Promise.resolve(false)
      return updateSeatControl(id, 'Could not give that singular reagent', (seat) =>
        seat.singularReagents.some((entry) => entry.id === component.id)
          ? seat
          : { ...seat, singularReagents: [...seat.singularReagents, component] },
      )
    },
    [updateSeatControl],
  )

  const revokeSingularReagent = useCallback(
    (id: string, componentId: string) =>
      updateSeatControl(id, 'Could not take back that singular reagent', (seat) => {
        const singularReagents = seat.singularReagents.filter((component) => component.id !== componentId)
        return singularReagents.length === seat.singularReagents.length ? seat : { ...seat, singularReagents }
      }),
    [updateSeatControl],
  )

  /**
   * Answers a seat offered to this account, which is the only field a player may
   * write on it. Taking a seat stamps the uid behind the address, so the game
   * master's roster names an account rather than an invitation.
   */
  const answerInvitation = useCallback(
    async (id: string, answer: InvitationAnswer) => {
      if (!uid) return false
      const seat = seats.find((entry) => entry.id === id)
      if (!seat) return false
      const next: Membership = {
        ...seat,
        status: answer,
        playerUid: uid,
        playerName: displayName,
        respondedAt: Date.now(),
      }
      const ok = await write(
        answer === 'joined' ? 'Could not join the group' : 'Could not give up the seat',
        () => repository.saveMembership(next),
      )
      if (!ok) return false
      setSeats((current) => current.map((entry) => (entry.id === id ? next : entry)))
      return true
    },
    [displayName, repository, seats, uid, write],
  )

  const value: GroupsValue = useMemo(
    () => ({
      loading,
      error,
      email,
      loadTables,
      mastered: groups,
      mastersATable,
      rosterFor,
      invitations,
      playing,
      grantedSingulars,
      groupCasterLevel,
      createGroup,
      renameGroup,
      disbandGroup,
      invitePlayer,
      revokeSeat,
      setPlayerLevel,
      grantSingularReagent,
      revokeSingularReagent,
      answerInvitation,
    }),
    [
      loading,
      error,
      email,
      loadTables,
      groups,
      mastersATable,
      rosterFor,
      invitations,
      playing,
      grantedSingulars,
      groupCasterLevel,
      createGroup,
      renameGroup,
      disbandGroup,
      invitePlayer,
      revokeSeat,
      setPlayerLevel,
      grantSingularReagent,
      revokeSingularReagent,
      answerInvitation,
    ],
  )

  return <GroupsContext.Provider value={value}>{children}</GroupsContext.Provider>
}
