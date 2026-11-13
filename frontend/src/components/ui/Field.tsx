import type {ReactNode} from 'react'

/**
 * A form control with its label, optional hint and optional error line.
 * Pass `htmlFor` (matching the control's id) so the label is announced and tappable.
 */
export function Field({label, htmlFor, hint, error, className, children}: {
    label: ReactNode
    htmlFor?: string
    /** Layout classes for the wrapper (e.g. `flex-1`, `mt-3`). */
    className?: string
    hint?: ReactNode
    error?: ReactNode
    children: ReactNode
}) {
    return (
        <div className={className}>
            <label className="field-label" htmlFor={htmlFor}>{label}</label>
            {children}
            {hint && !error && <p className="text-xs text-muted mt-1">{hint}</p>}
            {error && <p className="text-xs text-danger-fg mt-1" role="alert">{error}</p>}
        </div>
    )
}
