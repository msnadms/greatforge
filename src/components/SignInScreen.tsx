import { useAuth } from '../state/useAuth'

/** The gate in front of the workshop. A working belongs to whoever signed in for it. */
export function SignInScreen() {
  const { signIn, pending, error } = useAuth()

  return (
    <div className="gate">
      <div className="gate__card">
        <h1>Greatforge</h1>
        <p className="gate__blurb">
          Spell workshop - prayers, elegies, litanies, and what they are made of.
        </p>

        <button
          type="button"
          className="btn btn--primary gate__button"
          onClick={() => void signIn()}
          disabled={pending}
        >
          {pending ? 'Waiting for Google…' : 'Sign in with Google'}
        </button>

        {error ? (
          <p className="gate__error" role="alert">
            {error}
          </p>
        ) : (
          <p className="gate__note">Your codex and workings are kept to your account.</p>
        )}
      </div>
    </div>
  )
}
