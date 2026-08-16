import type { FormEvent, ReactNode } from 'react'
import { createPortal } from 'react-dom'

interface EditorDialogProps {
  /** Heading, and the dialog's accessible name unless `ariaLabel` says otherwise. */
  title: string
  ariaLabel?: string
  /** Shown above the actions. Null draws nothing. */
  error: string | null
  onClose: () => void
  onSubmit: (event: FormEvent) => void
  /**
   * The footer's buttons, in the order they should read. Supplied whole rather
   * than assembled here: the two editors differ in what stands beside Cancel
   * and on which side of it.
   */
  actions: ReactNode
  children: ReactNode
}

/**
 * The shell both editors are written into: the scrim, the form, the heading,
 * the error line and the footer row.
 *
 * **Portalled to the document, whatever opens it.** A transformed ancestor
 * becomes the containing block for `position: fixed`, so an overlay rendered
 * inside one resolves its `inset: 0` to that box instead of the viewport — the
 * dialog comes up small and behind the page. `.caster` centres itself with a
 * `transform` and hit exactly that. Portalling from here means the next dialog
 * opened from a transformed corner of the app cannot rediscover it.
 */
export function EditorDialog({
  title,
  ariaLabel,
  error,
  onClose,
  onSubmit,
  actions,
  children,
}: EditorDialogProps) {
  return createPortal(
    <div className="overlay" onClick={onClose} role="presentation">
      <form
        className="editor"
        onSubmit={onSubmit}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === 'Escape') onClose()
        }}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel ?? title}
      >
        <h2 className="panel__title">{title}</h2>

        {children}

        {error && <p className="editor__error">{error}</p>}

        <div className="editor__actions">{actions}</div>
      </form>
    </div>,
    document.body,
  )
}
