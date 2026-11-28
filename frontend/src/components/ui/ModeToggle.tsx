interface ModeToggleProps {
    options: { value: string; label: string }[]
    value: string
    onChange: (v: string) => void
}

export function ModeToggle({options, value, onChange}: ModeToggleProps) {
    return (
        <div className="kce-segment flex bg-canvas rounded-lg p-0.5 gap-0.5 mb-2">
            {options.map(o => (
                <button key={o.value} type="button" aria-pressed={value === o.value} onClick={() => onChange(o.value)}
                        className={`flex-1 text-center py-1.5 rounded-md text-xs font-bold transition-all
            ${value === o.value ? 'bg-accent text-on-accent' : 'text-muted'}`}>
                    {o.label}
                </button>
            ))}
        </div>
    )
}
