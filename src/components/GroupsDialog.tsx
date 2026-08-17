import { useEffect, useState, type FormEvent } from 'react'
import { useGroups } from '../state/useGroups'
import {
  MEMBERSHIP_LABEL,
  offeredSeats,
  seatedPlayers,
  type Group,
  type Membership,
} from '../types/groups'
import { EditorDialog } from './EditorDialog'

/**
 * One form's submit: hold the press, run the write, and clear the field only if
 * it landed, so a refused address is still there to correct.
 *
 * One of these per form rather than one per dialog — a shared flag would have
 * pressing Invite disable Save on a form that has nothing to do with it.
 */
function useSubmit(action: () => Promise<boolean>, onDone: () => void) {
  const [busy, setBusy] = useState(false)

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    void action().then((ok) => {
      setBusy(false)
      if (ok) onDone()
    })
  }

  return { busy, onSubmit }
}

/** One seat at a table this account runs: who was asked, and what they answered. */
function SeatRow({ seat }: { seat: Membership }) {
  const { revokeSeat } = useGroups()

  return (
    <li className="groups__seat">
      <span className="groups__seatName">{seat.playerName ?? seat.email}</span>
      {seat.playerName ? <span className="groups__seatMail">{seat.email}</span> : null}
      <span className={`groups__status groups__status--${seat.status}`}>
        {MEMBERSHIP_LABEL[seat.status]}
      </span>
      <button
        type="button"
        className="btn btn--small btn--danger"
        aria-label={`Withdraw ${seat.email}`}
        title="Withdraw this seat"
        onClick={() => void revokeSeat(seat.id)}
      >
        ✕
      </button>
    </li>
  )
}

/** A table this account runs: its roster, the way to add to it, and the way to end it. */
function MasteredGroup({ group }: { group: Group }) {
  const { rosterFor, invitePlayer, renameGroup, disbandGroup } = useGroups()
  const [address, setAddress] = useState('')
  // One state, not a flag beside a field: non-null is the rename mode, and
  // opening it seeds the field fresh so it can never hold a stale name.
  const [rename, setRename] = useState<string | null>(null)

  const roster = rosterFor(group.id)
  const seated = seatedPlayers(roster).length
  const offered = offeredSeats(roster).length

  const invite = useSubmit(
    () => invitePlayer(group.id, address),
    () => setAddress(''),
  )
  const naming = useSubmit(
    () => renameGroup(group.id, rename ?? ''),
    () => setRename(null),
  )

  function handleDisband() {
    const takes = `${seated} playing and ${offered} invited`
    if (!confirm(`Disband "${group.name}"? ${takes} lose their seats. This cannot be undone.`)) {
      return
    }
    void disbandGroup(group.id)
  }

  return (
    <li className="groups__group">
      <div className="groups__groupHead">
        {rename !== null ? (
          <form className="groups__inline" onSubmit={naming.onSubmit}>
            <input
              autoFocus
              aria-label="Group name"
              value={rename}
              onChange={(event) => setRename(event.target.value)}
            />
            <button type="submit" className="btn btn--small btn--primary" disabled={naming.busy}>
              Save
            </button>
            <button type="button" className="btn btn--small" onClick={() => setRename(null)}>
              Cancel
            </button>
          </form>
        ) : (
          <>
            <span className="groups__name">{group.name}</span>
            <span className="groups__count">
              {seated} playing, {offered} invited
            </span>
            <button
              type="button"
              className="btn btn--small"
              onClick={() => setRename(group.name)}
            >
              Rename
            </button>
            <button type="button" className="btn btn--small btn--danger" onClick={handleDisband}>
              Disband
            </button>
          </>
        )}
      </div>

      {roster.length > 0 ? (
        <ul className="groups__seats">
          {roster.map((seat) => (
            <SeatRow key={seat.id} seat={seat} />
          ))}
        </ul>
      ) : (
        <p className="groups__empty">Nobody has been asked to this table yet.</p>
      )}

      <form className="groups__inline" onSubmit={invite.onSubmit}>
        <input
          type="email"
          aria-label={`Invite a player to ${group.name}`}
          placeholder="player@example.com"
          value={address}
          onChange={(event) => setAddress(event.target.value)}
        />
        <button type="submit" className="btn btn--small btn--primary" disabled={invite.busy}>
          Invite
        </button>
      </form>
    </li>
  )
}

