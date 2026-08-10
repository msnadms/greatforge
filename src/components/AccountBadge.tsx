import { useAuth } from '../state/useAuth'

/** Who the workshop currently belongs to, and the way out. */
export function AccountBadge() {
  const { user, signOut } = useAuth()
  if (!user) return null

  const name = user.displayName ?? user.email ?? 'Signed in'

  return (
    <div className="account">
      {user.photoURL ? <img className="account__avatar" src={user.photoURL} alt="" /> : null}
      <span className="account__name" title={user.email ?? undefined}>
        {name}
      </span>
      <button type="button" className="btn btn--small" onClick={() => void signOut()}>
        Sign out
      </button>
    </div>
  )
}
