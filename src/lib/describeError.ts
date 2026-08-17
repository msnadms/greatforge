/**
 * What to show the user when a write or a read failed.
 *
 * A thrown `Error` carries the message worth reading; anything else is stringified
 * rather than swallowed, since a storage failure the user cannot see is worse
 * than an ugly one. `AuthProvider` maps a few Firebase auth codes to friendlier
 * prose first and falls through to this for the rest.
 */
export function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
