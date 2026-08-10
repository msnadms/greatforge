import { useWorkshop } from '../state/useWorkshop'

/**
 * Reports storage failures. Firestore writes cross the network, so unlike the old
 * localStorage backing they can fail in ways the user needs to know about.
 */
export function StorageAlert() {
  const { error, dismissError } = useWorkshop()
  if (!error) return null

  return (
    <p className="storage-alert" role="alert">
      <span>{error}</span>
      <button type="button" onClick={dismissError} aria-label="Dismiss">
        ×
      </button>
    </p>
  )
}
