/**
 * The one thing both Firestore repositories do to every record on the way out.
 *
 * Ids are the document ids in both layouts — minted client-side under
 * `users/{uid}`, derived from the group and the address for a seat — so the `id`
 * field is stripped before the body is written and restored from the snapshot on
 * read. Shared rather than written twice, since a cast-heavy helper is exactly
 * the shape that drifts when it is copied.
 */
export function stripId<T extends { id: string }>(entity: T): Omit<T, 'id'> {
  const rest = { ...entity } as Partial<T>
  delete rest.id
  return rest as Omit<T, 'id'>
}
