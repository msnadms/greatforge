/**
 * Runs a one-shot flash on an element: gold on a button whose write landed, red
 * on one refused and on the row that put a reagent back. The classes are
 * `btn--flash`, `btn--flashDanger` and `tray__item--flash`; the keyframes are
 * in `App.css`.
 *
 * **The class is removed and re-added around a forced reflow**, so a second
 * press flashes again rather than doing nothing while the first is still
 * running — re-adding a class the element already carries restarts nothing.
 * The listener strips it at the end; a restart cancels the running animation,
 * so the stale listener fires alongside the new one and both removals are the
 * same removal.
 *
 * React never touches the class either way: the `className` prop it renders
 * doesn't change while the animation runs, so it has nothing to write over.
 */
export function flash(element: HTMLElement | null, className: string) {
  if (!element) return
  element.classList.remove(className)
  void element.offsetWidth
  element.classList.add(className)
  element.addEventListener('animationend', () => element.classList.remove(className), { once: true })
}
