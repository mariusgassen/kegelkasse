import type {ReactNode} from 'react'

/**
 * A form control with its label, optional hint and optional error line.
 * Pass `htmlFor` (matching the control's id) so the label is announced and tappable.
 */
export function Field({label, htmlFor, hint, error, children}: {
    label: ReactNode
    htmlFor?: string
    hint?: ReactNode
    error?: ReactNode
    children: ReactNode
}) {
    return (
        <div>
            <label className="field-label" htmlFor={htmlFor}>{label}</label>
            {children}
            {hint && !error && <p className="text-xs text-muted mt-1">{hint}</p>}
            {error && <p className="text-xs text-danger-fg mt-1" role="alert">{error}</p>}
        </div>
    )
}
