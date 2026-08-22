import { useCallback, useEffect, useLayoutEffect, useState } from 'react'

type Theme = 'light' | 'dark'

/** The desk lighting, or `null` while it still follows the system. */
type Choice = Theme | null

const STORAGE_KEY = 'greatforge-theme'

/** Advanced in this order by the button, so a caster can always get back to the system. */
const CYCLE: Choice[] = [null, 'light', 'dark']

const LABEL: Record<'system' | Theme, string> = {
  system: 'System',
  light: 'Light',
  dark: 'Dark',
}

const darkQuery = () => window.matchMedia('(prefers-color-scheme: dark)')

/** The stored choice, or null. A desk that cannot read storage simply follows the system. */
function storedChoice(): Choice {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY)
    return saved === 'light' || saved === 'dark' ? saved : null
  } catch {
    // Private windows and blocked site data both throw here.
    return null
  }
}

/**
 * Which desk the workshop is lit by: the caster's own choice, or the system's.
 *
 * **Nothing is written until a choice is made.** The attribute stays off the
 * root and storage stays empty while the desk follows the system, which is what
 * `:root:not([data-theme='light'])` in `index.css` and `currentPalette` in
 * `CircleFire` both read as "follow the system". Stamping the attribute on
 * mount instead pinned the desk to whatever the system happened to be at the
 * first signed-in load: a later light/dark switch was then ignored for good,
 * and there was no way back to following it.
 *
 * That is also why the button cycles three ways rather than toggling two. A
 * preference you cannot put down is a preference you were never asked for.
 */
export function ThemeToggle() {
  const [choice, setChoice] = useState<Choice>(storedChoice)
  const [system, setSystem] = useState<Theme>(() => (darkQuery().matches ? 'dark' : 'light'))

  useLayoutEffect(() => {
    if (choice) document.documentElement.dataset.theme = choice
    else delete document.documentElement.dataset.theme
  }, [choice])

  // The tokens answer a system switch on their own through the media query, but
  // the button's own label has to hear about it too.
  useEffect(() => {
    const query = darkQuery()
    const answer = (event: MediaQueryListEvent) => setSystem(event.matches ? 'dark' : 'light')
    query.addEventListener('change', answer)
    return () => query.removeEventListener('change', answer)
  }, [])

  const advance = useCallback(() => {
    setChoice((current) => {
      const next = CYCLE[(CYCLE.indexOf(current) + 1) % CYCLE.length] ?? null
      try {
        if (next) window.localStorage.setItem(STORAGE_KEY, next)
        else window.localStorage.removeItem(STORAGE_KEY)
      } catch {
        // A desk that cannot remember still changes for this session.
      }
      return next
    })
  }, [])

  const showing = choice ?? 'system'
  const lit = choice ?? system
  const next = CYCLE[(CYCLE.indexOf(choice) + 1) % CYCLE.length] ?? null

  return (
    <button
      type="button"
      className="theme-toggle"
      title={`Lit ${choice ? `by ${LABEL[choice].toLowerCase()}` : `by the system, currently ${LABEL[lit].toLowerCase()}`}. Click for ${next ? LABEL[next].toLowerCase() : 'the system'}.`}
      aria-label={`Desk lighting: ${LABEL[showing].toLowerCase()}. Switch to ${next ? LABEL[next].toLowerCase() : 'system'}.`}
      onClick={advance}
    >
      {LABEL[showing]}
    </button>
  )
}
