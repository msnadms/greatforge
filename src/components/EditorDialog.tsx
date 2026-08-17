import type { FormEvent, ReactNode } from 'react'
import { createPortal } from 'react-dom'

interface EditorDialogProps {
  /** Heading, and the dialog's accessible name unless `ariaLabel` says otherwise. */
  title: string
  ariaLabel?: string
  /** Extra class on the dialog box, for a shell that needs a different width. */
  className?: string
  /** Shown above the actions. Null draws nothing. */
  error: string | null
  onClose: () => void
  /**
   * Omitted for a dialog whose body is not one form. The box is then a `div`
   * rather than a `form`, which is the only structural difference between the
   * two editors and the groups dialog — that one holds several forms answering
   * separately, so it can have no single submit of its own.
   */
  onSubmit?: (event: FormEvent) => void
  /**
   * The footer's buttons, in the order they should read. Supplied whole rather
   * than assembled here: the two editors differ in what stands beside Cancel
   * and on which side of it.
   */
  actions: ReactNode
  children: ReactNode
}

/**
 * The shell every dialog in the app is written into: the scrim, the box, the
 * heading, the error line and the footer row.
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
  className,
  error,
  onClose,
  onSubmit,
  actions,
  children,
}: EditorDialogProps) {
  const Box = onSubmit ? 'form' : 'div'

  return createPortal(
    <div className="overlay" onClick={onClose} role="presentation">
      <Box
        className={className ? `editor ${className}` : 'editor'}
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
      </Box>
    </div>,
    document.body,
  )
}