/**
 * Groups, both sides of them, in one dialog: the seats this account was offered,
 * the tables it sits at, and the tables it runs.
 *
 * Written into `EditorDialog` like the two editors, which carries the scrim, the
 * portal and the transformed-ancestor trap that goes with it. It states no
 * `onSubmit`, so the shell draws a `div` rather than a `form`: this holds several
 * forms that answer separately and has no single submit of its own.
 *
 * The tables are read here rather than at sign-in, since this is the only thing
 * that shows them.
 */
export function GroupsDialog({ onClose }: { onClose: () => void }) {
  const { loading, error, email, loadTables, mastered, invitations, playing, createGroup, answerInvitation } =
    useGroups()
  const [name, setName] = useState('')

  useEffect(() => {
    void loadTables()
  }, [loadTables])

  const found = useSubmit(
    () => createGroup(name),
    () => setName(''),
  )

  function handleLeave(seat: Membership) {
    if (!confirm(`Leave "${seat.groupName}"? The game master can ask you back.`)) return
    void answerInvitation(seat.id, 'declined')
  }

  return (
    <EditorDialog
      title="Groups"
      className="groups"
      error={error}
      onClose={onClose}
      actions={
        <button type="button" className="btn" onClick={onClose}>
          Close
        </button>
      }
    >
      {!email ? (
        <p className="groups__empty">
          This account signed in without an email address, so no game master can invite it.
        </p>
      ) : null}

      {invitations.length > 0 ? (
        <section className="groups__section">
          <h3 className="groups__heading">Invitations</h3>
          <ul className="groups__list">
            {invitations.map((seat) => (
              <li key={seat.id} className="groups__row">
                <span className="groups__name">{seat.groupName}</span>
                <span className="groups__count">Asked by {seat.gameMasterName}</span>
                <button
                  type="button"
                  className="btn btn--small btn--primary"
                  onClick={() => void answerInvitation(seat.id, 'joined')}
                >
                  Join
                </button>
                <button
                  type="button"
                  className="btn btn--small"
                  onClick={() => void answerInvitation(seat.id, 'declined')}
                >
                  Decline
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="groups__section">
        <h3 className="groups__heading">Groups you play in</h3>
        {playing.length > 0 ? (
          <ul className="groups__list">
            {playing.map((seat) => (
              <li key={seat.id} className="groups__row">
                <span className="groups__name">{seat.groupName}</span>
                <span className="groups__count">Run by {seat.gameMasterName}</span>
                <button
                  type="button"
                  className="btn btn--small btn--danger"
                  onClick={() => handleLeave(seat)}
                >
                  Leave
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="groups__empty">You sit at no table you did not found.</p>
        )}
      </section>

      <section className="groups__section">
        <h3 className="groups__heading">Groups you run</h3>
        {loading ? (
          <p className="groups__empty">Reading your groups.</p>
        ) : mastered.length > 0 ? (
          <ul className="groups__list">
            {mastered.map((group) => (
              <MasteredGroup key={group.id} group={group} />
            ))}
          </ul>
        ) : (
          <p className="groups__empty">You run no groups yet.</p>
        )}

        <form className="groups__inline" onSubmit={found.onSubmit}>
          <input
            aria-label="New group name"
            placeholder="The Low Fen Table"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <button type="submit" className="btn btn--small btn--primary" disabled={found.busy}>
            Found group
          </button>
        </form>
        <p className="groups__note">
          Whoever founds a group is its game master. A group has one, and it does not change.
        </p>
      </section>
    </EditorDialog>
  )
}
