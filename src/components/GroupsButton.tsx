import { useState } from 'react'
import { useGroups } from '../state/useGroups'
import { GroupsDialog } from './GroupsDialog'

/**
 * The way into groups, riding with the account rather than with the caster:
 * invitations belong to the signed-in person, who assigns one character per
 * group from the dialog.
 *
 * The count is unanswered invitations alone. A seat already taken is not
 * something to come back to.
 */
export function GroupsButton() {
  const { invitations } = useGroups()
  const [open, setOpen] = useState(false)
  const waiting = invitations.length

  return (
    <>
      <button
        type="button"
        className={`btn btn--small${waiting > 0 ? ' btn--primary' : ''}`}
        title={
          waiting > 0
            ? `${waiting} ${waiting === 1 ? 'invitation' : 'invitations'} unanswered`
            : 'Groups you run and groups you play in'
        }
        onClick={() => setOpen(true)}
      >
        Groups{waiting > 0 ? ` · ${waiting}` : ''}
      </button>

      {open ? <GroupsDialog onClose={() => setOpen(false)} /> : null}
    </>
  )
}
