interface SwitchProps {
    checked: boolean
    onChange: (next: boolean) => void
    /** Bold line next to the switch; also the accessible name. */
    label: string
    /** Muted explanation under the label. */
    hint?: string
    disabled?: boolean
}

/**
 * On/off setting row: track + knob on the left, label and hint on the right.
 * Colours come from tokens (accent track when on, surface-2 when off), never a literal.
 */
export function Switch({checked, onChange, label, hint, disabled}: SwitchProps) {
    return (
        <label className="flex items-center gap-3 cursor-pointer">
            <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled}
                    onClick={() => onChange(!checked)}
                    className={`relative w-11 h-6 rounded-full flex-shrink-0 transition-colors disabled:opacity-50 ${checked ? 'bg-accent' : 'bg-surface-2 border border-line'}`}>
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full transition-transform ${checked ? 'bg-on-accent translate-x-5' : 'bg-muted'}`}/>
            </button>
            <div className="flex-1 min-w-0">
                <div className="text-sm font-bold text-ink">{label}</div>
                {hint && <p className="text-xs text-muted mt-0.5">{hint}</p>}
            </div>
        </label>
    )
}
